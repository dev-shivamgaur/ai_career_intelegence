import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { MarketDemandBasis, MarketPeriodType, Prisma, SkillTrendLabel } from '../../prisma/client';
import { IntelConfigService } from '../../intel-config/intel-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DEMAND_METHODOLOGY_VERSION } from '../demand/demand-math';
import { MarketDemandService } from '../demand/market-demand.service';
import {
  TREND_METHODOLOGY_VERSION,
  compareStep,
  correctStep,
  decideLabels,
  round6,
  type PeriodSkillSample,
  type StepResult,
  type TrendConfig,
} from './trend-math';

type Snap = { periodStart: Date; periodEnd: Date; laneKey: string; periodType: MarketPeriodType };
type DemandParams = { minClassificationConfidence: number; minSkillConfidence: number; companyCapShare: number };
type Panel = { companies: string[]; sources: number };

/**
 * Trend engine. Runs after demand aggregation for a career. Compares consecutive complete NEW_POSTINGS
 * periods on the intersection (stable) panel, with company cap, BH correction and confirmation.
 */
@Injectable()
export class MarketTrendService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: IntelConfigService,
    private readonly demand: MarketDemandService,
  ) {}

  onModuleInit() {
    this.demand.registerAfterCareer((careerId, now) => this.computeCareer(careerId, now));
  }

  async computeCareer(careerId: string, now = new Date()) {
    const cfg = (await this.config.get('trend')) as TrendConfig;
    const demandParams = await this.config.get('demand');
    const params: DemandParams = {
      minClassificationConfidence: demandParams.minClassificationConfidence,
      minSkillConfidence: demandParams.minSkillConfidence,
      companyCapShare: demandParams.companyCapShare,
    };
    let trendsWritten = 0;
    for (const periodType of [MarketPeriodType.WEEK, MarketPeriodType.MONTH]) {
      const snaps = await this.prisma.marketCareerSnapshot.findMany({
        where: {
          careerId,
          periodType,
          basis: MarketDemandBasis.NEW_POSTINGS,
          methodologyVersion: DEMAND_METHODOLOGY_VERSION,
          isComplete: true,
        },
        orderBy: { periodStart: 'asc' },
        select: { periodStart: true, periodEnd: true, laneKey: true, periodType: true },
      });
      const byLane = new Map<string, Snap[]>();
      for (const s of snaps) {
        const list = byLane.get(s.laneKey) ?? [];
        list.push(s);
        byLane.set(s.laneKey, list);
      }
      for (const [laneKey, periods] of byLane) {
        trendsWritten += await this.computeLane(careerId, laneKey, periodType, periods, cfg, params, now);
      }
    }
    return { trendsWritten };
  }

  private async computeLane(
    careerId: string,
    laneKey: string,
    periodType: MarketPeriodType,
    periods: Snap[],
    cfg: TrendConfig,
    params: DemandParams,
    now: Date,
  ) {
    const need = cfg.confirmSteps + 1;
    if (periods.length < need) return this.writeColdStart(careerId, laneKey, periodType, periods, cfg, now);

    const window = periods.slice(-need);
    const latest = window[window.length - 1];
    const prior = window[window.length - 2];
    const { corrected, panels } = await this.buildSteps(careerId, laneKey, window, cfg, params);
    const lastPanel = panels[panels.length - 1] ?? { companies: [], sources: 0 };
    const firstPanel = panels[0] ?? lastPanel;
    const baseDemand = await this.demand.compute(careerId, laneKey, MarketDemandBasis.NEW_POSTINGS, asWindow(window[0]), firstPanel.companies, params);
    const baseBySkill = new Map<string, PeriodSkillSample>(
      baseDemand.skills.map((s) => [
        s.skillId,
        { skillId: s.skillId, cappedJobCount: s.cappedJobCount, cappedTotal: baseDemand.cappedTotal, companyCount: s.companyCount },
      ]),
    );
    for (const step of corrected) {
      for (const s of step) {
        if (!baseBySkill.has(s.skillId)) {
          baseBySkill.set(s.skillId, { skillId: s.skillId, cappedJobCount: 0, cappedTotal: baseDemand.cappedTotal, companyCount: 0 });
        }
      }
    }

    const decisions = decideLabels(corrected, baseBySkill, lastPanel.companies.length, cfg);
    const names = await this.skillNames(
      careerId,
      laneKey,
      periodType,
      latest.periodStart,
      decisions.map((d) => d.skillId),
    );
    await this.replaceTrends(
      careerId,
      laneKey,
      periodType,
      latest,
      prior,
      decisions.map((d) => ({
        skillId: d.skillId,
        skillName: names.get(d.skillId) ?? d.skillId,
        label: d.label as SkillTrendLabel,
        panelCompanies: lastPanel.companies.length,
        panelSources: lastPanel.sources,
        jobCount: round6(d.last.jobCount),
        priorJobCount: round6(d.last.priorJobCount),
        totalJobs: round6(d.last.totalJobs),
        priorTotalJobs: round6(d.last.priorTotalJobs),
        share: round6(d.last.share),
        priorShare: round6(d.last.priorShare),
        effectPp: round6(d.last.effectPp),
        relativeGrowth: d.last.relativeGrowth === null ? null : round6(d.last.relativeGrowth),
        pValue: d.last.pValue === null ? null : round6(d.last.pValue),
        adjustedPValue: d.last.adjustedPValue === null ? null : round6(d.last.adjustedPValue),
        confirmedSteps: d.confirmedSteps,
        companies: d.last.companies,
        priorCompanies: d.last.priorCompanies,
      })),
      cfg,
      now,
    );
    return decisions.length;
  }

  private async writeColdStart(
    careerId: string,
    laneKey: string,
    periodType: MarketPeriodType,
    periods: Snap[],
    cfg: TrendConfig,
    now: Date,
  ) {
    if (!periods.length) return 0;
    const latest = periods[periods.length - 1];
    const prior = periods.length >= 2 ? periods[periods.length - 2] : latest;
    const skills = await this.prisma.marketSkillSnapshot.findMany({
      where: {
        careerId,
        laneKey,
        periodType,
        basis: MarketDemandBasis.NEW_POSTINGS,
        periodStart: latest.periodStart,
        methodologyVersion: DEMAND_METHODOLOGY_VERSION,
      },
    });
    await this.replaceTrends(
      careerId,
      laneKey,
      periodType,
      latest,
      prior,
      skills.map((s) => ({
        skillId: s.skillId,
        skillName: s.skillName,
        label: SkillTrendLabel.INSUFFICIENT_DATA,
        panelCompanies: 0,
        panelSources: 0,
        jobCount: s.cappedJobCount,
        priorJobCount: 0,
        totalJobs: s.cappedTotal,
        priorTotalJobs: 0,
        share: s.demandPct,
        priorShare: 0,
        effectPp: 0,
        relativeGrowth: null as number | null,
        pValue: null as number | null,
        adjustedPValue: null as number | null,
        confirmedSteps: 0,
        companies: s.companyCount,
        priorCompanies: 0,
      })),
      cfg,
      now,
    );
    return skills.length;
  }

  private async buildSteps(careerId: string, laneKey: string, window: Snap[], cfg: TrendConfig, params: DemandParams) {
    const corrected: StepResult[][] = [];
    const panels: Panel[] = [];
    for (let i = 1; i < window.length; i += 1) {
      const a = window[i - 1];
      const b = window[i];
      const panel = await this.intersectionPanel(a.periodType, a.periodStart, b.periodStart);
      panels.push(panel);
      const [priorDemand, currentDemand] = await Promise.all([
        this.demand.compute(careerId, laneKey, MarketDemandBasis.NEW_POSTINGS, asWindow(a), panel.companies, params),
        this.demand.compute(careerId, laneKey, MarketDemandBasis.NEW_POSTINGS, asWindow(b), panel.companies, params),
      ]);
      const skillIds = new Set([...priorDemand.skills.map((s) => s.skillId), ...currentDemand.skills.map((s) => s.skillId)]);
      const priorBy = new Map(priorDemand.skills.map((s) => [s.skillId, s]));
      const currBy = new Map(currentDemand.skills.map((s) => [s.skillId, s]));
      const raw = [...skillIds].map((id) =>
        compareStep(
          {
            skillId: id,
            cappedJobCount: currBy.get(id)?.cappedJobCount ?? 0,
            cappedTotal: currentDemand.cappedTotal,
            companyCount: currBy.get(id)?.companyCount ?? 0,
          },
          {
            skillId: id,
            cappedJobCount: priorBy.get(id)?.cappedJobCount ?? 0,
            cappedTotal: priorDemand.cappedTotal,
            companyCount: priorBy.get(id)?.companyCount ?? 0,
          },
        ),
      );
      corrected.push(correctStep(raw, cfg.alpha));
    }
    return { corrected, panels };
  }

  private async intersectionPanel(periodType: MarketPeriodType, aStart: Date, bStart: Date): Promise<Panel> {
    const [a, b] = await Promise.all([
      this.prisma.marketPanelMembership.findMany({ where: { periodType, periodStart: aStart } }),
      this.prisma.marketPanelMembership.findMany({ where: { periodType, periodStart: bStart } }),
    ]);
    const bCompanies = new Set(b.map((r) => r.companyId));
    const bSources = new Set(b.map((r) => r.sourceId));
    return {
      companies: [...new Set(a.filter((r) => bCompanies.has(r.companyId)).map((r) => r.companyId))],
      sources: a.filter((r) => bSources.has(r.sourceId)).length,
    };
  }

  private async skillNames(careerId: string, laneKey: string, periodType: MarketPeriodType, periodStart: Date, ids: string[]) {
    const names = new Map(
      (await this.prisma.skill.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]),
    );
    const missing = ids.filter((id) => !names.has(id));
    if (missing.length) {
      const snaps = await this.prisma.marketSkillSnapshot.findMany({
        where: { careerId, laneKey, periodType, periodStart, skillId: { in: missing } },
        select: { skillId: true, skillName: true },
      });
      for (const s of snaps) names.set(s.skillId, s.skillName);
    }
    return names;
  }

  private async replaceTrends(
    careerId: string,
    laneKey: string,
    periodType: MarketPeriodType,
    latest: Snap,
    prior: Snap,
    rows: Array<{
      skillId: string;
      skillName: string;
      label: SkillTrendLabel;
      panelCompanies: number;
      panelSources: number;
      jobCount: number;
      priorJobCount: number;
      totalJobs: number;
      priorTotalJobs: number;
      share: number;
      priorShare: number;
      effectPp: number;
      relativeGrowth: number | null;
      pValue: number | null;
      adjustedPValue: number | null;
      confirmedSteps: number;
      companies: number;
      priorCompanies: number;
    }>,
    cfg: TrendConfig,
    now: Date,
  ) {
    const key = { periodType, periodStart: latest.periodStart, careerId, laneKey, methodologyVersion: TREND_METHODOLOGY_VERSION };
    await this.prisma.$transaction([
      this.prisma.skillTrend.deleteMany({ where: key }),
      this.prisma.skillTrend.createMany({
        data: rows.map((r) => ({
          ...key,
          periodEnd: latest.periodEnd,
          priorPeriodStart: prior.periodStart,
          priorPeriodEnd: prior.periodEnd,
          basis: MarketDemandBasis.NEW_POSTINGS,
          skillId: r.skillId,
          skillName: r.skillName,
          label: r.label,
          panelCompanies: r.panelCompanies,
          panelSources: r.panelSources,
          jobCount: r.jobCount,
          priorJobCount: r.priorJobCount,
          totalJobs: r.totalJobs,
          priorTotalJobs: r.priorTotalJobs,
          share: r.share,
          priorShare: r.priorShare,
          effectPp: r.effectPp,
          relativeGrowth: r.relativeGrowth,
          pValue: r.pValue,
          adjustedPValue: r.adjustedPValue,
          confirmedSteps: r.confirmedSteps,
          companies: r.companies,
          priorCompanies: r.priorCompanies,
          params: cfg as unknown as Prisma.InputJsonValue,
          computedAt: now,
        })),
      }),
    ]);
  }

  async list(careerId: string, q: { periodType?: string; lane?: string; label?: string; take?: number }) {
    const career = await this.prisma.career.findUnique({ where: { id: careerId }, select: { id: true, title: true, slug: true } });
    if (!career) throw new NotFoundException({ error: 'CAREER_NOT_FOUND', message: 'Career not found' });
    const periodType = q.periodType === 'WEEK' || q.periodType === 'MONTH' ? q.periodType : 'MONTH';
    const laneKey = q.lane || 'all';
    const take = Math.min(Math.max(q.take ?? 100, 1), 500);
    const latest = await this.prisma.skillTrend.findFirst({
      where: { careerId, laneKey, periodType, methodologyVersion: TREND_METHODOLOGY_VERSION },
      orderBy: { periodStart: 'desc' },
      select: { periodStart: true, periodEnd: true, priorPeriodStart: true, priorPeriodEnd: true },
    });
    if (!latest) {
      return {
        career,
        lane: laneKey,
        periodType,
        methodologyVersion: TREND_METHODOLOGY_VERSION,
        coldStart: true,
        period: null,
        trends: [],
      };
    }
    const where: Prisma.SkillTrendWhereInput = {
      careerId,
      laneKey,
      periodType,
      periodStart: latest.periodStart,
      methodologyVersion: TREND_METHODOLOGY_VERSION,
      ...(q.label ? { label: parseLabel(q.label) } : {}),
    };
    const trends = await this.prisma.skillTrend.findMany({
      where,
      orderBy: [{ label: 'asc' }, { effectPp: 'desc' }, { skillName: 'asc' }],
      take,
    });
    const coldStart = trends.length > 0 && trends.every((t) => t.label === SkillTrendLabel.INSUFFICIENT_DATA);
    return {
      career,
      lane: laneKey,
      periodType,
      methodologyVersion: TREND_METHODOLOGY_VERSION,
      coldStart,
      period: {
        start: latest.periodStart,
        end: latest.periodEnd,
        priorStart: latest.priorPeriodStart,
        priorEnd: latest.priorPeriodEnd,
        basis: MarketDemandBasis.NEW_POSTINGS,
      },
      trends: trends.map((t) => ({
        skillId: t.skillId,
        name: t.skillName,
        label: t.label,
        share: t.share,
        priorShare: t.priorShare,
        effectPp: t.effectPp,
        relativeGrowth: t.relativeGrowth,
        pValue: t.pValue,
        adjustedPValue: t.adjustedPValue,
        confirmedSteps: t.confirmedSteps,
        jobCount: t.jobCount,
        priorJobCount: t.priorJobCount,
        n: t.totalJobs,
        priorN: t.priorTotalJobs,
        companies: t.companies,
        priorCompanies: t.priorCompanies,
        panel: { companies: t.panelCompanies, sources: t.panelSources },
        period: { start: t.periodStart, end: t.periodEnd, priorStart: t.priorPeriodStart, priorEnd: t.priorPeriodEnd },
        methodologyVersion: t.methodologyVersion,
        computedAt: t.computedAt,
      })),
    };
  }
}

function asWindow(s: Snap) {
  return { start: s.periodStart, end: s.periodEnd };
}

function parseLabel(value: string): SkillTrendLabel {
  if (!Object.values(SkillTrendLabel).includes(value as SkillTrendLabel)) {
    throw new BadRequestException({ error: 'INVALID_PARAM', message: `label must be one of ${Object.values(SkillTrendLabel).join(', ')}` });
  }
  return value as SkillTrendLabel;
}

import { Injectable } from '@nestjs/common';
import { DocumentType, ExperienceType, SkillSource, UserStatus } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeRoleSkillMatch,
  judgePoolFromRequirements,
  resolveLearnerTier,
  type LearnerTier,
} from './learner-tier';
import { isGenericCategorySkill } from './skill-lexicon';
import { emptyFamily, familyFromCareer, scoreLane, type RoleFamily, type StackLane } from './stack-lanes';

export type Seniority = 'none' | 'intern' | 'job';

export type EvidenceSnapshot = {
  family: RoleFamily;
  careerSlug: string | null;
  stack: string | null;
  stackLabel: string | null;
  confidence: number;
  stackOptions: Array<{ id: string; label: string }>;
  seniority: Seniority;
  learnerTier: LearnerTier;
  roleSkillMatched: number;
  roleSkillTotal: number;
  roleSkillMatchPercent: number;
  known: string[];
  userSkillNames: string[];
  suggestedStatus: UserStatus | null;
};

@Injectable()
export class EvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: string): Promise<EvidenceSnapshot> {
    const goal = await this.prisma.careerGoal.findFirst({
      where: { userId, isActive: true },
      include: { career: { include: { requirements: { include: { skill: true } } } } },
    });
    const careerSlug = goal?.career.slug ?? null;
    const family = goal?.career ? familyFromCareer(goal.career) : emptyFamily();

    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      include: {
        userSkills: { include: { skill: true } },
        experience: true,
        education: true,
        projects: true,
      },
    });

    const docs = await this.prisma.document.findMany({
      where: { userId },
      include: { extraction: true },
    });

    const userSkillNames = (profile?.userSkills ?? [])
      .filter((s) => s.source === SkillSource.USER || s.source === SkillSource.AI_DETECTED)
      .map((s) => s.skill.name);

    const allSkillNames = (profile?.userSkills ?? []).map((s) => s.skill.name);

    const resumeDocs = docs.filter((d) => d.type === DocumentType.RESUME);
    const paperDocs = docs.filter(
      (d) => d.type === DocumentType.MARKSHEET || d.type === DocumentType.DEGREE,
    );

    const resumeText = resumeDocs
      .map((d) => `${d.extraction?.summary ?? ''} ${(d.extraction?.skillsDetected ?? []).join(' ')}`)
      .join(' ');
    const paperText = paperDocs
      .map((d) => `${d.extraction?.degree ?? ''} ${JSON.stringify(d.extraction?.subjects ?? [])}`)
      .join(' ');

    const userHay = userSkillNames.join(' ');
    const resumeHay = `${resumeText} ${allSkillNames.filter((n) => !userSkillNames.includes(n)).join(' ')}`;

    let best: StackLane | null = null;
    let bestScore = 0;
    let second = 0;
    for (const lane of family.lanes) {
      const score =
        scoreLane(userHay, lane) * 3 + scoreLane(resumeHay, lane) * 2 + scoreLane(paperText, lane) * 0.3;
      if (score > bestScore) {
        second = bestScore;
        bestScore = score;
        best = lane;
      } else if (score > second) {
        second = score;
      }
    }

    const locked = profile?.primaryStack?.trim() || null;
    const stack = locked || (bestScore >= 1 ? best?.id ?? null : null);
    const chosen = family.lanes.find((l) => l.id === stack) ?? best;
    const confidence = locked ? 1 : bestScore <= 0 ? 0 : Math.min(1, (bestScore - second) / Math.max(bestScore, 1));

    const addKnown = (set: Set<string>, raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed || isGenericCategorySkill(trimmed)) return;
      set.add(trimmed.toLowerCase());
    };
    const known = new Set<string>();
    for (const n of allSkillNames) addKnown(known, n);
    for (const d of docs) {
      for (const s of d.extraction?.skillsDetected ?? []) addKnown(known, s);
    }
    for (const p of profile?.projects ?? []) {
      known.add(p.name.toLowerCase());
      for (const s of p.skills) known.add(s.toLowerCase());
    }

    const seniority = this.seniority(profile?.experience ?? []);
    const stackForMatch = chosen?.id ?? null;
    const requirements = goal?.career?.requirements ?? [];
    const pool = judgePoolFromRequirements(requirements, family, stackForMatch);
    const roleMatch = computeRoleSkillMatch(pool, known);
    const learnerTier = resolveLearnerTier(seniority, profile?.status, roleMatch.percent);

    let suggestedStatus: UserStatus | null = null;
    if (seniority === 'job') suggestedStatus = UserStatus.WORKING_PROFESSIONAL;
    else if (seniority === 'intern') suggestedStatus = UserStatus.FRESHER;

    return {
      family,
      careerSlug,
      stack: stackForMatch,
      stackLabel: chosen?.label ?? null,
      confidence,
      stackOptions: family.lanes.map((l) => ({ id: l.id, label: l.label })),
      seniority,
      learnerTier,
      roleSkillMatched: roleMatch.matched,
      roleSkillTotal: roleMatch.total,
      roleSkillMatchPercent: roleMatch.percent,
      known: [...known],
      userSkillNames,
      suggestedStatus,
    };
  }

  async persistDetectedStack(userId: string, snapshot?: EvidenceSnapshot) {
    const ev = snapshot ?? (await this.forUser(userId));
    if (!ev.stack || ev.confidence < 0.45) return ev;
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile || profile.primaryStack) return ev;
    await this.prisma.profile.update({
      where: { userId },
      data: { primaryStack: ev.stack },
    });
    return this.forUser(userId);
  }

  private seniority(
    rows: Array<{ type: ExperienceType; title: string; summary: string; organization?: string | null; startYear?: number | null }>,
  ): Seniority {
    const real = rows.filter((r) => EvidenceService.isRealWorkRow(r));
    if (real.some((r) => r.type === ExperienceType.JOB || r.type === ExperienceType.FREELANCE)) return 'job';
    if (real.some((r) => r.type === ExperienceType.INTERNSHIP)) return 'intern';
    return 'none';
  }

  static isRealWorkRow(row: {
    title?: string | null;
    organization?: string | null;
    summary?: string | null;
    startYear?: number | null;
  }): boolean {
    const title = row.title?.trim() ?? '';
    if (!title) return false;
    const org = row.organization?.trim() ?? '';
    const invented = /detected from resume|from resume$/i.test(row.summary ?? '');
    if (invented && !org) return false;
    if (!org && row.startYear == null) return false;
    return true;
  }
}

import { Injectable } from '@nestjs/common';
import { DocumentType } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RoadmapCorpusService } from '../web/roadmap-corpus.service';
import { RecommendationService } from './recommendation.service';
import { EvidenceService } from './evidence.service';
import { belongsToOtherLane } from './stack-lanes';
import { SkillLexiconService } from './skill-lexicon.service';
import { experienceScoreFromTier, tierPathCopy } from './learner-tier';
import { filterMissing, skillMatches } from './skill-match';

@Injectable()
export class FitScoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly corpus: RoadmapCorpusService,
    private readonly recommendations: RecommendationService,
    private readonly evidence: EvidenceService,
    private readonly lexicon: SkillLexiconService,
  ) {}

  async scoreUser(userId: string) {
    const goal = await this.prisma.careerGoal.findFirst({
      where: { userId, isActive: true },
      include: { career: { include: { requirements: { include: { skill: true } } } } },
    });
    if (!goal) return null;

    await this.prisma.experience.deleteMany({
      where: {
        profile: { userId },
        organization: '',
        OR: [{ summary: { contains: 'Detected from resume' } }, { summary: { equals: 'From resume' } }],
      },
    });

    const ev = await this.evidence.forUser(userId);
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      include: {
        education: true,
        projects: true,
        experience: true,
        certifications: true,
      },
    });
    const docs = await this.prisma.document.findMany({
      where: { userId },
      include: { extraction: true },
    });

    const known = new Set(ev.known);
    for (const c of profile?.certifications ?? []) known.add(c.name.toLowerCase());
    for (const p of profile?.projects ?? []) {
      known.add(p.name.toLowerCase());
      for (const s of p.skills) known.add(s.toLowerCase());
      known.add(p.description.toLowerCase());
    }
    for (const d of docs) {
      for (const skill of await this.lexicon.match(`${d.filename} ${d.extraction?.summary ?? ''}`)) {
        known.add(skill.toLowerCase());
      }
    }

    const judge = goal.career.requirements.filter((r) => {
      if (r.layer === 'ALTERNATIVE' || r.layer === 'OPTIONAL') return false;
      if (belongsToOtherLane(r.skill.name, ev.family, ev.stack)) return false;
      if (r.stackLane && ev.stack && r.stackLane !== ev.stack) return false;
      return true;
    });
    const pool = judge.filter((r) => r.type === 'REQUIRED' || r.layer === 'CORE' || r.layer === 'STACK_REQUIRED' || !r.stackLane).map((r) => r.skill.name);
    let matched = 0;
    for (const name of pool) {
      if (skillMatches(name, known)) matched += 1;
    }
    const skillScore = pool.length ? Math.round((matched / pool.length) * 100) : known.size ? 40 : 10;

    const hasResume = docs.some((d) => d.type === DocumentType.RESUME);
    const hasDegree = docs.some((d) => d.type === DocumentType.DEGREE) || (profile?.education.length ?? 0) > 0;
    const marksheets = docs.filter((d) => d.type === DocumentType.MARKSHEET).length;
    let educationScore = 0;
    if (hasDegree) educationScore = 78;
    else if (marksheets >= 3) educationScore = 55;
    else if (marksheets >= 1) educationScore = 40;
    else if ((profile?.education.length ?? 0) > 0) educationScore = 70;
    if (profile?.status === 'STUDENT' && !hasDegree && educationScore === 0) educationScore = 20;

    const projectCount = profile?.projects.length ?? 0;
    const resumeMentionsProject = docs.some(
      (d) =>
        d.type === DocumentType.RESUME &&
        /project|github|gitlab|behance|portfolio/i.test(`${d.extraction?.summary ?? ''} ${JSON.stringify(d.extraction?.rawPayload ?? '')}`),
    );
    const linkedProjects = (profile?.projects ?? []).filter((p) => p.link).length;
    const projectScore = Math.min(
      100,
      projectCount * 22 + linkedProjects * 10 + (resumeMentionsProject && projectCount ? 18 : 0) + (projectCount && hasResume ? 8 : 0),
    );

    const realWork = (profile?.experience ?? []).filter((row) => EvidenceService.isRealWorkRow(row));
    const experienceScore = experienceScoreFromTier(
      ev.learnerTier,
      ev.seniority,
      realWork.length,
      ev.roleSkillMatchPercent,
    );
    const pathCopy = tierPathCopy(ev.learnerTier);

    const progress = await this.corpus.learningProgress(userId);
    const marketScore = progress.total ? progress.percent : Math.min(50, skillScore);
    const { estimatedMatch, breakdown } = this.recommendations.estimateCareerMatch({
      skillScore,
      projectScore,
      educationScore,
      experienceScore,
      marketScore,
    });

    const missing = filterMissing(progress.missing, known).slice(0, 8);
    const reqMissing = filterMissing(pool, known).slice(0, 8);
    const alternatives = ev.family.lanes.filter((l) => l.id !== ev.stack).map((l) => l.label);

    return {
      careerTitle: goal.customTitle ?? goal.career.title,
      goalId: goal.id,
      estimatedMatch,
      breakdown: {
        skills: breakdown.skillScore,
        projects: breakdown.projectScore,
        education: breakdown.educationScore,
        experience: breakdown.experienceScore,
        marketAlignment: breakdown.marketScore,
      },
      whyItMayFit: [
        ev.stackLabel
          ? `Judged on the ${ev.stackLabel} lane, not every language on the role map.`
          : 'Pick a main stack so we stop mixing alternative languages into gaps.',
        hasResume
          ? realWork.length
            ? `Work history: ${realWork.length} intern/job row(s) from the resume.`
            : 'Resume is on file. No internship or job was found — experience score stays 0 until you add one.'
          : 'Add a resume so intern/job history is clearer.',
        projectCount
          ? `${projectCount} project(s) on your profile${linkedProjects ? `, ${linkedProjects} with a public link` : ''}.`
          : 'Add projects (with GitHub or portfolio links) so this score is not only skills.',
        `Syllabus coverage on your lane is ${progress.percent}%. Completing roadmap tasks raises this.`,
        `Role skill match: ${ev.roleSkillMatchPercent}% (${ev.roleSkillMatched}/${ev.roleSkillTotal || 0} required topics evidenced). ${pathCopy.pathDetail}`,
      ],
      strongAreas: [...new Set([...known].filter((k) => k.length > 1 && k.length < 40))].slice(0, 8).length
        ? [...new Set([...known].filter((k) => k.length > 1 && k.length < 40))].slice(0, 8)
        : ['Profile started'],
      missingAreas: missing.length ? missing : reqMissing,
      potentialChallenges: [
        alternatives.length
          ? `Other stacks (${alternatives.slice(0, 3).join(', ')}) are alternatives, not required gaps.`
          : 'Stay on one stack until the core is solid.',
        ev.learnerTier === 'early'
          ? 'No intern/job evidence yet — foundation and stack core first; advanced topics are optional stretch.'
          : ev.learnerTier === 'aspiring'
            ? 'Early career path — build stack core; stretch topics are optional if you want to go further.'
            : ev.learnerTier === 'unverified_professional'
              ? 'Jobs are on your resume but few concrete role skills matched yet — prove core stack skills before we skip fundamentals.'
              : 'Verified working path — install tours hidden; close remaining stack and production gaps. Advanced stays optional.',
      ],
      evidence: [
        {
          kind: 'profile',
          title: 'You are here',
          detail: `${ev.stackLabel ?? 'stack unset'} · ${ev.learnerTier.replace(/_/g, ' ')} · ${ev.roleSkillMatchPercent}% role skills`,
        },
        { kind: 'document', title: 'Documents', detail: `${docs.length} file(s), resume ${hasResume ? 'yes' : 'no'}` },
        { kind: 'research', title: 'Lane syllabus', detail: `${progress.known}/${progress.total || 0} topics evidenced` },
      ],
    };
  }

  async persist(userId: string) {
    const scored = await this.scoreUser(userId);
    if (!scored) return null;
    await this.prisma.careerGoal.update({
      where: { id: scored.goalId },
      data: {
        estimatedMatch: scored.estimatedMatch,
        breakdown: scored.breakdown,
        whyItMayFit: scored.whyItMayFit,
        strongAreas: scored.strongAreas,
        missingAreas: scored.missingAreas,
        potentialChallenges: scored.potentialChallenges,
        evidence: scored.evidence,
        lastAnalyzedAt: new Date(),
      },
    });
    return scored;
  }
}

import type { UserStatus } from '../prisma/client';
import type { Seniority } from './evidence.service';
import { skillMatches } from './skill-match';
import {
  belongsToOtherLane,
  isAdvancedTopic,
  isCatalogCoreTopic,
  isFundamentalTopic,
  isLanguagePrimer,
  practiceForLane,
  type RoleFamily,
} from './stack-lanes';

export type LearnerTier = 'early' | 'aspiring' | 'unverified_professional' | 'verified_working';

export type TopicClassification = 'primer' | 'foundation' | 'stack_core' | 'advanced';

export type RoleSkillMatch = {
  matched: number;
  total: number;
  percent: number;
  pool: string[];
};

export type TopicPlan = {
  includeInRequired: boolean;
  includeInStretch: boolean;
  phaseBias: 'd7' | 'd30' | 'later';
  stretchOnly: boolean;
};

export const VERIFIED_SKILL_MATCH_PERCENT = 35;
export const PROMOTE_WORKING_MIN_MATCH_PERCENT = 20;

export function shouldPromoteToWorkingProfessional(
  seniority: Seniority,
  roleSkillMatchPercent: number,
  hasConcreteSkillEvidence: boolean,
): boolean {
  if (seniority !== 'job') return false;
  return roleSkillMatchPercent >= PROMOTE_WORKING_MIN_MATCH_PERCENT || hasConcreteSkillEvidence;
}

type RequirementRow = {
  type: string;
  layer: string;
  stackLane: string | null;
  skill: { name: string };
};

export function judgePoolFromRequirements(
  requirements: RequirementRow[],
  family: RoleFamily,
  stack: string | null,
): string[] {
  const judge = requirements.filter((r) => {
    if (r.layer === 'ALTERNATIVE' || r.layer === 'OPTIONAL') return false;
    if (belongsToOtherLane(r.skill.name, family, stack)) return false;
    if (r.stackLane && stack && r.stackLane !== stack) return false;
    return true;
  });
  return judge
    .filter((r) => r.type === 'REQUIRED' || r.layer === 'CORE' || r.layer === 'STACK_REQUIRED' || !r.stackLane)
    .map((r) => r.skill.name);
}

export function computeRoleSkillMatch(pool: string[], known: Iterable<string>): RoleSkillMatch {
  let matched = 0;
  for (const name of pool) {
    if (skillMatches(name, known)) matched += 1;
  }
  const total = pool.length;
  const percent = total ? Math.round((matched / total) * 100) : 0;
  return { matched, total, percent, pool };
}

export function resolveLearnerTier(
  seniority: Seniority,
  status: UserStatus | null | undefined,
  skillMatchPercent: number,
): LearnerTier {
  if (seniority === 'job') {
    return skillMatchPercent >= VERIFIED_SKILL_MATCH_PERCENT ? 'verified_working' : 'unverified_professional';
  }
  if (seniority === 'intern') return 'aspiring';
  if (status === 'STUDENT') return 'aspiring';
  return 'early';
}

export function classifyTopic(name: string, coreTitles: string[]): TopicClassification {
  const trimmed = name.trim();
  if (!trimmed) return 'foundation';
  if (isLanguagePrimer(trimmed)) return 'primer';
  if (isAdvancedTopic(trimmed)) return 'advanced';
  if (isCatalogCoreTopic(trimmed, coreTitles)) return 'stack_core';
  if (isFundamentalTopic(trimmed)) return 'foundation';
  return 'stack_core';
}

export function topicPlanForTier(
  tier: LearnerTier,
  classification: TopicClassification,
  alreadyKnown: boolean,
): TopicPlan {
  if (alreadyKnown) {
    return { includeInRequired: false, includeInStretch: false, phaseBias: 'later', stretchOnly: false };
  }

  switch (tier) {
    case 'early':
    case 'aspiring':
      if (classification === 'advanced') {
        return { includeInRequired: false, includeInStretch: true, phaseBias: 'later', stretchOnly: true };
      }
      return {
        includeInRequired: true,
        includeInStretch: false,
        phaseBias: classification === 'primer' || classification === 'foundation' ? 'd7' : 'd30',
        stretchOnly: false,
      };

    case 'verified_working':
      if (classification === 'primer' || classification === 'foundation') {
        return { includeInRequired: false, includeInStretch: false, phaseBias: 'later', stretchOnly: false };
      }
      if (classification === 'advanced') {
        return { includeInRequired: false, includeInStretch: true, phaseBias: 'later', stretchOnly: true };
      }
      return { includeInRequired: true, includeInStretch: false, phaseBias: 'd30', stretchOnly: false };

    case 'unverified_professional':
      if (classification === 'primer' || classification === 'foundation') {
        return { includeInRequired: false, includeInStretch: false, phaseBias: 'later', stretchOnly: false };
      }
      if (classification === 'advanced') {
        return { includeInRequired: false, includeInStretch: true, phaseBias: 'later', stretchOnly: true };
      }
      return { includeInRequired: true, includeInStretch: false, phaseBias: 'd30', stretchOnly: false };

    default:
      return { includeInRequired: true, includeInStretch: false, phaseBias: 'd7', stretchOnly: false };
  }
}

export function baselineProofTopics(
  careerSlug: string,
  stackId: string | null,
  coreTopics: string[],
  max = 5,
): string[] {
  const lane = stackId ?? '';
  const lanePractice = practiceForLane(careerSlug, lane);
  if (lanePractice?.required.length) {
    return lanePractice.required.slice(0, max);
  }
  return (coreTopics ?? []).map((t) => t.trim()).filter(Boolean).slice(0, max);
}

export function tierPathCopy(tier: LearnerTier): { pathLabel: string; pathDetail: string } {
  switch (tier) {
    case 'verified_working':
      return {
        pathLabel: 'Working — verified stack match',
        pathDetail:
          'Install tours and language primers are hidden. We focus on stack and production gaps that your resume has not evidenced yet. Advanced topics stay optional.',
      };
    case 'unverified_professional':
      return {
        pathLabel: 'Working — prove core skills first',
        pathDetail:
          'Your resume shows jobs but few concrete role skills yet. Start with short proof tasks, then close stack gaps. Advanced topics are optional.',
      };
    case 'aspiring':
      return {
        pathLabel: 'Early career path',
        pathDetail:
          'Foundation and stack core come first. Stretch topics (advanced) are visible and optional if you want to go further.',
      };
    default:
      return {
        pathLabel: 'Getting started',
        pathDetail:
          'Full foundation and stack path. Advanced topics appear as optional stretch — you can skip them until core is solid.',
      };
  }
}

export function tierWhyReason(tier: LearnerTier): string {
  switch (tier) {
    case 'verified_working':
      return 'Included because you have work evidence and enough role skills to skip beginner primers.';
    case 'unverified_professional':
      return 'Included to prove core stack skills before we treat the profile as fully verified.';
    case 'aspiring':
      return 'Included for early-career learners building foundation and stack core.';
    default:
      return 'Included on the standard learning path for this role and stack.';
  }
}

export function isExperiencedForSyllabus(tier: LearnerTier): boolean {
  return tier === 'verified_working' || tier === 'unverified_professional';
}

export function experienceScoreFromTier(
  tier: LearnerTier,
  seniority: Seniority,
  realWorkCount: number,
  roleSkillMatchPercent: number,
): number {
  let base = 0;
  if (seniority === 'job') base = 40 + realWorkCount * 8;
  else if (seniority === 'intern') base = 22 + realWorkCount * 6;
  const matchBonus = Math.round(roleSkillMatchPercent * 0.35);
  let score = base + matchBonus;
  if (tier === 'unverified_professional') score = Math.min(score, 55 + matchBonus);
  if (tier === 'verified_working') score = Math.min(100, score + 10);
  return Math.min(100, Math.max(0, score));
}

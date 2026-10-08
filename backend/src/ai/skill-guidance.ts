export type SkillGuidance = {
  learn: string;
  practice: string;
  example: string;
  solution: string;
};

export type GuidanceLevel = 'missing' | 'needs_improvement' | 'good';

export function guidanceLevelFrom(status: string, proficiency: number): GuidanceLevel {
  if (proficiency >= 55 || status === 'GOOD' || status === 'STRONG') return 'good';
  if (proficiency >= 40 || status === 'NEEDS_IMPROVEMENT') return 'needs_improvement';
  return 'missing';
}

/** Role-agnostic close-the-gap plan (engineering, marketing, HR, ops, etc.). */
export function guidanceFor(skill: string, role: string, level: GuidanceLevel = 'missing'): SkillGuidance {
  const s = skill.trim() || 'this topic';
  const r = role.trim() || 'your target role';
  if (level === 'good') {
    return {
      learn: `You already use ${s} in ${r} work. Spend this session on the next layer: trade-offs, failure modes, and how seniors review it — not definitions or setup.`,
      practice: `Improve one existing artefact that uses ${s} (indexes, tests, error paths, or a short write-up of a real decision) and attach the proof.`,
      example: `A strong ${r} profile shows ${s} with a real outcome: query/plan, PR, metric, or 5-line case — not a hello-world sample.`,
      solution: `Deepen ${s}: (1) one production-style topic, (2) one artefact that proves depth this week, (3) add the proof on your profile.`,
    };
  }
  if (level === 'needs_improvement') {
    return {
      learn: `You have ${s} on your profile. Skip install, GUI tours, and beginner CREATE/hello-world. Cover the next practical layer used in ${r} work.`,
      practice: `Take one real ${s} task from your work or a small repo and raise it one level (performance, correctness, or ops), then attach proof.`,
      example: `Proof looks like a before/after (query, test, or config) — not a tutorial screenshot of installing ${s}.`,
      solution: `Level up ${s}: (1) one next-layer concept, (2) one improved artefact this week, (3) add the proof so the match score can move.`,
    };
  }
  return {
    learn: `Spend one focused session on what ${s} is in ${r} work: when people use it, and the few ideas you need before you practice — skip long install/GUI walkthroughs.`,
    practice: `Produce one small artefact that uses ${s} (a mini project, campaign brief, SOP, dashboard, or case write-up) and attach it to your profile.`,
    example: `A strong ${r} profile shows ${s} with proof: GitHub/repo, live link, campaign metric, or a 5-line case study — not just the skill name.`,
    solution: `Close ${s}: (1) 60–90 min fundamentals, (2) one practice artefact this week, (3) add the proof (link or notes) on your profile so the match score can move.`,
  };
}

export function fallbackOutline(skill: string, role: string, level: GuidanceLevel): string[] {
  const s = skill.trim() || 'this topic';
  const r = role.trim() || 'your target role';
  if (level === 'missing') {
    return [
      `What ${s} is used for in ${r} work (one sentence, no encyclopedia dump).`,
      `The 4–5 terms you need before you practice.`,
      `How it connects to the rest of a typical ${r} workflow.`,
      `One small exercise you can finish this week (not a full install marathon).`,
      `What “done” looks like as proof on your profile.`,
    ];
  }
  return [
    `Assume you already have ${s} working — do not cover install, GUI clients, or beginner CREATE/hello-world.`,
    `Next layer for ${r}: correctness (transactions/constraints or equivalent).`,
    `Next layer: performance (indexes, query plans, caching, or equivalent).`,
    `Next layer: how it runs in a real app (pooling, config, failure modes).`,
    `One artefact this week that proves depth, not basics.`,
    `How you would explain a trade-off in an interview or PR review.`,
  ];
}

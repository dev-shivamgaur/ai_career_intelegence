import { belongsToOtherLane, familyFromCareer, isLanguagePrimer, requirementsForStack, scoreLane, type RoleFamily } from './stack-lanes';

// Characterization: locks in current lane filtering, including substring lane matches (issue I-04).
const family: RoleFamily = {
  id: 'backend-developer',
  core: ['HTTP'],
  lanes: [
    { id: 'nodejs', label: 'Node.js', keywords: ['node', 'express'], syllabusSlug: 'nodejs' },
    { id: 'java', label: 'Java', keywords: ['java', 'spring'], syllabusSlug: 'java' },
  ],
};

const row = (skill: string, layer: string, stackLane: string | null = null) => ({ skill: { name: skill }, layer, stackLane });

const rows = [
  row('HTTP', 'CORE'),
  row('Caching', 'OPTIONAL'),
  row('Express.js', 'STACK_REQUIRED', 'nodejs'),
  row('Spring MVC', 'STACK_REQUIRED', 'java'),
  row('JavaScript', 'CORE'),
  row('Installing Node.js', 'CORE'),
  row('Go', 'ALTERNATIVE'),
  row('Docker', 'core'),
];

describe('requirementsForStack (characterization)', () => {
  it('keeps core rows plus the chosen lane, drops other lanes, optional, alternative and primers', () => {
    const names = requirementsForStack(rows, family, 'nodejs').map((r) => r.skill.name);
    expect(names).toEqual(['HTTP', 'Express.js', 'Docker']);
  });

  it('drops "JavaScript" for the nodejs lane because "java" is a substring (I-04)', () => {
    expect(belongsToOtherLane('JavaScript', family, 'nodejs')).toBe(true);
  });

  it('with no stack chosen keeps only lane-less rows', () => {
    const names = requirementsForStack(rows, family, null).map((r) => r.skill.name);
    expect(names).toEqual(['HTTP', 'JavaScript', 'Docker']);
  });

  it('for the java lane drops node rows', () => {
    const names = requirementsForStack(rows, family, 'java').map((r) => r.skill.name);
    expect(names).toEqual(['HTTP', 'Spring MVC', 'JavaScript', 'Docker']);
  });
});

describe('scoreLane (characterization)', () => {
  it('counts substring keyword hits', () => {
    expect(scoreLane('Express.js middleware on Node', family.lanes[0])).toBe(2);
    expect(scoreLane('Django', { id: 'go', label: 'Go', keywords: ['go'], syllabusSlug: 'golang' })).toBe(1);
  });
});

describe('isLanguagePrimer (characterization)', () => {
  it('flags install tours and bare tool names', () => {
    expect(isLanguagePrimer('Installing Node.js')).toBe(true);
    expect(isLanguagePrimer('npm')).toBe(true);
    expect(isLanguagePrimer('')).toBe(true);
    expect(isLanguagePrimer('REST APIs')).toBe(false);
  });
});

describe('familyFromCareer (characterization)', () => {
  it('builds a single implicit lane when no stackLanes exist but a syllabus slug does', () => {
    const fam = familyFromCareer({ slug: 'frontend-developer', title: 'Frontend Developer', syllabusSlug: 'frontend' });
    expect(fam.lanes).toEqual([
      { id: 'frontend-developer', label: 'Frontend Developer', keywords: ['Frontend Developer', 'frontend developer'], syllabusSlug: 'frontend' },
    ]);
  });
});

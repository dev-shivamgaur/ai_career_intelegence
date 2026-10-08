import {
  baselineProofTopics,
  classifyTopic,
  computeRoleSkillMatch,
  resolveLearnerTier,
  topicPlanForTier,
  VERIFIED_SKILL_MATCH_PERCENT,
} from './learner-tier';

describe('resolveLearnerTier', () => {
  it('maps job + high match to verified_working', () => {
    expect(resolveLearnerTier('job', 'WORKING_PROFESSIONAL', VERIFIED_SKILL_MATCH_PERCENT)).toBe('verified_working');
    expect(resolveLearnerTier('job', null, 60)).toBe('verified_working');
  });

  it('maps job + low match to unverified_professional', () => {
    expect(resolveLearnerTier('job', null, 0)).toBe('unverified_professional');
    expect(resolveLearnerTier('job', null, 20)).toBe('unverified_professional');
  });

  it('maps intern and student paths', () => {
    expect(resolveLearnerTier('intern', 'FRESHER', 0)).toBe('aspiring');
    expect(resolveLearnerTier('none', 'STUDENT', 0)).toBe('aspiring');
    expect(resolveLearnerTier('none', 'FRESHER', 0)).toBe('early');
  });
});

describe('topicPlanForTier', () => {
  it('early learner sees advanced as stretch only', () => {
    const plan = topicPlanForTier('early', 'advanced', false);
    expect(plan.includeInRequired).toBe(false);
    expect(plan.includeInStretch).toBe(true);
    expect(plan.stretchOnly).toBe(true);
  });

  it('verified working hides primers', () => {
    const plan = topicPlanForTier('verified_working', 'primer', false);
    expect(plan.includeInRequired).toBe(false);
    expect(plan.includeInStretch).toBe(false);
  });

  it('verified working keeps stack_core required', () => {
    const plan = topicPlanForTier('verified_working', 'stack_core', false);
    expect(plan.includeInRequired).toBe(true);
  });
});

describe('computeRoleSkillMatch', () => {
  it('counts fuzzy matches', () => {
    const pool = ['REST APIs', 'PostgreSQL', 'Express.js'];
    const result = computeRoleSkillMatch(pool, ['rest', 'postgres']);
    expect(result.matched).toBe(2);
    expect(result.percent).toBe(67);
  });
});

describe('classifyTopic', () => {
  it('marks install tours as primer', () => {
    expect(classifyTopic('Installing Node.js', [])).toBe('primer');
  });

  it('marks kafka as advanced', () => {
    expect(classifyTopic('Kafka', [])).toBe('advanced');
  });
});

describe('baselineProofTopics', () => {
  it('returns lane practice for backend nodejs', () => {
    const topics = baselineProofTopics('backend-developer', 'nodejs', []);
    expect(topics.length).toBeGreaterThan(0);
    expect(topics.some((t) => /express|rest/i.test(t))).toBe(true);
  });
});

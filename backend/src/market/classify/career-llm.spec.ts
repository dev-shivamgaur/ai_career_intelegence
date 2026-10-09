import { CareerLlmClassifier, LLM_CONFIDENCE_CAP } from './career-llm.service';

function make(opts: { fallback: boolean; configured?: boolean; budget?: number; answer?: unknown }) {
  const invoke = jest.fn().mockResolvedValue(opts.answer ?? { careers: [], confidence: 0 });
  const llm = { isConfigured: () => opts.configured ?? true, chat: () => ({ withStructuredOutput: () => ({ invoke }) }) };
  let used = 0;
  const redis = { incr: jest.fn(async () => ++used), expire: jest.fn(async () => undefined) };
  const config = {
    get: async (k: string) => (k === 'classification' ? { llmFallback: opts.fallback } : { llmDailyLimit: opts.budget ?? 10 }),
  };
  return { svc: new CareerLlmClassifier(llm as never, redis as never, config as never), invoke };
}

const job = { title: 'Software Engineer', skills: ['PostgreSQL', 'Node.js', 'Docker'] };
const candidates = [
  { slug: 'backend', title: 'Backend Developer' },
  { slug: 'devops', title: 'DevOps Engineer' },
];

describe('CareerLlmClassifier', () => {
  it('does nothing unless classification.llmFallback is on and the LLM is configured', async () => {
    const off = make({ fallback: false });
    expect(await off.svc.choose(job, candidates)).toBeNull();
    expect(off.invoke).not.toHaveBeenCalled();
    expect(await make({ fallback: true, configured: false }).svc.choose(job, candidates)).toBeNull();
  });

  it('keeps only offered slugs and caps confidence', async () => {
    const { svc } = make({ fallback: true, answer: { careers: ['backend', 'data-science', 'backend'], confidence: 0.99 } });
    expect(await svc.choose(job, candidates)).toEqual({ slugs: ['backend'], confidence: LLM_CONFIDENCE_CAP });
  });

  it('stops when the shared daily budget is spent', async () => {
    const { svc, invoke } = make({ fallback: true, budget: 1, answer: { careers: ['backend'], confidence: 0.7 } });
    expect(await svc.choose(job, candidates)).not.toBeNull();
    expect(await svc.choose(job, candidates)).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

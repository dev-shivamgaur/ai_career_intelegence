import { FieldIngestAgent } from './field-ingest.agent';

// Characterization: ingestCareer with mocked Prisma, web, LLM and evidence. No network, no DB.
function buildAgent(opts: { career?: unknown; graph?: unknown; tier?: string; llmConfigured?: boolean; llmReply?: string }) {
  const steps: string[] = [];
  const prisma = {
    career: { findFirst: jest.fn().mockResolvedValue(opts.career ?? null) },
    ingestJobStep: {
      create: jest.fn().mockImplementation(({ data }) => {
        steps.push(data.stepKey);
        return Promise.resolve({ id: `step-${steps.length}` });
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    skill: { upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ id: `skill-${create.name}`, ...create })) },
    careerSkillRequirement: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    careerGoal: {
      findMany: jest.fn().mockResolvedValue([
        { userId: 'u1', user: { profile: null, roadmaps: [{ id: 'rm1', tasks: [] }] } },
      ]),
    },
    roadmap: { create: jest.fn() },
    roadmapTask: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const web = { fetchJson: jest.fn().mockResolvedValue(opts.graph ?? null) };
  const llm = {
    isConfigured: jest.fn().mockReturnValue(opts.llmConfigured ?? false),
    complete: jest.fn().mockResolvedValue(opts.llmReply ?? ''),
  };
  const evidence = { forUser: jest.fn().mockResolvedValue({ learnerTier: opts.tier ?? 'early' }) };
  const enqueue = { startRun: jest.fn() };
  const agent = new FieldIngestAgent(prisma as never, web as never, llm as never, evidence as never, enqueue as never);
  return { agent, prisma, web, llm, steps };
}

const backendCareer = {
  id: 'c1',
  slug: 'backend-developer',
  title: 'Backend Developer',
  isCustom: false,
  syllabusSlug: 'backend',
  stackLanes: [{ id: 'nodejs', label: 'Node.js', keywords: ['node', 'express'] }],
  requirements: [{ skill: { name: 'PostgreSQL' } }],
};

const graph = {
  nodes: [
    { type: 'topic', data: { label: 'Express.js' } },
    { type: 'topic', data: { label: 'express.js' } },
    { type: 'subtopic', data: { label: 'PostgreSQL' } },
    { type: 'topic', data: { label: 'Kafka' } },
    { type: 'topic', data: { label: 'Installing Node.js' } },
    { type: 'topic', data: { label: 'Introduction' } },
    { type: 'section', data: { label: 'Databases' } },
    { type: 'topic', data: { label: 'How does the internet work?' } },
  ],
};

describe('FieldIngestAgent.ingestCareer (characterization)', () => {
  it('returns a note and does nothing when the career is missing', async () => {
    const { agent, web } = buildAgent({});
    const res = await agent.ingestCareer('nope');
    expect(res).toEqual({ careerId: 'nope', slug: 'nope', source: '', added: [], skipped: 0, usersUpdated: 0, note: 'Career not found.' });
    expect(web.fetchJson).not.toHaveBeenCalled();
  });

  it('never modifies custom careers', async () => {
    const { agent, web } = buildAgent({ career: { ...backendCareer, isCustom: true } });
    const res = await agent.ingestCareer('c1');
    expect(res.note).toBe('Custom fields stay on what the admin typed.');
    expect(web.fetchJson).not.toHaveBeenCalled();
  });

  it('skips the HTTP fetch for slugs without a public syllabus graph', async () => {
    const { agent, web } = buildAgent({ career: { ...backendCareer, syllabusSlug: 'not-a-roadmap' } });
    const res = await agent.ingestCareer('c1');
    expect(res.note).toBe('This slug has no public syllabus graph.');
    expect(res.source).toBe('https://roadmap.sh/api/v1-official-roadmap/not-a-roadmap');
    expect(web.fetchJson).not.toHaveBeenCalled();
  });

  it('inserts only new topics as OPTIONAL / RECOMMENDED / LOW and attaches D30 tasks', async () => {
    const { agent, prisma, web, steps } = buildAgent({ career: backendCareer, graph });
    const res = await agent.ingestCareer('c1', { jobId: 'job1' });

    expect(web.fetchJson).toHaveBeenCalledWith('https://roadmap.sh/api/v1-official-roadmap/backend');
    expect(res).toEqual({
      careerId: 'c1',
      slug: 'backend-developer',
      source: 'https://roadmap.sh/api/v1-official-roadmap/backend',
      added: ['Express.js', 'Kafka'],
      skipped: 1,
      usersUpdated: 1,
    });
    expect(steps).toEqual(['load_career', 'fetch_roadmap', 'compare', 'llm_filter', 'persist_requirements', 'attach_learners']);

    expect(prisma.skill.upsert).toHaveBeenCalledWith({
      where: { name: 'Express.js' },
      update: {},
      create: { name: 'Express.js', category: 'Stack' },
    });
    expect(prisma.skill.upsert).toHaveBeenCalledWith({
      where: { name: 'Kafka' },
      update: {},
      create: { name: 'Kafka', category: 'Core' },
    });
    expect(prisma.careerSkillRequirement.create).toHaveBeenCalledWith({
      data: { careerId: 'c1', skillId: 'skill-Express.js', importance: 'LOW', type: 'RECOMMENDED', layer: 'OPTIONAL', stackLane: 'nodejs' },
    });
    expect(prisma.careerSkillRequirement.create).toHaveBeenCalledWith({
      data: { careerId: 'c1', skillId: 'skill-Kafka', importance: 'LOW', type: 'RECOMMENDED', layer: 'OPTIONAL', stackLane: null },
    });

    // Early learners do not get advanced topics (Kafka) as tasks.
    const tasks = prisma.roadmapTask.createMany.mock.calls[0][0].data;
    expect(tasks.map((t: { title: string }) => t.title)).toEqual(['Express.js']);
    expect(tasks[0]).toMatchObject({ roadmapId: 'rm1', phase: 'D30', priority: 'LOW', status: 'NOT_STARTED', sortOrder: 500 });
  });

  it('gives experienced learners advanced topics too', async () => {
    const { agent, prisma } = buildAgent({ career: backendCareer, graph, tier: 'verified_working' });
    await agent.ingestCareer('c1');
    const tasks = prisma.roadmapTask.createMany.mock.calls[0][0].data;
    expect(tasks.map((t: { title: string }) => t.title)).toEqual(['Express.js', 'Kafka']);
  });

  it('does not record steps without a job context', async () => {
    const { agent, prisma } = buildAgent({ career: backendCareer, graph });
    await agent.ingestCareer('c1');
    expect(prisma.ingestJobStep.create).not.toHaveBeenCalled();
  });

  it('skips a topic whose requirement row already exists', async () => {
    const { agent, prisma } = buildAgent({ career: backendCareer, graph });
    prisma.careerSkillRequirement.findFirst.mockResolvedValueOnce({ id: 'existing' });
    const res = await agent.ingestCareer('c1');
    expect(res.added).toEqual(['Kafka']);
  });

  it('applies the LLM keep-list when configured and keeps everything on a bad reply', async () => {
    const kept = buildAgent({ career: backendCareer, graph, llmConfigured: true, llmReply: '{"keep":["kafka"]}' });
    expect((await kept.agent.ingestCareer('c1')).added).toEqual(['Kafka']);

    const bad = buildAgent({ career: backendCareer, graph, llmConfigured: true, llmReply: 'no json here' });
    expect((await bad.agent.ingestCareer('c1')).added).toEqual(['Express.js', 'Kafka']);
  });
});

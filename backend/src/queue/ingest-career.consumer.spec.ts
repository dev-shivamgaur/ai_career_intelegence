import { IngestCareerConsumer } from './ingest-career.consumer';
import { INGEST_DLX, INGEST_ROUTING, type IngestQueueMessage } from './ingest-queue.constants';

// Characterization: retry by republish with backoff, DLQ after max attempts, ack in every path.
function setup(opts: { jobStatus?: string | null; attemptsSoFar?: number; ingest?: jest.Mock }) {
  const prisma = {
    ingestCareerJob: {
      findUnique: jest.fn().mockResolvedValue(opts.jobStatus === null ? null : { id: 'j1', status: opts.jobStatus ?? 'QUEUED' }),
    },
    ingestJobStep: { count: jest.fn().mockResolvedValue(opts.attemptsSoFar ?? 0) },
  };
  const agent = { ingestCareer: opts.ingest ?? jest.fn().mockResolvedValue({ slug: 'backend-developer', added: ['x'] }) };
  const runs = { markRunning: jest.fn(), markCompleted: jest.fn(), markFailed: jest.fn() };
  const enqueue = { publish: jest.fn() };
  const consumer = new IngestCareerConsumer({ get: jest.fn() } as never, {} as never, prisma as never, agent as never, runs as never, enqueue as never);
  const channel = { ack: jest.fn(), publish: jest.fn() };
  const handle = (body: unknown) =>
    (consumer as unknown as { handle: (c: unknown, m: unknown) => Promise<void> }).handle(channel, {
      content: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
    });
  return { prisma, agent, runs, enqueue, channel, handle };
}

const msg = (attempt = 1): IngestQueueMessage => ({ runId: 'r1', jobId: 'j1', careerId: 'c1', trigger: 'ADMIN', attempt });

describe('IngestCareerConsumer (characterization)', () => {
  let timeoutSpy: jest.SpyInstance;
  beforeEach(() => {
    timeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    }) as never);
  });
  afterEach(() => timeoutSpy.mockRestore());

  it('acks and drops malformed JSON', async () => {
    const t = setup({});
    await t.handle('not json');
    expect(t.channel.ack).toHaveBeenCalledTimes(1);
    expect(t.agent.ingestCareer).not.toHaveBeenCalled();
  });

  it.each([null, 'COMPLETED', 'FAILED'])('acks without work when the job is %s', async (status) => {
    const t = setup({ jobStatus: status });
    await t.handle(msg());
    expect(t.channel.ack).toHaveBeenCalledTimes(1);
    expect(t.agent.ingestCareer).not.toHaveBeenCalled();
  });

  it('runs the agent, marks completed and acks on success', async () => {
    const t = setup({});
    await t.handle(msg());
    expect(t.runs.markRunning).toHaveBeenCalledWith('j1', 'r1');
    expect(t.agent.ingestCareer).toHaveBeenCalledWith('c1', { jobId: 'j1' });
    expect(t.runs.markCompleted).toHaveBeenCalled();
    expect(t.channel.ack).toHaveBeenCalledTimes(1);
    expect(t.channel.publish).not.toHaveBeenCalled();
  });

  it('republishes with attempt+1 after a 2^(attempt-1) second delay on failure', async () => {
    const t = setup({ ingest: jest.fn().mockRejectedValue(new Error('boom')) });
    await t.handle(msg(1));
    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
    expect(t.enqueue.publish).toHaveBeenCalledWith({ ...msg(1), attempt: 2 });
    expect(t.runs.markFailed).not.toHaveBeenCalled();
    expect(t.channel.ack).toHaveBeenCalledTimes(1);

    const t2 = setup({ attemptsSoFar: 1, ingest: jest.fn().mockRejectedValue(new Error('boom')) });
    await t2.handle(msg(2));
    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);
    expect(t2.enqueue.publish).toHaveBeenCalledWith({ ...msg(2), attempt: 3 });
  });

  it('dead-letters and marks failed on the last attempt', async () => {
    const t = setup({ attemptsSoFar: 2, ingest: jest.fn().mockRejectedValue(new Error('boom')) });
    await t.handle(msg(3));
    expect(t.enqueue.publish).not.toHaveBeenCalled();
    expect(t.runs.markFailed).toHaveBeenCalledWith('j1', 'r1', 'boom', expect.any(Date));
    expect(t.channel.publish).toHaveBeenCalledWith(INGEST_DLX, INGEST_ROUTING, expect.any(Buffer), {
      persistent: true,
      contentType: 'application/json',
    });
    expect(t.channel.ack).toHaveBeenCalledTimes(1);
  });

  it('uses recorded attempts, not body.attempt, after a worker crash', async () => {
    const t = setup({ attemptsSoFar: 3 });
    await t.handle(msg(1));
    expect(t.agent.ingestCareer).not.toHaveBeenCalled();
    expect(t.runs.markFailed).toHaveBeenCalledWith('j1', 'r1', 'Stopped after 3 attempts (worker restarted mid-job)', expect.any(Date));
    expect(t.channel.publish).toHaveBeenCalledWith(INGEST_DLX, INGEST_ROUTING, expect.any(Buffer), expect.any(Object));
    expect(t.channel.ack).toHaveBeenCalledTimes(1);
  });

  it('dead-letters early when recorded attempts would exceed the limit even if body.attempt is low', async () => {
    const t = setup({ attemptsSoFar: 2, ingest: jest.fn().mockRejectedValue(new Error('boom')) });
    await t.handle(msg(1));
    expect(t.enqueue.publish).not.toHaveBeenCalled();
    expect(t.runs.markFailed).toHaveBeenCalled();
  });
});

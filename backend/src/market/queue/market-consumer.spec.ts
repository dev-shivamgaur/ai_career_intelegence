import { MarketConsumer, NonRetryableError } from './market-consumer';
import type { MarketMessage } from './market-queue.constants';

function setup(task: { status: string; attempts: number } | null) {
  const runs = {
    getTask: jest.fn().mockResolvedValue(task ? { id: 't1', ...task } : null),
    markRunning: jest.fn(),
    markDone: jest.fn().mockResolvedValue(undefined),
    markRetrying: jest.fn(),
  };
  const rabbit = { isReady: jest.fn().mockReturnValue(true), publish: jest.fn(), onReady: jest.fn() };
  const consumer = new MarketConsumer(rabbit as never, runs as never);
  const channel = { ack: jest.fn(), nack: jest.fn() };
  const body: MarketMessage = { taskId: 't1', runId: 'r1', queue: 'market.fetch', attempt: 1, payload: { sourceId: 's1' } };
  const msg = (b: unknown = body) => ({ content: Buffer.from(typeof b === 'string' ? b : JSON.stringify(b)) }) as never;
  return { consumer, runs, rabbit, channel, body, msg };
}

describe('MarketConsumer.handle', () => {
  it('runs the handler and acks on success', async () => {
    const t = setup({ status: 'QUEUED', attempts: 0 });
    const handler = jest.fn().mockResolvedValue({ counters: { fetched: 3 } });
    await t.consumer.handle(t.channel, t.msg(), handler);
    expect(handler).toHaveBeenCalledWith(t.body);
    expect(t.runs.markDone).toHaveBeenCalledWith('t1', 'r1', 'COMPLETED', expect.any(Date), { counters: { fetched: 3 }, error: undefined });
    expect(t.channel.ack).toHaveBeenCalledTimes(1);
  });

  it('acks redelivered messages for finished tasks without running the handler (idempotent)', async () => {
    for (const status of ['COMPLETED', 'SKIPPED', 'FAILED']) {
      const t = setup({ status, attempts: 1 });
      const handler = jest.fn();
      await t.consumer.handle(t.channel, t.msg(), handler);
      expect(handler).not.toHaveBeenCalled();
      expect(t.channel.ack).toHaveBeenCalledTimes(1);
    }
  });

  it('parks a retryable failure in the retry queue with a delay', async () => {
    const t = setup({ status: 'QUEUED', attempts: 0 });
    await t.consumer.handle(t.channel, t.msg(), jest.fn().mockRejectedValue(new Error('HTTP 503')));
    expect(t.rabbit.publish).toHaveBeenCalledWith({ ...t.body, attempt: 2 }, 5000);
    expect(t.runs.markRetrying).toHaveBeenCalledWith('t1', 'HTTP 503');
    expect(t.channel.ack).toHaveBeenCalledTimes(1);
    expect(t.channel.nack).not.toHaveBeenCalled();
  });

  it('dead-letters non-retryable failures immediately', async () => {
    const t = setup({ status: 'QUEUED', attempts: 0 });
    await t.consumer.handle(t.channel, t.msg(), jest.fn().mockRejectedValue(new NonRetryableError('TERMS_NOT_REVIEWED')));
    expect(t.rabbit.publish).not.toHaveBeenCalled();
    expect(t.runs.markDone).toHaveBeenCalledWith('t1', 'r1', 'FAILED', expect.any(Date), { error: 'TERMS_NOT_REVIEWED' });
    expect(t.channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  it('dead-letters when attempts are exhausted', async () => {
    const t = setup({ status: 'QUEUED', attempts: 2 });
    await t.consumer.handle(t.channel, t.msg({ ...t.body, attempt: 3 }), jest.fn().mockRejectedValue(new Error('boom')));
    expect(t.rabbit.publish).not.toHaveBeenCalled();
    expect(t.channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  it('stops a task whose recorded attempts already hit the limit (crash redelivery)', async () => {
    const t = setup({ status: 'RUNNING', attempts: 3 });
    const handler = jest.fn();
    await t.consumer.handle(t.channel, t.msg(), handler);
    expect(handler).not.toHaveBeenCalled();
    expect(t.channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  it('nacks malformed JSON to the DLQ', async () => {
    const t = setup(null);
    await t.consumer.handle(t.channel, t.msg('not-json'), jest.fn());
    expect(t.channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });
});

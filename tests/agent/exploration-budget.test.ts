import { describe, expect, it } from 'vitest';
import { BudgetLedger, costReport } from '../../packages/agent/src/budget.js';
import { ExplorationRun, type ExplorationDeps, type Variant } from '../../packages/agent/src/exploration.js';
const LIMITS = { modelTurns: 4, maxOutputTokens: 4096, simulationWallMs: 60_000, variants: 3, workers: 2 };
const variant = (n: number, connectionId = 'conn-a'): Variant => ({ id: `v${n}`, connectionId, label: `Variant ${n}`, params: { fleet: n } });
const rateLimited = () => Object.assign(new Error('429 Too Many Requests'), { code: 'RATE_LIMITED', status: 429 });
const defer = <T,>() => { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };
function deps(overrides: Partial<ExplorationDeps> = {}): ExplorationDeps & { log: string[] } {
  const log: string[] = [];
  let n = 0;
  return {
    log, runId: 'run-1', connectionId: 'conn-a',
    propose: async () => { log.push('propose'); return { variant: variant(++n), usage: { outputTokens: 120 } }; },
    simulate: async (v) => { log.push(`simulate:${v.id}`); return { status: 'completed', result: { throughput: v.params.fleet }, wallMs: 1000 }; },
    ...overrides,
  };
}
describe('BudgetLedger', () => {
  it('reserves before dispatch, keeps a sent turn and refunds only an unsent one', () => {
    const ledger = new BudgetLedger(LIMITS);
    const a = ledger.reserve('modelTurns');
    expect(ledger.snapshot().remaining.modelTurns).toBe(3);
    ledger.release(a);
    expect(ledger.snapshot().remaining.modelTurns).toBe(4);
    const b = ledger.reserve('modelTurns');
    ledger.markSent(b);
    expect(() => ledger.release(b)).toThrow('BUDGET_SENT');
    ledger.settle(b, 0);
    expect(ledger.snapshot().remaining.modelTurns).toBe(3);
    expect(ledger.snapshot().consumed.modelTurns).toBe(1);
  });
  it('settles output tokens to actual usage, keeps unknown usage at the upper bound and flags it', () => {
    const ledger = new BudgetLedger(LIMITS);
    const t = ledger.reserve('maxOutputTokens', 4096);
    ledger.markSent(t);
    expect(ledger.snapshot().pending.maxOutputTokens).toBe(4096);
    ledger.settle(t, 300);
    expect(ledger.snapshot()).toMatchObject({ consumed: { maxOutputTokens: 300 }, pending: { maxOutputTokens: 0 }, usageUnknown: false });
    expect(ledger.snapshot().remaining.maxOutputTokens).toBe(3796);
    const u = ledger.reserve('maxOutputTokens', 1000);
    ledger.markSent(u);
    ledger.settle(u, null);
    expect(ledger.snapshot()).toMatchObject({ usageUnknown: true, pending: { maxOutputTokens: 1000 } });
    expect(ledger.snapshot().remaining.maxOutputTokens).toBe(2796);
  });
  it('throws BUDGET_REACHED when exhausted and treats workers as concurrency slots', () => {
    const ledger = new BudgetLedger({ ...LIMITS, modelTurns: 1 });
    ledger.markSent(ledger.reserve('modelTurns'));
    expect(() => ledger.reserve('modelTurns')).toThrow('BUDGET_REACHED');
    const w1 = ledger.reserve('workers'), w2 = ledger.reserve('workers');
    expect(() => ledger.reserve('workers')).toThrow('BUDGET_REACHED');
    ledger.markSent(w1); ledger.settle(w1, 0);
    expect(ledger.snapshot().remaining.workers).toBe(1);
    ledger.release(w2);
    expect(ledger.snapshot().remaining.workers).toBe(2);
    expect(() => ledger.reserve('maxOutputTokens', 0)).toThrow('BUDGET_INVALID');
  });
  it('reports cost as null when pricing is unknown and marks in-flight cost pending', () => {
    const ledger = new BudgetLedger(LIMITS);
    expect(costReport(ledger.snapshot(), null)).toEqual({ usd: null, state: 'unknown' });
    const t = ledger.reserve('maxOutputTokens', 1000);
    ledger.markSent(t);
    expect(costReport(ledger.snapshot(), 0.00001)).toEqual({ usd: 0, state: 'pending' });
    ledger.settle(t, 500);
    expect(costReport(ledger.snapshot(), 0.00001)).toEqual({ usd: 0.005, state: 'settled' });
    const u = ledger.reserve('maxOutputTokens', 100);
    ledger.markSent(u); ledger.settle(u, null);
    expect(costReport(ledger.snapshot(), 0.00001).state).toBe('unknown');
  });
});
describe('ExplorationRun', () => {
  it('plans experiments up front with their reserved budget and reserves before every dispatch', async () => {
    const d = deps({
      propose: async function (this: void) { d.log.push(`propose@${run.snapshot().ledger.remaining.modelTurns}`); return { variant: variant(d.log.length), usage: { outputTokens: 50 } }; },
    });
    const run = new ExplorationRun(d, LIMITS);
    expect(run.snapshot().planned).toHaveLength(3);
    expect(run.snapshot().planned[0]).toMatchObject({ index: 0, reserved: { modelTurns: 1, maxOutputTokens: 4096, simulationWallMs: 20_000 } });
    const summary = await run.start();
    expect(d.log.filter((l) => l.startsWith('propose'))).toEqual(['propose@3', 'propose@2', 'propose@1']);
    expect(summary.stop).toEqual({ reason: 'COMPLETED', detail: expect.any(String) });
    expect(summary.experiments.map((e) => e.status)).toEqual(['completed', 'completed', 'completed']);
    expect(summary.ledger.consumed).toMatchObject({ modelTurns: 3, variants: 3, maxOutputTokens: 150 });
    expect(summary.ledger.remaining.workers).toBe(2);
  });
  it('consumes a turn for every 429 retry and stops at the turn limit without launching more', async () => {
    let calls = 0;
    const d = deps({ propose: async () => { calls++; throw rateLimited(); } });
    const run = new ExplorationRun(d, LIMITS);
    const summary = await run.start();
    expect(calls).toBe(4);
    expect(summary.ledger.remaining.modelTurns).toBe(0);
    expect(summary.stop).toEqual({ reason: 'BUDGET_REACHED', detail: expect.stringContaining('RATE_LIMITED') });
    expect(summary.experiments[0]).toMatchObject({ status: 'failed', stopReason: 'RATE_LIMITED' });
    expect(d.log).toEqual([]);
  });
  it('leaves the reservation at the upper bound and flags usageUnknown when the provider reports no usage', async () => {
    const d = deps({ propose: async () => ({ variant: variant(1), usage: null }) });
    const run = new ExplorationRun(d, { ...LIMITS, variants: 1 });
    const summary = await run.start();
    expect(summary.ledger.usageUnknown).toBe(true);
    expect(summary.ledger.pending.maxOutputTokens).toBe(4096);
    expect(summary.ledger.remaining.maxOutputTokens).toBe(0);
  });
  it('cancellation between variants aborts the second request and records CANCELLED', async () => {
    const second = defer<never>();
    let n = 0;
    const d = deps({
      propose: async (_context, signal) => {
        if (++n === 1) return { variant: variant(1), usage: { outputTokens: 10 } };
        signal.addEventListener('abort', () => second.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        return second.promise;
      },
    });
    const run = new ExplorationRun(d, LIMITS);
    const pending = run.start();
    await new Promise((r) => setTimeout(r, 5));
    expect(run.snapshot().generation).toBe(0);
    run.cancel();
    expect(run.snapshot().generation).toBe(1);
    const summary = await pending;
    expect(summary.stop.reason).toBe('CANCELLED');
    expect(summary.experiments[0]!.status).toBe('completed');
    expect(summary.experiments[1]).toMatchObject({ status: 'failed', stopReason: 'CANCELLED' });
    expect(summary.experiments).toHaveLength(2);
    expect(summary.ledger.consumed.modelTurns).toBe(2);
  });
  it('records a tool timeout as a partial result and keeps going', async () => {
    const d = deps({
      simulate: async (v) => { if (v.id === 'v1') throw Object.assign(new Error('worker timed out'), { code: 'TOOL_TIMEOUT' }); return { status: 'completed', result: {}, wallMs: 10 }; },
    });
    const summary = await new ExplorationRun(d, { ...LIMITS, variants: 2 }).start();
    expect(summary.experiments[0]).toMatchObject({ status: 'partial', stopReason: 'TOOL_TIMEOUT' });
    expect(summary.experiments[1]!.status).toBe('completed');
    expect(summary.stop.reason).toBe('COMPLETED');
  });
  it('denies connection fallback by construction', async () => {
    const d = deps({ propose: async () => ({ variant: variant(1, 'conn-other'), usage: { outputTokens: 5 } }) });
    const summary = await new ExplorationRun(d, LIMITS).start();
    expect(summary.stop.reason).toBe('FALLBACK_DENIED');
    expect(summary.experiments[0]).toMatchObject({ status: 'failed', stopReason: 'FALLBACK_DENIED' });
    expect(d.log).toEqual([]);
    expect(summary.ledger.consumed.modelTurns).toBe(1);
  });
  it('rejects a duplicate exploration request while one runs', async () => {
    const gate = defer<{ variant: Variant; usage: null }>();
    const d = deps({ propose: () => gate.promise });
    const run = new ExplorationRun(d, { ...LIMITS, variants: 1 });
    const first = run.start();
    await expect(run.start()).rejects.toThrow('EXPLORATION_ACTIVE');
    gate.resolve({ variant: variant(1), usage: null });
    await first;
    expect(run.snapshot().active).toBe(false);
  });
  it('extend enables exactly the added budget and rejects limits that are not greater', async () => {
    const d = deps();
    const run = new ExplorationRun(d, { ...LIMITS, modelTurns: 1 });
    const first = await run.start();
    expect(first.stop.reason).toBe('BUDGET_REACHED');
    expect(first.experiments).toHaveLength(1);
    expect(await run.start()).toMatchObject({ stop: { reason: 'BUDGET_REACHED' } });
    expect(d.log.filter((l) => l === 'propose')).toHaveLength(1);
    expect(() => run.extend({ modelTurns: 1 })).toThrow('BUDGET_INVALID');
    expect(() => run.extend({ modelTurns: 2.5 })).toThrow('BUDGET_INVALID');
    run.extend({ modelTurns: 2 });
    expect(run.snapshot().ledger.limits.modelTurns).toBe(2);
    const second = await run.start();
    expect(d.log.filter((l) => l === 'propose')).toHaveLength(2);
    expect(second.experiments).toHaveLength(2);
    expect(second.stop.reason).toBe('BUDGET_REACHED');
  });
  it('limits concurrent simulations to the worker count', async () => {
    let active = 0, peak = 0;
    const d = deps({
      simulate: async () => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 5)); active--; return { status: 'completed', result: {}, wallMs: 5 }; },
    });
    await new ExplorationRun(d, { ...LIMITS, workers: 1 }).start();
    expect(peak).toBe(1);
  });
});

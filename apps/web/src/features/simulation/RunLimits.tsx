import { useState } from 'react';
import { DEFAULT_LIMITS, DEFAULT_POLICY, MAX_TICKS_LIMIT, TICK_MS, WALL_MS_LIMIT, type Policy, type RunLimits as Limits, type ScenarioSummary, type StartBody } from './types.js';
const clampInt = (raw: string, min: number, max: number, fallback: number): number => {
  const value = Number(raw);
  if (!Number.isFinite(value) || raw.trim() === '') return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
};
/** Visible run limits. What is displayed is exactly what `onStart` posts: the
 * wall-clock deadline, the tick budget, the seed and the versioned policy. The
 * budget cannot be exceeded without changing these fields explicitly. */
export function RunLimits({ scenarios, busy, active, onStart }: { scenarios: ScenarioSummary[]; busy: boolean; active: boolean; onStart: (body: StartBody) => Promise<unknown> }) {
  const [scenarioId, setScenarioId] = useState('');
  const [wallS, setWallS] = useState(String(DEFAULT_LIMITS.wallMs / 1000));
  const [maxTicks, setMaxTicks] = useState(String(DEFAULT_LIMITS.maxTicks));
  const [seed, setSeed] = useState('1');
  const [policy, setPolicy] = useState<Policy['name']>(DEFAULT_POLICY.name);
  const chosen = scenarioId || scenarios[0]?.id || '';
  const limits: Limits = { wallMs: clampInt(wallS, 1, WALL_MS_LIMIT / 1000, DEFAULT_LIMITS.wallMs / 1000) * 1000, maxTicks: clampInt(maxTicks, 1, MAX_TICKS_LIMIT, DEFAULT_LIMITS.maxTicks) };
  const seedValue = clampInt(seed, 1, 0xffffffff, 1);
  const submit = () => { if (chosen) void onStart({ scenarioId: chosen, seed: seedValue, limits, policy: { name: policy, version: DEFAULT_POLICY.version } }); };
  return (
    <form className="sim-limits" aria-label="Run limits" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <label>Scenario
        <select value={chosen} onChange={(e) => setScenarioId(e.target.value)} disabled={!scenarios.length}>
          {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.id})</option>)}
        </select>
      </label>
      <label>Wall time (s)
        <input type="number" min={1} max={WALL_MS_LIMIT / 1000} step={1} value={wallS} onChange={(e) => setWallS(e.target.value)} onBlur={() => setWallS(String(limits.wallMs / 1000))} />
      </label>
      <label>Max ticks
        <input type="number" min={1} max={MAX_TICKS_LIMIT} step={1} value={maxTicks} onChange={(e) => setMaxTicks(e.target.value)} onBlur={() => setMaxTicks(String(limits.maxTicks))} />
      </label>
      <label>Seed
        <input type="number" min={1} max={0xffffffff} step={1} value={seed} onChange={(e) => setSeed(e.target.value)} onBlur={() => setSeed(String(seedValue))} />
      </label>
      <label>Policy
        <select value={policy} onChange={(e) => setPolicy(e.target.value as Policy['name'])}>
          <option value="fifo-nearest">fifo-nearest/{DEFAULT_POLICY.version}</option>
          <option value="cost-estimate">cost-estimate/{DEFAULT_POLICY.version}</option>
        </select>
      </label>
      <p className="help" data-testid="sim-limit-summary">
        Runs stop after {limits.wallMs / 1000} s of wall time or {limits.maxTicks} ticks ({((limits.maxTicks * TICK_MS) / 60_000).toFixed(1)} simulated minutes), whichever comes first. A stopped run is stored as partial.
      </p>
      <button type="submit" className="primary" disabled={busy || !chosen}>{active ? 'Queue run' : 'Start run'}</button>
    </form>
  );
}

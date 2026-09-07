import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../../lib/api.js';
import { ACTIVE_STATES, type Comparison, type EventWindow, type RunDetail, type RunStatus, type ScenarioSummary, type StartBody } from './types.js';
export interface SimulationApi {
  runs: RunStatus[];
  scenarios: ScenarioSummary[];
  detail: RunDetail | null;
  events: EventWindow | null;
  comparison: Comparison | null;
  busy: boolean;
  error: string | null;
  /** Settled outcome for the single live region; never updated per progress tick. */
  status: string;
  refresh(): Promise<void>;
  start(body: StartBody): Promise<RunStatus | null>;
  cancel(runId: string): Promise<void>;
  open(runId: string): Promise<void>;
  loadEvents(runId: string, from: number, to: number): Promise<void>;
  compare(baselineRunId: string, alternativeRunIds: string[]): Promise<void>;
}
type ScenesList = { scenarios: ScenarioSummary[] };
/** Client of the simulation host. Polls the run list only while a run is queued
 * or running; the exact limits shown in RunLimits are what `start` posts. */
export function useSimulation({ pollMs = 700 }: { pollMs?: number } = {}): SimulationApi {
  const [runs, setRuns] = useState<RunStatus[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [events, setEvents] = useState<EventWindow | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const alive = useRef(true);
  const seen = useRef(new Map<string, RunStatus['state']>());
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const refresh = useCallback(async () => {
    try {
      const list = await api.request<{ runs: RunStatus[] }>('/api/simulation/runs');
      if (!alive.current) return;
      for (const run of list.runs) {
        const previous = seen.current.get(run.runId);
        if (previous && ACTIVE_STATES.has(previous) && !ACTIVE_STATES.has(run.state)) setStatus(`Run ${run.runId.slice(0, 8)} ${run.state === 'stored' ? `finished: ${run.termination ?? 'stored'}${run.partial ? ' (partial)' : ''}` : run.state}`);
        seen.current.set(run.runId, run.state);
      }
      setRuns(list.runs);
      setError(null);
    } catch (cause) {
      if (alive.current) setError(errorMessage(cause));
    }
  }, []);
  useEffect(() => {
    void refresh();
    void api.request<ScenesList>('/api/scenes').then((s) => alive.current && setScenarios(s.scenarios.map(({ id, name, sceneId }) => ({ id, name, sceneId })))).catch((e) => alive.current && setError(errorMessage(e)));
  }, [refresh]);
  const active = runs.some((r) => ACTIVE_STATES.has(r.state));
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(timer);
  }, [active, pollMs, refresh]);
  const guard = useCallback(async <T,>(action: () => Promise<T>): Promise<T | null> => {
    setBusy(true);
    try { const out = await action(); if (alive.current) setError(null); return out; } catch (cause) { if (alive.current) setError(errorMessage(cause)); return null; } finally { if (alive.current) setBusy(false); }
  }, []);
  const start = useCallback((body: StartBody) => guard(async () => {
    const started = await api.request<RunStatus>('/api/simulation/runs', body);
    if (alive.current) setStatus(started.reused ? `Reused stored run ${started.runId.slice(0, 8)} with identical inputs` : `Run ${started.runId.slice(0, 8)} ${started.state}`);
    await refresh();
    return started;
  }), [guard, refresh]);
  const cancel = useCallback(async (runId: string) => { await guard(async () => { await api.request(`/api/simulation/runs/${encodeURIComponent(runId)}/cancel`, {}); await refresh(); }); }, [guard, refresh]);
  const loadEvents = useCallback(async (runId: string, from: number, to: number) => {
    const window = await guard(() => api.request<EventWindow>(`/api/simulation/runs/${encodeURIComponent(runId)}/events?from=${from}&to=${to}`));
    if (window && alive.current) setEvents(window);
  }, [guard]);
  const open = useCallback(async (runId: string) => {
    const loaded = await guard(() => api.request<RunDetail>(`/api/simulation/runs/${encodeURIComponent(runId)}`));
    if (!loaded || !alive.current) return;
    setDetail(loaded);
    setEvents(null);
    await loadEvents(runId, 0, Math.min(loaded.eventCount, 5000));
  }, [guard, loadEvents]);
  const compare = useCallback(async (baselineRunId: string, alternativeRunIds: string[]) => {
    const out = await guard(() => api.request<Comparison>('/api/simulation/compare', { baselineRunId, alternativeRunIds }));
    if (out && alive.current) { setComparison(out); setStatus(out.comparable ? 'Comparison ready' : 'Comparison refused: workloads differ'); }
  }, [guard]);
  return { runs, scenarios, detail, events, comparison, busy, error, status, refresh, start, cancel, open, loadEvents, compare };
}

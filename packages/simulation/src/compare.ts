import type { Objective, ObjectiveKind } from '@robopomelo/spec';
import type { FleetMetrics } from './fleet-types.js';
import { evaluateObjectives, type ObjectiveContext, type ObjectiveEvaluation } from './objectives.js';

/** Recorded run as the comparison sees it. `variantHash` groups repeats of one
 * configuration under different seeds; `stale` and `partial` are labels only. */
export type RunSummary = {
  runId: string; inputHash: string; workloadHash: string; variantHash: string; seed: number;
  partial: boolean; stale: boolean; metrics: FleetMetrics; robotsUsed: number; cost?: number | null;
};
export type ObjectiveDelta = { id: string; kind: ObjectiveKind; delta: number | null; better: boolean | null };
export type ComparedRun = { runId: string; seed: number; partial: boolean; stale: boolean; objectives: ObjectiveEvaluation[]; deltas: ObjectiveDelta[] };
export type Spread = { variantHash: string; runIds: string[]; seeds: number[]; objectives: { id: string; kind: ObjectiveKind; min: number | null; max: number | null }[] };
export type Comparison =
  | { comparable: false; reason: 'WORKLOAD_MISMATCH'; mismatched: string[] }
  | {
    comparable: true; workloadHash: string; baseline: ComparedRun; alternatives: ComparedRun[];
    /** Run ids that are best on every objective at once, or null when objectives disagree or something is unmeasured. */
    preferred: string[] | null;
    /** Why no preference was computed. Never resolved with hidden weights. */
    undecided: 'OBJECTIVE_TRADEOFF' | 'UNMEASURED' | 'NO_COMPLETE_RUN' | 'NO_OBJECTIVES' | null;
    spreads: Spread[];
  };

const context = (r: RunSummary): ObjectiveContext => ({ partial: r.partial, robotsUsed: r.robotsUsed, cost: r.cost ?? null });
const delta = (base: ObjectiveEvaluation, alt: ObjectiveEvaluation): ObjectiveDelta => {
  if (base.measured === null || alt.measured === null) return { id: alt.id, kind: alt.kind, delta: null, better: null };
  const d = alt.measured - base.measured;
  return { id: alt.id, kind: alt.kind, delta: d, better: d === 0 ? null : alt.direction === 'maximize' ? d > 0 : d < 0 };
};

/** Same-workload comparison of a fixed baseline with alternatives. Preference is
 * computed only when every objective ranks the same variant group best; repeats
 * of one variant are ranked by their whole spread so one lucky seed cannot win. */
export function compareRuns(baseline: RunSummary, alternatives: readonly RunSummary[], objectives: readonly Objective[]): Comparison {
  const mismatched = alternatives.filter((a) => a.workloadHash !== baseline.workloadHash).map((a) => a.runId);
  if (mismatched.length) return { comparable: false, reason: 'WORKLOAD_MISMATCH', mismatched };
  const evaluate = (r: RunSummary) => evaluateObjectives(objectives, r.metrics, context(r));
  const baseEval = evaluate(baseline);
  const row = (r: RunSummary, evaluated: ObjectiveEvaluation[]): ComparedRun => ({ runId: r.runId, seed: r.seed, partial: r.partial, stale: r.stale, objectives: evaluated, deltas: evaluated.map((e, i) => delta(baseEval[i]!, e)) });
  const all = [baseline, ...alternatives];
  const evaluations = new Map(all.map((r) => [r.runId, evaluate(r)]));
  const groups = new Map<string, RunSummary[]>();
  for (const r of all) groups.set(r.variantHash, [...(groups.get(r.variantHash) ?? []), r]);
  const spreads: Spread[] = [...groups.entries()].filter(([, runs]) => runs.length > 1).map(([variantHash, runs]) => ({
    variantHash, runIds: runs.map((r) => r.runId), seeds: runs.map((r) => r.seed),
    objectives: objectives.map((o, i) => {
      const values = runs.map((r) => evaluations.get(r.runId)![i]!.measured).filter((v): v is number => v !== null);
      return { id: o.id, kind: o.kind, min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null };
    }),
  }));
  const complete = [...groups.entries()].map(([hash, runs]) => [hash, runs.filter((r) => !r.partial)] as const).filter(([, runs]) => runs.length > 0);
  let preferred: string[] | null = null, undecided: Extract<Comparison, { comparable: true }>['undecided'] = null;
  if (!objectives.length) undecided = 'NO_OBJECTIVES';
  else if (!complete.length) undecided = 'NO_COMPLETE_RUN';
  else {
    let survivors = new Set(complete.map(([hash]) => hash));
    for (let i = 0; i < objectives.length && survivors.size; i++) {
      const bounds = complete.map(([hash, runs]) => {
        const values = runs.map((r) => evaluations.get(r.runId)![i]!.measured);
        return values.some((v) => v === null) ? null : { hash, min: Math.min(...(values as number[])), max: Math.max(...(values as number[])) };
      });
      if (bounds.some((b) => b === null)) { undecided = 'UNMEASURED'; survivors = new Set(); break; }
      const maximize = objectives[i]!.direction === 'maximize';
      const beaten = (b: { min: number; max: number }) => bounds.some((o) => o !== null && (maximize ? o.min > b.max : o.max < b.min));
      const best = new Set(bounds.filter((b): b is NonNullable<typeof b> => b !== null && !beaten(b)).map((b) => b.hash));
      survivors = new Set([...survivors].filter((hash) => best.has(hash)));
    }
    if (survivors.size) preferred = complete.filter(([hash]) => survivors.has(hash)).flatMap(([, runs]) => runs.map((r) => r.runId));
    else undecided ??= 'OBJECTIVE_TRADEOFF';
  }
  return { comparable: true, workloadHash: baseline.workloadHash, baseline: row(baseline, baseEval), alternatives: alternatives.map((a) => row(a, evaluations.get(a.runId)!)), preferred, undecided, spreads };
}

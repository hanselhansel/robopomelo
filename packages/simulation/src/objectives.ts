import type { Objective, ObjectiveKind } from '@robopomelo/spec';
import type { FleetMetrics } from './fleet-types.js';
import { SimulationError, TICK_MS } from './types.js';

export type ObjectiveEvaluation = {
  id: string; kind: ObjectiveKind; direction: Objective['direction']; unit: string;
  /** Recorded measurement, or null when the run cannot measure it (no cost model, no completed job). */
  measured: number | null;
  threshold: number | null;
  /** null when the run is partial, unmeasured or the objective has no threshold. */
  satisfied: boolean | null;
};
export type ObjectiveContext = {
  /** A partial run never claims a full-horizon score. */
  partial: boolean;
  /** Robots the run used (fleet-count). */
  robotsUsed: number;
  /** Cost is only ever a supplied input; it is never derived from appearance. */
  cost?: number | null;
};

/** Measured value per objective kind from recorded metrics. */
export function measure(kind: ObjectiveKind, metrics: FleetMetrics, context: ObjectiveContext): number | null {
  switch (kind) {
    case 'throughput': return metrics.throughputPerHour;
    case 'fleet-count': return context.robotsUsed;
    case 'max-wait': return metrics.p95WaitTicks === null ? null : (metrics.p95WaitTicks * TICK_MS) / 1000;
    case 'cost': return typeof context.cost === 'number' && Number.isFinite(context.cost) ? context.cost : null;
  }
}

export function evaluateObjectives(objectives: readonly Objective[], metrics: FleetMetrics, context: ObjectiveContext): ObjectiveEvaluation[] {
  validateObjectiveDefinitions(objectives);
  return objectives.map((o) => {
    const measured = measure(o.kind, metrics, context);
    const satisfied = context.partial || measured === null || o.threshold === null ? null : o.direction === 'maximize' ? measured >= o.threshold : measured <= o.threshold;
    return { id: o.id, kind: o.kind, direction: o.direction, unit: o.unit, measured, threshold: o.threshold, satisfied };
  });
}

/** Rejects duplicate ids, non-finite thresholds and one kind pulled in two directions. */
export function validateObjectiveDefinitions(objectives: readonly Objective[]): void {
  const ids = new Set<string>(), directions = new Map<ObjectiveKind, Objective['direction']>();
  for (const o of objectives) {
    if (ids.has(o.id)) throw new SimulationError('OBJECTIVE_DUPLICATE', `objective ${o.id} is defined twice`);
    ids.add(o.id);
    if (o.threshold !== null && !Number.isFinite(o.threshold)) throw new SimulationError('OBJECTIVE_INVALID', `objective ${o.id} threshold must be finite or null`);
    const previous = directions.get(o.kind);
    if (previous && previous !== o.direction) throw new SimulationError('OBJECTIVE_CONFLICT', `objective kind ${o.kind} is both maximized and minimized`);
    directions.set(o.kind, o.direction);
  }
}

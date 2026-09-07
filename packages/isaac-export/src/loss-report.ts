import type { IsaacExportPlan } from './plan.js';
/** `unsupported.json`: every spatial element or field the export does not
 * represent, with a reason code. Nothing is silently omitted. Also the
 * `bindings.json` rows a second engineer uses to trace each simulator input. */
export const REASON_CODES: Readonly<Record<string, string>> = Object.freeze({
  DRIVE_UNSUPPORTED: 'robot drive or asset has no supported target robot; exported as static collision geometry',
  ROBOT_BEYOND_MAX: 'more robots than the reference allows; exported as static collision geometry',
  FLEET_SIZE_MISMATCH: 'scenario fleetSize differs from placed robot instances; placed instances win',
  STATION_INSTANCE_MISSING: 'station points at an instance that is not in the scene',
  STATION_KIND_UNSUPPORTED: 'charger and holding stations are not part of the reference',
  STATION_BEYOND_MAX: 'more stations than the reference allows',
  WORKLOAD_MISSING: 'no workload, so no goals',
  WORKLOAD_INVALID: 'workload cannot be turned into goals',
  OBJECTIVE_UNSUPPORTED: 'only throughput goals are exported; other objectives are not evaluated by run.py',
  DIMENSIONS_ESTIMATED: 'instance dimensions unknown; catalog defaults used for collision',
  BINDING_NOT_CONFIRMED: 'binding is stale or unresolved; value exported as stored, not confirmed',
  FLOOR_UNKNOWN: 'floor extents unknown; floor derived from object bounds',
});
export function buildUnsupportedReport(plan: IsaacExportPlan): Record<string, unknown> {
  const entries = [...plan.unsupported].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    formatVersion: '1.0.0',
    target: plan.profile.targetId,
    mode: plan.mode,
    notRepresented: {
      drives: plan.profile.unsupported.drives, features: plan.profile.unsupported.features,
      loadTypes: `only ${plan.profile.supportedLoadTypes.join(', ')}`, objectives: 'only throughput', stationKinds: `only ${plan.profile.supportedStationKinds.join(', ')}`,
    },
    reasonCodes: REASON_CODES,
    entries,
    remainingSetup: plan.remainingSetup,
  };
}
export function buildBindingsReport(plan: IsaacExportPlan): unknown[] {
  return plan.bindings.map((row) => ({
    id: row.id, subjectId: row.subjectId, scenarioId: row.scenarioId, recordId: row.recordId, field: row.field,
    state: row.state, transform: row.transform, value: row.value, sources: row.sources, rationale: row.rationale, text: row.text,
  }));
}

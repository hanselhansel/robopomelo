import { buildBindingsReport, buildUnsupportedReport } from './loss-report.js';
import { buildAssetRequirements, buildManifest } from './manifest.js';
import { jsonMember, textMember, validateMemberPaths, type ExportMember } from './members.js';
import { planIsaacExport, type IsaacExportInput, type IsaacExportPlan } from './plan.js';
import { README_MD } from './readme.js';
import { buildScenario } from './scenario.js';
import { RUN_PY } from './templates.js';
import { renderUsda } from './usd.js';
/** Deterministic Isaac Sim export: identical input yields byte-identical members.
 * The manifest is computed last so its per-file hashes are exact. Nothing is
 * produced when a runnable bundle is required but the mapping is incomplete. */
export function buildIsaacExport(input: IsaacExportInput): { plan: IsaacExportPlan; members: ExportMember[] } {
  const plan = planIsaacExport(input);
  const members: ExportMember[] = [
    textMember('isaac/scene.usda', 'model/vnd.usda', renderUsda(plan)),
    jsonMember('isaac/scenario.json', buildScenario(plan)),
    jsonMember('isaac/asset-requirements.json', buildAssetRequirements(plan)),
    jsonMember('isaac/bindings.json', buildBindingsReport(plan)),
    jsonMember('isaac/unsupported.json', buildUnsupportedReport(plan)),
    textMember('isaac/run.py', 'text/x-python', RUN_PY),
    textMember('isaac/readme.md', 'text/markdown', README_MD),
  ];
  members.push(jsonMember('isaac/manifest.json', buildManifest(plan, members)));
  members.sort((a, b) => (a.path < b.path ? -1 : 1));
  validateMemberPaths(members);
  return { plan, members };
}
export { IsaacExportError } from './errors.js';
export { ISAAC_6_0_0_UBUNTU_2404_X86_64, robotAssetFor, type IsaacTargetProfile, type SupportedRobotAsset } from './profile.js';
export { planIsaacExport, type IsaacExportInput, type IsaacExportPlan, type IsaacExportMode, type IsaacRobot, type IsaacStation, type IsaacFloor, type IsaacSource, type IsaacRun, type UnsupportedEntry } from './plan.js';
export { renderUsda, assertSafeCustomData, primName, fmt } from './usd.js';
export { buildScenario, goalsFor, sharedIntersection, xorshift32, MAX_GOALS, CONTROLLER, THRESHOLDS, UNITS, type IsaacGoal, type SharedIntersection } from './scenario.js';
export { buildManifest, buildAssetRequirements, MANIFEST_FORMAT_VERSION, ASSET_STATEMENT } from './manifest.js';
export { buildUnsupportedReport, buildBindingsReport, REASON_CODES } from './loss-report.js';
export { validateMemberPaths, jsonMember, textMember, utf8, ROOT, type ExportMember } from './members.js';
export { RUN_PY, NO_TELEPORT_MARKER } from './templates.js';
export { README_MD } from './readme.js';

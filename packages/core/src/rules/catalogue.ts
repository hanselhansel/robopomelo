import type { Finding } from '@robopomelo/spec';
import { sha256 } from '../hash.js';
import { canonicalJson } from '../canonical.js';
export const RULE_SET_VERSION = '1.0.0';
const meanings = [
  ['001', 'Source violates the schema', 'Correct the reported source structure.'],
  ['002', 'Duplicate or malformed stable ID', 'Assign unique valid stable IDs and update their references.'],
  [
    '003',
    'Reference is missing or has the wrong target kind',
    'Link to an existing record of the permitted kind.',
  ],
  [
    '004',
    'Unsupported specification version or required capability',
    'Use a supported specification and required capability.',
  ],
  ['010', 'Project framing is incomplete', 'Supply the problem, intended outcome and scope.'],
  [
    '011',
    'Required responsibility or final approver is absent',
    'Assign a declared stakeholder and describe their responsibility.',
  ],
  [
    '012',
    'Need has no coverage or disposition',
    'Link a workflow or requirement, or explain the disposition.',
  ],
  [
    '013',
    'No need has an outcome and declared beneficiary',
    'Record a desired outcome and its stakeholder beneficiary.',
  ],
  [
    '020',
    'Intended flow is missing or incomplete',
    'Define an intended flow with load subject and endpoints.',
  ],
  [
    '021',
    'Applicable engineering challenge is unanswered',
    'Answer the prompt or explain why it does not apply.',
  ],
  [
    '022',
    'Peak or volume assumption is unresolved',
    'Resolve the volume assumption or retain it for review.',
  ],
  [
    '030',
    'KPI target is absent or uninterpretable',
    'Define a KPI target, units, subject, method and window.',
  ],
  ['031', 'KPI baseline is unknown or unverified', 'Measure the baseline or acknowledge the uncertainty.'],
  ['032', 'Quantities cannot be compared', 'Use supported compatible units and the same measured subject.'],
  [
    '040',
    'Requirement rationale, coverage or verification disposition is incomplete',
    'Supply rationale, coverage and a test link or verification disposition.',
  ],
  ['041', 'Required review obligation remains unresolved', 'Resolve the declared obligation before review.'],
  [
    '042',
    'No interpretable AMR capability requirement exists',
    'Record at least one required AMR capability.',
  ],
  [
    '050',
    'Acceptance plan lacks a measurable criterion or procedure',
    'Supply a typed criterion, procedure and measurement method.',
  ],
  [
    '051',
    'Acceptance plan lacks a subject, evidence requirement or approver',
    'Link a permitted subject, future evidence requirement and approver.',
  ],
  [
    '060',
    'Required planning attachment is unavailable or inconsistent',
    'Provide the declared attachment with matching content hash.',
  ],
  [
    '061',
    'Planning support cannot be inspected locally',
    'Provide local support or acknowledge the inspection limit.',
  ],
  [
    '062',
    'Required verification support is missing',
    'Link available hash-matched planning evidence for this claim.',
  ],
  [
    '070',
    'Open issue lacks statement, owner or next action',
    'State the issue and assign an owner and next action.',
  ],
  [
    '071',
    'Owned open issue remains unresolved',
    'Complete the recorded next action or acknowledge the open issue.',
  ],
  [
    '080',
    'Current review decision is no longer valid',
    'Review the current content and record a new decision.',
  ],
  [
    '081',
    'Review provenance or decision scope is incomplete',
    'Supply the attributed actor, decision, scope and provenance.',
  ],
  [
    '090',
    'Extension semantics are not evaluated',
    'Review the preserved extension data and its implications.',
  ],
] as const;
const warnings = new Set(['012', '021', '022', '031', '040', '061', '071', '080', '090']);
const waivable = new Set(['031', '061', '090']);
export const catalogue = Object.freeze(
  meanings.map(([suffix, message, nextAction]) =>
    Object.freeze({
      id: `RP-${suffix}`,
      version: RULE_SET_VERSION,
      severity: warnings.has(suffix) ? ('warning' as const) : ('blocker' as const),
      waivable: waivable.has(suffix),
      message,
      nextAction,
    }),
  ),
);
export type Emit = (ruleId: string, recordIds: string[], paths: string[], detail?: string) => void;
export function finding(ruleId: string, recordIds: string[], paths: string[], detail?: string): Finding {
  const rule = catalogue.find((r) => r.id === ruleId);
  if (!rule) throw new Error(`Unknown rule: ${ruleId}`);
  const message = detail ? `${rule.message}: ${detail}` : rule.message;
  return {
    ruleId,
    ruleVersion: rule.version,
    severity: rule.severity,
    waivable: rule.waivable,
    recordIds,
    paths,
    message,
    nextAction: rule.nextAction,
    fingerprint: sha256(
      canonicalJson({
        ruleId,
        ruleVersion: rule.version,
        recordIds: [...recordIds].sort(),
        paths: paths.map((path) => path.replace(/\/\d+(?=\/|$)/g, '/[]')).sort(),
        detail: detail ?? null,
      }),
    ),
    status: 'active',
    acknowledged: false,
  };
}

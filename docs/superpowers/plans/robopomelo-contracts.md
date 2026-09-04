# RoboPomelo implementation integration contracts

These internal TypeScript contracts implement the approved public JSON/YAML contract. This document is input to autoplan; implementation begins only after that review. Internal package exports are not a public SDK promise.

## Project and knowledge types

Place common types in `packages/spec/src/common.ts`, authoring types in `authoring.ts`, and review/patch types in `review.ts` and `patch.ts`. No source file exceeds 400 lines.

```ts
export type Id = string;
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Extensions = Record<string, Json>;
export type Knowledge<T> = null
  | { state: 'provided' | 'unverified'; value: T; note?: string; sourceEvidenceIds?: Id[] }
  | { state: 'unknown'; note: string; ownerId?: Id; nextAction?: string }
  | { state: 'not-applicable'; reason: string };
export interface Actor {
  kind: 'human' | 'agent' | 'external'; name: string;
  onBehalfOf?: string; source?: string;
}
export interface VerificationDeclaration {
  id: Id; claimPath: string; required: boolean; evidenceIds: Id[];
  attestation: null | { actor: Actor; statement: string; recordedAt: string; source: string };
}
export interface RecordBase {
  id: Id; title: string; description: Knowledge<string>;
  ownerId: Knowledge<Id>; sourceEvidenceIds: Id[]; extensions: Extensions;
  verification?: VerificationDeclaration[];
}
export interface Quantity {
  value: string; unit: string; subject: string;
}
export interface ProjectInfo {
  id: Id; name: string; problem: Knowledge<string>; outcome: Knowledge<string>;
  scope: Knowledge<string>; exclusions: string[]; approverId: Knowledge<Id>;
}
export interface RevisionMeta {
  revisionId: Id; parentRevisionId: Id | null; createdAt: string; updatedAt: string;
}
```

Missing is absent or null. `provided` records an assertion, not independent verification. Quantity strings use bounded plain decimal syntax. IDs are globally unique, 1-128 characters from ASCII alphanumerics plus dot/colon/underscore/hyphen, with an alphanumeric first character. Labels/text accept Unicode. Reference indexing uses Map, never prototype-bearing dynamic property lookup.

```ts
export interface Stakeholder extends RecordBase { role: Knowledge<string>; responsibilities: string[] }
export interface Need extends RecordBase { beneficiaryIds: Id[]; outcome: Knowledge<string>; workflowIds: Id[]; requirementIds: Id[]; disposition: Knowledge<string> }
export interface Problem extends RecordBase { affectedStakeholderIds: Id[]; workflowIds: Id[]; observation: Knowledge<string> }
export interface FlowStep { id: Id; title: string; location: Knowledge<string>; handoffToId: Knowledge<Id> }
export interface FlowException { id: Id; trigger: Knowledge<string>; response: Knowledge<string>; ownerId: Knowledge<Id>; testIds: Id[] }
export interface Workflow extends RecordBase {
  mode: 'current' | 'intended'; loadSubject: Knowledge<string>;
  origin: Knowledge<string>; destination: Knowledge<string>; volume: Knowledge<Quantity>;
  steps: FlowStep[]; exceptions: FlowException[]; needIds: Id[]; assumptionIds: Id[];
}
export interface OpenIssue extends RecordBase {
  statement: Knowledge<string>; nextAction: Knowledge<string>;
  status: 'open' | 'resolved'; resolution: Knowledge<string>; relatedIds: Id[];
  requiredBeforeReview: boolean;
}
export interface Risk extends OpenIssue { consequence: Knowledge<string>; mitigation: Knowledge<string>; testIds: Id[] }
export interface Assumption extends OpenIssue { verificationAction: Knowledge<string> }
export interface Kpi extends RecordBase {
  definition: Knowledge<string>; baseline: Knowledge<Quantity>; target: Knowledge<Quantity>;
  measurementMethod: Knowledge<string>; measurementWindow: Knowledge<string>;
  needIds: Id[]; workflowIds: Id[];
}
export interface Requirement extends RecordBase {
  capability: Knowledge<string>; rationale: Knowledge<string>; constraints: string[];
  needIds: Id[]; workflowIds: Id[]; kpiIds: Id[]; testIds: Id[];
  verificationDisposition: Knowledge<string>;
}
export type Criterion =
  | { kind: 'numeric'; operator: 'gte' | 'lte' | 'eq' | 'between'; threshold: Quantity; upper?: Quantity }
  | { kind: 'boolean'; expected: boolean }
  | { kind: 'categorical'; expected: string[] };
export interface AcceptanceTest extends RecordBase {
  subjectIds: Id[]; preconditions: string[]; procedure: string[];
  measurementMethod: Knowledge<string>; criterion: Knowledge<Criterion>;
  evidenceRequirementIds: Id[]; assessorId: Knowledge<Id>; approverId: Knowledge<Id>;
}
export interface Evidence extends RecordBase {
  purpose: 'planning' | 'acceptance-requirement' | 'decision';
  location: { kind: 'attachment'; path: string; sha256: string; size: number }
    | { kind: 'external'; uri: string } | { kind: 'future'; description: string };
  required: boolean; relatedIds: Id[]; provenance: Knowledge<string>;
}
export interface Decision extends RecordBase {
  question: Knowledge<string>; options: string[]; rationale: Knowledge<string>;
  state: 'proposed' | 'accepted'; relatedIds: Id[]; actor: Actor | null; decidedAt: string | null;
}
export interface ChallengeAnswer extends RecordBase {
  promptId: string; promptVersion: string; answer: Knowledge<string>; relatedIds: Id[];
}
```

`challenges` uses OpenIssue. A `requiredBeforeReview` change, accepted decision, verification attestation, or review record is protected from an author-only grant. Removing a record that contains a protected review obligation also requires the appropriate authority; removal cannot bypass field-level protection.

```ts
export interface Acknowledgment {
  id: Id; findingFingerprint: string; planningHash: string;
  actor: Actor; reason: string; recordedAt: string; source: string;
}
export interface Waiver extends Acknowledgment { ruleId: string; evidenceIds: Id[] }
export interface Approval {
  id: Id; reviewerId: Id; reviewerName: string; recorder: Actor; reviewerRole: string;
  decision: 'approved' | 'rejected' | 'changes-requested'; decidedAt: string; source: string;
  sourceRevision: Id; sourceHash: string; planningHash: string; ruleSetVersion: string;
  acknowledgmentIds: Id[]; waiverIds: Id[]; evidenceIds: Id[];
}
export interface Revocation { id: Id; approvalId: Id; actor: Actor; reason: string; source: string; recordedAt: string }
export interface ApprovalInvalidation {
  id: Id; approvalId: Id; revisionId: Id; recordedAt: string;
  reason: 'planning-content-changed' | 'required-evidence-changed' | 'rule-context-changed';
}
export interface ReviewState {
  currentApprovalId: Id | null; acknowledgments: Acknowledgment[];
  waivers: Waiver[]; approvals: Approval[]; revocations: Revocation[];
  invalidations: ApprovalInvalidation[];
}
export interface Deployment {
  specVersion: '1.0.0'; project: ProjectInfo; meta: RevisionMeta;
  stakeholders: Stakeholder[]; needs: Need[]; problems: Problem[]; workflows: Workflow[];
  challenges: OpenIssue[]; risks: Risk[]; assumptions: Assumption[]; kpis: Kpi[];
  requirements: Requirement[]; acceptanceTests: AcceptanceTest[]; evidence: Evidence[];
  decisions: Decision[]; challengeAnswers: ChallengeAnswer[]; review: ReviewState;
  extensions: Extensions;
}
```

The schema defines all fields and nested variants, rejects unknown core properties and permits arbitrary JSON only under namespaced extensions. Required record containers may hold explicit missing knowledge values; semantic rules report readiness. No type index signature may replace the record-specific public contract.

## Core and application boundary

```ts
export interface Finding {
  ruleId: string; ruleVersion: string; severity: 'blocker' | 'warning';
  recordIds: Id[]; paths: string[]; message: string; nextAction: string;
  waivable: boolean; fingerprint: string; status: 'active' | 'waived'; acknowledged: boolean;
}
export interface EvidenceObservation {
  evidenceId: Id; state: 'present' | 'missing' | 'unreadable' | 'mismatch' | 'external' | 'future';
  sha256?: string; size?: number;
}
export interface ObservedEvidence extends EvidenceObservation { checkedAt: string | null }
export interface ValidationContext {
  sourceRevision: Id | null; sourceHash: string | null; toolVersion: string;
  evidence: EvidenceObservation[];
}
export interface ValidationReport {
  readiness: 'ready' | 'warnings' | 'blocked'; label: string; findings: Finding[];
  counts: { blockers: number; warnings: number; waived: number; unacknowledged: number };
  sourceRevision: Id | null; sourceHash: string | null;
  toolVersion: string; specVersion: string | null; ruleSetVersion: string;
}
export type ApprovalStatus = 'none' | 'current' | 'stale' | 'revoked' | 'rejected' | 'changes-requested';
export interface ApprovalDetails {
  status: ApprovalStatus; decisionId: Id | null;
  reasons: {code:'planning-content-changed'|'required-evidence-changed'|'rule-context-changed'|'revoked'|'validation-blocked'; recordIds:Id[]; paths:string[]}[];
}
export interface ProjectSnapshot {
  deployment: Deployment; sourceRevision: Id; sourceHash: string; planningHash: string;
  validation: ValidationReport; approvalStatus: ApprovalStatus; approvalDetails: ApprovalDetails;
  evidenceObservations: ObservedEvidence[];
}
export type Scope = 'inspect' | 'author' | 'evidence' | 'export' | 'record-decisions' | 'manage-settings';
export type Collection = 'stakeholders' | 'needs' | 'problems' | 'workflows' | 'challenges'
  | 'risks' | 'assumptions' | 'kpis' | 'requirements' | 'acceptanceTests' | 'evidence'
  | 'decisions' | 'challengeAnswers';
export type PatchOperation =
  | { op: 'add'; collection: Collection; record: Json }
  | { op: 'update'; collection: Collection; id: Id; fields: Record<string, Json> }
  | { op: 'remove'; collection: Collection; id: Id }
  | { op: 'project'; fields: Record<string, Json> };
export interface PatchEnvelope {
  formatVersion: '1.0.0'; id: Id; projectId: Id; baseRevision: Id; baseHash: string;
  actor: Actor; purpose: string; operations: PatchOperation[];
}
export interface PatchContext extends ValidationContext {
  scopes: Scope[]; nextRevision: Id; timestamp: string;
}
export interface FieldDiff { collection: string; id: Id; field: string; before: Json; after: Json }
export interface PatchEvaluation {
  deployment: Deployment; diff: FieldDiff[]; validation: ValidationReport; invalidatedApprovalIds: Id[];
}
export type ReviewInput =
  | { action: 'acknowledge'; records: Acknowledgment[] }
  | { action: 'waive'; record: Waiver }
  | { action: 'approve'; record: Approval }
  | { action: 'revoke'; record: Revocation };
export interface ReviewCommand {
  formatVersion: '1.0.0'; id: Id; projectId: Id; baseRevision: Id; baseHash: string;
  actor: Actor; purpose: string; input: ReviewInput;
}
export type Mutation = {kind:'patch'; patch:PatchEnvelope} | {kind:'review'; review:ReviewCommand};
```

Exports from `packages/core/src/index.ts`:

```ts
export function validateDeployment(input: unknown, context: ValidationContext): ValidationReport;
export function planningHash(deployment: Deployment): string;
export function approvalStatus(deployment: Deployment, report: ValidationReport): ApprovalStatus;
export function approvalDetails(deployment: Deployment, report: ValidationReport): ApprovalDetails;
export function evaluatePatch(deployment: Deployment, patch: PatchEnvelope, context: PatchContext): PatchEvaluation;
export function evaluateReview(deployment: Deployment, command: ReviewCommand, context: PatchContext): PatchEvaluation;
export function traceability(deployment: Deployment): TraceabilityRow[];
export function reviewDocument(deployment: Deployment, report: ValidationReport): ReviewDocument;
export function createBlankProject(input: {id: Id; name: string; revision: Id; timestamp: string}): Deployment;
```

TraceabilityRow is `{needId: Id; workflowIds: Id[]; kpiIds: Id[]; requirementIds: Id[]; testIds: Id[]; evidenceIds: Id[]; gapRuleIds: string[]}`. ReviewDocument is `{title:string; sourceRevision:Id; sections:ReviewSection[]}`; ReviewSection is `{id:string; title:string; records:{id:Id; title:string; fields:{label:string; value:string}[]}[]}`. It contains plain display text, not pre-escaped text or executable HTML. Renderer-specific escaping remains mandatory.

Approval status and details share one core assessor; the status function is a projection, not a second implementation. RP-080 and Snapshot details use that assessor without recursively invoking validation. A general planning-hash change may identify the project rather than invent field-level changes when the old snapshot is unavailable. Evidence-related reasons identify known evidence IDs. React formats reason codes but never derives approval validity.

ObservedEvidence.checkedAt is supplied by the filesystem observation operation, with an injected clock in tests. It is null for an external/future reference that was not inspected. It is transient observation metadata, not a change to deployment.yaml or the planning hash. The evidence endpoint and Snapshot expose it consistently; export reproducibility uses explicit frozen observations, not an implicit renderer clock.

`evaluateReview` requires record-decisions scope and validates supplied actor/source, exact reviewed content, applicability, fingerprints and reference integrity. A decision of approved requires no active blocker and all applicable warning decisions. Recording rejected or changes-requested decisions is allowed when blockers exist. Review fields never enter the ordinary author patch surface. The filesystem transaction accepts Mutation and invokes the relevant core evaluator, without independently editing review arrays.

Pure candidate evaluation has no new serialized source byte hash yet: candidate validation returns its next revision with sourceHash null. After serialization/commit, ProjectSession reruns validation using the actual committed revision/hash. Proposal metadata retains its known base identities and candidate planning hash. Generated handoff artifacts always use a committed or explicit immutable export snapshot with known source bytes.

```ts
export type FieldKind = 'text' | 'multiline' | 'knowledge-text' | 'knowledge-id'
  | 'knowledge-quantity' | 'knowledge-criterion' | 'string-list' | 'reference-list'
  | 'flow-steps' | 'flow-exceptions' | 'verification' | 'enum' | 'boolean';
export type StepId = 'frame' | 'flow' | 'success' | 'requirements' | 'acceptance';
export interface FieldDefinition {
  id: string; collection: Collection | 'project'; path: string; label: string;
  inputKind: FieldKind; help: string; step: StepId;
  referenceTarget?: Collection | Collection[]; options?: {value:string;label:string}[];
}
export interface ChallengeDefinition {
  id:string; version:string; step:StepId; prompt:string;
  appliesWhen:'always'|'has-intended-flow'|'has-kpi'|'has-requirement'|'has-acceptance-test';
  answerCollection:'challengeAnswers';
}
export interface WorkflowDefinition { id:StepId; title:string; description:string; fields:FieldDefinition[]; questions:ChallengeDefinition[] }
```

## HTTP/CLI coordination

The server owns ProjectSnapshot creation and every filesystem operation. All mutating calls carry the session CSRF token and expected source base where they modify project data. A conflict returns HTTP 409 with current source identities and the preserved submitted patch. No endpoint accepts code or executes a shell string.

Use `/api/session`, `/api/projects/open`, `/api/projects/create`, `/api/project`, `/api/workflow`, `/api/validate`, `/api/patch/check`, `/api/patch/apply`, `/api/proposals`, `/api/evidence`, `/api/history`, `/api/review`, `/api/export/preview`, `/api/export`, `/api/trust`, `/api/updates`. Add explicit action segments as needed in the runtime plan; no generic arbitrary-method dispatcher.

The server returns one versioned error envelope `{ok:false,error:{code,message,cause,action,details?}}`. DomainError codes map to documented CLI exits and HTTP statuses. Root/path details appear only in the authorized local response, never update requests or telemetry. UI keeps unsaved values on 409 or failed writes.

New approval records snapshot reviewerName and reviewerRole from the explicitly selected stakeholder and supplied decision context. Historical review references resolve against their recorded revision/context, not automatically against current authoring collections. Removed or renamed current stakeholders do not erase historical reviewer identity. A new approval must refer to the current designated project approver and existing relevant records; historical records never become current solely because content is restored.

## Minimum meaningful review and reference applicability

Schema-valid empty drafts are supported, but readiness evaluates container-level minima before record-level checks. Essential framing cannot be satisfied by Unknown, Not applicable, blank strings or placeholder nulls. One explicit need, intended flow, KPI, interpretable AMR requirement and acceptance test are required for a reviewable package. Other gaps remain governed by their specific rules, allowing owned open issues and unverified baseline evidence to remain visible.

| Rule | Explicit applicability |
| --- | --- |
| RP-010 | Always: project problem, outcome and scope must have nonempty supplied text |
| RP-011 | Always: project approver must resolve to a declared stakeholder; referenced required responsibility/approver fields must resolve |
| RP-012 | Each declared need without workflow/requirement coverage and without a reasoned disposition produces a warning |
| RP-013 | Always: needs must contain at least one explicit nonempty desired outcome and a declared beneficiary |
| RP-020 | Always: at least one intended flow; every intended flow needs interpretable load subject and origin/destination |
| RP-021 | Applicable engineering prompts only, using the finite condition registry; historical hidden answers remain preserved |
| RP-030 | Always: at least one KPI; each active KPI target needs interpretable quantity/subject/method/window |
| RP-040 | Each requirement needs rationale plus a test link or a nonempty explicit verification disposition; a disposition cannot claim a test ran |
| RP-042 | Always: at least one AMR requirement with an interpretable capability statement |
| RP-050 | Always: at least one acceptance test; each active test requires procedure, measurement method and typed criterion |
| RP-051 | Each test must link to a requirement, KPI or intended-flow subject, future evidence requirement and an approver |
| RP-070 | Each open review-relevant challenge/risk/assumption requires statement, owner and next action |
| RP-080 | Only the review record currently being presented as the current decision, not every historical record |

The two new initial IDs RP-013 and RP-042 close pre-publication vacuous-readiness gaps; they do not remove a prior capability or change an already published schema. All other reserved rules retain the written catalogue meaning. Test zero populated collections, only-current flows, all essential answers Not applicable, one nominal but empty requirement, and an empty acceptance plan explicitly.

Reference validation checks both existence and allowed target kind. Owner/beneficiary/approver and flow handoffToId refer to stakeholders; test subjects refer to requirements/KPIs/intended flows; evidenceRequirementIds refer to acceptance-requirement evidence. Current authoring references are not validated by finding a similarly named historical object.

## History restore transformation

Restore derives an authoring-state candidate from the selected immutable snapshot and evaluates its full diff against the current source. Preserve the current append-only review records, all revocations and current-approval selection. Never copy a historical review selection into current state. Reevaluate validity after restoration; a revoked approval remains revoked even if its old planning hash becomes equal again.

Restoration does not bypass field-level permissions. If its full diff removes or changes a protected risk obligation, accepted decision or another protected field, author-only restore is denied. An explicitly authorized decision-recording operation may resolve that difference with supplied provenance; it cannot erase historical decisions/revocations. Test restoration across revocation, rejection, changes-requested, a new protected risk obligation and missing historical evidence.

Terminal proposal application supports `patch apply --proposal <id>` as an alternative to a patch input file. It rechecks the immutable stored proposal digest and source base under the same transaction lock; a proposal filename is not an authorization. `--no-browser` prints a clearly labeled one-time bootstrap URL only for an explicit launch request; persisted logs/reports redact its fragment secret. JSON launch output that supplies a usable bootstrap URL is sensitive local output and must never be copied into public diagnostics.

## Dependency choices and verification

Use a maintained JSON Schema 2020 validator, YAML document AST parser, a small pure SHA-256 implementation, and exact decimal/rational math. Prefer the standard library for IDs, timestamps, safe object operations, HTTP and filesystem adapters. No package supplies permission decisions or business semantics.

Locked package versions are selected using registry metadata at bootstrap and tested with Node 22/24. Dependencies that execute install hooks or require undeclared native build tools need explicit assessment before they become runtime requirements.

## Final engineering corrections

Approval invalidations are append-only deterministic core bookkeeping, never human revocations or fabricated human decisions. On an authorized mutation/reconciliation, if the selected approval loses validity due to material planning content, required evidence or rule context, append an invalidation bound to the new revision and injected timestamp. Its existence permanently makes that approval historical, even if content later returns to its old hash. Preserve invalidations during restore, export and import. Only a newly supplied approval can become current. Read-only validate/show/evidence observations do not mutate YAML; they report current observed invalidity, and never claim to detect unobserved between-session file changes. The next authorized source mutation preserves any observed invalidity as an invalidation. Tests cover X→Y→X, restore, reopen and export/import without history.

Approval replacement ordering: verify the supplied base and reviewed planning/source identities, form a candidate with the new review record/current selection, compute semantic findings against that candidate, then enforce its applicable warnings and blockers. Old RP-080 is historical and does not demand acknowledgment to replace itself. Unrelated warnings still require valid acknowledgments. The pure assessor never recursively calls validateDeployment. A failed candidate never changes the original review state.

Verification declarations attach to existing planning records, not new test-result entities. claimPath is one known field on that record that carries the planning assertion; arbitrary object traversal and references to review/verification metadata are rejected. Evidence IDs must reference planning-purpose support (decision-only/future acceptance evidence is insufficient). RP-062 applies when required=true and the support list is empty, has invalid targets or lacks locally present matching support for its declared claim; external-only support cannot satisfy a mandatory local verification obligation. An attestation is attributed supplied text, not RoboPomelo's verification or an executed acceptance test. Setting/changing/removing an attestation, changing a required obligation or removing its enclosing record requires record-decisions scope. Author-only patches may add optional support declarations with attestation=null; knowledge state alone never asserts verification. Required declaration and attestation fields appear in record advanced editors and terminal equivalents. Fixtures distinguish ordinary provided/unverified claims, optional evidence, required support, missing support and prohibited author-only attestations. Nested declaration IDs join the global stable-ID index.

Receipt contract is project-bound and read-authorized:

```ts
export type MutationReceipt =
  | {status:'pending'; mutationId:Id; digest:string}
  | {status:'proposed'; mutationId:Id; digest:string; proposalId:Id; supersedes:Id|null}
  | {status:'committed'; mutationId:Id; digest:string; sourceRevision:Id; sourceHash:string}
  | {status:'not-found'; mutationId:Id; digest:string}
  | {status:'indeterminate'; mutationId:Id; digest:string; reason:string};
```

ProjectSession.mutationStatus(id,digest) reads validated journal/proposal/history receipts; a matching ID with another digest is conflict, not success. Indeterminate recovery never permits blind resubmission. HTTP GET /api/changes/:id with digest query requires inspect authority and current project epoch. CLI show --change <id> --digest <sha256> exposes the same lookup. A not-found result may permit replay of the identical still-base-valid input/key; the normal lock/digest/idempotency checks arbitrate any race. Committed receipt readback loads its actual immutable revision, not the newest source by assumption. Evidence upload assigns the ID and metadata/selected-file digest before transfer, verifies size/hash while streaming on the server and uses the same receipt protocol; an interrupted pre-journal transfer can be retried only with the identical selected bytes and key.

## Declared Skill patch boundary

Before the first public contract release, `PatchEnvelope` adds optional `capabilityId: string`. General browser and manually authored patches may omit it. Every Skill-produced patch must declare its registered Skill ID. Core requires the declaration to resolve to an available stable Skill supporting the deployment specification, then checks every operation against that registry entry's `fieldsWritten`. Add/remove operations require `collection.*`; updates and project operations require the specific declared field or its collection wildcard. Unsupported declarations fail with `UNSUPPORTED_CAPABILITY`; writes outside the declared set fail with `FIELD_NOT_ALLOWED`. Existing actor, scope, evidence and protected decision checks still apply independently. This declaration enforces the Skill contract and does not authenticate which host produced a patch or authorize review commands. Internal restoration retains its separate request shape without a capability declaration.

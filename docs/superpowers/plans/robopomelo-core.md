# RoboPomelo specification and deterministic core implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Do not begin implementation before autoplan completes. Use the shared integration contracts and preserve every approved v1 capability.

**Goal:** Implement the language-neutral contract and the deterministic rules used by every interface.

**Architecture:** Versioned schemas and declarative workflow data feed pure record validation, exact quantity comparison, hashing, patch evaluation, traceability and readable document construction. Side effects remain in filesystem/server packages.

**Tech Stack:** TypeScript, JSON Schema 2020-12 validator, pure SHA-256, exact decimal/rational values, Vitest; npm workspaces and bundled delivery.

## Dependencies and source map

Read [integration contracts](robopomelo-contracts.md), the approved [rule catalogue](../specs/robopomelo/specification-and-validation.md), and the [master plan](2026-09-05-robopomelo-v1.md).

| Task | Create | Verification file |
| --- | --- | --- |
| 1 | `packages/spec/src/common.ts`, `authoring.ts`, `review.ts`, `patch.ts`, `index.ts`; `packages/spec/schemas/deployment-1.0.0.schema.json`, `patch-1.0.0.schema.json` and local definition files | `packages/spec/test/schema.test.ts` |
| 2 | `packages/spec/src/units.ts`, `capabilities.ts`, `workflow.ts`, `questions.ts` | `packages/spec/test/registries.test.ts` |
| 3 | `packages/core/src/knowledge.ts`, `references.ts`, `quantities.ts`, `canonical.ts`, `hash.ts`, `errors.ts` | `packages/core/test/primitives.test.ts` |
| 4 | `packages/core/src/rules/catalogue.ts`, `structure.ts`, `framing.ts`, `flows.ts`, `metrics.ts`, `acceptance.ts`, `evidence.ts`, `issues.ts`; `validation.ts` | `packages/core/test/rules.test.ts` |
| 5 | `packages/core/src/reviews.ts`, `review-validity.ts`, `permissions.ts`, `patches.ts`, `diff.ts` | `packages/core/test/reviews.test.ts`, `patches.test.ts` |
| 6 | `packages/core/src/traceability.ts`, `review-document.ts`, `factory.ts`, `index.ts`; `examples/inbound-pallet/deployment.yaml` | `packages/core/test/example.test.ts`, `documents.test.ts` |

## Task 1: typed contract and closed schemas

- [ ] Create failing tests that schema permits a blank draft, rejects an unknown core property, permits a namespaced extension, distinguishes null/zero/false, and rejects malformed variants.
- [ ] Run `npm run test -- --run packages/spec/test/schema.test.ts`; expect missing schema/module failure before implementation.
- [ ] Implement the complete types from the integration-contract document and matching closed JSON Schemas, with common `$defs` and variant `oneOf` branches. Root record containers are required; missing knowledge remains null/absent only where declared.
- [ ] Test a TypeScript fixture with `satisfies Deployment` against the actual schema. Validate JSON Schema itself. Reference resolution is local and offline.
- [ ] Run the focused tests and typecheck. Commit the passing contract and tests together.

Required fixture test:

```ts
it('keeps unknown distinct from an asserted zero', () => {
  const unknown = {...blank, kpis: [kpi({baseline: {state:'unknown', note:'Not measured'}})]};
  const zero = {...blank, kpis: [kpi({baseline: {state:'provided', value:{value:'0',unit:'count/h',subject:'pallet'}}})]};
  expect(checkSchema(unknown)).toEqual([]);
  expect(checkSchema(zero)).toEqual([]);
  expect(unknown.kpis[0].baseline).not.toEqual(zero.kpis[0].baseline);
});
```

`blank` and `kpi(overrides)` live in `packages/spec/test/fixtures.ts`. They instantiate every required property from the contract; factories create data, not conditional validation behavior. `checkSchema` is the schema-test wrapper over the selected validator returning errors.

## Task 2: registries and five-step questions

- [ ] Write failing registry tests for unique IDs, valid supported ranges, all six Skills, all five workflow steps and unit dimensions/subjects.
- [ ] Implement `units.ts` as frozen unit descriptors with exact integer numerator/denominator factors. Implement capability stage/range descriptors without automatic activation.
- [ ] Implement field definitions `{id,collection,path,label,inputKind,help,step,referenceTarget?}` and challenge definitions `{id,version,step,prompt,appliesWhen,answerCollection}`. Condition keys are a finite declarative enum evaluated by core, never JavaScript strings from project data.
- [ ] Include every challenge category from the spec, including occupied destination, failed pickup/damaged load, peak periods, measurement/charging windows, site inputs and recovery acceptance.
- [ ] Verify every referenced collection/path exists in the contract and each prompt has a visible unknown/not-applicable path. Commit after focused checks pass.

## Task 3: pure primitives

- [ ] Write failing tests for references to nonexistent IDs, duplicate nested step IDs, exact unit equivalence, incompatible counted subjects and stable hashes across formatting/order-only changes.
- [ ] Implement `hasValue(k)` as an explicit provided/unverified-state guard. Never use truthiness to determine whether zero or false is missing.
- [ ] Implement `decimalToFraction(value)` by regex validation and BigInt digits/scale. Normalize signs/trailing zeros and compare quantities by cross multiplication of exact unit factors. Reject unsupported dimensions/subjects.
- [ ] Implement canonical object-key ordering and ID-collection sorting only for known unordered collections. Preserve flow-step order and all extension-array order. Build a planning projection excluding revision bookkeeping, presentation and review records/decision-only evidence.
- [ ] Hash UTF-8 canonical bytes with the selected pure SHA-256 implementation. Core imports no Node filesystem/network modules.
- [ ] Run focused primitive tests and commit.

```ts
it('compares inches and feet exactly without conflating load subjects', () => {
  expect(compareQuantities({value:'12',unit:'in',subject:'load-length'},
    {value:'1',unit:'ft',subject:'load-length'})).toBe(0);
  expect(() => compareQuantities({value:'30',unit:'count/h',subject:'pallet'},
    {value:'30',unit:'count/h',subject:'tote'})).toThrow('incompatible');
});
it('excludes review bookkeeping but retains ordered flow meaning', () => {
  expect(planningHash(withNewRevision(complete))).toBe(planningHash(complete));
  expect(planningHash(withReversedFlowSteps(complete))).not.toBe(planningHash(complete));
});
```

`compareQuantities` is defined in `quantities.ts`. `withNewRevision` changes only meta revision/timestamps; `withReversedFlowSteps` clones a complete fixture and reverses its intended workflow steps. They live in `packages/core/test/fixtures.ts`.

## Task 4: all 27 RP rules and readiness

- [ ] Create table-driven red cases for each reserved RP rule plus an applicability counterexample. Keep the rule fixture transformation separate from implementation code.
- [ ] Implement each rule in its owning module. Catalogue entries define stable meaning, severity, waiver eligibility and revision. Validators emit record/field paths, explanation and corrective action.
- [ ] `validateDeployment` first safely rejects malformed/unsupported structures, then builds one reference index and evaluates applicable rules. Evidence observations are injected; no rule reads files.
- [ ] Apply valid scoped waivers, calculate active counts and choose blocked/warnings/ready by precedence. Warnings require acknowledgment for approval, not for saving a draft.
- [ ] Test that future acceptance evidence with no file does not produce RP-060, an external reference is not misclassified as an attachment, and a reference-owning issue cannot clear an unrelated blocker.
- [ ] Test the minimum-review table in the integration contracts: a framed but otherwise empty project, only-current flows, absent KPIs/requirements/tests and essential not-applicable answers remain blocked. Require a designated project approver and validate reference target kinds.
- [ ] Run all rule and schema tests. Commit when every rule has a positive and counterexample case.

```ts
it('separates future acceptance evidence from missing required planning evidence', () => {
  const future = validateDeployment(withFutureEvidence(complete), context([]));
  expect(future.findings.some(f => f.ruleId === 'RP-060')).toBe(false);
  const missing = validateDeployment(withRequiredPlanningAttachment(complete),
    context([{evidenceId:'evidence-baseline',state:'missing'}]));
  expect(missing.readiness).toBe('blocked');
  expect(missing.findings.find(f => f.ruleId === 'RP-060')?.waivable).toBe(false);
});
```

The fixture helpers above create the corresponding Evidence variant and update subject references. `context(observations)` fills explicit source metadata/tool version and observations.

## Task 5: patches, protected decisions and approval validity

- [ ] Write failing tests for stale base, missing author scope, unknown fields, dangling references, multi-record atomic add, protected decision-field updates/removals and unchanged original object after rejection.
- [ ] Implement an operation allowlist keyed by collection and field. Use Map lookup and own-property data copying; reject prototype-affecting paths. Apply to a structured clone, then validate structure/reference integrity before returning the candidate.
- [ ] Allow schema-valid incomplete candidates to return success with blocked readiness. Do not return a persisted revision from this pure function; the filesystem layer commits the evaluated candidate.
- [ ] Implement evaluateReview using ReviewCommand/ReviewInput separately from ordinary author patches, requiring exact reviewed hashes, supplied actor/source, applicable warning acknowledgments and valid waivers. Approved decisions are gated; rejected or changes-requested records can be recorded while blockers exist. An actor label is not authentication proof.
- [ ] Compute current approval validity only for the current selection. Historical records remain visible without permanent RP-080 warnings. Adding decision-only evidence or an approval record does not invalidate its own planning hash.
- [ ] Verify a material authored change invalidates current approval, an unsupported waiver is rejected, and a protected risk obligation cannot be removed under author scope. Commit after focused checks pass.

```ts
it('rejects stale and privileged patches without mutating the input', () => {
  const before = structuredClone(complete);
  expect(() => evaluatePatch(complete, stalePatch, patchContext(['author']))).toThrow('stale');
  expect(() => evaluatePatch(complete, acceptedDecisionPatch, patchContext(['author']))).toThrow('scope');
  expect(complete).toEqual(before);
});
it('accepts an incomplete draft without labeling it ready', () => {
  const result = evaluatePatch(complete, clearOutcomePatch, patchContext(['author']));
  expect(result.deployment.project.outcome).toBeNull();
  expect(result.validation.readiness).toBe('blocked');
});
```

Fixture patch envelopes carry the complete project's actual base identifiers; stalePatch changes only baseHash. acceptedDecisionPatch proposes `state: accepted` with record provenance. clearOutcomePatch explicitly sets project outcome to null. `patchContext(scopes)` injects next revision/time plus observations.

## Task 6: reference example, traceability and review document

- [ ] Write a fixture describing fictional inbound pallet transport with current/intended flows, operator/integrator responsibilities, explicit assumptions and measurable acceptance plans. Do not invent empirical evidence or mark hypothetical performance as achieved.
- [ ] Add a blank-project factory that receives IDs/time as arguments; all unknown facts remain null or explicitly unknown.
- [ ] Implement traceability by traversing stable reference indexes. Report missing coverage through rule IDs; never imply that an unlinked test verifies a requirement.
- [ ] Implement reviewDocument as ordered sections of plain display data: summary, needs/problems, flows, KPIs, requirements, challenges/risks/assumptions, tests/evidence, decisions, readiness and open actions.
- [ ] Test all links reach the expected fictional entities and all unknown/unverified labels survive document generation. Assert no physical-safety/performance certification language is emitted.
- [ ] Run schema, core, fixture and document tests; commit the complete deterministic core and export surface.

## Review and integration gate

- [ ] Run typecheck, focused coverage and all core tests under both supported Node lines in CI.
- [ ] Check every spec requirement maps to a test or a documented runtime/interface integration test.
- [ ] Integrate against the runtime/frontend plans only after their API signatures match this contract.
- [ ] Include unresolved concerns in autoplan's failure-mode registry. Do not resolve architecture/security ambiguity by silently dropping scope.

## Final engineering regression requirements

- [ ] Persist deterministic ApprovalInvalidation records and prevent X→Y→X/restore/reopen/export-import from reactivating an old invalidated approval. No author input may erase or directly append protected bookkeeping.
- [ ] Gate replacement approval against the candidate current selection; exclude historical RP-080 while retaining unrelated warning gates, with no recursive validation.
- [ ] Implement typed per-record verification declarations, field-kind/reference applicability, protected obligation/attestation transitions and RP-062 required-support semantics from the integration contract. Keep acceptance execution/results excluded.
- [ ] Treat ReviewDocument values as plain text; one escaping layer per output format. Test ampersands, angle brackets, Markdown and executable URI data without double encoding or active content.

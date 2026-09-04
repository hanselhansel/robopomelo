# Specification, validation, and approval contracts

Part of the [RoboPomelo v1 design](../2026-09-05-robopomelo-design.md). Implementation authorized by Hansel on 2026-09-05; changes remain subject to the recorded execution/release gates.

## Contract ownership

JSON Schema defines accepted structure. YAML is the normal authored representation. TypeScript types and form metadata must remain checked against that contract. Domain validation adds cross-record, measurement, permission, and review-state rules that JSON Schema alone cannot express.

Initial stable specification target: `specVersion: 1.0.0`. Freeze that contract before publishing the first release candidate. Any subsequently published contract change receives an appropriate new specification version. Package version and specification version are independent, even when their initial stable numbers coincide.

Use JSON Schema Draft 2020-12, with a bundled local schema and no network reference resolution. Parser/schema-library versions are pinned in the implementation plan and lockfile. YAML is parsed as data, with duplicate keys, custom executable tags, merge keys and aliases rejected. Preserve unknown extension data and ordinary comments where edits permit; a mutation must not silently discard comments or extensions.

## Record inventory

The root contains project identity, `specVersion`, revision metadata, record collections, and namespaced extensions. IDs are opaque, immutable strings unique across the project. Labels are editable. References use IDs, never array offsets or display labels.

| Collection | Required meaning and relationships |
| --- | --- |
| Stakeholders | Name/role, responsibility, review participation; no contact details required |
| Needs | Beneficiary, desired outcome, rationale/source, coverage by flows or requirements |
| Problems | Current undesired condition, affected people/flow, observation or unverified claim |
| Workflows | Current/intended designation, load unit, origin/destination labels, steps, handoffs, volume assumptions, exceptions |
| Challenges | Constraint/dependency or unresolved design question, owner, next action, linked records |
| Risks | Potential event, consequence, owner, proposed treatment, linked assumptions/requirements/tests, review disposition |
| Assumptions | Explicit statement, knowledge state, source, owner, verification action, affected records |
| KPIs | Definition, baseline, target, units, measurement method/window, source, owner, linked needs/flows |
| Requirements | Vendor-neutral capability, rationale, constraints, verification linkage, related needs/flows/KPIs |
| Acceptance tests | Subject IDs, preconditions, procedure, measurement, pass criterion, evidence requirements, responsible assessor/approver |
| Evidence | Planning or future-acceptance purpose, copied attachment or external reference, expected hash where local, provenance and linked claims/tests |
| Decisions | Question, considered options, rationale, proposed/accepted state, actor and source, affected records |
| Review records | Acknowledgments, permitted waivers, operator decisions and revocations tied to reviewed content |
| Challenge answers | Prompt/version ID, linked record IDs, knowledge state, answer or applicability explanation |

Workflow locations are named conceptual endpoints in v1. They are not a geometric layout or navigation graph. Future geometry is an explicit versioned extension.

Accepted decisions, risk-review obligations, verification attestations and review records are protected from ordinary agent authoring grants. Agents can propose decisions and mitigations. Recording an accepted human decision requires explicit decision-recording authority and provenance.

## Knowledge states

Each information-bearing field or record uses a consistent tagged representation where needed:

| State | Meaning |
| --- | --- |
| Missing | No answer has been supplied; represented by absent/null information according to schema, not an invented zero |
| Unknown | The question was considered and the answer is not known; include an owner/next action where resolution matters |
| Unverified | A candidate value or claim exists but has not been established; preserve source and verification action |
| Provided | A value or statement has been supplied; provenance describes who asserted it and any supporting evidence |
| Not applicable | Explicitly excluded for a stated reason; retain the reason in review outputs |

`Provided` does not mean independently verified by RoboPomelo. Any verification is an attributed claim supported by referenced evidence. The presence of a file proves only file availability and hash integrity, not the truth of its contents.

False, zero, and empty collections are not automatically missing. Schema semantics decide when each is a meaningful value. The application never replaces unknown numeric values with zero.

## Measurements and acceptance criteria

Quantities contain a value, unit identifier, measured subject, method, window, and knowledge/provenance information where appropriate. Use canonical decimal strings for quantities that need exact comparison; do not rely on floating-point equality for acceptance thresholds.

The initial unit registry includes `mm`, `cm`, `m`, `in`, `ft`; `g`, `kg`, `lb`; `ms`, `s`, `min`, `h`; `count`, `count/min`, `count/h`; `ratio`, `%`; and `m/s`, `ft/s`. Count/rate quantities also identify their counted subject. Display labels such as pallets/hour render from the unit and subject, not an ambiguous free-text conversion.

Use exact decimal/rational conversion factors: an inch is 0.0254 m, a foot is 0.3048 m, a pound is 0.45359237 kg, a minute is 60 s and an hour is 3600 s. Percent converts to ratio by division by 100. Prefix and rate conversions derive from those definitions. Preserve entered display units and compare only compatible dimensions and subjects. A pallet count and a tote count are different subjects even though both use count.

Unsupported units remain visibly unsupported for comparisons. Namespaced custom units do not gain conversion behavior until explicitly registered. No model-generated conversion is accepted as a deterministic rule.

Pass criteria have an explicit kind: numeric comparison/range, Boolean outcome, or categorical expected outcome. Each specifies how an observation is obtained. A prose statement such as “works well” is insufficient. The core checks the presence and structure of a measurable criterion; it does not certify the engineering adequacy of that criterion.

V1 defines tests and future evidence requirements. It has no test-run/result entities, automatic pass/fail execution, or telemetry ingestion. A future evidence requirement may be complete even though no result file exists yet.

## Initial validation catalogue

These IDs are reserved by this written specification. They are never reused for a different meaning. Changes to rule semantics carry a rule-set version and compatibility review. Severity is catalogue-owned rather than freely editable by an agent.

| Rule | Finding | Severity | Waivable |
| --- | --- | --- | --- |
| RP-001 | YAML cannot be safely parsed or structure violates schema | Blocker | No |
| RP-002 | Duplicate or malformed stable ID | Blocker | No |
| RP-003 | A supplied reference points to a nonexistent record | Blocker | No |
| RP-004 | Unsupported specification version or required capability | Blocker | No |
| RP-010 | Project problem, intended outcome or scope is missing | Blocker | No |
| RP-011 | Required responsibility or final approver is absent | Blocker | No |
| RP-012 | A need has no coverage link or explicit disposition | Warning | No |
| RP-013 | No explicit need with an outcome and declared beneficiary is recorded | Blocker | No |
| RP-020 | No intended flow exists, or an intended flow lacks a defined load subject or origin/destination | Blocker | No |
| RP-021 | Applicable exception/handoff challenge is unanswered | Warning | No |
| RP-022 | A relevant peak/volume assumption is explicitly unresolved | Warning | No |
| RP-030 | No KPI exists, or a target cannot be interpreted with its units/method/window | Blocker | No |
| RP-031 | KPI baseline is unknown or unverified | Warning | Yes |
| RP-032 | Compared quantities have incompatible or unsupported units/subjects | Blocker | No |
| RP-040 | Requirement lacks rationale/coverage or has no verification disposition | Warning | No |
| RP-041 | A record explicitly requires resolution before review and remains unresolved | Blocker | No |
| RP-042 | No AMR requirement with an interpretable capability statement is recorded | Blocker | No |
| RP-050 | No acceptance test exists, or a test lacks a typed pass criterion, procedure or measurement method | Blocker | No |
| RP-051 | An acceptance test lacks a subject, evidence requirement or approver | Blocker | No |
| RP-060 | Declared required planning attachment is missing, unreadable or hash-mismatched | Blocker | No |
| RP-061 | Supporting planning evidence is external or unavailable for local inspection | Warning | Yes |
| RP-062 | A claim lacks its declared required verification support | Blocker | No |
| RP-070 | Review-relevant open issue lacks a statement, owner or next action | Blocker | No |
| RP-071 | Owned open issue remains unresolved without a stronger blocking rule | Warning | No |
| RP-080 | Review decision targets stale planning content, rule context or required evidence | Warning; approval invalid | No |
| RP-081 | Review record lacks actor, decision, scope, reason or required provenance | Blocker | No |
| RP-090 | Extension semantics are not evaluated by the installed core | Warning | Yes |

Applicability matters. Do not emit RP-060 for a future acceptance-evidence requirement with no result file. Do not treat every external URL as a missing required attachment. Do not require every proposed idea to have an acceptance test until its disposition makes verification necessary.

Autoplan refinement, 2026-09-05: RP-013/RP-042 and explicit empty-container cases prevent vacuous readiness. A schema-valid blank draft remains saveable/exportable but blocked. The integration-contract plan defines exact applicability and permitted dispositions; no already published schema or rule set is changed by this pre-implementation refinement.

A finding includes rule ID/version, severity, record IDs, field locations, explanation, suggested next action, waiver eligibility, acknowledgment requirements and a deterministic fingerprint. Suggestions identify what is missing; they do not fabricate the answer.

## Readiness algorithm

1. Parse and structurally validate the source. If unreadable, return blocked with precise recovery guidance; never overwrite the input automatically.
2. Evaluate applicable cross-record and semantic rules using explicit evidence observations supplied by the filesystem layer.
3. Apply only valid, scoped waivers allowed by the catalogue. Preserve waived findings in the report.
4. Any active blocker produces Specification blocked.
5. Otherwise, any active warning produces Specification ready with warnings.
6. Otherwise, produce Specification ready for review.

Unacknowledged warnings can be presented for review; they prevent recording final operator approval until acknowledged. Readiness is not an approval, engineering verdict, test result, or permission to operate physical equipment.

Acknowledgment means a person has considered a warning; the warning remains visible. A waiver is a scoped decision to set aside an explicitly waivable finding. It remains visible in the review package, with reason, supporting evidence and actor. No initial blocker in this catalogue is waivable. Future rule additions must explicitly declare eligibility and cannot grant agents blocker-waiver authority.

## Revision, hash, and approval binding

Use separate identifiers for different purposes:

- `revisionId`: unique source revision, independent of Git.
- `sourceHash`: SHA-256 of the exact UTF-8 `deployment.yaml` bytes used for generation.
- `planningHash`: SHA-256 of a versioned canonical projection of review-relevant planning content and expected supporting-evidence hashes.
- `ruleSetVersion`: identifies validation semantics used for a report or decision.

The planning projection includes needs/problems, scope, people/responsibilities, flows, quantities, requirements, assumptions, risks, acceptance plans, accepted design decisions and relevant evidence references. It excludes source revision bookkeeping, generated timestamps, presentation preferences and review records themselves. Canonicalization sorts object keys and ID-keyed collections; semantically ordered workflow steps retain their order. Changing the projection algorithm versions the contract.

Approval records include the reviewed revision/source hash for provenance, the planning hash for validity, rule-set context, reviewer, recorder, role, decision date, source of authority, supporting decision evidence, and acknowledgment/waiver IDs. Storing an approval changes source bytes but does not change the planning hash merely by adding that approval.

Recompute validity whenever planning content, observed required evidence integrity, or validation context changes. A material change makes earlier approval historical. Nonmaterial YAML formatting does not automatically invalidate planning acceptance, but source-hash provenance still shows the exact reviewed bytes. A changed validator requires revalidation; unresolved newly applicable findings prevent reusing the earlier decision as current approval.

The protected current-approval selection is review metadata and excluded from the planning hash. RP-080 applies to an approval being presented as current, not every historical approval forever. Replacing or revoking current approval preserves prior records without creating permanent warning loops. Decision-only evidence added to record approval is excluded from the planning projection; planning-support evidence remains included. If an attachment serves both purposes, its planning role controls inclusion.

Acknowledgments/waivers bind to their finding fingerprints and reviewed planning context. They do not silently transfer to substantively changed warnings. Users may acknowledge several findings in one deliberate action.

An agent may record an explicitly supplied external human decision under an appropriate grant; it must not invent a reviewer, timestamp, acknowledgment or evidence. Local actor names remain assertions rather than cryptographic identity proof.

## Structured patches

A patch envelope contains format version, proposal/change ID, project ID, base revision, base source hash, actor/provenance, intended purpose and ordered operations. Operations add records, update specified fields by stable ID, or remove records. Arbitrary filesystem writes, shell commands, permission settings, schema migration and undeclared side effects are not patch operations.

Patch processing:

1. Validate the envelope and installed-format range.
2. Confirm project identity and both expected base identifiers.
3. Resolve operation scope and protected fields against the active grant.
4. Apply operations in memory and validate resulting structure and referential integrity.
5. Compute the semantic diff, readiness findings and approval changes.
6. In review-each-change mode, return the proposal for approval; in authorized autonomous mode, proceed.
7. Commit through the filesystem transaction boundary and return the new revision.

Missing information in schema-valid drafts is allowed and may produce readiness blockers. Malformed structure, dangling supplied references, scope violations and stale bases reject the mutation. A multi-record patch may create interdependent records atomically; removing a referenced record requires explicit updates to its dependents in the same patch.

An idempotency key prevents a retry from applying the same patch twice. Reusing the key with different content is an error. Review authorizations bind to the exact patch digest/base, not a mutable filename.

## Extensions and public compatibility

Use namespaced extension keys with opaque values validated by the extension's declared schema where available. Core exporters preserve the source data and disclose unevaluated semantics. Extensions cannot inject executable code or grant capabilities.

Supported public interfaces are schema/YAML, CLI JSON contracts, patch format and Skills. The TypeScript implementation is public source without a supported embedding API in v1. A public SDK requires separate API design and tests before a compatibility promise is made.

The single capability registry records ID, description, stage, implementation availability, supported spec/CLI ranges, dependencies and activation policy. Stage is one of experimental, beta, stable, deprecated or removed. Registry presence alone never activates a capability. Deprecated data remains readable within declared compatibility ranges; removed/unsupported functionality returns an explicit result without deleting its source data.

## Preimplementation contract refinements from engineering review

The integration contract defines per-record verification declarations and attributed attestations for RP-062, without adding acceptance-test execution or result assessment. Required obligations and supplied attestations are protected from author-only changes. Core-owned append-only approval invalidations prevent a material source edit followed by a revert/restore from reactivating an old decision. Read-only observation does not write YAML or claim to detect unobserved changes. New approval gating uses the candidate selection so a historical stale-decision warning cannot demand acknowledgment of itself. These refinements close initial-schema gaps before any public specification release.

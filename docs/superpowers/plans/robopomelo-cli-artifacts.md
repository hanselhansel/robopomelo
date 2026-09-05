# RoboPomelo CLI, Terminal Wizard, and Artifact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task. Steps use checkbox (`- [ ]`) syntax. The coordinator includes this plan in autoplan and reconciles shared contracts before application implementation.

**Goal:** Deliver every approved composable command, the complete five-step terminal workflow, and reproducible review/handoff packages that preserve engineering uncertainty.

**Architecture:** Thin command and wizard adapters call the shared project session and deterministic core. Renderers consume the core's `ReviewDocument`, `ValidationReport`, and traceability output; filesystem and archive streaming are confined runtime responsibilities. Agent Skills run in the user's chosen host and call the same public CLI.

**Tech Stack:** TypeScript, Node `util.parseArgs`, `readline/promises`, streams and child-process test harnesses, Vitest, a narrowly scoped streaming ZIP library, and bundled static print CSS. Dependencies must introduce neither model calls nor installation-time native tool requirements.

---

## Authority, dependencies, and contract alignment

Read `AGENTS.md`, `robopomelo-contracts.md`, `robopomelo-core.md`, `robopomelo-runtime.md`, and `../specs/robopomelo/product-and-interfaces.md`. No new web searches are required for this subtask. Primary-source research remains owned by the coordinating agent. The approved command inventory and exit codes below are normative, not optional examples.

Dependency order:

```text
spec Deployment / Knowledge / Scope / workflow field metadata
                   |
core evaluatePatch / validateDeployment / reviewDocument / traceability
                   |
project-fs ProjectSession / ProjectSnapshot / explicit evidence selection
                   |
         CLI handlers <-> shared wizard editor
                   |
artifacts render documents -> export manifest/payload plan -> project-fs streams -> ZIP
                   |
Skills host instructions -> same CLI JSON/patch contracts, no additional engine
```

Use shared names exactly: collections include `acceptanceTests` and `challengeAnswers`; `Scope` is `inspect|author|evidence|export|record-decisions|manage-settings`; `Actor` is `{kind:'human'|'agent'|'external',name,onBehalfOf?,source?}`. Do not recreate these unions in the CLI. Evidence observations use `state`, including `external` and `future`. Source root revision is `deployment.meta.revisionId`; the session boundary exposes it as `ProjectSnapshot.sourceRevision`.

Use `evaluatePatch(deployment, patch, context)` only through session mutation composition, with `PatchEnvelope` operations keyed by collection/stable ID/fields. `validateDeployment(input, context)` supplies every readiness result. `reviewDocument(deployment, report)`, `traceability(deployment)`, `planningHash(deployment)`, and `approvalStatus(deployment, report)` stay core-owned. CLI and renderers may format those results, not recalculate them.

## Exact source and test inventory

| Files | Responsibility |
| --- | --- |
| `apps/cli/src/{main,dispatch,arguments,context,output,exit-codes,input}.ts` | Entrypoint, command registry, side-effect-free argument parsing, dependencies, envelopes, code mapping, bounded stdin/file reads |
| `apps/cli/src/commands/{open,init,show,validate,patch,history,evidence,review,export,migrate,capabilities}.ts` | Approved command handlers |
| `apps/cli/src/commands/{plan,trust,update,doctor}.ts` | Wizard entry and runtime-owned service adapters; coordinate ownership with runtime plan |
| `apps/cli/src/wizard/{run,terminal,steps,records,knowledge,quantities,criteria,references,findings,review}.ts` | Five-step controller and typed reusable editors |
| `apps/cli/src/wizard/{draft,patch,actions}.ts` | In-memory draft, explicit per-save patch envelope, save/back/exit actions |
| `packages/artifacts/src/{contracts,display,markdown,html,styles,manifest,payload,index}.ts` | Pure output types/formatting, safe templates, manifest/payload plan |
| `packages/artifacts/src/documents/{brief,acceptance,handoff}.ts` | Document-specific presentation of shared core results |
| `apps/cli/src/export/{selection,zip,stream}.ts` | Explicit evidence selection and streamed archive assembly using project-fs handles |
| `packages/artifacts/test/{knowledge,documents,manifest,determinism,html}.test.ts` | Pure output cases and golden fixtures |
| `apps/cli/test/{contracts,commands,review,paths,wizard,export,skills}.test.ts` | Actual command behavior and prompts |
| `apps/cli/test/{harness,fixtures}.ts` | Temp-project subprocess runner and exact shared schema fixtures |
| `tests/distribution/{cli-installed,wizard-pty,export-roundtrip}.test.ts` | Packaged execution and real terminal/archive checks |
| `docs/{cli,terminal-guide,export-handoff,agent-compatibility}.md` | User documentation with complete command and onboarding examples |
| `skills/<six-approved-names>/{SKILL.md,contract.json}` | Narrow declarations, orchestration guidance, public CLI examples |

Every source file remains below 400 lines. Use data-driven registration and small handlers instead of one large switch statement. Test helpers build complete `Deployment` records from the contract; they do not implement validation logic.

## CLI JSON, exit, and authorization contracts

Create `CommandName` from the registered approved leaf commands. JSON stdout consists of exactly one UTF-8 object plus newline for finite commands:

```ts
export interface CliError {
  code: string; message: string; cause: string | null; action: string;
  details?: Record<string, unknown>;
}
export interface CliEnvelope<T> {
  formatVersion: '1.0.0'; command: string; ok: boolean; data: T | null;
  findings: Finding[]; errors: CliError[];
  sourceRevision: Id | null; sourceHash: string | null;
  toolVersion: string; specVersion: string | null;
}
export interface MutationData {
  status: 'applied' | 'proposed' | 'already-applied'; changeId: Id;
  readiness: ValidationReport['readiness']; approvalStatus: ApprovalStatus;
  diff: FieldDiff[];
}
```

Use `ok:false` for a requested validation or final approval that fails its gate, even though its diagnostic report was successfully computed. A valid draft mutation or incomplete-spec export has `ok:true`, exit 0, and an explicit blocked readiness/report. `patch check` is `ok:true` when the patch is structurally/applicably valid, including a blocked resulting draft. It does not imply write approval.

| Exit | Exact meaning |
| --- | --- |
| 0 | Requested operation succeeded; warnings or blocked saved/exported drafts are carried as data |
| 1 | Unexpected internal failure with safe recovery/action guidance |
| 2 | Invalid arguments, malformed command input or non-TTY wizard invocation |
| 3 | `validate` found blockers or requested final approval cannot be recorded |
| 4 | Stale revision, stale reviewed hash or concurrent-write conflict |
| 5 | Missing scope, out-of-scope operation or revoked authorization |
| 6 | Filesystem, evidence transfer, recovery or archive I/O failure |
| 7 | Unsupported spec/runtime/capability/migration |
| 8 | Explicit update check/install/rollback network, integrity or install failure |

For `validate`, malformed YAML becomes a blocked validation result with parser locations and exit 3; malformed patch/review JSON is exit 2. An optional failed startup update does not turn a successful offline-compatible launch into exit 8. Interactive cancellation is exit 0 with `status:'cancelled'` and preserved saved progress; SIGINT while a transaction is committing waits for its safely recorded outcome before exit.

Global flags are `--project`, `--json`, `--offline`, `--runtime-version`, `--update-mode`, `--authorize`, and `--yes`, plus help/version. File inputs accept `-` for bounded stdin; `plan` never consumes stdin as JSON. JSON is not mixed with progress/spinners/ANSI; diagnostics use stderr. Long-running `open --json` emits one startup envelope then logs on stderr; shutdown does not emit a second object. A manual `--no-browser` launch needs the short-lived single-use fragment bootstrap URL printed intentionally to the initiating terminal. If requested as machine JSON, identify it explicitly as a one-time launch secret with expiry, never repeat it in diagnostics, and do not persist it as a bookmark. Ordinary API session credentials remain absent from CLI output. `plan --json` is rejected with guidance because it is an interactive workflow, not a composable command.

`--authorize` parses only shared `Scope` values. It asserts explicit per-run caller authorization, not identity or factual consent. `--yes` suppresses an already-authorized confirmation only. It cannot add scopes, waive blockers, invent review provenance, erase conflicts, or override malformed input. A remembered author grant cannot silently become `record-decisions` or `manage-settings`.

## Task 1: command registry, bounded inputs, and stable outputs

**Files:** Create the seven CLI entry modules, `apps/cli/test/contracts.test.ts`, and helper `apps/cli/test/harness.ts`.

- [ ] Build a subprocess test harness that invokes the compiled entrypoint with `spawn(process.execPath, [entry,...argv], {shell:false,env:isolatedEnv})`, captures stdout/stderr/exit, and provides a temporary machine-config root. Test finite commands against actual bytes, not only handler return values.
- [ ] Write these failing tests:

```ts
import { describe, expect, it } from 'vitest';
import { runCli, createProjectFixture } from './harness.js';

describe('public command envelope', () => {
  it('keeps JSON stdout parseable and help free of project/network writes', async () => {
    const result = await runCli(['--help'], { denyNetwork: true, readonlyConfig: true });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('RoboPomelo');
    expect(result.recordedWrites).toEqual([]);
    const bad = await runCli(['show', '--unknown', '--json']);
    expect(bad.code).toBe(2);
    expect(JSON.parse(bad.stdout)).toMatchObject({ formatVersion:'1.0.0', ok:false, command:'show' });
    expect(bad.stdout).not.toMatch(/\u001b\[/);
  });
  it('separates successful draft saving from blocked validation', async () => {
    const fixture = await createProjectFixture();
    const saved = await runCli(['patch','apply','-','--project',fixture.path,'--authorize','author','--json'], { stdin:fixture.clearOutcomePatch });
    expect(saved.code).toBe(0);
    expect(JSON.parse(saved.stdout).data).toMatchObject({ status:'applied', readiness:'blocked' });
    const checked = await runCli(['validate','--project',fixture.path,'--json']);
    expect(checked.code).toBe(3);
    expect(JSON.parse(checked.stdout).ok).toBe(false);
  });
});
```

- [ ] Run `npx vitest run apps/cli/test/contracts.test.ts`; expect missing entrypoint/modules. `createProjectFixture()` writes the schema-complete fixture through project-fs and returns a patch setting only `project.outcome:null` with actual base identities. `runCli.recordedWrites` comes from the injected test adapter or filesystem snapshot, not process guesses.
- [ ] Implement `util.parseArgs` over a declarative leaf-command table. Normalize aliases only when documented; reject unknown commands/flags and duplicate conflicting values. Parse `--help`/`--version` before project open, config creation, update checks, or browser launch. CLI error translation consumes domain/runtime error codes; do not infer severity from message text.
- [ ] `readInput` bounds file/stdin bytes to 8 MiB, accepts UTF-8 with decoder validation, rejects trailing JSON data, and delegates YAML to the shared safe codec. Command input files are explicitly supplied read capabilities; their contents cannot introduce additional host paths or shell fragments. Use no `eval`, shell interpolation, dynamic module loading or default network parsing.
- [ ] Run focused tests, typecheck and import-boundary checks. Commit `feat: define stable CLI inputs outputs and exit contracts`.

## Task 2: complete composable command handlers

**Files:** Create all command handler modules in the inventory, with runtime-owned trust/update/doctor coordination, and `apps/cli/test/{commands,paths}.test.ts`.

- [ ] Write a command matrix test for every leaf below. The harness uses actual temporary projects and reports missing command coverage as a failing test. Run `npx vitest run apps/cli/test/commands.test.ts apps/cli/test/paths.test.ts` before implementing handlers; expect unknown-command or missing-method failures.

| Leaf | Inputs and output behavior |
| --- | --- |
| `open [folder]`, no command | Start protected server, `--no-browser` suppresses browser; return base URL/version; treat any one-time fragment bootstrap URL as an explicit launch secret, never a reusable logged session credential |
| `plan [folder]` | Complete five-step TTY wizard; help is side-effect free; reject JSON and non-TTY use with exit 2 and composable-command guidance; cancellation retains committed progress |
| `init <folder>` | `--name`, optional `--example inbound-pallet`; blank/example source from shared factories; reject nonempty target, never overwrite |
| `show` | Whole readable snapshot, `--id` stable record, or `--traceability`; include source/readiness/approval status |
| `validate` | Shared report with actual evidence observations; use exit 3 for blockers |
| `patch check <file>` | Resolve current base/scopes, evaluate without applying; return predicted diff/readiness |
| `patch diff <file>` | Same evaluation formatted as before/after stable-record fields |
| `patch apply <file>` | Persist through session or return `status:'proposed'` under review-each-change mode; `--proposal <id>` selects a stored proposal bound to exact digest/base for authorized approval |
| `history list`, `show <revision>` | Read immutable records through confined session APIs; unsupported revision names rejected |
| `history restore <revision>` | Requires current `--base-revision` and `--base-hash` in unattended use; returns new revision and approval status |
| `evidence add <file>` | Explicit source file, required purpose/title/provenance and related IDs; optional `--reference <uri>` replaces positional file input; future requirements use ordinary patches |
| `evidence list`, `check` | List declared records or recomputed observations; no external URL fetch |
| `evidence remove <id>` | Base-bound validated reference removal, retain history files; dependent references must be updated explicitly |
| `review acknowledge <file>`, `waive <file>`, `approve <file>` | Separate structured decision inputs from Task 3; never synthesize consent |
| `review revoke <id>` | Explicit base, actor/source/reason input, append revocation record |
| `export` | ZIP default, `--format files`, `--include-evidence <ids>`, `--all-evidence`, or `--no-evidence`; confined output relative to `exports/` |
| `trust show`, `grant`, `revoke` | Runtime machine-local trust service; grant/revoke require `manage-settings`; copied project never inherits grant |
| `migrate` | Preview default, `--apply` requires explicit target/base/authority and runtime verified backup |
| `capabilities` | Registry stages/ranges/availability/activation; no automatic experimental activation |
| `doctor` | Read-only local diagnostics, no default network checks or destructive repair |
| `update check`, `install`, `rollback`, `configure` | Runtime service, exact version/policy semantics, explicit errors and no project uploads; configure exposes the same mode, pin and rollback-hold controls as Settings |

- [ ] Implement each handler as parse input, request session/service operation, format result. Only `init`, `open`, `plan`, and explicit `--project` select a root; reject a positional folder combined with a different `--project` root rather than choosing silently; never treat data in source/review/patch files as a filesystem selection. Relative exported paths are interpreted inside the selected project; absolute/parent-traversing outputs are rejected. A source-checkout current directory does not become a project implicitly unless it contains a valid source and the command documents that resolution.
- [ ] Add adversarial cases for filenames beginning with `-` via `--`, spaces/non-ASCII, Windows drives/UNC, extension strings resembling shell syntax, stale restore, copied-project trust, rejected field references, repeated patch IDs, denied scopes, missing future evidence, unavailable current attachment and broken YAML inspection.
- [ ] Verify `patch check/diff` never writes source or history. A queued proposal is visibly different from an applied change. `show --id` does not silently match duplicate labels; IDs resolve through the core index. Optional proposals and generated filenames never choose paths from untrusted record IDs without safe allocation.
- [ ] Run command matrix, package typecheck and runtime integration tests, then commit `feat: support the complete composable planning workflow`.

## Task 3: supplied human decisions through explicit core review APIs

**Files:** Create `commands/review.ts`, `wizard/review.ts`, review input JSON Schemas under `packages/spec/schemas/`, and `apps/cli/test/review.test.ts`.

- [ ] Use the shared outer `ReviewCommand` and nested `ReviewInput` from robopomelo-contracts.md. Acknowledge payload uses `Acknowledgment` fields; waive adds allowed rule/evidence IDs; approval supplies reviewer ID/role, decision/date/source, reviewed sourceRevision/sourceHash/planningHash/ruleSetVersion and acknowledgment/waiver/evidence IDs. Recorder is separately supplied. Record IDs/time may be allocated while preparing the explicit command; externally supplied decision date is never invented from system time. Revoke carries approval ID and explicit actor/reason/recordedAt/source.
- [ ] Write tests:

```ts
it('cannot turn author scope or --yes into operator consent', async () => {
  const f = await createProjectFixture({ ready:true });
  const result = await runCli(['review','approve','-','--project',f.path,'--authorize','author','--yes','--json'], { stdin:f.suppliedApproval });
  expect(result.code).toBe(5);
  expect(await f.readSource()).toEqual(f.initialBytes);
});
it('blocks final approval on an unacknowledged warning without blocking an export', async () => {
  const f = await createProjectFixture({ unknownBaseline:true });
  const result = await runCli(['review','approve','-','--project',f.path,'--authorize','record-decisions','--json'], { stdin:f.suppliedApproval });
  expect(result.code).toBe(3);
  const exported = await runCli(['export','--project',f.path,'--no-evidence','--authorize','export','--json']);
  expect(exported.code).toBe(0);
});
```

- [ ] Run `npx vitest run apps/cli/test/review.test.ts`; expect missing decision operation support. Review operations cannot be represented by ordinary `PatchOperation`, whose collection union excludes `review`. Call the shared core `evaluateReview(deployment,command,context)` through the runtime Mutation transaction. It returns a candidate and shared report for runtime commit; no CLI-only mutation of review arrays.
- [ ] Implement only argument/recording adapters once the core interface exists. Recheck base and finding fingerprints under runtime lock. Rejected operator decisions and changes-requested decisions remain legitimate recorded outcomes, not approval successes. A blocked attempted final approval is not silently converted into a rejected operator decision. Waivers require core catalogue eligibility; no v1 blocker is waivable.
- [ ] Test missing actor/source, manufactured default decision date, stale planning hash, previously acknowledged changed finding, self-invalidating decision evidence, revoked approval, rejected operator decision, and removal of protected risk obligations. Run core review integration tests and commit `feat: record supplied review decisions through protected core operations`.

## Task 4: complete keyboard terminal wizard

**Files:** Create the 13 wizard modules, `commands/plan.ts`, `apps/cli/test/wizard.test.ts`, and `tests/distribution/wizard-pty.test.ts`.

- [ ] Create `TerminalAdapter` with `choose`, `text`, `multiline`, `write`, and `isTTY`. Production uses Node readline and numbered keyboard menus; tests inject ordered answers and capture output. It must not depend on mouse support, terminal color, a particular shell, or an external executable editor.
- [ ] Write knowledge-state round-trip tests:

```ts
it.each([
  { answer:['Missing'], expected:null },
  { answer:['Unknown','Peak volume not measured','operator-1','Measure next shift'], expected:{state:'unknown',note:'Peak volume not measured',ownerId:'operator-1',nextAction:'Measure next shift'} },
  { answer:['Unverified','0','Reported count'], expected:{state:'unverified',value:'0',note:'Reported count'} },
  { answer:['Provided','0'], expected:{state:'provided',value:'0'} },
  { answer:['Not applicable','No staffed handoff'], expected:{state:'not-applicable',reason:'No staffed handoff'} },
])('preserves $answer as Knowledge', async ({answer,expected}) => {
  const terminal = scriptedTerminal(answer);
  expect(await editKnowledge(terminal, {kind:'string'}, null)).toEqual(expected);
});
it('keeps cancelled edits and a blocked saved draft distinct', async () => {
  const f = await createProjectFixture();
  const result = await runWizard(f, ['Frame','Outcome','Missing','Save','Inspect findings','Exit']);
  expect(result.saved).toBe(true);
  expect(result.readiness).toBe('blocked');
  expect(result.output).toContain('Specification blocked');
});
```

- [ ] Run `npx vitest run apps/cli/test/wizard.test.ts`; expect missing editor/controller. `scriptedTerminal` implements the adapter without interpreting domain state. `editKnowledge` returns the shared `Knowledge<T>` variants; typed value editors provide string, Quantity, reference ID and Criterion values.
- [ ] Implement the five steps from shared `workflow.ts`/`questions.ts`. Each step offers create/edit/remove a record, related challenges/risks/assumptions, answer applicable engineering prompts, inspect readiness, back, save and exit. Display labels with IDs for duplicates. Use generic fields from validated metadata plus specialized array/reference editors; all record types and nested flow steps/exceptions are reachable. Ordinary author mode can propose decisions, but accepted decisions/protected obligations route to the explicit review authority path.
- [ ] Implement Knowledge menus with all five states. Missing is an explicit choice preserving null; Unknown asks note, optional owner and next action; Unverified preserves candidate typed value, note and evidence links; Provided preserves asserted value and provenance links; Not applicable requires a reason. Zero, false, empty strings and empty arrays use schema meaning, not truthiness. Boolean Criterion prompts include both true and false. Numeric criteria require operator, exact decimal/unit/subject, optional upper bound for between; categorical criteria allow an explicit list. No unit inference or floating-point comparison occurs in prompts.
- [ ] Reference selectors use stable IDs from the current snapshot, display readable titles, and allow returning to create a missing related stakeholder/record. One in-memory edit batch can add mutually linked records and save one atomic patch. Typed editors cannot invent IDs for nonexistent referenced records. Editing ordered flow steps preserves intentional order; moving a step is represented by the allowed nested-field update rather than array-position patch paths.
- [ ] Keep unsaved edits only in memory until Save or confirmed navigation-save. Reopening reconstructs completed fields/readiness from YAML rather than a hidden project database. On conflicts preserve the candidate, show source identities, allow returning to inspect/adjust, and offer an explicit candidate-patch export through project-fs. Never overwrite source or rebase silently. Exit with pending changes offers Save, Discard pending changes, or Continue editing; declining an edit leaves the persisted source untouched.
- [ ] Add actual subprocess non-TTY tests and real PTY smoke coverage on the supported native OS matrix. Validate Ctrl-C, EOF, terminal resize, very narrow columns, multiline text, no-color output, Unicode labels, unavailable scopes, back navigation and resumed projects. If CI PTY support requires a development-only native package, isolate it from the distributed runtime and record its CI build dependency; the product itself uses readline only.
- [ ] Run wizard, command and native PTY tests; commit `feat: guide all five planning steps through the terminal`.

## Task 5: deterministic readable documents and meaningful engineering handoff

**Files:** Create `packages/artifacts/src/` contracts/formatters/documents and `packages/artifacts/test/{knowledge,documents,html}.test.ts`.

- [ ] Define pure renderer input:

```ts
export interface ArtifactInput {
  snapshot: ProjectSnapshot; sourceText: string; document: ReviewDocument;
  traceability: TraceabilityRow[]; attachmentSelection: Id[];
  versions: { tool:string; spec:string; rules:string; artifactFormat:'1.0.0' };
}
export interface TextArtifact { path:string; mediaType:string; bytes:Uint8Array }
export interface ArtifactBundlePlan {
  documents: TextArtifact[];
  selectedAttachments: {evidenceId:Id; path:string; sha256:string; size:number}[];
  evidenceDisposition: {evidenceId:Id; disposition:'included'|'omitted'|'external'|'future'|'unavailable'; reason:string}[];
}
```

- [ ] Write tests with a schema-complete `ProjectSnapshot` from the core fixture:

```ts
it('labels blocked intent and exposes unresolved operational work', () => {
  const input = artifactFixture({ blocked:true, occupiedDestination:'unknown', owner:'operator-1' });
  const bundle = renderArtifacts(input);
  for (const name of ['deployment-brief.md','acceptance-plan.md','engineering-handoff.md','review.html']) {
    expect(textOf(bundle,name)).toContain('Specification blocked');
  }
  const handoff = textOf(bundle,'engineering-handoff.md');
  expect(handoff).toContain('Occupied destination');
  expect(handoff).toContain('operator-1');
  expect(handoff).toContain('Unknown');
  expect(handoff).toContain('not a runnable simulation');
});
it('escapes active content while preserving statements as readable data', () => {
  const bundle = renderArtifacts(artifactFixture({ projectName:'<script>alert(1)</script>' }));
  expect(textOf(bundle,'review.html')).not.toContain('<script>');
  expect(textOf(bundle,'review.html')).toContain('&lt;script&gt;');
});
```

- [ ] Run `npx vitest run packages/artifacts/test/knowledge.test.ts packages/artifacts/test/documents.test.ts packages/artifacts/test/html.test.ts`; expect missing renderers. Fixtures contain actual required schema fields and obtain readiness from core; no renderer test invents a second readiness algorithm.
- [ ] Render original exact source bytes as `deployment.yaml`; never serialize a prettier different source under the original hash. Render `deployment-brief.md` from ordered core sections and traceability with visible needs/problems/open issues, source identities, asserted approval state and findings. Render `acceptance-plan.md` with each test ID, linked subject IDs, preconditions, procedure, typed pass criterion, units/subject, measurement method, future evidence requirements and assessor/approver knowledge. Do not suggest tests ran or outcomes were achieved.
- [ ] Render `engineering-handoff.md` as a practical input inventory: movement scenarios and handoffs; exceptions and recovery behavior; targets/tests and observed conditions required; constraints/risks/assumptions; open questions with owner/next action; and asset gaps for measured geometry, robot models, sensors/controllers, task mapping and engineering configuration. Derive gaps only from explicit source content and the v1 capability boundary. Because v1 has no geometry/model schema, label those assets “Not represented in the v1 specification; obtain or identify separately”, rather than “missing at the facility.” Cite IDs that support each scenario and include questions with Unknown/Unverified/Not applicable states. No generated vendor choice, robot config, coordinates, simulator commands or inferred physics.
- [ ] Escape Markdown syntax where user data enters structure and escape HTML separately; avoid double encoding core display data by fixing the core/renderer plain-text contract. Disable raw user HTML, remote images, executable URI schemes and embedded scripts. HTML is self-contained static print-ready content with bundled CSS, no remote fonts/assets, and no required JavaScript. A4/Letter CSS handles headings, long IDs, tables and page breaks; accessible headings/table captions are semantic. Source/run version stamps and readiness appear near the beginning of every human-facing file.
- [ ] Use stable section/record ordering, canonical JSON key ordering where contract requires it, UTF-8/LF text and controlled trailing newline. Do not inject the current wall clock. Stamp source's actual revision update date as a source date, never pretend it is export time. If an explicit generation timestamp is later added, make it an explicit reproducibility input shared across every output and test. Emit `validation-report.json` from the unchanged shared report.
- [ ] Run document golden tests plus rendered browser print inspections through the frontend QA owner. Commit `feat: generate traceable planning and engineering handoff documents`.

## Task 6: explicit evidence selection, manifest, and deterministic ZIP

**Files:** Create artifact manifest/payload modules, CLI export selection/stream/ZIP modules, `packages/artifacts/test/{manifest,determinism}.test.ts`, and `apps/cli/test/export.test.ts`.

- [ ] Define manifest format `1.0.0` with source revision/hash/planningHash, tool/spec/rule/artifact versions, readiness, approvalStatus, ordered members `{path,mediaType,size,sha256}`, and every evidence record's selected/omitted/external/future/unavailable disposition. Hash every payload member including the exact YAML and validation report; exclude manifest itself from the member-hash list and say so. Never include local root paths, machine trust, updater state, runtime cache, history or recovery paths. Preserve external references as text only.
- [ ] Write export regression tests:

```ts
it('exports incomplete source with explicit omitted evidence and no private ancillary files', async () => {
  const f = await createProjectFixture({ blocked:true, attachment:true, history:true });
  const run = await runCli(['export','--project',f.path,'--no-evidence','--authorize','export','--json']);
  expect(run.code).toBe(0);
  const zip = await readExportFromEnvelope(run.stdout);
  expect(zip.paths).not.toContain('.robopomelo/history/');
  expect(zip.paths.some(path => path.includes('settings') || path.includes('trust'))).toBe(false);
  expect(zip.manifest.readiness).toBe('blocked');
  expect(zip.manifest.evidence).toContainEqual(expect.objectContaining({evidenceId:f.evidenceId,disposition:'omitted'}));
});
it('produces identical ZIP bytes for identical inputs across timezone settings', async () => {
  const utc = await exportInSubprocess({ timezone:'UTC', fixedSource:true });
  const pacific = await exportInSubprocess({ timezone:'America/Los_Angeles', fixedSource:true });
  expect(utc.bytes).toEqual(pacific.bytes);
});
```

- [ ] Run `npx vitest run packages/artifacts/test/manifest.test.ts packages/artifacts/test/determinism.test.ts apps/cli/test/export.test.ts`; expect missing manifest/ZIP.
- [ ] Default no attachments without an explicit selection. Interactive CLI previews and asks included IDs/all/none; unattended calls require `--include-evidence`, `--all-evidence`, or `--no-evidence` when attachment records exist. Reject contradictory flags. Selected unavailable/mismatched attachments fail export with exit 6 rather than silently omitting them; caller can explicitly change selection to omit them and receive a clearly disclosed package. Unselected unavailable evidence still appears in the manifest and validation findings. `--all-evidence` includes copied local attachments only, never fetches external URLs or includes future nonexistent files.
- [ ] Prefer `yazl` for streaming ZIP if its pinned version supports deterministic DOS timestamps/extra-field suppression, or an equivalently narrow maintained streaming ZIP writer. Inspect the actual library API before choosing options. Normalize sorted member order, fixed ZIP date in the allowed DOS epoch, file mode 0644, no archive comments, no host attributes, no variable extended timestamps, and fixed compression behavior. Test across time zones because passing the same UTC `Date` to a library that encodes local DOS components is insufficient. Use stored entries when compressed output differs across supported Node/zlib builds and reproducibility cannot otherwise be demonstrated; keep streamed ZIP64 support for large selected payloads.
- [ ] Source/evidence bytes come from project-fs open handles and a frozen export observation. Recompute hashes while streaming and abort on mismatch/change/size overflow. Precomputed member hashes and actual output bytes must agree. Normalize archive relative names independently of source paths, preserve clear evidence filenames, reject case collisions and unsafe names, and use stable evidence IDs to disambiguate. Enforce 2 GiB selected payload and bounded member count before and during streaming. Stream to an exclusive temporary output, then atomically replace a safely allocated final filename after success; do not leave a partial archive with a completed filename.
- [ ] `--format files` uses the same manifest and bytes, creates only managed relative members under an explicitly allocated exports directory, and does not recursively copy the project. Repeated export cannot include previous exports. Original YAML references omitted evidence may be unresolved in the recipient folder; manifest and document prominently disclose that, and opening the package recomputes readiness rather than pretending omitted files exist.
- [ ] Validate source/report hashes, selected attachment changes during export, oversized/aborted streams, archive member traversal, case collisions, omitted evidence, repeat export, unsupported source and extension preservation. Commit `feat: export reproducible review packages with explicit evidence selection`.

## Task 7: model-free Skills, orchestrator contracts, and installed-package verification

**Files:** Create six Skill directories, skill schemas/tests, four user guides, and three distribution tests listed above. Coordinate release/package files with the parent rather than duplicating them.

- [ ] Define each `contract.json` with trigger, required inputs, read/write fields, dependencies, supported spec/CLI/patch ranges, command sequence, validation, stop conditions and output contract. Standard `SKILL.md` frontmatter contains namespaced string metadata pointing to that file. Contracts cannot grant application authority. Exact names are `frame-robot-deployment`, `specify-material-flow`, `define-deployment-kpis`, `specify-amr-requirements`, `design-acceptance-plan`, and `plan-amr-deployment`.
- [ ] Write a test that checks every declared field against shared schema/workflow metadata and every referenced CLI command against the command registry. Run a deterministic fixture sequence from frame to flow to KPIs to requirements to acceptance with actual JSON CLI subprocesses. The fixture supplies facts; tests never call a model or assert real-world correctness. Replaying a stale dependent patch must exit 4, then a freshly based valid patch can continue.
- [ ] The orchestrator instructs the chosen host to inspect capabilities/source, follow dependency order, propose narrow structured patches, check/diff, apply under existing scope, read the resulting revision, and return to dependent steps when inputs change. Its write set is the union of the narrow allowed sets, not expanded authority. It cannot approve its own work, record unsupplied human decisions, change protected review obligations, install host plugins, or call models from RoboPomelo. Missing facts produce explicit unknowns and actionable questions, not fabricated values. A blocked readiness report does not force stopping unrelated authorized work.
- [ ] Document Codex, Claude, Copilot, Grok, Gemini and local/future hosts using evidence categories: actual tested invocation, official documented installation path, or ordinary-file/CLI fallback not yet tested. Do not claim native Skill integration merely because files use the common format. Bundle all six with the runtime version; copied/modified host files are not overwritten on update.
- [ ] Build and pack the actual npm artifact, install it into a temporary prefix with scripts disabled, and execute the full command smoke matrix and wizard. Assert schemas, example, browser assets, print styles and six Skill contracts are present without repository-relative imports. Run exports under outbound-network denial with updater off. Extract the package through a safe test reader and reopen its YAML with a fresh trust decision; source hashes and selected evidence match the manifest, omitted attachments yield honest findings.
- [ ] Run `npm run build`, `npm run typecheck`, `npm run check:boundaries`, `npm run check:source-lines`, `npx vitest run apps/cli/test packages/artifacts/test tests/distribution`, and the real native OS CI matrix. Expected: no missing command/Knowledge state/Skill contract, no project writes from inspection, no history/settings leaks, no unsupported readiness assertions. Commit `feat: bundle model-free planning skills and verified CLI handoff`.

## Material integration concerns for autoplan

1. The shared contract now includes evaluateReview and ReviewCommand, resolving the initial missing review-operation API. Review records remain outside ordinary author patches; integration tests must prove CLI/server use the protected evaluator.
2. The runtime plan now imports shared `Actor`, `Scope`, evidence observations and snapshot types. Keep that alignment in implementation: different scope spellings or `state` versus `status` would break authorization or evidence classification.
3. `patch apply --proposal` is a flag-level refinement needed for full terminal parity with review-each-change mode. It must bind authorization to the stored immutable proposal digest and original source base, not approve a mutable file by name.
4. Draft-save/export success and document readiness are independent. Any shared generic exit mapper that converts all blocked reports into exit 3 will break the approved workflow.
5. The source YAML is exported unchanged. Attachment omission must be explicit because opening that subset can correctly become blocked for missing evidence. Do not rewrite source references to make an export appear complete.
6. ZIP time-zone metadata and compressor differences can break golden-output guarantees despite deterministic document text. Cross-time-zone and Node-matrix byte tests are required before claiming reproducibility.

## Self-review and execution handoff

Every approved CLI leaf, every Knowledge state, all five wizard steps, protected decision recording, exact source bytes, evidence selection, artifact provenance, engineering asset gaps, deterministic archive fields and Skill boundaries map to a task and meaningful test. No pricing/payment text or simulator execution is introduced. This is a documentation-only planning deliverable; application implementation and commits belong to the parent-controlled autoplan/execution sequence.

## DX review completion requirements

- [ ] All finite commands under `--json` or non-TTY input are noninteractive. They must finish with closed stdin within the subprocess timeout. Missing scope is exit 5; a required confirmation without `--yes` is exit 2 with an exact retry command. Never consume patch/review stdin as a confirmation. `--yes` does not supply authority or reviewer provenance. Derive the every-leaf test matrix and help from the same registry, including `plan` and `update configure`; fail for undocumented leaves or missing schema links.
- [ ] `update configure` exposes existing Settings controls through the CLI: `--mode auto|notify|off`, `--pin <exact-version>`, `--clear-pin`, `--resume`. It requires manage-settings and works offline. Reject contradictory flags. Resume clears a rollback hold and restores the pre-rollback policy; it does not erase a separately configured pin. Help explains each transition.
- [ ] Add a literal quickstart transcript in README and execute its fenced commands from a fresh directory against the packed package, then the published RC and stable package. Supported Node/npm is the only prerequisite; installation needs no npm login, model account, API key or Git. Publisher authentication belongs solely in maintainer documentation. Use `npx robopomelo init demo --example inbound-pallet --authorize author --yes`, `npx robopomelo show --project demo`, `npx robopomelo validate --project demo`, and `npx robopomelo export --project demo --format files --no-evidence --authorize export --yes`. Record the fixture's expected readiness/exit code, verify returned export path and open its review.html. Package versions are explicitly pinned in candidate verification. Document `npx robopomelo demo` only if actually registered; default documented browser alternative is `npx robopomelo open demo`, terminal alternative `npx robopomelo plan demo`.
- [ ] The example must carry a visible fictional-example label in the app and generated review. Use a registered metadata field/extension preserved by schema rather than guessing from a project title. Do not claim it represents customer evidence. Time first useful export with Node already installed, separately recording prerequisite setup.
- [ ] `--version` never writes, checks network or executes cached code. Human output labels launcher, bundled runtime and selected cached runtime separately; JSON uses `launcherVersion`, `bundledRuntimeVersion`, `selectedRuntimeVersion`, `selectionReason` and `effectiveUpdatePolicy`. Startup/doctor reuse this read-only selection result. Validate against two installed cached versions and a stale missing-cache index.
- [ ] Migration recovery documentation names the backup manifest and source hash, explains inspection, copies into a new empty folder without overwriting the original, chooses a compatible previous runtime explicitly and requires fresh root trust. Test recovery after both failed and successfully committed migrations using the earlier backup and compatible runtime; compare all backed-up source/evidence hashes. Do not treat history restore as rollback of a schema migration.

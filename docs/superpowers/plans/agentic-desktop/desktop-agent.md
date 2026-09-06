# Desktop and connected discovery tasks

Prerequisite: [plan](../2026-09-07-agentic-desktop.md) and [contracts](contracts.md). All paths are repository-relative. Each task ends with its focused checks and a commit of only its listed changes; do not mix independent tasks into one unreviewed commit.

## D0. Prove adapter contracts before embedding them

Files: create `scripts/probe-provider-contracts.mjs`, `tests/providers/canary-contract.test.ts`, `docs/verification/provider-contracts.md`. No provider credential or production customer data is a fixture.

- [ ] Record installed Codex/Grok version and generated protocol capabilities from their official CLI commands. Pin the exact accepted contract; unknown versions return PROVIDER_CAPABILITY.
- [ ] Create a synthetic temporary staging directory, outside-root canary file, fake secret environment marker and local HTTP trap. Run only the adapter's proposed constrained configuration. Requests to read/write/execute/search outside its declared tools must fail without seeing the marker.
- [ ] Test authenticated model generation only through an explicitly configured test account and bounded request count. Do not make an OAuth API-bridge by reading existing user auth files.
- [ ] Record account storage behavior, disabled native tools/hooks/plugins/MCP/ambient instructions, cancellation and supported model listing. Codex readOnly full-root behavior and Grok macOS network non-enforcement must be covered by the test, not a reassuring prompt.
- [ ] Run `node scripts/probe-provider-contracts.mjs --provider codex --mode metadata` and the corresponding Grok metadata command. Expected: machine-readable capability report, with unsupported fields explicitly false. Paid/live containment mode is a separate named run, not a metadata-test substitute.
- [ ] Commit scripts, synthetic tests and the report. Do not mark G1 passed unless actual constrained execution passes. Continue unrelated desktop/core work if an adapter remains unavailable; surface any release-scope decision to Hansel.

## D1. Establish the macOS host and narrow native bridge

Files: create `apps/desktop/package.json`, `apps/desktop/src/main.ts`, `window.ts`, `preload.ts`, `native-dialogs.ts`, `native-contracts.ts`, `navigation.ts`; modify `scripts/check-boundaries.mjs`, `package.json`, `package-lock.json`; test `tests/desktop/native-bridge.test.ts`, `window-security.test.ts`.

- [ ] Query current Electron/Forge package metadata and license/security advisories. Select compatible exact stable pins; install with `--ignore-scripts`, then run only required reviewed Electron download/rebuild steps. Record the package source/hash. Do not upgrade unrelated dependencies.
- [ ] Add a failing boundary fixture proving an unknown `apps/*/src` owner cannot evade checks and that renderer code cannot import Electron/Node. Test sender spoofing, subframe IPC, stale folder-selection ID, cancelled dialog and unsafe openExternal URL before bridge implementation.
- [ ] Implement only the DesktopBridge contract: native directory/file selection returns selection IDs, while main retains bounded paths. Window config explicitly enables sandbox/context isolation and disables Node integration. Deny unrecognized permission/navigation/window requests.
- [ ] Implement strict runtime schemas for every IPC argument and response. Never expose an arbitrary channel name, file path reader, shell executor or generic callback registration to the renderer.
- [ ] Run `npx --no-install vitest run tests/desktop/native-bridge.test.ts tests/desktop/window-security.test.ts`, `npm run check:boundaries`, `npm run typecheck`. Expect all cases pass. Native dialog behavior also needs installed-app QA in R3.
- [ ] Commit the exact host, contract, test and lockfile changes.

Mandatory starting security test, with `allowedExternal` implemented in navigation.ts:

```ts
import { expect, it } from 'vitest';
import { allowedExternal } from '../../apps/desktop/src/navigation.js';
it('does not treat an OAuth-looking URL as an authorized destination', () => {
  expect(allowedExternal('https://openrouter.ai.attacker.test/auth')).toBe(false);
  expect(allowedExternal('file:///etc/passwd')).toBe(false);
  expect(allowedExternal('javascript:alert(1)')).toBe(false);
});
```

The initial policy implementation must parse URL, require HTTPS, reject credentials/fragments for auth construction, and compare exact origins against the pending provider attempt's allowlist. Do not accept suffix matching. The test above is necessary but insufficient; add valid exact-origin and callback-state cases in A1.

## D2. Extract the shared application service without rewriting transactions

Files: move `apps/cli/src/server/` and `apps/cli/src/services/` implementations into `packages/application/src/server/` and `packages/application/src/services/`; create `packages/application/package.json`, `src/index.ts`; replace old entry files with compatibility exports until call sites migrate. Create `packages/project-fs/src/index.ts` with only supported public service exports. Modify CLI imports, build aliases and boundary rules. Test `tests/runtime/application-parity.test.ts`.

- [ ] Capture an existing fictional project open/validate/patch/export sequence through current HTTP/CLI and canonical output bytes. Add parity assertions for the extracted entry point.
- [ ] Move implementations with import adjustments only. Preserve route methods, CSRF/origin checks, project epochs, mutation receipts and shutdown semantics. Desktop and CLI call the same `startApplication` and ProjectService.
- [ ] Add a desktop lifetime owner that waits for service readiness, uses the ephemeral loopback origin, and awaits service shutdown before app quit. Track child ownership so stopping one window cannot terminate an unrelated CLI session.
- [ ] Run `npx --no-install vitest run tests/runtime/application-parity.test.ts tests/security`, `npm run typecheck`, `npm run check:boundaries`, then `npm run verify:package` on the rebuilt CLI artifact. Expected: existing fixture behavior unchanged.
- [ ] Commit extraction separately from new agent/spatial behavior. No unrelated cleanup of the transaction code.

## D3. Native intake and bounded file understanding

Files: create `packages/ingestion/src/limits.ts`, `manifest.ts`, `image.ts`, `pdf.ts`; `apps/desktop/src/attachment-broker.ts`, `parser-window.ts`, `parser-preload.ts`, `parser-renderer.ts`, `preview-protocol.ts`; `apps/web/src/features/intake/Intake.tsx`, `Attachments.tsx`; modify desktop `main.ts`, `preload.ts`, `native-contracts.ts`, web `screens/Welcome.tsx`, `lib/api.ts`; create `tests/desktop/parser-isolation.test.ts`, `tests/ingestion/intake.test.ts`, `tests/browser/desktop-intake.spec.ts`. D1 defines the typed bridge; D3 owns and completes the parser MessagePort, selected-byte validation and preview protocol implementation.

- [ ] Add fixtures for PDF with text, scanned PDF, protected PDF, PNG/JPEG, incorrect extension, truncated bytes and file cancellation. Begin with max20 files, 25 MiB/file,100 MiB total,100 PDFpages and20 megapixels/image. Reject before decoding based on magic bytes, limits and declared extraction support.
- [ ] Implement local text/image previews and extraction using pinned PDF.js in an isolated parser renderer with Node disabled and no network. A Node worker/utility process by itself is not hostile-parser isolation. Disable embedded script, active content and external URL resolution. Terminate parsing on10second wall-clock or bounded page work; retain original selected file and specific failure status.
- [ ] For scanned pages, use connected vision only when the selected adapter supports it and the chosen attachment grant permits that exact content. Otherwise retain the file and ask the user for usable text/measurements. Never silently send it to another model.
- [ ] Keep intake state across native chooser cancellation, OAuth interruption and app navigation. Confirming setup moves files into the confined portable project through immutable staging; no unsaved source bytes are lost on an auth failure.
- [ ] Provide the fictional editable example without requiring a connected AI account. Native folder selection and ordinary author grant still apply; AI sending remains off until connection/grant. Use this path for the measured first-value benchmark and offline recovery.
- [ ] Test the full flow in Electron with native dialog adapters stubbed only for automation, plus actual native chooser QA later. Expected: one prompt/one question, per-file state, no remote parser requests, no private path in exported errors.
- [ ] Commit intake/parser/UI changes and documented supported formats/limits.

## D4. Permission preset and machine credential storage

Files: create `apps/desktop/src/credential-store.ts`, `connection-broker.ts`; `packages/application/src/agent-grants.ts`; `apps/web/src/features/setup/RecommendedPermissions.tsx`; test `tests/desktop/credentials.test.ts`, `tests/security/agent-grants.test.ts`.

- [ ] Write red tests for selecting-but-not-confirming a preset, old v1 grant opening a project, destination switch, revoked generation and export attempts containing credential data.
- [ ] Recommended setup atomically records the displayed root/author permissions and selected AI/research/import scopes after the user confirms. Expanding scopes cannot ride on an old author grant. Inspection preset preserves non-writing use.
- [ ] Use macOS-backed Electron safeStorage only when encryption is available. Store encrypted blobs outside project files with strict machine path checks. Return connection IDs and status, never keys. Provider subprocess credential ownership is independently checked by D0/A2.
- [ ] Run `npx --no-install vitest run tests/desktop/credentials.test.ts tests/security/agent-grants.test.ts`; expect all negative paths deny and no credential marker appears in logs, API replies or exports.
- [ ] Commit separately from provider API adapters.

## A1. OpenRouter connection, model inventory and research broker

Files: create `packages/providers/src/contracts.ts`, `openrouter/{oauth,models,propose}.ts`, `research.ts`; `packages/application/src/providers/routes.ts`; test `tests/providers/openrouter.test.ts`, `research-privacy.test.ts`.

- [ ] Write provider fixtures for PKCE/state mismatch, expired/reused callback, cancelled login, model list pagination/empty/unsupported parameters, 429, refusal, missing usage and malformed JSON. No actual tokens in snapshots.
- [ ] Implement S256 PKCE with a random attempt-scoped verifier/state, loopback callback bound to127.0.0.1, finite expiry and one-time consume. Connect through system browser. The broker stores the result in D4's store and disposes callback state/listener on every terminal path.
- [ ] List actual models and supported efforts/input kinds; distinguish connectionId from modelId. Calls have AbortSignal, response-size/token bounds and explicit cost information only when returned or calculable from current provider metadata.
- [ ] Disable automatic model/provider fallbacks outside the chosen policy. Configure serving-provider restrictions and parameter-support requirements rather than silently dropping a requested schema/effort.
- [ ] Public research accepts only the closed ResearchTopic schema and constructs reviewed generic queries. Unsupported custom queries return a preview-required result. Cite retrieved source IDs and dates; reject fabricated citations. Do not expose confidential context to model-native server search.
- [ ] Run `npx --no-install vitest run tests/providers/openrouter.test.ts tests/providers/research-privacy.test.ts`. A live one-call test through an explicitly connected test account proves actual protocol behavior separately from fixtures.
- [ ] Commit adapters, schemas, tests and the live capability record when available.

## A2. Codex and Grok account adapters

Files: create `packages/providers/src/codex/{protocol,adapter,lifecycle}.ts`, `grok/{protocol,adapter,lifecycle}.ts`, `capability-probe.ts`; `tests/providers/account-adapters.test.ts`; update `docs/agent-compatibility.md`.

- [ ] Use D0 evidence to select a current supported Codex release and generate/version its protocol types, plus the accepted Grok ACP/headless contract. Observed planning binaries are Codex 0.145.0 and Grok 1.0.13, not approved runtime pins: Codex 0.145.0 failed an actual review request because its configured gpt-6-astra needs a newer CLI. Exact runtime/hash allowlist and model compatibility require current acceptance.
- [ ] Red-test extra tools, inherited hooks/MCP/plugins, global files, unrestricted readable roots, subprocess shell escape, native web/search, unknown versions and output arriving after cancellation.
- [ ] Codex uses app-server stdio in a dedicated controlled context with explicit restricted reads; never expose thread/shellCommand. Only structured proposals or explicitly registered broker tools may affect a project. OutputSchema and interrupt must be verified for the pinned protocol.
- [ ] Grok uses a dedicated non-leader process with native tools/web/subagents disabled and bounded turns. Strict sandbox alone is insufficient on macOS. ACP cancellation/schema/model enumeration and credential storage remain acceptance probes. If enforcement cannot be demonstrated, return PROVIDER_CAPABILITY and stop that adapter's release gate; do not relabel OpenRouter's Grok access as Grok OAuth.
- [ ] Ensure app quit/cancel sends protocol cancellation, closes stdio and reaps the owned process tree within5 seconds, followed by a recorded forced termination if needed. Pending proposals are invalidated immediately, even if the provider continues computing.
- [ ] Run `npx --no-install vitest run tests/providers/account-adapters.test.ts`; perform packaged macOS canary acceptance before marking the adapters supported. Document unavailable capabilities accurately.
- [ ] Commit the tested interfaces and adapter state; scope changes require user review if a requested connection is infeasible.

## A3. Durable conversation and adaptive one-question loop

Files: create `packages/agent/src/{state,question,reducer,orchestrator,context}.ts`; `packages/project-fs/src/conversations/{store,recover}.ts`; `packages/application/src/agent/{routes,service}.ts`; test `tests/agent/discovery.test.ts`, `tests/runtime/conversation-recovery.test.ts`.

- [ ] Define closed persistent event/reply schemas from contracts.md. One question is an object or null, never an array. Events carry run/generation/sequence; user answers carry questionId and source base.
- [ ] Write tests proving an answer can resolve several subjects, a file can replace a pending question, an old question button cannot answer the new one and cancelled/stale responses do not write.

```ts
import { expect, it } from 'vitest';
import { acceptEvent, reserveTurn } from '../../packages/agent/src/state.js';
it('rejects cancelled-generation responses and exhausted work', () => {
  expect(acceptEvent({runId:'r1',generation:2}, {
    runId:'r1',generation:1,sequence:8,kind:'question',text:'obsolete'
  },7)).toBe(false);
  expect(() => reserveTurn(0)).toThrow('BUDGET_REACHED');
});
```

- [ ] Implement acceptEvent/reserveTurn exactly as contracts.md, then a closed reducer for idle/reserved/running/paused/completed/failed states. Reserve before dispatch and increment generation before cancellation. Resume on the current source rather than replaying a cancelled event.
- [ ] Persist append-only bounded conversation events and atomic compact checkpoints under the project. On crash, validate sequence/checksum and recover only the last complete event. Project switching cancels its prior active run and parks input; no cross-project event delivery.
- [ ] The context builder selects relevant validated records, cited excerpts and unresolved questions. The LLM chooses the next material subject, but validators reject references to resolved/nonexistent subjects unless explicitly revisiting a contradiction. A deterministic fixture can test sequencing; a bounded scenario rubric evaluates actual question relevance separately.
- [ ] Run `npx --no-install vitest run tests/agent/discovery.test.ts tests/runtime/conversation-recovery.test.ts`; expected all invariants pass. Commit before UI work.

## A4. Conversation and model-selection UI

Files: create `apps/web/src/features/agent/{Conversation,QuestionCard,Composer,ModelSelector,RunStatus}.tsx`, `useConversation.ts`; modify `Workspace.tsx`, navigation and styles; test `tests/browser/agent-discovery.spec.ts`.

- [ ] Add user-flow tests for duplicate model names under distinct connections; per-route effort support; attach/answer/switch; one active question; streamed progress; refusal/empty/schema errors; input surviving reconnect and cancellation.
- [ ] Implement the approved left conversation layout using existing tokens. Closed selector shows model/effort/via connection; expanded list groups by connection. Unsupported choices explain why and remain unavailable. Persist per-project choice without silently enabling fallback.
- [ ] Show one active question with choice buttons and a single accessible answer composer. Preserve complete history without letting old choices remain active. Selected scene object chips are removable and are bound to stable IDs.
- [ ] Add live regions for settled status, not every token. Pause/cancel stays reachable while streaming. Restore focus after dialogs and avoid stealing focus on progress or incoming questions.
- [ ] Run `npx --no-install playwright test tests/browser/agent-discovery.spec.ts` against the deterministic provider harness. Actual authenticated provider tests remain separately reported. Commit the coherent flow.

## A5. Proactive exploration with visible limits

Files: create `packages/agent/src/{budget,exploration}.ts`, `apps/web/src/features/agent/ExplorationBudget.tsx`; test `tests/agent/exploration-budget.test.ts`.

- [ ] Write tests for reserve-before-dispatch, repeated429, no-usage response, cancellation between variants, tool timeout, connection fallback denied and duplicate exploration request.
- [ ] Implement the proposed default limits in the root plan. Each run snapshots source/workload/objective/eligible connections and budgets. Reserve model output upper bound where supported; missing pricing means cost unavailable, not free.
- [ ] At most two local workers and three variants; do not launch another request after a limit is exhausted. In-flight provider cost is honestly marked pending/unknown until reported. The same default applies to agent-spawned subtasks; no hidden unmetered agents.
- [ ] Display planned experiments, completed/partial results and reasons for stopping. Deeper exploration starts only when the user changes the displayed limits. Ordinary operation needs no permission click per internal step.
- [ ] Run `npx --no-install vitest run tests/agent/exploration-budget.test.ts`; commit budget engine and UI together.

# Provider capability record (D0/A2)

Retrieved 2026-09-07 on the development Mac from isolated, unauthenticated installs. These are metadata observations. No account was signed in, no user auth file was read or copied, no inference request was sent and no adapter is marked supported by this record.

## OpenRouter (A1)

Fixture-driven adapter in `packages/providers`: S256 PKCE with one-time attempt consumption, `GET /api/v1/models` inventory mapping, `POST /api/v1/chat/completions` with `provider.allow_fallbacks=false` and `require_parameters=true`, closed AgentReply schema decoding, no silent model or provider fallback. 25 fixture tests. The desktop sign-in flow is implemented (`OAuthLoopbackFlow`) and exercised with a fake transport. Live acceptance (an actual sign-in and one bounded inference through a real account) has not been performed and is a named gate; fixtures are not provider acceptance.

## Codex (A2 candidate)

- Observed: `codex-cli 0.153.4` in `~/.cache/robopomelo-build/codex-0.153.4` (isolated npm install). `codex app-server generate-json-schema` produced 304 schema files (693 definitions) without any account; hashes recorded in `test-results/provider-contracts/codex-app-server-schema.json`. The app-server protocol exposes thread and turn lifecycle (`v2/ThreadStart*`, `v2/TurnStart*`, `v2/TurnInterrupt*`), approval requests (`CommandExecutionRequestApproval*`, `ApplyPatchApproval*`), dynamic tools and MCP tool calls. `codex sandbox` runs commands under seatbelt on macOS.
- Not yet demonstrated: restricted readable roots for a dedicated controlled context, refusal of thread/shellCommand exposure to the model, OutputSchema enforcement and interrupt behaviour on this exact pin, subprocess and native web-search denial, and process-tree cleanup within 5 seconds. These need real canaries with an authenticated account.
- Product state: the broker refuses `codex` connections with `PROVIDER_CAPABILITY` until the containment canaries pass. The UI does not advertise Codex support.

## Grok (A2 candidate)

- Observed: `grok 1.0.13 (5e9a58528b76) [stable]` at `~/.grok/bin/grok`. Headless mode offers `--output-format json|streaming-json` (ACP session updates), `--json-schema` constrained output, `--tools`, `--disallowed-tools`, `--disable-web-search`, `--sandbox <PROFILE>` (also `GROK_SANDBOX`), `--agents` inline subagents, and `--system-prompt-override`. Help text saved to `test-results/provider-contracts/grok-help-1.0.13.txt`.
- Not yet demonstrated: that the sandbox profile actually blocks network and filesystem access on macOS (the plan notes strict sandbox alone is insufficient), that `--disallowed-tools` cannot be overridden by the model, ACP cancellation semantics, model enumeration, and where credentials are stored (plaintext CLI auth storage must not be described as Keychain-backed).
- Product state: refused with `PROVIDER_CAPABILITY`; not advertised.

## Gate

G1 (account-adapter containment) remains open. Advertising Codex or Grok requires: an authenticated canary on the exact pinned runtime, negative tests for extra tools, inherited hooks/MCP/plugins, global files, unrestricted readable roots, subprocess escape, native web search, unknown versions and late output after cancellation, plus a packaged macOS acceptance run. OpenRouter's Grok-hosted models are not relabelled as Grok account access.

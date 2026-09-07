# Agentic desktop implementation progress

Started2026-09-07 from reviewed plan commit81ce15a, released maincafb740. Worktree `.worktrees/agentic-desktop`, branch `feat/agentic-desktop`. Deep tier: native privileges, credentials/network, public contracts, simulation and signed distribution. Product design/engineering plan approved; implementation authorized end to end.

## Current checkpoint

C1: native setup, shared service, connected adaptive discovery. D1 and D2 passed scoped spec/quality reviews. D2 extraction is61557cc, lifetime ownership49f8183, historical parity evidencef151ec1. Desktop starts its own shared loopback service and loads the bundled UI. Next is D3 native intake and D4 permission persistence. The complete checkpoint and release are not finished.

## Gates

- G0 product/engineering plan: approved by user.
- G1 account-adapter containment: pending actual pinned-runtime canary tests.
- G2 old-reader compatibility: pending actual published-v1 matrix.
- G3 performance: pending representative M4/24GiB50-robot measurements.
- G4 Isaac: user confirmed no compatible GPU host is available. Prepare local export checks first; an authorized borrowed/temporary rented target is needed for real acceptance. No spending or cloud provisioning has been authorized.
- G5 desktop signing/notarization: identity/access not established; installed-app proof required.

Research2026-09-07: Electron44.2.0 stable registry metadata (MIT, Node>=22.12); Forge7.11.2 metadata. Runtime security requirements reviewed in [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) and [sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox). Pins are not acceptance proof. No paid infrastructure or account enrollment performed by this record.

## Verification

Baseline on reviewed source: typecheck passed,44tooling tests passed,637unit tests passed with3expected platform skips across98files. Dependency audit had0vulnerabilities. Root independently built and verified the unchanged CLI package through all9installed-package checks after adding the desktop dependency.

D1 implementation verification:17desktop tests and53tooling tests passed, plus types/boundaries/source limits. Native Electron44.2.0 smoke checks the four-method bridge, no renderer require/generic invoke, blocked external requests and bounded process completion. Initial independent review found workspace-alias/network-constructor/subpath checker bypasses; regression fixes are14f76ba. A smoke hang was traced to accessing BrowserWindow.webContents after destruction, causing a native exception dialog. b36cbda fixes teardown and adds a parent watchdog with process-group/stream cleanup tests. These results await independent recheck and code-quality review.

Metadata-only provider probes generated Codex0.153.4 schemas from an isolated cache installation, and fetched430OpenRouter model records from the public inventory. No paid model inference or live adapter-containment acceptance is claimed. Local macOS reports0valid code-signing identities and an available notarytool; local development tests can proceed, but public notarized distribution remains gated.

Source changes use focused red-green tests and per-task spec/quality review. The final whole-branch review and release-owned checks remain separate and are not duplicated here.

D2 focused verification2026-09-07:104desktop/security/parity tests passed with2platform skips before the historical baseline repair, plus59tooling tests. Tests cover startup failure, quit during startup, repeated shutdown and cleanup after a disposer failure. A failing test caught the shared update route incorrectly claiming verified compatibility for a desktop development build; status now respects adapter capabilities. Actual Electron44.2.0 smokes pass isolation, bundled welcome rendering, consumed bootstrap and closed listener after both window close and app quit. Screenshot visually inspected at test-results/desktop-smoke/workspace.png. CLI rebuild passed all9installed-package checks; no publication performed. Per-task review caught missing direct application dependency declarations (fixed) and alias-only parity evidence (under repair). Full installed-desktop/agent acceptance remains pending.

Testing without owned GPU hardware: use local deterministic simulator and export-contract checks during implementation, then run the finished reference on an authorized borrowed or temporary rented GPU. Only that actual run can establish Isaac acceptance. [NVIDIA requirements](https://docs.isaacsim.omniverse.nvidia.com/latest/installation/requirements.html) and [cloud deployment](https://docs.isaacsim.omniverse.nvidia.com/latest/installation/install_cloud.html), retrieved2026-09-07. No cloud account or paid resources were provisioned.

D2 review closure: the immutable pre-extraction HTTP baseline in tests/fixtures/application-parity comes fromcf729ac0c383913454ebb9a66ce8100d2b0eb455. Two historical captures matched, and current UTC replay matches all seven decoded artifact bytes. After repair,77parity/security tests passed with2platform skips; root independently ran30desktop/parity tests plus types/boundaries/source limits. Native integration review found no actionable Critical or Important issues and independently passed10lifecycle/service tests. Whole-branch and release reviews remain future gates.

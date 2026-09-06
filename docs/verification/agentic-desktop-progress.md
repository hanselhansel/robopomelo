# Agentic desktop implementation progress

Started2026-09-07 from reviewed plan commit81ce15a, released maincafb740. Worktree `.worktrees/agentic-desktop`, branch `feat/agentic-desktop`. Deep tier: native privileges, credentials/network, public contracts, simulation and signed distribution. Product design/engineering plan approved; implementation authorized end to end.

## Current checkpoint

C1: native setup, shared service, connected adaptive discovery. D1 native host passed independent spec and quality reviews; its network smoke was strengthened in b3aab43. D2 shared application extraction is committed in61557cc. Desktop service lifetime and truthful development-update status are under integration. The complete checkpoint and release are not finished.

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

D2 focused verification2026-09-07:9desktop lifecycle/update-status tests and3application parity tests passed, as did typecheck, dependency boundaries and source limits. Tests cover startup failure, quit during startup, repeated shutdown and cleanup after a disposer failure. A failing test caught the shared update route incorrectly claiming verified compatibility for a desktop development build; status now respects adapter capabilities. These helpers are not yet wired into the desktop entry point and do not establish full installed-desktop acceptance.

Testing without owned GPU hardware: use local deterministic simulator and export-contract checks during implementation, then run the finished reference on an authorized borrowed or temporary rented GPU. Only that actual run can establish Isaac acceptance. [NVIDIA requirements](https://docs.isaacsim.omniverse.nvidia.com/latest/installation/requirements.html) and [cloud deployment](https://docs.isaacsim.omniverse.nvidia.com/latest/installation/install_cloud.html), retrieved2026-09-07. No cloud account or paid resources were provisioned.

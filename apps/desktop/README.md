# Desktop host foundation

D1 supplies the native host and four-method sandbox bridge. The frontend remains
in apps/web. D2 owns starting and stopping the shared application service. D3 owns
attachment parsing and selected-byte access. D4 owns durable permission grants.
The current main entry rejects setup confirmation and run cancellation until
those service callbacks are connected. It does not claim an operational agent.

Build with `npm run build:desktop`, then run `npm run start:desktop`.
The desktop owns the shared application service on an ephemeral loopback port,
loads the bundled apps/web UI with a one-use bootstrap link, and waits for service
cleanup on window close or app quit. No separate CLI server or origin environment
variable is required. Development builds report desktop updates unavailable;
they never invoke the standalone CLI runtime updater.

Run `npm run test:desktop-smoke` on macOS with the reviewed Electron binary
installed. The smoke opens a hidden real Electron window against a temporary
local test page and a second loopback server with permissive CORS. Main first
proves that second server is reachable. The renderer fetch must reject while
the second server receives zero requests. This verifies the session boundary
without depending on Internet availability, DNS or CORS failure. The smoke also
verifies the isolated bridge,
closes the window/listener, then explicitly exits its test process. The parent
requires the assertion marker, exit code zero and closed output streams. Its
20-second deadline is independent of the Electron event loop. It owns a detached
process group and awaits bounded cleanup (at most ten additional seconds), using
the repository's existing process cleanup helper. It does not
exercise native picker interaction, packaging,
signing or notarization. Installed-app picker QA remains R3.

A second smoke loads the actual desktop entry point and bundled UI with temporary
machine settings. It checks a rendered welcome screen, consumed bootstrap,
isolated bridge, and closed service socket after both window close and app quit.
The parent removes temporary settings after Electron exits, so Chromium cannot
race directory cleanup. The captured UI is in test-results/desktop-smoke/workspace.png.
This verifies development startup, not the unfinished agent/intake workflows.
Lifecycle semantics were checked against Electron's app and BrowserWindow API
documentation on2026-09-07.

## Dependency review, 2026-09-07

- Electron 44.2.0, MIT, requires Node >=22.12.0. Exact pin in root lockfile.
- Registry tarball: https://registry.npmjs.org/electron/-/electron-44.2.0.tgz
- Tarball SHA-1: d7d2fd50ee86e62777e348b551c450e4d4ba6014
- Tarball integrity: sha512-oK1icjhapp3xsUZycO9WZaLmd3hJnA7ieobC4mpdtO1pEN+PPGWpA3m1Mgzzuc1wzSD2Wai4zcH4yfpGJqxFMA==
- macOS arm64 zip SHA-256 from Electron's packaged checksums.json:
  f906dff5d054b1b92e5711781b13cc206fd7139ce66467503b9d0a3e6fbc9b02
- Forge CLI 7.11.2 metadata checked (MIT, Node >=16.4.0), but not installed.
  Existing esbuild builds main/preload without generator scaffolding.
- npm install --ignore-scripts added 11 packages, upgraded no existing packages,
  and npm audit reported zero vulnerabilities.
- Read node_modules/electron/install.js before running only
  `node node_modules/electron/install.js`. It downloads the pinned artifact
  through @electron/get with packaged checksums, extracts it into Electron's
  dependency directory and writes path.txt. Automatic install scripts remain
  disabled for Electron.
- Security controls checked against
  https://www.electronjs.org/docs/latest/tutorial/security on 2026-09-07.

## D1 review repair evidence

The original smoke's window-close callback accessed BrowserWindow.webContents
after destruction. A macOS process sample and the actual Electron error alert
identified the resulting uncaught exception and native modal loop. That loop
blocked the in-process timeout. The bridge now retains WebContents while alive,
and its lifecycle regression test reproduces the destroyed accessor.

The smoke emits stages, logs uncaught errors without opening Electron's default
modal, and has a separate parent watchdog. Process tests prove a blocked child
event loop is bounded, exit zero without assertion evidence fails, and a retained
descendant is terminated even after its launcher exits. A live Electron44.2.0
run reached every stage and exited zero after this repair.

The import checker catches declared workspace aliases, built-in and selected
network package subpaths, direct/global network constructors and simple assigned
aliases. It is a static architecture check, not a JavaScript sandbox. Electron's
runtime session policy enforces the renderer network boundary.

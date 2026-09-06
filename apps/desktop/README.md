# Desktop host foundation

D1 supplies the native host and four-method sandbox bridge. The frontend remains
in apps/web. D2 owns starting and stopping the shared application service. D3 owns
attachment parsing and selected-byte access. D4 owns durable permission grants.
The current main entry rejects setup confirmation and run cancellation until
those service callbacks are connected. It does not claim an operational agent.

Build with `npm run build:desktop`. To exercise the current web workflow, explicitly
start its local service, then set ROBOPOMELO_DESKTOP_UI_ORIGIN to its exact
http://127.0.0.1:<port> URL and run `npm run start:desktop`. Never put credentials
in that URL or process arguments.

Run `npm run test:desktop-smoke` on macOS with the reviewed Electron binary
installed. The smoke opens a hidden real Electron window against a temporary
local test page, verifies the isolated bridge and blocked external networking,
closes the window/listener, then explicitly exits its test process. It does not
exercise native picker interaction, full application lifecycle, packaging,
signing or notarization. Installed-app picker QA remains R3.

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

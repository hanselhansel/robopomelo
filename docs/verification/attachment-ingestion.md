# Attachment intake verification

## Current implementation

The pure preflight package detects PDF, PNG and JPEG from bytes, sanitizes display
names and checks declared/actual byte limits. PNG and JPEG dimensions are read
before decoding. A successful result explicitly says `preflightOnly: true`.
It does not prove that the complete file decodes or that its contents are safe.

Limits:20 files,25MiB per file,100MiB total,100 PDF pages after decoding and
20 million image pixels. Ten tests cover limits, malformed/truncated headers,
misleading extensions, typed-array slices, JPEG metadata traversal and filenames.

The sandbox parser component is implemented and has actual Electron smoke
coverage. The selected-file broker, preview protocol, retained intake UI and
permission persistence remain pending. Do not mark D3 complete or expose file
extraction until those integrations pass their runtime and security checks.

## PDF dependency, checked2026-09-07

PDF.js package `pdfjs-dist` is pinned to6.3.289 under the desktop workspace.
License:Apache-2.0. Engines:Node>=22.13.0 or>=24. Package scripts are empty;
installation still used `--ignore-scripts`. Registry integrity:

`sha512-ZHjSVpDa3D6izMq8/04lvkhkATUmL9px6ChPaXc1k6nU2Mrhlg1/7F0bdUqCwUjw3NsPTfPZsMDUU6ZIcRaeQw==`

The package declares optional `@napi-rs/canvas`; this installation added three
packages and upgraded no existing packages. The browser parser must not import
the Node canvas path. Dependency audit reported zero vulnerabilities.

The [official PDF.js API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html)
documents byte input, `useWorkerFetch`, `maxImageSize`, `stopAtErrors` and worker
destruction. Check these against the pinned local types/source while implementing;
the draft website may advance independently. The planned boundary uses selected
bytes, local packaged assets, a sandboxed renderer with no network/Node access,
and a10-second main-process deadline. Configuration flags alone are not evidence
that this boundary is enforced.

## Parser runtime evidence,2026-09-07

`npm run test:desktop-smoke` now includes the real parser component. It loads
selected bytes into a dedicated sandboxed renderer, returns bounded text and up
to three PNG previews, and destroys the renderer after each job. The main process
enforces the10-second maximum. An AbortSignal invalidates the job immediately.
No provider is called. Assets are served through a private session protocol from
a confined packaged root; only exact manifest-listed assets are readable.

Passing cases on Electron44.2.0:

- Text PDF, a named UniJIS-UTF16-H CMap PDF, empty/scanned-like PDF and101-page PDF.
- Malformed PDF and a synthetic password-protected PDF.
- Real PNG and JPEG decoding with normalized PNG output.
- Cancellation, short deadline, and a renderer that demonstrably entered an
  infinite loop. The timed-out renderer's actual process ID exited.
- No renderer Node or native bridge. A main-proven reachable loopback server
  received zero parser requests. File URLs, foreign parser origins and unlisted
  local resources were rejected.

The fictional PDF preview was visually inspected at
test-results/parser-smoke/pdf-preview.png. One stress run emitted Chromium macOS
task_policy_set teardown diagnostics while the busy-loop process exited; all
assertions and the parent process-cleanup checks passed. This is not a claim of
full installed-app QA or arbitrary-PDF compatibility.

The first real run caught null payloads when DOM ArrayBuffers were transferred
to MessagePortMain. Preview bytes now use structured cloning with a6MiB maximum
payload rather than a transferable-buffer list. This preserves the main-owned
MessagePort boundary. See Electron's [MessagePortMain API](https://www.electronjs.org/docs/latest/api/message-port-main)
and [reported transferable-resource limitation](https://github.com/electron/electron/issues/34905),
checked2026-09-07. Diagnostic payload logging used during synthetic debugging was
removed before commit.

Scoped spec review also caught unused packaged CMaps. A real named-CMap fixture
failed before configuring the fixed local cMapUrl and cMapPacked, then passed
after rebuilding. The source and generated fixture use no customer data.

Scoped spec and quality reviews are green after that repair. The quality reviewer
independently reran16parser/ingestion tests. Root ran43desktop/ingestion tests,
61tooling tests, typecheck, dependency/source checks and the actual desktop smoke
sequence. These component reviews do not replace the final whole-branch review
or signed installed-app acceptance.

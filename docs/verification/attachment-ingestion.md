# Attachment intake verification

## Current implementation

The pure preflight package detects PDF, PNG and JPEG from bytes, sanitizes display
names and checks declared/actual byte limits. PNG and JPEG dimensions are read
before decoding. A successful result explicitly says `preflightOnly: true`.
It does not prove that the complete file decodes or that its contents are safe.

Limits:20 files,25MiB per file,100MiB total,100 PDF pages after decoding and
20 million image pixels. Ten tests cover limits, malformed/truncated headers,
misleading extensions, typed-array slices, JPEG metadata traversal and filenames.

The sandbox parser, selected-file broker and authenticated preview protocol are
implemented with actual Electron smoke coverage. The retained intake UI and
permission/import persistence remain pending. D3 is not complete.

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

## Native attachment integration,2026-09-07

The chooser creates opaque main-process file tokens. Canonical parent identity
and nanosecond file fingerprints are verified around bounded reads; no path or
directory authority is returned for attachments. Filesystem tests cover replaced
files/parents, same-inode edits, symlinks, forged tokens and growth during reading.
This inherits SafeRoot's documented limit against an unrestricted same-user
process racing path ancestors; it is not kernel-enforced filesystem confinement.

The broker reserves20file/100MiB limits across chooser calls and permits at most
two parsers. It caches selected bytes after reading, preserves failed selections
for retry, distinguishes unsupported content, drops cancelled/stale output, and
awaits owned work during shutdown. Raw selected bytes remain memory-only until
the later confirmed project import step.

Preview IDs map only to bounded normalized PNG bytes. The loopback preview route
uses the existing session/origin/project-epoch checks, fixed image/png MIME and
no-store headers. Copies prevent mutation of cached previews; cancellation
revokes their IDs. Cross-project and unauthorized preview requests are denied.

Actual application smoke stubs only the native chooser response and exercises
preload selection, cancelled second chooser, in-page navigation, real isolated
parsing, authenticated PNG download and404after cancellation. Both normal app
exit paths pass. The visible intake UI and real user-driven chooser QA remain
separate gates.

Scoped reviews found and closed navigation and project-context races. In-page
navigation retains inputs; document replacement invalidates them. Choosers bind
their starting project context before awaiting the native dialog, and both
selection and inspection recheck context before delivery. Regression tests were
observed failing before each repair. The final quality recheck passed17native
bridge tests, with no remaining findings in this component scope.

Final combined verification passed59desktop/parity tests, typecheck, dependency
boundaries and source limits. The complete native isolation/application/parser
smoke sequence passed after the context repairs. The CLI rebuilt after the
shared-service extension hook and passed all nine fresh installed-package checks.

# Attachment intake verification

## Current implementation

The pure preflight package detects PDF, PNG and JPEG from bytes, sanitizes display
names and checks declared/actual byte limits. PNG and JPEG dimensions are read
before decoding. A successful result explicitly says `preflightOnly: true`.
It does not prove that the complete file decodes or that its contents are safe.

Limits:20 files,25MiB per file,100MiB total,100 PDF pages after decoding and
20 million image pixels. Ten tests cover limits, malformed/truncated headers,
misleading extensions, typed-array slices, JPEG metadata traversal and filenames.

The sandbox parser, main-owned selected-byte broker, preview protocol, retained
intake UI and permission persistence are still pending. Do not mark D3 complete
or expose file extraction until their runtime and security tests pass.

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

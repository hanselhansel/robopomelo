# Local browser frontend

The eleven screens are Welcome; Frame, Material flow, Success, Requirements and Acceptance; Review & export; Changes, Evidence and History; Settings & updates.

Runtime metadata comes from `@robopomelo/spec/browser`. Project data comes only from the authenticated current-origin API. The server owns source identity, permissions, validation, review validity and files. Browser project buffers remain in memory. Session storage contains only credential and CSRF tokens.

## Focused verification

```sh
npm exec tsc -- --noEmit -p apps/web/tsconfig.json
npm exec vitest run apps/web/test
npm exec vite build apps/web -- --outDir dist
```

For the renderer fixture checks, start the local Vite process, then run Playwright:

```sh
npm exec vite apps/web -- --host 127.0.0.1 --port 5179
npm exec playwright test tests/browser/frontend-fixtures.spec.ts -- --workers=1 --reporter=line
```

That test bundles the actual core reference fixture into an OS temporary directory. It supplies typed API fixtures through browser request interception. It checks all ten workspace screens at 1440, 1024, 768 and 320 CSS pixels for page overflow and axe findings, and captures Welcome. Screenshots are generated under ignored `test-results/`.

These are frontend rendering and behavior checks. They are separate from real project API, filesystem, distributed-package, native-browser, assistive-technology and print-export verification owned by the coordinating release workflow.

## Recovery behavior

The serialized draft controller keeps committed source and proposed candidate separate. An unknown outcome retains its exact mutation ID and body. Receipt readback loads the immutable committed revision before reporting Saved. A proposal remains Proposed. A retired attempt cannot be replayed.

Permission recovery parks editor and modal input in memory while Settings is open. Conflicts preserve independent edits and allow explicit field choices or manual editing before a checked patch. A remotely deleted record can be recreated with a new ID; references are not silently remapped. Explicit local-buffer discard shows the discarded input first.

Evidence uploads retain their selected File and frozen metadata. SHA-256 is computed in a stream. Pending or indeterminate receipts do not enable a blind retry; an exact not-found result permits identical replay. Attachments download without inline rendering. External evidence URIs are displayed without fetching them.

Source Sans 3 and Source Serif 4 are bundled through fontsource. Their licenses are copied to `public/licenses/` and included by Vite.

# Pre-extraction HTTP baseline

Captured September 7, 2026 from **cf729ac0c383913454ebb9a66ce8100d2b0eb455**,
the parent of extraction commit61557cc. This fixture is historical evidence;
normal test runs must never regenerate it from current application code.

The capture used a temporary `git archive` of that exact commit. Its server,
project service, transactions, artifacts, core and schemas came from the archive.
Only third-party dependencies were reused from the installed workspace.
Explicit Vite aliases bound `@robopomelo/artifacts`, `@robopomelo/core` and
`@robopomelo/spec` to the archive's respective `packages/*/src/index.ts` files,
avoiding current workspace package symlinks. No application package existed in
that commit. The capture imported `ProjectService` and `startApplication` directly
from the archived CLI implementation.

The shared `exercise.ts` harness ran HTTP bootstrap, create, open, authorize,
read, patch, validate, export-preview and ZIP download in sequence. Metadata uses
`2026-09-07T00:00:00.000Z`, sequential `shared-*` IDs and tool version `parity-test`.
The fictional receiving problem contains no user project data. The updater is
unused and throws if called. Temporary paths and authentication secrets are not
recorded. HTTP status failures fail the capture.

`baseline.json` records validation, the complete mutation result, canonical YAML,
export member metadata and all seven downloaded artifact members as exact base64
bytes. ZIP transport timestamps and compression representation are deliberately
excluded; the artifact bytes are not normalized. Compact JSON keeps the fixture
within the repository's line limit. Two independent historical executions matched.
The current implementation also matched with `TZ=UTC`.

Baseline SHA-256:
`569a0e5ddd9cefca7a3eeba7f76598db9dca583dd4abf78eeacfebcfc12477ee`

To reproduce, archive the commit above into a temporary directory, copy only
`exercise.ts` into the corresponding fixture directory, and reuse the locked
third-party dependencies. Configure the three explicit aliases above and run this
capture test with Vitest5.0.0 on Node24.20.0:

```ts
import { it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { ProjectService } from '../../apps/cli/src/services/project.js';
import { startApplication } from '../../apps/cli/src/server/application.js';
import { exercise } from '../fixtures/application-parity/exercise.js';
it('captures historical HTTP output', async () => {
  await writeFile('historical-baseline.json',
    JSON.stringify(await exercise(ProjectService, startApplication)) + '\n');
});
```

Compare parsed JSON with the checked-in fixture. Formatting differences in the
outer JSON do not change decoded artifact bytes. This covers the existing HTTP
application contract. It does not establish native desktop lifecycle, installed
CLI packaging, AI behavior or release acceptance.

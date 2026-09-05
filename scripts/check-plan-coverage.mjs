import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

// Presence mapping is a drift guard. It is not evidence that these tests passed.
export const coverage = {
  specification: ['packages/spec/src/index.ts', 'packages/spec/test/schema.test.ts'],
  core: ['packages/core/src/validation.ts', 'packages/core/test/rules.test.ts'],
  storage: ['packages/project-fs/src/session.ts', 'tests/runtime/recovery.test.ts'],
  security: ['packages/project-fs/src/settings/trust.ts', 'tests/security/trust.test.ts'],
  cli: ['apps/cli/src/dispatch.ts', 'apps/cli/test/commands.test.ts'],
  wizard: ['apps/cli/src/wizard/fields.ts', 'tests/cli/wizard-editors.test.ts'],
  artifacts: ['packages/artifacts/src/index.ts', 'tests/runtime/export.test.ts'],
  skills: ['scripts/check-skills.mjs', 'tests/skills/orchestration.test.ts'],
  browser: ['apps/web/src/App.tsx', 'tests/browser/packaged-workflow.spec.ts'],
  updates: ['tests/distribution/provenance.test.ts', 'tests/distribution/updater.test.ts'],
  distribution: ['scripts/build.mjs', 'scripts/verify-package.mjs', '.github/workflows/distribution.yml'],
  release: ['scripts/verify-release.mjs', 'scripts/verify-versions.mjs', '.github/workflows/release.yml'],
};
export function assertSuccessfulJobs(results, expected) {
  if (!Array.isArray(expected) || !expected.length || expected.some((x) => typeof x !== 'string' || !x))
    throw new Error('A nonempty expected job set is required.');
  const failed = expected.filter(
    (name) => !Object.hasOwn(results ?? {}, name) || results[name]?.result !== 'success',
  );
  if (failed.length) throw new Error(`Required jobs lack successful evidence: ${failed.join(', ')}`);
}
export async function checkCoverage(root) {
  const errors = [];
  for (const [area, paths] of Object.entries(coverage))
    for (const path of paths) {
      try {
        await access(join(root, path));
      } catch {
        errors.push(`${area}: missing ${path}`);
      }
    }
  if (errors.length) throw new Error(errors.join('\n'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({
      options: {
        root: { type: 'string', default: '.' },
        results: { type: 'string' },
        expected: { type: 'string' },
      },
    });
    if (values.results !== undefined)
      assertSuccessfulJobs(JSON.parse(values.results), values.expected?.split(','));
    else await checkCoverage(resolve(values.root));
    process.stdout.write('Required coverage guard passed. Execution evidence is reported by CI.\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

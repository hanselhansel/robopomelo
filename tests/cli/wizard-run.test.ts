import { afterEach, expect, it } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { mkdtemp, realpath, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectService } from '../../apps/cli/src/services/project.js';
import { parseCommand } from '../../apps/cli/src/arguments.js';
import { runWizard } from '../../apps/cli/src/wizard/run.js';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((f) => f()));
});
async function fixture(example = true) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'rp-wizard-'))),
    path = join(root, 'project'),
    service = new ProjectService({ toolVersion: '1.0.0', configDirectory: join(root, 'config') });
  await service.create(path, 'Planning', example);
  cleanup.push(async () => {
    await service.close();
    await rm(root, { recursive: true, force: true });
  });
  let output = '',
    hook: ((text: string) => void) | undefined;
  const stdout = new Writable({
    write(chunk, _encoding, done) {
      output += chunk.toString();
      hook?.(chunk.toString());
      done();
    },
  });
  return {
    root,
    path,
    service,
    output: () => output,
    setHook: (value: (text: string) => void) => {
      hook = value;
    },
    run: (answers: string[], authorize = 'author') =>
      runWizard(parseCommand(['plan', path, ...(authorize ? ['--authorize', authorize] : [])]), {
        project: service,
        toolVersion: '1.0.0',
        isTTY: true,
        cwd: root,
        stdin: Readable.from([answers.join('\n') + '\n']),
        stdout,
      }),
  };
}
it('edits one field, saves through the real session and traverses all five steps', async () => {
  const f = await fixture(),
    before = await f.service.snapshot();
  const result = await f.run([
    'project',
    'scope',
    'Provided',
    'Supplied revised scope',
    'Done',
    'back',
    'save',
    'Human',
    'Supplied author',
    '',
    '',
    'Clarify the scoped workflow',
    'findings',
    'next',
    'next',
    'next',
    'next',
    'exit',
  ]);
  expect(result.data).toMatchObject({ status: 'exited', saved: true });
  expect((await f.service.snapshot()).deployment.project.scope).toMatchObject({
    value: 'Supplied revised scope',
  });
  expect((await f.service.snapshot()).deployment.stakeholders).toEqual(before.deployment.stakeholders);
  for (const title of [
    'Frame the deployment',
    'Specify material flow',
    'Define success',
    'Specify requirements',
    'Plan acceptance',
  ])
    expect(f.output()).toContain(title);
});
it('keeps back navigation and explicit discard separate from a saved source revision', async () => {
  const f = await fixture(),
    before = await readFile(join(f.path, 'deployment.yaml'));
  const result = await f.run([
    'project',
    'scope',
    'Provided',
    'Unsaved scope',
    'Done',
    'back',
    'next',
    'back',
    'exit',
    'discard',
  ]);
  expect(result.data).toMatchObject({ saved: false, status: 'exited' });
  expect(await readFile(join(f.path, 'deployment.yaml'))).toEqual(before);
});
it('retains completed source and reports pending edits on EOF without an implicit save', async () => {
  const f = await fixture(),
    before = await readFile(join(f.path, 'deployment.yaml'));
  const result = await f.run(['project', 'scope', 'Provided', 'Pending scope', 'Done', 'back']);
  expect(result.data).toMatchObject({ status: 'cancelled', saved: false, pending: true });
  expect(await readFile(join(f.path, 'deployment.yaml'))).toEqual(before);
});
it('does not turn TTY or a declined scope prompt into author permission', async () => {
  const f = await fixture(),
    before = await readFile(join(f.path, 'deployment.yaml'));
  const result = await f.run(['inspect', 'exit'], '');
  expect(result.data).toMatchObject({ saved: false });
  expect(await readFile(join(f.path, 'deployment.yaml'))).toEqual(before);
});
it('keeps a saved proposal distinct from an applied source change', async () => {
  const f = await fixture();
  await f.service.grant(['author'], 'review-each-change', true);
  const before = await readFile(join(f.path, 'deployment.yaml'));
  const result = await f.run(
    [
      'project',
      'scope',
      'Provided',
      'Proposed scope',
      'Done',
      'back',
      'save',
      'Human',
      'Supplied author',
      '',
      '',
      'Propose revised scope',
      'exit',
    ],
    '',
  );
  expect(result.data).toMatchObject({ saved: false, proposed: true, pending: false });
  expect(await readFile(join(f.path, 'deployment.yaml'))).toEqual(before);
});
import { writeFile, writeFileSync } from 'node:fs';
import { writeFile as writeAsync } from 'node:fs/promises';
it('preserves a conflicting candidate and exports its original-base patch without changing source', async () => {
  const f = await fixture(),
    before = await f.service.snapshot(),
    bytes = await readFile(join(f.path, 'deployment.yaml'), 'utf8');
  let changed = false;
  f.setHook((text) => {
    if (!changed && text.includes('Purpose of this authored change')) {
      changed = true;
      writeFileSync(
        join(f.path, 'deployment.yaml'),
        bytes.replace('Inbound pallet transfer (fictional example)', 'Externally renamed fictional example'),
      );
    }
  });
  const result = await f.run(
    [
      'project',
      'scope',
      'Provided',
      'Conflicting pending scope',
      'Done',
      'back',
      'save',
      'Human',
      'Supplied author',
      '',
      '',
      'Clarify scope',
      'tools',
      'patch-export',
      'Files',
      'pending-review',
      'back',
      'exit',
      'discard',
    ],
    'author,export',
  );
  expect(f.output()).toContain('Source conflict');
  expect(result.data).toMatchObject({ saved: false });
  const patch = JSON.parse(
    await readFile(join(f.path, 'exports/pending-review/candidate-patch.json'), 'utf8'),
  );
  expect(patch.baseHash).toBe(before.sourceHash);
  expect(patch.operations[0].fields.scope.value).toBe('Conflicting pending scope');
  expect((await f.service.snapshot()).deployment.project.scope).toEqual(before.deployment.project.scope);
});
it('reports evidence copied through the wizard as a saved source change', async () => {
  const f = await fixture(),
    path = join(f.root, 'site.txt');
  await writeAsync(path, 'Supplied site notes');
  const result = await f.run(
    [
      'tools',
      'evidence',
      'Human',
      'Supplied recorder',
      '',
      '',
      path,
      'Site notes',
      'Planning',
      'Supplied inspection file',
      'Done',
      'back',
      'exit',
    ],
    'author,evidence',
  );
  expect(result.data).toMatchObject({ saved: true });
  expect(
    (await f.service.snapshot()).deployment.evidence.some(
      (e) => e.title === 'Site notes' && e.location.kind === 'attachment',
    ),
  ).toBe(true);
});

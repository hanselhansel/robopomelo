import { expect, it } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { questions, type StepId } from '@robopomelo/spec';
import { ProjectService } from '../../apps/cli/src/services/project.js';
import { parseCommand } from '../../apps/cli/src/arguments.js';
import { runWizard } from '../../apps/cli/src/wizard/run.js';
const k = (field: string, value: string) => [field, 'Provided', value, 'Done'];
const ref = (field: string, title: string) => [field, title, 'Done'];
const person = (field: string) => [field, 'Provided', 'Operator', 'Done'];
const quantity = (field: string, value: string) => [field, 'Provided', value, 'count/h', 'pallet', 'Done'];
const prompts = (step: StepId) => [
  'questions',
  ...questions
    .filter((q) => q.step === step)
    .flatMap((q) => [
      q.id,
      'Not applicable',
      'Fictional bounded editor test; no deployment decision is asserted.',
    ]),
  'back',
];
it('authors a complete reviewable specification from a blank source across all five steps without a GUI', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'rp-wizard-full-'))),
    path = join(root, 'project'),
    project = new ProjectService({ toolVersion: '1.0.0', configDirectory: join(root, 'config') });
  let output = '';
  try {
    await project.create(path, 'Fictional wizard fixture');
    const answers = [
      'project',
      ...k('problem', 'Manual transfer handoffs are undefined'),
      ...k('outcome', 'Define predictable pallet transfers'),
      ...k('scope', 'Inbound receiving to staging'),
      'back',
      'stakeholders',
      'add',
      'Operator',
      ...k('role', 'Warehouse operator'),
      'responsibilities',
      'Assess the planned evidence',
      '.',
      'back',
      'back',
      'project',
      ...person('approverId'),
      'back',
      'needs',
      'add',
      'Need',
      ...k('outcome', 'Predictable pallet movement'),
      ...ref('beneficiaryIds', 'Operator'),
      'back',
      'back',
      ...prompts('frame'),
      'next',
      'workflows',
      'add',
      'Intended movement',
      'Intended',
      ...person('ownerId'),
      ...k('loadSubject', 'pallet'),
      ...k('origin', 'Receiving'),
      ...k('destination', 'Staging'),
      ...quantity('volume', '10'),
      ...ref('needIds', 'Need'),
      'back',
      'back',
      'other',
      'needs',
      'Need',
      ...ref('workflowIds', 'Intended movement'),
      'back',
      'back',
      ...prompts('flow'),
      'next',
      'kpis',
      'add',
      'Transfer rate',
      ...person('ownerId'),
      ...k('definition', 'Completed pallet transfers per hour'),
      ...quantity('baseline', '0'),
      ...quantity('target', '10'),
      ...k('measurementMethod', 'Count completed transfers'),
      ...k('measurementWindow', 'One full hour'),
      ...ref('needIds', 'Need'),
      ...ref('workflowIds', 'Intended movement'),
      'back',
      'back',
      ...prompts('success'),
      'next',
      'requirements',
      'add',
      'Transfer capability',
      ...k('capability', 'Transfer a pallet between the specified handoffs'),
      ...k('rationale', 'Meet the stated movement need'),
      ...ref('needIds', 'Need'),
      ...ref('workflowIds', 'Intended movement'),
      ...ref('kpiIds', 'Transfer rate'),
      ...k(
        'verificationDisposition',
        'Assess through the planned acceptance procedure; no execution is claimed',
      ),
      'back',
      'back',
      ...prompts('requirements'),
      'next',
      'evidence',
      'add',
      'Observation record',
      'Acceptance requirement',
      'advanced',
      'location',
      'future',
      'Future acceptance observation notes',
      'back',
      'back',
      'acceptanceTests',
      'add',
      'Transfer acceptance',
      ...ref('subjectIds', 'Transfer capability'),
      'procedure',
      'Observe transfer under the stated conditions',
      '.',
      ...k('measurementMethod', 'Inspect the recorded observation'),
      'criterion',
      'Provided',
      'Boolean',
      'False',
      'Done',
      ...ref('evidenceRequirementIds', 'Observation record'),
      ...person('assessorId'),
      ...person('approverId'),
      'back',
      'back',
      ...prompts('acceptance'),
      'save',
      'Human',
      'Supplied fixture author',
      '',
      '',
      'Record the supplied fictional planning fixture',
      'exit',
    ];
    const result = await runWizard(parseCommand(['plan', path, '--authorize', 'author']), {
      project,
      toolVersion: '1.0.0',
      isTTY: true,
      cwd: root,
      stdin: Readable.from([answers.join('\n') + '\n']),
      stdout: new Writable({
        write(chunk, _encoding, done) {
          output += chunk.toString();
          done();
        },
      }),
    });
    expect(result.data).toMatchObject({ status: 'exited', saved: true, pending: false, readiness: 'ready' });
    const snapshot = await project.snapshot();
    expect(snapshot.deployment.needs).toHaveLength(1);
    expect(snapshot.deployment.workflows).toHaveLength(1);
    expect(snapshot.deployment.requirements).toHaveLength(1);
    expect(snapshot.deployment.acceptanceTests[0]?.criterion).toEqual({
      state: 'provided',
      value: { kind: 'boolean', expected: false },
    });
    expect(snapshot.deployment.challengeAnswers).toHaveLength(questions.length);
    expect(output).not.toContain('Save failed');
  } finally {
    await project.close();
    await rm(root, { recursive: true, force: true });
  }
});

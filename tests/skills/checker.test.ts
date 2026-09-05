import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { capabilities, skillNames, fields } from '@robopomelo/spec';
import { commandRegistry, parseCommand } from '../../apps/cli/src/arguments.js';
import { checkSkills } from '../../scripts/check-skills.mjs';
const registry = { capabilities, skillNames, fields, commandRegistry, parseCommand };
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'rp-skill-contracts-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  for (const name of skillNames) {
    const capability = capabilities.find((item) => item.id === name)!;
    const dir = join(root, 'skills', name);
    await mkdir(dir, { recursive: true });
    const contract = {
      contractVersion: '1.0.0',
      id: name,
      kind: name === 'plan-amr-deployment' ? 'orchestrator' : 'narrow',
      trigger: 'A caller supplies a planning task in this capability.',
      requiredInputs: [
        'Explicit project root',
        'Current source snapshot',
        'Supplied facts',
        'Existing authority',
      ],
      specRange: capability.specRange,
      cliRange: '>=1.0.0-rc.1 <2.0.0',
      patchRange: '^1.0.0',
      fieldsRead: capability.fieldsRead,
      fieldsWritten: capability.fieldsWritten,
      dependencies: capability.dependencies,
      commands: capability.commands.map((command) => ({
        command,
        args: command.startsWith('patch ')
          ? ['patch.json', '--project', '${project}', '--json', '--offline']
          : command === 'capabilities'
            ? ['--json', '--offline']
            : ['--project', '${project}', '--json', '--offline'],
      })),
      validation: [
        'schema',
        'capability-fields',
        'source-identity',
        'references',
        'permissions',
        'readiness-report',
      ],
      stopConditions: [
        'unsupported',
        'missing-authority',
        'stale-base',
        'invalid-input',
        'missing-facts',
        'indeterminate-receipt',
      ],
      authority: {
        grantsPermissions: false,
        actorKind: 'agent',
        capabilityIdRequired: true,
        protectedDecisions: 'separate-supplied-workflow',
      },
      output: {
        formatVersion: '1.0.0',
        required: [
          'status',
          'capabilityId',
          'changeId',
          'baseRevision',
          'baseHash',
          'sourceRevision',
          'sourceHash',
          'receiptDigest',
          'proposalId',
          'patchDigest',
          'diff',
          'readiness',
          'findings',
          'questions',
          'nextAction',
        ],
        statuses: ['unchanged', 'checked', 'proposed', 'applied', 'conflict', 'blocked'],
      },
      ...(name === 'plan-amr-deployment'
        ? {
            orchestration: {
              order: skillNames.slice(0, 5),
              committedBasesOnly: true,
              revisitDependents: true,
              proposalPolicy: 'pause-dependent-writes',
              authorityExpansion: false,
            },
          }
        : {}),
    };
    await writeFile(join(dir, 'contract.json'), JSON.stringify(contract));
    await writeFile(
      join(dir, 'SKILL.md'),
      `---\nname: ${name}\ndescription: Use when a caller requests this planning step.\nlicense: Apache-2.0\nmetadata:\n  "robopomelo:contract": contract.json\n  "robopomelo:capability": ${name}\n---\n\n# Planning skill\n\nUse the bundled contract and current CLI.\n`,
    );
  }
  return root;
}
async function change(root: string, name: string, mutate: (contract: any) => void) {
  const { readFile } = await import('node:fs/promises');
  const path = join(root, 'skills', name, 'contract.json');
  const contract = JSON.parse(await readFile(path, 'utf8'));
  mutate(contract);
  await writeFile(path, JSON.stringify(contract));
}
describe('Skill declaration checks against implementation metadata', () => {
  it('accepts a complete consistent capability set', async () => {
    expect(await checkSkills(await fixture(), registry)).toEqual([]);
  });
  it('rejects a Skill that expands into review fields or another capability', async () => {
    const root = await fixture();
    await change(root, 'frame-robot-deployment', (c) => {
      c.fieldsWritten.push('review.*', 'kpis.*');
    });
    expect((await checkSkills(root, registry)).join('\n')).toMatch(/write.*registry/i);
  });
  it('rejects an invented command and self-granted execution flags', async () => {
    const root = await fixture();
    await change(root, 'specify-material-flow', (c) => {
      c.commands[0] = { command: 'robot start', args: [] };
      c.commands[1].args.push('--authorize', 'author');
    });
    const errors = (await checkSkills(root, registry)).join('\n');
    expect(errors).toMatch(/command/i);
    expect(errors).toMatch(/authority|authorize/i);
  });
  it('rejects dependency cycles and broadened orchestrator authority', async () => {
    const root = await fixture();
    await change(root, 'frame-robot-deployment', (c) => {
      c.dependencies = ['plan-amr-deployment'];
    });
    await change(root, 'plan-amr-deployment', (c) => {
      c.orchestration.authorityExpansion = true;
    });
    const errors = (await checkSkills(root, registry)).join('\n');
    expect(errors).toMatch(/dependenc|cycle/i);
    expect(errors).toMatch(/authorityExpansion/);
  });
  it.each([
    {
      label: 'unknown field',
      mutate: (c: any) => {
        c.fieldsWritten = ['kpis.notAField'];
      },
      message: /field|write/i,
    },
    {
      label: 'unsupported range',
      mutate: (c: any) => {
        c.specRange = '*';
      },
      message: /specRange|range/i,
    },
    {
      label: 'missing output identity',
      mutate: (c: any) => {
        c.output.required = c.output.required.filter((item: string) => item !== 'baseHash');
      },
      message: /baseHash|output/i,
    },
  ])('rejects $label', async ({ mutate, message }) => {
    const root = await fixture();
    await change(root, 'define-deployment-kpis', mutate);
    expect((await checkSkills(root, registry)).join('\n')).toMatch(message);
  });
  it('rejects path escape pointers, invalid frontmatter and missing Skills', async () => {
    const root = await fixture();
    await writeFile(
      join(root, 'skills', skillNames[0]!, 'SKILL.md'),
      '---\nname: x\nname: y\ndescription: bad\nmetadata: {"robopomelo:contract": ../../outside.json}\n---\n',
    );
    await rm(join(root, 'skills', skillNames[1]!), { recursive: true });
    expect((await checkSkills(root, registry)).length).toBeGreaterThanOrEqual(2);
  });
});

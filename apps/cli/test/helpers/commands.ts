import { Readable } from 'node:stream';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectService } from '../../src/services/project.js';
import { parseCommand } from '../../src/arguments.js';
import { executeCommand } from '../../src/dispatch.js';
import type { CommandContext } from '../../src/commands/types.js';
export async function fixture(example = false) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'rp-command-'))),
    path = join(root, 'project');
  let id = 0;
  const project = new ProjectService({
    toolVersion: '1.0.0',
    configDirectory: join(root, 'config'),
    clock: () => new Date(Date.UTC(2026, 8, 5, 0, 0, id++)).toISOString(),
  });
  await project.create(path, 'Planning', example);
  const context: CommandContext = {
    project,
    toolVersion: '1.0.0',
    stdin: Readable.from([]),
    isTTY: false,
    cwd: root,
  };
  const run = (argv: string[], input?: unknown) =>
    executeCommand(parseCommand([...argv, '--project', path]), {
      ...context,
      stdin: Readable.from(
        input === undefined ? [] : [typeof input === 'string' ? input : JSON.stringify(input)],
      ),
    });
  const patch = async () => {
    const s = await project.snapshot();
    return {
      formatVersion: '1.0.0' as const,
      id: project.id(),
      projectId: s.deployment.project.id,
      baseRevision: s.sourceRevision,
      baseHash: s.sourceHash,
      actor: { kind: 'human' as const, name: 'Engineer' },
      purpose: 'Clarify scope',
      operations: [
        { op: 'project' as const, fields: { scope: { state: 'provided', value: 'Inbound transfer' } } },
      ],
    };
  };
  return {
    root,
    path,
    project,
    context,
    run,
    patch,
    close: async () => {
      await project.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

import { randomUUID } from 'node:crypto';
import { SafeRoot } from '../../../packages/project-fs/src/fs/safe-fs.js';
import { SettingsStore } from '../../../packages/project-fs/src/settings/store.js';
import { TrustStore } from '../../../packages/project-fs/src/settings/trust.js';
import { ProjectSession } from '../../../packages/project-fs/src/session.js';
import type { CommitInput } from '../../../packages/project-fs/src/contracts.js';
async function main() {
  const root = await SafeRoot.open(process.argv[2]!);
  const trust = new TrustStore(new SettingsStore(process.argv[3]!));
  const authorization = trust.authorizeRun(
    { ...root.identity(), projectId: 'project-1' },
    ['inspect', 'author', 'evidence'],
    'autonomous',
  );
  const session = new ProjectSession({
    root,
    trust,
    authorization,
    projectId: 'project-1',
    toolVersion: '0.0.0',
    clock: () => new Date().toISOString(),
    id: () => randomUUID(),
    onProgress: async ({ phase }) => {
      if (phase === process.argv[4]) process.kill(process.pid, 'SIGKILL');
    },
  });
  process.on('message', async (input: CommitInput) => {
    try {
      const result = await session.commit({ ...input, authorization });
      process.send?.({ status: result.kind });
    } catch (error) {
      process.send?.({ status: 'error', code: (error as { code?: string }).code });
    }
  });
  process.send?.({ status: 'ready' });
}
void main();

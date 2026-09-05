import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { generateArtifacts } from '@robopomelo/artifacts';
import { ProjectSession } from '../../../packages/project-fs/src/session.js';
import { SafeRoot } from '../../../packages/project-fs/src/fs/safe-fs.js';
import { TrustStore } from '../../../packages/project-fs/src/settings/trust.js';
import { SettingsStore } from '../../../packages/project-fs/src/settings/store.js';
import { ExportService } from '../../../packages/project-fs/src/export/service.js';
async function main() {
  const root = await SafeRoot.open(process.argv[2]!);
  const trust = new TrustStore(new SettingsStore(join(process.argv[2]!, 'unused-settings')));
  const authorization = trust.authorizeRun(
    { ...root.identity(), projectId: 'project-1' },
    ['inspect', 'export'],
    'autonomous',
  );
  const session = new ProjectSession({
    root,
    trust,
    authorization,
    projectId: 'project-1',
    toolVersion: '0.0.0',
    clock: () => '2026-09-05T01:00:00.000Z',
    id: () => randomUUID(),
  });
  try {
    const opened = await session.open();
    if (opened.kind !== 'readable') throw new Error('Source unreadable');
    const plan = generateArtifacts({
      source: (await root.readFile('deployment.yaml')).toString(),
      snapshot: opened.snapshot,
      selectedEvidenceIds: opened.snapshot.deployment.evidence
        .filter((e) => e.location.kind === 'attachment')
        .map((e) => e.id),
    });
    const service = new ExportService(session);
    const preview = await service.preview(
      plan,
      { sourceRevision: opened.snapshot.sourceRevision, sourceHash: opened.snapshot.sourceHash },
      authorization,
    );
    const result = await service.persist(preview.previewId, {
      format: 'zip',
      name: process.argv[3]!,
      authorization,
    });
    process.stdout.write(JSON.stringify(result));
  } finally {
    await session.close();
  }
}
void main().catch((error) => {
  process.stderr.write(String(error));
  process.exitCode = 1;
});

import { performance } from 'node:perf_hooks';
import { mkdtemp, realpath, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir, cpus, totalmem } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { stringify } from 'yaml';
import { createBlankProject, validateDeployment, sha256 } from '@robopomelo/core';
import { checkSchema } from '@robopomelo/spec';
import { generateArtifacts } from '@robopomelo/artifacts';
import { parseSource } from '../packages/project-fs/src/yaml/parse.js';
import { initializeProject } from '../packages/project-fs/src/init.js';
import { ProjectService } from '../apps/cli/src/services/project.js';
import { ExportService } from '../packages/project-fs/src/export/service.js';
export async function benchmarkPlanning(reportPath: string) {
  const d = createBlankProject({
    id: 'benchmark-project',
    name: 'Fictional 10,000-record benchmark',
    revision: 'benchmark-initial',
    timestamp: '2026-09-05T00:00:00Z',
  });
  d.stakeholders = Array.from({ length: 9999 }, (_, index) => ({
    id: `stakeholder-${index}`,
    title: `Fictional stakeholder ${index}`,
    description: null,
    ownerId: null,
    sourceEvidenceIds: [],
    extensions: {},
    role: null,
    responsibilities: [],
  }));
  const errors = checkSchema(d);
  if (errors.length) throw new Error(JSON.stringify(errors[0]));
  const source = stringify(d, { aliasDuplicateObjects: false, lineWidth: 0 }),
    timings: Record<string, number> = {};
  async function measure<T>(name: string, operation: () => T | Promise<T>) {
    const start = performance.now();
    const value = await operation();
    timings[name] = Math.round((performance.now() - start) * 100) / 100;
    return value;
  }
  const parsed = await measure('parseMs', () => parseSource(source));
  await measure('validateMs', () =>
    validateDeployment(parsed.value, {
      sourceRevision: d.meta.revisionId,
      sourceHash: sha256(source),
      toolVersion: 'benchmark',
      evidence: [],
    }),
  );
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'robopomelo-benchmark-'))),
    project = join(directory, 'project');
  await initializeProject(project, d, ['author']);
  const service = new ProjectService({
    toolVersion: 'benchmark',
    configDirectory: join(directory, 'config'),
  });
  try {
    await service.open(project, ['author', 'export']);
    const initial = await service.snapshot();
    await measure('saveMs', () =>
      service.apply({
        formatVersion: '1.0.0',
        id: 'benchmark-save',
        projectId: d.project.id,
        baseRevision: initial.sourceRevision,
        baseHash: initial.sourceHash,
        actor: { kind: 'human', name: 'Benchmark fixture' },
        purpose: 'Measure an authorized edit to a large specification',
        operations: [{ op: 'project', fields: { name: 'Fictional 10,000-record benchmark revised' } }],
      }),
    );
    await measure('exportMs', () =>
      service.withProject(async (selected) => {
        const session = service.requireSession(selected),
          snapshot = await service.snapshot(),
          actual = (await selected.root.readFile('deployment.yaml')).toString('utf8');
        const plan = generateArtifacts({ source: actual, snapshot, selectedEvidenceIds: [] }),
          exports = new ExportService(session),
          expected = { sourceRevision: snapshot.sourceRevision, sourceHash: snapshot.sourceHash };
        const preview = await exports.preview(plan, expected, service.authorization(selected));
        return exports.persist(preview.previewId, {
          format: 'zip',
          authorization: service.authorization(selected),
        });
      }),
    );
    const report = {
      measuredAt: new Date().toISOString(),
      records: 10000,
      composition: '9,999 minimal fictional stakeholders plus the project record',
      sourceBytes: Buffer.byteLength(source),
      timings,
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
      hardware: {
        cpu: cpus()[0]?.model,
        logicalCpus: cpus().length,
        totalMemoryBytes: totalmem(),
        os: process.platform,
        arch: process.arch,
        node: process.version,
      },
      projectDirectory: project,
    };
    await mkdir(dirname(resolve(reportPath)), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
    return report;
  } finally {
    await service.close();
  }
}

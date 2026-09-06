import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { metadataArguments, metadataReport } from './provider-metadata.mjs';

try {
  const { values } = parseArgs({ options: {
    provider: { type: 'string' }, mode: { type: 'string', default: 'metadata' },
    report: { type: 'string' },
  } });
  if (values.mode !== 'metadata') throw new Error('Only metadata mode is currently supported');
  const commands = metadataArguments(values.provider);
  const output = commands.map(args => {
    const result = spawnSync(values.provider, args, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000, maxBuffer: 1024 * 1024,
    });
    if (result.error || result.status !== 0)
      throw new Error('Provider metadata command failed');
    return result.stdout;
  });
  const report = {
    ...metadataReport(values.provider, output[0], output[1]),
    checkedAt: new Date().toISOString(),
  };
  const bytes = JSON.stringify(report, null, 2) + '\n';
  if (values.report) {
    const path = resolve(values.report);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { mode: 0o600 });
  }
  process.stdout.write(bytes);
} catch (error) {
  const known = new Set([
    'Unsupported provider', 'Only metadata mode is currently supported',
    'Provider metadata command failed', 'Provider version response is invalid',
  ]);
  process.stderr.write(JSON.stringify({ ok: false, error: {
    code: 'PROVIDER_METADATA_FAILED',
    message: error instanceof Error && known.has(error.message) ? error.message : 'Provider metadata probe failed',
  } }) + '\n');
  process.exitCode = 1;
}

// Optional fixture regeneration only. Runtime tests do not depend on qpdf.
import { pdf } from './pdf.ts';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = await mkdtemp(join(tmpdir(), 'rp-pdf-fixture-'));
try {
  const input = join(root, 'input.pdf');
  await writeFile(input, pdf(1));
  const result = spawnSync(
    'qpdf',
    [
      '--encrypt',
      'fixture-user',
      'fixture-owner',
      '256',
      '--',
      input,
      join(import.meta.dirname, 'protected.pdf'),
    ],
    { stdio: 'inherit' },
  );
  if (result.error || result.status !== 0) throw new Error('qpdf fixture generation failed');
} finally {
  await rm(root, { recursive: true, force: true });
}

import { it, expect } from 'vitest';
import { build } from 'esbuild';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
it('provides installed-style help without creating project or machine state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'robopomelo-entry-'));
  try {
    const entry = join(directory, 'main.mjs');
    await build({
      entryPoints: ['apps/cli/src/main.ts'],
      outfile: entry,
      bundle: true,
      platform: 'node',
      format: 'esm',
      banner: {
        js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);",
      },
      define: { __ROBOPOMELO_VERSION__: JSON.stringify('1.0.0-rc.1') },
      logLevel: 'silent',
    });
    const result = spawnSync(process.execPath, [entry, '--help', '--json'], {
      cwd: directory,
      env: { ...process.env, ROBOPOMELO_CONFIG_DIR: join(directory, 'config') },
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).data.help).toContain('RoboPomelo');
    await expect(readFile(join(directory, 'config', 'settings.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

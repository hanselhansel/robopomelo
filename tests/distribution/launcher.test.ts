import { expect, it } from 'vitest';
import { parseRuntimeManifest } from '../../apps/cli/src/runtime/manifest.js';
import { assertCompatible, automaticEligible } from '../../apps/cli/src/runtime/compatibility.js';
import { manifest, probe } from './helpers/runtime.js';
it('requires all six Skills, assets and an exact inventory before executing a runtime', () => {
  const m = manifest();
  expect(parseRuntimeManifest(m).version).toBe('1.0.0');
  for (const bad of [
    { ...m, skills: m.skills.slice(1) },
    { ...m, webAssets: [] },
    { ...m, entryPoint: '../escape' },
    { ...m, files: [...m.files, m.files[0]] },
  ])
    expect(() => parseRuntimeManifest(bad)).toThrow();
});
it('rejects incompatible Node, platform, specification, rule context, protocol and migration', () => {
  const m = manifest();
  expect(() => assertCompatible(m, probe())).not.toThrow();
  for (const p of [
    { ...probe(), nodeVersion: '20.0.0' },
    { ...probe(), platform: 'freebsd' },
    { ...probe(), specVersion: '2.0.0' },
    { ...probe(), ruleSetVersion: '2.0.0' },
    { ...probe(), launcherProtocol: 2 },
  ])
    expect(() => assertCompatible(m, p as ReturnType<typeof probe>)).toThrow();
  expect(() => assertCompatible({ ...m, migrationRequired: true }, probe())).toThrow();
});
it('automatically admits only newer compatible stable releases in the same major', () => {
  expect(automaticEligible(manifest('1.1.0'), '1.0.0', probe())).toBe(true);
  for (const m of [
    manifest('1.0.0'),
    manifest('2.0.0'),
    manifest('1.1.0-rc.1'),
    { ...manifest('1.1.0'), migrationRequired: true },
  ])
    expect(automaticEligible(m, '1.0.0', probe())).toBe(false);
});
import { afterEach } from 'vitest';
import { mkdtemp, realpath, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fork } from 'node:child_process';
import { launchRuntime } from '../../apps/cli/src/runtime/launcher.js';
import { loadBundledRuntime } from '../../apps/cli/src/runtime/bundle.js';
import { runtimeFiles, digest } from './helpers/runtime.js';
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
async function childFixture(behavior: 'ready' | 'wrong' | 'timeout' = 'ready', version = '1.0.0') {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'rp-launch-')));
  roots.push(directory);
  const files = runtimeFiles(version),
    m = manifest(version);
  files['runtime/main.mjs'] =
    `import{readFileSync}from'node:fs';import{createHash}from'node:crypto';const manifest=readFileSync(new URL('../runtime-manifest.json',import.meta.url));if(${JSON.stringify(behavior)}!=='timeout')process.send({type:'robopomelo:ready',version:${JSON.stringify(behavior === 'wrong' ? '9.0.0' : version)},launcherProtocol:1,manifestDigest:createHash('sha256').update(manifest).digest('hex')});process.on('message',message=>{if(message.type==='robopomelo:start'){process.stdout.write(JSON.stringify({argv:message.argv,cwd:message.cwd,preload:process.env.NODE_OPTIONS??null,launcherDirectory:message.launcherDirectory,launcherVersion:message.launcherVersion,bundledRuntimeVersion:message.bundledRuntimeVersion}));process.exit(0);}});`;
  m.files = m.files.map((f) => ({
    ...f,
    size: Buffer.byteLength(files[f.path]!),
    sha256: digest(files[f.path]!),
  }));
  for (const [path, body] of Object.entries({ ...files, 'runtime-manifest.json': JSON.stringify(m) })) {
    await mkdir(dirname(join(directory, path)), { recursive: true, mode: 0o700 });
    await writeFile(join(directory, path), body);
  }
  return loadBundledRuntime(directory);
}
it('spawns the selected actual entrypoint and sends project argv only after the exact handshake', async () => {
  const descriptor = await childFixture();
  const argv = ['show', '/private/project/deployment.yaml'];
  let output = '';
  let selected = '';
  const launched = await launchRuntime(descriptor, argv, {
    cwd: '/private/project',
    spawn: (entry, options) => {
      selected = entry;
      const child = fork(entry, [], {
        cwd: options.cwd,
        env: { ...options.env, NODE_OPTIONS: undefined },
        execArgv: [],
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      child.stdout!.on('data', (c) => (output += c.toString()));
      return child;
    },
  });
  expect(selected).toBe(join(descriptor.directory, 'runtime/main.mjs'));
  expect(await launched.completed).toMatchObject({ code: 0 });
  expect(JSON.parse(output)).toMatchObject({
    argv,
    cwd: '/private/project',
    preload: null,
    launcherDirectory: descriptor.directory,
    launcherVersion: '1.0.0',
    bundledRuntimeVersion: '1.0.0',
  });
  expect(launched.version).toBe('1.0.0');
});
it.each(['wrong', 'timeout'] as const)(
  'rejects a %s handshake without supplying project arguments',
  async (behavior) => {
    const descriptor = await childFixture(behavior);
    let supplied = false;
    await expect(
      launchRuntime(descriptor, ['private-project'], {
        timeoutMs: behavior === 'wrong' ? 1000 : 50,
        spawn: (entry, options) => {
          const child = fork(entry, [], {
            cwd: options.cwd,
            env: options.env,
            execArgv: [],
            stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
          });
          const send = child.send.bind(child);
          child.send = ((message: unknown, ...args: unknown[]) => {
            supplied = true;
            return send(message as never, ...(args as []));
          }) as typeof child.send;
          return child;
        },
      }),
    ).rejects.toMatchObject({ code: 'RUNTIME_HANDSHAKE' });
    expect(supplied).toBe(false);
  },
);
import { probeProjectSpecVersion } from '../../apps/cli/src/runtime/probe.js';
import { readFile } from 'node:fs/promises';
it('reads only a bounded local specification version before runtime selection', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'rp-probe-')));
  roots.push(directory);
  const source = 'specVersion: 2.0.0\nproject: {name: "Local project stays local"}\n';
  await writeFile(join(directory, 'deployment.yaml'), source);
  expect(await probeProjectSpecVersion(directory)).toBe('2.0.0');
  expect(await readFile(join(directory, 'deployment.yaml'), 'utf8')).toBe(source);
  await writeFile(join(directory, 'deployment.yaml'), 'specVersion: !execute shell\n');
  await expect(probeProjectSpecVersion(directory)).rejects.toThrow();
});
import { RuntimeCache } from '../../apps/cli/src/runtime/cache.js';
import { UpdateService } from '../../apps/cli/src/runtime/update.js';
import { SettingsStore } from '../../packages/project-fs/src/settings/store.js';
import { UpdatePreferences } from '../../packages/project-fs/src/settings/updates.js';
import { release, syntheticVerifier } from './helpers/release.js';
it('sends original bundle identity to a newer cached child through the actual updater launcher', async () => {
  const original = await childFixture('ready', '1.0.0'),
    next = await childFixture('ready', '1.1.0'),
    machine = await realpath(await mkdtemp(join(tmpdir(), 'rp-launch-origin-')));
  roots.push(machine);
  const overrides = Object.fromEntries(
      await Promise.all(
        next.manifest.files.map(async (f) => [f.path, await readFile(join(next.directory, f.path), 'utf8')]),
      ),
    ),
    r = await release('1.1.0', overrides),
    cache = new RuntimeCache({ directory: join(machine, 'cache'), verify: syntheticVerifier });
  const staged = await cache.install(r.metadata, async (sink) => sink(r.bytes), r.attestations);
  await cache.promote(staged);
  const updater = new UpdateService({
    bundle: original,
    cache,
    preferences: new UpdatePreferences(new SettingsStore(join(machine, 'config'))),
    probe: probe(),
  });
  let output = '';
  const launched = await updater.launch(['show'], {
    startupCheck: false,
    spawn: (entry, options) => {
      const child = fork(entry, [], {
        cwd: options.cwd,
        env: options.env,
        execArgv: [],
        stdio: ['ignore', 'pipe', 'ignore', 'ipc'],
      });
      child.stdout!.on('data', (c) => (output += c.toString()));
      return child;
    },
  });
  expect(await launched.completed).toMatchObject({ code: 0 });
  expect(launched.version).toBe('1.1.0');
  expect(JSON.parse(output)).toMatchObject({
    launcherDirectory: original.directory,
    launcherVersion: '1.0.0',
    bundledRuntimeVersion: '1.0.0',
  });
});

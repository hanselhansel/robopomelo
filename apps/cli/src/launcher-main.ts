import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import semver from 'semver';
import { parseCommand } from './arguments.js';
import { helpText } from './help.js';
import { TOOL_VERSION } from './version.js';
import { errorEnvelope, successEnvelope, exitForError } from './output.js';
import { ProjectService } from './services/project.js';
import { runtimeContext } from './services/runtime.js';
import type { RunPolicy } from './runtime/selection.js';
async function main() {
  const argv = process.argv.slice(2);
  let command;
  try {
    command = parseCommand(argv);
  } catch (error) {
    process.stdout.write(JSON.stringify(errorEnvelope('unknown', error, TOOL_VERSION)) + '\n');
    process.exitCode = 2;
    return;
  }
  if (command.help) {
    const help = helpText(argv.some((arg) => !arg.startsWith('-')) ? command.name : undefined);
    process.stdout.write(
      command.flags.json
        ? JSON.stringify(successEnvelope(command.name, { help }, { toolVersion: TOOL_VERSION })) + '\n'
        : help + '\n',
    );
    return;
  }
  if (!semver.satisfies(process.versions.node, '^22.22.2 || ^24.15.0'))
    throw Object.assign(
      new Error('RoboPomelo requires Node 22.22.2+ or Node 24.15.0+ on their respective LTS lines.'),
      { code: 'RUNTIME_UNAVAILABLE' },
    );
  const project = new ProjectService({
    toolVersion: TOOL_VERSION,
    ...(process.env.ROBOPOMELO_CONFIG_DIR ? { configDirectory: process.env.ROBOPOMELO_CONFIG_DIR } : {}),
  });
  try {
    const packageDirectory = fileURLToPath(new URL('../', import.meta.url)),
      runtime = await runtimeContext(project, packageDirectory, {}, command.flags.offline === true);
    const mode = command.flags['update-mode'];
    if (mode !== undefined && !['auto', 'notify', 'off'].includes(String(mode)))
      throw Object.assign(new Error('Choose auto, notify or off for --update-mode.'), {
        code: 'INVALID_ARGUMENTS',
      });
    const run: RunPolicy = {
      ...(command.flags.offline ? { offline: true } : {}),
      ...(mode ? { mode: mode as 'auto' | 'notify' | 'off' } : {}),
      ...(typeof command.flags['runtime-version'] === 'string'
        ? { explicitVersion: command.flags['runtime-version'] }
        : {}),
    };
    if (command.version) {
      const status = await runtime.updater.status(run);
      const data = {
        launcherVersion: TOOL_VERSION,
        bundledRuntimeVersion: runtime.identity.bundledRuntimeVersion,
        selectedRuntimeVersion: status.selection.version,
        selectionReason: status.selection.reason,
        effectiveUpdatePolicy: status.policy,
      };
      process.stdout.write(
        command.flags.json
          ? JSON.stringify(successEnvelope(command.name, data, { toolVersion: TOOL_VERSION })) + '\n'
          : Object.entries(data)
              .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
              .join('\n') + '\n',
      );
      return;
    }
    const launched = await runtime.updater.launch(argv, {
      ...run,
      cwd: resolve(process.cwd()),
      startupCheck: !command.name.startsWith('update '),
    });
    const interrupt = () => launched.child.kill('SIGINT'),
      terminate = () => launched.child.kill('SIGTERM');
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', terminate);
    const finished = await launched.completed;
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
    process.stdin.pause();
    process.exitCode = finished.code ?? (finished.signal === 'SIGINT' ? 130 : 1);
  } finally {
    await project.close();
  }
}
void main().catch((error) => {
  const envelope = errorEnvelope('launcher', error, TOOL_VERSION);
  if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(envelope) + '\n');
  else process.stderr.write(stripVTControlCharacters(envelope.errors[0]!.message) + '\n');
  process.exitCode = exitForError(error);
});

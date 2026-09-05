import { fileURLToPath } from 'node:url';
import { isAbsolute, join, resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import semver from 'semver';
import { parseCommand } from './arguments.js';
import { helpText } from './help.js';
import { executeCommand, resultEnvelope, type CommandContext } from './dispatch.js';
import { errorEnvelope, exitForError, successEnvelope } from './output.js';
import { ProjectService } from './services/project.js';
import { TOOL_VERSION } from './version.js';
import { loadBundledRuntime } from './runtime/bundle.js';
import { runtimeContext } from './services/runtime.js';
import { startApplication } from './server/application.js';
import { openBrowser } from './browser.js';
interface StartMessage {
  type: 'robopomelo:start';
  argv: string[];
  cwd: string;
  stdinIsTTY: boolean;
  launcherDirectory?: string;
  launcherVersion?: string;
  bundledRuntimeVersion?: string;
}
export async function runCli(argv: string[], start?: StartMessage): Promise<void> {
  let command;
  try {
    command = parseCommand(argv);
  } catch (error) {
    const envelope = errorEnvelope('unknown', error, TOOL_VERSION);
    if (argv.includes('--json')) process.stdout.write(JSON.stringify(envelope) + '\n');
    else process.stderr.write(stripVTControlCharacters(envelope.errors[0]!.message) + '\n');
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
  if (!semver.satisfies(process.versions.node, '^22.22.2 || ^24.15.0')) {
    const error = {
      code: 'RUNTIME_UNAVAILABLE',
      message: 'RoboPomelo requires Node 22.22.2+ on the 22 line or Node 24.15.0+ on the 24 line.',
    };
    process.stdout.write(JSON.stringify(errorEnvelope(command.name, error, TOOL_VERSION)) + '\n');
    process.exitCode = 7;
    return;
  }
  let app: Awaited<ReturnType<typeof startApplication>> | undefined;
  const project = new ProjectService({
    toolVersion: TOOL_VERSION,
    ...(process.env.ROBOPOMELO_CONFIG_DIR ? { configDirectory: process.env.ROBOPOMELO_CONFIG_DIR } : {}),
  });
  try {
    const packageDirectory = fileURLToPath(new URL('../', import.meta.url));
    const runtime = await runtimeContext(
      project,
      packageDirectory,
      start ?? {},
      command.flags.offline === true,
    );
    if (command.version) {
      const status = await runtime.updater.status({
        ...(runtime.identity.sourceCheckout ? { sourceCheckout: true } : {}),
        ...(command.flags.offline ? { offline: true } : {}),
        ...(typeof command.flags['runtime-version'] === 'string'
          ? { explicitVersion: command.flags['runtime-version'] }
          : {}),
      });
      const data = {
        launcherVersion: runtime.identity.launcherVersion,
        bundledRuntimeVersion: runtime.identity.bundledRuntimeVersion,
        selectedRuntimeVersion: status.selection.version,
        currentRuntimeVersion: TOOL_VERSION,
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
    const context: CommandContext = {
      project,
      toolVersion: TOOL_VERSION,
      stdin: process.stdin,
      isTTY: start?.stdinIsTTY ?? process.stdin.isTTY === true,
      cwd: process.cwd(),
      packageDirectory,
      updater: runtime.updater,
      launcherVersion: runtime.identity.launcherVersion,
      bundledRuntimeVersion: runtime.identity.bundledRuntimeVersion,
      open: async (selected) => {
        const folder =
          selected.positionals[0] ??
          (typeof selected.flags.project === 'string' ? selected.flags.project : undefined);
        if (folder) await project.open(resolve(folder), selected.scopes);
        app = await startApplication(
          project,
          runtime.updater,
          runtime.identity,
          join(packageDirectory, 'ui'),
        );
        if (!selected.flags['no-browser'])
          try {
            await openBrowser(app.bootstrapUrl);
          } catch (error) {
            await app.close();
            app = undefined;
            throw error;
          }
        const close = async () => {
          await app?.close();
          process.exitCode = 0;
        };
        process.once('SIGINT', () => void close());
        process.once('SIGTERM', () => void close());
        return {
          data: {
            status: 'listening',
            url: app.url,
            toolVersion: TOOL_VERSION,
            ...(selected.flags['no-browser']
              ? { bootstrapUrl: app.bootstrapUrl, bootstrapSecret: true, expiresInSeconds: 120 }
              : {}),
          },
        };
      },
    };
    const result = await executeCommand(command, context),
      envelope = resultEnvelope(command.name, result, TOOL_VERSION);
    process.stdout.write(
      command.flags.json ? JSON.stringify(envelope) + '\n' : JSON.stringify(envelope.data, null, 2) + '\n',
    );
    process.exitCode = result.exitCode ?? 0;
  } catch (error) {
    const envelope = errorEnvelope(command.name, error, TOOL_VERSION);
    if (command.flags.json) process.stdout.write(JSON.stringify(envelope) + '\n');
    else process.stderr.write(stripVTControlCharacters(envelope.errors[0]!.message) + '\n');
    process.exitCode = exitForError(error);
  } finally {
    if (!app) await project.close();
  }
}
async function entry() {
  if (typeof process.send === 'function') {
    const runtime = await loadBundledRuntime(fileURLToPath(new URL('../', import.meta.url)));
    if (runtime.manifest.version !== TOOL_VERSION)
      throw new Error('Runtime version does not match its manifest.');
    process.send({
      type: 'robopomelo:ready',
      version: TOOL_VERSION,
      launcherProtocol: 1,
      manifestDigest: runtime.manifestDigest,
    });
    const start = await new Promise<StartMessage>((resolve, reject) =>
      process.once('message', (message) => {
        const value = message as StartMessage;
        if (
          value?.type !== 'robopomelo:start' ||
          !Array.isArray(value.argv) ||
          value.argv.some((arg) => typeof arg !== 'string') ||
          typeof value.cwd !== 'string' ||
          !isAbsolute(value.cwd) ||
          value.cwd.includes('\0') ||
          typeof value.stdinIsTTY !== 'boolean'
        ) {
          reject(new Error('Invalid runtime start message.'));
          return;
        }
        resolve(value);
      }),
    );
    process.chdir(start.cwd);
    await runCli(start.argv, start);
    if (process.connected) process.disconnect();
  } else await runCli(process.argv.slice(2));
}
void entry().catch((error) => {
  process.stderr.write(
    stripVTControlCharacters(error instanceof Error ? error.message : 'Runtime failed.') + '\n',
  );
  process.exitCode = 1;
  if (process.connected) process.disconnect();
});

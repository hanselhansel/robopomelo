import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { launchRuntime } from '../../apps/cli/src/runtime/launcher.js';
import type { RuntimeDescriptor } from '../../apps/cli/src/runtime/contracts.js';
import { manifest } from './helpers/runtime.js';
const runtime = {
  directory: resolve('fixture-runtime'),
  manifest: manifest(),
  manifestDigest: 'digest',
} as RuntimeDescriptor;
const ready = {
  type: 'robopomelo:ready',
  version: runtime.manifest.version,
  launcherProtocol: 1,
  manifestDigest: 'digest',
};
function fixture(startError = false) {
  const events = new EventEmitter();
  const kill = vi.fn(() => {
    events.emit('exit', null, 'SIGTERM');
    return true;
  });
  const send = vi.fn((_message, callback) => callback(startError ? new Error('IPC closed') : null));
  const child = Object.assign(events, { kill, send, stdin: null }) as unknown as ChildProcess;
  return { child, kill, send };
}
afterEach(() => vi.useRealTimers());
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
it.each(['wrong', 'timeout', 'spawn', 'start', 'send-throw'] as const)(
  '%s rejection waits for child close before caller cleanup',
  async (reason) => {
    vi.useFakeTimers();
    const { child, kill, send } = fixture(reason === 'start');
    if (reason === 'send-throw')
      send.mockImplementation(() => {
        throw new Error('IPC send threw');
      });
    let settled = false;
    const launch = launchRuntime(runtime, ['private-project'], { spawn: () => child, timeoutMs: 20 });
    const result = launch.then(
      () => {
        settled = true;
      },
      (error) => {
        settled = true;
        return error;
      },
    );
    if (reason === 'timeout') await vi.advanceTimersByTimeAsync(20);
    else if (reason === 'spawn') child.emit('error', new Error('spawn failed'));
    else child.emit('message', reason === 'wrong' ? { ...ready, version: '9.0.0' } : ready);
    await flush();
    expect(kill).toHaveBeenCalled();
    expect(settled).toBe(false);
    if (!['start', 'send-throw'].includes(reason)) expect(send).not.toHaveBeenCalled();
    child.emit('close', null, 'SIGTERM');
    expect(await result).toMatchObject({
      code: ['start', 'send-throw'].includes(reason) ? 'RUNTIME_START_FAILED' : 'RUNTIME_HANDSHAKE',
    });
  },
);
it('successful completion waits for stdio close after process exit', async () => {
  const { child } = fixture();
  const launch = launchRuntime(runtime, [], { spawn: () => child });
  child.emit('message', ready);
  const launched = await launch;
  let complete = false;
  void launched.completed.then(() => {
    complete = true;
  });
  child.emit('exit', 0, null);
  await flush();
  expect(complete).toBe(false);
  child.emit('close', 0, null);
  expect(await launched.completed).toEqual({ code: 0, signal: null });
});
it('escalates a rejected child that ignores graceful termination and still waits for close', async () => {
  vi.useFakeTimers();
  const { child, kill, send } = fixture();
  const result = launchRuntime(runtime, ['private-project'], { spawn: () => child }).catch((error) => error);
  child.emit('message', { ...ready, version: '9.0.0' });
  await vi.advanceTimersByTimeAsync(1000);
  expect(kill.mock.calls).toEqual([[], ['SIGKILL']]);
  expect(send).not.toHaveBeenCalled();
  child.emit('close', null, 'SIGKILL');
  expect(await result).toMatchObject({ code: 'RUNTIME_HANDSHAKE' });
});

import { expect, it, vi } from 'vitest';
import type { DesktopBridge } from '@robopomelo/spec';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), expose: vi.fn() }));
vi.mock('electron', () => ({ ipcRenderer: { invoke: mocks.invoke }, contextBridge: { exposeInMainWorld: mocks.expose }, webUtils: { getPathForFile: () => '' } }));
import '../../apps/desktop/src/preload.js';
const bridge = mocks.expose.mock.calls[0]![1] as DesktopBridge;
it('returns a plain cancellation error for a normal cancelled confirmation', async () => {
  mocks.invoke.mockResolvedValueOnce({ nativeFailure: 'cancelled' });
  await expect(bridge.confirmSetup('folder', 'recommended')).rejects.toThrow('Setup confirmation cancelled');
});
it('removes Electron transport prefixes from actionable native errors', async () => {
  mocks.invoke.mockRejectedValueOnce(new Error("Error invoking remote method 'native:choose-project-folder': Error: Choose an empty folder."));
  await expect(bridge.chooseProjectFolder('create')).rejects.toMatchObject({ message: 'Choose an empty folder.' });
});

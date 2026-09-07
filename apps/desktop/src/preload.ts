import { contextBridge, ipcRenderer, webUtils } from 'electron';
import {
  channels,
  checkedMode,
  checkedPreset,
  checkedString,
  checkedFolder,
  checkedAttachments,
  checkedVoid,
  checkedAttachmentPreview,
  checkedRoute,
  checkedConnectionStatus,
  checkedConnectionStatuses,
} from './native-contracts.js';
import type { DesktopBridge } from './native-contracts.js';
async function invokeNative(channel: (typeof channels)[keyof typeof channels], ...args: unknown[]): Promise<unknown> {
  try {
    const result = await ipcRenderer.invoke(channel, ...args);
    if (result && typeof result === 'object' && Object.keys(result).join(',') === 'nativeFailure' && result.nativeFailure === 'cancelled')
      throw new Error('Setup confirmation cancelled');
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '') : 'The local action could not finish.';
    throw new Error(message);
  }
}
const bridge: DesktopBridge = Object.freeze<DesktopBridge>({
  async chooseProjectFolder(mode) {
    return checkedFolder(await invokeNative(channels.chooseProjectFolder, checkedMode(mode)));
  },
  async selectAttachments() {
    return checkedAttachments(await invokeNative(channels.selectAttachments));
  },
  async dropAttachments(files) {
    if (!Array.isArray(files) || files.length > 20) throw new Error('Drop at most 20 files.');
    const paths = files.map(file => {
      const path = webUtils.getPathForFile(file);
      if (!path) throw new Error('Drop files stored on this computer.');
      return checkedString(path);
    });
    return checkedAttachments(await invokeNative(channels.dropAttachments, paths));
  },
  async inspectAttachment(id) {
    return checkedAttachmentPreview(await invokeNative(channels.inspectAttachment, checkedString(id)));
  },
  async cancelAttachment(id) {
    checkedVoid(await invokeNative(channels.cancelAttachment, checkedString(id)));
  },
  async confirmSetup(id, preset) {
    checkedVoid(await invokeNative(channels.confirmSetup, checkedString(id), checkedPreset(preset)));
  },
  async cancelRun(id) {
    checkedVoid(await invokeNative(channels.cancelRun, checkedString(id)));
  },
  async connectProvider(route) {
    return checkedConnectionStatus(await invokeNative(channels.connectProvider, checkedRoute(route)));
  },
  async listConnections() {
    return checkedConnectionStatuses(await invokeNative(channels.listConnections));
  },
  async connectionStatus(id) {
    return checkedConnectionStatus(await invokeNative(channels.connectionStatus, checkedString(id)));
  },
  async disconnect(id) {
    return checkedConnectionStatus(await invokeNative(channels.disconnect, checkedString(id)));
  },
});
contextBridge.exposeInMainWorld('robopomelo', bridge);

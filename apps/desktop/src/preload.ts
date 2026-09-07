import { contextBridge, ipcRenderer } from 'electron';
import {
  channels,
  checkedMode,
  checkedPreset,
  checkedString,
  checkedFolder,
  checkedAttachments,
  checkedVoid,
  checkedAttachmentPreview,
} from './native-contracts.js';
import type { DesktopBridge } from './native-contracts.js';
const bridge: DesktopBridge = Object.freeze<DesktopBridge>({
  async chooseProjectFolder(mode) {
    return checkedFolder(await ipcRenderer.invoke(channels.chooseProjectFolder, checkedMode(mode)));
  },
  async selectAttachments() {
    return checkedAttachments(await ipcRenderer.invoke(channels.selectAttachments));
  },
  async inspectAttachment(id) {
    return checkedAttachmentPreview(await ipcRenderer.invoke(channels.inspectAttachment, checkedString(id)));
  },
  async cancelAttachment(id) {
    checkedVoid(await ipcRenderer.invoke(channels.cancelAttachment, checkedString(id)));
  },
  async confirmSetup(id, preset) {
    checkedVoid(await ipcRenderer.invoke(channels.confirmSetup, checkedString(id), checkedPreset(preset)));
  },
  async cancelRun(id) {
    checkedVoid(await ipcRenderer.invoke(channels.cancelRun, checkedString(id)));
  },
});
contextBridge.exposeInMainWorld('robopomelo', bridge);

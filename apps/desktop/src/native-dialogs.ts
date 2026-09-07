import { randomUUID } from 'node:crypto';
import { allowedUI } from './navigation.js';
import { checkedMode, checkedPreset, checkedString, checkedAttachmentPreview } from './native-contracts.js';
import type { FolderMode, PresetId, PickedAttachment } from './native-contracts.js';
import type { AttachmentBroker } from './attachment-broker.js';
export type NativeSender = { id: number; mainFrame: object; isDestroyed(): boolean };
export type NativeEvent = { sender: NativeSender; senderFrame: object | null };
type Identity = { identity: string; name: string; bytes: number; directory: boolean };
type Selection = { path: string; identity: string; expires: number; mode: FolderMode; frame: object | null };
export interface NativeDependencies {
  sender: NativeSender;
  uiOrigin: string;
  dialogs: {
    chooseFolder(mode: FolderMode): Promise<string | null>;
    chooseFiles(): Promise<string[]>;
    confirmPreset(path: string, preset: PresetId): Promise<boolean>;
  };
  identity(path: string): Promise<Identity>;
  now?: () => number;
  confirm(path: string, preset: PresetId, mode: FolderMode): Promise<void>;
  cancelRun(runId: string): Promise<void>;
  attachments: Pick<AttachmentBroker, 'select' | 'inspect' | 'cancel' | 'clear' | 'contextKey'>;
}
export function createNativeHandlers(deps: NativeDependencies) {
  const selections = new Map<string, Selection>();
  let generation = 0;
  const now = deps.now ?? Date.now;
  function authenticate(event: NativeEvent) {
    if (
      event.sender !== deps.sender ||
      event.sender.isDestroyed() ||
      event.senderFrame !== deps.sender.mainFrame ||
      !allowedUI((event.senderFrame as { url?: string })?.url ?? '', deps.uiOrigin)
    )
      throw new Error('Unauthorized native sender');
  }
  function prune() {
    for (const map of [selections]) for (const [id, value] of map) if (value.expires <= now()) map.delete(id);
  }
  async function chooseProjectFolder(event: NativeEvent, mode: unknown) {
    authenticate(event);
    const started = generation;
    const validMode = checkedMode(mode);
    const path = await deps.dialogs.chooseFolder(validMode);
    authenticate(event);
    if (started !== generation) throw new Error('Selection invalidated');
    if (path === null) return null;
    const identity = await deps.identity(path);
    authenticate(event);
    if (started !== generation) throw new Error('Selection invalidated');
    if (!identity.directory) throw new Error('Selection is not a directory');
    prune();
    selections.clear();
    const selectionId = randomUUID();
    selections.set(selectionId, {
      path,
      identity: identity.identity,
      expires: now() + 300000,
      mode: validMode,
      frame: event.senderFrame,
    });
    return { selectionId, displayPath: path };
  }
  async function confirmSetup(event: NativeEvent, id: unknown, preset: unknown) {
    authenticate(event);
    const started = generation;
    const selectionId = checkedString(id),
      presetId = checkedPreset(preset);
    prune();
    const selection = selections.get(selectionId);
    if (!selection || selection.frame !== event.senderFrame) throw new Error('Selection expired or unknown');
    // Consume before awaiting: concurrent confirmation cannot reuse authority.
    selections.delete(selectionId);
    if ((await deps.identity(selection.path)).identity !== selection.identity)
      throw new Error('Selected root changed');
    if (!(await deps.dialogs.confirmPreset(selection.path, presetId)))
      throw new Error('Setup confirmation cancelled');
    authenticate(event);
    if (selection.expires <= now() || (await deps.identity(selection.path)).identity !== selection.identity)
      throw new Error('Selected root changed or expired');
    authenticate(event);
    if (started !== generation) throw new Error('Selection invalidated');
    await deps.confirm(selection.path, presetId, selection.mode);
  }
  async function selectAttachments(event: NativeEvent): Promise<PickedAttachment[]> {
    authenticate(event);
    const started = generation;
    const context = deps.attachments.contextKey();
    const paths = await deps.dialogs.chooseFiles();
    authenticate(event);
    if (started !== generation || context !== deps.attachments.contextKey())
      throw new Error('Selection invalidated');
    if (paths.length > 20) throw new Error('Select at most 20 attachments');
    const selected = await deps.attachments.select(paths);
    authenticate(event);
    if (started !== generation || context !== deps.attachments.contextKey())
      throw new Error('Selection invalidated');
    return selected;
  }
  async function inspectAttachment(event: NativeEvent, id: unknown) {
    authenticate(event);
    const started = generation;
    const context = deps.attachments.contextKey();
    const result = await deps.attachments.inspect(checkedString(id));
    authenticate(event);
    if (started !== generation || context !== deps.attachments.contextKey())
      throw new Error('Selection invalidated');
    return checkedAttachmentPreview(result);
  }
  async function cancelAttachment(event: NativeEvent, id: unknown) {
    authenticate(event);
    deps.attachments.cancel(checkedString(id));
  }
  async function cancelRun(event: NativeEvent, id: unknown) {
    authenticate(event);
    await deps.cancelRun(checkedString(id));
  }
  return {
    chooseProjectFolder,
    confirmSetup,
    selectAttachments,
    inspectAttachment,
    cancelAttachment,
    cancelRun,
    dispose: () => {
      generation++;
      selections.clear();
      deps.attachments.clear();
    },
  };
}

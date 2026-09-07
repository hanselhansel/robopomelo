export type PresetId = 'recommended' | 'inspection';
export type FolderMode = 'create' | 'open';
export type PickedFolder = { selectionId: string; displayPath: string };
export type PickedAttachment = { selectionId: string; name: string; bytes: number };
export interface AttachmentPreview {
  selectionId: string;
  state: 'parsed' | 'partial' | 'unsupported' | 'failed';
  textExcerpt: string;
  pagePreviewIds: string[];
  warnings: string[];
}
/** Connection metadata only. Secrets never cross the bridge. */
export type ConnectionStatus = {
  connectionId: string;
  route: 'openrouter' | 'codex' | 'grok';
  generation: number;
  state: 'connected' | 'disconnected' | 'disabled-cleanup-required';
  accountLabel: string | null;
};
export interface DesktopBridge {
  chooseProjectFolder(mode: FolderMode): Promise<PickedFolder | null>;
  selectAttachments(): Promise<PickedAttachment[]>;
  dropAttachments(files: File[]): Promise<PickedAttachment[]>;
  inspectAttachment(selectionId: string): Promise<AttachmentPreview>;
  cancelAttachment(selectionId: string): Promise<void>;
  confirmSetup(selectionId: string, presetId: PresetId): Promise<void>;
  cancelRun(runId: string): Promise<void>;
  /** Opens the provider sign-in in the system browser and resolves once the loopback callback completes. */
  connectProvider(route: 'openrouter'): Promise<ConnectionStatus>;
  listConnections(): Promise<ConnectionStatus[]>;
  connectionStatus(connectionId: string): Promise<ConnectionStatus>;
  disconnect(connectionId: string): Promise<ConnectionStatus>;
}

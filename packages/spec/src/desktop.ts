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
export interface DesktopBridge {
  chooseProjectFolder(mode: FolderMode): Promise<PickedFolder | null>;
  selectAttachments(): Promise<PickedAttachment[]>;
  dropAttachments(files: File[]): Promise<PickedAttachment[]>;
  inspectAttachment(selectionId: string): Promise<AttachmentPreview>;
  cancelAttachment(selectionId: string): Promise<void>;
  confirmSetup(selectionId: string, presetId: PresetId): Promise<void>;
  cancelRun(runId: string): Promise<void>;
}

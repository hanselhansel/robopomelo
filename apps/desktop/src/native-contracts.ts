export type PresetId = 'recommended' | 'inspection';
export type FolderMode = 'create' | 'open';
export type PickedFolder = { selectionId: string; displayPath: string };
export type PickedAttachment = { selectionId: string; name: string; bytes: number };
export interface DesktopBridge {
  chooseProjectFolder(mode: FolderMode): Promise<PickedFolder | null>;
  selectAttachments(): Promise<PickedAttachment[]>;
  confirmSetup(selectionId: string, presetId: PresetId): Promise<void>;
  cancelRun(runId: string): Promise<void>;
}
export const channels = {
  chooseProjectFolder: 'native:choose-project-folder',
  selectAttachments: 'native:select-attachments',
  confirmSetup: 'native:confirm-setup',
  cancelRun: 'native:cancel-run',
} as const;
export function checkedString(value: unknown): string {
  if (typeof value !== 'string' || !value.length || value.length > 4096 || value.includes('\0'))
    throw new Error('Invalid string');
  return value;
}
export function checkedPreset(value: unknown): PresetId {
  if (value !== 'recommended' && value !== 'inspection') throw new Error('Invalid preset');
  return value;
}
export function checkedMode(value: unknown): FolderMode {
  if (value !== 'create' && value !== 'open') throw new Error('Invalid folder mode');
  return value;
}
export function checkedFolder(value: unknown): PickedFolder | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object') throw new Error('Invalid folder response');
  const item = value as Record<string, unknown>;
  if (Object.keys(item).sort().join(',') !== 'displayPath,selectionId')
    throw new Error('Invalid folder response');
  return { selectionId: checkedString(item.selectionId), displayPath: checkedString(item.displayPath) };
}
export function checkedAttachments(value: unknown): PickedAttachment[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error('Invalid attachments response');
  return value.map((item) => {
    if (
      !item ||
      typeof item !== 'object' ||
      Object.keys(item).sort().join(',') !== 'bytes,name,selectionId' ||
      !Number.isSafeInteger(item.bytes) ||
      item.bytes < 0
    )
      throw new Error('Invalid attachment');
    return {
      selectionId: checkedString(item.selectionId),
      name: checkedString(item.name),
      bytes: item.bytes,
    };
  });
}
export function checkedVoid(value: unknown): void {
  if (value !== undefined) throw new Error('Invalid native response');
}

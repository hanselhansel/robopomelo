import type { PresetId, FolderMode, PickedFolder, PickedAttachment, AttachmentPreview, ConnectionStatus } from '@robopomelo/spec';
export type { PresetId, FolderMode, PickedFolder, PickedAttachment, AttachmentPreview, DesktopBridge, ConnectionStatus } from '@robopomelo/spec';
export const channels = {
  chooseProjectFolder: 'native:choose-project-folder',
  selectAttachments: 'native:select-attachments',
  dropAttachments: 'native:drop-attachments',
  inspectAttachment: 'native:inspect-attachment',
  cancelAttachment: 'native:cancel-attachment',
  confirmSetup: 'native:confirm-setup',
  cancelRun: 'native:cancel-run',
  connectProvider: 'native:connect-provider',
  listConnections: 'native:list-connections',
  connectionStatus: 'native:connection-status',
  disconnect: 'native:disconnect',
} as const;
export function checkedRoute(value: unknown): 'openrouter' {
  if (value !== 'openrouter') throw new Error('Invalid provider route');
  return value;
}
export function checkedConnectionStatus(value: unknown): ConnectionStatus {
  if (!value || typeof value !== 'object') throw new Error('Invalid connection status');
  const item = value as Record<string, unknown>;
  if (
    Object.keys(item).sort().join(',') !== 'accountLabel,connectionId,generation,route,state' ||
    !['openrouter', 'codex', 'grok'].includes(String(item.route)) ||
    !['connected', 'disconnected', 'disabled-cleanup-required'].includes(String(item.state)) ||
    !Number.isSafeInteger(item.generation) ||
    (item.accountLabel !== null && (typeof item.accountLabel !== 'string' || item.accountLabel.length > 200))
  )
    throw new Error('Invalid connection status');
  return {
    connectionId: checkedString(item.connectionId),
    route: item.route as ConnectionStatus['route'],
    generation: item.generation as number,
    state: item.state as ConnectionStatus['state'],
    accountLabel: item.accountLabel as string | null,
  };
}
export function checkedConnectionStatuses(value: unknown): ConnectionStatus[] {
  if (!Array.isArray(value) || value.length > 50) throw new Error('Invalid connection list');
  return value.map(checkedConnectionStatus);
}
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
export function checkedAttachmentPreview(value: unknown): AttachmentPreview {
  if (!value || typeof value !== 'object') throw new Error('Invalid attachment preview');
  const item = value as Record<string, unknown>;
  if (
    Object.keys(item).sort().join(',') !== 'pagePreviewIds,selectionId,state,textExcerpt,warnings' ||
    !['parsed', 'partial', 'unsupported', 'failed'].includes(String(item.state)) ||
    typeof item.textExcerpt !== 'string' ||
    item.textExcerpt.length > 100000 ||
    !Array.isArray(item.pagePreviewIds) ||
    item.pagePreviewIds.length > 3 ||
    !item.pagePreviewIds.every((id) => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id)) ||
    !Array.isArray(item.warnings) ||
    item.warnings.length > 20 ||
    !item.warnings.every((warning) => typeof warning === 'string' && warning.length <= 500)
  )
    throw new Error('Invalid attachment preview');
  return {
    selectionId: checkedString(item.selectionId),
    state: item.state as AttachmentPreview['state'],
    textExcerpt: item.textExcerpt,
    pagePreviewIds: [...item.pagePreviewIds],
    warnings: [...item.warnings],
  };
}

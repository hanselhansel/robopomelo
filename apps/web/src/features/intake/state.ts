import type {
  AttachmentPreview,
  DesktopBridge,
  PickedAttachment,
  PickedFolder,
  PresetId,
} from '@robopomelo/spec';
import type { Dispatch, SetStateAction } from 'react';
export interface IntakeAttachment extends PickedAttachment {
  state: AttachmentPreview['state'] | 'parsing';
  textExcerpt: string;
  pagePreviewIds: string[];
  warnings: string[];
}
/** Server-side setup operation status. The project exists once state leaves idle. */
export interface IntakeRecovery {
  revision: string;
  projectEpoch: string;
  imported: number;
  total: number;
  error?: string;
}
export type SetupStatus = { state: 'idle' } | ({ state: 'pending' | 'completed' } & IntakeRecovery);
export interface IntakeState {
  mode: 'create' | 'open' | 'example';
  name: string;
  description: string;
  folder: PickedFolder | null;
  preset: PresetId;
  attachments: IntakeAttachment[];
  /** An interrupted import waiting on the already-created project. */
  recovery: IntakeRecovery | null;
}
export const initialIntake = (): IntakeState => ({
  mode: 'create',
  name: '',
  description: '',
  folder: null,
  preset: 'recommended',
  attachments: [],
  recovery: null,
});
export type SetIntake = Dispatch<SetStateAction<IntakeState>>;
export function nativeBridge(): DesktopBridge | undefined {
  return (window as Window & { robopomelo?: DesktopBridge }).robopomelo;
}

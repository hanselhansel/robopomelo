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
export interface IntakeState {
  mode: 'create' | 'open' | 'example';
  name: string;
  description: string;
  folder: PickedFolder | null;
  preset: PresetId;
  attachments: IntakeAttachment[];
}
export const initialIntake = (): IntakeState => ({
  mode: 'create',
  name: '',
  description: '',
  folder: null,
  preset: 'recommended',
  attachments: [],
});
export type SetIntake = Dispatch<SetStateAction<IntakeState>>;
export function nativeBridge(): DesktopBridge | undefined {
  return (window as Window & { robopomelo?: DesktopBridge }).robopomelo;
}

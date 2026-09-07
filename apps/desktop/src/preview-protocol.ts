import { randomUUID } from 'node:crypto';
import { HttpError, type Route } from '@robopomelo/application';
import { preflightAttachment } from '@robopomelo/ingestion';

/** Ephemeral previews are scoped to one selected input and application context. */
export class PreviewStore {
  #entries = new Map<string, { selection: string; context: string; bytes: Uint8Array }>();
  put(selection: string, context: string, images: Uint8Array[]): string[] {
    if (images.length > 3) throw new Error('PREVIEW_LIMIT');
    const validated = images.map((bytes) => {
      if (bytes.byteLength > 2 * 1024 ** 2) throw new Error('PREVIEW_LIMIT');
      const value = preflightAttachment({ displayName: 'Preview', bytes });
      if (
        value.format !== 'png' ||
        !value.dimensions ||
        Math.max(value.dimensions.width, value.dimensions.height) > 1024
      )
        throw new Error('PREVIEW_INVALID');
      return new Uint8Array(bytes);
    });
    const selections = new Set([...this.#entries.values()].map((entry) => entry.selection));
    if (!selections.has(selection) && selections.size >= 20) throw new Error('PREVIEW_LIMIT');
    this.remove(selection);
    return validated.map((bytes) => {
      const id = randomUUID();
      this.#entries.set(id, { selection, context, bytes });
      return id;
    });
  }
  read(id: string, context: string): Uint8Array {
    const entry = this.#entries.get(id);
    if (!entry || entry.context !== context) throw new Error('PREVIEW_UNAVAILABLE');
    return new Uint8Array(entry.bytes);
  }
  remove(selection: string) {
    for (const [id, entry] of this.#entries) if (entry.selection === selection) this.#entries.delete(id);
  }
  clear() {
    this.#entries.clear();
  }
}

/** The existing HTTP session/origin/project-epoch checks protect this protocol. */
export function attachmentPreviewRoutes(store: PreviewStore): Route[] {
  return [
    {
      method: 'GET',
      path: '/api/attachments/previews/:id',
      handler: async (context) => {
        let bytes: Uint8Array;
        try {
          bytes = store.read(context.params.id ?? '', context.projectEpoch);
        } catch {
          throw new HttpError(404, 'PREVIEW_UNAVAILABLE', 'This preview is no longer available.');
        }
        context.response.setHeader('Content-Type', 'image/png');
        context.response.setHeader('Content-Disposition', 'inline; filename="preview.png"');
        context.response.setHeader('Content-Length', bytes.byteLength);
        context.response.end(bytes);
      },
    },
  ];
}

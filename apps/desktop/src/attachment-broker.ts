import { randomUUID } from 'node:crypto';
import { assertAttachmentBatch, IngestionError, preflightAttachment } from '@robopomelo/ingestion';
import {
  readSelectedFile,
  snapshotSelectedFile,
  SelectedFileError,
  type SelectedFile,
} from './selected-file.js';
import type { AttachmentPreview, PickedAttachment } from './native-contracts.js';
import type { ParserResponse } from './parser-contracts.js';
import type { PreviewStore } from './preview-protocol.js';

interface Selection {
  id: string;
  context: string;
  file: SelectedFile;
  bytes?: Uint8Array;
  result?: AttachmentPreview;
  pending?: Promise<AttachmentPreview>;
  abort: AbortController;
}
interface Dependencies {
  context(): string;
  previews: PreviewStore;
  parse(input: { bytes: Uint8Array; displayName: string }, signal: AbortSignal): Promise<ParserResponse>;
}
const safeName = (name: string) =>
  name
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '')
    .slice(0, 160) || 'Attachment';
export class AttachmentBroker {
  #selections = new Map<string, Selection>();
  #generation = 0;
  #context: string;
  #active = 0;
  #queue: (() => void)[] = [];
  #pending = new Set<Promise<AttachmentPreview>>();
  #closed = false;
  constructor(private readonly deps: Dependencies) {
    this.#context = deps.context();
  }
  contextKey(): string {
    this.#sync();
    return this.#context;
  }
  #sync() {
    if (this.#closed) throw new Error('ATTACHMENT_BROKER_CLOSED');
    const context = this.deps.context();
    if (context !== this.#context) {
      this.clear();
      this.#context = context;
    }
  }
  #current(selection: Selection) {
    this.#sync();
    if (this.#selections.get(selection.id) !== selection || selection.abort.signal.aborted)
      throw new Error('ATTACHMENT_CANCELLED');
  }
  async select(paths: string[]): Promise<PickedAttachment[]> {
    this.#sync();
    const generation = this.#generation,
      context = this.#context;
    if (paths.length > 20) throw new Error('ATTACHMENT_TOO_MANY_FILES');
    const files = await Promise.all(paths.map(snapshotSelectedFile));
    this.#sync();
    if (generation !== this.#generation || context !== this.#context) throw new Error('ATTACHMENT_CANCELLED');
    assertAttachmentBatch([...this.#selections.values()].map((row) => row.file).concat(files));
    return files.map((file) => {
      const id = randomUUID();
      this.#selections.set(id, { id, context, file, abort: new AbortController() });
      return { selectionId: id, name: safeName(file.displayName), bytes: file.byteLength };
    });
  }
  async #acquire(signal: AbortSignal): Promise<() => void> {
    await new Promise<void>((resolve, reject) => {
      const start = () => {
        signal.removeEventListener('abort', cancel);
        if (signal.aborted) {
          reject(new Error('ATTACHMENT_CANCELLED'));
          return;
        }
        this.#active++;
        resolve();
      };
      const cancel = () => {
        const index = this.#queue.indexOf(start);
        if (index >= 0) this.#queue.splice(index, 1);
        reject(new Error('ATTACHMENT_CANCELLED'));
      };
      if (signal.aborted) {
        cancel();
        return;
      }
      if (this.#active < 2) start();
      else {
        this.#queue.push(start);
        signal.addEventListener('abort', cancel, { once: true });
      }
    });
    return () => {
      this.#active--;
      this.#queue.shift()?.();
    };
  }
  async inspect(id: string): Promise<AttachmentPreview> {
    this.#sync();
    const selection = this.#selections.get(id);
    if (!selection) throw new Error('ATTACHMENT_SELECTION_UNKNOWN');
    if (selection.pending) return selection.pending;
    if (selection.result && selection.result.state !== 'failed') return structuredClone(selection.result);
    const pending = this.#inspect(selection);
    this.#pending.add(pending);
    selection.pending = pending;
    try {
      return await pending;
    } finally {
      delete selection.pending;
      this.#pending.delete(pending);
    }
  }
  async #inspect(selection: Selection): Promise<AttachmentPreview> {
    let release: (() => void) | undefined;
    try {
      release = await this.#acquire(selection.abort.signal);
      this.#current(selection);
      const bytes = selection.bytes ?? (await readSelectedFile(selection.file));
      this.#current(selection);
      selection.bytes = bytes;
      const header = preflightAttachment({ bytes, displayName: selection.file.displayName });
      const parsed = await this.deps.parse(
        { bytes: new Uint8Array(bytes), displayName: header.displayName },
        selection.abort.signal,
      );
      this.#current(selection);
      const pagePreviewIds = this.deps.previews.put(selection.id, selection.context, parsed.pageImages);
      const result: AttachmentPreview = {
        selectionId: selection.id,
        state: parsed.state,
        textExcerpt: parsed.textExcerpt,
        pagePreviewIds,
        warnings: [...parsed.warnings],
      };
      selection.result = result;
      return structuredClone(result);
    } catch (error) {
      this.#current(selection);
      const code =
        error instanceof SelectedFileError || error instanceof IngestionError
          ? error.code
          : error instanceof Error &&
              ['PARSER_TIMEOUT', 'PARSER_CRASHED', 'PARSER_CLOSED', 'PARSER_DISCONNECTED'].includes(
                error.message,
              )
            ? error.message
            : 'ATTACHMENT_PARSE_FAILED';
      const result: AttachmentPreview = {
        selectionId: selection.id,
        state: code === 'ATTACHMENT_UNSUPPORTED_FORMAT' ? 'unsupported' : 'failed',
        textExcerpt: '',
        pagePreviewIds: [],
        warnings: [code],
      };
      selection.result = result;
      return structuredClone(result);
    } finally {
      release?.();
    }
  }
  cancel(id: string) {
    this.#sync();
    const selection = this.#selections.get(id);
    if (!selection) throw new Error('ATTACHMENT_SELECTION_UNKNOWN');
    this.#selections.delete(id);
    selection.abort.abort();
    delete selection.bytes;
    this.deps.previews.remove(id);
  }
  async collect(ids: string[]): Promise<{ id: string; name: string; bytes: Uint8Array }[]> {
    this.#sync();
    if (ids.length > 20 || new Set(ids).size !== ids.length) throw new Error('ATTACHMENT_SELECTION_UNKNOWN');
    const rows = ids.map(id => {
      const row = this.#selections.get(id);
      if (!row) throw new Error('ATTACHMENT_SELECTION_UNKNOWN');
      return row;
    });
    const inputs = [];
    for (const row of rows) {
      this.#current(row);
      const bytes = row.bytes ?? await readSelectedFile(row.file);
      this.#current(row); row.bytes = bytes;
      inputs.push({ id: row.id, name: safeName(row.file.displayName), bytes: new Uint8Array(bytes) });
    }
    for (const row of rows) this.#current(row);
    return inputs;
  }
  clear() {
    this.#generation++;
    for (const selection of this.#selections.values()) {
      selection.abort.abort();
      delete selection.bytes;
    }
    this.#selections.clear();
    this.deps.previews.clear();
  }
  async close() {
    this.#closed = true;
    this.clear();
    await Promise.allSettled([...this.#pending]);
  }
}

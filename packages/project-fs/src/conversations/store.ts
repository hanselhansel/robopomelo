import { ProjectFsError } from '../errors.js';
import type { SafeRoot } from '../fs/safe-fs.js';
import { directory, jsonRead, jsonWrite, listOrEmpty, missing } from '../transactions/io.js';
export const CONVERSATION_STORE_LIMIT = 2000;
const EVENT_BYTE_LIMIT = 64 * 1024;
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const name = (sequence: number) => String(sequence).padStart(8, '0') + '.json';
const sequenceOf = (entry: string): number | null => (/^\d{8}\.json$/.test(entry) ? Number(entry.slice(0, 8)) : null);
export interface LoadedConversation {
  checkpoint: { sequence: number; state: unknown } | null;
  events: unknown[];
  lastSequence: number;
  damaged: string[];
}
/** Portable append-only conversation log under the project. Each event and
 * checkpoint is an immutable checksummed file, so a crash can only leave a
 * damaged tail that recovery reports and never replays past. */
export class ConversationStore {
  readonly base: string;
  constructor(private readonly root: SafeRoot, readonly conversationId: string) {
    if (!ID.test(conversationId)) throw new ProjectFsError('INVALID_PATH', 'Conversation identity must be a lowercase slug.');
    this.base = `conversations/${conversationId}`;
  }
  async #layout(): Promise<void> {
    for (const path of ['conversations', this.base, `${this.base}/events`, `${this.base}/checkpoints`]) await directory(this.root, path);
  }
  async #last(): Promise<number> {
    const entries = (await listOrEmpty(this.root, `${this.base}/events`)).map(sequenceOf).filter((value): value is number => value !== null);
    return entries.length ? Math.max(...entries) : 0;
  }
  async append(event: unknown): Promise<void> {
    const sequence = (event as { sequence?: unknown } | null)?.sequence;
    if (!event || typeof event !== 'object' || !Number.isSafeInteger(sequence) || (sequence as number) < 1)
      throw new ProjectFsError('SEQUENCE_INVALID', 'Conversation events need a positive integer sequence.');
    if (JSON.stringify(event).length > EVENT_BYTE_LIMIT)
      throw new ProjectFsError('LIMIT_EXCEEDED', 'A conversation event may not exceed 64 KiB.');
    await this.#layout();
    const last = await this.#last();
    // Re-appending an existing sequence is only accepted with identical bytes (immutable()).
    if ((sequence as number) > last + 1)
      throw new ProjectFsError('SEQUENCE_INVALID', `Expected conversation sequence ${last + 1}.`);
    if (sequence === last + 1 && last >= CONVERSATION_STORE_LIMIT)
      throw new ProjectFsError('CONVERSATION_LIMIT', 'This conversation reached its retained event limit.');
    await jsonWrite(this.root, `${this.base}/events/${name(sequence as number)}`, event);
  }
  async checkpoint(sequence: number, state: unknown): Promise<void> {
    await this.#layout();
    if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > (await this.#last()))
      throw new ProjectFsError('SEQUENCE_INVALID', 'A checkpoint must name an existing event sequence.');
    await jsonWrite(this.root, `${this.base}/checkpoints/${name(sequence)}`, { sequence, state });
  }
  async load(): Promise<LoadedConversation> {
    const damaged: string[] = [];
    let checkpoint: LoadedConversation['checkpoint'] = null;
    const checkpoints = (await listOrEmpty(this.root, `${this.base}/checkpoints`)).map(sequenceOf).filter((v): v is number => v !== null).sort((a, b) => b - a);
    for (const sequence of checkpoints) {
      const path = `${this.base}/checkpoints/${name(sequence)}`;
      try {
        const value = (await jsonRead(this.root, path)) as { sequence?: unknown; state?: unknown };
        if (value?.sequence !== sequence) throw new ProjectFsError('STORAGE_INVALID', 'Checkpoint sequence mismatch.');
        checkpoint = { sequence, state: value.state };
        break;
      } catch (error) {
        if (!(error instanceof ProjectFsError) && !missing(error)) throw error;
        damaged.push(path);
      }
    }
    const events: unknown[] = [];
    let lastSequence = checkpoint?.sequence ?? 0;
    const available = new Set((await listOrEmpty(this.root, `${this.base}/events`)).map(sequenceOf).filter((v): v is number => v !== null));
    while (available.has(lastSequence + 1)) {
      const path = `${this.base}/events/${name(lastSequence + 1)}`;
      try {
        const value = (await jsonRead(this.root, path)) as { sequence?: unknown };
        if (value?.sequence !== lastSequence + 1) throw new ProjectFsError('STORAGE_INVALID', 'Event sequence mismatch.');
        events.push(value);
        lastSequence++;
      } catch (error) {
        if (!(error instanceof ProjectFsError) && !missing(error)) throw error;
        damaged.push(path);
        break;
      }
    }
    return { checkpoint, events, lastSequence, damaged };
  }
}

import { randomUUID } from 'node:crypto';
import { ProjectFsError } from '../errors.js';
import type { SafeRoot } from '../fs/safe-fs.js';
import { byteHash } from '../transactions/digest.js';
import { directory, immutable, jsonRead, jsonWrite, listOrEmpty, metadataBytes, missing } from '../transactions/io.js';
import { RUN_ID, eventSha256, validateRunManifest, type RunManifest } from './manifest.js';

export const RUN_EVENT_LIMIT = 200_000;
export const RUN_EVENT_BYTE_LIMIT = 64 * 1024 * 1024;
export const RUN_STORE_LIMIT = 2000;
const CHECKPOINT = /^checkpoint-(\d{1,12})\.json$/;
export type RunCheckpoint = { runId: string; tick: number; state: unknown };
export type RunListing = {
  runId: string;
  /** complete: manifest present and checksummed; partial: interrupted before its manifest; damaged: unreadable manifest. */
  status: 'complete' | 'partial' | 'damaged';
  manifest: RunManifest | null;
  lastCheckpointTick: number | null;
};
export type StoredRun = { manifest: RunManifest; events: unknown[]; summary: unknown };

const checkRunId = (runId: string): void => { if (!RUN_ID.test(runId)) throw new ProjectFsError('INVALID_PATH', 'Run identity must be a lowercase slug.'); };

/** Immutable per-run storage under `runs/<runId>/`. `events.json` and
 * `summary.json` are written before `manifest.json`, so a manifest's presence
 * means the run is complete; the manifest is checksummed (jsonWrite) and its
 * eventSha256 is re-verified against the event bytes on every read. Checkpoints
 * are atomic snapshots a host writes while a run is still in flight. */
export class RunStore {
  constructor(private readonly root: SafeRoot) {}
  base(runId: string): string { checkRunId(runId); return `runs/${runId}`; }
  async #layout(runId: string): Promise<void> {
    for (const path of ['runs', this.base(runId)]) await directory(this.root, path);
  }
  async write(manifest: RunManifest, events: readonly unknown[], summary: unknown): Promise<void> {
    const checked = validateRunManifest(manifest);
    if (events.length > RUN_EVENT_LIMIT) throw new ProjectFsError('LIMIT_EXCEEDED', `A run may retain at most ${RUN_EVENT_LIMIT} events.`);
    if (checked.eventCount !== events.length) throw new ProjectFsError('RUN_MANIFEST_INVALID', 'Run manifest event count does not match the events.');
    const text = JSON.stringify(events);
    const bytes = Buffer.from(text);
    if (bytes.byteLength > RUN_EVENT_BYTE_LIMIT) throw new ProjectFsError('LIMIT_EXCEEDED', 'Run events exceed the 64 MiB limit.');
    if (byteHash(bytes) !== checked.eventSha256) throw new ProjectFsError('RUN_MANIFEST_INVALID', 'Run manifest eventSha256 does not match the events.');
    const existing = (await listOrEmpty(this.root, 'runs')).length;
    if (existing >= RUN_STORE_LIMIT && !(await this.#exists(`${this.base(checked.runId)}/manifest.json`))) throw new ProjectFsError('LIMIT_EXCEEDED', 'This project reached its retained run limit.');
    await this.#layout(checked.runId);
    const base = this.base(checked.runId);
    await immutable(this.root, `${base}/events.json`, bytes);
    await jsonWrite(this.root, `${base}/summary.json`, summary);
    await jsonWrite(this.root, `${base}/manifest.json`, checked);
    await this.root.fsyncDirectory(base);
  }
  async checkpoint(checkpoint: RunCheckpoint): Promise<void> {
    if (!Number.isSafeInteger(checkpoint.tick) || checkpoint.tick < 0) throw new ProjectFsError('SEQUENCE_INVALID', 'A checkpoint tick must be a non-negative integer.');
    await this.#layout(checkpoint.runId);
    const base = this.base(checkpoint.runId);
    const stage = `${base}/.checkpoint-${randomUUID()}.tmp`;
    const handle = await this.root.createExclusive(stage);
    try { await handle.write(metadataBytes(checkpoint)); await handle.sync(); } finally { await handle.close(); }
    await this.root.renameReplace(stage, `${base}/checkpoint-${checkpoint.tick}.json`);
    await this.root.fsyncDirectory(base);
  }
  async #exists(path: string): Promise<boolean> {
    try { await this.root.stat(path); return true; } catch (error) { if (missing(error)) return false; throw error; }
  }
  async #manifest(runId: string): Promise<RunManifest | null> {
    try {
      const manifest = validateRunManifest(await jsonRead(this.root, `${this.base(runId)}/manifest.json`));
      if (manifest.runId !== runId) throw new ProjectFsError('RUN_TAMPERED', 'Run manifest names a different run.');
      return manifest;
    } catch (error) { if (missing(error)) return null; throw error; }
  }
  async lastCheckpoint(runId: string): Promise<RunCheckpoint | null> {
    const ticks = (await listOrEmpty(this.root, this.base(runId))).map((e) => CHECKPOINT.exec(e)?.[1]).filter((t): t is string => t !== undefined).map(Number).sort((a, b) => b - a);
    for (const tick of ticks) {
      try {
        const value = (await jsonRead(this.root, `${this.base(runId)}/checkpoint-${tick}.json`)) as RunCheckpoint;
        if (value?.tick === tick && value.runId === runId) return value;
      } catch (error) { if (!(error instanceof ProjectFsError) && !missing(error)) throw error; }
    }
    return null;
  }
  async list(): Promise<RunListing[]> {
    const out: RunListing[] = [];
    for (const runId of (await listOrEmpty(this.root, 'runs')).filter((e) => RUN_ID.test(e)).sort()) {
      const checkpoint = await this.lastCheckpoint(runId);
      try {
        const manifest = await this.#manifest(runId);
        out.push({ runId, status: manifest ? 'complete' : 'partial', manifest, lastCheckpointTick: checkpoint?.tick ?? null });
      } catch (error) {
        if (!(error instanceof ProjectFsError)) throw error;
        out.push({ runId, status: 'damaged', manifest: null, lastCheckpointTick: checkpoint?.tick ?? null });
      }
    }
    return out;
  }
  /** Checksummed summary of a complete run without loading its events. */
  async summary(runId: string): Promise<unknown> {
    if (!(await this.#manifest(runId))) throw new ProjectFsError('RUN_NOT_FOUND', 'That run has no complete manifest in this project.');
    return jsonRead(this.root, `${this.base(runId)}/summary.json`);
  }
  async read(runId: string): Promise<StoredRun> {
    const manifest = await this.#manifest(runId);
    if (!manifest) throw new ProjectFsError('RUN_NOT_FOUND', 'That run has no complete manifest in this project.');
    const base = this.base(runId);
    let bytes: Buffer;
    try { bytes = await this.root.readFile(`${base}/events.json`, RUN_EVENT_BYTE_LIMIT); } catch (error) {
      if (missing(error)) throw new ProjectFsError('RUN_TAMPERED', 'Run events are missing.');
      throw error;
    }
    if (byteHash(bytes) !== manifest.eventSha256) throw new ProjectFsError('RUN_TAMPERED', 'Run events do not match the manifest eventSha256.');
    let events: unknown;
    try { events = JSON.parse(bytes.toString('utf8')); } catch { throw new ProjectFsError('RUN_TAMPERED', 'Run events are unreadable.'); }
    if (!Array.isArray(events) || events.length !== manifest.eventCount || eventSha256(events) !== manifest.eventSha256) throw new ProjectFsError('RUN_TAMPERED', 'Run events do not match the manifest.');
    return { manifest, events, summary: await jsonRead(this.root, `${base}/summary.json`) };
  }
  /** A stored run is stale when the current source compiles to a different semantic input hash. */
  static staleAgainst(manifest: RunManifest, currentInputHash: string | null): boolean { return manifest.inputHash !== currentInputHash; }
}

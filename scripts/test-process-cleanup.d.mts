import type { ChildProcess } from 'node:child_process';
export function cleanupFor(child: ChildProcess): () => Promise<void>;

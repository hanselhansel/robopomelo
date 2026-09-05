import type { Readable } from 'node:stream';
import { checkInputLimits } from '@robopomelo/spec';
import { DomainError } from '@robopomelo/core';
import { FileSelection } from '../../../packages/project-fs/src/evidence/selection.js';
export async function readInput(
  source: string,
  stdin: Readable,
  options: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<unknown> {
  if (!source) throw new DomainError('INVALID_INPUT', 'Supply a JSON input file or - for stdin.');
  const limit = options.maxBytes ?? 8 * 1024 * 1024;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 8 * 1024 * 1024)
    throw new DomainError('INVALID_INPUT', 'JSON input limit must be between one byte and 8 MiB.');
  const selected = source === '-' ? null : await FileSelection.open(source);
  const chunks: Buffer[] = [];
  let size = 0,
    timer: ReturnType<typeof setTimeout> | undefined;
  const consume = async () => {
    for await (const raw of selected ? selected.stream() : stdin) {
      if (!(raw instanceof Uint8Array) && typeof raw !== 'string')
        throw new DomainError('INVALID_INPUT', 'Input must contain UTF-8 bytes.');
      const chunk = Buffer.from(raw);
      size += chunk.byteLength;
      if (size > limit) throw new DomainError('INVALID_INPUT', 'JSON input exceeds the 8 MiB byte limit.');
      chunks.push(chunk);
    }
  };
  try {
    const read = consume();
    if (selected) await read;
    else
      await Promise.race([
        read,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            const error = new DomainError(
              'INVALID_INPUT',
              'JSON stdin did not finish before the input deadline. Supply a file or close the input stream.',
            );
            stdin.destroy(error);
            reject(error);
          }, options.timeoutMs ?? 30000);
        }),
      ]);
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    } catch {
      throw new DomainError('INVALID_INPUT', 'Input must be one valid UTF-8 JSON value.');
    }
    const invalid = checkInputLimits(value);
    if (invalid) throw new DomainError('INVALID_INPUT', 'JSON input exceeds structural limits.', invalid);
    return value;
  } finally {
    if (timer) clearTimeout(timer);
    await selected?.close();
  }
}

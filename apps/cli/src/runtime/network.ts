import { RuntimeError } from './errors.js';
export type FetchPublic = (url: string, signal: AbortSignal) => Promise<Response>;
export interface RequestOptions {
  offline?: boolean;
  maxBytes?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}
export function assertPublicURL(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RuntimeError('UPDATE_URL_DENIED', 'Invalid update URL.');
  }
  const path = url.pathname;
  const permitted =
    /^\/robopomelo(?:\/(?:latest|[0-9][0-9A-Za-z.+-]*))?$/.test(path) ||
    /^\/robopomelo\/-\/robopomelo-[0-9][0-9A-Za-z.+-]*\.tgz$/.test(path) ||
    /^\/-\/npm\/v1\/attestations\/robopomelo@[0-9][0-9A-Za-z.+-]*$/.test(path);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'registry.npmjs.org' ||
    (url.port && url.port !== '443') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !permitted
  )
    throw new RuntimeError(
      'UPDATE_URL_DENIED',
      'Update traffic is restricted to official public RoboPomelo registry endpoints.',
    );
  return url;
}
/** Sends only fixed public product URLs and generic headers, never project data. */
export class PublicReleaseNetwork {
  constructor(
    private readonly request: FetchPublic = (url, signal) =>
      fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal,
        headers: {
          accept: 'application/json, application/octet-stream',
          'user-agent': 'robopomelo-updater/1',
        },
      }),
  ) {}
  async consume(
    url: string,
    sink: (chunk: Uint8Array) => Promise<void>,
    options: RequestOptions = {},
  ): Promise<void> {
    if (options.offline) throw new RuntimeError('OFFLINE', 'Offline mode forbids update requests.');
    const controller = new AbortController(),
      signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    const timeout = setTimeout(
      () => controller.abort(new RuntimeError('UPDATE_TIMEOUT', 'The update request timed out.')),
      options.timeoutMs ?? 5000,
    );
    const aborted = new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      if (signal.aborted) reject(signal.reason);
    });
    const action = async () => {
      let target = url;
      for (let redirects = 0; redirects <= 3; redirects++) {
        assertPublicURL(target);
        const response = await this.request(target, signal);
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          await response.body?.cancel();
          if (!location) throw new RuntimeError('UPDATE_RESPONSE', 'Redirect has no destination.');
          target = new URL(location, target).href;
          assertPublicURL(target);
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw new RuntimeError('UPDATE_RESPONSE', 'Public release request failed.', {
            status: response.status,
          });
        }
        const limit = options.maxBytes ?? 2 * 1024 * 1024;
        const length = response.headers.get('content-length');
        if (length && Number(length) > limit) {
          await response.body?.cancel();
          throw new RuntimeError('UPDATE_LIMIT', 'Public response exceeds its byte limit.');
        }
        const reader = response.body?.getReader();
        if (!reader) return;
        let size = 0;
        const cancel = () => {
          void reader.cancel().catch(() => {});
        };
        signal.addEventListener('abort', cancel, { once: true });
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > limit)
              throw new RuntimeError('UPDATE_LIMIT', 'Public response exceeds its byte limit.');
            await sink(chunk.value);
          }
        } finally {
          signal.removeEventListener('abort', cancel);
          await reader.cancel().catch(() => {});
        }
        return;
      }
      throw new RuntimeError('UPDATE_REDIRECT_LIMIT', 'Too many release redirects.');
    };
    try {
      await Promise.race([action(), aborted]);
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
  }
  async json(url: string, options: RequestOptions = {}): Promise<unknown> {
    const chunks: Buffer[] = [];
    await this.consume(
      url,
      async (c) => {
        chunks.push(Buffer.from(c));
      },
      options,
    );
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    } catch {
      throw new RuntimeError('UPDATE_RESPONSE', 'Public release metadata is not valid JSON.');
    }
  }
}

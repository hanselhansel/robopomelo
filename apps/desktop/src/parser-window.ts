import { BrowserWindow, MessageChannelMain, protocol, session } from 'electron';
import { randomUUID } from 'node:crypto';
import { SafeRoot } from '@robopomelo/project-fs';
import { preflightAttachment } from '@robopomelo/ingestion';
import { checkedParserResponse, type ParserRequest, type ParserResponse } from './parser-contracts.js';
import { secureWebPreferences } from './window-policy.js';

const origin = 'rp-parser://local';
let registered = false;
export function registerParserScheme() {
  if (registered) return;
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'rp-parser',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ]);
  registered = true;
}
export interface ParserOptions {
  assetRoot: string;
  preload: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** The only readable resources are the parser's fixed, packaged assets. */
export async function createParserWindow(options: Pick<ParserOptions, 'assetRoot' | 'preload'>) {
  const assets = await SafeRoot.open(options.assetRoot);
  const isolated = session.fromPartition('rp-parser-' + randomUUID());
  let window: BrowserWindow | undefined;
  try {
    const manifest: unknown = JSON.parse((await assets.readFile('assets.json', 65536)).toString('utf8'));
    if (
      !Array.isArray(manifest) ||
      manifest.length > 500 ||
      manifest.some(
        (path) =>
          typeof path !== 'string' ||
          !/^(?:renderer\.js|worker\.mjs|fonts\/[a-zA-Z0-9_.-]+|cmaps\/[a-zA-Z0-9_.-]+)$/.test(path),
      )
    )
      throw new Error('PARSER_ASSETS_INVALID');
    const paths = new Set<string>(['index.html', ...manifest]);
    function resource(url: string) {
      try {
        const parsed = new URL(url);
        if (
          parsed.protocol !== 'rp-parser:' ||
          parsed.hostname !== 'local' ||
          parsed.port ||
          parsed.username ||
          parsed.password ||
          parsed.search ||
          parsed.hash
        )
          return null;
        const path = parsed.pathname.slice(1);
        return paths.has(path) ? path : null;
      } catch {
        return null;
      }
    }
    isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    isolated.setPermissionCheckHandler(() => false);
    isolated.setDevicePermissionHandler(() => false);
    isolated.webRequest.onBeforeRequest((details, callback) =>
      callback({ cancel: resource(details.url) === null }),
    );
    await isolated.protocol.handle('rp-parser', async (request) => {
      const path = resource(request.url);
      if (!path || request.method !== 'GET') return new Response(null, { status: 403 });
      try {
        const bytes = await assets.readFile(path, 16 * 1024 ** 2);
        return new Response(new Uint8Array(bytes), {
          headers: {
            'Content-Type': path.endsWith('.html')
              ? 'text/html'
              : /\.(?:js|mjs)$/.test(path)
                ? 'text/javascript'
                : 'application/octet-stream',
            'Content-Security-Policy':
              "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'",
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-store',
          },
        });
      } catch {
        return new Response(null, { status: 404 });
      }
    });
    window = new BrowserWindow({
      show: false,
      width: 1024,
      height: 768,
      webPreferences: {
        ...secureWebPreferences(options.preload),
        session: isolated,
        backgroundThrottling: false,
      },
    });
    const contents = window.webContents;
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event) => event.preventDefault());
    contents.on('will-redirect', (event) => event.preventDefault());
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.on('will-frame-navigate', (details) => details.preventDefault());
    let closed = false;
    return {
      window,
      url: origin + '/index.html',
      async close() {
        if (closed) return;
        closed = true;
        if (!window!.isDestroyed()) window!.destroy();
        isolated.protocol.unhandle('rp-parser');
        await assets.close();
      },
    };
  } catch (error) {
    if (window && !window.isDestroyed()) window.destroy();
    isolated.protocol.unhandle('rp-parser');
    await assets.close();
    throw error;
  }
}

export async function parseAttachment(
  input: { bytes: Uint8Array; displayName: string },
  options: ParserOptions,
): Promise<ParserResponse> {
  if (options.signal?.aborted) throw new Error('PARSER_CANCELLED');
  const preflight = preflightAttachment(input);
  const timeout = options.timeoutMs ?? 10000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 10000)
    throw new Error('PARSER_TIMEOUT_INVALID');
  const request: ParserRequest = {
    jobId: randomUUID(),
    generation: 0,
    format: preflight.format,
    bytes: new Uint8Array(input.bytes),
  };
  const host = await createParserWindow(options);
  const { port1, port2 } = new MessageChannelMain();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  try {
    return await new Promise<ParserResponse>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('PARSER_TIMEOUT')), timeout);
      cancel = () => reject(new Error('PARSER_CANCELLED'));
      options.signal?.addEventListener('abort', cancel, { once: true });
      if (options.signal?.aborted) {
        cancel();
        return;
      }
      host.window.webContents.once('render-process-gone', () => reject(new Error('PARSER_CRASHED')));
      host.window.once('closed', () => reject(new Error('PARSER_CLOSED')));
      port1.once('message', (event) => {
        try {
          resolve(checkedParserResponse(event.data, request));
        } catch {
          reject(new Error('PARSER_PROTOCOL_INVALID'));
        }
      });
      port1.once('close', () => reject(new Error('PARSER_DISCONNECTED')));
      port1.start();
      void host.window
        .loadURL(host.url)
        .then(() => {
          if (host.window.isDestroyed()) return;
          host.window.webContents.postMessage('robopomelo:parser-port', null, [port2]);
          port1.postMessage(request);
        })
        .catch(() => reject(new Error('PARSER_LOAD_FAILED')));
    });
  } finally {
    clearTimeout(timer);
    if (cancel) options.signal?.removeEventListener('abort', cancel);
    port1.close();
    port2.close();
    await host.close();
  }
}

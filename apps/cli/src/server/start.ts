import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { SafeRoot } from '../../../../packages/project-fs/src/fs/safe-fs.js';
import type { ProjectStatus, ServerOptions } from './contracts.js';
import { HttpError, checkOrigin, headers, jsonBody, matches, secret, sendJson } from './security.js';
import { matchRoute } from './router.js';
import { httpError } from './errors.js';
const media: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  woff2: 'font/woff2',
  svg: 'image/svg+xml',
  png: 'image/png',
  ico: 'image/x-icon',
};
export async function startServer(options: ServerOptions): Promise<{
  url: string;
  bootstrapUrl: string;
  setProjectStatus: (value: ProjectStatus) => void;
  close: () => Promise<void>;
}> {
  const now = options.clock ?? Date.now;
  const bootstrap = secret();
  const expires = now() + 120_000;
  let consumed = false,
    credential = '',
    csrf = '',
    origin = '';
  let status: ProjectStatus = { projectOpen: false, projectEpoch: '0' };
  const assets = options.assetRoot ? await SafeRoot.open(options.assetRoot) : undefined;
  const active = new Set<Promise<void>>();
  const server = createServer((request, response) => {
    const handle = async () => {
      headers(response);
      try {
        const method = request.method ?? 'GET';
        const mutation = !['GET', 'HEAD'].includes(method);
        checkOrigin(request, origin, mutation);
        const url = new URL(request.url ?? '/', origin);
        if (url.origin !== origin)
          throw new HttpError(403, 'HOST_DENIED', 'Absolute request target must match this local workspace.');
        if (url.pathname === '/api/session' && method === 'POST') {
          const body = (await jsonBody(request)) as { secret?: unknown };
          if (consumed || now() > expires || !matches(body?.secret, bootstrap))
            throw new HttpError(
              403,
              'BOOTSTRAP_INVALID',
              'Launch this workspace again to obtain a fresh browser link.',
            );
          consumed = true;
          credential = secret();
          csrf = secret();
          sendJson(response, 200, {
            ok: true,
            data: { credential, csrf, toolVersion: options.toolVersion, ...status },
          });
          return;
        }
        if (url.pathname.startsWith('/api/')) {
          if (!credential || !matches(request.headers.authorization, `Bearer ${credential}`))
            throw new HttpError(
              403,
              'SESSION_REQUIRED',
              'Open this workspace using its current launch link.',
            );
          if (mutation && !matches(request.headers['x-rp-csrf'], csrf))
            throw new HttpError(403, 'CSRF_DENIED', 'Refresh the authorized workspace before changing it.');
          if (url.pathname === '/api/session' && method === 'GET') {
            sendJson(response, 200, { ok: true, data: { toolVersion: options.toolVersion, ...status } });
            return;
          }
          const match = matchRoute(options.routes, method, url.pathname);
          if (!match) throw new HttpError(404, 'NOT_FOUND', 'This operation is not available.');
          if (
            match.route.projectScoped !== false &&
            request.headers['x-rp-project-epoch'] !== status.projectEpoch
          )
            throw new HttpError(
              409,
              'PROJECT_CHANGED',
              'The selected project changed. Refresh before continuing.',
            );
          const projectEpoch = status.projectEpoch;
          const body = mutation && !match.route.rawBody ? await jsonBody(request) : undefined;
          if (match.route.projectScoped !== false && projectEpoch !== status.projectEpoch)
            throw new HttpError(
              409,
              'PROJECT_CHANGED',
              'The selected project changed while the request was arriving. Refresh before continuing.',
            );
          const data = await match.route.handler({
            request,
            response,
            url,
            params: match.params,
            body,
            projectEpoch,
          });
          if (!response.writableEnded && !response.headersSent) sendJson(response, 200, { ok: true, data });
          return;
        }
        if (method !== 'GET' || !assets) throw new HttpError(404, 'NOT_FOUND', 'Page not found.');
        const path = decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
        const bytes = await assets.readFile(path, 16 * 1024 * 1024);
        response.setHeader('Content-Type', media[path.split('.').at(-1) ?? ''] ?? 'application/octet-stream');
        response.end(bytes);
      } catch (error) {
        if (response.headersSent) {
          response.destroy();
          return;
        }
        const http = httpError(error);
        sendJson(response, http.status, {
          ok: false,
          error: {
            code: http.code,
            message: http.message,
            cause: null,
            details: http.details,
            action:
              http.status === 500
                ? 'Inspect the change receipt or local diagnostics before retrying.'
                : http.message,
          },
        });
      }
    };
    const pending = handle();
    active.add(pending);
    void pending.finally(() => active.delete(pending));
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 1_000;
  server.listen({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url: origin,
    bootstrapUrl: `${origin}/#${bootstrap}`,
    setProjectStatus: (value) => {
      status = { ...value };
    },
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await Promise.allSettled(active);
      await options.onClose?.();
      await assets?.close();
    },
  };
}

import { createServer, type Server } from 'node:http';
import { createOpenRouterOAuth, ProviderError, type OpenRouterOAuth, type Transport } from '@robopomelo/providers';
export class OAuthFlowError extends Error {
  constructor(readonly code: 'AUTH_IN_PROGRESS' | 'AUTH_CANCELLED' | 'AUTH_EXPIRED' | 'AUTH_UNAVAILABLE', message: string) {
    super(message);
    this.name = 'OAuthFlowError';
  }
}
export interface OAuthFlowOptions {
  transport: Transport;
  /** Opens the validated provider URL in the system browser. */
  openExternal(url: string): Promise<void>;
  timeoutMs?: number;
  oauth?: OpenRouterOAuth;
}
type SecretSink<T> = (secret: string) => Promise<T>;
const PAGE = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px system-ui;margin:48px"><h1>${title}</h1><p>${body}</p></body>`;
/** One PKCE sign-in at a time. The loopback listener exists only for the
 * attempt, accepts exactly one matching callback, and the secret is passed
 * straight to the caller's sink without being retained or returned. */
export class OAuthLoopbackFlow {
  #active: { attemptId: string; abort: () => void } | null = null;
  readonly #oauth: OpenRouterOAuth;
  constructor(private readonly options: OAuthFlowOptions) {
    this.#oauth = options.oauth ?? createOpenRouterOAuth();
  }
  get busy(): boolean { return this.#active !== null; }
  async connect<T>(route: 'openrouter', sink: SecretSink<T>, signal?: AbortSignal): Promise<T> {
    if (route !== 'openrouter') throw new OAuthFlowError('AUTH_UNAVAILABLE', 'Only OpenRouter sign-in is available in this build.');
    if (this.#active) throw new OAuthFlowError('AUTH_IN_PROGRESS', 'Finish or cancel the sign-in already in progress.');
    if (signal?.aborted) throw new OAuthFlowError('AUTH_CANCELLED', 'Sign-in was cancelled.');
    const server = createServer();
    const port = await new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') return reject(new OAuthFlowError('AUTH_UNAVAILABLE', 'Loopback listener failed.'));
        resolve(address.port);
      });
    });
    const callbackUrl = `http://127.0.0.1:${port}/callback`;
    const begun = this.#oauth.beginAuthorization({ callbackUrl, now: Date.now() });
    const exchange = new AbortController();
    let settle!: (result: Promise<T>) => void;
    const outcome = new Promise<T>((resolve, reject) => { settle = (result) => result.then(resolve, reject); });
    let consumed = false;
    const finish = (result: Promise<T>) => { if (!consumed) { consumed = true; settle(result); } };
    const fail = (error: unknown) => finish(Promise.reject(error));
    const onAbort = () => { this.#oauth.cancelAuthorization(begun.attemptId); exchange.abort(); fail(new OAuthFlowError('AUTH_CANCELLED', 'Sign-in was cancelled.')); };
    const timer = setTimeout(() => { this.#oauth.cancelAuthorization(begun.attemptId); fail(new OAuthFlowError('AUTH_EXPIRED', 'Sign-in timed out. Start again from Settings.')); }, this.options.timeoutMs ?? 10 * 60_000);
    server.on('request', (request, response) => {
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
      const reply = (status: number, title: string, body: string) => { response.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }); response.end(PAGE(title, body)); };
      if (request.method !== 'GET' || url.pathname !== '/callback') return reply(404, 'Not found', 'This local page only receives the RoboPomelo sign-in callback.');
      const state = url.searchParams.get('state'), code = url.searchParams.get('code');
      if (!state || !code || consumed || state !== begun.state) return reply(400, 'Sign-in not accepted', 'This callback does not match the sign-in RoboPomelo started. Return to the app and try again.');
      consumed = true;
      const result = this.#oauth
        .completeAuthorization({ attemptId: begun.attemptId, state, code, now: Date.now(), transport: this.options.transport, signal: exchange.signal })
        .then(({ secret }) => sink(secret));
      result.then(
        () => reply(200, 'Connected', 'RoboPomelo is connected. You can close this tab and return to the app.'),
        () => reply(400, 'Sign-in failed', 'RoboPomelo could not finish the sign-in. Return to the app and try again.'),
      );
      settle(result);
    });
    this.#active = { attemptId: begun.attemptId, abort: onAbort };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      await this.options.openExternal(begun.url);
      return await outcome;
    } catch (error) {
      if (!consumed) this.#oauth.cancelAuthorization(begun.attemptId);
      throw error instanceof OAuthFlowError || error instanceof ProviderError ? error : new OAuthFlowError('AUTH_UNAVAILABLE', 'The sign-in could not be opened.');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      this.#active = null;
      await new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); });
    }
  }
  async close(): Promise<void> {
    this.#active?.abort();
  }
}
export type { Server };

import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}
export function secret(): string {
  return randomBytes(32).toString('base64url');
}
export function matches(value: unknown, expected: string): boolean {
  return (
    typeof value === 'string' &&
    Buffer.byteLength(value) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(value), Buffer.from(expected))
  );
}
export function headers(response: ServerResponse): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  );
}
export function checkOrigin(request: IncomingMessage, origin: string, mutation: boolean): void {
  const url = new URL(origin);
  if (request.headers.host !== url.host)
    throw new HttpError(403, 'HOST_DENIED', 'Request host does not match this local workspace.');
  const supplied = request.headers.origin;
  if (
    (supplied !== undefined && supplied !== origin) ||
    (mutation && supplied !== origin) ||
    request.headers['sec-fetch-site'] === 'cross-site'
  )
    throw new HttpError(403, 'ORIGIN_DENIED', 'Request origin does not match this local workspace.');
}
export async function jsonBody(request: IncomingMessage): Promise<unknown> {
  if (request.headers['content-type']?.split(';')[0]?.trim() !== 'application/json')
    throw new HttpError(415, 'CONTENT_TYPE', 'Use application/json for this operation.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024)
      throw new HttpError(413, 'LIMIT_EXCEEDED', 'Request exceeds the 8 MiB limit.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Request body is not valid UTF-8 JSON.');
  }
}
export function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(value));
}

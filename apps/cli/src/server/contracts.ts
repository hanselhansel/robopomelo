import type { IncomingMessage, ServerResponse } from 'node:http';
export interface RouteContext {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  params: Record<string, string>;
  body: unknown;
  projectEpoch: string;
}
export interface Route {
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  projectScoped?: boolean;
  rawBody?: boolean;
  handler: (context: RouteContext) => Promise<unknown>;
}
export interface ProjectStatus {
  projectOpen: boolean;
  projectEpoch: string;
  root?: string;
  scopes?: string[];
  mode?: string;
}
export interface ServerOptions {
  toolVersion: string;
  routes: Route[];
  assetRoot?: string;
  clock?: () => number;
  onClose?: () => Promise<void>;
}

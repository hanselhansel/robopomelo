import type { Route } from './contracts.js';
export function matchRoute(
  routes: Route[],
  method: string,
  path: string,
): { route: Route; params: Record<string, string> } | undefined {
  const incoming = path.split('/');
  for (const route of routes) {
    if (route.method !== method) continue;
    const pattern = route.path.split('/');
    if (pattern.length !== incoming.length) continue;
    const params: Record<string, string> = {};
    let match = true;
    for (let i = 0; i < pattern.length; i++) {
      const part = pattern[i]!,
        actual = incoming[i]!;
      if (part.startsWith(':') && actual) params[part.slice(1)] = decodeURIComponent(actual);
      else if (part !== actual) {
        match = false;
        break;
      }
    }
    if (match) return { route, params };
  }
  return undefined;
}

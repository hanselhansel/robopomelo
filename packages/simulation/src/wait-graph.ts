import { orderRobotIds } from './clock.js';

/** `robotId` cannot proceed because `blockerId` holds `resourceId`. */
export type WaitEdge = { robotId: string; blockerId: string; resourceId: string };
export type WaitCycle = { robotIds: string[]; resourceIds: string[] };

/** Directed wait-for graph among robots. Cycle detection returns every elementary
 * cycle reachable by depth-first search from robots in canonical order, with the
 * robot ids and the resource ids of the edges that close the cycle. Deterministic:
 * adjacency is sorted by blocker id and each cycle is reported once. */
export function findWaitCycles(edges: readonly WaitEdge[]): WaitCycle[] {
  const adjacency = new Map<string, WaitEdge[]>();
  for (const e of edges) {
    if (e.robotId === e.blockerId) continue;
    const list = adjacency.get(e.robotId);
    if (list) list.push(e); else adjacency.set(e.robotId, [e]);
  }
  for (const list of adjacency.values()) list.sort((a, b) => (a.blockerId < b.blockerId ? -1 : a.blockerId > b.blockerId ? 1 : a.resourceId < b.resourceId ? -1 : a.resourceId > b.resourceId ? 1 : 0));
  const color = new Map<string, 'grey' | 'black'>();
  const stack: WaitEdge[] = [];
  const seen = new Set<string>();
  const cycles: WaitCycle[] = [];
  const visit = (robot: string): void => {
    color.set(robot, 'grey');
    for (const edge of adjacency.get(robot) ?? []) {
      const state = color.get(edge.blockerId);
      if (state === 'black') continue;
      if (state === 'grey') {
        const start = stack.findIndex((e) => e.robotId === edge.blockerId);
        const loop = [...stack.slice(start), edge];
        const robotIds = orderRobotIds(loop.map((e) => e.robotId));
        const resourceIds = [...new Set(loop.map((e) => e.resourceId))].sort();
        const key = robotIds.join('|');
        if (!seen.has(key)) { seen.add(key); cycles.push({ robotIds, resourceIds }); }
        continue;
      }
      stack.push(edge);
      visit(edge.blockerId);
      stack.pop();
    }
    color.set(robot, 'black');
  };
  for (const robot of orderRobotIds([...adjacency.keys()])) if (!color.has(robot)) visit(robot);
  return cycles;
}

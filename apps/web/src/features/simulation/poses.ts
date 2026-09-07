import type { Pose } from '@robopomelo/spec';
import type { RunRobot, SimEvent } from './types.js';
export type RobotPose = { id: string; pose: Pose; loaded: boolean; moving: boolean };
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
/** Pose at `tick` from compact legs [depart, arrive, x0, y0, yaw0, x1, y1, yaw1, loaded]:
 * the last leg departing at or before the tick, linearly interpolated between its
 * endpoints. Renderers get poses, never the event stream. */
export function poseAt(robot: RunRobot, tick: number): RobotPose {
  let current: number[] | null = null;
  for (const leg of robot.legs) { if (leg[0]! > tick) break; current = leg; }
  if (!current) return { id: robot.id, pose: robot.start, loaded: false, moving: false };
  const [depart, arrive, x0, y0, yaw0, x1, y1, yaw1, loaded] = current as [number, number, number, number, number, number, number, number, number];
  if (tick >= arrive || arrive <= depart) return { id: robot.id, pose: { xM: x1, yM: y1, zM: robot.start.zM, yawRad: yaw1 }, loaded: loaded === 1, moving: false };
  const t = (tick - depart) / (arrive - depart);
  return { id: robot.id, pose: { xM: x0 + (x1 - x0) * t, yM: y0 + (y1 - y0) * t, zM: robot.start.zM, yawRad: yaw0 + wrap(yaw1 - yaw0) * t }, loaded: loaded === 1, moving: true };
}
export const posesAt = (robots: readonly RunRobot[], tick: number): RobotPose[] => robots.map((r) => poseAt(r, tick));
const field = (reason: string, key: string): string | null => new RegExp(`(?:^|\\s)${key}:(\\S+)`).exec(reason)?.[1] ?? null;
export type Reason = { tick: number; kind: SimEvent['kind']; text: string };
/** Readable reason chain of one robot's recent events, newest last. */
export function reasonChain(events: readonly SimEvent[], robotId: string, limit = 12): Reason[] {
  const out: Reason[] = [];
  for (const e of events) {
    if (e.robotId !== robotId) continue;
    let text: string;
    switch (e.kind) {
      case 'assigned': text = `Assigned ${e.taskId ?? 'task'} (pickup ${e.resourceId ?? 'unknown'})`; break;
      case 'moving': text = `${e.reason.startsWith('retreat') ? 'Retreating' : 'Moving'} to ${e.resourceId ?? 'a holding pose'}, ticks ${field(e.reason, 'depart') ?? '?'} to ${field(e.reason, 'arrive') ?? '?'}`; break;
      case 'waiting': {
        const blocker = field(e.reason, 'blocked-by') ?? field(e.reason, 'by');
        const rejected = field(e.reason, 'rejected');
        text = rejected ? `Rejected ${e.taskId ?? 'task'}: ${rejected}` : `Waiting for ${e.resourceId ?? 'a resource'}${blocker ? `, held by ${blocker}` : ''}${e.reason.startsWith('delayed-until') ? ` until tick ${field(e.reason, 'delayed-until')}` : ''}`;
        break;
      }
      case 'loading': text = `Servicing at ${e.resourceId ?? 'station'} until tick ${field(e.reason, 'until') ?? '?'}`; break;
      case 'completed': text = e.reason === 'completed' ? `Completed ${e.taskId ?? 'task'}` : `Failed ${e.taskId ?? 'task'}: ${e.reason.replace(/^failed:/, '')}`; break;
      case 'deadlock': text = `Deadlock member: waiting on ${e.resourceId ?? 'a resource'}, wait-for ${field(e.reason, 'wait-for') ?? 'unknown'}`; break;
    }
    out.push({ tick: e.tick, kind: e.kind, text });
  }
  return out.slice(-limit);
}

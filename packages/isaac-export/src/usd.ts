import type { CompiledObject } from '@robopomelo/spatial';
import { fail } from './errors.js';
import type { IsaacExportPlan } from './plan.js';
/** Deterministic `scene.usda` text. Geometry comes only from the canonical
 * compiler (world collision polygons and z intervals). Robot prims reference
 * the profile's fixed relative asset path and nothing else, and only in
 * runnable-reference mode. All text placed in customData is validated so an
 * instance id can never inject a reference, a prim or a new statement. */
const UNSAFE = /[@<>"\\\n\r\u0000-\u001f\u007f]|<\//;
export function assertSafeCustomData(value: string, field: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256 || UNSAFE.test(value)) fail('UNSAFE_TEXT', `${field} contains characters that are not allowed in USD metadata (@ < > " \\ or control characters).`);
  return value;
}
/** Six decimals, no negative zero, no exponent for the magnitudes we emit. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return fail('NUMBER_INVALID', `${n} is not a finite number.`);
  const r = Math.round(n * 1e6) / 1e6;
  return r === 0 ? '0' : r.toFixed(6).replace(/\.?0+$/, '');
}
export function primName(id: string): string {
  const cleaned = id.replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned}`;
}
function localBox(object: CompiledObject): { cx: number; cy: number; lengthM: number; widthM: number } {
  const { xM, yM, yawRad } = object.display.pose, c = Math.cos(yawRad), s = Math.sin(yawRad);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [wx, wy] of object.collision.polygon) {
    const dx = wx - xM, dy = wy - yM, lx = dx * c + dy * s, ly = -dx * s + dy * c;
    minX = Math.min(minX, lx); maxX = Math.max(maxX, lx); minY = Math.min(minY, ly); maxY = Math.max(maxY, ly);
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, lengthM: maxX - minX, widthM: maxY - minY };
}
const customData = (rows: [string, string][]): string =>
  ['        customData = {', ...rows.map(([key, value]) => `            string "robopomelo:${key}" = "${assertSafeCustomData(value, key)}"`), '        }'].join('\n');
const xform = (object: CompiledObject): string => [
  `        double3 xformOp:translate = (${fmt(object.display.pose.xM)}, ${fmt(object.display.pose.yM)}, ${fmt(object.display.pose.zM)})`,
  `        double xformOp:rotateZ = ${fmt((object.display.pose.yawRad * 180) / Math.PI)}`,
  '        uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateZ"]',
].join('\n');
function collisionCube(object: CompiledObject): string {
  const box = localBox(object), { zMinM, zMaxM } = object.collision;
  return [
    '        def Cube "Collision"', '        {', '            double size = 1',
    `            double3 xformOp:translate = (${fmt(box.cx)}, ${fmt(box.cy)}, ${fmt((zMinM + zMaxM) / 2 - object.display.pose.zM)})`,
    `            float3 xformOp:scale = (${fmt(box.lengthM)}, ${fmt(box.widthM)}, ${fmt(zMaxM - zMinM)})`,
    '            uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]', '        }',
  ].join('\n');
}
function floorPrim(plan: IsaacExportPlan): string {
  const { lengthM, widthM } = plan.floor;
  return [
    '    def Cube "Floor"', '    {', '        double size = 1',
    `        double3 xformOp:translate = (${fmt(lengthM / 2)}, ${fmt(widthM / 2)}, -0.05)`,
    `        float3 xformOp:scale = (${fmt(lengthM)}, ${fmt(widthM)}, 0.1)`,
    '        uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]', '    }',
  ].join('\n');
}
export function renderUsda(plan: IsaacExportPlan): string {
  const allowed = new Set(plan.profile.supportedRobotAssets.map((asset) => asset.usdRelativePath));
  const runnable = plan.mode === 'runnable-reference', names = new Map<string, string>(), blocks: string[] = [];
  for (const object of plan.scene.objects) {
    const robot = plan.robots.find((row) => row.id === object.instanceId);
    const name = robot ? `robot_${primName(object.instanceId)}` : primName(object.instanceId);
    const previous = names.get(name);
    if (previous !== undefined) fail('PRIM_NAME_COLLISION', `instances ${previous} and ${object.instanceId} both map to prim ${name}.`);
    names.set(name, object.instanceId);
    const rows: [string, string][] = [['instanceId', object.instanceId], ['assetId', object.assetId], ['assetVersion', object.assetVersion], ['dimensionState', object.dimensionState]];
    const meta = [customData(robot && runnable ? [...rows, ['targetRobot', robot.targetRobot]] : rows)];
    if (robot && runnable) {
      if (!allowed.has(robot.usdRelativePath) || /^[/\\]|:|@|\.\./.test(robot.usdRelativePath)) fail('REFERENCE_NOT_ALLOWED', `robot ${robot.id} reference ${robot.usdRelativePath} is not the profile asset path.`);
      meta.push(`        references = @${robot.usdRelativePath}@`);
    }
    const body = robot && runnable ? xform(object) : `${xform(object)}\n\n${collisionCube(object)}`;
    blocks.push(`\n    def Xform "${name}" (\n${meta.join('\n')}\n    )\n    {\n${body}\n    }`);
  }
  return [
    '#usda 1.0', '(', '    defaultPrim = "World"',
    '    doc = "RoboPomelo Isaac export. Canonical meters, seconds, radians; right-handed Z-up."',
    `    metersPerUnit = ${plan.profile.metersPerUnit}`, `    upAxis = "${plan.profile.upAxis}"`, ')', '',
    'def Xform "World"', '{', floorPrim(plan), ...blocks, '}', '',
  ].join('\n');
}

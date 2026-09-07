import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../packages/spatial/src/index.js';
import { buildIsaacExport, planIsaacExport, IsaacExportError, ISAAC_6_0_0_UBUNTU_2404_X86_64, RUN_PY, README_MD } from '../../packages/isaac-export/src/index.js';
import { runnableFixture, input, robot, station, text, member, json } from './fixture.js';

const object = (name: string, id: string, asset: string, pose: string, deg: string, collisionZ: string, scale: string) => `
    def Xform "${name}" (
        customData = {
            string "robopomelo:instanceId" = "${id}"
            string "robopomelo:assetId" = "${asset}"
            string "robopomelo:assetVersion" = "1.0.0"
            string "robopomelo:dimensionState" = "known"
        }
    )
    {
        double3 xformOp:translate = (${pose})
        double xformOp:rotateZ = ${deg}
        uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateZ"]

        def Cube "Collision"
        {
            double size = 1
            double3 xformOp:translate = (0, 0, ${collisionZ})
            float3 xformOp:scale = (${scale})
            uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]
        }
    }
`;
const jetbot = (name: string, id: string, pose: string) => `
    def Xform "${name}" (
        customData = {
            string "robopomelo:instanceId" = "${id}"
            string "robopomelo:assetId" = "robot-differential"
            string "robopomelo:assetVersion" = "1.0.0"
            string "robopomelo:dimensionState" = "known"
            string "robopomelo:targetRobot" = "jetbot"
        }
        references = @Isaac/Robots/NVIDIA/Jetbot/jetbot.usd@
    )
    {
        double3 xformOp:translate = (${pose})
        double xformOp:rotateZ = 0
        uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateZ"]
    }
`;
export const GOLDEN_USDA = `#usda 1.0
(
    defaultPrim = "World"
    doc = "RoboPomelo Isaac export. Canonical meters, seconds, radians; right-handed Z-up."
    metersPerUnit = 1
    upAxis = "Z"
)

def Xform "World"
{
    def Cube "Floor"
    {
        double size = 1
        double3 xformOp:translate = (8, 5, -0.05)
        float3 xformOp:scale = (16, 10, 0.1)
        uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]
    }
${object('rack_1', 'rack-1', 'rack-bay', '5, 5, 0', '0', '2', '2.7, 1.1, 4')}${object('rack_2', 'rack-2', 'rack-bay', '14, 5, 0', '90', '2', '2.7, 1.1, 4')}${jetbot('robot_robot_a', 'robot-a', '2, 2, 0')}${jetbot('robot_robot_b', 'robot-b', '2, 8, 0')}${object('station_drop', 'station-drop', 'station', '10, 2, 0', '0', '0.1', '1.4, 1.4, 0.2')}${object('station_pick', 'station-pick', 'station', '10, 8, 0', '0', '0.1', '1.4, 1.4, 0.2')}}
`;

describe('runnable reference export', () => {
  const result = buildIsaacExport(input(runnableFixture()));
  const paths = result.members.map((m) => m.path);
  it('produces the runnable-reference bundle with every declared file', () => {
    expect(result.plan.mode).toBe('runnable-reference');
    expect(result.plan.remainingSetup).toEqual([]);
    expect(paths).toEqual(['isaac/asset-requirements.json', 'isaac/bindings.json', 'isaac/manifest.json', 'isaac/readme.md', 'isaac/run.py', 'isaac/scenario.json', 'isaac/scene.usda', 'isaac/unsupported.json']);
  });
  it('matches the scene.usda golden exactly: units, axes, poses, stable ids, fixed robot reference', () => {
    expect(text(member(result.members, 'isaac/scene.usda').bytes)).toBe(GOLDEN_USDA);
  });
  it('is byte-identical on repeated export and hashes every member in the manifest', () => {
    const again = buildIsaacExport(input(runnableFixture()));
    expect(again.members.map((m) => [m.path, sha256Hex(m.bytes)])).toEqual(result.members.map((m) => [m.path, sha256Hex(m.bytes)]));
    const manifest = json<{ files: { path: string; sha256: string; size: number }[]; runnableBadge: boolean; mode: string; target: { targetId: string; upAxis: string; metersPerUnit: number }; source: Record<string, string>; generatedAt: string; run: null }>(result.members, 'isaac/manifest.json');
    expect(manifest.files.map((f) => f.path).sort()).toEqual(paths.filter((p) => p !== 'isaac/manifest.json'));
    for (const file of manifest.files) {
      const m = member(result.members, file.path);
      expect(file.sha256).toBe(sha256Hex(m.bytes));
      expect(file.size).toBe(m.bytes.byteLength);
    }
    expect(manifest).toMatchObject({ runnableBadge: true, mode: 'runnable-reference', generatedAt: '2026-09-07T00:00:00.000Z', run: null, target: { targetId: 'isaac-sim-6.0.0-ubuntu24.04-x86_64', upAxis: 'Z', metersPerUnit: 1 }, source: { projectId: 'project-1', sourceRevision: 'rev-3' } });
  });
  it('writes the scenario contract: stations, robots, deterministic goals, shared intersection, thresholds', () => {
    const scenario = json<Record<string, unknown> & { goals: { jobId: string; robotId: string; fromStationId: string; toStationId: string }[]; robots: { id: string; targetRobot: string; profileId: string }[]; stations: { id: string; kind: string; pose: { xM: number } }[]; sharedIntersection: { xM: number; yM: number } | null }>(result.members, 'isaac/scenario.json');
    expect(scenario.robots.map((r) => [r.id, r.targetRobot, r.profileId])).toEqual([['robot-a', 'jetbot', 'profile-differential'], ['robot-b', 'jetbot', 'profile-differential']]);
    expect(scenario.stations.map((s) => [s.id, s.kind, s.pose.xM])).toEqual([['pick', 'pickup', 10], ['drop', 'dropoff', 10]]);
    expect(scenario.goals).toHaveLength(20);
    expect(scenario.goals.slice(0, 2)).toEqual([
      { jobId: 'job-0000', robotId: 'robot-a', fromStationId: 'pick', toStationId: 'drop' },
      { jobId: 'job-0001', robotId: 'robot-b', fromStationId: 'drop', toStationId: 'pick' },
    ]);
    expect(scenario.sharedIntersection).toEqual({ xM: 6, yM: 5, cellM: 1 });
    expect(scenario.controller).toEqual({ poseFeedback: 'measured', command: 'differential-wheel-velocities', teleportAfterInit: false });
    expect(scenario.thresholds).toEqual({ finalPositionErrorM: 0.1, headingErrorRad: 0.15 });
    expect(scenario.units).toEqual({ length: 'm', time: 's', angle: 'rad', upAxis: 'Z', handedness: 'right' });
  });
  it('lists asset requirements as operator obligations and never bundles NVIDIA assets', () => {
    const req = json<{ bundled: boolean; statement: string; assets: { usdRelativePath: string; sha256: string | null; assetPackName: string }[] }>(result.members, 'isaac/asset-requirements.json');
    expect(req.bundled).toBe(false);
    expect(req.assets).toEqual([{ catalogId: 'robot-differential', targetRobot: 'jetbot', usdRelativePath: 'Isaac/Robots/NVIDIA/Jetbot/jetbot.usd', assetPackName: 'Isaac Sim 6.0.0 core assets (separately installed, NVIDIA license)', sha256: null, checksumStatus: 'operator-must-record' }]);
    expect(req.statement).toMatch(/not bundled/);
    expect(member(result.members, 'isaac/run.py').bytes.byteLength).toBeGreaterThan(1000);
    expect(text(member(result.members, 'isaac/run.py').bytes)).toBe(RUN_PY);
    expect(text(member(result.members, 'isaac/readme.md').bytes)).toBe(README_MD);
  });
  it('carries binding explanations and an unsupported report that names non-throughput omissions', () => {
    const bindings = json<{ id: string; state: string; text: string }[]>(result.members, 'isaac/bindings.json');
    expect(bindings).toHaveLength(1);
    expect(bindings[0]).toMatchObject({ id: 'binding-rack', state: 'known' });
    expect(bindings[0]!.text).toMatch(/instance.dimensions for rack-1/);
    const unsupported = json<{ entries: unknown[] }>(result.members, 'isaac/unsupported.json');
    expect(unsupported.entries).toEqual([]);
  });
});

describe('importable-only exports', () => {
  const badge = (ext = runnableFixture()) => {
    const out = buildIsaacExport(input(ext));
    const manifest = json<{ runnableBadge: boolean; mode: string }>(out.members, 'isaac/manifest.json');
    const unsupported = json<{ entries: { code: string; id: string }[] }>(out.members, 'isaac/unsupported.json');
    return { out, manifest, unsupported };
  };
  it('three robots: extra robot is omitted and reported, no badge', () => {
    const ext = runnableFixture();
    ext.scenes[0]!.instances.push(robot('robot-c', { xM: 4, yM: 5, zM: 0, yawRad: 0 }));
    const { out, manifest, unsupported } = badge(ext);
    expect(manifest).toMatchObject({ runnableBadge: false, mode: 'importable-only' });
    expect(out.plan.remainingSetup).toContainEqual(expect.stringMatching(/3 supported robots.*maxRobots 2/));
    expect(unsupported.entries).toContainEqual(expect.objectContaining({ code: 'ROBOT_BEYOND_MAX', id: 'robot-c' }));
    expect(text(member(out.members, 'isaac/scene.usda').bytes)).not.toContain('references =');
  });
  it('omnidirectional robot: unsupported drive reported, no badge', () => {
    const ext = runnableFixture();
    ext.scenes[0]!.instances.push(robot('robot-o', { xM: 4, yM: 5, zM: 0, yawRad: 0 }, 'robot-omnidirectional'));
    const { manifest, unsupported, out } = badge(ext);
    expect(manifest.runnableBadge).toBe(false);
    expect(out.plan.remainingSetup).toContainEqual(expect.stringMatching(/robot-o.*omnidirectional/));
    expect(unsupported.entries).toContainEqual(expect.objectContaining({ code: 'DRIVE_UNSUPPORTED', id: 'robot-o' }));
  });
  it('charger station: unsupported station kind reported, no badge', () => {
    const ext = runnableFixture();
    ext.scenes[0]!.instances.push(station('station-charge', { xM: 14, yM: 9, zM: 0, yawRad: 0 }, 'charger'));
    ext.scenarios[0]!.stations.push({ id: 'charge', instanceId: 'station-charge', kind: 'charger', capacity: 1 });
    const { manifest, unsupported, out } = badge(ext);
    expect(manifest.runnableBadge).toBe(false);
    expect(out.plan.remainingSetup).toContainEqual(expect.stringMatching(/charge.*charger/));
    expect(unsupported.entries).toContainEqual(expect.objectContaining({ code: 'STATION_KIND_UNSUPPORTED', id: 'charge' }));
  });
  it('missing workload: no goals, explicit remaining setup, no badge', () => {
    const ext = runnableFixture();
    ext.scenarios[0]!.workload = null;
    const { manifest, unsupported, out } = badge(ext);
    expect(manifest.runnableBadge).toBe(false);
    expect(out.plan.remainingSetup).toContainEqual(expect.stringMatching(/workload/));
    expect(unsupported.entries).toContainEqual(expect.objectContaining({ code: 'WORKLOAD_MISSING' }));
    expect(json<{ goals: unknown[] }>(out.members, 'isaac/scenario.json').goals).toEqual([]);
  });
  it('stale bindings and non-throughput objectives are reported, never silently dropped', () => {
    const ext = runnableFixture();
    ext.bindings[0]!.knowledgeState = 'stale';
    ext.scenarios[0]!.objectives.push({ id: 'objective-cost', kind: 'cost', direction: 'minimize', threshold: null, unit: 'usd', sourceIds: [] });
    const { unsupported, manifest } = badge(ext);
    expect(unsupported.entries).toContainEqual(expect.objectContaining({ code: 'BINDING_NOT_CONFIRMED', id: 'binding-rack' }));
    expect(unsupported.entries).toContainEqual(expect.objectContaining({ code: 'OBJECTIVE_UNSUPPORTED', id: 'objective-cost' }));
    expect(manifest.runnableBadge).toBe(false);
  });
  it('requireRunnable with incomplete mapping throws MAPPING_INCOMPLETE before any member exists', () => {
    const ext = runnableFixture();
    ext.scenarios[0]!.workload = null;
    let error: unknown;
    try { buildIsaacExport(input(ext, { requireRunnable: true })); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(IsaacExportError);
    expect((error as IsaacExportError).code).toBe('MAPPING_INCOMPLETE');
    expect((error as IsaacExportError).message).toMatch(/workload/);
    expect(() => planIsaacExport(input(ext, { requireRunnable: true }))).toThrow(/MAPPING_INCOMPLETE|workload/);
  });
});

describe('input rejection', () => {
  it('rejects an instance whose asset hash differs from the catalog (compile error)', () => {
    const ext = runnableFixture();
    ext.scenes[0]!.instances[0]!.asset = { ...ext.scenes[0]!.instances[0]!.asset, sha256: 'f'.repeat(64) };
    expect(() => buildIsaacExport(input(ext))).toThrow(/ASSET_HASH_MISMATCH|different content hash/);
  });
  it('rejects unknown scene or scenario ids', () => {
    expect(() => buildIsaacExport(input(runnableFixture(), { scenarioId: 'nope' }))).toThrowError(expect.objectContaining({ code: 'RECORD_NOT_FOUND' }));
    expect(() => buildIsaacExport(input(runnableFixture(), { sceneId: 'nope' }))).toThrowError(expect.objectContaining({ code: 'RECORD_NOT_FOUND' }));
  });
  it('rejects a scenario that belongs to a different scene', () => {
    const ext = runnableFixture();
    ext.scenes.push({ ...ext.scenes[0]!, id: 'scene-2' });
    expect(() => buildIsaacExport(input(ext, { sceneId: 'scene-2' }))).toThrowError(expect.objectContaining({ code: 'RECORD_NOT_FOUND' }));
  });
  it('documents the profile: exact target, null checksum means operator must record', () => {
    expect(ISAAC_6_0_0_UBUNTU_2404_X86_64).toMatchObject({ targetId: 'isaac-sim-6.0.0-ubuntu24.04-x86_64', isaacVersion: '6.0.0', os: 'ubuntu-24.04', arch: 'x86_64', upAxis: 'Z', metersPerUnit: 1, maxRobots: 2, maxStations: 2, maxIntersections: 1, supportedDrives: ['differential'], supportedLoadTypes: ['none'] });
    expect(ISAAC_6_0_0_UBUNTU_2404_X86_64.supportedRobotAssets[0]!.sha256).toBeNull();
    expect(ISAAC_6_0_0_UBUNTU_2404_X86_64.unsupported.features).toContain('multi-floor');
  });
});

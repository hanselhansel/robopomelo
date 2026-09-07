// Deterministic generator for fixtures/fleet-50.json. Values are synthetic
// planning assumptions for benchmarking, not measurements of any real site.
import { writeFile } from 'node:fs/promises';
const asset = (id) => ({ id, version: '1.0.0', sha256: 'f'.repeat(64) });
const known = (value, sourceIds = []) => ({ state: 'known', value, sourceIds });
const pose = (xM, yM, yawRad = 0) => ({ xM, yM, zM: 0, yawRad });
const floor = { lengthM: 120, widthM: 60 };
const instances = [];
// Six rack rows (36 m x 1.2 m) with 4.5 m aisles, leaving a 12 m receiving apron at x < 12 and a 12 m shipping apron at x > 108.
for (let row = 0; row < 6; row++) {
  const y = 12 + row * 6;
  for (const x of [30, 70]) instances.push({ id: `rack-r${row}-x${x}`, asset: asset('rack-row'), pose: pose(x, y), dimensions: known({ lengthM: 36, widthM: 1.2, heightM: 6 }), sourceIds: [] });
}
// Stations: 10 pickup docks on the receiving apron, 6 drop-off lanes on the shipping apron, 4 chargers along the north wall, 8 holding poses.
const stations = [];
for (let i = 0; i < 10; i++) { const id = `station-pickup-${i}`; instances.push({ id, asset: asset('station'), pose: pose(4, 6 + i * 5.2), dimensions: known({ lengthM: 1.4, widthM: 1.4, heightM: 0.2 }), sourceIds: [] }); stations.push({ id, instanceId: id, kind: 'pickup', capacity: 2 }); }
for (let i = 0; i < 6; i++) { const id = `station-dropoff-${i}`; instances.push({ id, asset: asset('station'), pose: pose(116, 8 + i * 8), dimensions: known({ lengthM: 1.4, widthM: 1.4, heightM: 0.2 }), sourceIds: [] }); stations.push({ id, instanceId: id, kind: 'dropoff', capacity: 2 }); }
for (let i = 0; i < 4; i++) { const id = `station-charger-${i}`; instances.push({ id, asset: asset('charger'), pose: pose(20 + i * 20, 57), dimensions: known({ lengthM: 1.2, widthM: 1.0, heightM: 1.5 }), sourceIds: [] }); stations.push({ id, instanceId: id, kind: 'charger', capacity: 1 }); }
for (let i = 0; i < 8; i++) { const id = `station-holding-${i}`; instances.push({ id, asset: asset('station'), pose: pose(14 + i * 12, 3), dimensions: known({ lengthM: 1.4, widthM: 1.4, heightM: 0.2 }), sourceIds: [] }); stations.push({ id, instanceId: id, kind: 'holding', capacity: 1 }); }
// Robots: 30 differential and 20 omnidirectional parked on the south apron.
for (let i = 0; i < 50; i++) {
  const drive = i < 30 ? 'differential' : 'omnidirectional';
  instances.push({ id: `robot-${drive === 'differential' ? 'd' : 'o'}-${String(i).padStart(2, '0')}`, asset: asset(`robot-${drive}`), pose: pose(6 + (i % 25) * 4.4, i < 25 ? 52 : 54.5), dimensions: known(drive === 'differential' ? { lengthM: 0.8, widthM: 0.6, heightM: 0.4 } : { lengthM: 1.0, widthM: 0.7, heightM: 0.4 }), sourceIds: [] });
}
const spatial = {
  formatVersion: '1.0.0',
  assets: ['rack-row', 'station', 'charger', 'robot-differential', 'robot-omnidirectional'].map(asset),
  robotProfiles: [
    { id: 'profile-differential', drive: 'differential', footprintM: [[-0.4, -0.3], [0.4, -0.3], [0.4, 0.3], [-0.4, 0.3]], loadedFootprintM: [[-0.6, -0.45], [0.6, -0.45], [0.6, 0.45], [-0.6, 0.45]], heightM: 1.6, maxSpeedMps: 1.5, maxAngularRadps: 1.2, accelerationMps2: 0.6, decelerationMps2: 0.9, reverse: false },
    { id: 'profile-omnidirectional', drive: 'omnidirectional', footprintM: [[-0.5, -0.35], [0.5, -0.35], [0.5, 0.35], [-0.5, 0.35]], loadedFootprintM: [[-0.65, -0.5], [0.65, -0.5], [0.65, 0.5], [-0.65, 0.5]], heightM: 1.6, maxSpeedMps: 1.2, maxAngularRadps: 1.5, accelerationMps2: 0.5, decelerationMps2: 0.8, reverse: true },
  ],
  scenes: [{ id: 'scene-fleet-50', name: 'Synthetic 120 x 60 m cross-dock', floor: known(floor), instances }],
  scenarios: [{
    id: 'scenario-fleet-50', sceneId: 'scene-fleet-50', name: 'Reference 50-robot workload (synthetic)', robotProfileIds: ['profile-differential', 'profile-omnidirectional'], fleetSize: known(50), stations,
    workload: { seed: 20260907, jobs: 1000, arrivalsPerHour: 400, mix: stations.filter(s => s.kind === 'pickup').flatMap(from => stations.filter(s => s.kind === 'dropoff').map(to => ({ fromStationId: from.id, toStationId: to.id, share: 1 / 60 }))) },
    objectives: [{ id: 'objective-throughput', kind: 'throughput', direction: 'maximize', threshold: 380, unit: 'jobs/h', sourceIds: [] }],
  }],
  bindings: [],
};
const fixture = { note: 'Synthetic benchmark fixture. Every value is an assumption for feasibility and performance work, not a measurement.', generatedBy: 'scripts/generate-fleet-fixture.mjs', robots: instances.filter(i => i.id.startsWith('robot-')).map(i => ({ instanceId: i.id, profileId: i.asset.id === 'robot-differential' ? 'profile-differential' : 'profile-omnidirectional' })), spatial };
await writeFile(new URL('../fixtures/fleet-50.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
console.log(`fixtures/fleet-50.json: ${instances.length} instances, ${stations.length} stations, ${fixture.robots.length} robots`);

import { describe, expect, it } from 'vitest';
import bundled from '../../packages/spatial/assets/catalog.json';
import { assetRefFor, bundledCatalog, catalogEntry, entryHash, validateCatalog, validateEntry, type CatalogEntry } from '../../packages/spatial/src/catalog.js';
import { canonicalJson, hashJson, sha256Hex } from '../../packages/spatial/src/hash.js';
type Raw = Record<string, unknown>;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
/** Copies a bundled entry, applies a mutation and rehashes so only the tested defect remains. */
function mutated(id: string, change: (entry: Raw) => void, rehash = true): Raw {
  const entry = clone(bundled.entries.find((row) => row.id === id)!) as unknown as Raw;
  change(entry);
  if (rehash) entry.sha256 = entryHash(entry as unknown as CatalogEntry);
  return entry;
}
const catalogOf = (...entries: Raw[]) => ({ formatVersion: '1.0.0', entries });
describe('pure hashing', () => {
  it('matches SHA-256 test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(sha256Hex('abc'));
    expect(sha256Hex('a'.repeat(1_000_000))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });
  it('canonicalizes with sorted keys and refuses non-finite numbers', () => {
    expect(canonicalJson({ b: [1, { d: null, c: 'x' }], a: true })).toBe('{"a":true,"b":[1,{"c":"x","d":null}]}');
    expect(hashJson({ a: 1, b: 2 })).toBe(hashJson({ b: 2, a: 1 }));
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(expect.objectContaining({ code: 'CANONICAL_INVALID' }));
    expect(() => canonicalJson(() => 1)).toThrow(expect.objectContaining({ code: 'CANONICAL_INVALID' }));
  });
});
describe('bundled catalog', () => {
  it('validates, lists every reviewed primitive and carries license and synthetic-default notes', () => {
    const catalog = bundledCatalog();
    expect(catalog.entries.map((entry) => entry.id).sort()).toEqual(['charger', 'column', 'door-opening', 'pallet', 'rack-bay', 'rack-row', 'robot-differential', 'robot-omnidirectional', 'station', 'wall-segment']);
    for (const entry of catalog.entries) {
      expect(entry.version).toBe('1.0.0');
      expect(entry.license).toEqual({ spdx: 'Apache-2.0', source: 'RoboPomelo bundled primitive' });
      expect(entry.note).toMatch(/synthetic/i);
      expect(entry.sha256).toBe(entryHash(entry));
      expect(Object.keys(entry.parameterSchema.properties)).toEqual(expect.arrayContaining(['lengthM', 'widthM', 'heightM']));
    }
    expect(catalogEntry(catalog, 'rack-row', '1.0.0')).toMatchObject({ kind: 'assembly', parameterSchema: { properties: { bays: { default: 4 } } } });
    expect(bundledCatalog()).toBe(catalog);
  });
  it('describes both robots with body and loaded footprints, speed, acceleration and height', () => {
    const robot = catalogEntry(bundledCatalog(), 'robot-differential', '1.0.0');
    expect(robot.collision).toMatchObject({ shape: 'convex-polygon', footprintM: [[-0.4, -0.3], [0.4, -0.3], [0.4, 0.3], [-0.4, 0.3]] });
    expect(robot.robot).toMatchObject({ drive: 'differential', loadedFootprintM: [[-0.5, -0.35], [0.5, -0.35], [0.5, 0.35], [-0.5, 0.35]], maxSpeedMps: 1.5, accelerationMps2: 0.6, loadOffsetM: [0.1, 0] });
    expect(robot.parameterSchema.properties.heightM!.default).toBe(0.4);
    expect(catalogEntry(bundledCatalog(), 'robot-omnidirectional', '1.0.0').robot?.drive).toBe('omnidirectional');
  });
  it('produces asset references matching the entry identity', () => {
    const entry = catalogEntry(bundledCatalog(), 'pallet', '1.0.0');
    expect(assetRefFor(entry)).toEqual({ id: 'pallet', version: '1.0.0', sha256: entry.sha256 });
    expect(() => catalogEntry(bundledCatalog(), 'pallet', '2.0.0')).toThrow(expect.objectContaining({ code: 'ASSET_UNKNOWN' }));
    expect(() => catalogEntry(bundledCatalog(), 'conveyor', '1.0.0')).toThrow(expect.objectContaining({ code: 'ASSET_UNKNOWN' }));
  });
});
describe('catalog rejection', () => {
  const rejects = (catalog: unknown, code: string) => expect(() => validateCatalog(catalog)).toThrow(expect.objectContaining({ code }));
  it('rejects duplicate ids', () => rejects(catalogOf(mutated('pallet', () => {}), mutated('pallet', () => {})), 'CATALOG_DUPLICATE_ID'));
  it('accepts the same id at a different version', () => {
    expect(validateCatalog(catalogOf(mutated('pallet', () => {}), mutated('pallet', (e) => { e.version = '1.1.0'; }))).entries).toHaveLength(2);
  });
  it('rejects missing geometry', () => {
    rejects(catalogOf(mutated('pallet', (e) => { delete e.collision; })), 'CATALOG_INVALID');
    rejects(catalogOf(mutated('pallet', (e) => { e.collision = null; })), 'CATALOG_MISSING_GEOMETRY');
    rejects(catalogOf(mutated('pallet', (e) => { e.display = null; })), 'CATALOG_MISSING_GEOMETRY');
    rejects(catalogOf(mutated('pallet', (e) => { e.collision = { shape: 'box', heightFromParam: 'heightM' }; })), 'CATALOG_MISSING_GEOMETRY');
    rejects(catalogOf(mutated('robot-differential', (e) => { e.collision = { shape: 'convex-polygon', heightFromParam: 'heightM', footprintM: [[0, 0], [1, 0]] }; })), 'CATALOG_MISSING_GEOMETRY');
  });
  it('rejects self-intersecting and nonconvex collision polygons and unsupported shapes', () => {
    const robot = (footprintM: number[][]) => mutated('robot-differential', (e) => { (e.collision as Raw).footprintM = footprintM; delete e.robot; });
    rejects(catalogOf(robot([[0, 0], [1, 1], [1, 0], [0, 1]])), 'COLLISION_SELF_INTERSECTING');
    rejects(catalogOf(robot([[0, 0], [2, 0], [2, 2], [1, 0.5], [0, 2]])), 'COLLISION_NONCONVEX');
    rejects(catalogOf(robot([[0, 0], [1, 0], [2, 0]])), 'COLLISION_NONCONVEX');
    rejects(catalogOf(mutated('pallet', (e) => { e.collision = { shape: 'mesh', heightFromParam: 'heightM' }; })), 'COLLISION_NONCONVEX');
    rejects(catalogOf(mutated('robot-differential', (e) => { (e.robot as Raw).loadedFootprintM = [[0, 0], [1, 1], [1, 0], [0, 1]]; })), 'COLLISION_SELF_INTERSECTING');
  });
  it('rejects a loaded footprint smaller than the robot body', () => {
    rejects(catalogOf(mutated('robot-differential', (e) => { (e.robot as Raw).loadedFootprintM = [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]]; })), 'LOADED_FOOTPRINT_INVALID');
  });
  it('rejects parameter defaults out of bounds, inverted bounds and unknown parameter references', () => {
    const param = (name: string, change: (p: Raw) => void) => mutated('pallet', (e) => change(((e.parameterSchema as Raw).properties as Raw)[name] as Raw));
    rejects(catalogOf(param('lengthM', (p) => { p.default = 99; })), 'PARAMETER_OUT_OF_RANGE');
    rejects(catalogOf(param('lengthM', (p) => { p.minimum = 5; p.maximum = 1; p.default = 3; })), 'CATALOG_INVALID');
    rejects(catalogOf(param('lengthM', (p) => { p.minimum = 'small'; })), 'CATALOG_INVALID');
    rejects(catalogOf(param('lengthM', (p) => { p.unit = 'mm'; })), 'CATALOG_INVALID');
    rejects(catalogOf(mutated('pallet', (e) => { (e.collision as Raw).heightFromParam = 'tallness'; })), 'CATALOG_INVALID');
    rejects(catalogOf(mutated('pallet', (e) => { ((e.parameterSchema as Raw).properties as Raw).lengthM = undefined; delete ((e.parameterSchema as Raw).properties as Raw).lengthM; })), 'CATALOG_INVALID');
    rejects(catalogOf(mutated('pallet', (e) => { (e.parameterSchema as Raw).additionalProperties = true; })), 'CATALOG_INVALID');
  });
  it('rejects a door whose clearance is above its wall height', () => {
    rejects(catalogOf(mutated('door-opening', (e) => { (((e.parameterSchema as Raw).properties as Raw).clearanceM as Raw).default = 7; })), 'PARAMETER_OUT_OF_RANGE');
  });
  it('rejects unknown fields and hash mismatches', () => {
    rejects(catalogOf(mutated('pallet', (e) => { e.extra = 1; })), 'CATALOG_INVALID');
    rejects(catalogOf(mutated('pallet', (e) => { e.title = 'Renamed pallet'; }, false)), 'ASSET_HASH_MISMATCH');
    rejects(catalogOf(mutated('pallet', (e) => { e.sha256 = 'nothex'; }, false)), 'CATALOG_INVALID');
    rejects({ formatVersion: '2.0.0', entries: [] }, 'CATALOG_INVALID');
    rejects({ formatVersion: '1.0.0', entries: {} }, 'CATALOG_INVALID');
  });
  it('rejects external URLs and script fields anywhere in an entry', () => {
    rejects(catalogOf(mutated('pallet', (e) => { (e.license as Raw).source = 'https://example.com/pallet.glb'; })), 'ASSET_UNSAFE');
    rejects(catalogOf(mutated('pallet', (e) => { (e.display as Raw).materialId = 'javascript:alert(1)'; })), 'ASSET_UNSAFE');
    rejects(catalogOf(mutated('pallet', (e) => { ((e.exportProfiles as Raw).isaac as Raw).script = 'import os'; })), 'ASSET_UNSAFE');
    rejects(catalogOf(mutated('pallet', (e) => { (e.display as Raw).uri = 'file:///etc/passwd'; })), 'ASSET_UNSAFE');
    rejects(catalogOf(mutated('pallet', (e) => { e.description = 'See data:text/html;base64,AAAA'; })), 'ASSET_UNSAFE');
  });
  it('rejects malformed robot specifications', () => {
    rejects(catalogOf(mutated('robot-differential', (e) => { (e.robot as Raw).maxSpeedMps = 0; })), 'PARAMETER_OUT_OF_RANGE');
    rejects(catalogOf(mutated('robot-differential', (e) => { (e.robot as Raw).drive = 'tracked'; })), 'CATALOG_INVALID');
    rejects(catalogOf(mutated('robot-differential', (e) => { (e.robot as Raw).loadOffsetM = [0]; })), 'CATALOG_INVALID');
    rejects(catalogOf(mutated('pallet', (e) => { e.robot = clone(bundled.entries[8]!.robot); })), 'CATALOG_INVALID');
    expect(() => validateEntry(null)).toThrow(expect.objectContaining({ code: 'CATALOG_INVALID' }));
  });
});

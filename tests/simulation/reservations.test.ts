import { describe, expect, it } from 'vitest';
import { ReservationTable, cellsOf, edgeId, pathReservations, pathResources, reverseEdge, stationResourceId } from '../../packages/simulation/src/reservations.js';
import { findRoute } from '../../packages/simulation/src/route.js';
import { TOL, box, conserved, diff, job, monotone, noRobotOverlap, omni, pose, run, station } from './fleet-helpers.js';

const r = (resourceId: string, robotId: string, start: number, end: number) => ({ resourceId, robotId, start, end });

describe('ReservationTable', () => {
  it('refuses opposite edge transitions in overlapping intervals and allows the same direction', () => {
    const table = new ReservationTable();
    const ab = edgeId('c:0,0', 'c:1,0');
    table.add([r(ab, 'r1', 0, 10)]);
    expect(reverseEdge(ab)).toBe('e:1,0>0,0');
    const swap = table.conflicts([r(reverseEdge(ab), 'r2', 5, 15)]);
    expect(swap).toEqual([{ resourceId: 'e:1,0>0,0', blockerId: 'r1', end: 10, candidateStart: 5 }]);
    expect(table.conflicts([r(reverseEdge(ab), 'r2', 10, 15)])).toEqual([]);
    expect(table.conflicts([r(ab, 'r2', 5, 15)])).toEqual([]);
  });
  it('conflicts on any cell overlap by another robot but never with itself, and prunes', () => {
    const table = new ReservationTable();
    table.add([r('c:3,3', 'r1', 4, 8), r('c:3,3', 'r1', 8, Infinity)]);
    expect(table.conflicts([r('c:3,3', 'r2', 0, 4)])).toEqual([]);
    expect(table.conflicts([r('c:3,3', 'r2', 7, 9)]).map((c) => c.end)).toEqual([8, Infinity]);
    expect(table.conflicts([r('c:3,3', 'r1', 0, 100)])).toEqual([]);
    expect(table.holdersAt('c:3,3', 100)).toEqual(['r1']);
    table.clear('r1');
    expect(table.holdersAt('c:3,3', 100)).toEqual([]);
    table.add([r('c:1,1', 'r3', 0, 5)]);
    table.prune(5);
    expect(table.conflicts([r('c:1,1', 'r4', 0, 100)])).toEqual([]);
    expect(() => table.add([r('c:1,1', 'r3', 5, 5)])).toThrow(/INVALID_INTERVAL|interval/);
  });
  it('enforces station capacity and points at the slot that frees first', () => {
    const table = new ReservationTable(new Map([[stationResourceId('p'), 2]]));
    const s = stationResourceId('p');
    table.add([r(s, 'r1', 0, 30), r(s, 'r2', 10, 20)]);
    expect(table.conflicts([r(s, 'r3', 25, 40)])).toEqual([]); // only r1 overlaps
    expect(table.conflicts([r(s, 'r3', 15, 40)])).toEqual([{ resourceId: s, blockerId: 'r2', end: 20, candidateStart: 15 }]);
  });
});

describe('swept cells and path reservations', () => {
  it('covers every lattice cell met by the polygon bounds and excludes cells only touched at a boundary', () => {
    // Lattice 0.5: cell (0,0) spans [-0.25, 0.25). A square from -0.25 to 0.25 touches only that cell.
    expect(cellsOf([[[-0.25, -0.25], [0.25, -0.25], [0.25, 0.25], [-0.25, 0.25]]], 0.5)).toEqual(['c:0,0']);
    expect(cellsOf([[[-0.3, 0], [0.3, 0], [0.3, 0.1], [-0.3, 0.1]]], 0.5).sort()).toEqual(['c:-1,0', 'c:0,0', 'c:1,0']);
  });
  it('releases a cell only when the last step touching it ends, and includes directed edges', () => {
    const p = diff();
    const start = { profileId: p.id, pose: pose(0, 0), loaded: false };
    const route = findRoute(p, start, { pose: pose(2, 0), transition: 'none' }, [], { bounds: { minXM: -1, maxXM: 3, minYM: -1, maxYM: 1 }, tolerances: TOL });
    expect(route.kind).toBe('path');
    if (route.kind !== 'path') return;
    const res = pathResources(p, start, route.steps, TOL);
    expect(res.steps).toHaveLength(4);
    const reservations = pathReservations('r1', res, 100, Infinity);
    const edges = reservations.filter((x) => x.resourceId.startsWith('e:')).map((x) => x.resourceId);
    expect(edges).toEqual(['e:0,0>1,0', 'e:1,0>2,0', 'e:2,0>3,0', 'e:3,0>4,0']);
    // The 0.6 m long footprint still overlaps the start cell during the second step, so the start
    // cell is released when step 2 ends, not when the robot's centre has left it after step 1.
    const cell = (id: string) => reservations.find((x) => x.resourceId === id)!;
    expect(cell('c:0,0').start).toBe(100);
    expect(cell('c:0,0').end).toBe(100 + res.steps[1]!.to);
    expect(cell('c:0,0').end).toBeGreaterThan(100 + res.steps[0]!.to);
    expect(cell('c:4,0').end).toBe(Infinity);
    expect(reservations.every((x) => Number.isInteger(x.start) && x.end > x.start)).toBe(true);
  });
});

describe('fleet reservation behaviour', () => {
  /** Plus-shaped intersection: east-west lane at y = 5, north-south lane at x = 5, lanes 2 m wide. */
  const cross = [box('nw', 0, 4, 6, 10), box('ne', 6, 10, 6, 10), box('sw', 0, 4, 0, 4), box('se', 6, 10, 0, 4)];
  const bounds = { minXM: 0, maxXM: 10, minYM: 0, maxYM: 10 };
  it('serializes simultaneous intersection entry through reservations without collisions', () => {
    const robots = [
      { id: 'a', profileId: 'omni', pose: pose(1, 5) },
      { id: 'b', profileId: 'omni', pose: pose(5, 1, Math.PI / 2) },
    ];
    const stations = [station('east', 'holding', pose(9, 5)), station('north', 'holding', pose(5, 9, Math.PI / 2))];
    const result = run({ obstacles: cross, bounds, robots, stations, jobs: [job('ja', 0, 'east', 'east'), job('jb', 0, 'north', 'north')] });
    expect(result.termination).toBe('completed');
    expect(result.ledger.completed).toBe(2);
    conserved(result); monotone(result);
    noRobotOverlap(result, robots, [diff(), omni()]);
    expect(result.robots.every((r) => r.legs.length >= 1)).toBe(true);
  });
  it('prevents entry when the only exit from the station is statically blocked (dead-end, no reverse)', () => {
    // A 0.7 m wide dead-end pocket. The empty robot (0.4 m wide) drives in, but once loaded (0.8 x 0.6 m,
    // circumradius 0.5 m) it can neither rotate nor drive forward (end wall) and may not reverse.
    const pocket = [box('n', 2, 8, 5.35, 10), box('s', 2, 8, 0, 4.65), box('end', 7.2, 8, 4.65, 5.35)];
    const robots = [{ id: 'a', profileId: 'diff', pose: pose(1, 5) }];
    const stations = [station('deadend', 'pickup', pose(6.5, 5)), station('out', 'dropoff', pose(1, 8, Math.PI / 2))];
    const result = run({ obstacles: pocket, bounds, robots, stations, jobs: [job('j', 0, 'deadend', 'out')] }, { maxTicks: 300 });
    conserved(result);
    expect(result.events.some((e) => e.kind === 'loading')).toBe(false);
    expect(result.ledger.failed).toBe(1);
    expect(result.events.find((e) => e.kind === 'completed')?.reason).toBe('failed:NO_EXIT');
  });
  it('waits for a full station instead of overbooking its capacity', () => {
    const lane = [box('n', 0, 12, 6, 10), box('s', 0, 12, 0, 4)];
    const robots = [
      { id: 'a', profileId: 'omni', pose: pose(1, 5) },
      { id: 'b', profileId: 'omni', pose: pose(1, 4.5) },
    ];
    const stations = [station('p', 'pickup', pose(6, 5), 1), station('d', 'dropoff', pose(9, 5)), station('h', 'holding', pose(11.5, 5))];
    const result = run({ obstacles: lane, bounds: { minXM: 0, maxXM: 12, minYM: 0, maxYM: 10 }, robots, stations, jobs: [job('j1', 0, 'p', 'd'), job('j2', 0, 'p', 'd')] });
    conserved(result); monotone(result);
    expect(result.ledger.completed).toBe(2);
    const loading = result.events.filter((e) => e.kind === 'loading' && e.resourceId === 'p');
    expect(loading).toHaveLength(2);
    const [first, second] = loading.map((e) => e.tick).sort((x, y) => x - y);
    expect(second!).toBeGreaterThanOrEqual(first! + 5); // serviceTicks = 5: never two robots in service at once
    expect(result.events.some((e) => e.kind === 'waiting' && e.robotId === 'b')).toBe(true);
    noRobotOverlap(result, robots, [diff(), omni()]);
  });
});

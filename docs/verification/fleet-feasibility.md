# Fleet feasibility spike (S2b)

Probe: `node scripts/probe-fleet-feasibility.mjs --report test-results/fleet-feasibility.json`. It plans one route per robot from the parked pose to a random pickup or drop-off approach cell on the synthetic `fixtures/fleet-50.json` scene (120 x 60 m, 12 rack rows, 28 stations, 30 differential and 20 omnidirectional robots), then re-validates each path with the independent trace checker. Fixture values are synthetic assumptions, not measurements of any site.

## Run 1, 2026-09-07, baseline polygon lattice search

Host: Apple M4 (10 cores), 24 GiB, macOS 25.6.0 arm64, Node 24.20.0. Kernel: `packages/simulation` S4 route search, lattice 0.25 m, 8 headings, sweep bound 0.01 m, expansion limit 60,000 per route, static collision by convex polygon SAT against 40 obstacles per expansion.

| Measure | Value |
|---|---|
| Routes planned | 27 of 50 |
| Unresolved (expansion limit) | 23 of 50 |
| Infeasible | 0 |
| Trace-check conflicts on planned paths | 0 of 27 |
| Mean expansions per planned route | 20,573 |
| Mean plan time per planned route | 1,314 ms |
| Mean plan time per unresolved route | 3,595 ms |
| Total plan time | 118.2 s |
| Total independent check time | 1.3 s |
| RSS growth | about 200 MiB |

Cost per expansion is about 64 microseconds, dominated by rebuilding and testing swept polygons against every obstacle. The reference workload needs on the order of 1,000 routes per run (50 robots, 1,000 jobs, plus replans) inside the 60 second local wall budget, so planning must reach roughly 60 ms per route: a 20x to 50x reduction.

## Decision

Keep the 50-robot scope and the conservative swept-footprint collision model. Change the search representation, not the safety checks:

1. Precompute a static occupancy table per robot profile and load state over the lattice: for each (cell, heading) the standing footprint, and for each motion primitive the conservative sweep (translation hull and subdivided rotation hull inflated by the sweep bound), rasterized once against the static obstacles. Expansions then cost one table lookup. The trace checker keeps using polygons independently, so a precompute bug cannot pass silently.
2. Use a 0.5 m lattice for fleet planning with the footprint inflated by half a cell, keeping 0.25 m available for narrow-aisle checks. Tolerances remain versioned inputs.
3. Cache routes per (profile, load state, start cell, goal cell) within a run; reservations decide timing, not geometry.
4. Bound total planning work per tick and per run; exhaustion must surface as `budget` or `unresolved`, never as weakened collision checking.

Run 2 will re-run this probe after the precompute lands and record the new numbers here. Until then S5 correctness tests use small fixtures and a bounded fleet-50 run, and no throughput claim is made for the full 1,000 job horizon.

## Run 2, 2026-09-07, rasterized static and dynamic clearance

Implemented in `packages/simulation/src/raster.ts` and wired through `planner.ts`: the swept shape of each lattice primitive is rasterized once per heading and load state onto a fine grid (gridM/4) and shifted per pose; the static scene and the per-search dynamic robots are conservative occupancy fields. A raster miss is a sound clear, a core cell fully inside an obstacle is a definite hit, and only boundary cases fall back to the exact polygon check, so results are identical to `checkMove` (asserted over about 6,000 sampled poses and primitives) and every path still passes the independent polygon trace checker.

| Measure (same M4 host, inline profile run) | Run 1 | Run 2 |
|---|---|---|
| 1,500 ticks of the fleet-50 fixture | 4,585 ms | 1,146 ms (exact mode: 1,357 ms before the definite-hit tier) |
| 6,000 ticks | 41,400 ms | 22,506 ms |
| Benchmark: ticks reached in the 60 s wall budget (worker thread) | 4,068 | 9,624 |
| 30 minute horizon (18,000 ticks) inside 60 s | fail | fail (about 1.9x short) |
| Worker stop after cancel | 164 ms | 188 ms |
| Peak RSS | 327 MiB | 411 MiB |

Remaining hotspots from the CPU profile: template lookups for wide rotation sweeps (21%), exact confirmations at wall boundaries (15%), search bookkeeping (15%), rebuilding the dynamic raster per search (9%), and reservation cell extraction (11%). Next steps, in order: reuse one dynamic raster per tick instead of per search, precompute reservation cells from the same templates, shrink rotation templates by using the fine core for definite checks only, and cache routes between service poses across robots of the same profile. The 30 minute horizon target is still not met and no throughput claim is made for the full fixture; the acceptance gate stays open and the target is not lowered.

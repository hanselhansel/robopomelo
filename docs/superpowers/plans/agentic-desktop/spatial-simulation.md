# Spatial, assets and fleet-simulation tasks

Read [contracts](contracts.md) and the [root plan](../2026-09-07-agentic-desktop.md). Dependencies: S1 can start after D2; S2 after S1; S3 after A4/S2; S4 after S1/S2; S5 after S4; S6 after A5/S3/S5. Do not write product code until the engineering plan gate is approved.

## S1. Spatial extension and atomic typed authoring

Files: create `packages/spec/src/{spatial,simulation,agent,desktop}.ts`, `packages/spec/schemas/spatial-1.0.0.schema.json`; modify `patch.ts`, `units.ts`, `capabilities.ts`, core `patches.ts`, `references.ts`, `reference-checks.ts`, `planning-hash.ts`, `rules/evidence.ts`, `mutation-common.ts`, project-fs `transactions/{evaluation,ast,prepare}.ts`; create `tests/spatial/contract.test.ts`, `tests/runtime/spatial-transactions.test.ts`, `tests/distribution/old-reader-spatial.test.ts`.

- [ ] Write a minimal known-spatial fixture and malformed fixtures before adding support. Assert required spatial capability, closed action schemas, typed units, referenced sources/assets and approval invalidation. Asset paths must be relative content-addressed paths, not arbitrary URLs or scripts.
- [ ] Add narrowly typed place/move/resize/remove and scenario/workload/objective authoring operations. Dedicated evaluators produce object-level diff and feed the existing finishMutation path. Authoring cannot modify protected review/grant fields. Removing referenced objects requires explicit remapping or removal of dependents in the same checked mutation.
- [ ] Extend `packages/spec/schemas/patch-1.0.0.schema.json` and PatchOperation with a closed `op:'spatial', action:SpatialAction` branch, and update `packages/core/src/mutation-capability.ts` to validate declared spatial write fields explicitly. Add `packages/core/src/spatial-actions.ts`; preserve core operation semantics and forbid access to other extensions. Support experimental capability only through explicit activation; stage availability alone is not authorization. Extend `buildReferenceIndex`/`checkReferences` and evidence traversal through spatial sourceIds. Tests must exercise wire schema, typed union, capability boundary, AST serialization and receipt recovery together.
- [ ] Extend reference and evidence traversal to semantic spatial sourceIds. A source evidence edit must invalidate associated planning approval even though its reference lives in an extension.
- [ ] Implement RequirementBinding from contracts.md in `packages/spatial/src/bindings.ts` and `tests/spatial/bindings.test.ts`. Assert explicit transformation/knowledge state for each derived field, targeted invalidation after source corrections, preserved unrelated inputs, conflict handling and source-to-export traversal. A complete engineering handoff must expose these bindings as readable explanations.
- [ ] Serialize through the existing YAML AST transaction path, preserving unrelated extensions/comments. Drag end emits one operation, not a durable mutation per mousemove. Same mutation ID is replay-safe; conflicting source revisions retain the proposed action.
- [ ] Install the actual published `robopomelo@1.0.0` into an isolated directory and test open/validate/edit/approval/export against a spatial fixture. RP-004 must block unsupported authoring/approval; old export must not hide that unsupported scope. If it does, require an explicit backed-up project-format transition before new writing. This is G2, not an optional warning.
- [ ] Run `npx --no-install vitest run tests/spatial/contract.test.ts tests/runtime/spatial-transactions.test.ts tests/distribution/old-reader-spatial.test.ts`, types, boundaries and existing mutation/recovery suites. Commit capability support separately from rendering.

Mandatory geometric unit conversion tests must cover centimeters/meters, degrees/radians, acceleration and angular speed. No implicit conversion based on guessed vendor units. Missing, unknown, unverified and not-applicable remain distinct.

## S2. Catalog, geometry and scene compilation

Files: create `packages/spatial/package.json`, `src/{catalog,geometry,compile,hash}.ts`, `assets/catalog.json`; `packages/project-fs/src/assets/{import,store}.ts`; `tests/spatial/catalog.test.ts`, `geometry.test.ts`, `tests/security/asset-import.test.ts`.

- [ ] Begin with wall, column, rack bay/row, pallet, door opening, station, charger and differential/omnidirectional robot assets. Each has a version/hash, dimensions, collision footprint/height, display mesh and export mapping. Include reviewed license/source metadata before bundling an external asset.
- [ ] Test invalid parameters, duplicate IDs, missing geometry, loaded footprint larger than body, self-intersecting polygon, nonconvex unsupported collision shape, bounds and content hash mismatch.
- [ ] Compile canonical instances into immutable geometry with right-handedZ-up meters/radians. Preserve drive-origin and load offsets. A simple box's collision shape is independent of decorative geometry. Generic primitives and parameterized assemblies are trusted library code, not new LLM-generated source per scene.
- [ ] Import only bounded non-executable initial formats: embedded/static GLB geometry and reviewed catalog JSON, max25 MiB per asset,50k triangles per model,2 million per scene. Reject external URLs, unsupported GLTF extensions, skins/animations that affect unsupported collision behavior, decompression bombs and escaping symlinks. Complex USD/CAD goes through target-specific import capability rather than the renderer silently evaluating asset resolvers.
- [ ] Stage original bytes through SafeRoot into content-addressed storage. A asset library record is a typed immutable member, not fake evidence to bypass existing export restrictions.
- [ ] Run `npx --no-install vitest run tests/spatial/catalog.test.ts tests/spatial/geometry.test.ts tests/security/asset-import.test.ts`; commit the bounded catalog/compiler.

## S2a. Compose, draft and promote reusable assets

Files: create `packages/spatial/src/{assembly,behavior,template,draft}.ts`, `packages/project-fs/src/assets/library.ts`, `apps/web/src/features/scene/AssetDraft.tsx`; tests `tests/spatial/asset-authoring.test.ts`, `tests/runtime/asset-pinning.test.ts`.

- [ ] Write one rack-row assembly, one station queue/dwell behavior, and one receiving-to-staging scenario template fixture. Validate nested component IDs, bounded parameter overrides and behavior compatibility; reject cycles and unsupported code.
- [ ] Implement a closed geometry recipe grammar: parameterized catalog references, transform/group, convex polygon extrusion and material selection. Limits are finite node/depth/vertex counts. Agent-created recipes are data interpreted by trusted compiler code; no arbitrary JS/Python or external asset URLs execute in the desktop. Missing unsupported capabilities are explicit.
- [ ] Implement project-local draft lifecycle `draft -> validated -> reusable-version`. Failed geometry/behavior/export validation leaves a visibly incomplete draft. Promotion creates a new immutable library version, never mutates a referenced version in place.
- [ ] Library upgrade previews show instance parameter/mapping changes and affected runs; applying creates a new source revision. Existing projects keep pinned versions. Test duplicate promotion/idempotency, interrupted library writes, downgrades, missing hashes and references shared by multiple projects.
- [ ] Run `npx --no-install vitest run tests/spatial/asset-authoring.test.ts tests/runtime/asset-pinning.test.ts`; commit complete authorship lifecycle and fixture examples.

## S2b. Early50-robot feasibility spike

Files: create `scripts/probe-fleet-feasibility.mjs`, `fixtures/fleet-50.json`, `docs/verification/fleet-feasibility.md`; test `tests/simulation/feasibility-fixture.test.ts`.

- [ ] Construct the final representative loaded footprints, intersections, holding poses and task demand before full S4/S5 implementation. Benchmark candidate bounded route/sweep/reservation kernels, independent trace-check cost, worker transfer and memory on the named M4 host.
- [ ] Run `node scripts/probe-fleet-feasibility.mjs --report test-results/fleet-feasibility.json`; retain source/runtime/hardware and measured expansion counts/timings. Test the fixture itself for repeated IDs and impossible accidental station placements.
- [ ] Decide the search representation/tolerances from evidence before committing full scheduling. Preserve50-robots and loaded-footprint correctness; if target bounds are incompatible, surface the architecture or scope decision rather than weakening collision checking. This spike gates full S4/S5 build, while editor/discovery work continues.
- [ ] Commit probe and results; replace the prototype kernels through tested production modules, without retaining a second authoritative simulator.

## S3. Approved scene editor and synchronized views

Files: create `apps/web/src/features/scene/{SceneCanvas,SceneToolbar,ObjectInspector,AssetDrawer,SelectionContext}.tsx`, `scene-store.ts`, `transforms.ts`; `tests/browser/scene-editor.spec.ts`, `tests/spatial/edit-actions.test.ts`.

- [ ] Create failing interaction tests: select stableID, top-down/3D switch preserves selection, Fit layout includes all geometry, drag preview does not commit, Escape cancels, pointer-up commits once, keyboard/numeric edits equal drag outcome, and delayed AI edit cannot overwrite a newer revision.
- [ ] Render Three.js instanced geometry from compiler output with a stable scene graph. Keep camera state outside deployment intent. Use a full-canvas orthographic top-down camera and perspective/isometric3D camera; never duplicate canonical state between them.
- [ ] Add precise transform previews with bounds/snapping, collision guide overlays and a contextual inspector. Clearly separate camera dragging from object manipulation. Provide keyboard movement and numeric values for every drag operation.
- [ ] Selected object chip flows to A4's composer. Every committed change uses the same S1 action protocol. Undo emits a new base-bound inverse mutation; if the object changed meanwhile, show a conflict rather than reverting someone else's edits blindly.
- [ ] Apply the approved warm-ivory/green/coral mockup, left chat/right canvas, project/asset rail, view tabs and source-aware model selector. At narrow widths collapse optional inspector/asset drawer before obscuring chat or the canvas. Use a minimum supported window1024x700; show an explicit window-size message below it rather than broken overlapping controls.
- [ ] Run `npx --no-install playwright test tests/browser/scene-editor.spec.ts`, `npx --no-install vitest run tests/spatial/edit-actions.test.ts`, then focused visual review at1440x1024 and1280x800. Commit the editor flow.

## S4. Single-robot motion and conservative collision checking

Files: create `packages/simulation/package.json`, `src/{types,clock,prng,motion,sweep,route,trace-check}.ts`; test `tests/simulation/motion.test.ts`, `sweep.test.ts`, `route.test.ts`.

- [ ] Red-test empty versus loaded doorway fit, a rectangular load whose rotation strikes a corner despite clear endpoints, drive-origin offset, overhead obstruction, impossible goal and unsupported drive profile.
- [ ] Use integer ticks and stableID ordering. Pose-aware A* searches bounded motion primitives; translation, rotation and diagonal movement must be feasible for the drive profile. The final approach and load/unload transition check station clearance in both load states.
- [ ] Collision checking covers the full swept polygon plus height interval. Subdivide curved movement until the conservative bound is at most1cm, or mark the path unresolved when the bound/iteration limit cannot be met. Reject endpoint-only, circle-only and point-only shortcuts for noncircular loaded robots.
- [ ] Independent trace checking samples every emitted transition with the same stated conservative tolerance but separate traversal logic. It must detect injected conflicts in an otherwise apparently successful run.
- [ ] Implement seeded PRNG and tick ordering without Date.now/Math.random in the pure simulation package. Wall-clock cancellation lives in the worker host and produces partial status.

```ts
// packages/simulation/src/prng.ts
export function xorshift32(seed: number): () => number {
  if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff) throw new Error('INVALID_SEED');
  let x = seed >>> 0;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
}
```

```ts
import { expect, it } from 'vitest';
import { xorshift32 } from '../../packages/simulation/src/prng.js';
it('reproduces the demand sequence for the same seed', () => {
  const a=xorshift32(7), b=xorshift32(7);
  expect(Array.from({length:100},a)).toEqual(Array.from({length:100},b));
});
it('rejects zero and out-of-range seeds instead of aliasing them', () => {
  for (const seed of [0,-1,1.5,0x100000000,NaN,Infinity])
    expect(() => xorshift32(seed)).toThrow('INVALID_SEED');
  const a=xorshift32(1), b=xorshift32(2);
  expect(Array.from({length:10},a)).not.toEqual(Array.from({length:10},b));
});
```

- [ ] Run `npx --no-install vitest run tests/simulation/motion.test.ts tests/simulation/sweep.test.ts tests/simulation/route.test.ts`; inspect a rendered narrow-corner fixture. Commit before multi-robot scheduling.

## S5. Fleet scheduling, reservations and event conservation

Files: create `packages/simulation/src/{jobs,assignment,reservations,wait-graph,fleet,metrics}.ts`, `fixtures/fleet-50.json`; `tests/simulation/{reservations,fleet,deadlock,metrics}.test.ts`.

- [ ] Build the reference workload with30 differential and20 omnidirectional instances, named lanes/stations/holding poses, seeded arrivals and1,000 jobs. Fixture values are synthetic assumptions; label them in every report.
- [ ] Red-test opposing edge swaps, simultaneous intersection entry, exit blocked after entry, station queue overflow, priority starvation, charging eligibility, cancelled run and unresolved deadlock.
- [ ] Baseline is FIFO released tasks + nearest eligible available robot. Second policy estimates travel/reservation/queue cost with deterministic tie-breaking. Load eligibility and charging availability are checked before assignment. No task disappears when reassigned or rejected.
- [ ] Reserve spatial resources and intervals through full-footprint clearance; include edge direction and station approach/exit capacity. Do not enter a constrained resource if no valid exit/holding position is available. Waiting-time aging prevents indefinite low-priority starvation.
- [ ] Track a wait-for graph. Bound replanning/backtracking; reverse only if profile permits and the escape path passes S4. Exhaustion produces deadlock/unresolved with involved robot/resource IDs and retains uncompleted jobs.
- [ ] Maintain queued/active/completed/failed/cancelled sets with exact task conservation. Metrics derive from event records, with actual simulated horizon and termination. Partial runs do not claim complete-horizon throughput.

```ts
// packages/simulation/src/metrics.ts: required invariant utility
export function assertTaskConservation(released: number, counts: number[]): void {
  if (!Number.isSafeInteger(released) || released < 0 ||
      counts.some(n => !Number.isSafeInteger(n) || n < 0) ||
      counts.reduce((a,b) => a+b,0) !== released) throw new Error('TASK_ACCOUNTING');
}
```

- [ ] Run `npx --no-install vitest run tests/simulation/reservations.test.ts tests/simulation/fleet.test.ts tests/simulation/deadlock.test.ts tests/simulation/metrics.test.ts`; run the independent trace-conflict checker on every successful fixture. Commit fleet engine.

## S6. Objective discovery, comparison, playback and performance

Files: create `packages/simulation/src/{objectives,compare,input-hash}.ts`, `packages/application/src/simulation/{service,worker}.ts`, `packages/project-fs/src/runs/{store,manifest}.ts`; `apps/web/src/features/simulation/{Playback,Comparison,RobotDetails,RunLimits}.tsx`; `scripts/benchmark-fleet.mjs`; tests `tests/simulation/compare.test.ts`, `tests/runtime/run-recovery.test.ts`, `tests/browser/fleet-comparison.spec.ts`.

- [ ] Red-test same-workload comparison, priority reversal changing preference, missing cost data, conflicting hard constraints, stale input hashes, repeat seed, mid-run cancellation and manifest/trace hash mismatch.
- [ ] Elicit outcome thresholds and priorities through A3; map to validated objective definitions. Preserve alternatives when priorities conflict. Do not choose arbitrary user weights. Report best found under declared limits; finite search failure is not proof of universal infeasibility.
- [ ] Run workers on immutable scenario snapshots with A5 budgets. Checkpoint atomically; emit ordered events and bounded summaries. Renderer receives interpolated poses and indexed events, not megabytes of JSON per frame. Repeated unchanged inputs reuse results by semantic input hash while preserving original source provenance.
- [ ] Cosmetic selection/camera/material changes do not stale physics results. Footprint/workload/traffic/objective changes do. Every run/export still states the exact original source revision. Imported results cannot claim to belong to a different revision by rewriting the manifest.
- [ ] Build playback and robot reason inspection from recorded events. Compare includes baseline and alternatives, same-workload confirmation, source/assumption status, partial labels and objective trade-offs. The agent cites recorded measurements rather than inventing results from scene appearance.
- [ ] Benchmark on named AppleM4 / 24 GiB macOS development hardware at1280x800: target30fps p95 frame time<=33ms in the50-robot scene; p95 direct edit feedback<=100ms; UI pause acknowledgment<=250ms; worker stops<=2 seconds; total resident memory<=1.5 GiB for the reference workload; deterministic30minute horizon<=60 seconds wall time. These are acceptance targets, not current measurements. Profile before changing any threshold.
- [ ] Run `node scripts/benchmark-fleet.mjs --fixture fixtures/fleet-50.json --report test-results/fleet-benchmark.json`, focused Vitest and Playwright suites. If targets fail, optimize measured hotspots or surface a scope/threshold decision; do not silently lower fidelity or robot count. Commit after green.

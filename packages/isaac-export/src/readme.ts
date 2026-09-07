/** Static README shipped with every export (identical bytes in every bundle). */
export const README_MD = `# RoboPomelo Isaac export

## Exact target

- Isaac Sim 6.0.0 (exact build), Ubuntu 24.04, x86_64, NVIDIA RTX GPU with a supported driver.
- Target id: \`isaac-sim-6.0.0-ubuntu24.04-x86_64\`.
- Units: meters, seconds, radians. Right-handed, Z up, \`metersPerUnit = 1\`.
- Reference robot: NVIDIA Jetbot from the separately installed Isaac Sim 6.0.0 core asset pack, referenced only as \`Isaac/Robots/NVIDIA/Jetbot/jetbot.usd\` relative to \`scene.usda\`.

## Prerequisites the operator must satisfy

1. Install Isaac Sim 6.0.0 and its core asset pack under the NVIDIA license. No NVIDIA asset is bundled here.
2. Make \`Isaac/Robots/NVIDIA/Jetbot/jetbot.usd\` resolve relative to this directory (for example a symlink \`Isaac\` pointing at the installed asset root's \`Isaac\` folder).
3. Record the installed asset checksum in \`acceptance.json\` next to \`run.py\`:
   \`{"assets": [{"usdRelativePath": "Isaac/Robots/NVIDIA/Jetbot/jetbot.usd", "sha256": "<sha256 of the installed file>"}]}\`.
   A \`null\` sha256 in \`asset-requirements.json\` means this obligation is open, not waived.
4. Verify \`manifest.json\`: every file hash and size, the source revision and source hash, and the target id, before running anything.

## Files

| File | Purpose |
|---|---|
| \`scene.usda\` | Floor and every compiled object as collision boxes with stable ids in \`customData\`; Jetbot references only in runnable-reference mode |
| \`scenario.json\` | Stations, robots, deterministic goals, shared intersection, controller contract, thresholds |
| \`asset-requirements.json\` | Target assets the operator must install and checksum |
| \`bindings.json\` | Field-level binding explanations so a second engineer can trace each simulator input |
| \`unsupported.json\` | Every element or field not represented, with reason codes |
| \`run.py\` | Static reference runner (same bytes in every export) |
| \`manifest.json\` | Format version, target, mode, source identity, per-file sha256 and size, runnable badge |

## Running

From the Isaac Sim 6.0.0 installation: \`./python.sh /path/to/this/directory/run.py\`.
\`run.py\` reads only sibling files, performs no network access, refuses to run when \`manifest.json\` mode is \`importable-only\`, when the Isaac version differs, when an asset is missing or when the recorded checksum does not match. Exit 0 only when every goal meets the thresholds and no non-floor contact is recorded. Results go to \`result.json\`.

## What is validated

- Import of the exported stage: units, up axis, floor extents, object poses and collision boxes.
- Two differential robots driven to the exported goals with measured pose feedback and wheel-velocity commands; no pose setting after initialization.
- Final position error <= 0.10 m and heading error <= 0.15 rad per goal leg; every goal accounted for; contact events recorded.

## What is not validated

- Omnidirectional drives, chargers, holding poses, multi-floor layouts, conveyors, lifts, custom meshes, load handling, or objectives other than throughput. See \`unsupported.json\`.
- Any fleet larger than two robots or more than two stations. Importable-only exports list remaining setup and carry no runnable-reference badge.
- Physics equivalence with the RoboPomelo planner. The two are separate modeling layers.

## Non-claims

This is an interoperability test of a narrow reference on one declared target. It is not a production readiness statement, not a safety certification, and not a validation of a full warehouse AMR fleet.
`;

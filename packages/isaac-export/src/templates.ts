/** Static template members for Isaac Sim 6.0.0. These strings are identical in
 * every export; nothing model- or user-authored is ever spliced into them. */
export const NO_TELEPORT_MARKER = '# --- runtime: no teleportation below this line ---';
export const RUN_PY = `#!/usr/bin/env python3
"""RoboPomelo Isaac reference run (static template, identical in every export).

Target: Isaac Sim 6.0.0 on Ubuntu 24.04 x86_64. Loads scene.usda and
scenario.json from this script's own directory, spawns the supported robots
from the fixed asset path declared in asset-requirements.json, drives each
robot to its exported goals with a differential wheel-velocity controller that
uses only measured pose feedback, records per-goal final position and heading
error plus contact events into result.json, and exits non-zero on any
threshold violation. Contains no network access. Pose setting is allowed only
during initialization; the runtime section below never teleports.
"""
import hashlib
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXPECTED_VERSION_PREFIX = "6.0.0"
PHYSICS_DT = 1.0 / 60.0
WHEEL_RADIUS_M = 0.0325
WHEEL_BASE_M = 0.1125
MAX_LINEAR_MPS = 0.3
MAX_ANGULAR_RADPS = 1.5
SETTLE_STEPS = 60


def load_json(name):
    with (HERE / name).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def sha256_of(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fail(code, message, result=None):
    payload = {"status": "failed", "code": code, "message": message}
    if result is not None:
        payload["result"] = result
    (HERE / "result.json").write_text(json.dumps(payload, indent=2, sort_keys=True) + "\\n", encoding="utf-8")
    print(code + ": " + message, file=sys.stderr)
    sys.exit(2 if result is None else 1)


def wrap(angle):
    return (angle + math.pi) % (2.0 * math.pi) - math.pi


def yaw_of(quaternion):
    w, x, y, z = (float(v) for v in quaternion)
    return math.atan2(2.0 * (w * z + x * y), 1.0 - 2.0 * (y * y + z * z))


def preflight(scenario, requirements):
    if scenario.get("mode") != "runnable-reference":
        fail("NOT_RUNNABLE", "scenario.json is importable-only; remaining setup: " + "; ".join(scenario.get("remainingSetup", [])))
    if not (HERE / "scene.usda").exists():
        fail("SCENE_MISSING", "scene.usda is not next to run.py")
    for asset in requirements["assets"]:
        path = HERE / asset["usdRelativePath"]
        if not path.exists():
            fail("ASSET_MISSING", "required asset not found at " + asset["usdRelativePath"] + " (install the asset pack and link it next to scene.usda)")
        recorded = asset.get("sha256")
        if recorded is None:
            acceptance = HERE / "acceptance.json"
            if not acceptance.exists():
                fail("CHECKSUM_UNRECORDED", "record the installed checksum of " + asset["usdRelativePath"] + " in acceptance.json before running")
            recorded = {row["usdRelativePath"]: row["sha256"] for row in json.loads(acceptance.read_text(encoding="utf-8"))["assets"]}.get(asset["usdRelativePath"])
            if not recorded:
                fail("CHECKSUM_UNRECORDED", "acceptance.json has no checksum for " + asset["usdRelativePath"])
        actual = sha256_of(path)
        if actual != recorded:
            fail("ASSET_HASH_MISMATCH", asset["usdRelativePath"] + " sha256 " + actual + " differs from recorded " + recorded)


def main():
    scenario = load_json("scenario.json")
    requirements = load_json("asset-requirements.json")
    preflight(scenario, requirements)

    from isaacsim import SimulationApp

    app = SimulationApp({"headless": True})
    import omni.kit.app
    from isaacsim.core.api import World
    from isaacsim.core.utils.stage import add_reference_to_stage, open_stage
    from isaacsim.robot.wheeled_robots.controllers.differential_controller import DifferentialController
    from isaacsim.robot.wheeled_robots.robots import WheeledRobot
    from isaacsim.sensors.physics import ContactSensor

    version = omni.kit.app.get_app().get_app_version()
    if not str(version).startswith(EXPECTED_VERSION_PREFIX):
        app.close()
        fail("TARGET_VERSION_MISMATCH", "Isaac Sim " + str(version) + " is not the declared target " + EXPECTED_VERSION_PREFIX)

    open_stage(str(HERE / "scene.usda"))
    world = World(stage_units_in_meters=1.0, physics_dt=PHYSICS_DT, rendering_dt=PHYSICS_DT)
    robots = {}
    sensors = {}
    # Initialization: spawn (if the stage lacks the prim) and place robots at their start poses.
    for row in scenario["robots"]:
        prim_path = "/World/" + row["primName"]
        add_reference_to_stage(usd_path=str(HERE / row["usdRelativePath"]), prim_path=prim_path)
        robot = world.scene.add(WheeledRobot(prim_path=prim_path, name=row["id"], wheel_dof_names=["left_wheel_joint", "right_wheel_joint"], create_robot=False))
        start = row["startPose"]
        half = start["yawRad"] / 2.0
        robot.set_world_pose(position=[start["xM"], start["yM"], start["zM"]], orientation=[math.cos(half), 0.0, 0.0, math.sin(half)])
        robots[row["id"]] = robot
        sensors[row["id"]] = world.scene.add(ContactSensor(prim_path=prim_path + "/chassis/contact_sensor", name=row["id"] + "_contact", min_threshold=0.0, max_threshold=1.0e7, radius=-1))
    world.reset()
    for _ in range(SETTLE_STEPS):
        world.step(render=False)
    ${NO_TELEPORT_MARKER}
    controllers = {rid: DifferentialController(name=rid + "_controller", wheel_radius=WHEEL_RADIUS_M, wheel_base=WHEEL_BASE_M) for rid in robots}
    stations = {row["id"]: row["pose"] for row in scenario["stations"]}
    thresholds = scenario["thresholds"]
    targets = {rid: [] for rid in robots}
    for goal in scenario["goals"]:
        targets[goal["robotId"]].append((goal["jobId"], "pickup", stations[goal["fromStationId"]]))
        targets[goal["robotId"]].append((goal["jobId"], "dropoff", stations[goal["toStationId"]]))
    records = []
    contacts = []
    violations = 0

    def measured(rid):
        position, orientation = robots[rid].get_world_pose()
        return float(position[0]), float(position[1]), yaw_of(orientation)

    def drive_to(rid, target, budget_steps):
        for step in range(budget_steps):
            x, y, yaw = measured(rid)
            dx, dy = target["xM"] - x, target["yM"] - y
            distance = math.hypot(dx, dy)
            heading_error = wrap(math.atan2(dy, dx) - yaw) if distance > 0.05 else wrap(target["yawRad"] - yaw)
            linear = 0.0 if distance <= 0.05 else min(MAX_LINEAR_MPS, 0.8 * distance) * max(0.0, math.cos(heading_error))
            angular = max(-MAX_ANGULAR_RADPS, min(MAX_ANGULAR_RADPS, 2.0 * heading_error))
            robots[rid].apply_wheel_actions(controllers[rid].forward([linear, angular]))
            world.step(render=False)
            frame = sensors[rid].get_current_frame()
            if frame.get("in_contact"):
                bodies = [str(c.get("body1", "")) + "|" + str(c.get("body0", "")) for c in frame.get("contacts", [])]
                if any("/World/Floor" not in b for b in bodies):
                    contacts.append({"robotId": rid, "step": step, "bodies": bodies})
            if distance <= 0.05 and abs(wrap(target["yawRad"] - yaw)) <= thresholds["headingErrorRad"] / 2.0:
                break
        robots[rid].apply_wheel_actions(controllers[rid].forward([0.0, 0.0]))
        x, y, yaw = measured(rid)
        return math.hypot(target["xM"] - x, target["yM"] - y), abs(wrap(target["yawRad"] - yaw))

    for rid in sorted(targets):
        for job_id, leg, target in targets[rid]:
            x, y, _ = measured(rid)
            budget = int((math.hypot(target["xM"] - x, target["yM"] - y) / MAX_LINEAR_MPS + 30.0) / PHYSICS_DT)
            position_error, heading_error = drive_to(rid, target, budget)
            ok = position_error <= thresholds["finalPositionErrorM"] and heading_error <= thresholds["headingErrorRad"]
            violations += 0 if ok else 1
            records.append({"robotId": rid, "jobId": job_id, "leg": leg, "finalPositionErrorM": position_error, "headingErrorRad": heading_error, "passed": ok})

    result = {
        "status": "passed" if violations == 0 and not contacts else "failed",
        "target": scenario["target"], "isaacVersion": str(version), "scenarioId": scenario["scenarioId"],
        "goals": records, "contacts": contacts, "violations": violations, "thresholds": thresholds,
        "controller": scenario["controller"], "teleportAfterInit": False,
    }
    (HERE / "result.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\\n", encoding="utf-8")
    app.close()
    if result["status"] != "passed":
        print("reference run failed: " + str(violations) + " threshold violations, " + str(len(contacts)) + " contact events", file=sys.stderr)
        sys.exit(1)
    print("reference run passed")


if __name__ == "__main__":
    main()
`;

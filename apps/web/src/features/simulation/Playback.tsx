import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { posesAt, type RobotPose } from './poses.js';
import { TICK_MS, type RunRecord } from './types.js';
const SPEEDS = [1, 2, 4] as const;
const FRAME_MS = 100;
const isTextTarget = (target: EventTarget | null) => target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName) && (target as HTMLInputElement).type !== 'range';
/** Scrubber over recorded ticks. Poses are interpolated from the run's leg
 * endpoints and handed to `onPoses`; the built-in top-down overlay is a
 * lightweight SVG so no frame ever touches the event stream. Space toggles play
 * only while the playback group or its scrubber has focus. Never a model call. */
export function Playback({ summary, durationTicks, selectedRobotId, onSelectRobot, onPoses }: {
  summary: RunRecord; durationTicks: number; selectedRobotId: string | null; onSelectRobot: (id: string) => void; onPoses?: ((tick: number, poses: RobotPose[]) => void) | undefined;
}) {
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const tickRef = useRef(0);
  useEffect(() => { tickRef.current = 0; setTick(0); setPlaying(false); }, [summary]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const next = Math.min(durationTicks, tickRef.current + speed);
      tickRef.current = next;
      setTick(next);
      if (next >= durationTicks) setPlaying(false);
    }, FRAME_MS);
    return () => clearInterval(timer);
  }, [playing, speed, durationTicks]);
  const poses = useMemo(() => posesAt(summary.robots, tick), [summary, tick]);
  useEffect(() => { onPoses?.(tick, poses); }, [tick, poses, onPoses]);
  const scrub = (value: number) => { tickRef.current = value; setTick(value); };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== ' ' || isTextTarget(event.target)) return;
    event.preventDefault();
    setPlaying((p) => !p);
  };
  const b = summary.bounds, w = b.maxXM - b.minXM, h = b.maxYM - b.minYM;
  const seconds = ((tick * TICK_MS) / 1000).toFixed(1);
  return (
    <div className="sim-playback" role="group" aria-label="Playback" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="sim-playback-controls">
        <button type="button" aria-pressed={playing} onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</button>
        <label>Speed
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value) as (typeof SPEEDS)[number])}>
            {SPEEDS.map((s) => <option key={s} value={s}>{s}x</option>)}
          </select>
        </label>
        <label className="sim-scrubber">Tick
          <input type="range" min={0} max={durationTicks} step={1} value={tick} onChange={(e) => scrub(Number(e.target.value))} />
        </label>
        <span className="help" aria-live="off">tick {tick} of {durationTicks} ({seconds} s)</span>
      </div>
      <svg className="sim-overlay" viewBox={`${b.minXM} ${-b.maxYM} ${w} ${h}`} role="img" aria-label={`Top-down robot positions at tick ${tick}`}>
        <rect x={b.minXM} y={-b.maxYM} width={w} height={h} className="sim-floor" />
        {summary.stations.map((s) => <rect key={s.id} x={s.pose.xM - 0.4} y={-s.pose.yM - 0.4} width={0.8} height={0.8} className={`sim-station ${s.kind}`}><title>{s.id} ({s.kind})</title></rect>)}
        {poses.map((p) => (
          <g key={p.id} transform={`translate(${p.pose.xM} ${-p.pose.yM}) rotate(${(-p.pose.yawRad * 180) / Math.PI})`} className={`sim-robot${p.id === selectedRobotId ? ' selected' : ''}${p.loaded ? ' loaded' : ''}${p.moving ? ' moving' : ''}`} onClick={() => onSelectRobot(p.id)}>
            <rect x={-0.4} y={-0.3} width={0.8} height={0.6} rx={0.1} />
            <line x1={0} y1={0} x2={0.5} y2={0} />
            <title>{p.id}</title>
          </g>
        ))}
      </svg>
      <div className="sim-robot-list" role="listbox" aria-label="Robots">
        {poses.map((p) => (
          <button type="button" role="option" key={p.id} aria-selected={p.id === selectedRobotId} onClick={() => onSelectRobot(p.id)}>
            {p.id} ({p.pose.xM.toFixed(2)}, {p.pose.yM.toFixed(2)}){p.loaded ? ' loaded' : ''}{p.moving ? ' moving' : ''}
          </button>
        ))}
      </div>
    </div>
  );
}

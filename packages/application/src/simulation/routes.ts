import type { Route } from '../server/contracts.js';
import { requestBody, requiredText } from '../server/request.js';
import { HttpError } from '../server/security.js';
import type { ProjectService } from '../services/project.js';
import { EVENT_WINDOW_LIMIT, MAX_TICKS_LIMIT, SimulationService, type RunLimits, type SimulationServiceOptions } from './service.js';
import type { Policy } from '@robopomelo/simulation';

const ID = /^[A-Za-z0-9][A-Za-z0-9.:_-]{0,127}$/;
const RUN_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const POLICIES: Policy['name'][] = ['fifo-nearest', 'cost-estimate'];
const integer = (value: unknown, name: string, min: number, max: number): number => {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw new HttpError(400, 'INVALID_INPUT', `Supply a valid ${name} (${min} to ${max}).`);
  return value as number;
};
const runId = (value: unknown): string => {
  const text = requiredText(value, 'run id', 64);
  if (!RUN_ID.test(text)) throw new HttpError(400, 'INVALID_INPUT', 'Supply a valid run id.');
  return text;
};
const query = (url: URL, key: string, fallback: number): number => {
  const raw = url.searchParams.get(key);
  if (raw === null || raw === '') return fallback;
  if (!/^\d{1,9}$/.test(raw)) throw new HttpError(400, 'INVALID_INPUT', `Supply a non-negative integer for ${key}.`);
  return Number(raw);
};
function limits(value: unknown): Partial<RunLimits> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((k) => k !== 'wallMs' && k !== 'maxTicks')) throw new HttpError(400, 'INVALID_INPUT', 'Limits accept wallMs and maxTicks only.');
  const raw = value as { wallMs?: unknown; maxTicks?: unknown };
  const out: Partial<RunLimits> = {};
  if (raw.wallMs !== undefined) out.wallMs = integer(raw.wallMs, 'wallMs', 1, 3_600_000);
  if (raw.maxTicks !== undefined) out.maxTicks = integer(raw.maxTicks, 'maxTicks', 1, MAX_TICKS_LIMIT);
  return out;
}
function policy(value: unknown): Policy | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== 'name,version') throw new HttpError(400, 'INVALID_INPUT', 'Policy needs a name and a version.');
  const raw = value as { name: unknown; version: unknown };
  if (!POLICIES.includes(raw.name as Policy['name'])) throw new HttpError(400, 'INVALID_INPUT', `Policy must be one of ${POLICIES.join(', ')}.`);
  const version = requiredText(raw.version, 'policy version', 32);
  if (!/^[0-9A-Za-z.-]+$/.test(version)) throw new HttpError(400, 'INVALID_INPUT', 'Supply a valid policy version.');
  return { name: raw.name as Policy['name'], version };
}

/** Local-session simulation routes. Every run is project-epoch scoped through
 * the route host; inputs are validated strictly and the service enforces the
 * exploration budget (workers, queued variants, wall time). */
export function simulationRoutes(project: ProjectService, options: SimulationServiceOptions = {}): Route[] {
  const service = new SimulationService(project, options);
  return [
    {
      method: 'POST',
      path: '/api/simulation/runs',
      handler: async (context) => {
        const body = requestBody(context);
        const allowed = ['limits', 'policy', 'scenarioId', 'seed'];
        if (Object.keys(body).some((key) => !allowed.includes(key))) throw new HttpError(400, 'INVALID_INPUT', 'Unexpected run fields.');
        const scenarioId = requiredText(body.scenarioId, 'scenario id', 128);
        if (!ID.test(scenarioId)) throw new HttpError(400, 'INVALID_INPUT', 'Supply a valid scenario id.');
        const seed = integer(body.seed, 'seed', 1, 0xffffffff);
        const chosen = policy(body.policy);
        return service.start({ scenarioId, seed, limits: limits(body.limits), ...(chosen ? { policy: chosen } : {}) });
      },
    },
    { method: 'GET', path: '/api/simulation/runs', handler: async () => ({ runs: await service.list() }) },
    { method: 'GET', path: '/api/simulation/runs/:id', handler: (context) => service.read(runId(context.params.id)) },
    {
      method: 'GET',
      path: '/api/simulation/runs/:id/events',
      handler: (context) => {
        const from = query(context.url, 'from', 0);
        const to = query(context.url, 'to', from + EVENT_WINDOW_LIMIT);
        return service.events(runId(context.params.id), from, to);
      },
    },
    { method: 'POST', path: '/api/simulation/runs/:id/cancel', handler: (context) => service.cancel(runId(context.params.id)) },
    {
      method: 'POST',
      path: '/api/simulation/compare',
      handler: async (context) => {
        const body = requestBody(context);
        if (Object.keys(body).sort().join(',') !== 'alternativeRunIds,baselineRunId') throw new HttpError(400, 'INVALID_INPUT', 'Supply a baseline run and alternative runs.');
        if (!Array.isArray(body.alternativeRunIds) || body.alternativeRunIds.length > 20) throw new HttpError(400, 'INVALID_INPUT', 'Supply up to 20 alternative run ids.');
        const baselineRunId = runId(body.baselineRunId);
        const alternativeRunIds = body.alternativeRunIds.map(runId);
        if (alternativeRunIds.includes(baselineRunId) || new Set(alternativeRunIds).size !== alternativeRunIds.length) throw new HttpError(400, 'INVALID_INPUT', 'Alternatives must be distinct and differ from the baseline.');
        return service.compare({ baselineRunId, alternativeRunIds });
      },
    },
  ];
}

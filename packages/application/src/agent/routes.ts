import type { Route } from '../server/contracts.js';
import { HttpError } from '../server/security.js';
import { requestBody, requiredText, expectedSource } from '../server/request.js';
import type { AgentService } from './service.js';
const ID = /^[A-Za-z0-9][A-Za-z0-9.:_-]{0,127}$/;
const idText = (value: unknown, name: string): string => {
  const text = requiredText(value, name, 128);
  if (!ID.test(text)) throw new HttpError(400, 'INVALID_INPUT', `Supply a valid ${name}.`);
  return text;
};
const integer = (value: unknown, name: string, min = 0, max = 1_000_000): number => {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw new HttpError(400, 'INVALID_INPUT', `Supply a valid ${name}.`);
  return value as number;
};
/** Local-session routes for the discovery agent. Every dispatch is gated by the
 * service's grant, connection and epoch checks; no route accepts a key. */
export function agentRoutes(agent: AgentService): Route[] {
  return [
    { method: 'GET', path: '/api/agent/state', handler: () => agent.state() },
    { method: 'GET', path: '/api/agent/models', projectScoped: false, handler: () => agent.models() },
    {
      method: 'PUT',
      path: '/api/agent/selection',
      handler: async (context) => {
        const body = requestBody(context);
        if (Object.keys(body).sort().join(',') !== 'connectionId,effort,modelId') throw new HttpError(400, 'INVALID_INPUT', 'Supply connection, model and effort.');
        return agent.select({
          connectionId: idText(body.connectionId, 'connection'),
          modelId: requiredText(body.modelId, 'model', 200),
          effort: body.effort === null ? null : requiredText(body.effort, 'effort', 32),
        });
      },
    },
    {
      method: 'POST',
      path: '/api/agent/messages',
      handler: async (context) => {
        const body = requestBody(context);
        const allowed = ['attachmentIds', 'choiceId', 'dispatch', 'questionId', 'sourceHash', 'sourceRevision', 'text'];
        if (Object.keys(body).some((key) => !allowed.includes(key))) throw new HttpError(400, 'INVALID_INPUT', 'Unexpected message fields.');
        const base = expectedSource(body);
        if (typeof body.text !== 'string' || body.text.length > 16_000) throw new HttpError(400, 'INVALID_INPUT', 'Supply message text up to 16000 characters.');
        if (!Array.isArray(body.attachmentIds) || body.attachmentIds.length > 20 || body.attachmentIds.some((id) => typeof id !== 'string' || !ID.test(id)))
          throw new HttpError(400, 'INVALID_INPUT', 'Supply valid attachment identifiers.');
        const questionId = body.questionId === undefined || body.questionId === null ? '' : idText(body.questionId, 'question');
        const choiceId = body.choiceId === undefined || body.choiceId === null ? null : idText(body.choiceId, 'choice');
        if (body.dispatch !== undefined && typeof body.dispatch !== 'boolean') throw new HttpError(400, 'INVALID_INPUT', 'dispatch must be boolean.');
        return agent.message({ ...base, questionId, choiceId, text: body.text, attachmentIds: body.attachmentIds as string[] }, { dispatch: body.dispatch !== false });
      },
    },
    { method: 'POST', path: '/api/agent/runs', handler: () => agent.turn() },
    {
      method: 'POST',
      path: '/api/agent/runs/:id/cancel',
      handler: async (context) => {
        const body = requestBody(context);
        const cancelled = agent.cancel(idText(context.params.id, 'run'), integer(body.generation, 'generation'));
        if (!cancelled) throw new HttpError(409, 'RUN_CHANGED', 'That run generation is no longer active.');
        return { cancelled: true };
      },
    },
    {
      method: 'GET',
      path: '/api/agent/runs/:id/events',
      handler: async (context) => {
        const after = context.url.searchParams.get('after');
        return agent.events(idText(context.params.id, 'run'), after === null ? 0 : integer(Number(after), 'after'));
      },
    },
    {
      method: 'POST',
      path: '/api/agent/budget',
      handler: async (context) => {
        const body = requestBody(context);
        if (Object.keys(body).join(',') !== 'modelTurns') throw new HttpError(400, 'INVALID_INPUT', 'Only the model turn budget can be raised here.');
        agent.extend({ modelTurns: integer(body.modelTurns, 'model turns', 1, 64) });
        return agent.state();
      },
    },
  ];
}

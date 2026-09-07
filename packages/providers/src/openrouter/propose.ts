import type { ConnectionModel, DiscoveryRequest } from '@robopomelo/spec';
import { ProviderError } from '../contracts.js';
import type { ProposeResult, ProviderUsage, SecretProvider, Transport } from '../contracts.js';
import { OPENROUTER_ORIGIN, isRecord, requestJson, retryAfterMs } from './http.js';
import { AGENT_REPLY_JSON_SCHEMA, decodeAgentReply } from './reply-schema.js';

const COMPLETIONS_URL = `${OPENROUTER_ORIGIN}/api/v1/chat/completions`;
export const SYSTEM_PROMPT = [
  'You are a robotics deployment planning assistant working only from the context provided by the user.',
  'Respond with a single JSON object matching the AgentReply schema: summary, question, proposedActions, citedSourceIds.',
  'Ask at most one question. Set question to null when no question is needed.',
  'Cite only source identifiers that appear in the provided context. Never invent sources, sites or numbers.',
].join(' ');

export type ProposeOptions = { transport: Transport; secret: SecretProvider; signal: AbortSignal; model: ConnectionModel };

function capability(detail: string): ProviderError {
  return new ProviderError('PROVIDER_CAPABILITY', detail);
}

function buildBody(request: DiscoveryRequest, model: ConnectionModel): Record<string, unknown> {
  if (model.modelId !== request.modelId) throw capability(`selected model ${model.modelId} does not match requested ${request.modelId}`);
  if (!model.structuredActions) throw capability(`model ${model.modelId} does not support structured JSON schema output`);
  if (request.effort !== null && !model.efforts.includes(request.effort))
    throw capability(`model ${model.modelId} does not support reasoning effort ${request.effort}`);
  return {
    model: model.modelId,
    stream: false,
    max_tokens: request.maxOutputTokens,
    ...(request.effort === null ? {} : { reasoning: { effort: request.effort } }),
    response_format: { type: 'json_schema', json_schema: { name: 'agent_reply', strict: true, schema: AGENT_REPLY_JSON_SCHEMA } },
    provider: { allow_fallbacks: false, require_parameters: true },
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: request.context }],
  };
}

/** OpenRouter can return an HTTP 200 whose body carries an error object; map it like the equivalent status. */
function bodyError(body: Record<string, unknown>): ProviderError | null {
  if (!isRecord(body.error)) return null;
  const code = typeof body.error.code === 'number' ? body.error.code : 0;
  if (code === 401 || code === 403) return new ProviderError('PROVIDER_AUTH', `provider rejected credentials (${code})`);
  if (code === 429) return new ProviderError('PROVIDER_RATE_LIMIT', 'provider rate limit reached', retryAfterMs(undefined));
  return new ProviderError('PROVIDER_NETWORK', `provider returned error ${code || 'without code'}`);
}

function usageOf(body: Record<string, unknown>): { usage: ProviderUsage | null; costUsd: number | null } {
  const usage = body.usage;
  if (!isRecord(usage)) return { usage: null, costUsd: null };
  const prompt = usage.prompt_tokens;
  const completion = usage.completion_tokens;
  const cost = usage.cost;
  return {
    usage: typeof prompt === 'number' && typeof completion === 'number' ? { promptTokens: prompt, completionTokens: completion } : null,
    costUsd: typeof cost === 'number' && Number.isFinite(cost) ? cost : null,
  };
}

function contentOf(body: Record<string, unknown>): string {
  const choice = Array.isArray(body.choices) ? body.choices[0] : undefined;
  if (!isRecord(choice)) throw new ProviderError('PROVIDER_EMPTY', 'provider returned no choices');
  const message = isRecord(choice.message) ? choice.message : {};
  if (choice.finish_reason === 'content_filter' || (typeof message.refusal === 'string' && message.refusal.length > 0))
    throw new ProviderError('PROVIDER_REFUSAL', 'provider refused the request');
  if (typeof message.content !== 'string' || message.content.trim().length === 0)
    throw new ProviderError('PROVIDER_EMPTY', 'provider returned empty content');
  return message.content;
}

export async function propose(request: DiscoveryRequest, options: ProposeOptions): Promise<ProposeResult> {
  const body = buildBody(request, options.model);
  const response = await requestJson({ transport: options.transport, url: COMPLETIONS_URL, method: 'POST', body, secret: options.secret, signal: options.signal });
  if (!isRecord(response)) throw new ProviderError('PROVIDER_SCHEMA', 'completion response is not an object');
  const failure = bodyError(response);
  if (failure) throw failure;
  const content = contentOf(response);
  let decoded: unknown;
  try {
    decoded = JSON.parse(content) as unknown;
  } catch {
    throw new ProviderError('PROVIDER_SCHEMA', 'assistant content is not valid JSON');
  }
  return { reply: decodeAgentReply(decoded), ...usageOf(response) };
}

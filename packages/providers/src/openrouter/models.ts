import type { ConnectionModel } from '@robopomelo/spec';
import { ProviderError } from '../contracts.js';
import type { SecretProvider, Transport } from '../contracts.js';
import { OPENROUTER_ORIGIN, isRecord, requestJson } from './http.js';

const MODELS_URL = `${OPENROUTER_ORIGIN}/api/v1/models`;
export const REASONING_EFFORTS: readonly string[] = ['low', 'medium', 'high'];

export type ListModelsInput = { connectionId: string; transport: Transport; secret: SecretProvider; signal: AbortSignal };

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function toConnectionModel(connectionId: string, entry: unknown): ConnectionModel {
  if (!isRecord(entry) || typeof entry.id !== 'string' || entry.id.length === 0)
    throw new ProviderError('PROVIDER_SCHEMA', 'model inventory entry lacks an id');
  const parameters = strings(entry.supported_parameters);
  const modalities = strings(isRecord(entry.architecture) ? entry.architecture.input_modalities : undefined);
  const inputKinds = (['text', 'image'] as const).filter((kind) => modalities.includes(kind));
  return {
    connectionId,
    route: 'openrouter',
    modelId: entry.id,
    label: typeof entry.name === 'string' && entry.name.length > 0 ? entry.name : entry.id,
    efforts: parameters.includes('reasoning') ? [...REASONING_EFFORTS] : [],
    inputKinds: inputKinds.length > 0 ? inputKinds : ['text'],
    structuredActions: parameters.includes('response_format') || parameters.includes('structured_outputs'),
    cancellation: true,
  };
}

/** The OpenRouter models endpoint returns the whole inventory in one response; no pagination exists. */
export async function listModels(input: ListModelsInput): Promise<ConnectionModel[]> {
  const body = await requestJson({ transport: input.transport, url: MODELS_URL, method: 'GET', secret: input.secret, signal: input.signal });
  if (!isRecord(body) || !Array.isArray(body.data)) throw new ProviderError('PROVIDER_SCHEMA', 'model inventory is not a data array');
  return body.data.map((entry) => toConnectionModel(input.connectionId, entry));
}

import type { AgentReply, ConnectionModel, DiscoveryRequest } from '@robopomelo/spec';
import { ProviderError } from '../contracts.js';
import type { ProposeResult, ProviderAdapter, SecretProvider, Transport } from '../contracts.js';
import { listModels } from './models.js';
import { propose } from './propose.js';

export type OpenRouterAdapterOptions = { connectionId: string; transport: Transport; secret: SecretProvider };
export interface OpenRouterAdapter extends ProviderAdapter {
  proposeDetailed(request: DiscoveryRequest, signal: AbortSignal): Promise<ProposeResult>;
}

export function createOpenRouterAdapter(options: OpenRouterAdapterOptions): OpenRouterAdapter {
  let cached: Promise<ConnectionModel[]> | null = null;
  const models = (signal: AbortSignal): Promise<ConnectionModel[]> => {
    if (!cached) {
      const pending = listModels({ connectionId: options.connectionId, transport: options.transport, secret: options.secret, signal });
      cached = pending;
      pending.catch(() => { if (cached === pending) cached = null; });
    }
    return cached;
  };
  const proposeDetailed = async (request: DiscoveryRequest, signal: AbortSignal): Promise<ProposeResult> => {
    if (request.connectionId !== options.connectionId)
      throw new ProviderError('PROVIDER_CAPABILITY', `request targets connection ${request.connectionId}, adapter serves ${options.connectionId}`);
    const model = (await models(signal)).find((candidate) => candidate.modelId === request.modelId);
    if (!model) throw new ProviderError('PROVIDER_CAPABILITY', `model ${request.modelId} is not available on this connection`);
    return propose(request, { transport: options.transport, secret: options.secret, signal, model });
  };
  return {
    models,
    proposeDetailed,
    async propose(request, signal): Promise<AgentReply> {
      return (await proposeDetailed(request, signal)).reply;
    },
  };
}

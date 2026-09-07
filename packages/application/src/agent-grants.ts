import { randomUUID } from 'node:crypto';
import {
  agentScopes,
  type AgentGrant,
  type AgentAuthorization,
  type AgentScope,
  type PermissionPreset,
} from '@robopomelo/spec';
import {
  ProjectFsError,
  sameBinding,
  validateBinding,
  type ProjectBinding,
  type MachineSettings,
  type SettingsStore,
  type TrustGrant,
} from '@robopomelo/project-fs';

declare const nativeConfirmation: unique symbol;
/** Opaque, process-local receipt. JSON payloads cannot construct a valid receipt. */
export type NativePresetConfirmation = { readonly [nativeConfirmation]: true };
type Intent = PermissionPreset | 'revoke';
interface Receipt {
  binding: ProjectBinding;
  intent: Intent;
  generation: number;
  expires: number;
}
function denied(): never {
  throw new ProjectFsError('SCOPE_DENIED', 'Explicit native permission confirmation is required.');
}
function revoked(): never {
  throw new ProjectFsError(
    'GRANT_REVOKED',
    'Project authority was revoked, replaced, or no longer matches this root.',
  );
}
const validIntent = (intent: unknown): intent is Intent =>
  ['recommended', 'inspection', 'revoke'].includes(String(intent)) && typeof intent === 'string';
function validateAuthorization(value: AgentAuthorization, required: readonly AgentScope[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== 'generation,grantId' ||
    typeof value.grantId !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(value.grantId) ||
    !Number.isSafeInteger(value.generation) ||
    value.generation < 0 ||
    !Array.isArray(required) ||
    !required.length ||
    required.length > agentScopes.length ||
    new Set(required).size !== required.length ||
    required.some((scope) => !agentScopes.includes(scope))
  )
    denied();
}
function active(
  state: MachineSettings,
  binding: ProjectBinding,
  grant: AgentGrant | undefined,
): grant is AgentGrant {
  if (!grant || grant.revokedAt !== null || !sameBinding(grant.binding, binding)) return false;
  return state.grants.some(
    (trust) =>
      trust.grantId === grant.trustGrantId &&
      trust.revokedAt === null &&
      trust.generation === grant.generation &&
      sameBinding(trust.binding, binding),
  );
}
function revokeMatching(state: MachineSettings, binding: ProjectBinding, now: string) {
  for (const grant of [...state.grants, ...(state.agentGrants ?? [])]) {
    if (sameBinding(grant.binding, binding) && grant.revokedAt === null) {
      grant.revokedAt = now;
      grant.generation = state.generation + 1;
    }
  }
}

export class AgentGrantStore {
  #receipts = new WeakMap<object, Receipt>();
  constructor(private readonly settings: SettingsStore) {}
  /** Trusted native main only, AFTER an explicit user confirmation. Never expose this
   * method through HTTP, renderer IPC, agent tools, or a settings-authority payload. */
  async issueNativeConfirmation(binding: ProjectBinding, intent: Intent): Promise<NativePresetConfirmation> {
    validateBinding(binding);
    if (!validIntent(intent)) denied();
    const token = Object.freeze({}) as NativePresetConfirmation;
    this.#receipts.set(token, {
      binding: structuredClone(binding),
      intent,
      generation: (await this.settings.read()).generation,
      expires: Date.now() + 60_000,
    });
    return token;
  }
  #consume(binding: ProjectBinding, intent: Intent, token: NativePresetConfirmation): Receipt {
    const receipt = token && typeof token === 'object' ? this.#receipts.get(token) : undefined;
    if (token && typeof token === 'object') this.#receipts.delete(token);
    if (
      !receipt ||
      receipt.expires <= Date.now() ||
      receipt.intent !== intent ||
      !sameBinding(receipt.binding, binding)
    )
      denied();
    return receipt;
  }
  async confirmPreset(
    binding: ProjectBinding,
    preset: PermissionPreset,
    confirmation: NativePresetConfirmation,
  ): Promise<{ trustGrant: TrustGrant; agentGrant: AgentGrant }> {
    validateBinding(binding);
    binding = structuredClone(binding);
    if (preset !== 'recommended' && preset !== 'inspection') denied();
    const receipt = this.#consume(binding, preset, confirmation);
    const trustId = randomUUID();
    const agentId = randomUUID();
    const now = new Date().toISOString();
    const saved = await this.settings.update((state) => {
      if (state.generation !== receipt.generation) revoked();
      revokeMatching(state, binding, now);
      const generation = state.generation + 1;
      state.grants.push({
        grantId: trustId,
        generation,
        binding: structuredClone(binding),
        scopes:
          preset === 'recommended'
            ? ['inspect', 'author', 'evidence', 'export', 'record-decisions']
            : ['inspect'],
        mode: 'autonomous',
        grantedAt: now,
        revokedAt: null,
      });
      (state.agentGrants ??= []).push({
        grantId: agentId,
        trustGrantId: trustId,
        generation,
        binding: structuredClone(binding),
        preset,
        scopes: preset === 'recommended' ? [...agentScopes] : [],
        grantedAt: now,
        revokedAt: null,
      });
    });
    return {
      trustGrant: saved.grants.find((grant) => grant.grantId === trustId)!,
      agentGrant: saved.agentGrants!.find((grant) => grant.grantId === agentId)!,
    };
  }
  async revoke(binding: ProjectBinding, confirmation: NativePresetConfirmation): Promise<void> {
    validateBinding(binding);
    binding = structuredClone(binding);
    const receipt = this.#consume(binding, 'revoke', confirmation);
    await this.settings.update((state) => {
      if (state.generation !== receipt.generation) revoked();
      revokeMatching(state, binding, new Date().toISOString());
    });
  }
  async lookup(binding: ProjectBinding): Promise<AgentGrant | undefined> {
    validateBinding(binding);
    binding = structuredClone(binding);
    const state = await this.settings.read();
    return state.agentGrants?.findLast((grant) => active(state, binding, grant));
  }
  async check(
    binding: ProjectBinding,
    authorization: AgentAuthorization,
    required: readonly AgentScope[],
  ): Promise<AgentGrant> {
    return this.withAuthorization(binding, authorization, required, async (grant) => grant);
  }
  /** Acquire the project lock first, as with TrustStore. Keep the final bounded
   * dispatch/write under this settings lease so revoke cannot race authorization. */
  async withAuthorization<T>(
    binding: ProjectBinding,
    authorization: AgentAuthorization,
    required: readonly AgentScope[],
    action: (grant: AgentGrant) => Promise<T>,
  ): Promise<T> {
    validateBinding(binding);
    validateAuthorization(authorization, required);
    binding = structuredClone(binding);
    authorization = structuredClone(authorization);
    required = [...required];
    return this.settings.withCurrent(async (state) => {
      const grant = state.agentGrants?.find((item) => item.grantId === authorization.grantId);
      if (!active(state, binding, grant) || grant.generation !== authorization.generation) revoked();
      if (required.some((scope) => !grant.scopes.includes(scope))) denied();
      return action(structuredClone(grant));
    });
  }
}

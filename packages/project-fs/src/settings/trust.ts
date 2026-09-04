import { randomUUID } from 'node:crypto';
import type { Scope } from '@robopomelo/spec';
import type { Authorization } from '../contracts.js';
import { ProjectFsError } from '../errors.js';
import { requireSettingsAuthority, validateBinding, validateMode, validateScopes } from './schema.js';
import type { ProjectBinding, SettingsAuthority, TrustGrant, TrustMode } from './schema.js';
import type { SettingsStore } from './store.js';
export type { ProjectBinding, SettingsAuthority, TrustGrant, TrustMode } from './schema.js';

export function sameBinding(a:ProjectBinding,b:ProjectBinding):boolean {
  const path = (value:string) => process.platform === 'win32'?value.toLowerCase():value;
  return path(a.canonicalPath) === path(b.canonicalPath) && a.device === b.device && a.fileId === b.fileId && a.projectId === b.projectId;
}
function check(grant:TrustGrant|undefined,binding:ProjectBinding,authorization:Authorization,required:readonly Scope[]):TrustGrant {
  if (!grant || grant.revokedAt !== null || grant.generation !== authorization.generation || !sameBinding(grant.binding,binding)) throw new ProjectFsError('GRANT_REVOKED','Project authority was revoked, replaced, or no longer matches this root.');
  if (required.some(scope => !grant.scopes.includes(scope))) throw new ProjectFsError('SCOPE_DENIED','The project grant does not authorize this operation.');
  return grant;
}
export class TrustStore {
  #runs = new Map<string,TrustGrant>();
  #queues = new Map<string,Promise<void>>();
  constructor(private readonly settings:SettingsStore) {}
  async show(binding:ProjectBinding):Promise<TrustGrant[]> {
    validateBinding(binding);
    return (await this.settings.read()).grants.filter(grant => sameBinding(grant.binding,binding));
  }
  async lookup(binding:ProjectBinding):Promise<TrustGrant|undefined> {return (await this.show(binding)).findLast(grant => grant.revokedAt === null);}
  async grant(binding:ProjectBinding,scopes:Scope[],mode:TrustMode,authority:SettingsAuthority):Promise<TrustGrant> {
    requireSettingsAuthority(authority); validateBinding(binding); validateScopes(scopes); validateMode(mode);
    const grantId = randomUUID(); const now = new Date().toISOString();
    const saved = await this.settings.update(state => {
      for (const grant of state.grants) if (sameBinding(grant.binding,binding) && grant.revokedAt === null) {grant.revokedAt = now; grant.generation = state.generation+1;}
      state.grants.push({grantId,generation:state.generation+1,binding:structuredClone(binding),scopes:[...scopes],mode,grantedAt:now,revokedAt:null});
    });
    return saved.grants.find(grant => grant.grantId === grantId)!;
  }
  async revoke(grantId:string,authority:SettingsAuthority):Promise<void> {
    requireSettingsAuthority(authority);
    await this.settings.update(state => {
      const grant = state.grants.find(grant => grant.grantId === grantId);
      if (!grant) throw new ProjectFsError('GRANT_REVOKED','The remembered grant no longer exists.');
      grant.revokedAt = new Date().toISOString(); grant.generation = state.generation+1;
    });
  }
  async forget(binding:ProjectBinding,authority:SettingsAuthority):Promise<void> {
    requireSettingsAuthority(authority); validateBinding(binding);
    await this.settings.update(state => {state.grants = state.grants.filter(grant => !sameBinding(grant.binding,binding));});
  }
  /** Call only from an explicit trusted CLI/session authorization boundary. */
  authorizeRun(binding:ProjectBinding,scopes:Scope[],mode:TrustMode):TrustGrant {
    validateBinding(binding); validateScopes(scopes); validateMode(mode);
    const grant:TrustGrant = {grantId:randomUUID(),generation:1,binding:structuredClone(binding),scopes:[...scopes],mode,grantedAt:new Date().toISOString(),revokedAt:null};
    this.#runs.set(grant.grantId,grant); return structuredClone(grant);
  }
  async #withRun<T>(id:string,action:()=>Promise<T>):Promise<T> {
    const prior = this.#queues.get(id) ?? Promise.resolve();
    let release!:()=>void;
    const held = new Promise<void>(resolve => {release = resolve;});
    const queued = prior.then(() => held); this.#queues.set(id,queued);
    await prior;
    try {return await action();} finally {release(); if (this.#queues.get(id) === queued) this.#queues.delete(id);}
  }
  async revokeRun(grantId:string):Promise<void> {
    await this.#withRun(grantId,async () => {
      const grant = this.#runs.get(grantId);
      if (grant) {grant.revokedAt = new Date().toISOString(); grant.generation++;}
    });
  }
  async withAuthorization<T>(binding:ProjectBinding,authorization:Authorization,required:readonly Scope[],action:(grant:TrustGrant)=>Promise<T>):Promise<T> {
    validateBinding(binding); validateScopes([...required]);
    if (this.#runs.has(authorization.grantId)) return this.#withRun(authorization.grantId,async () => action(structuredClone(check(this.#runs.get(authorization.grantId),binding,authorization,required))));
    return this.settings.withCurrent(async state => action(structuredClone(check(state.grants.find(grant => grant.grantId === authorization.grantId),binding,authorization,required))));
  }
}

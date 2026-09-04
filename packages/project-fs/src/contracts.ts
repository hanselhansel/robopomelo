import type { Scope } from '@robopomelo/spec';
export type { RootIdentity } from './fs/safe-fs.js';
export interface Authorization {grantId:string; generation:number; scopes:Scope[]}

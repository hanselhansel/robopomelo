import type { PatchContext, PatchEnvelope, PatchOperation, ReviewCommand, ReviewInput } from '@robopomelo/spec';
import { context } from './validation-fixtures.test.js';
export const recorder={kind:'human' as const,name:'person',source:'review meeting'};
export const mutationContext=(overrides:Partial<PatchContext>={}):PatchContext=>({...context(),scopes:['author','record-decisions','evidence'],nextRevision:'rev-2',timestamp:'2026-09-05T01:00:00Z',...overrides});
export const patch=(operations:PatchOperation[],overrides:Partial<PatchEnvelope>={}):PatchEnvelope=>({formatVersion:'1.0.0',id:'change-1',projectId:'project-1',baseRevision:'rev-1',baseHash:'a'.repeat(64),actor:recorder,purpose:'Revise planning content',operations,...overrides});
export const review=(input:ReviewInput,overrides:Partial<ReviewCommand>={}):ReviewCommand=>({formatVersion:'1.0.0',id:'review-change',projectId:'project-1',baseRevision:'rev-1',baseHash:'a'.repeat(64),actor:recorder,purpose:'Record supplied review decision',input,...overrides});

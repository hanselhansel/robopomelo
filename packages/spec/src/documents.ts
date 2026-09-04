import type { Id } from './common.js';

export interface TraceabilityRow { needId: Id; workflowIds: Id[]; kpiIds: Id[]; requirementIds: Id[]; testIds: Id[]; evidenceIds: Id[]; gapRuleIds: string[] }
export interface ReviewSection { id: string; title: string; records: {id: Id; title: string; fields: {label: string; value: string}[]}[] }
export interface ReviewDocument { title: string; sourceRevision: Id; sections: ReviewSection[] }

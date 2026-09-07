import { ProviderError } from './contracts.js';

export const RESEARCH_SECTORS = ['warehouse', 'manufacturing', 'hospital', 'retail-backroom'] as const;
export const RESEARCH_PROCESSES = ['inbound-receiving', 'putaway', 'picking', 'replenishment', 'shipping', 'intralogistics-transfer'] as const;
export const RESEARCH_ENVIRONMENTS = ['narrow-aisle', 'wide-aisle', 'mixed-traffic', 'cold-storage', 'mezzanine'] as const;
export const RESEARCH_QUESTION_CLASSES = ['safety-standards', 'throughput-benchmarks', 'fleet-sizing', 'charging-strategy', 'handoff-design', 'floor-requirements'] as const;

export type ResearchSector = (typeof RESEARCH_SECTORS)[number];
export type ResearchProcess = (typeof RESEARCH_PROCESSES)[number];
export type ResearchEnvironment = (typeof RESEARCH_ENVIRONMENTS)[number];
export type ResearchQuestionClass = (typeof RESEARCH_QUESTION_CLASSES)[number];
export type ResearchTopic = {
  sector: ResearchSector;
  process: ResearchProcess;
  environment: ResearchEnvironment;
  questionClass: ResearchQuestionClass;
};
export type CustomQueryPreview = { kind: 'preview-required'; query: string };

const SECTOR_LABEL: Record<ResearchSector, string> = {
  warehouse: 'warehouse', manufacturing: 'manufacturing plant', hospital: 'hospital', 'retail-backroom': 'retail backroom',
};
const PROCESS_LABEL: Record<ResearchProcess, string> = {
  'inbound-receiving': 'inbound receiving', putaway: 'putaway', picking: 'order picking',
  replenishment: 'replenishment', shipping: 'outbound shipping', 'intralogistics-transfer': 'intralogistics transfer',
};
const ENVIRONMENT_LABEL: Record<ResearchEnvironment, string> = {
  'narrow-aisle': 'narrow aisle', 'wide-aisle': 'wide aisle', 'mixed-traffic': 'mixed pedestrian traffic',
  'cold-storage': 'cold storage', mezzanine: 'mezzanine',
};
/** Reviewed templates: `s` sector, `p` process, `e` environment. No other input can reach a query. */
const QUERY_TEMPLATES: Record<ResearchQuestionClass, ((s: string, p: string, e: string) => string)[]> = {
  'safety-standards': [
    (s, _p, e) => `mobile robot safety standards ${e} ${s}`,
    (s, p) => `iso 3691 4 ansi r15 08 ${p} ${s} requirements`,
  ],
  'throughput-benchmarks': [
    (s, p) => `${p} throughput benchmark autonomous mobile robots ${s}`,
    (s, p, e) => `${p} picks per hour ${e} ${s}`,
  ],
  'fleet-sizing': [
    (s, p) => `amr fleet sizing ${p} ${s}`,
    (s, _p, e) => `mobile robot fleet size calculation ${e} ${s}`,
  ],
  'charging-strategy': [
    (s) => `amr opportunity charging strategy ${s}`,
    (s, p, e) => `mobile robot battery charging schedule ${p} ${e} ${s}`,
  ],
  'handoff-design': [
    (s, p) => `human robot handoff station design ${p} ${s}`,
    (s, _p, e) => `amr conveyor handoff layout ${e} ${s}`,
  ],
  'floor-requirements': [
    (s, _p, e) => `amr floor flatness and slope requirements ${e} ${s}`,
    (s, p) => `mobile robot floor load and surface requirements ${p} ${s}`,
  ],
};

function oneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function reject(field: string): never {
  throw new ProviderError('RESEARCH_PRIVATE_QUERY', `research topic field ${field} is not a curated enum value`);
}

/** Only curated enum members pass. The offending value is never echoed because it may be private text. */
export function validateResearchTopic(value: unknown): ResearchTopic {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) reject('topic');
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = ['environment', 'process', 'questionClass', 'sector'];
  if (keys.length !== expected.length || keys.some((key, i) => key !== expected[i])) reject('keys');
  if (!oneOf(RESEARCH_SECTORS, record.sector)) reject('sector');
  if (!oneOf(RESEARCH_PROCESSES, record.process)) reject('process');
  if (!oneOf(RESEARCH_ENVIRONMENTS, record.environment)) reject('environment');
  if (!oneOf(RESEARCH_QUESTION_CLASSES, record.questionClass)) reject('questionClass');
  return { sector: record.sector, process: record.process, environment: record.environment, questionClass: record.questionClass };
}

export function buildResearchQueries(topic: ResearchTopic): string[] {
  const valid = validateResearchTopic(topic);
  const s = SECTOR_LABEL[valid.sector];
  const p = PROCESS_LABEL[valid.process];
  const e = ENVIRONMENT_LABEL[valid.environment];
  return QUERY_TEMPLATES[valid.questionClass].map((template) => template(s, p, e));
}

/** Free text is returned for one-time user review; nothing here executes or contacts a transport. */
export function previewCustomQuery(text: string): CustomQueryPreview {
  return { kind: 'preview-required', query: text };
}

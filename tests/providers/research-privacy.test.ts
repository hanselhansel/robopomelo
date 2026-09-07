import { describe, expect, it } from 'vitest';
import {
  RESEARCH_ENVIRONMENTS, RESEARCH_PROCESSES, RESEARCH_QUESTION_CLASSES, RESEARCH_SECTORS,
  buildResearchQueries, previewCustomQuery, validateResearchTopic,
} from '../../packages/providers/src/index.js';
import type { ResearchTopic } from '../../packages/providers/src/index.js';
import { failure } from './helpers.js';

const PRIVATE = ['Acme Logistics', 'Project Falcon', 'https://intranet.acme.test/site-plan.pdf', 'dock 7 receives 400 pallets per day'];

describe('research confidentiality', () => {
  it('builds queries for every enum combination from labels only', () => {
    const seen = new Set<string>();
    let combos = 0;
    for (const sector of RESEARCH_SECTORS) for (const process of RESEARCH_PROCESSES)
      for (const environment of RESEARCH_ENVIRONMENTS) for (const questionClass of RESEARCH_QUESTION_CLASSES) {
        combos += 1;
        const topic: ResearchTopic = { sector, process, environment, questionClass };
        const queries = buildResearchQueries(validateResearchTopic(topic));
        expect(queries.length).toBeGreaterThan(0);
        for (const query of queries) {
          expect(query).toMatch(/^[a-z0-9 ]+$/);
          expect(query.length).toBeLessThanOrEqual(160);
          for (const text of PRIVATE) expect(query.toLowerCase()).not.toContain(text.toLowerCase());
          seen.add(query);
        }
      }
    expect(combos).toBe(RESEARCH_SECTORS.length * RESEARCH_PROCESSES.length * RESEARCH_ENVIRONMENTS.length * RESEARCH_QUESTION_CLASSES.length);
    expect(seen.size).toBeGreaterThan(RESEARCH_QUESTION_CLASSES.length);
  });

  it('rejects unknown enum values and free text with RESEARCH_PRIVATE_QUERY', async () => {
    const base = { sector: 'warehouse', process: 'picking', environment: 'narrow-aisle', questionClass: 'fleet-sizing' };
    const bad: unknown[] = [
      { ...base, sector: 'Acme Logistics' },
      { ...base, process: 'picking at dock 7' },
      { ...base, environment: 'narrow-aisle ' },
      { ...base, questionClass: 'anything' },
      { ...base, extra: 'Project Falcon' },
      { sector: 'warehouse', process: 'picking', environment: 'narrow-aisle' },
      null, 'warehouse picking', [], 42,
    ];
    for (const value of bad) {
      const error = await failure(Promise.resolve().then(() => validateResearchTopic(value)));
      expect(error.code).toBe('RESEARCH_PRIVATE_QUERY');
      for (const text of PRIVATE) expect(error.message).not.toContain(text);
    }
    expect(validateResearchTopic(base)).toEqual(base);
  });

  it('returns a preview-required result for custom text and never executes it', () => {
    const preview = previewCustomQuery('AMR vendors near Acme Logistics dock 7');
    expect(preview).toEqual({ kind: 'preview-required', query: 'AMR vendors near Acme Logistics dock 7' });
    expect(Object.keys(preview).sort()).toEqual(['kind', 'query']);
    expect(previewCustomQuery.length).toBe(1);
  });
});

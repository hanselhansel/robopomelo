import { writeFileSync, mkdirSync } from 'node:fs';
import { snapshot, document, traceabilityRows } from './reference.js';
mkdirSync('test-results', { recursive: true });
writeFileSync(
  'test-results/frontend-reference.json',
  JSON.stringify({ snapshot, document, traceabilityRows }, null, 2),
);

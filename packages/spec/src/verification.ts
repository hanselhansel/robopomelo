import type { Collection } from './patch.js';

/** Planning assertion fields permitted by each record schema. */
export const VERIFICATION_CLAIM_PATHS = {
  "stakeholders": [
    "title",
    "description",
    "role",
    "responsibilities"
  ],
  "needs": [
    "title",
    "description",
    "outcome",
    "disposition"
  ],
  "problems": [
    "title",
    "description",
    "observation"
  ],
  "workflows": [
    "title",
    "description",
    "loadSubject",
    "origin",
    "destination",
    "volume"
  ],
  "challenges": [
    "title",
    "description",
    "statement",
    "nextAction",
    "resolution"
  ],
  "risks": [
    "title",
    "description",
    "statement",
    "nextAction",
    "resolution",
    "consequence",
    "mitigation"
  ],
  "assumptions": [
    "title",
    "description",
    "statement",
    "nextAction",
    "resolution",
    "verificationAction"
  ],
  "kpis": [
    "title",
    "description",
    "definition",
    "baseline",
    "target",
    "measurementMethod",
    "measurementWindow"
  ],
  "requirements": [
    "title",
    "description",
    "capability",
    "rationale",
    "constraints",
    "verificationDisposition"
  ],
  "acceptanceTests": [
    "title",
    "description",
    "preconditions",
    "procedure",
    "measurementMethod",
    "criterion"
  ],
  "evidence": [
    "title",
    "description",
    "provenance",
    "location"
  ],
  "decisions": [
    "title",
    "description",
    "question",
    "options",
    "rationale"
  ],
  "challengeAnswers": [
    "title",
    "description",
    "answer"
  ]
} as const satisfies Record<Collection, readonly string[]>;

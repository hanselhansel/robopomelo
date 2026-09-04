import { describe, it, expect } from 'vitest';
import { createBlankProject } from '@robopomelo/core';
import type { ProjectSnapshot } from '@robopomelo/spec';
import { DraftController } from '../src/lib/draft.js';
const snapshot = (): ProjectSnapshot => ({
  deployment: createBlankProject({
    id: 'p',
    name: 'First',
    revision: 'r1',
    timestamp: '2026-09-05T00:00:00Z',
  }),
  sourceRevision: 'r1',
  sourceHash: 'a'.repeat(64),
  planningHash: 'b'.repeat(64),
  validation: {
    readiness: 'blocked',
    label: 'Blocked',
    findings: [],
    counts: { blockers: 1, warnings: 0, waived: 0, unacknowledged: 0 },
    sourceRevision: 'r1',
    sourceHash: 'a'.repeat(64),
    toolVersion: '1',
    specVersion: '1.0.0',
    ruleSetVersion: '1',
  },
  approvalStatus: 'none',
  approvalDetails: { status: 'none', decisionId: null, reasons: [] },
  evidenceObservations: [],
});
describe('loss-preserving serialized draft', () => {
  it('retains input and committed base after permission failure', async () => {
    const base = snapshot();
    const d = new DraftController(base, async () => {
      throw new Error('Scope denied');
    });
    d.edit({ op: 'project', fields: { name: 'Desired' } });
    expect(await d.flush()).toBe(false);
    expect(d.view.deployment.project.name).toBe('Desired');
    expect(d.view.committed.sourceRevision).toBe('r1');
    expect(d.view.state).toBe('Save failed');
  });
  it('keeps a proposed added record cumulative against the original committed base', async () => {
    const patches: unknown[] = [];
    const d = new DraftController(snapshot(), async (p) => {
      patches.push(p);
      return { kind: 'proposal', proposalId: 'proposal', patchDigest: 'digest', diff: [] };
    });
    d.edit({
      op: 'add',
      collection: 'stakeholders',
      record: {
        id: 's',
        title: 'Operator',
        description: null,
        ownerId: null,
        sourceEvidenceIds: [],
        extensions: {},
        role: null,
        responsibilities: [],
      },
    });
    await d.flush();
    d.edit({ op: 'update', collection: 'stakeholders', id: 's', fields: { title: 'Shift operator' } });
    await d.flush();
    expect(d.view.state).toBe('Proposed');
    expect(d.view.committed.deployment.stakeholders).toHaveLength(0);
    expect(patches[1]).toMatchObject({
      baseRevision: 'r1',
      operations: [{ op: 'add', record: { title: 'Shift operator' } }],
    });
  });
  it('serializes a later edit behind an inflight commit and preserves it', async () => {
    let release!: (v: ReturnType<typeof snapshot>) => void;
    let calls = 0;
    const d = new DraftController(snapshot(), async (p) => {
      calls++;
      if (calls === 1) {
        const s = await new Promise<ProjectSnapshot>((r) => {
          release = r;
        });
        return { kind: 'committed', snapshot: s, diff: [] };
      }
      const s = snapshot();
      s.deployment.project.name = String(
        p.operations[0]?.op === 'project' ? p.operations[0].fields.name : '',
      );
      s.sourceRevision = 'r3';
      return { kind: 'committed', snapshot: s, diff: [] };
    });
    d.edit({ op: 'project', fields: { name: 'First edit' } });
    const saved = d.flush();
    await Promise.resolve();
    d.edit({ op: 'project', fields: { name: 'Later edit' } });
    const s = snapshot();
    s.deployment.project.name = 'First edit';
    s.sourceRevision = 'r2';
    release(s);
    await saved;
    expect(calls).toBe(2);
    expect(d.view.deployment.project.name).toBe('Later edit');
    expect(d.view.state).toBe('Saved');
  });
});
it('retries an unknown outcome with the original mutation ID before sending subsequent edits', async () => {
  const sent: import('@robopomelo/spec').PatchEnvelope[] = [];
  const d = new DraftController(snapshot(), async (p) => {
    sent.push(p);
    if (sent.length === 1) throw Object.assign(new Error('Receipt unavailable'), { code: 'OUTCOME_UNKNOWN' });
    const s = snapshot();
    s.sourceRevision = sent.length === 2 ? 'r2' : 'r3';
    s.deployment.project.name = String(p.operations[0]?.op === 'project' ? p.operations[0].fields.name : '');
    return { kind: 'committed', snapshot: s, diff: [] };
  });
  d.edit({ op: 'project', fields: { name: 'First request' } });
  expect(await d.flush()).toBe(false);
  d.edit({ op: 'project', fields: { name: 'Later input' } });
  await d.flush();
  expect(sent[1]?.id).toBe(sent[0]?.id);
  expect(sent[1]?.operations).toEqual(sent[0]?.operations);
  expect(d.view.deployment.project.name).toBe('Later input');
  expect(sent).toHaveLength(3);
});

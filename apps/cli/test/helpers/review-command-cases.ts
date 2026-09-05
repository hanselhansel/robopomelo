import { expect, it } from 'vitest';
import { planningHash } from '@robopomelo/core';
import type { fixture } from './commands.js';
export function reviewCommandCases(host: (example?: boolean) => ReturnType<typeof fixture>): void {
  it('records only supplied review data and preserves the supplied decision date', async () => {
    const f = await host(true),
      s = await f.project.snapshot(),
      reviewer = s.deployment.stakeholders.find((p) => p.id === 'stakeholder-operator')!,
      recorder = { kind: 'human' as const, name: reviewer.title, source: 'Supplied meeting record' };
    const approval = {
      id: 'operator-decision',
      reviewerId: reviewer.id,
      reviewerName: reviewer.title,
      recorder,
      reviewerRole: 'Warehouse operator',
      decision: 'changes-requested',
      decidedAt: '2026-08-30T12:00:00Z',
      source: 'Supplied meeting record',
      sourceRevision: s.sourceRevision,
      sourceHash: s.sourceHash,
      planningHash: planningHash(s.deployment),
      ruleSetVersion: s.validation.ruleSetVersion,
      acknowledgmentIds: [],
      waiverIds: [],
      evidenceIds: [],
    };
    const command = {
      formatVersion: '1.0.0',
      id: 'review-change',
      projectId: s.deployment.project.id,
      baseRevision: s.sourceRevision,
      baseHash: s.sourceHash,
      actor: recorder,
      purpose: 'Record supplied operator feedback',
      input: { action: 'approve', record: approval },
    };
    await expect(
      f.run(['review', 'approve', '-', '--authorize', 'author', '--yes'], command),
    ).rejects.toMatchObject({ code: 'SCOPE_REQUIRED' });
    const saved = await f.run(['review', 'approve', '-', '--authorize', 'record-decisions'], command);
    expect(saved.data).toMatchObject({ status: 'applied', approvalStatus: 'changes-requested' });
    expect(saved.snapshot?.deployment.review.approvals[0]?.decidedAt).toBe(approval.decidedAt);
    const next = saved.snapshot!;
    const revoked = await f.run([
      'review',
      'revoke',
      approval.id,
      '--base-revision',
      next.sourceRevision,
      '--base-hash',
      next.sourceHash,
      '--actor',
      JSON.stringify(recorder),
      '--source',
      'Supplied meeting record',
      '--reason',
      'Withdraw this decision',
      '--date',
      '2026-09-01T00:00:00Z',
      '--authorize',
      'record-decisions',
    ]);
    expect(revoked.data).toMatchObject({ approvalStatus: 'revoked' });
  });
  it('acknowledges and waives exact warnings through structured review envelopes', async () => {
    const f = await host(true);
    let s = await f.project.snapshot();
    const reviewer = s.deployment.stakeholders.find((p) => p.id === 'stakeholder-operator')!,
      recorder = { kind: 'human' as const, name: reviewer.title, source: 'Supplied review' };
    const warning = s.validation.findings.find((f) => f.waivable)!;
    const record = {
      id: 'warning-ack',
      findingFingerprint: warning.fingerprint,
      planningHash: s.planningHash,
      actor: recorder,
      reason: 'Reviewed the planning uncertainty',
      recordedAt: '2026-09-01T00:00:00Z',
      source: 'Supplied review',
    };
    const envelope = (input: unknown) => ({
      formatVersion: '1.0.0',
      id: f.project.id(),
      projectId: s.deployment.project.id,
      baseRevision: s.sourceRevision,
      baseHash: s.sourceHash,
      actor: recorder,
      purpose: 'Record supplied warning decision',
      input,
    });
    const acknowledged = await f.run(
      ['review', 'acknowledge', '-', '--authorize', 'record-decisions'],
      envelope({ action: 'acknowledge', records: [record] }),
    );
    expect(
      acknowledged.snapshot?.validation.findings.find((f) => f.fingerprint === warning.fingerprint)
        ?.acknowledged,
    ).toBe(true);
    s = acknowledged.snapshot!;
    const waived = await f.run(
      ['review', 'waive', '-', '--authorize', 'record-decisions'],
      envelope({
        action: 'waive',
        record: { ...record, id: 'warning-waiver', ruleId: warning.ruleId, evidenceIds: [] },
      }),
    );
    expect(
      waived.snapshot?.validation.findings.find((f) => f.fingerprint === warning.fingerprint)?.status,
    ).toBe('waived');
  });
  it('never converts a blocked approval into a recorded rejection', async () => {
    const f = await host(true),
      s = await f.project.snapshot(),
      reviewer = s.deployment.stakeholders.find((p) => p.id === 'stakeholder-operator')!,
      recorder = { kind: 'human', name: reviewer.title, source: 'Meeting' };
    const command = {
      formatVersion: '1.0.0',
      id: 'approval-attempt',
      projectId: s.deployment.project.id,
      baseRevision: s.sourceRevision,
      baseHash: s.sourceHash,
      actor: recorder,
      purpose: 'Record approval',
      input: {
        action: 'approve',
        record: {
          id: 'approval',
          reviewerId: reviewer.id,
          reviewerName: reviewer.title,
          recorder,
          reviewerRole: 'Operator',
          decision: 'approved',
          decidedAt: '2026-09-01T00:00:00Z',
          source: 'Meeting',
          sourceRevision: s.sourceRevision,
          sourceHash: s.sourceHash,
          planningHash: s.planningHash,
          ruleSetVersion: s.validation.ruleSetVersion,
          acknowledgmentIds: [],
          waiverIds: [],
          evidenceIds: [],
        },
      },
    };
    await expect(
      f.run(['review', 'approve', '-', '--authorize', 'record-decisions', '--yes'], command),
    ).rejects.toMatchObject({ code: 'WARNINGS_UNACKNOWLEDGED' });
    expect((await f.project.snapshot()).deployment.review.approvals).toEqual([]);
  });
}

import { useRef, useState } from 'react';
import type { ProjectSnapshot, ReviewCommand, Approval, Finding, Scope } from '@robopomelo/spec';
import { ApiError, api } from '../lib/api.js';
import { useAction } from '../lib/hooks.js';
import { Modal, TextInput, ErrorNotice } from '../components/ui.js';
export function DecisionDialog({
  snapshot,
  onClose,
  onRefresh,
  scopes,
  onSettings,
}: {
  snapshot: ProjectSnapshot;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  scopes: Scope[];
  onSettings: () => void;
}) {
  const [reviewerId, setReviewer] = useState('');
  const [recorder, setRecorder] = useState('');
  const [source, setSource] = useState('');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [decision, setDecision] = useState<Approval['decision']>('approved');
  const [checked, setChecked] = useState<string[]>([]);
  const [delegated, setDelegated] = useState(false);
  const [operation, setOperation] = useState<'approve' | 'waive' | 'revoke'>('approve');
  const [waiverFinding, setWaiverFinding] = useState('');
  const pending = useRef<ReviewCommand | null>(null);
  const action = useAction();
  const warnings = snapshot.validation.findings.filter(
    (f) => f.severity === 'warning' && f.status === 'active' && !f.acknowledged,
  );
  const reviewerName = snapshot.deployment.stakeholders.find((s) => s.id === reviewerId)?.title ?? '';
  const actor = {
    kind: 'human' as const,
    name: recorder,
    source,
    ...(delegated && reviewerName ? { onBehalfOf: reviewerName } : {}),
  };
  const authorized = scopes.includes('record-decisions');
  const command = (input: ReviewCommand['input']): ReviewCommand => ({
    formatVersion: '1.0.0',
    id: crypto.randomUUID(),
    projectId: snapshot.deployment.project.id,
    baseRevision: snapshot.sourceRevision,
    baseHash: snapshot.sourceHash,
    actor,
    purpose: 'Record an explicitly supplied operator review decision',
    input,
  });
  const validFacts = recorder.trim() && source.trim() && Number.isFinite(Date.parse(date));
  const submit = async (input: ReviewCommand['input']) => {
    pending.current ??= command(input);
    let result;
    try {
      result = await api.review(pending.current);
      pending.current = null;
    } catch (error) {
      if (error instanceof ApiError && error.code !== 'OUTCOME_UNKNOWN') pending.current = null;
      throw error;
    }
    if (result.kind === 'conflict')
      throw new Error(
        'The source changed. All supplied review facts remain here. Recheck the current revision before recording.',
      );
    if (result.kind === 'proposal') {
      action.setNotice(
        `Review action proposed as ${result.proposalId}. Open Changes to inspect and apply it.`,
      );
      return false;
    }
    await onRefresh();
    return true;
  };
  const acknowledge = async () => {
    const committed = await submit({
      action: 'acknowledge',
      records: warnings
        .filter((f) => checked.includes(f.fingerprint))
        .map((f) => ({
          id: crypto.randomUUID(),
          findingFingerprint: f.fingerprint,
          planningHash: snapshot.planningHash,
          actor,
          reason,
          recordedAt: date,
          source,
        })),
    });
    if (committed) {
      action.setNotice(
        'Warning acknowledgments recorded. Review the refreshed source before recording the final decision.',
      );
      setChecked([]);
    }
  };
  const otherAction = async () => {
    if (operation === 'waive') {
      const finding = snapshot.validation.findings.find((f) => f.fingerprint === waiverFinding && f.waivable);
      if (!finding) throw new Error('Select an applicable waivable finding.');
      if (
        await submit({
          action: 'waive',
          record: {
            id: crypto.randomUUID(),
            findingFingerprint: finding.fingerprint,
            planningHash: snapshot.planningHash,
            actor,
            reason,
            recordedAt: date,
            source,
            ruleId: finding.ruleId,
            evidenceIds: [],
          },
        })
      )
        action.setNotice('Supplied waiver recorded.');
    } else {
      const approvalId = snapshot.deployment.review.currentApprovalId;
      if (!approvalId) throw new Error('There is no current decision to revoke.');
      if (
        await submit({
          action: 'revoke',
          record: { id: crypto.randomUUID(), approvalId, actor, reason, source, recordedAt: date },
        })
      )
        action.setNotice('Supplied revocation recorded.');
    }
  };
  const approve = async () => {
    const reviewer = snapshot.deployment.stakeholders.find((s) => s.id === reviewerId);
    if (!reviewer) throw new Error('Select the supplied reviewer.');
    const role = reviewer.role && 'value' in reviewer.role ? reviewer.role.value : '';
    const record: Approval = {
      id: crypto.randomUUID(),
      reviewerId,
      reviewerName: reviewer.title,
      reviewerRole: role,
      recorder: actor,
      decision,
      decidedAt: date,
      source,
      sourceRevision: snapshot.sourceRevision,
      sourceHash: snapshot.sourceHash,
      planningHash: snapshot.planningHash,
      ruleSetVersion: snapshot.validation.ruleSetVersion,
      acknowledgmentIds: snapshot.deployment.review.acknowledgments
        .filter((a) => a.planningHash === snapshot.planningHash)
        .map((a) => a.id),
      waiverIds: snapshot.deployment.review.waivers
        .filter((a) => a.planningHash === snapshot.planningHash)
        .map((a) => a.id),
      evidenceIds: [],
    };
    if (await submit({ action: 'approve', record })) onClose();
  };
  return (
    <Modal title="Record a supplied operator decision" onClose={onClose}>
      <p>
        This records a decision already supplied by the responsible person. RoboPomelo does not approve a
        physical deployment.
      </p>
      <p className="meta">
        Reviewed revision: {snapshot.sourceRevision}
        <br />
        Planning hash: {snapshot.planningHash}
      </p>
      {!authorized && (
        <div className="notice warning">
          <p>Decision-recording authority is required separately from authoring.</p>
          <button onClick={onSettings}>Open authority settings</button>
        </div>
      )}
      <label htmlFor="review-operation">Review action</label>
      <select
        id="review-operation"
        value={operation}
        onChange={(e) => setOperation(e.target.value as typeof operation)}
      >
        <option value="approve">Record operator decision</option>
        <option value="waive">Record a supplied waiver</option>
        <option value="revoke">Record a supplied revocation</option>
      </select>
      <label htmlFor="decision-reviewer">Supplied reviewer</label>
      <select id="decision-reviewer" value={reviewerId} onChange={(e) => setReviewer(e.target.value)}>
        <option value="">Select reviewer</option>
        {snapshot.deployment.stakeholders.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title} ({s.id})
          </option>
        ))}
      </select>
      <TextInput id="decision-recorder" label="Recorded by" value={recorder} onChange={setRecorder} />
      {recorder !== reviewerName && (
        <label className="check-row">
          <input type="checkbox" checked={delegated} onChange={(e) => setDelegated(e.target.checked)} />I am
          recording the selected reviewer's supplied decision on their behalf.
        </label>
      )}
      <TextInput
        id="decision-source"
        label="Source of supplied decision"
        value={source}
        onChange={setSource}
        help="For example, the named review meeting or a linked decision record."
      />
      <TextInput
        id="decision-date"
        label="Supplied decision date and time (ISO 8601)"
        value={date}
        onChange={setDate}
      />
      {operation === 'approve' && warnings.length > 0 && (
        <fieldset>
          <legend>Unacknowledged warnings</legend>
          {warnings.map((f: Finding) => (
            <label className="check-row" key={f.fingerprint}>
              <input
                type="checkbox"
                checked={checked.includes(f.fingerprint)}
                onChange={(e) =>
                  setChecked(
                    e.target.checked
                      ? [...checked, f.fingerprint]
                      : checked.filter((v) => v !== f.fingerprint),
                  )
                }
              />
              {f.message}
            </label>
          ))}
          <TextInput
            id="ack-reason"
            label="Supplied acknowledgment reason"
            value={reason}
            onChange={setReason}
            multiline
          />
          <button
            disabled={!authorized || !validFacts || !reason.trim() || !checked.length || action.busy}
            onClick={() => void action.run(acknowledge)}
          >
            Record selected warning acknowledgments
          </button>
        </fieldset>
      )}
      {operation !== 'approve' && (
        <fieldset>
          <legend>{operation === 'waive' ? 'Supplied waiver' : 'Supplied revocation'}</legend>
          {operation === 'waive' && (
            <>
              <label htmlFor="waiver-finding">Waivable finding</label>
              <select
                id="waiver-finding"
                value={waiverFinding}
                onChange={(e) => setWaiverFinding(e.target.value)}
              >
                <option value="">Select a finding</option>
                {snapshot.validation.findings
                  .filter((f) => f.waivable && f.status === 'active')
                  .map((f) => (
                    <option key={f.fingerprint} value={f.fingerprint}>
                      {f.ruleId}: {f.message}
                    </option>
                  ))}
              </select>
            </>
          )}
          <TextInput id="review-reason" label="Supplied reason" value={reason} onChange={setReason} />
          <button
            disabled={!authorized || !validFacts || !reason.trim() || action.busy}
            onClick={() => void action.run(otherAction)}
          >
            Record supplied {operation === 'waive' ? 'waiver' : 'revocation'}
          </button>
        </fieldset>
      )}
      <label htmlFor="decision-value">Supplied decision</label>
      <select
        id="decision-value"
        value={decision}
        onChange={(e) => setDecision(e.target.value as Approval['decision'])}
      >
        <option value="approved">Approved</option>
        <option value="changes-requested">Changes requested</option>
        <option value="rejected">Rejected</option>
      </select>
      {decision === 'approved' && snapshot.validation.counts.blockers > 0 && (
        <p className="notice warning">
          Approval is blocked by the current findings. A supplied rejection or request for changes can still
          be recorded.
        </p>
      )}
      <ErrorNotice message={action.error} />
      <p role="status">{action.notice}</p>
      <button
        className="primary"
        disabled={
          operation !== 'approve' ||
          !authorized ||
          (recorder !== reviewerName && !delegated) ||
          !validFacts ||
          !reviewerId ||
          action.busy ||
          (decision === 'approved' && (snapshot.validation.counts.blockers > 0 || warnings.length > 0))
        }
        onClick={() => void action.run(approve)}
      >
        Record supplied decision
      </button>
    </Modal>
  );
}

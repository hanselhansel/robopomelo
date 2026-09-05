// @vitest-environment jsdom
import { it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { ProjectSnapshot } from '@robopomelo/spec';
import { snapshot as referenceSnapshot } from './reference.js';
import { DecisionDialog } from '../src/screens/DecisionDialog.js';
import { api } from '../src/lib/api.js';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('keeps supplied review facts visible when the review is proposed rather than committed', async () => {
  vi.spyOn(api, 'review').mockResolvedValue({
    kind: 'proposal',
    proposalId: 'review-proposal',
    patchDigest: 'd',
    diff: [],
  });
  const refresh = vi.fn();
  const close = vi.fn();
  const snapshot = referenceSnapshot;
  render(
    <DecisionDialog
      snapshot={snapshot}
      onClose={close}
      onRefresh={refresh}
      scopes={['record-decisions']}
      onSettings={() => {}}
    />,
  );
  const reviewer = snapshot.deployment.stakeholders[0]!;
  fireEvent.change(screen.getByLabelText('Supplied reviewer'), { target: { value: reviewer.id } });
  fireEvent.change(screen.getByLabelText('Recorded by'), { target: { value: reviewer.title } });
  fireEvent.change(screen.getByLabelText('Source of supplied decision'), {
    target: { value: 'Operator review meeting' },
  });
  fireEvent.change(screen.getByLabelText('Supplied decision date and time (ISO 8601)'), {
    target: { value: '2026-09-05T00:00:00Z' },
  });
  fireEvent.change(screen.getByLabelText('Supplied decision'), { target: { value: 'changes-requested' } });
  fireEvent.click(screen.getByRole('button', { name: 'Record supplied decision' }));
  await waitFor(() => expect(screen.getByText(/Review action proposed as review-proposal/)).toBeTruthy());
  expect(refresh).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Source of supplied decision')).toHaveProperty(
    'value',
    'Operator review meeting',
  );
});

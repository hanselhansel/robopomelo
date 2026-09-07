// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AssetDraft, type AssetDraftView, type UpgradePreviewView } from '../src/features/scene/AssetDraft.js';
afterEach(cleanup);
const draft = (over: Partial<AssetDraftView> = {}): AssetDraftView => ({
  id: 'rack-row-custom', kind: 'assembly', version: null, status: 'draft', promotedTo: null,
  validation: { ok: false, findings: [{ code: 'ASSET_UNKNOWN', message: 'Catalog has no entry conveyor@1.0.0.' }] },
  ...over,
});
const validated = (): AssetDraftView => draft({ status: 'validated', validation: { ok: true, findings: [] } });
const preview: UpgradePreviewView = {
  from: { id: 'rack-row-custom', version: '1.0.0', sha256: 'a'.repeat(64) }, to: { id: 'rack-row-custom', version: '1.1.0', sha256: 'b'.repeat(64) },
  direction: 'upgrade', flagged: false,
  parameterChanges: [{ name: 'lengthM', change: 'bounds-changed', from: { minimum: 1, maximum: 120 }, to: { minimum: 1, maximum: 20 } }],
  affectedInstanceIds: ['row-a', 'row-b'], resizedInstanceIds: ['row-b'], actions: [],
};
const handlers = () => ({ onValidate: vi.fn(async () => {}), onPromote: vi.fn(async (_version: string) => {}), onApplyUpgrade: vi.fn(async (_preview: UpgradePreviewView) => {}) });
it('shows kind, status and findings and keeps Promote disabled with a reason until the draft is validated', () => {
  const h = handlers();
  render(<AssetDraft draft={draft()} preview={null} busy={false} {...h} />);
  expect(screen.getByText('assembly')).toBeTruthy();
  expect(screen.getByText('Draft')).toBeTruthy();
  expect(screen.getByText(/ASSET_UNKNOWN/)).toBeTruthy();
  expect(screen.getByText('Catalog has no entry conveyor@1.0.0.')).toBeTruthy();
  const promote = screen.getByRole('button', { name: 'Promote' });
  expect(promote).toHaveProperty('disabled', true);
  expect(screen.getByText('Validate the draft before promoting it.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Validate' }));
  expect(h.onValidate).toHaveBeenCalledTimes(1);
});
it('requires a semantic version before promoting a validated draft', () => {
  const h = handlers();
  render(<AssetDraft draft={validated()} preview={null} busy={false} {...h} />);
  const promote = screen.getByRole('button', { name: 'Promote' });
  expect(promote).toHaveProperty('disabled', true);
  expect(screen.getByText('Enter a version like 1.0.0 to promote.')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Version'), { target: { value: 'v1' } });
  expect(promote).toHaveProperty('disabled', true);
  fireEvent.change(screen.getByLabelText('Version'), { target: { value: '1.0.0' } });
  expect(promote).toHaveProperty('disabled', false);
  fireEvent.click(promote);
  expect(h.onPromote).toHaveBeenCalledWith('1.0.0');
});
it('shows the promoted version as an immutable reusable record', () => {
  render(<AssetDraft draft={draft({ status: 'reusable-version', version: '1.0.0', validation: { ok: true, findings: [] }, promotedTo: { id: 'rack-row-custom', version: '1.0.0', sha256: 'c'.repeat(64) } })} preview={null} busy={false} {...handlers()} />);
  expect(screen.getByText('Reusable version 1.0.0')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Promote' })).toBeNull();
});
it('lists affected instances in the upgrade preview and fires Apply exactly once', () => {
  const h = handlers();
  render(<AssetDraft draft={validated()} preview={preview} busy={false} {...h} />);
  expect(screen.getByText('Upgrade 1.0.0 to 1.1.0')).toBeTruthy();
  expect(screen.getByText('row-a')).toBeTruthy();
  expect(screen.getByText(/row-b/)).toBeTruthy();
  expect(screen.getByText(/lengthM/)).toBeTruthy();
  const apply = screen.getByRole('button', { name: 'Apply upgrade to 2 instances' });
  fireEvent.click(apply);
  fireEvent.click(apply);
  expect(h.onApplyUpgrade).toHaveBeenCalledTimes(1);
  expect(h.onApplyUpgrade).toHaveBeenCalledWith(preview);
});
it('flags a downgrade preview', () => {
  render(<AssetDraft draft={validated()} preview={{ ...preview, direction: 'downgrade', flagged: true }} busy={false} {...handlers()} />);
  expect(screen.getByText('Downgrade 1.0.0 to 1.1.0')).toBeTruthy();
  expect(screen.getByText(/older version/)).toBeTruthy();
});

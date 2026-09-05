import { it, expect, vi } from 'vitest';
import { DraftController } from '../src/lib/draft.js';
import { snapshot } from './reference.js';
import type { ProjectSnapshot } from '@robopomelo/spec';

async function proposed() {
  const draft = new DraftController(structuredClone(snapshot), async () => ({
    kind: 'proposal',
    proposalId: 'proposal',
    patchDigest: 'digest',
    diff: [],
  }));
  draft.edit({ op: 'project', fields: { name: 'Applied proposal' } });
  await draft.flush();
  const committed = structuredClone(snapshot);
  committed.sourceRevision = 'after-proposal';
  committed.sourceHash = 'f'.repeat(64);
  committed.deployment.project.name = 'Applied proposal';
  return { draft, committed };
}

it('adopts the committed proposal without an external-source refresh', async () => {
  const { draft, committed } = await proposed();
  await draft.applyProposal('proposal', snapshot, async () => committed);
  expect(draft.view).toMatchObject({ state: 'Saved', dirty: false, proposalId: null, committed });
  expect(draft.view.deployment.project.name).toBe('Applied proposal');
  draft.dispose();
});

it('retains newer input and its original base when a proposal commits during editing', async () => {
  const { draft, committed } = await proposed();
  let finish!: (value: ProjectSnapshot) => void;
  const applying = draft.applyProposal(
    'proposal',
    snapshot,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  draft.edit({ op: 'project', fields: { name: 'Newer unsaved input' } });
  expect(await draft.flush()).toBe(false);
  finish(committed);
  await expect(applying).rejects.toThrow('committed');
  expect(draft.view.deployment.project.name).toBe('Newer unsaved input');
  expect(draft.view.committed.sourceHash).toBe(snapshot.sourceHash);
  expect(draft.view).toMatchObject({ dirty: true, state: 'Changes conflict' });
  draft.dispose();
});

it('rejects an unrelated proposal or stale base before performing a write', async () => {
  const { draft, committed } = await proposed();
  const write = vi.fn(async () => committed);
  await expect(draft.applyProposal('different', snapshot, write)).rejects.toThrow();
  await expect(draft.applyProposal('proposal', committed, write)).rejects.toThrow();
  expect(write).not.toHaveBeenCalled();
  expect(draft.view.state).toBe('Proposed');
  draft.dispose();
});

it('retains the proposal after a rejected write and permits an explicit retry', async () => {
  const { draft, committed } = await proposed();
  const before = draft.view;
  await expect(
    draft.applyProposal('proposal', snapshot, async () => {
      throw new Error('Denied');
    }),
  ).rejects.toThrow('Denied');
  expect(draft.view).toBe(before);
  await draft.applyProposal('proposal', snapshot, async () => committed);
  expect(draft.view.state).toBe('Saved');
  draft.dispose();
});

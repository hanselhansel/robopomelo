// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ScenePanel } from '../src/features/scene/ScenePanel.js';
import { commits, initialScene, mockSceneServer, rack, stale, stubRenderer } from './scene-fixture.js';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const mount = () => render(<ScenePanel createRenderer={stubRenderer} />);
const row = (id: string) => screen.getByRole('option', { name: new RegExp(id) });
const selectRow = async (id: string) => {
  const target = await screen.findByRole('option', { name: new RegExp(id) });
  fireEvent.click(target);
  return target;
};
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const editField = (label: string, value: string) => {
  const input = field(label);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};
const region = () => screen.getByRole('group', { name: 'Scene objects' });
it('loads the first scene, lists its objects and highlights a selected row in the inspector', async () => {
  mockSceneServer();
  mount();
  await screen.findByRole('option', { name: /rack-1/ });
  expect(row('rack-2').getAttribute('aria-selected')).toBe('false');
  await selectRow('rack-2');
  expect(row('rack-2').getAttribute('aria-selected')).toBe('true');
  expect(row('rack-1').getAttribute('aria-selected')).toBe('false');
  const inspector = screen.getByRole('region', { name: 'Object inspector' });
  expect(within(inspector).getByText('rack-2')).toBeTruthy();
  expect(field('X (m)').value).toBe('8');
  expect(within(inspector).getByText('Confirmed')).toBeTruthy();
  fireEvent.click(within(inspector).getByText('Inspect source'));
  expect(within(inspector).getByText('evidence-plan')).toBeTruthy();
});
it('posts a single envelope with one move action bound to the current base for a numeric edit', async () => {
  const server = mockSceneServer();
  mount();
  await selectRow('rack-1');
  editField('X (m)', '5');
  await waitFor(() => expect(commits(server)).toHaveLength(1));
  const envelope = commits(server)[0]!;
  expect(envelope).toMatchObject({ sourceRevision: 'rev-1', sourceHash: 'h-rev-1', actions: [{ kind: 'move', sceneId: 'scene-1', id: 'rack-1', pose: { xM: 5, yM: 2, zM: 0, yawRad: 0 } }] });
  expect(envelope.mutationId).toMatch(/^[A-Za-z0-9][A-Za-z0-9.:_-]{0,127}$/);
  expect(server.calls.filter((c) => c.path === '/api/scenes/actions')[0]!.project).toBe(true);
  await waitFor(() => expect(field('X (m)').value).toBe('5'));
  expect(commits(server)).toHaveLength(1);
});
it('shows a conflict on STALE_BASE, reloads, and keeps the pending move for an explicit retry', async () => {
  const server = mockSceneServer();
  server.revision = 2; // another editor already committed against rev-1 before the panel loaded
  const base = vi.spyOn(server, 'apply');
  mount();
  await selectRow('rack-1');
  server.revision = 3;
  editField('Y (m)', '4');
  await waitFor(() => expect(base).toHaveBeenCalledTimes(1));
  expect(commits(server)[0]!.sourceRevision).toBe('rev-2');
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toMatch(/source changed/i);
  expect(server.scene!.instances[0]!.pose.yM).toBe(2);
  expect(field('Y (m)').value).toBe('2');
  fireEvent.click(screen.getByRole('button', { name: 'Retry pending change' }));
  await waitFor(() => expect(commits(server)).toHaveLength(2));
  expect(commits(server)[1]!.sourceRevision).toBe('rev-3');
  expect(commits(server)[1]!.actions).toEqual([{ kind: 'move', sceneId: 'scene-1', id: 'rack-1', pose: { xM: 3, yM: 4, zM: 0, yawRad: 0 } }]);
  await waitFor(() => expect(server.scene!.instances[0]!.pose.yM).toBe(4));
});
it('undoes with the inverse action against the current base', async () => {
  const server = mockSceneServer();
  mount();
  await selectRow('rack-1');
  editField('X (m)', '6');
  await waitFor(() => expect(field('X (m)').value).toBe('6'));
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() => expect(commits(server)).toHaveLength(2));
  expect(commits(server)[1]).toMatchObject({ sourceRevision: 'rev-2', actions: [{ kind: 'move', id: 'rack-1', pose: { xM: 3, yM: 2, zM: 0, yawRad: 0 } }] });
  await waitFor(() => expect(field('X (m)').value).toBe('3'));
});
it('shows a conflict instead of reverting when the object changed after the recorded edit', async () => {
  const server = mockSceneServer();
  mount();
  await selectRow('rack-1');
  editField('X (m)', '6');
  await waitFor(() => expect(field('X (m)').value).toBe('6'));
  // Another editor moves the same rack; the panel learns about it on its next reload.
  server.scene = { ...server.scene!, instances: [rack('rack-1', 6.5), rack('rack-2', 8)] };
  server.revision = 3;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh scene' }));
  await waitFor(() => expect(field('X (m)').value).toBe('6.5'));
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toMatch(/changed meanwhile/);
  expect(commits(server)).toHaveLength(1);
});
it('shows a conflict when the undo itself lands on a stale base', async () => {
  const server = mockSceneServer();
  mount();
  await selectRow('rack-1');
  editField('X (m)', '6');
  await waitFor(() => expect(field('X (m)').value).toBe('6'));
  server.revision = 9;
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toMatch(/source changed/i);
  expect(server.scene!.instances[0]!.pose.xM).toBe(6);
});
it('places a catalog asset with unverified default dimensions', async () => {
  const server = mockSceneServer();
  mount();
  await screen.findByRole('option', { name: /rack-1/ });
  fireEvent.click(screen.getByRole('button', { name: 'Add asset' }));
  fireEvent.click(await screen.findByRole('button', { name: /Structural column/ }));
  await waitFor(() => expect(commits(server)).toHaveLength(1));
  const action = commits(server)[0]!.actions[0]!;
  expect(action.kind).toBe('place');
  if (action.kind !== 'place') return;
  expect(action.instance.id).toBe('column-1');
  expect(action.instance.dimensions).toEqual({ state: 'unverified', value: { lengthM: 0.5, widthM: 0.5, heightM: 8 }, sourceIds: [] });
  await screen.findByRole('option', { name: /column-1/ });
  expect(screen.getByText('Assumed')).toBeTruthy();
});
it('nudges with arrows, multiplies by ten with Shift, cancels on Escape and commits once on key release', async () => {
  const server = mockSceneServer();
  mount();
  await selectRow('rack-1');
  fireEvent.keyDown(region(), { key: 'ArrowRight' });
  expect(field('X (m)').value).toBe('3.05');
  fireEvent.keyDown(region(), { key: 'ArrowUp', shiftKey: true });
  expect(field('Y (m)').value).toBe('2.5');
  expect(server.scene!.instances[0]!.pose.xM).toBe(3);
  fireEvent.keyDown(region(), { key: 'Escape' });
  expect(field('X (m)').value).toBe('3');
  expect(field('Y (m)').value).toBe('2');
  expect(commits(server)).toHaveLength(0);
  fireEvent.keyDown(region(), { key: 'ArrowLeft' });
  fireEvent.keyDown(region(), { key: 'ArrowLeft' });
  fireEvent.keyUp(region(), { key: 'ArrowLeft' });
  await waitFor(() => expect(commits(server)).toHaveLength(1));
  expect(commits(server)[0]!.actions).toEqual([{ kind: 'move', sceneId: 'scene-1', id: 'rack-1', pose: { xM: 2.9, yM: 2, zM: 0, yawRad: 0 } }]);
});
it('focuses the first numeric field on Enter and keeps the selection across the 3D toggle', async () => {
  mockSceneServer();
  mount();
  await selectRow('rack-2');
  fireEvent.keyDown(region(), { key: 'Enter' });
  expect(document.activeElement).toBe(field('X (m)'));
  fireEvent.click(screen.getByRole('button', { name: '3D' }));
  expect(screen.getByRole('button', { name: '3D' }).getAttribute('aria-pressed')).toBe('true');
  expect(row('rack-2').getAttribute('aria-selected')).toBe('true');
});
it('announces the committed position once and stays silent during the preview', async () => {
  mockSceneServer();
  mount();
  await selectRow('rack-1');
  const live = screen.getByRole('status', { name: 'Scene status' });
  fireEvent.keyDown(region(), { key: 'ArrowRight' });
  fireEvent.keyDown(region(), { key: 'ArrowRight' });
  expect(live.textContent).toBe('');
  fireEvent.keyUp(region(), { key: 'ArrowRight' });
  await waitFor(() => expect(live.textContent).toMatch(/Moved rack-1 to X 3.10 m, Y 2.00 m/));
  expect(screen.getAllByText(/Moved rack-1 to X 3.10 m/)).toHaveLength(1);
});
it('offers to create a scene when the project has none and bootstraps activation atomically', async () => {
  const server = mockSceneServer(null);
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Create scene' }));
  await waitFor(() => expect(commits(server)).toHaveLength(1));
  expect(commits(server)[0]!.actions.map((a) => a.kind)).toEqual(['activate', 'define-scene']);
  await screen.findByRole('group', { name: 'Scene objects' });
});
it('surfaces a stale envelope for a delayed edit without applying it', async () => {
  const server = mockSceneServer();
  mount();
  await selectRow('rack-1');
  server.apply = () => { throw stale(); };
  editField('X (m)', '7');
  await screen.findByRole('alert');
  expect(server.scene!.instances[0]!.pose.xM).toBe(3);
  expect(screen.getByRole('button', { name: 'Retry pending change' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Discard pending change' }));
  expect(screen.queryByRole('button', { name: 'Retry pending change' })).toBeNull();
});

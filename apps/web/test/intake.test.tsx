// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import type { DesktopBridge } from '@robopomelo/spec';
import { Intake } from '../src/features/intake/Intake.js';
import { initialIntake, type IntakeState } from '../src/features/intake/state.js';
import { api } from '../src/lib/api.js';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function bridge(): DesktopBridge {
  return {
    chooseProjectFolder: vi.fn().mockResolvedValue({ selectionId: 'folder', displayPath: '/Planning/Test' }),
    selectAttachments: vi.fn().mockResolvedValue([{ selectionId: 'file', name: 'layout.pdf', bytes: 123 }]),
    dropAttachments: vi.fn().mockResolvedValue([]),
    inspectAttachment: vi
      .fn()
      .mockResolvedValue({
        selectionId: 'file',
        state: 'partial',
        textExcerpt: 'Receiving',
        pagePreviewIds: [],
        warnings: ['Scale unknown'],
      }),
    cancelAttachment: vi.fn().mockResolvedValue(undefined),
    confirmSetup: vi.fn().mockResolvedValue(undefined),
    cancelRun: vi.fn(),
  };
}
function mount(native: DesktopBridge, onOpen = vi.fn()) {
  function Harness() {
    const [state, setState] = useState<IntakeState>(initialIntake);
    return <Intake bridge={native} state={state} setState={setState} onOpen={onOpen} />;
  }
  return render(<Harness />);
}
it('retains prompt, folder and attachments after cancelling another chooser', async () => {
  const native = bridge();
  mount(native);
  fireEvent.change(screen.getByLabelText('What are you planning?'), {
    target: { value: 'Move pallets to storage' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Choose project folder' }));
  await screen.findByText('/Planning/Test');
  fireEvent.click(screen.getByRole('button', { name: 'Add files' }));
  await screen.findByText('Scale unknown');
  vi.mocked(native.chooseProjectFolder).mockResolvedValueOnce(null);
  fireEvent.click(screen.getByRole('button', { name: 'Change folder' }));
  await waitFor(() => expect(native.chooseProjectFolder).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText('What are you planning?')).toHaveProperty('value', 'Move pallets to storage');
  expect(screen.getByText('/Planning/Test')).toBeTruthy();
  expect(screen.getByText('layout.pdf')).toBeTruthy();
});

it('treats cancelled confirmation as a return to the same editable intake', async () => {
  const native = bridge(); mount(native);
  vi.spyOn(api, 'request').mockResolvedValue({ revision: 'prepared' });
  vi.mocked(native.confirmSetup).mockRejectedValueOnce(new Error('Setup confirmation cancelled'));
  fireEvent.click(screen.getByRole('button', { name: 'Choose project folder' }));
  await screen.findByText('/Planning/Test');
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(native.confirmSetup).toHaveBeenCalledOnce());
  await screen.findByRole('button', { name: 'Continue' });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText('/Planning/Test')).toBeTruthy();
});
it('prepares exact intake before setup and refreshes the new project session', async () => {
  const native = bridge();
  const onOpen = vi.fn();
  const order: string[] = [];
  vi.mocked(native.confirmSetup).mockImplementation(async () => {
    order.push('confirm');
  });
  const request = vi.spyOn(api, 'request').mockImplementation(async (path) => {
    order.push(path);
    return path === '/api/session'
      ? { projectEpoch: 'new', projectOpen: true, toolVersion: '1' }
      : { kind: 'inspection', rawText: '', problems: [] };
  });
  mount(native, onOpen);
  fireEvent.change(screen.getByLabelText('What are you planning?'), { target: { value: 'Move pallets' } });
  fireEvent.click(screen.getByRole('button', { name: 'Choose project folder' }));
  await screen.findByText('/Planning/Test');
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(onOpen).toHaveBeenCalledOnce());
  expect(request).toHaveBeenCalledWith('/api/intake/prepare', {
    name: 'Test',
    seed: 'blank',
    description: 'Move pallets',
    attachmentIds: [],
  });
  expect(order).toEqual(['/api/intake/prepare', 'confirm', '/api/session', '/api/project']);
  expect(api.session?.projectEpoch).toBe('new');
  expect(screen.getByLabelText('What are you planning?')).toHaveProperty('value', '');
  expect(screen.queryByText('/Planning/Test')).toBeNull();
});
it('does not discard selected files to enter inspection or on setup failure', async () => {
  const native = bridge();
  mount(native);
  fireEvent.click(screen.getByRole('button', { name: 'Open a project' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add files' }));
  await screen.findByText('Scale unknown');
  expect(screen.getByLabelText('Inspection only')).toHaveProperty('disabled', true);
  fireEvent.click(screen.getByRole('button', { name: 'Choose project folder' }));
  await screen.findByText('/Planning/Test');
  vi.spyOn(api, 'request').mockRejectedValueOnce(new Error('Reconnect to continue'));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByText('Reconnect to continue');
  expect(screen.getByText('layout.pdf')).toBeTruthy();
  expect(screen.getByText('/Planning/Test')).toBeTruthy();
});
it('retains intake when navigating away and back, including a parsing result', async () => {
  const native = bridge();
  let complete!: (value: Awaited<ReturnType<DesktopBridge['inspectAttachment']>>) => void;
  vi.mocked(native.inspectAttachment).mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  function Navigation() {
    const [state, setState] = useState(initialIntake);
    const [visible, setVisible] = useState(true);
    return (
      <>
        <button onClick={() => setVisible(!visible)}>Navigate</button>
        {visible && <Intake bridge={native} state={state} setState={setState} onOpen={vi.fn()} />}
      </>
    );
  }
  render(<Navigation />);
  fireEvent.change(screen.getByLabelText('What are you planning?'), { target: { value: 'Keep my notes' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add files' }));
  await screen.findByText('Reading locally');
  fireEvent.click(screen.getByRole('button', { name: 'Navigate' }));
  complete({
    selectionId: 'file',
    state: 'partial',
    textExcerpt: 'Dock',
    pagePreviewIds: [],
    warnings: ['Unknown scale'],
  });
  fireEvent.click(screen.getByRole('button', { name: 'Navigate' }));
  expect(screen.getByLabelText('What are you planning?')).toHaveProperty('value', 'Keep my notes');
  await screen.findByText('Unknown scale');
});
it('allows cancelling a file while it is being parsed and ignores late results', async () => {
  const native = bridge();
  let complete!: (value: Awaited<ReturnType<DesktopBridge['inspectAttachment']>>) => void;
  vi.mocked(native.inspectAttachment).mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  mount(native);
  fireEvent.click(screen.getByRole('button', { name: 'Add files' }));
  await screen.findByText('Reading locally');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Remove layout.pdf' })).toHaveProperty('disabled', false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remove layout.pdf' }));
  await waitFor(() => expect(screen.queryByText('layout.pdf')).toBeNull());
  complete({
    selectionId: 'file',
    state: 'parsed',
    textExcerpt: 'Late content',
    pagePreviewIds: [],
    warnings: [],
  });
  await waitFor(() => expect(native.cancelAttachment).toHaveBeenCalledWith('file'));
  expect(screen.queryByText('Late content')).toBeNull();
});

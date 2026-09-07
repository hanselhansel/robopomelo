import { expect, it, vi } from 'vitest';
import { createNativeHandlers } from '../../apps/desktop/src/native-dialogs.js';
function fixture() {
  let time = 0,
    identity = 'folder-1';
  let attachmentContext = '0';
  const frame = {};
  const sender = { id: 1, mainFrame: frame, isDestroyed: () => false };
  const event = { sender, senderFrame: frame };
  const confirm = vi.fn(async () => {});
  const dialogs = {
    chooseFolder: vi.fn(async () => '/project'),
    chooseFiles: vi.fn(async () => ['/project/a.png']),
    confirmPreset: vi.fn(async () => true),
  };
  const selectFiles = vi.fn(async (paths: string[]) =>
    paths.map((_path, index) => ({ selectionId: 'file-' + index, name: 'a.png', bytes: 12 })),
  );
  const inspectFiles = vi.fn(async (selectionId: string) => ({
    selectionId,
    state: 'parsed' as const,
    textExcerpt: 'Dock',
    pagePreviewIds: [] as string[],
    warnings: [] as string[],
  }));
  const handlers = createNativeHandlers({
    attachments: {
      contextKey: () => attachmentContext,
      select: selectFiles,
      inspect: inspectFiles,
      cancel: vi.fn(),
      clear: vi.fn(),
    },
    sender,
    uiOrigin: 'http://127.0.0.1:3000',
    dialogs,
    now: () => time,
    identity: async (path) => ({ identity, name: 'a.png', bytes: 12, directory: path === '/project' }),
    confirm,
    cancelRun: async () => {},
  });
  Object.assign(frame, { url: 'http://127.0.0.1:3000/' });
  return {
    handlers,
    event,
    dialogs,
    confirm,
    selectFiles,
    inspectFiles,
    switchProject: () => {
      attachmentContext = '1';
    },
    expire: () => {
      time = 300001;
    },
    swap: () => {
      identity = 'folder-2';
    },
  };
}
it('rejects an invalid sender and subframe before opening dialogs', async () => {
  const f = fixture();
  await expect(
    f.handlers.chooseProjectFolder({ ...f.event, sender: { ...f.event.sender, id: 2 } }, 'open'),
  ).rejects.toThrow();
  await expect(f.handlers.chooseProjectFolder({ ...f.event, senderFrame: {} }, 'open')).rejects.toThrow();
  expect(f.dialogs.chooseFolder).not.toHaveBeenCalled();
});

it('rejects stale chooser completion before it inserts attachment selections', async () => {
  const f = fixture();
  let finish!: (paths: string[]) => void;
  f.dialogs.chooseFiles.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = f.handlers.selectAttachments(f.event);
  f.handlers.dispose();
  finish(['/project/a.png']);
  await expect(pending).rejects.toThrow('Selection invalidated');
  expect(f.selectFiles).not.toHaveBeenCalled();
});

it('rejects chooser completion after a project switch without navigation', async () => {
  const f = fixture();
  let finish!: (paths: string[]) => void;
  f.dialogs.chooseFiles.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = f.handlers.selectAttachments(f.event);
  f.switchProject();
  finish(['/project/a.png']);
  await expect(pending).rejects.toThrow('Selection invalidated');
  expect(f.selectFiles).not.toHaveBeenCalled();
});

it('drops inspection output when its project changes before native delivery', async () => {
  const f = fixture();
  f.inspectFiles.mockImplementationOnce(async (selectionId) => {
    f.switchProject();
    return { selectionId, state: 'parsed', textExcerpt: 'Old project', pagePreviewIds: [], warnings: [] };
  });
  await expect(f.handlers.inspectAttachment(f.event, 'file-0')).rejects.toThrow('Selection invalidated');
});

it('restricts attachment inspection and cancellation to the owned main frame', async () => {
  const f = fixture();
  expect(await f.handlers.inspectAttachment(f.event, 'file-0')).toMatchObject({
    selectionId: 'file-0',
    state: 'parsed',
  });
  const foreign = { ...f.event, senderFrame: {} };
  await expect(f.handlers.inspectAttachment(foreign, 'file-0')).rejects.toThrow();
  await expect(f.handlers.cancelAttachment(foreign, 'file-0')).rejects.toThrow();
});
it('cancellation returns null without confirmation or replacement state', async () => {
  const f = fixture();
  f.dialogs.chooseFolder.mockResolvedValueOnce(null as never);
  expect(await f.handlers.chooseProjectFolder(f.event, 'open')).toBeNull();
  expect(f.confirm).not.toHaveBeenCalled();
});
it('expired and swapped selections never reach the grant callback', async () => {
  for (const mutation of ['expire', 'swap'] as const) {
    const f = fixture(),
      selected = await f.handlers.chooseProjectFolder(f.event, 'open');
    f[mutation]();
    await expect(f.handlers.confirmSetup(f.event, selected!.selectionId, 'recommended')).rejects.toThrow();
    expect(f.confirm).not.toHaveBeenCalled();
  }
});
it('requires exact displayed preset and consumes successful confirmation once', async () => {
  const f = fixture(),
    selected = await f.handlers.chooseProjectFolder(f.event, 'create');
  await expect(f.handlers.confirmSetup(f.event, selected!.selectionId, 'anything')).rejects.toThrow();
  await f.handlers.confirmSetup(f.event, selected!.selectionId, 'inspection');
  expect(f.dialogs.confirmPreset).toHaveBeenCalledWith('/project', 'inspection');
  expect(f.confirm).toHaveBeenCalledWith('/project', 'inspection', 'create');
  await expect(f.handlers.confirmSetup(f.event, selected!.selectionId, 'inspection')).rejects.toThrow();
});
it('validates every IPC argument', async () => {
  const f = fixture();
  await expect(f.handlers.chooseProjectFolder(f.event, {})).rejects.toThrow();
  await expect(f.handlers.cancelRun(f.event, {})).rejects.toThrow();
});

it('retains input when confirmation is cancelled and blocks repeat confirmation', async () => {
  const f = fixture(),
    selected = await f.handlers.chooseProjectFolder(f.event, 'open');
  f.dialogs.confirmPreset.mockResolvedValueOnce(false);
  await expect(f.handlers.confirmSetup(f.event, selected!.selectionId, 'recommended')).rejects.toThrow(
    'cancelled',
  );
  expect(selected!.displayPath).toBe('/project');
  expect(f.confirm).not.toHaveBeenCalled();
});
it('revalidates the root after a native confirmation dialog', async () => {
  const f = fixture(),
    selected = await f.handlers.chooseProjectFolder(f.event, 'open');
  f.dialogs.confirmPreset.mockImplementationOnce(async () => {
    f.swap();
    return true;
  });
  await expect(f.handlers.confirmSetup(f.event, selected!.selectionId, 'recommended')).rejects.toThrow();
  expect(f.confirm).not.toHaveBeenCalled();
});
it('rejects simultaneous confirmation of the same selection', async () => {
  const f = fixture(),
    selected = await f.handlers.chooseProjectFolder(f.event, 'open');
  const results = await Promise.allSettled([
    f.handlers.confirmSetup(f.event, selected!.selectionId, 'recommended'),
    f.handlers.confirmSetup(f.event, selected!.selectionId, 'recommended'),
  ]);
  expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect(f.confirm).toHaveBeenCalledTimes(1);
});

it('does not transfer a folder selection to a replacement main frame', async () => {
  const f = fixture(),
    selected = await f.handlers.chooseProjectFolder(f.event, 'open');
  const replacement = { url: 'http://127.0.0.1:3000/' };
  f.event.sender.mainFrame = replacement;
  await expect(
    f.handlers.confirmSetup({ ...f.event, senderFrame: replacement }, selected!.selectionId, 'inspection'),
  ).rejects.toThrow();
  expect(f.confirm).not.toHaveBeenCalled();
});
it('navigation invalidation rejects an in-flight native confirmation', async () => {
  const f = fixture(),
    selected = await f.handlers.chooseProjectFolder(f.event, 'open');
  f.dialogs.confirmPreset.mockImplementationOnce(async () => {
    f.handlers.dispose();
    return true;
  });
  await expect(f.handlers.confirmSetup(f.event, selected!.selectionId, 'inspection')).rejects.toThrow();
  expect(f.confirm).not.toHaveBeenCalled();
});
it('rejects more than the approved twenty attachments', async () => {
  const f = fixture();
  f.dialogs.chooseFiles.mockResolvedValueOnce(Array.from({ length: 21 }, () => '/a.png'));
  await expect(f.handlers.selectAttachments(f.event)).rejects.toThrow();
});
it('returns file metadata without a filesystem path or byte reader', async () => {
  const f = fixture();
  const items = await f.handlers.selectAttachments(f.event);
  expect(items).toHaveLength(1);
  expect(items[0]).toEqual({ selectionId: expect.any(String), name: 'a.png', bytes: 12 });
});
it('native file picker cancellation returns an empty selection', async () => {
  const f = fixture();
  f.dialogs.chooseFiles.mockResolvedValueOnce([]);
  expect(await f.handlers.selectAttachments(f.event)).toEqual([]);
});

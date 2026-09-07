import { app, BrowserWindow, dialog, nativeImage } from 'electron';
import { isAbsolute, join } from 'node:path';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { waitForUi, clickUi, fillUi, dropUiFile } from './smoke-ui.js';

async function run() {
  const base = process.argv[2];
  if (!base || !isAbsolute(base)) throw new Error('Smoke requires an owned temporary directory');
  app.setPath('userData', base);
  const { started, lifetime } = await import('./src/main.js');
  try {
    await started;
    const windows = BrowserWindow.getAllWindows();
    assert.equal(windows.length, 1);
    const window = windows[0]!;
    const origin = new URL(window.webContents.getURL()).origin;
    assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const timer = setTimeout(() => { observer.disconnect(); reject(new Error('Workspace did not render')); }, 5000);
      const ready = () => {
        if (!document.querySelector('.desktop-intake')) return;
        clearTimeout(timer); observer.disconnect(); resolve(true);
      };
      const observer = new MutationObserver(ready);
      observer.observe(document.body, { childList:true, subtree:true }); ready();
    })`);
    const state = await window.webContents.executeJavaScript(`({
      title: document.querySelector('h1').textContent,
      hash: location.hash,
      credential: Boolean(sessionStorage.getItem('rp.credential')),
      node: typeof require,
      bridge: Object.keys(window.robopomelo).sort()
    })`);
    assert.match(state.title, /What should your robots help you do/);
    assert.equal(state.hash, '');
    assert.equal(state.credential, true);
    assert.equal(state.node, 'undefined');
    assert.deepEqual(state.bridge, [
      'cancelAttachment',
      'cancelRun',
      'chooseProjectFolder',
      'confirmSetup',
      'dropAttachments',
      'inspectAttachment',
      'selectAttachments',
    ]);
    await window.webContents.executeJavaScript(`document.fonts.ready.then(() =>
      new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))`);
    await writeFile(join(base, 'workspace.png'), (await window.webContents.capturePage()).toPNG());
    const selectedPath = join(base, 'floor.png');
    await writeFile(
      selectedPath,
      nativeImage.createFromBitmap(Buffer.from([0, 0, 0, 255]), { width: 1, height: 1 }).toPNG(),
    );
    const originalChooser = dialog.showOpenDialog;
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [selectedPath],
    })) as typeof dialog.showOpenDialog;
    try {
      const picked = await window.webContents.executeJavaScript('window.robopomelo.selectAttachments()');
      assert.equal(picked.length, 1);
      assert.equal(picked[0].name, 'floor.png');
      assert.equal(JSON.stringify(picked).includes(base), false);
      dialog.showOpenDialog = (async () => ({
        canceled: true,
        filePaths: [],
      })) as typeof dialog.showOpenDialog;
      assert.deepEqual(
        await window.webContents.executeJavaScript('window.robopomelo.selectAttachments()'),
        [],
      );
      await window.webContents.executeJavaScript(`new Promise(resolve => {
        window.addEventListener('hashchange', () => resolve(true), { once:true });
        location.hash = 'intake-review';
      })`);
      const preview = await window.webContents.executeJavaScript(
        `window.robopomelo.inspectAttachment(${JSON.stringify(picked[0].selectionId)})`,
      );
      assert.equal(preview.state, 'parsed');
      assert.equal(preview.pagePreviewIds.length, 1);
      assert.equal(JSON.stringify(preview).includes(base), false);
      const previewUrl = '/api/attachments/previews/' + preview.pagePreviewIds[0];
      const fetchPreview = `fetch(${JSON.stringify(previewUrl)}, { headers: {
        Authorization:'Bearer '+sessionStorage.getItem('rp.credential'), 'X-RP-Project-Epoch':'0'
      } }).then(async response => ({ status:response.status, type:response.headers.get('content-type'),
        signature:Array.from(new Uint8Array(await response.arrayBuffer()).slice(0,8)) }))`;
      const downloaded = await window.webContents.executeJavaScript(fetchPreview);
      assert.equal(downloaded.status, 200);
      assert.equal(downloaded.type, 'image/png');
      assert.deepEqual(downloaded.signature, [137, 80, 78, 71, 13, 10, 26, 10]);
      await window.webContents.executeJavaScript(
        `window.robopomelo.cancelAttachment(${JSON.stringify(picked[0].selectionId)})`,
      );
      assert.equal((await window.webContents.executeJavaScript(fetchPreview)).status, 404);
      assert.equal(await window.webContents.executeJavaScript(`window.robopomelo.dropAttachments([new File(['x'],'/etc/passwd')]).then(()=>false,()=>true)`), true);
    } finally {
      dialog.showOpenDialog = originalChooser;
    }
    const projectPath = join(base, 'project-' + process.argv[3]);
    await mkdir(projectPath);
    const originalConfirm = dialog.showMessageBox;
    let confirmations = 0;
    let cancelled!: () => void;
    const firstConfirmation = new Promise<void>(resolve => { cancelled = resolve; });
    dialog.showOpenDialog = (async (_window: unknown, options: { properties?: string[] }) => ({
      canceled: false, filePaths: [options.properties?.includes('openDirectory') ? projectPath : selectedPath],
    })) as typeof dialog.showOpenDialog;
    dialog.showMessageBox = (async (_window: unknown, options: { detail?: string }) => {
      assert.ok(options.detail?.includes('Native smoke study'));
      confirmations++;
      if (confirmations === 1) cancelled();
      return { response: confirmations === 1 ? 0 : 1, checkboxChecked: false };
    }) as typeof dialog.showMessageBox;
    try {
      await fillUi(window, '#intake-name', 'Native smoke study');
      await fillUi(window, '#intake-prompt', 'Move pallets between receiving and storage.');
      await dropUiFile(window, selectedPath);
      await waitForUi(window, "document.querySelector('.intake-file-state.parsed')");
      await clickUi(window, 'Choose project folder');
      await waitForUi(window, "document.querySelector('.intake-folder')");
      await clickUi(window, 'Continue');
      await firstConfirmation;
      await waitForUi(window, "document.querySelector('.intake-submit button')?.textContent.trim()==='Continue' && !document.querySelector('.intake-submit button').disabled");
      assert.equal(await window.webContents.executeJavaScript("Boolean(document.querySelector('.notice.error'))"), false);
      await clickUi(window, 'Continue');
      await waitForUi(window, "document.querySelector('.app-shell')");
      assert.equal(confirmations, 2);
      const source = await readFile(join(projectPath, 'deployment.yaml'), 'utf8');
      assert.match(source, /Native smoke study/);
      assert.match(source, /initial-brief.txt/);
      assert.match(source, /floor.png/);
      assert.doesNotMatch(source, /Move pallets between receiving/);
    } finally { dialog.showOpenDialog = originalChooser; dialog.showMessageBox = originalConfirm; }
    const quitting = new Promise<void>((resolve) =>
      app.once('will-quit', (event) => {
        event.preventDefault();
        resolve();
      }),
    );
    if (process.argv[3] === 'app') app.quit();
    else window.close();
    await quitting;
    assert.equal(BrowserWindow.getAllWindows().length, 0);
    await assert.rejects(fetch(origin));
    console.log('ELECTRON_SMOKE_OK ' + process.versions.electron);
  } finally {
    await lifetime.quit();
  }
}
void run().then(
  () => app.exit(0),
  (error) => {
    console.error(error);
    app.exit(1);
  },
);

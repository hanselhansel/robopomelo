import { app, BrowserWindow, dialog, nativeImage } from 'electron';
import { isAbsolute, join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

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
        if (!document.querySelector('.welcome-choices')) return;
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
    assert.match(state.title, /Start with the work/);
    assert.equal(state.hash, '');
    assert.equal(state.credential, true);
    assert.equal(state.node, 'undefined');
    assert.deepEqual(state.bridge, [
      'cancelAttachment',
      'cancelRun',
      'chooseProjectFolder',
      'confirmSetup',
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
    } finally {
      dialog.showOpenDialog = originalChooser;
    }
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

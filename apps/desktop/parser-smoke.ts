import { app, BrowserWindow, nativeImage } from 'electron';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { mkdtemp, realpath, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { parseAttachment, registerParserScheme, createParserWindow } from './src/parser-window.js';
import { pdf } from '../../tests/fixtures/ingestion/pdf.js';

registerParserScheme();
function fail(error: unknown) {
  console.error(error);
  app.exit(1);
}
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);
app.on('window-all-closed', () => {});
async function run() {
  console.log('PARSER_SMOKE_STAGE waiting-ready');
  await app.whenReady();
  console.log('PARSER_SMOKE_STAGE app-ready');
  const options = { assetRoot: join(__dirname, 'parser'), preload: join(__dirname, 'parser-preload.cjs') };
  console.log('PARSER_SMOKE_STAGE text-pdf');
  const parsed = await parseAttachment({ bytes: pdf(1), displayName: 'plan.pdf' }, options);
  assert.equal(parsed.state, 'parsed');
  assert.match(parsed.textExcerpt, /Receiving dock/);
  assert.equal(parsed.pageImages.length, 1);
  const mapped = await parseAttachment({ bytes: pdf(1, 'Dock', true), displayName: 'mapped.pdf' }, options);
  assert.equal(mapped.state, 'parsed');
  assert.match(mapped.textExcerpt, /Dock/);
  const evidence = join(__dirname, '../../../test-results/parser-smoke');
  await mkdir(evidence, { recursive: true });
  await writeFile(join(evidence, 'pdf-preview.png'), parsed.pageImages[0]!);
  const scanned = await parseAttachment({ bytes: pdf(1, ''), displayName: 'scan.pdf' }, options);
  assert.equal(scanned.state, 'partial');
  assert.ok(scanned.warnings.includes('SCANNED_PDF'));
  const many = await parseAttachment({ bytes: pdf(101), displayName: 'many.pdf' }, options);
  assert.equal(many.state, 'unsupported');
  assert.deepEqual(many.warnings, ['PAGE_LIMIT']);
  const broken = await parseAttachment(
    { bytes: new TextEncoder().encode('%PDF-1.7\nbroken'), displayName: 'broken.pdf' },
    options,
  );
  assert.equal(broken.state, 'failed');
  const protectedPdf = await readFile(join(__dirname, '../../../tests/fixtures/ingestion/protected.pdf'));
  const protectedResult = await parseAttachment(
    { bytes: protectedPdf, displayName: 'protected.pdf' },
    options,
  );
  assert.equal(protectedResult.state, 'unsupported');
  assert.deepEqual(protectedResult.warnings, ['PASSWORD_REQUIRED']);
  const png = nativeImage.createFromBitmap(Buffer.from([0, 0, 0, 255]), { width: 1, height: 1 }).toPNG();
  const picture = await parseAttachment({ bytes: png, displayName: 'picture.png' }, options);
  assert.equal(picture.state, 'parsed');
  assert.equal(picture.pageImages.length, 1);
  const jpeg = nativeImage.createFromBuffer(png).toJPEG(90);
  assert.equal((await parseAttachment({ bytes: jpeg, displayName: 'picture.jpg' }, options)).state, 'parsed');
  const controller = new AbortController();
  const cancelled = parseAttachment(
    { bytes: pdf(1), displayName: 'cancel.pdf' },
    { ...options, signal: controller.signal },
  );
  controller.abort();
  await assert.rejects(cancelled, /PARSER_CANCELLED/);
  await assert.rejects(
    parseAttachment({ bytes: pdf(1), displayName: 'timeout.pdf' }, { ...options, timeoutMs: 1 }),
    /PARSER_TIMEOUT/,
  );
  const stalledRoot = await realpath(await mkdtemp(join(tmpdir(), 'rp-parser-stall-')));
  let stalled = false;
  let stalledPid = 0;
  const observe = (_event: unknown, contents: Electron.WebContents) => {
    contents.on('console-message', (event) => {
      if (event.message === 'PARSER_STALL_STARTED') {
        stalled = true;
        stalledPid = contents.getOSProcessId();
      }
    });
  };
  app.on('web-contents-created', observe);
  try {
    await writeFile(join(stalledRoot, 'assets.json'), JSON.stringify(['renderer.js']));
    await writeFile(join(stalledRoot, 'index.html'), '<script src="renderer.js"></script>');
    await writeFile(join(stalledRoot, 'renderer.js'), 'console.log("PARSER_STALL_STARTED");for(;;){}');
    await assert.rejects(
      parseAttachment(
        { bytes: pdf(1), displayName: 'stalled.pdf' },
        {
          ...options,
          assetRoot: stalledRoot,
          timeoutMs: 2000,
        },
      ),
      /PARSER_TIMEOUT/,
    );
    assert.equal(stalled, true, 'deadline must interrupt a renderer that actually entered a busy loop');
    assert.ok(stalledPid > 0);
    const alive = () => {
      try {
        process.kill(stalledPid, 0);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
        throw error;
      }
    };
    const deadline = Date.now() + 2000;
    while (alive() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(alive(), false, 'timed-out renderer process must actually exit');
  } finally {
    app.removeListener('web-contents-created', observe);
    await rm(stalledRoot, { recursive: true, force: true });
  }
  let hits = 0;
  const trap = createServer((_request, response) => {
    hits++;
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.end('reachable');
  });
  await new Promise<void>((resolve) => trap.listen(0, '127.0.0.1', resolve));
  const address = trap.address();
  assert.ok(address && typeof address !== 'string');
  const trapUrl = 'http://127.0.0.1:' + address.port;
  assert.equal(await (await fetch(trapUrl)).text(), 'reachable');
  hits = 0;
  const isolated = await createParserWindow(options);
  try {
    await isolated.window.loadURL(isolated.url);
    const state = await isolated.window.webContents.executeJavaScript(
      `({ node:typeof require, native:typeof window.robopomelo })`,
    );
    assert.deepEqual(state, { node: 'undefined', native: 'undefined' });
    for (const url of [
      trapUrl,
      'file:///etc/passwd',
      'rp-parser://local/assets.json',
      'rp-parser://other/renderer.js',
    ]) {
      assert.equal(
        await isolated.window.webContents.executeJavaScript(
          `fetch(${JSON.stringify(url)}).then(r=>!r.ok,()=>true)`,
        ),
        true,
      );
    }
    assert.equal(hits, 0, 'parser must block before the reachable trap sees a request');
  } finally {
    await isolated.close();
    await new Promise<void>((resolve, reject) => trap.close((error) => (error ? reject(error) : resolve())));
  }
  assert.equal(BrowserWindow.getAllWindows().length, 0);
  console.log('ELECTRON_SMOKE_OK ' + process.versions.electron);
}
void run().then(
  () => app.exit(0),
  (error) => {
    console.error(error);
    app.exit(1);
  },
);

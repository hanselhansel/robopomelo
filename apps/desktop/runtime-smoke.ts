import { app } from 'electron';
import { createServer } from 'node:http';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createDesktopWindow } from './src/window.js';
import { registerNativeBridge } from './src/native-registration.js';
const server = createServer((_request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><title>Desktop isolation smoke</title><p>Host isolation test</p>');
});
let blockedOriginRequests = 0;
const blockedServer = createServer((_request, response) => {
  blockedOriginRequests++;
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.end('reachable');
});
function fail(error: unknown) {
  console.error(error);
  app.exit(1);
}
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);
console.log('ELECTRON_SMOKE_STAGE module-loaded');
async function run() {
  console.log('ELECTRON_SMOKE_STAGE waiting-ready');
  await app.whenReady();
  console.log('ELECTRON_SMOKE_STAGE app-ready');
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No smoke listener');
  const origin = 'http://127.0.0.1:' + address.port;
  await new Promise<void>((resolve) => blockedServer.listen(0, '127.0.0.1', resolve));
  const blockedAddress = blockedServer.address();
  if (!blockedAddress || typeof blockedAddress === 'string') throw new Error('No blocked-origin listener');
  const blockedOrigin = 'http://127.0.0.1:' + blockedAddress.port;
  assert.equal(await (await fetch(blockedOrigin)).text(), 'reachable');
  assert.equal(blockedOriginRequests, 1, 'main must prove the second server is reachable');
  blockedOriginRequests = 0;
  const window = createDesktopWindow(origin, join(__dirname, 'preload.cjs'), false);
  registerNativeBridge(
    window,
    origin,
    { confirm: async () => {}, cancelRun: async () => {} },
    {
      contextKey: () => '0',
      select: async () => [],
      inspect: async () => {
        throw new Error('No selection');
      },
      cancel: () => {},
      clear: () => {},
    },
  );
  console.log('ELECTRON_SMOKE_STAGE window-created');
  await window.loadURL(origin);
  console.log('ELECTRON_SMOKE_STAGE ui-loaded');
  const state = await window.webContents.executeJavaScript(`({
  node:typeof require,
  bridge:Object.keys(window.robopomelo).sort(),
  invoke:typeof window.robopomelo.invoke
 })`);
  assert.equal(state.node, 'undefined');
  assert.equal(state.invoke, 'undefined');
  assert.deepEqual(state.bridge, [
    'cancelAttachment',
    'cancelRun',
    'chooseProjectFolder',
    'confirmSetup',
    'dropAttachments',
    'inspectAttachment',
    'selectAttachments',
  ]);
  const rejected = await window.webContents.executeJavaScript(`
   window.robopomelo.chooseProjectFolder('invalid').then(()=>false,()=>true)
 `);
  assert.equal(rejected, true);
  const blocked = await window.webContents.executeJavaScript(`
   fetch(${JSON.stringify(blockedOrigin)}).then(()=>false,()=>true)
 `);
  assert.equal(blocked, true);
  assert.equal(
    blockedOriginRequests,
    0,
    'session policy must block before the second server receives a request',
  );
  console.log('ELECTRON_SMOKE_STAGE assertions-passed');
  window.destroy();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await new Promise<void>((resolve, reject) =>
    blockedServer.close((error) => (error ? reject(error) : resolve())),
  );
  console.log('ELECTRON_SMOKE_OK ' + process.versions.electron);
  app.exit(0);
}
void run().catch((error) => {
  console.error(error);
  server.close();
  blockedServer.close();
  app.exit(1);
});
setTimeout(() => {
  console.error('Desktop smoke timed out');
  app.exit(1);
}, 20000).unref();

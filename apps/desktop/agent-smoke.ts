import { app, BrowserWindow, dialog } from 'electron';
import { isAbsolute, join } from 'node:path';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import type { AgentReply, DiscoveryRequest } from '@robopomelo/spec';
import { createDesktopWindow } from './src/window.js';
import { registerNativeBridge } from './src/native-registration.js';
import { startDesktopService } from './src/application-service.js';
import { AttachmentBroker } from './src/attachment-broker.js';
import { PreviewStore } from './src/preview-protocol.js';
import { waitForUi, clickUi, clickSelector, fillUi } from './smoke-ui.js';
/** Deterministic provider at the connection boundary. Everything else (grants,
 * routes, orchestrator, conversation store, proposals, UI) is the real code. */
const requests: DiscoveryRequest[] = [];
const replies: AgentReply[] = [
  { summary: 'Recorded the stated problem as a draft for your review.', citedSourceIds: [],
    question: { id: 'q-owner', subjectIds: ['challenge:problem-owner'], prompt: 'Who owns the receiving problem day to day?', choices: [{ id: 'lead', label: 'Receiving lead' }, { id: 'unknown', label: 'Not sure yet' }], why: 'Approval and acceptance depend on a named owner.' },
    proposedActions: [{ op: 'project', fields: { problem: { state: 'provided', value: 'Inbound pallets wait at the dock before putaway.' } } }] },
  { summary: 'Noted the receiving lead as owner.', citedSourceIds: [],
    question: { id: 'q-constraints', subjectIds: ['challenge:constraints'], prompt: 'Which constraint would make this deployment unsuitable?', choices: [], why: 'Constraints shape the fleet and layout options.' },
    proposedActions: [] },
];
async function run() {
  const base = process.argv[2];
  if (!base || !isAbsolute(base)) throw new Error('Smoke requires an owned temporary directory');
  app.setPath('userData', base);
  await app.whenReady();
  const previews = new PreviewStore();
  let service: Awaited<ReturnType<typeof startDesktopService>> | undefined;
  const attachments = new AttachmentBroker({ context: () => service?.projectEpoch() ?? '0', previews, parse: async () => { throw new Error('unused'); } });
  service = await startDesktopService({
    assetRoot: join(__dirname, 'ui'), configDirectory: join(base, 'settings'), previews, attachments,
    connections: { list: async () => [{ connectionId: 'connection-smoke', route: 'openrouter', label: 'Smoke OpenRouter', generation: 1 }], secret: async () => { throw new Error('The smoke provider must not read a secret'); } },
    agentOptions: { adapters: { openrouter: () => ({
      models: async () => [
        { connectionId: 'connection-smoke', route: 'openrouter', modelId: 'smoke/model-a', label: 'Model A', efforts: ['low', 'high'], inputKinds: ['text'], structuredActions: true, cancellation: true },
        { connectionId: 'connection-smoke', route: 'openrouter', modelId: 'smoke/model-a-legacy', label: 'Model A', efforts: [], inputKinds: ['text'], structuredActions: false, cancellation: true },
      ],
      propose: async (request) => { requests.push(request); const reply = replies[requests.length - 1]; if (!reply) throw new Error('No scripted reply'); return reply; },
    }) } },
  });
  const window = createDesktopWindow(service.url, join(__dirname, 'preload.cjs'));
  window.webContents.on('console-message', (_event, level, message) => { if (level >= 2) console.log('RENDERER ' + message); });
  const stage = (name: string) => console.log('AGENT_SMOKE_STAGE ' + name);
  const projectPath = join(base, 'project'); await mkdir(projectPath);
  dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [projectPath] })) as typeof dialog.showOpenDialog;
  dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as typeof dialog.showMessageBox;
  registerNativeBridge(window, service.url, {
    previewSetup: (path, preset, mode) => service!.setup!.preview(path, preset, mode),
    confirm: (path, preset, mode, revision) => service!.setup!.confirm(path, preset, mode, revision),
    cancelRun: async () => {},
    connections: { connect: async () => { throw new Error('unused'); }, statuses: async () => [], status: async () => { throw new Error('unused'); }, disconnect: async () => { throw new Error('unused'); } },
  }, attachments);
  await window.loadURL(service.bootstrapUrl);
  stage('ui'); await waitForUi(window, "document.querySelector('.desktop-intake')");
  await fillUi(window, '#intake-name', 'Agent smoke study');
  await fillUi(window, '#intake-prompt', 'Move inbound pallets from receiving to storage on two shifts.');
  await clickUi(window, 'Choose project folder');
  await waitForUi(window, "document.querySelector('.intake-folder')");
  await clickUi(window, 'Continue');
  stage('setup'); await waitForUi(window, "document.querySelector('.content-layout.with-conversation')"); stage('workspace');
  const before = await readFile(join(projectPath, 'deployment.yaml'), 'utf8');
  // Model selection: two identical labels stay distinguishable and the unsupported one is disabled.
  stage('selector');
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('.agent-selector-toggle').textContent.includes('Choose a model')"), true);
  await clickSelector(window, '.agent-selector-toggle');
  await waitForUi(window, "Array.from(document.querySelectorAll('button[aria-label]')).filter(b=>b.getAttribute('aria-label').startsWith('Use Model A via Smoke OpenRouter')).length===2");
  assert.equal(await window.webContents.executeJavaScript("document.body.textContent.includes('Cannot return structured planning actions')"), true);
  assert.equal(await window.webContents.executeJavaScript("Array.from(document.querySelectorAll('button[aria-label]')).filter(b=>b.getAttribute('aria-label').startsWith('Use Model A via Smoke OpenRouter') && b.disabled).length"), 1);
  await window.webContents.executeJavaScript("Array.from(document.querySelectorAll('button[aria-label]')).find(b=>b.getAttribute('aria-label').startsWith('Use Model A via Smoke OpenRouter') && !b.disabled).click()");
  await waitForUi(window, "document.querySelector('.agent-selector-toggle').textContent.includes('via Smoke OpenRouter')");
  // First turn: send the brief, expect one question and a reviewable proposal, source unchanged.
  await fillUi(window, '.agent-composer textarea', 'We move inbound pallets to storage. The dock is shared with outbound.');
  stage('send'); await clickUi(window, 'Send');
  try { await waitForUi(window, "document.body.textContent.includes('Who owns the receiving problem day to day?')", 15000); }
  catch (error) { console.log('DEBUG requests=' + requests.length + ' alerts=' + await window.webContents.executeJavaScript("Array.from(document.querySelectorAll('[role=alert],.notice.error')).map(e=>e.textContent).join(' | ')")); console.log('DEBUG status=' + await window.webContents.executeJavaScript("document.querySelector('[role=status]')?.textContent")); throw error; }
  assert.equal(requests.length, 1);
  assert.match(requests[0]!.context, /Unresolved subjects/);
  assert.equal(requests[0]!.modelId, 'smoke/model-a');
  assert.equal(requests[0]!.connectionId, 'connection-smoke');
  assert.equal(await readFile(join(projectPath, 'deployment.yaml'), 'utf8'), before);
  const proposals = await window.webContents.executeJavaScript(`fetch('/api/proposals',{headers:{Authorization:'Bearer '+sessionStorage.getItem('rp.credential'),'X-RP-Project-Epoch':${JSON.stringify(service.projectEpoch())}}}).then(r=>r.json())`);
  assert.equal(proposals.ok, true);
  assert.equal(proposals.data.length, 1);
  assert.equal(proposals.data[0].actor.kind, 'agent');
  assert.match(proposals.data[0].actor.name, /Model A via Smoke OpenRouter/);
  assert.equal(proposals.data[0].status, 'pending');
  assert.match(JSON.stringify(proposals.data[0].diff), /Inbound pallets wait at the dock/);
  // Answer the question with a choice: the next question replaces it and the old choice is gone.
  await window.webContents.executeJavaScript(`document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))`);
  await writeFile(join(base, 'agent-workspace.png'), (await window.webContents.capturePage()).toPNG());
  stage('answer'); await clickUi(window, 'Receiving lead');
  await waitForUi(window, "document.body.textContent.includes('Which constraint would make this deployment unsuitable?')", 15000);
  assert.equal(requests.length, 2);
  assert.equal(await window.webContents.executeJavaScript("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Receiving lead' && !b.disabled)"), false);
  const events = await readdir(join(projectPath, 'conversations', 'main', 'events'));
  assert.deepEqual(events, ['00000001.json', '00000002.json', '00000003.json', '00000004.json']);
  assert.equal(JSON.stringify(requests).includes('sk-'), false);
  window.destroy();
  await service.close();
  console.log('ELECTRON_SMOKE_OK ' + process.versions.electron);
}
void run().then(() => app.exit(0), (error) => { console.error(error); app.exit(1); });

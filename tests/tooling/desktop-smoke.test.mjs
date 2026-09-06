import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSmokeProcess } from '../../apps/desktop/smoke-process.mjs';
test('parent deadline bounds a child that blocks its own JavaScript event loop', async () => {
  const started = Date.now();
  await assert.rejects(
    runSmokeProcess(process.execPath, ['-e', 'while(true){}'], { timeoutMs: 150 }),
    /timed out/,
  );
  assert.ok(Date.now() - started < 3000);
});
test('zero exit without assertion evidence cannot pass smoke', async () => {
  await assert.rejects(runSmokeProcess(process.execPath, ['-e', 'process.exit(0)']), /assertion evidence/);
});
test('successful assertion marker plus zero exit and closed streams passes', async () => {
  const result = await runSmokeProcess(process.execPath, ['-e', 'console.log("ELECTRON_SMOKE_OK 44.2.0")']);
  assert.match(result, /ELECTRON_SMOKE_OK 44.2.0/);
});
test(
  'deadline cleans a retained descendant after the parent exits',
  { skip: process.platform === 'win32' },
  async () => {
    let output = '';
    const started = Date.now();
    await assert.rejects(
      runSmokeProcess(
        process.execPath,
        [
          '-e',
          `
  const {spawn}=require('node:child_process');
  const child=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000);process.send("ready")'],{stdio:['ignore',1,2,'ipc']});
  child.once('message',()=>{
    console.log('DESCENDANT_PID '+child.pid);
    console.log('ELECTRON_SMOKE_OK 44.2.0');
    process.exit(0);
  });
 `,
        ],
        // Budget both Node startups under concurrent checks. Production remains 20s.
        { timeoutMs: 2000, onOutput: (chunk) => (output += chunk) },
      ),
      /timed out/,
    );
    assert.ok(Date.now() - started < 10000);
    const pid = Number(/DESCENDANT_PID (\d+)/.exec(output)?.[1]);
    assert.ok(Number.isInteger(pid) && pid > 0);
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  },
);

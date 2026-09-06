import { expect, it } from 'vitest';
import { allowedExternal, allowedUI } from '../../apps/desktop/src/navigation.js';
import { secureWebPreferences } from '../../apps/desktop/src/window-policy.js';
it('rejects malicious OAuth-looking URLs and requires a pending allowlist', () => {
  for (const url of [
    'https://openrouter.ai.attacker.test/auth',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'https://a:b@openrouter.ai/auth',
    'https://openrouter.ai/auth#secret',
  ]) {
    expect(allowedExternal(url, ['https://openrouter.ai'])).toBe(false);
  }
  expect(allowedExternal('https://openrouter.ai/auth')).toBe(false);
  expect(allowedExternal('https://openrouter.ai/auth', ['https://openrouter.ai'])).toBe(true);
});
it('pins UI to an exact explicit loopback origin', () => {
  expect(allowedUI('http://127.0.0.1:3400/a', 'http://127.0.0.1:3400')).toBe(true);
  for (const url of [
    'http://127.0.0.1:3401',
    'http://127.0.0.1.attacker.test:3400',
    'https://example.com',
    'file:///tmp/a',
  ]) {
    expect(allowedUI(url, 'http://127.0.0.1:3400')).toBe(false);
  }
});
it('explicitly enables all renderer isolation controls', () => {
  expect(secureWebPreferences('/preload.cjs')).toEqual({
    preload: '/preload.cjs',
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
  });
});

import { it, expect } from 'vitest';
import { browserCommand } from '../src/browser.js';
it('launches only a generated loopback address without a shell command string', () => {
  expect(() => browserCommand('https://foreign.example', 'darwin')).toThrow(/loopback/);
  expect(() => browserCommand('file:///private/file', 'darwin')).toThrow(/loopback/);
  const url = 'http://127.0.0.1:12345/#token';
  expect(browserCommand(url, 'darwin')).toEqual({ command: 'open', args: [url] });
  expect(browserCommand(url, 'win32').args.at(-1)).toBe(url);
});

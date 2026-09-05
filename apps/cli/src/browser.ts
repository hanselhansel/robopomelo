import { spawn } from 'node:child_process';
export function browserCommand(
  url: string,
  platform = process.platform,
): { command: string; args: string[] } {
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'http:' ||
    parsed.hostname !== '127.0.0.1' ||
    !parsed.port ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.username ||
    parsed.password ||
    (parsed.hash && !/^#[A-Za-z0-9_-]+$/.test(parsed.hash))
  )
    throw new Error('Browser launch requires the generated loopback URL.');
  return platform === 'darwin'
    ? { command: 'open', args: [url] }
    : platform === 'win32'
      ? { command: 'cmd.exe', args: ['/d', '/s', '/c', 'start', '', url] }
      : { command: 'xdg-open', args: [url] };
}
export async function openBrowser(url: string): Promise<void> {
  const { command, args } = browserCommand(url);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error('Browser could not be opened. Use --no-browser to obtain a local launch link.')),
    );
  });
}

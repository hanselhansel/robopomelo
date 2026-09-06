const allowedFlags = [
  '--disable-web-search', '--json-schema', '--max-turns', '--no-subagents',
  '--output-schema', '--sandbox', '--stdio', '--tools',
];
export function metadataArguments(provider) {
  if (provider === 'codex') return [['--version'], ['app-server', '--help']];
  if (provider === 'grok') return [['--version'], ['--help']];
  throw new Error('Unsupported provider');
}
export function metadataReport(provider, versionOutput, helpOutput) {
  metadataArguments(provider);
  if (typeof versionOutput !== 'string' || versionOutput.length > 200 ||
      typeof helpOutput !== 'string' || helpOutput.length > 1024 * 1024)
    throw new Error('Provider version response is invalid');
  const prefix = provider === 'codex' ? 'codex-cli' : 'grok';
  const number = '(?:0|[1-9][0-9]*)';
  const suffix = provider === 'grok' ? '(?: \\([a-f0-9]{7,40}\\))?(?: \\[stable\\])?' : '';
  const match = versionOutput.trim().match(new RegExp(`^${prefix} (${number}\\.${number}\\.${number})${suffix}$`));
  if (!match || !match[1].split('.').every(part => Number.isSafeInteger(Number(part))))
    throw new Error('Provider version response is invalid');
  const flags = allowedFlags.filter(flag =>
    new RegExp(`(?:^|\\s)${flag}(?=$|[\\s=<])`).test(helpOutput));
  return {
    formatVersion: '1.0.0', provider, version: match[1], stage: 'metadata-only', flags,
    authenticationVerified: false, containmentVerified: false,
    projectAccessAllowed: false, modelInferenceUsed: false,
  };
}

export function secureWebPreferences(preload: string) {
  return {
    preload,
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
  } as const;
}

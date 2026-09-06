import { RuntimeError, type RuntimeIdentity, type RunPolicy, type UpdaterApi } from '@robopomelo/application';

export function desktopRuntimeIdentity(version = '0.0.0-development'): RuntimeIdentity {
  return {
    toolVersion: version, launcherVersion: version, bundledRuntimeVersion: version,
    sourceCheckout: version.includes('-development'),
  };
}

/** Desktop updates replace the signed app; never hot-swap a standalone CLI runtime. */
export class DesktopUpdater implements UpdaterApi {
  constructor(private readonly identity: RuntimeIdentity) {}
  async status(run: RunPolicy = {}) {
    return {
      policy: { mode: 'off', pinnedVersion: null, rollbackHold: null, offline: run.offline === true },
      selection: { version: this.identity.toolVersion, reason: 'desktop-development-build' },
      runtime: { manifest: { version: this.identity.toolVersion } },
      lastOutcome: null,
      compatibility: 'Desktop app updates are unavailable in this development build.',
      capabilities: { check: false, install: false, rollback: false },
    };
  }
  async configure(): Promise<never> { return this.#unavailable(); }
  async resume(): Promise<never> { return this.#unavailable(); }
  async check(): Promise<never> { return this.#unavailable(); }
  async install(): Promise<never> { return this.#unavailable(); }
  async rollback(): Promise<never> { return this.#unavailable(); }
  #unavailable(): never {
    throw new RuntimeError('DESKTOP_UPDATE_UNAVAILABLE',
      'Desktop app updates are not available in this development build.');
  }
}

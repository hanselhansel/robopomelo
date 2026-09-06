export interface DesktopOwnedService {
  url: string;
  bootstrapUrl: string;
  close(): Promise<void>;
}
export interface DesktopOwnedWindow {
  loadURL(url: string): Promise<unknown>;
  destroy(): void;
  isDestroyed(): boolean;
  onClose(listener: () => void): () => void;
}
interface Dependencies {
  startService(): Promise<DesktopOwnedService>;
  createWindow(origin: string): DesktopOwnedWindow;
  registerBridge(window: DesktopOwnedWindow, service: DesktopOwnedService): () => void;
  onWindowClose(): void;
  onError(error: unknown): void;
}

/** Own exactly one service/window pair, including quit during startup. */
export class DesktopServiceLifetime {
  #start: Promise<void> | undefined;
  #quit: Promise<void> | undefined;
  #cleanup: Promise<void> | undefined;
  #stopping = false;
  #service: DesktopOwnedService | undefined;
  #window: DesktopOwnedWindow | undefined;
  #disposeClose: (() => void) | undefined;
  #disposeBridge: (() => void) | undefined;
  constructor(private readonly dependencies: Dependencies) {}

  start(): Promise<void> {
    if (this.#start) return this.#start;
    if (this.#stopping) return Promise.reject(new Error('Desktop service is stopping'));
    return (this.#start = this.#launch());
  }
  async #launch(): Promise<void> {
    try {
      this.#service = await this.dependencies.startService();
      if (this.#stopping) return;
      this.#window = this.dependencies.createWindow(this.#service.url);
      this.#disposeBridge = this.dependencies.registerBridge(this.#window, this.#service);
      this.#disposeClose = this.#window.onClose(() => {
        void this.quit().then(
          () => this.dependencies.onWindowClose(),
          error => this.dependencies.onError(error),
        );
      });
      await this.#window.loadURL(this.#service.bootstrapUrl);
    } catch (error) {
      this.#stopping = true;
      try { await this.#clean(); }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Desktop startup and cleanup failed'); }
      throw error;
    }
  }
  quit(): Promise<void> {
    if (this.#quit) return this.#quit;
    this.#stopping = true;
    return (this.#quit = this.#shutdown());
  }
  async #shutdown(): Promise<void> {
    // Startup owns its own failure cleanup. Waiting prevents a late-created service leak.
    await this.#start?.catch(() => {});
    await this.#clean();
  }
  #clean(): Promise<void> {
    if (this.#cleanup) return this.#cleanup;
    return (this.#cleanup = this.#closeOwned());
  }
  async #closeOwned(): Promise<void> {
    const failures: unknown[] = [];
    const steps = [
      () => this.#disposeClose?.(),
      () => { if (this.#window && !this.#window.isDestroyed()) this.#window.destroy(); },
      () => this.#disposeBridge?.(),
      () => this.#service?.close(),
    ];
    for (const step of steps) {
      try { await step(); } catch (error) { failures.push(error); }
    }
    this.#window = undefined;
    this.#service = undefined;
    this.#disposeClose = undefined;
    this.#disposeBridge = undefined;
    if (failures.length) throw new AggregateError(failures, 'Desktop shutdown failed');
  }
}

/** Per-root FIFO coordination for buffered reads and destination replacements. */
export class FileAccess {
  #tails = new Map<string, Promise<void>>();
  async run<T>(path: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#tails.get(path) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#tails.set(path, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.#tails.get(path) === current) this.#tails.delete(path);
    }
  }
}

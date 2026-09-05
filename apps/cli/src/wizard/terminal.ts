import { createInterface, type Interface } from 'node:readline/promises';
import type { Readable, Writable } from 'node:stream';
import { DomainError } from '@robopomelo/core';
export interface Choice {
  value: string;
  label: string;
}
export interface TerminalAdapter {
  readonly isTTY: boolean;
  choose(prompt: string, choices: readonly Choice[]): Promise<string>;
  text(prompt: string, current?: string): Promise<string>;
  multiline(prompt: string, current?: string): Promise<string>;
  write(text: string): void;
  close(): void;
}
export class WizardBack extends Error {}
export class WizardEnd extends Error {
  constructor(readonly reason: 'eof' | 'interrupt' = 'eof') {
    super(reason);
  }
}
const clean = (text: string) =>
  text.replace(
    /[\u0000-\u0008\u000b-\u001f\u007f]/g,
    (char) => `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`,
  );
/** Queue line events before awaiting answers. terminal:false avoids a second echo through the launcher pipe. */
export class NodeTerminal implements TerminalAdapter {
  readonly isTTY: boolean;
  readonly #interface: Interface;
  #lines: string[] = [];
  #end: Error | null = null;
  #waiting: { resolve: (v: string) => void; reject: (e: Error) => void }[] = [];
  #queuedBytes = 0;
  readonly #interrupt = () => this.#finish(new WizardEnd('interrupt'));
  constructor(private readonly options: { stdin: Readable; stdout: Writable; isTTY: boolean }) {
    this.isTTY = options.isTTY;
    this.#interface = createInterface({
      input: options.stdin,
      output: options.stdout,
      terminal: false,
      crlfDelay: Infinity,
    });
    this.#interface.on('line', (line) => {
      if (this.#end && (!(this.#end instanceof WizardEnd) || this.#end.reason === 'interrupt')) return;
      if (line.length > 16384 || this.#queuedBytes + Buffer.byteLength(line) > 8 * 1024 * 1024) {
        this.#finish(
          new DomainError('INVALID_INPUT', 'Terminal input exceeds the bounded line or queue limit.'),
        );
        return;
      }
      const pending = this.#waiting.shift();
      if (pending) pending.resolve(line);
      else {
        this.#lines.push(line);
        this.#queuedBytes += Buffer.byteLength(line);
      }
    });
    this.#interface.on('close', () => this.#finish(new WizardEnd()));
    this.#interface.on('SIGINT', this.#interrupt);
    options.stdin.on('error', (error) => this.#finish(error));
    process.on('SIGINT', this.#interrupt);
  }
  #finish(error: Error) {
    if (!(error instanceof WizardEnd) || error.reason === 'interrupt') {
      this.#lines = [];
      this.#queuedBytes = 0;
      this.#end = error;
    } else this.#end ??= error;
    for (const waiter of this.#waiting.splice(0)) waiter.reject(this.#end);
  }
  async #line(): Promise<string> {
    const line = this.#lines.shift();
    if (line !== undefined) {
      this.#queuedBytes -= Buffer.byteLength(line);
      return line;
    }
    if (this.#end) throw this.#end;
    return new Promise((resolve, reject) => this.#waiting.push({ resolve, reject }));
  }
  write(text: string): void {
    this.options.stdout.write(clean(text));
  }
  async choose(prompt: string, choices: readonly Choice[]): Promise<string> {
    this.write(
      `\n${prompt}\n${choices.map((choice, i) => `${i + 1}. ${choice.label.replaceAll('\n', ' ↵ ')}`).join('\n')}\n> `,
    );
    for (;;) {
      const answer = (await this.#line()).trim(),
        number = /^\d+$/.test(answer) ? Number(answer) - 1 : -1;
      const choice =
        choices[number] ??
        choices.find(
          (c) =>
            c.value.toLowerCase() === answer.toLowerCase() || c.label.toLowerCase() === answer.toLowerCase(),
        );
      if (choice) return choice.value;
      if (answer === ':back') throw new WizardBack();
      this.write('Choose a listed number or label.\n> ');
    }
  }
  async text(prompt: string, current?: string): Promise<string> {
    this.write(
      `${prompt}${current === undefined ? '' : ` [current: ${JSON.stringify(current)}; Enter keeps it]`}\n> `,
    );
    const line = await this.#line();
    if (line === ':back') throw new WizardBack();
    if (line === ':empty') return '';
    return line === '' && current !== undefined ? current : line;
  }
  async multiline(prompt: string, current?: string): Promise<string> {
    this.write(
      `${prompt}\n${current === undefined ? '' : `Current: ${JSON.stringify(current)}\n`}Enter lines, then a single . to finish. :empty clears; :back cancels this edit.\n`,
    );
    const lines: string[] = [];
    for (;;) {
      const line = await this.#line();
      if (line === ':back') throw new WizardBack();
      if (line === ':empty' && !lines.length) return '';
      if (line === '.') return lines.length ? lines.join('\n') : (current ?? '');
      lines.push(line === '..' ? '.' : line);
      if (lines.join('\n').length > 16384) throw new DomainError('INVALID_INPUT', 'Text exceeds 16 KiB.');
    }
  }
  close(): void {
    process.removeListener('SIGINT', this.#interrupt);
    this.#interface.close();
    this.#finish(new WizardEnd());
  }
}
export async function requiredText(
  terminal: TerminalAdapter,
  label: string,
  current?: string,
): Promise<string> {
  for (;;) {
    const value = await terminal.text(label, current);
    if (value.trim()) return value;
    terminal.write('Supply a nonempty value or use :back.\n');
  }
}
export const back: Choice = { value: 'back', label: 'Back' };

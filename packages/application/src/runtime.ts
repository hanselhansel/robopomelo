export interface RunPolicy {
  offline?: boolean;
  mode?: 'auto' | 'notify' | 'off';
  explicitVersion?: string;
  sourceCheckout?: boolean;
}

export class RuntimeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'RuntimeError';
  }
}

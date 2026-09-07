import type { ExplorationBudget } from '@robopomelo/spec';
/** Reserved-versus-consumed ledger for one exploration run. Every dispatch
 * reserves first; a reservation is refunded only while nothing was sent.
 * Counted dimensions (turns, variants) are spent whole once sent; measured
 * dimensions (tokens, wall time) settle to the reported usage and stay at the
 * upper bound when usage is unknown; the worker dimension is a concurrency slot. */
export type BudgetDimension = keyof ExplorationBudget;
export type ReservationState = 'reserved' | 'sent' | 'settled' | 'released';
export interface Reservation {
  readonly id: number;
  readonly dimension: BudgetDimension;
  readonly amount: number;
  state: ReservationState;
  actual: number | null;
  usageUnknown: boolean;
}
export interface BudgetSnapshot {
  limits: ExplorationBudget;
  /** Reserved or sent but not yet settled to a known amount. */
  pending: ExplorationBudget;
  consumed: ExplorationBudget;
  remaining: ExplorationBudget;
  usageUnknown: boolean;
}
export type CostReport = { usd: number | null; state: 'settled' | 'pending' | 'unknown' };
const DIMENSIONS: readonly BudgetDimension[] = ['modelTurns', 'maxOutputTokens', 'simulationWallMs', 'variants', 'workers'];
const MEASURED = new Set<BudgetDimension>(['maxOutputTokens', 'simulationWallMs']);
const zero = (): ExplorationBudget => ({ modelTurns: 0, maxOutputTokens: 0, simulationWallMs: 0, variants: 0, workers: 0 });
const whole = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
export function assertBudget(budget: ExplorationBudget): void {
  for (const key of DIMENSIONS) if (!whole(budget[key])) throw new Error(`BUDGET_INVALID: ${key} must be a whole number.`);
}
export class BudgetLedger {
  #limits: ExplorationBudget;
  #pending = zero();
  #consumed = zero();
  #unknown = false;
  #next = 0;
  constructor(limits: ExplorationBudget) {
    assertBudget(limits);
    this.#limits = { ...limits };
  }
  remaining(dimension: BudgetDimension): number {
    return this.#limits[dimension] - this.#pending[dimension] - this.#consumed[dimension];
  }
  /** Fails closed with BUDGET_REACHED when the amount does not fit. */
  reserve(dimension: BudgetDimension, amount = 1): Reservation {
    if (!DIMENSIONS.includes(dimension)) throw new Error(`BUDGET_INVALID: unknown dimension ${String(dimension)}.`);
    if (!whole(amount) || amount <= 0) throw new Error('BUDGET_INVALID: reservation must be a positive whole amount.');
    if (this.remaining(dimension) < amount) throw new Error('BUDGET_REACHED');
    this.#pending[dimension] += amount;
    return { id: ++this.#next, dimension, amount, state: 'reserved', actual: null, usageUnknown: false };
  }
  /** Marks the reservation as dispatched: from now on it cannot be refunded. */
  markSent(reservation: Reservation): void {
    this.#expect(reservation, ['reserved'], 'markSent');
    reservation.state = 'sent';
  }
  /** Refund is possible only when no request was sent. */
  release(reservation: Reservation): void {
    if (reservation.state === 'sent') throw new Error('BUDGET_SENT: a dispatched reservation cannot be released; settle it.');
    this.#expect(reservation, ['reserved'], 'release');
    this.#pending[reservation.dimension] -= reservation.amount;
    reservation.state = 'released';
  }
  /** Settles a sent reservation. `null` usage keeps the upper bound pending and
   * flags the ledger; counted dimensions consume the whole reservation. */
  settle(reservation: Reservation, actual: number | null): void {
    this.#expect(reservation, ['sent'], 'settle');
    const { dimension, amount } = reservation;
    reservation.state = 'settled';
    if (dimension === 'workers') { this.#pending.workers -= amount; reservation.actual = 0; return; }
    if (actual === null) {
      if (!MEASURED.has(dimension)) { this.#pending[dimension] -= amount; this.#consumed[dimension] += amount; reservation.actual = amount; return; }
      reservation.usageUnknown = true;
      this.#unknown = true;
      return;
    }
    if (!whole(actual)) throw new Error('BUDGET_INVALID: reported usage must be a whole number.');
    const spent = MEASURED.has(dimension) ? actual : Math.max(amount, actual);
    this.#pending[dimension] -= amount;
    this.#consumed[dimension] += spent;
    reservation.actual = spent;
  }
  /** Raises limits. Every provided limit must exceed the current one. */
  extend(limits: Partial<ExplorationBudget>): void {
    for (const key of Object.keys(limits) as BudgetDimension[]) {
      const value = limits[key];
      if (!DIMENSIONS.includes(key) || !whole(value) || value <= this.#limits[key]) throw new Error(`BUDGET_INVALID: ${key} must be a whole number above ${this.#limits[key] ?? 'the current limit'}.`);
    }
    this.#limits = { ...this.#limits, ...limits };
  }
  snapshot(): BudgetSnapshot {
    const remaining = zero();
    for (const key of DIMENSIONS) remaining[key] = this.remaining(key);
    return { limits: { ...this.#limits }, pending: { ...this.#pending }, consumed: { ...this.#consumed }, remaining, usageUnknown: this.#unknown };
  }
  #expect(reservation: Reservation, states: ReservationState[], action: string): void {
    if (!states.includes(reservation.state)) throw new Error(`BUDGET_INVALID_TRANSITION: ${action} from ${reservation.state}.`);
  }
}
/** Cost of settled output tokens. Unknown pricing or unknown usage is `null`,
 * never zero; in-flight reservations make the report pending. */
export function costReport(snapshot: BudgetSnapshot, usdPerOutputToken: number | null): CostReport {
  if (usdPerOutputToken === null || !Number.isFinite(usdPerOutputToken) || usdPerOutputToken < 0 || snapshot.usageUnknown) return { usd: null, state: 'unknown' };
  const usd = Math.round(snapshot.consumed.maxOutputTokens * usdPerOutputToken * 1e6) / 1e6;
  return { usd, state: snapshot.pending.maxOutputTokens > 0 ? 'pending' : 'settled' };
}

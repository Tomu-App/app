export const SEND_RATE = 40;
export const SEND_BURST = 400;

/**
 * Token bucket like the server's (apps/server/src/limits.ts): starts full, refills `rate` tokens
 * per second up to `burst`. 40/s and 400 sit below the server limit of 50/s, burst 500.
 */
export class Pacer {
  private tokens: number;
  private last: number;
  private readonly rate: number;
  private readonly burst: number;
  private readonly now: () => number;

  constructor(rate: number, burst: number, now: () => number) {
    this.rate = rate;
    this.burst = burst;
    this.now = now;
    this.tokens = burst;
    this.last = now();
  }

  private refill(): void {
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.last) * this.rate) / 1000);
    this.last = t;
  }

  take(): boolean {
    this.refill();
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  /** Milliseconds until the next token is available; 0 when one is available now. */
  waitMs(): number {
    this.refill();
    if (this.tokens >= 1) return 0;
    return Math.ceil(((1 - this.tokens) * 1000) / this.rate);
  }
}

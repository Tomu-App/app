export const OPS_PER_SECOND = 50;
export const OPS_BURST = 500;
export const DOCS_PER_IP_PER_HOUR = 30;
export const CONNS_PER_IP = 20;
/** Largest WebSocket frame accepted; a subscribe for 500 docs is about 20 KB. */
export const MAX_FRAME_BYTES = 65_536;

/** Starts full; refills `rate` tokens per second up to `burst`. */
export class TokenBucket {
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

  take(): boolean {
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.last) * this.rate) / 1000);
    this.last = t;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** At most `max` hits per key within a sliding window of `windowMs`. */
export class WindowCounter {
  private readonly hits = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private lastSweep: number;

  constructor(max: number, windowMs: number, now: () => number) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
    this.lastSweep = now();
  }

  /** Records a hit; false (and nothing recorded) when the key is at its limit. Sweeps once per window. */
  hit(key: string): boolean {
    const t = this.now();
    if (t - this.lastSweep >= this.windowMs) this.sweep();
    const recent = (this.hits.get(key) ?? []).filter((h) => h > t - this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(key, recent);
    return true;
  }

  /** Drops keys whose hits have all expired. */
  sweep(): void {
    this.lastSweep = this.now();
    const cutoff = this.lastSweep - this.windowMs;
    for (const [key, hits] of this.hits) if (hits.every((h) => h <= cutoff)) this.hits.delete(key);
  }

  get size(): number {
    return this.hits.size;
  }
}

/** Counts open connections per key. */
export class ConnCounter {
  private readonly open = new Map<string, number>();
  private readonly max: number;

  constructor(max: number) {
    this.max = max;
  }

  acquire(key: string): boolean {
    const n = this.open.get(key) ?? 0;
    if (n >= this.max) return false;
    this.open.set(key, n + 1);
    return true;
  }

  release(key: string): void {
    const n = (this.open.get(key) ?? 0) - 1;
    if (n > 0) this.open.set(key, n);
    else this.open.delete(key);
  }
}

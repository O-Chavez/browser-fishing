/**
 * Counts failed logins. A key (an account name) is locked after `maxFails` within `lockMs`, and
 * everyone is locked after `maxGlobal`, so spreading guesses over many names doesn't buy more.
 */
export class Lockout {
  private fails = new Map<string, { n: number; at: number }>();
  private globalFails: number[] = [];

  constructor(
    private maxFails: number,
    private maxGlobal: number,
    private lockMs: number,
    private now: () => number = Date.now,
  ) {}

  blocked(key: string): boolean {
    const t = this.now();
    this.globalFails = this.globalFails.filter((at) => t - at < this.lockMs);
    const f = this.fails.get(key);
    if (f && t - f.at >= this.lockMs) this.fails.delete(key);
    return (this.fails.get(key)?.n ?? 0) >= this.maxFails || this.globalFails.length >= this.maxGlobal;
  }

  fail(key: string): void {
    const t = this.now();
    this.fails.set(key, { n: (this.fails.get(key)?.n ?? 0) + 1, at: t });
    this.globalFails.push(t);
  }

  clear(key: string): void {
    this.fails.delete(key);
  }
}

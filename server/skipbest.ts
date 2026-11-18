import { beatsBest, skipDay, type SkipBest } from '../src/data/skip';

/**
 * The day's best skip on Skipper's Beach (GAME_DESIGN.md §41), shared by every room on the server: the most skips
 * thrown since the day began, and whose. A tie keeps the holder. The day is the real calendar day (UTC), so the sign
 * clears at midnight UTC. It lives in memory only: a server restart clears it too.
 */
export class SkipDay {
  private day: number;
  private top: SkipBest | null = null;
  /** The day turned with a best standing, and nobody has been told yet. */
  private cleared = false;

  constructor(now: number = Date.now()) {
    this.day = skipDay(now);
  }

  private roll(now: number): void {
    const day = skipDay(now);
    if (day === this.day) return;
    this.day = day;
    if (this.top) this.cleared = true;
    this.top = null;
  }

  /** Today's best, or null before anyone has skipped a stone today. */
  best(now: number): SkipBest | null {
    this.roll(now);
    return this.top;
  }

  /** A throw of `n` skips by `name`: true when it is the day's new best (a first throw that skipped, or more skips than the holder's). */
  offer(name: string, n: number, now: number): boolean {
    this.roll(now);
    if (!beatsBest(n, this.top)) return false;
    this.top = { n, name };
    return true;
  }

  /** The holder changed their name: true when the best now reads the new one. */
  rename(old: string, name: string, now: number): boolean {
    this.roll(now);
    if (!this.top || this.top.name !== old || old === name) return false;
    this.top = { n: this.top.n, name };
    return true;
  }

  /** True once after the day turned and cleared a best: the signs want `best` again. */
  turned(now: number): boolean {
    this.roll(now);
    const was = this.cleared;
    this.cleared = false;
    return was;
  }
}

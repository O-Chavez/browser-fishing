import { describe, expect, it } from 'vitest';
import { mulberry } from '../game/env';
import { SKIP, beatsBest, skipCount, skipDay, skipDir, skipFlightMs, skipPath, skipSignText, skipSpread, skipsText, validRelease } from './skip';

/** Many throws let go at `p`: the counts, sorted. */
const throws = (p: number | ((rng: () => number) => number), n = 4000, seed = 7): number[] => {
  const rng = mulberry(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(skipCount(typeof p === 'number' ? p : p(rng), rng));
  return out.sort((a, b) => a - b);
};
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const share = (v: number[], ok: (n: number) => boolean) => v.filter(ok).length / v.length;
/** A normal draw (Box-Muller) from a 0 to 1 `rng`. */
const normal = (rng: () => number) => Math.sqrt(-2 * Math.log(Math.max(1e-9, rng()))) * Math.cos(2 * Math.PI * rng());

describe('the count from a release', () => {
  it('gives about 12 on the sweet spot, never more', () => {
    const v = throws(SKIP.sweet);
    expect(v[0]).toBeGreaterThanOrEqual(11);
    expect(v.at(-1)).toBe(SKIP.max);
    expect(SKIP.max).toBe(12);
    expect(share(v, (n) => n === 12)).toBeGreaterThan(0.75);
  });

  it('falls away either side alike: about 10 a hundredth off, 6 at the edge of the marked band, 4 a tenth off, a plop from a third off', () => {
    for (const side of [-1, 1]) {
      const near = throws(SKIP.sweet + side * 0.01);
      expect(mean(near)).toBeGreaterThan(9.3);
      expect(mean(near)).toBeLessThan(10.3);
      const edge = throws(SKIP.sweet + side * SKIP.band);
      expect(mean(edge)).toBeGreaterThan(5.5);
      expect(mean(edge)).toBeLessThan(6.7);
      const tenth = throws(SKIP.sweet + side * 0.1);
      expect(mean(tenth)).toBeGreaterThan(3.4);
      expect(mean(tenth)).toBeLessThan(4.4);
    }
    // A plop: no skip or one. Let go at once (the gauge barely moved) it is nearly always none.
    for (const p of [0, 0.1, 0.3, SKIP.sweet - 0.33]) expect(throws(p).at(-1), `p = ${p}`).toBeLessThanOrEqual(1);
    expect(share(throws(0.05), (n) => n === 0)).toBeGreaterThan(0.7);
    // Let go with the gauge full: a poor throw, two skips at the very most.
    expect(throws(1).at(-1)).toBeLessThanOrEqual(2);
  });

  it('never gives fewer skips for a release nearer the sweet spot, luck aside', () => {
    for (const luck of [0, 0.5, 0.999]) {
      let last = -1;
      for (let p = 0; p <= SKIP.sweet + 1e-9; p += 0.005) {
        const n = skipCount(p, () => luck);
        expect(n).toBeGreaterThanOrEqual(last);
        last = n;
      }
      last = 99;
      for (let p = SKIP.sweet; p <= 1; p += 0.005) {
        const n = skipCount(p, () => luck);
        expect(n).toBeLessThanOrEqual(last);
        last = n;
      }
    }
  });

  it('lets skill dominate: luck moves a throw by one skip at most', () => {
    expect(SKIP.jitter).toBeLessThan(1);
    for (let p = 0; p <= 1; p += 0.01) expect(skipCount(p, () => 0.9999) - skipCount(p, () => 0)).toBeLessThanOrEqual(2);
    for (let p = 0; p <= 1; p += 0.01) expect(Math.abs(skipCount(p, () => 0.9999) - skipCount(p, () => 0.5))).toBeLessThanOrEqual(1);
  });

  it('puts most throws of an ordinary hand at 3 to 7, and a careless one near the bottom', () => {
    // An ordinary player lets go within about a tenth of a second of the sweet spot (0.1 s is 0.11 of the gauge).
    const ordinary = throws((rng) => Math.max(0, Math.min(1, SKIP.sweet + normal(rng) * 0.1 * SKIP.sweep)), 20_000);
    const median = ordinary[ordinary.length >> 1];
    expect(median).toBeGreaterThanOrEqual(3);
    expect(median).toBeLessThanOrEqual(7);
    expect(share(ordinary, (n) => n >= 3 && n <= 7)).toBeGreaterThan(0.55);
    expect(share(ordinary, (n) => n === 12)).toBeLessThan(0.02);
    // A steady hand, half that far off, does better; anywhere at all on the gauge mostly plops.
    const steady = throws((rng) => Math.max(0, Math.min(1, SKIP.sweet + normal(rng) * 0.05 * SKIP.sweep)), 20_000);
    expect(mean(steady)).toBeGreaterThan(mean(ordinary) + 1.2);
    const anywhere = throws((rng) => rng(), 20_000);
    expect(anywhere[anywhere.length >> 1]).toBeLessThanOrEqual(1);
    expect(mean(anywhere)).toBeLessThan(2.5);
  });

  it('always gives a whole number from 0 to 12', () => {
    const rng = mulberry(3);
    for (let i = 0; i < 5000; i++) {
      const n = skipCount(rng(), rng);
      expect(Number.isInteger(n) && n >= 0 && n <= 12).toBe(true);
    }
  });
});

describe('a release a client sends', () => {
  it('is a number from 0 to 1 and nothing else', () => {
    for (const p of [0, 0.5, 1, SKIP.sweet]) expect(validRelease(p)).toBe(true);
    for (const p of [-0.01, 1.01, NaN, Infinity, -Infinity, '0.75', null, undefined, {}, [0.75], true, { valueOf: () => 0.75 }]) expect(validRelease(p), String(p)).toBe(false);
  });
});

describe('the flight', () => {
  it('touches the water once more than it skips, each touch later and further out, each hop shorter than the last', () => {
    for (let n = 0; n <= SKIP.max; n++) {
      const p = skipPath(n);
      expect(p.d).toHaveLength(n + 1);
      expect(p.t).toHaveLength(n + 1);
      expect(p.lift).toHaveLength(n + 1);
      for (let i = 1; i <= n; i++) {
        expect(p.d[i]).toBeGreaterThan(p.d[i - 1]);
        expect(p.t[i]).toBeGreaterThan(p.t[i - 1]);
        if (i > 1) {
          expect(p.d[i] - p.d[i - 1]).toBeLessThan(p.d[i - 1] - p.d[i - 2]);
          expect(p.lift[i]).toBeLessThan(p.lift[i - 1]);
        }
      }
    }
  });

  it('sends a better throw out flatter, faster and further', () => {
    for (let n = 1; n <= SKIP.max; n++) {
      const [a, b] = [skipPath(n - 1), skipPath(n)];
      expect(b.lift[0]).toBeLessThan(a.lift[0]);
      expect(b.d[0] / b.t[0]).toBeGreaterThan(a.d[0] / a.t[0]);
      expect(b.d.at(-1)).toBeGreaterThan(a.d.at(-1)!);
    }
    // A plop lobs up and drops in under 10 m out; a perfect throw is over in about four seconds, under 30 m out.
    expect(skipPath(0).lift[0]).toBeGreaterThan(1.5);
    expect(skipPath(0).d[0]).toBeLessThan(10);
    expect(skipPath(12).lift[0]).toBeLessThan(0.2);
    expect(skipPath(12).d.at(-1)).toBeLessThan(30);
    expect(skipFlightMs(12)).toBeGreaterThan(3000);
    expect(skipFlightMs(12)).toBeLessThan(5000);
    expect(skipFlightMs(0)).toBeLessThan(1600);
    expect(skipFlightMs(5)).toBeGreaterThan(skipFlightMs(4));
  });

  it('takes a count out of range as the nearest one in it', () => {
    expect(skipPath(-3)).toEqual(skipPath(0));
    expect(skipPath(40)).toEqual(skipPath(12));
    expect(skipPath(4.9)).toEqual(skipPath(4));
  });

  it('strays no more than the spread from the bearing, whatever it is sent', () => {
    const most = (SKIP.spread * Math.PI) / 180;
    const rng = mulberry(11);
    for (let i = 0; i < 500; i++) expect(Math.abs(skipSpread(rng))).toBeLessThanOrEqual(most + 0.0005);
    expect(skipSpread(() => 0.5)).toBe(0);
    const [x, z] = skipDir(0);
    expect(Math.hypot(x, z)).toBeCloseTo(1, 9);
    // Out over the lake (-z), a little toward the cove (-x).
    expect(z).toBeLessThan(-0.8);
    expect(x).toBeLessThan(-0.4);
    expect(skipDir(5)).toEqual(skipDir(most));
    expect(skipDir(-5)).toEqual(skipDir(-most));
  });
});

describe("the day's best", () => {
  it('takes a throw with more skips than the holder, never a tie and never a plop', () => {
    expect(beatsBest(1, null)).toBe(true);
    expect(beatsBest(0, null)).toBe(false);
    expect(beatsBest(9, { n: 9, name: 'Ann' })).toBe(false);
    expect(beatsBest(8, { n: 9, name: 'Ann' })).toBe(false);
    expect(beatsBest(10, { n: 9, name: 'Ann' })).toBe(true);
  });

  it('reads on the sign as the count and the name, or none yet', () => {
    expect(skipSignText(null)).toBe('today: none yet');
    expect(skipSignText({ n: 9, name: 'Oscar' })).toBe('today: 9 skips · Oscar');
    expect(skipSignText({ n: 1, name: 'Ann' })).toBe('today: 1 skip · Ann');
    expect(skipsText(12)).toBe('12 skips');
  });

  it('counts days by the real calendar, UTC', () => {
    const noon = Date.UTC(2026, 10, 17, 12);
    expect(skipDay(noon)).toBe(skipDay(Date.UTC(2026, 10, 17, 0, 0, 0)));
    expect(skipDay(noon)).toBe(skipDay(Date.UTC(2026, 10, 17, 23, 59, 59, 999)));
    expect(skipDay(Date.UTC(2026, 10, 18, 0, 0, 0))).toBe(skipDay(noon) + 1);
  });
});

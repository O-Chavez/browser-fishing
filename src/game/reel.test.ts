import { describe, expect, it } from 'vitest';
import { mulberry } from './env';
import { rollFishGaps } from './progression';
import { FIGHT_DT, GOOD_MAX, HoldLog, MAX_FIGHT_STEPS, Reel, decodeHolds, expArith, lnArith, powArith, replayFight, type Gaps } from './reel';
import { HANDS, STYLES, botFight, cellOf, handCell, type Hand } from './reelbot';

const gaps = (strength: number, weight: number): Gaps => ({ strength, weight });

/** Plays a fight with a simple policy until it ends or `secs` pass. */
function play(d: Gaps, seed: number, hold: (r: Reel) => boolean, secs = 120): Reel {
  const r = new Reel(d, mulberry(seed));
  for (let k = 0; k < 60 * secs && r.status === 'reeling'; k++) r.update(FIGHT_DT, hold(r));
  return r;
}

/**
 * The foundation's ladder (REELING.md, "The foundation"), band by band rather than against exact rates: the rungs are
 * conceptual (0 parity, +1 a slight challenge, +2 the frontier, +3 the hard line), so these only pin the bands.
 */
describe('the foundation ladder', () => {
  it('a matched fish is practically always landed, careful hands included, in about 10 s', () => {
    const c = handCell(gaps(0, 0), 'careful');
    expect(c.land).toBe(1);
    expect(c.t).toBeGreaterThan(6);
    expect(c.t).toBeLessThan(14);
  });

  it('weight tests persistence: each rung over the rod is a longer fight that still lands, and +3 runs off', () => {
    const t = [0, 1, 2].map((w) => handCell(gaps(0, w), 'skilled'));
    for (const c of t) expect(c.land).toBe(1);
    expect(t[1].t).toBeGreaterThan(1.8 * t[0].t);
    expect(t[2].t).toBeGreaterThan(1.8 * t[1].t);
    const over = handCell(gaps(0, 3), 'best');
    expect(over.land).toBe(0);
    expect(over.snaps).toBe(0);
  });

  it('strength tests tension: +1 a slight challenge, +2 the frontier for quick hands only, +3 for no one', () => {
    expect(handCell(gaps(1, 0), 'careful').land).toBeGreaterThanOrEqual(0.8);
    expect(handCell(gaps(2, 0), 'careful').land).toBeLessThanOrEqual(0.2);
    expect(handCell(gaps(2, 0), 'best').land).toBeGreaterThanOrEqual(0.5);
    expect(handCell(gaps(3, 0), 'ceiling', 10).land).toBe(0);
  });

  it('the overs add up: +1 on both still lands, +2 on one and +1 on the other does not', () => {
    expect(handCell(gaps(1, 1), 'skilled').land).toBeGreaterThanOrEqual(0.8);
    expect(handCell(gaps(2, 1), 'best').land).toBeLessThanOrEqual(0.2);
  });

  it('every fight ends on its own, by a landing, a snap or a run-off', () => {
    for (let s = 0; s <= 3; s++) for (let w = 0; w <= 3; w++) expect(handCell(gaps(s, w), 'careful', 5).timeouts).toBe(0);
  });

  it('gear above the fish shortens the fight, down to a floor two rungs under', () => {
    const t = (g: number) => play(gaps(g, g), 3, (r) => r.tension < 0.7).elapsed;
    expect(t(-1)).toBeLessThan(t(0));
    expect(t(-2)).toBeLessThan(t(-1));
    expect(t(-4)).toBe(t(-2));
  });
});

/**
 * The fan (main's `FAN_HALF`, refit to the foundation): the gap at which each reference hand lands half its fish, on
 * each axis and on both at once, judged by band (as measured 2026-11-03: careful +1.35 strength, +2.52 weight, +1.00
 * on both; skilled +2.18, +2.55, +1.36). The sea sims and the panels' marker ranges rest on these, so a change that
 * moves one out of its band means rerunning `scripts/seafights.ts` and `scripts/seaeconomy.ts`.
 */
describe('the fan of hands', () => {
  const AXES = {
    strength: (g: number) => gaps(g, 0),
    weight: (g: number) => gaps(0, g),
    both: (g: number) => gaps(g, g),
  };
  type Axis = keyof typeof AXES;
  const FAN: Partial<Record<Hand, Record<Axis, [number, number]>>> = {
    careful: { strength: [1, 2], weight: [2, 3], both: [0.9, 1.5] },
    skilled: { strength: [2, 2.5], weight: [2, 3], both: [1, 1.5] },
  };
  /** Bisects for the gap landed half the time, assuming the land rate falls as it grows. */
  const half = (h: Hand, axis: Axis) => {
    let lo = 0, hi = 3.5;
    while (hi - lo > 0.025) {
      const mid = (lo + hi) / 2;
      if (handCell(AXES[axis](mid), h).land >= 0.5) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const halves = Object.fromEntries(Object.keys(FAN).map((h) => [h, Object.fromEntries(Object.keys(AXES).map((a) => [a, half(h as Hand, a as Axis)]))])) as Record<string, Record<Axis, number>>;

  it('each hand lands half its fish within its band on each axis, and on both', () => {
    for (const [h, bands] of Object.entries(FAN))
      for (const [a, [lo, hi]] of Object.entries(bands)) {
        expect(halves[h][a as Axis], `${h} ${a}`).toBeGreaterThanOrEqual(lo);
        expect(halves[h][a as Axis], `${h} ${a}`).toBeLessThan(hi);
      }
  });

  it('skill counts but is not everything: quick hands reach most of a rung further on strength, about as far on weight', () => {
    const { careful, skilled } = halves;
    expect(skilled.strength - careful.strength).toBeGreaterThan(0.5);
    expect(skilled.strength - careful.strength).toBeLessThan(1.25);
    expect(Math.abs(skilled.weight - careful.weight)).toBeLessThan(0.25);
    expect(skilled.both).toBeGreaterThan(careful.both);
  });

  it("with each fish's own spread and tags, a hand's wall is a slope, not a cliff", () => {
    // The plain gaps fall up to 100% in 0.1 of a rung (skilled at strength +2.0 to +2.1); the spread smears that.
    for (const h of Object.keys(FAN) as Hand[])
      for (const [a, f] of Object.entries(AXES)) {
        const land = (g: number) => {
          const srng = mulberry(99);
          return cellOf((rng) => new Reel(rollFishGaps(f(g), srng).d, rng), g, HANDS[h].react, 40, 1, HANDS[h].styles).land;
        };
        let prev = land(0.5), steepest = 0;
        for (let k = 6; k <= 30; k++) {
          const l = land(k / 10);
          steepest = Math.max(steepest, prev - l);
          prev = l;
        }
        expect(steepest, `${h} ${a}`).toBeLessThanOrEqual(0.6);
      }
  });
});

describe('the fight', () => {
  it('strength places the pull and weight the threshold, the same on every fish with those gaps', () => {
    expect(new Reel(gaps(0, 0)).pullAt).toBeCloseTo(0.575, 9);
    expect(new Reel(gaps(1, 0)).pullAt).toBeCloseTo(GOOD_MAX, 9);
    expect(new Reel(gaps(3, 0)).pullAt).toBeGreaterThan(1);
    expect(new Reel(gaps(0, 0)).baseThreshold).toBeCloseTo(0.4, 9);
    expect(new Reel(gaps(0, 3)).baseThreshold).toBe(1);
  });

  it('with the button up the fish always takes line, in the calm too, and never frays it', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const r = new Reel(gaps(0, 0), mulberry(seed));
      for (let k = 0; k < 60 * 120 && r.status === 'reeling'; k++) {
        const before = r.progress;
        r.update(FIGHT_DT, false);
        expect(r.progress).toBeLessThanOrEqual(before);
      }
      expect(r.status).toBe('escaped');
      expect(r.reason).toBe('ran');
      expect(r.wear.frays).toBe(0);
    }
  });

  it('letting go in a surge gives more line the stronger the fish', () => {
    const given = (s: number) => {
      const r = new Reel(gaps(s, 0), mulberry(2));
      let most = 0;
      for (let k = 0; k < 60 * 10 && r.status === 'reeling'; k++) {
        r.update(FIGHT_DT, !r.surging);
        if (r.surging) most = Math.min(most, r.lineRate);
      }
      return -most;
    };
    expect(given(1)).toBeGreaterThan(1.5 * given(0));
    expect(given(2)).toBeGreaterThan(1.5 * given(1));
  });

  it('two chances: one stretch of red frays the line once, however long it is held', () => {
    let entered = false;
    const r = play(gaps(2, 0), 6, (x) => {
      if (x.tension > GOOD_MAX) entered = true;
      return !entered || x.tension > GOOD_MAX;
    }, 20);
    expect(r.wear.frays).toBe(1);
    expect(r.strain).toBe(0.5);
  });

  it('a part-filled fray mark drains back out of the red', () => {
    let red = 0;
    let peak = 0;
    const r = play(gaps(2, 0), 3, (x) => {
      if (x.tension > GOOD_MAX) red++;
      peak = Math.max(peak, x.strain);
      return red < 12; // 0.2 s in the red, then let go
    }, 8);
    expect(red).toBeGreaterThan(0);
    expect(r.wear.frays).toBe(0);
    expect(peak).toBeGreaterThan(0);
    expect(r.strain).toBeLessThan(peak / 2);
  });

  it('every fish tires, and tiring never takes a strong fish out of the red', () => {
    let tired = false;
    play(gaps(0, 2), 5, (x) => ((tired ||= x.tired), x.tension < 0.7));
    expect(tired).toBe(true);
    const nearlyOut = (s: number) => {
      const r = new Reel(gaps(s, 0));
      r.fightLeft = 0.01;
      return r.surgePulls[1];
    };
    expect(nearlyOut(0)).toBeLessThan(0.6 * new Reel(gaps(0, 0)).pullAt);
    expect(nearlyOut(2)).toBeGreaterThan(GOOD_MAX);
  });

  it('reports the line a fight wore', () => {
    const f = botFight(gaps(1, 1), 0.4, STYLES[0], mulberry(4), mulberry(5));
    expect(f.lineOut).toBeGreaterThan(0);
  });

  it('replays exactly from the same seed and inputs', () => {
    const run = () => {
      const trace: number[] = [];
      play(gaps(1.5, 1), 77, (r) => {
        trace.push(r.tension, r.progress, r.strain);
        return r.tension < 0.7;
      }, 40);
      return trace;
    };
    expect(run()).toEqual(run());
  });

  it('computes e^x without Math.exp, to within rounding', () => {
    for (const x of [-4, -1.4, -0.3, 0, 0.5, 1.1, 2.6]) expect(expArith(x) / Math.exp(x)).toBeCloseTo(1, 10);
  });

  it('computes ln x and powers without Math.log or Math.pow, to within rounding', () => {
    for (const x of [1e-6, 0.2, 0.5, 1, 1.5, 2, 3, 40, 1e6]) expect(lnArith(x)).toBeCloseTo(Math.log(x), 11);
    expect(powArith(0.37, 2)).toBe(0.37 * 0.37);
    expect(powArith(1.7, 1)).toBe(1.7);
    expect(powArith(5, 0)).toBe(1);
    expect(powArith(2, 0.5)).toBeCloseTo(Math.SQRT2, 11);
  });
});

describe('server-checked fights', () => {
  /** A bot fight with its button log, and the same fight replayed from the log. */
  const recorded = (d: Gaps, seed: number, react = 0.25, style = STYLES[0]) => {
    const log = new HoldLog();
    const live = botFight(d, react, style, mulberry(seed), mulberry(seed + 1), undefined, 600, log);
    return { live, log, replay: replayFight(d, seed, log.encode())! };
  };

  it('the button log round-trips through base64, and a 10-minute fight fits the socket limit', () => {
    for (const n of [0, 1, 7, 8, 9, 23, 24, 25, 1001]) {
      const log = new HoldLog();
      const bits: boolean[] = [];
      const rng = mulberry(n);
      for (let i = 0; i < n; i++) {
        bits.push(rng() < 0.5);
        log.push(bits[i]);
      }
      const back = decodeHolds(log.encode())!;
      expect(back.length).toBe((n + 7) >> 3);
      expect(bits.every((b, i) => (((back[i >> 3] >> (i & 7)) & 1) === 1) === b)).toBe(true);
    }
    const full = new HoldLog();
    for (let i = 0; i < MAX_FIGHT_STEPS + 50; i++) full.push(true);
    expect(full.steps).toBe(MAX_FIGHT_STEPS);
    expect(full.encode().length).toBeLessThan(8192 - 100);
    expect(decodeHolds(full.encode())).not.toBeNull();
    expect(decodeHolds('')?.length).toBe(0);
    for (const bad of ['abc', 'ab=c', '!!!!', 'A'.repeat(full.encode().length + 4)]) expect(decodeHolds(bad)).toBeNull();
  });

  it('a fight recorded on the client replays on the server to the same end, frays and line taken', () => {
    const ends = new Set<string>();
    for (const d of [gaps(0, 0), gaps(0, 1), gaps(1, 1), gaps(2, 0), gaps(0, 3), gaps(3, 0)]) {
      for (let seed = 1; seed <= 8; seed++) {
        const { live, replay } = recorded(d, seed * 31, seed % 2 ? 0.25 : 0.7);
        ends.add(live.status);
        expect(replay.status).toBe(live.status);
        expect(replay.wear.frays).toBe(live.frays);
        expect(replay.wear.lineOut).toBe(live.lineOut);
        expect(replay.elapsed).toBeCloseTo(live.t, 9);
      }
    }
    // The grid covers landed, snapped and run-off fights.
    expect([...ends].sort()).toEqual(['caught', 'escaped', 'snapped']);
  });

  it('tampered button logs do not land a fish the real inputs lost', () => {
    let lost = 0;
    for (let seed = 1; lost < 12 && seed < 400; seed++) {
      const { live, log } = recorded(gaps(2, 0), seed, 0.7);
      if (live.status === 'caught') continue;
      lost++;
      const h = decodeHolds(log.encode())!;
      const rng = mulberry(seed * 13);
      for (let k = 0; k < 20; k++) {
        const bent = h.slice();
        for (let j = 0; j < 40; j++) {
          const i = Math.floor(rng() * log.steps);
          bent[i >> 3] ^= 1 << (i & 7);
        }
        const enc = new HoldLog();
        for (let i = 0; i < log.steps; i++) enc.push(((bent[i >> 3] >> (i & 7)) & 1) === 1);
        expect(replayFight(gaps(2, 0), seed, enc.encode())!.status).not.toBe('caught');
      }
    }
    expect(lost).toBe(12);
  });

  // The fish has no random spread (the seed only picks which way it swims), so the same buttons on the same gaps land
  // the same fish; on other gaps they don't.
  it('a log cut short leaves the fish on the line, and the wrong gaps do not replay the same fight', () => {
    let checked = 0;
    for (let seed = 1; checked < 10; seed++) {
      const { live, log, replay } = recorded(gaps(0, 1), seed);
      if (live.status !== 'caught') continue;
      checked++;
      const half = new HoldLog();
      const bits = decodeHolds(log.encode())!;
      for (let i = 0; i < log.steps / 2; i++) half.push(((bits[i >> 3] >> (i & 7)) & 1) === 1);
      expect(replayFight(gaps(0, 1), seed, half.encode())!.status).toBe('reeling');
      expect(replay.status).toBe('caught');
      // Same buttons on another fish: the trace differs (it may still land, but not the same way).
      const other = replayFight(gaps(0.5, 1.5), seed, log.encode())!;
      expect([other.status, other.elapsed]).not.toEqual([replay.status, replay.elapsed]);
    }
  });

  it('holding all the way, or never, never lands a fish too strong for the gear', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const hold of [true, false]) {
        const log = new HoldLog();
        for (let i = 0; i < MAX_FIGHT_STEPS; i++) log.push(hold);
        expect(replayFight(gaps(3, 0), seed, log.encode())!.status).toBe(hold ? 'snapped' : 'escaped');
      }
    }
  });

  it('replaying a fight costs the server well under a millisecond per fight-second', () => {
    const logs = [gaps(0, 0), gaps(1, 0), gaps(0, 2), gaps(1, 1)].map((d) => ({ d, ...recorded(d, 5) }));
    const steps = logs.reduce((n, l) => n + l.log.steps, 0);
    const t0 = performance.now();
    for (let k = 0; k < 20; k++) for (const l of logs) replayFight(l.d, 5, l.log.encode());
    const perStep = (performance.now() - t0) / (20 * steps);
    console.log(`replay: ${(perStep * 1e6).toFixed(0)} ns per step, ${(perStep * 3600).toFixed(2)} ms for a 60 s fight`);
    expect(perStep / FIGHT_DT).toBeLessThan(1); // ms per fight-second
  });
});

describe('gauge previews', () => {
  it("the gauge's line rate in a surge is the line the fight wins or loses while holding, step for step", () => {
    let checked = 0;
    for (const d of [gaps(0, 0), gaps(1, 2), gaps(2.5, 1)]) {
      const r = new Reel(d, mulberry(7));
      for (let i = 0; i < 60 / FIGHT_DT && r.status === 'reeling'; i++) {
        const before = r.progress;
        const holding = Math.floor(i / 20) % 3 !== 0;
        r.update(FIGHT_DT, holding);
        // Held steps in a surge, not clamped at either end of the line.
        if (!holding || !r.surging || r.progress <= 0 || r.progress >= 1) continue;
        expect((r.progress - before) / FIGHT_DT).toBeCloseTo(r.surgeLineAt(r.tension) * r.build, 9);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
  });
});

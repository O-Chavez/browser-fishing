import { describe, expect, it } from 'vitest';
import { FISH, RODS, byId } from '../data/content';
import { mulberry } from './env';
import { reelDifficulty } from './progression';
import { GOOD_MAX, Reel, SWEET_MIN, expArith } from './reel';
import { NAIVE, STYLES, botCell, botFight, botSweep } from './reelbot';

/**
 * Where a bot of each reaction time lands half its fish. The P1 pacing model (rod costs, zones) was fitted to the
 * prototype's 2.89 / 2.61 / 2.29 / 1.93, so a tuning change that moves one by more than ~0.1 means rerunning it
 * (see the Endgame Gameplan).
 */
const FAN_HALF: [number, number][] = [[0.15, 2.82], [0.25, 2.67], [0.4, 2.31], [0.7, 1.93]];

/** Plays a fight with a simple policy until it ends or `secs` pass. */
function play(d: number, seed: number, hold: (r: Reel) => boolean, secs = 120): Reel {
  const r = new Reel(d, mulberry(seed));
  for (let k = 0; k < 60 * secs && r.status === 'reeling'; k++) r.update(1 / 60, hold(r));
  return r;
}

describe('tension reel fight', () => {
  const sweeps = FAN_HALF.map(([react]) => ({ react, ...botSweep(react, 1.4, 3.6) }));

  it('a fan of reaction times lands half its fish at steadily harder fish', () => {
    for (const [i, [, half]] of FAN_HALF.entries()) expect(Math.abs(sweeps[i].d50 - half)).toBeLessThan(0.1);
  });

  it('skill counts but is not everything: a fast player reaches 30-50% harder fish than a slow one', () => {
    const gap = sweeps[0].d50 / sweeps[3].d50;
    expect(gap).toBeGreaterThan(1.3);
    expect(gap).toBeLessThan(1.5);
  });

  it('the landing rate falls smoothly, with no cliff', () => {
    for (const s of sweeps) expect(s.steepest).toBeLessThanOrEqual(0.35);
  });

  it('a strong fish drags line out even with the gauge kept green; a matched one does not', () => {
    const steady = (d: number) => {
      let dragged = false;
      const r = play(d, 2, (x) => {
        if (x.dragging) dragged = true;
        return x.surging ? x.tension < Math.min(GOOD_MAX - 0.03, x.need + 0.15) : x.tension < 0.6;
      }, 60);
      return { dragged, frays: r.wear.frays, lineOut: r.wear.lineOut };
    };
    expect(steady(1.2).dragged).toBe(false);
    const strong = steady(3.0);
    expect(strong.dragged).toBe(true);
    expect(strong.lineOut).toBeGreaterThan(0.2);
  });

  it('letting go never frays the line, but the fish takes it all', () => {
    for (const s of sweeps) for (const p of s.pts) expect(p.cell.snappedReleased).toBe(0);
    for (let seed = 1; seed <= 20; seed++) {
      const r = play(3.4, seed, () => false);
      expect(r.status).toBe('escaped');
      expect(r.reason).toBe('ran');
      expect(r.wear.frays).toBe(0);
      expect(r.wear.lineOut).toBeGreaterThan(0);
    }
  });

  it('easy fish forgive holding straight through a surge; on hard ones it frays the line', () => {
    expect(play(0.8, 4, () => true, 20).wear.frays).toBe(0);
    expect(play(3.2, 4, () => true, 20).wear.frays).toBeGreaterThan(0);
  });

  it('two chances: one stretch of red frays the line once, however long it is held', () => {
    let entered = false;
    const r = play(3.2, 6, (x) => {
      if (x.tension > GOOD_MAX) entered = true;
      return !entered || x.tension > GOOD_MAX;
    }, 20);
    expect(r.wear.frays).toBe(1);
    expect(r.strain).toBe(0.5);
  });

  it('a part-filled fray mark drains back out of the red', () => {
    let red = 0;
    let peak = 0;
    const r = play(2.5, 3, (x) => {
      if (x.tension > GOOD_MAX) red++;
      peak = Math.max(peak, x.strain);
      return red < 12; // 0.2 s in the red, then let go
    }, 3);
    expect(red).toBeGreaterThan(0);
    expect(r.wear.frays).toBe(0);
    expect(peak).toBeGreaterThan(0);
    expect(r.strain).toBeLessThan(peak / 2);
  });

  it('a fish too strong for the gear pulls past the red in a surge, and says so', () => {
    const peak = (d: number) => {
      let out = false;
      play(d, 12, (x) => {
        if (x.outmatched) out = true;
        return x.tension < GOOD_MAX - 0.05;
      }, 30);
      return out;
    };
    expect(peak(1.75)).toBe(false);
    expect(peak(3.6)).toBe(true);
  });

  it('a player who just follows the words lands top fish on matched gear, and fish a tier above the rod', () => {
    expect(botCell(reelDifficulty(byId(FISH, 'aurorapike'), byId(RODS, 'aurora')), 0.25, 300, 1, [NAIVE]).land).toBeGreaterThan(0.9);
    expect(botCell(reelDifficulty(byId(FISH, 'pike'), byId(RODS, 'fiberglass')), 0.25, 300, 1, [NAIVE]).land).toBeGreaterThan(0.6);
  });

  it('everyday pond fish stay easy for everyone, trophies included', () => {
    const twig = byId(RODS, 'twig');
    for (const id of ['bluegill', 'carp']) {
      const f = byId(FISH, id);
      const d = reelDifficulty(f, twig, false, f.maxSize);
      for (const react of [0.25, 0.7]) {
        expect(botCell(d, react, 200).land).toBeGreaterThanOrEqual(0.95);
        expect(botCell(d, react, 200, 1, [NAIVE]).land).toBeGreaterThanOrEqual(0.95);
      }
    }
  });

  it('a tier ladder: matched fish are a light challenge, each tier above the rod a clear step harder', () => {
    const land = (fish: string, rod: string, react: number) => botCell(reelDifficulty(byId(FISH, fish), byId(RODS, rod)), react, 200).land;
    // Northern Pike (tier 3) on the Graphite (3), Fiberglass (2) and Twig (1) rods.
    expect(land('pike', 'graphite', 0.7)).toBeGreaterThan(0.85);
    expect(land('pike', 'fiberglass', 0.7)).toBeGreaterThan(0.3);
    expect(land('pike', 'fiberglass', 0.7)).toBeLessThan(0.85);
    expect(land('pike', 'twig', 0.25)).toBeGreaterThan(0.5);
    expect(land('pike', 'twig', 0.7)).toBeLessThan(0.4);
  });

  it('holding the gauge truly green in a surge reels in fish the gear can handle; stronger ones drag line out', () => {
    const surgeGain = (d: number) => {
      let gain = 0;
      let last = 0;
      play(d, 7, (x) => {
        if (x.surging && x.tension <= GOOD_MAX) gain += x.progress - last;
        last = x.progress;
        return x.surging ? x.tension < GOOD_MAX - 0.05 : x.progress < 0.6;
      }, 20);
      return gain;
    };
    expect(surgeGain(0.8)).toBeGreaterThan(0.02);
    expect(surgeGain(1.5)).toBeGreaterThan(0.02);
    expect(surgeGain(2.2)).toBeLessThan(0);
  });

  it('the green sweet spot shrinks as the fish outclasses the gear', () => {
    const width = (d: number) => { const r = new Reel(d); return r.sweetMax - r.sweetMin; };
    expect(width(0.6)).toBeGreaterThan(0.4);
    expect(width(1.75)).toBeGreaterThan(0.2);
    expect(width(3.2)).toBeLessThan(0.08);
    expect(width(1.75)).toBeLessThan(width(0.6));
    expect(new Reel(0.6).sweetMax).toBeLessThan(GOOD_MAX);
    expect(new Reel(0.6).sweetMin).toBeLessThan(SWEET_MIN);
  });

  it('a surge builds up over a moment unless the fish is far above the gear', () => {
    // How far a surge has built up 0.1 s after it starts.
    const rampAt = (d: number) => {
      let frames = 0;
      let ramp = -1;
      play(d, 3, (x) => {
        if (x.surging && ramp < 0 && ++frames === 6) ramp = x.pull / x.surgePower;
        return x.tension < 0.7;
      }, 20);
      return ramp;
    };
    expect(rampAt(2.9)).toBeLessThan(0.35);
    expect(rampAt(4.2)).toBe(1);
  });

  it('reports the line a fight wore', () => {
    const f = botFight(2.6, 0.7, STYLES[0], mulberry(4), mulberry(5));
    expect(f.lineOut).toBeGreaterThan(0);
  });

  it('replays exactly from the same seed and inputs', () => {
    const run = () => {
      const trace: number[] = [];
      play(2.3, 77, (r) => {
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
});

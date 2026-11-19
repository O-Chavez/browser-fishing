import { describe, expect, it } from 'vitest';
import { LURK, SEA_LOOK_DEPTH, inHull, lurkAt, lurkLevel, seaDepthFor, seaMood } from '../data/sea';
import { SPINE_GLSL, breachLength, breachPose, eyeSpot, eyesShut, farEvery, lurkDist, lurkGap, lurkRate, passPhase, pickFar, seaSight, serpentShape, serpentSpine, stareTime, type FarKind } from './abysslurk';

describe('where the Abyss lurkers show', () => {
  it('nowhere before the Abyss, eased in over its first markers', () => {
    for (const depth of [1, 26, 48, 76, 90]) expect(lurkAt(seaMood(depth))).toBe(0);
    const first = lurkAt(seaMood(seaDepthFor(4, 1)));
    expect(first).toBeGreaterThan(0.2);
    expect(first).toBeLessThan(1);
    expect(lurkAt(seaMood(seaDepthFor(4, 2)))).toBeGreaterThan(first);
    expect(lurkAt(seaMood(seaDepthFor(4, 4)))).toBe(1);
  });

  it('the level climbs from the first marker to the deep ones', () => {
    expect(lurkLevel(seaMood(SEA_LOOK_DEPTH.abyss.from))).toBe(0);
    expect(lurkLevel(seaMood(76))).toBe(0);
    const mid = lurkLevel(seaMood(seaDepthFor(4, 10)));
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.8);
    expect(lurkLevel(seaMood(LURK.deep))).toBe(1);
    expect(lurkLevel(seaMood(250))).toBe(1);
  });
});

describe('the lurkers pacing', () => {
  it('sightings come faster with the level, and not at all before the zone', () => {
    expect(lurkRate(0, 1)).toBe(0);
    expect(lurkRate(1, 0)).toBe(1);
    expect(lurkRate(1, 1)).toBe(LURK.busy);
    expect(lurkRate(0.5, 0.5)).toBeCloseTo(0.5 * (1 + (LURK.busy - 1) / 2));
  });

  it('each far sighting comes as often as its `every` says, and all together rarely', () => {
    const N = 20000;
    const seen: Record<FarKind, number> = { pass: 0, flash: 0, breach: 0, arm: 0, arms: 0 };
    for (let i = 0; i < N; i++) seen[pickFar((i + 0.5) / N)]++;
    const L = LURK.leviathan.every, K = LURK.kraken.every;
    const every: Record<FarKind, number> = { pass: L.pass, flash: L.flash, breach: L.breach, arm: K.arm, arms: K.flash };
    for (const k of Object.keys(seen) as FarKind[]) expect(seen[k] / N).toBeCloseTo(farEvery() / every[k], 3);
    // Not a monster parade: most of a minute between far sightings at the first marker, and a breach is the rarest.
    expect(farEvery()).toBeGreaterThan(60);
    expect(seen.breach).toBeLessThan(Math.min(seen.pass, seen.flash, seen.arm, seen.arms));
  });

  it('gaps run from half to one and a half times the mean', () => {
    expect(lurkGap(100, 0)).toBe(50);
    expect(lurkGap(100, 0.5)).toBe(100);
    expect(lurkGap(100, 1)).toBe(150);
  });

  it('far sightings stand in their range, nearer only at deeper levels', () => {
    const range = LURK.leviathan.range;
    const [far, near] = range;
    for (const r of [0, 0.3, 0.7, 1]) {
      for (const level of [0, 0.5, 1]) {
        const d = lurkDist(range, level, r);
        expect(d).toBeLessThanOrEqual(far);
        expect(d).toBeGreaterThanOrEqual(near);
      }
      expect(lurkDist(range, 1, r)).toBeLessThanOrEqual(lurkDist(range, 0, r));
    }
    expect(lurkDist(range, 0, 1)).toBeCloseTo(far + (near - far) * (1 - LURK.closer));
    expect(lurkDist(range, 1, 1)).toBe(near);
  });
});

describe("the Leviathan's body", () => {
  const V = LURK.leviathan;
  const { A, K } = serpentShape();
  const spine = (s: number, x: number, b: number, ph = 0): number[] => serpentSpine(s, V.length, A, K, ph, x, b, 0, V.breach.neck, V.breach.height, [0, 0, 0]);
  /** The body's top over the water along its length (its thickest; the real one tapers at the ends). */
  const tops = (x: number, b: number, ph = 0): number[] => Array.from({ length: 401 }, (_, i) => spine((i / 400) * V.length, x, b, ph)[1] + V.girth);

  it('the shader runs the same curve as the JS', () => {
    // The GLSL's lines are plain float sums: the same text as JS, with the built-ins it uses.
    const body = SPINE_GLSL.slice(SPINE_GLSL.indexOf('{') + 1, SPINE_GLSL.lastIndexOf('}'))
      .replace(/\bfloat\s+/g, 'let ')
      .replace(/return vec3\(([^;]*)\);/, 'return [$1];');
    const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
    const mix = (a: number, b: number, t: number) => a + (b - a) * t;
    const glsl = new Function('s', 'L', 'A', 'K', 'ph', 'x', 'b', 'w', 'NECK', 'TALL', 'clamp', 'mix', 'sin', body) as (...a: unknown[]) => number[];
    for (const s of [-0.6, 0, 3, 11.5, 29, 47, 80, V.length])
      for (const [x, b, w, ph] of [[1, 0, 0, 0.7], [0.4, 0, 0, 2], [1, 1, 1.5, 4], [1.6, 0.4, -2, 1], [1, V.headUp, 0, 3]]) {
        const js = serpentSpine(s, V.length, A, K, ph, x, b, w, V.breach.neck, V.breach.height, [0, 0, 0]);
        const gl = glsl(s, V.length, A, K, ph, x, b, w, V.breach.neck, V.breach.height, clamp, mix, Math.sin);
        for (let i = 0; i < 3; i++) expect(gl[i]).toBeCloseTo(js[i], 9);
      }
  });

  it('is wholly under the water before it surfaces and after it sinks', () => {
    for (const x of [0, 2]) for (const b of [0, V.headUp]) expect(Math.max(...tops(x, b)) + V.spine).toBeLessThan(-1);
  });

  it('surfaces head first, and sinks head first', () => {
    const upAt = (x: number): number[] => tops(x, 0).map((y, i) => (y > 0 ? i : -1)).filter((i) => i >= 0);
    const early = upAt(0.35), late = upAt(1.65);
    expect(early.length).toBeGreaterThan(0);
    expect(Math.max(...early)).toBeLessThan(250);
    expect(late.length).toBeGreaterThan(0);
    expect(Math.min(...late)).toBeGreaterThan(150);
  });

  it('swims as four to six humps, the tallest standing `hump` metres out of the water', () => {
    for (const ph of [0, 1, 2.5, 4, 5.5]) {
      const y = tops(1, 0, ph);
      let humps = 0;
      for (let i = 1; i < y.length; i++) if (y[i] > 0 && y[i - 1] <= 0) humps++;
      expect(humps).toBeGreaterThanOrEqual(4);
      expect(humps).toBeLessThanOrEqual(6);
      const top = Math.max(...y);
      expect(top).toBeLessThanOrEqual(V.hump + 1e-9);
      expect(top).toBeGreaterThan(V.hump * 0.85);
      // The troughs between them go right under.
      expect(Math.min(...y.slice(120, 300))).toBeLessThan(-2);
    }
  });

  it('rears its head up for a breach, pulling it back over its neck, the body behind staying low', () => {
    const head = spine(0, 1, 1);
    expect(head[1]).toBeGreaterThan(V.breach.height * 0.75);
    expect(head[1]).toBeLessThan(V.breach.height);
    expect(head[0]).toBeLessThan(0);
    expect(head[0]).toBeGreaterThan(-V.breach.neck);
    // The neck climbs steadily from the water to where the head droops off it.
    let last = Infinity;
    for (let s = 6; s <= V.breach.neck * 0.8; s += 2) {
      const y = spine(s, 1, 1)[1];
      expect(y).toBeLessThan(last);
      last = y;
    }
    expect(Math.max(...tops(1, 1).slice(200))).toBeLessThanOrEqual(V.hump);
  });

  it('a pass surfaces, holds and sinks', () => {
    expect(passPhase(0, 15, 3)).toBe(0);
    expect(passPhase(1.5, 15, 3)).toBeCloseTo(0.5);
    expect(passPhase(8, 15, 3)).toBe(1);
    expect(passPhase(13.5, 15, 3)).toBeCloseTo(1.5);
    expect(passPhase(15, 15, 3)).toBe(2);
  });

  it('a breach goes up, hangs, crashes back and sinks', () => {
    const B = V.breach;
    const at = (t: number) => breachPose(t, [0, 0]).slice();
    expect(at(0)).toEqual([0, 0]);
    expect(at(B.up)).toEqual([1, 1]);
    expect(at(B.up + B.hang * 0.5)).toEqual([1, 1]);
    // Up slows toward the top; the fall speeds up.
    expect(at(B.up * 0.5)[1]).toBeGreaterThan(0.5);
    expect(at(B.up + B.hang + B.down * 0.5)[1]).toBeGreaterThan(0.5);
    expect(at(B.up + B.hang + B.down)[1]).toBeCloseTo(0, 9);
    expect(at(breachLength())).toEqual([2, 0]);
  });
});

describe('the eyes below', () => {
  const E = LURK.eyes;

  it('are shy: stared at for half a second they shut, a glance away starts the count again', () => {
    let stared = 0;
    for (let i = 0; i < 20; i++) stared = stareTime(stared, 0.05, 0.1, 1 / 60);
    expect(stared).toBeCloseTo(20 / 60);
    expect(eyesShut(stared, 0)).toBe(false);
    stared = stareTime(stared, E.shyAngle + 0.1 + 0.2, 0.1, 1 / 60);
    expect(stared).toBe(0);
    for (let i = 0; i < 31; i++) stared = stareTime(stared, E.shyAngle + 0.05, 0.1, 1 / 60);
    expect(eyesShut(stared, 0)).toBe(true);
  });

  it('shut at a lightning strike, and bear being looked at when not shy', () => {
    expect(eyesShut(0, 1)).toBe(true);
    expect(eyesShut(0, 0.2)).toBe(false);
    E.shy = false;
    expect(eyesShut(10, 0)).toBe(false);
    expect(eyesShut(10, 1)).toBe(true);
    E.shy = true;
  });

  it('open off to the side of the view, never within reach of the hull', () => {
    const out = [0, 0];
    const [near, far] = E.range;
    for (const [cx, cz] of [[-1.6, -1.7], [4, 1.5], [-5, 0], [0, 0]])
      for (let look = -Math.PI; look < Math.PI; look += 0.37)
        for (const side of [-1, 1])
          for (const r1 of [0, 0.5, 1])
            for (const r2 of [0, 0.4, 1]) {
              const [x, z] = eyeSpot(cx, cz, look, side, r1, r2, out);
              expect(inHull(x, z, near)).toBe(false);
              // Off the middle of the view, but inside its edges.
              const off = Math.abs(Math.atan2(Math.sin(Math.atan2(z - cz, x - cx) - look), Math.cos(Math.atan2(z - cz, x - cx) - look)));
              expect(off).toBeGreaterThan(E.shyAngle + 0.2);
              expect(off).toBeLessThan(1);
              // Straight over the boat it can land further off, but never far.
              expect(Math.hypot(x - cx, z - cz)).toBeLessThan(far + 22);
            }
  });
});

describe('the view over the swell', () => {
  it('is always clear on a calm sea, and comes and goes in the Abyss', () => {
    for (let t = 0; t < 12; t += 0.5) expect(seaSight(0, -120, 5, t, 0)).toBeGreaterThan(0);
    const mood = seaMood(130);
    let clear = 0, hidden = 0, sky = 0;
    for (let t = 0; t < 23; t += 0.25) {
      const front = seaSight(0, -120, 4, t, mood), both = seaSight(0, -120, 4, t, mood, 150);
      expect(both).toBeLessThanOrEqual(front);
      if (front > 0) clear++;
      else hidden++;
      if (both > 0.5) sky++;
    }
    expect(clear).toBeGreaterThan(5);
    expect(hidden).toBeGreaterThan(5);
    // Within a swell or two there is a moment with sky behind it: a flash sighting can wait for one.
    expect(sky).toBeGreaterThan(0);
  });
});

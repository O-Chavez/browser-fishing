import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LEGEND_FIGHT } from '../data/legendshow';
import { LURK, SEA_LOOK_DEPTH, inHull, lurkAt, lurkLevel, seaDepthFor, seaMood } from '../data/sea';
import { AbyssLurk, SPINE_GLSL, breachLength, breachPose, eyeSpot, eyesShut, farEvery, lurkDist, lurkGap, lurkRate, passPhase, pickFar, seaSight, serpentShape, serpentSpine, stareTime, type FarKind } from './abysslurk';

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

describe('what a hooked legend asks of the lurkers', () => {
  const mood = seaMood(seaDepthFor(4, 4));
  const uniforms = () => ({ uTime: { value: 0 }, uWa: { value: [] }, uWb: { value: [] }, uFogColor: { value: new THREE.Color() }, uFogNear: { value: 20 }, uFogFar: { value: 200 } });
  const calm = { flash: 0, strike: () => {} };
  const make = () => {
    const lurk = new AbyssLurk(uniforms() as unknown as ConstructorParameters<typeof AbyssLurk>[0]);
    lurk.auto = false;
    const parts = lurk as unknown as { eyes: THREE.Mesh; eyeGeo: THREE.InstancedBufferGeometry; eyeA: THREE.InstancedBufferAttribute; armGeo: THREE.InstancedBufferGeometry; armB: THREE.InstancedBufferAttribute };
    // The eyes learn where the camera is from their own draw: looking straight at the ring from the deck.
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(0, 3, 0);
    cam.lookAt(20, 0, 0);
    cam.updateMatrixWorld();
    const seen = () => parts.eyes.onBeforeRender(null as never, null as never, cam, null as never, null as never, null as never);
    let t = 0;
    const run = (secs: number, lightning = calm) => {
      for (let i = 0; i < Math.round(secs * 30); i++) {
        lurk.update((t += 1 / 30), 1 / 30, mood, 1, lightning);
        seen();
      }
    };
    const open = () => Array.from({ length: parts.eyeGeo.instanceCount }, (_, i) => parts.eyeA.array[i * 4 + 3]);
    return { lurk, parts, run, open };
  };

  it("opens the Dreamer's eyes in a ring that stays open while stared at and through a lightning strike", () => {
    const { lurk, parts, run, open } = make();
    lurk.ring(20, 0, 2.5, 7, 60);
    run(3);
    expect(parts.eyeGeo.instanceCount).toBe(7);
    for (let i = 0; i < 7; i++) {
      const d = Math.hypot(parts.eyeA.array[i * 4] - 20, parts.eyeA.array[i * 4 + 1]);
      expect(d).toBeGreaterThan(2.5 * 0.85);
      expect(d).toBeLessThan(2.5 * 1.15);
    }
    // Stared at for seconds, and a bolt: a sighting's eyes would have shut at either.
    run(2, { flash: 1, strike: () => {} });
    expect(Math.max(...open())).toBeGreaterThan(0.9);
    // Shut on the word, and they open nowhere else after.
    lurk.shut();
    run(1.5);
    expect(parts.eyes.visible).toBe(false);
    run(20);
    expect(parts.eyes.visible).toBe(false);
  });

  it('shuts a ring by itself once its time is up', () => {
    const { lurk, parts, run } = make();
    lurk.ring(20, 0, 2, 5, 2);
    run(1.5);
    expect(parts.eyeGeo.instanceCount).toBe(5);
    run(3);
    expect(parts.eyes.visible).toBe(false);
  });

  it("lets a hooked Kraken's arm go under at once", () => {
    const { lurk, parts, run } = make();
    lurk.reach(20, 2, 6, 0, 1, 30);
    run(1.5);
    expect(parts.armGeo.instanceCount).toBe(1);
    const up = parts.armB.array[0];
    expect(up).toBeGreaterThan(0.7);
    // Held for half a minute if left; let go, it is under in the time given.
    lurk.letGo(0.5);
    run(0.25);
    expect(parts.armB.array[0]).toBeLessThan(up);
    run(0.4);
    expect(parts.armGeo.instanceCount).toBe(0);
  });

  it("keeps a hooked Kraken's arms where the game holds them, each by its own id", () => {
    const { lurk, parts, run } = make();
    const arms = parts as unknown as { armA: THREE.InstancedBufferAttribute };
    const a = lurk.reach(20, 2, 6, 0, 1, 999);
    const b = lurk.reach(22, -1, 5, 1, 1, 999);
    expect(a).not.toBe(b);
    run(1.5);
    expect(parts.armGeo.instanceCount).toBe(2);
    // Moved with the line, and standing taller: its place and its length follow.
    expect(lurk.hold(a, 15, 3, 9)).toBe(true);
    run(0.1);
    expect([arms.armA.array[0], arms.armA.array[1]]).toEqual([15, 3]);
    expect(arms.armA.array[3]).toBeCloseTo(9 / 0.8);
    // One let go: it goes under and its id is dead, the other stands on.
    lurk.drop(a, 0.5);
    run(0.8);
    expect(parts.armGeo.instanceCount).toBe(1);
    expect(lurk.hold(a, 0, 0, 5)).toBe(false);
    expect(lurk.hold(b, 22, -1, 5)).toBe(true);
    // Its place given out again: the old id is not taken for the new arm.
    const c = lurk.reach(30, 0, 6, 0, 1, 999);
    expect(c % 10).toBe(a % 10);
    expect(c).not.toBe(a);
    expect(lurk.hold(a, 0, 0, 5)).toBe(false);
    expect(lurk.hold(c, 30, 1, 6)).toBe(true);
    // More arms than a sighting ever shows: a last stand's five over the ones already up.
    for (let i = 0; i < 5; i++) lurk.reach(10 + i, 5, 6, 0, 0.5, 999);
    run(1);
    expect(parts.armGeo.instanceCount).toBe(7);
    lurk.letGo(0.3);
    run(0.6);
    expect(parts.armGeo.instanceCount).toBe(0);
  });

  it("keeps a hooked Dreamer's eyes open where the game asks, for as long as it asks", () => {
    const { lurk, parts, run, open } = make();
    const keep = (n: number, lid = 1) => {
      for (let k = 0; k < 30; k++) {
        for (let i = 0; i < n; i++) lurk.keep(i, 12 + i, i - 4, 1, lid);
        run(1 / 30);
      }
    };
    expect(lurk.keepRoom).toBeGreaterThanOrEqual(20);
    keep(14);
    // More than a sighting's nine, each where it was put; a blink aside, wide open.
    expect(parts.eyes.visible).toBe(true);
    expect(parts.eyeGeo.instanceCount).toBe(14);
    expect([parts.eyeA.array[0], parts.eyeA.array[1]]).toEqual([12, -4]);
    expect(open().filter((o) => o > 0.9).length).toBeGreaterThanOrEqual(10);
    // Half-lidded when asked (a spent Dreamer's).
    keep(14, 0.45);
    expect(Math.max(...open())).toBeLessThanOrEqual(0.451);
    expect(open().filter((o) => o > 0.4).length).toBeGreaterThanOrEqual(10);
    // Fewer asked for: the rest shut and are gone; none asked for: all of them.
    keep(3);
    expect(parts.eyeGeo.instanceCount).toBe(3);
    run(1);
    expect(parts.eyes.visible).toBe(false);
    // Lite graphics has room for fewer, and a slot past its room is not kept.
    const full = lurk.keepRoom;
    lurk.setLite(true);
    expect(lurk.isLite).toBe(true);
    expect(lurk.keepRoom).toBeLessThan(full);
    keep(full);
    expect(parts.eyeGeo.instanceCount).toBe(lurk.keepRoom);
  });

  it("has room for the Dreamer's whole field with a move or its last stand over it, and its landing", () => {
    const { lurk } = make();
    const F = LEGEND_FIGHT, G = F.gaze;
    const field = Math.max(...G.count);
    const fits = (room: number, few: (n: number) => number) => {
      for (const move of [F.eyes.count + F.eyes.inner, F.under.count, F.trail.count]) expect(few(field) + few(move)).toBeLessThanOrEqual(room);
      expect(few(field) + few(F.stand.dreamer.ring) + few(F.stand.dreamer.boat)).toBeLessThanOrEqual(room);
      // The landing's eyes take their slots from the top, clear of what the fight had open at the end (its field, or a spent Dreamer's few).
      expect(few(G.landing.count) + few(field)).toBeLessThanOrEqual(room);
    };
    fits(lurk.keepRoom, (n) => n);
    lurk.setLite(true);
    fits(lurk.keepRoom, (n) => Math.ceil(n * G.lite));
    // The acts build: a few far out, then the field, most close in; far more than the handful there were.
    expect(G.count[0]).toBeLessThan(G.count[1] / 3);
    expect(G.count[1]).toBeLessThan(G.count[2]);
    expect(G.count[1]).toBeGreaterThanOrEqual(20);
  });

  it("turns each eye's glow on the water down as more of them are kept open", () => {
    const { lurk, parts, run } = make();
    const glow = () => (parts.eyes.material as THREE.ShaderMaterial).uniforms.uGlow.value as number;
    const keep = (n: number) => {
      for (let k = 0; k < 20; k++) {
        for (let i = 0; i < n; i++) lurk.keep(i, 12 + (i % 10) * 2, Math.floor(i / 10) * 2 - 6, 1, 1);
        run(1 / 30);
      }
    };
    keep(6);
    expect(glow()).toBeCloseTo(LURK.eyes.glow);
    keep(48);
    expect(glow()).toBeLessThan(LURK.eyes.glow * 0.6);
    expect(glow()).toBeGreaterThan(LURK.eyes.glow * 0.3);
  });

  it("a hooked Kraken's arms are alive: each stirs on its own clock, faster as a surge builds, and leans the way it is dragged", () => {
    const { lurk, parts, run } = make();
    const C = () => (parts as unknown as { armC: THREE.InstancedBufferAttribute }).armC.array as Float32Array;
    const a = lurk.reach(20, 2, 6, 0, 1, 999);
    const b = lurk.reach(24, -3, 6, Math.PI / 2, 1, 999);
    // Not stirred (a sighting's arm, the arm by the bobber): nothing of it reaches the shader.
    run(2);
    expect(C()[1]).toBe(0);
    expect(C()[5]).toBe(0);
    // Alive: both stir, each from its own place on its own clock.
    lurk.stir = 1;
    run(2);
    expect(C()[1]).toBeCloseTo(1, 1);
    expect(C()[0]).not.toBeCloseTo(C()[4], 1);
    const pace = (secs: number) => {
      const from = C()[0];
      run(secs);
      return (C()[0] - from) / secs;
    };
    const calm = pace(1);
    expect(calm).toBeGreaterThan(0);
    // A surge at its height: harder and faster, with no jump in its clock (it only ever runs on).
    lurk.stir = 2.2;
    run(1.5);
    expect(C()[1]).toBeGreaterThan(2);
    expect(pace(1)).toBeGreaterThan(calm * 1.5);
    // Dragged toward +x: the arm facing +x leans in its own plane, the one facing +z leans across it.
    expect(lurk.hold(a, 20, 2, 6, 0.3, 0)).toBe(true);
    expect(lurk.hold(b, 24, -3, 6, 0.3, 0)).toBe(true);
    run(1.5);
    expect(parts.armB.array[3]).toBeCloseTo(0.3, 1);
    expect(C()[2]).toBeCloseTo(0, 1);
    expect(parts.armB.array[7]).toBeCloseTo(0, 1);
    expect(Math.abs(C()[6])).toBeCloseTo(0.3, 1);
    // One coming up stirs harder than one that has stood a while (it rises with a writhe); a limp one hardly at all.
    lurk.stir = 1;
    run(2);
    lurk.reach(30, 0, 6, 0, 1, 999);
    lurk.reach(32, 4, 6, 0, 1, 999, 2, { by: 0.9, at: 0, over: 1, limp: 1 });
    run(0.2);
    expect(C()[9]).toBeGreaterThan(C()[1] + 0.2);
    run(3);
    expect(C()[9]).toBeCloseTo(1, 1);
    expect(C()[13]).toBeLessThan(0.5);
    expect(C()[15]).toBe(1);
    expect(C()[11]).toBe(0);
  });
});

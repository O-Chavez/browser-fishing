import * as THREE from 'three';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { FISH } from '../data/content';
import { LEGEND_FIGHT, LEGEND_HUD, LEGEND_SHOW, SURFACE_LIMP, SURFACE_PULLBACK, SURFACE_SPOT, leapSecs, limpAt, limpHeave, rearAt, type SurfaceShow } from '../data/legendshow';
import { LEGEND_HANG, legendHangLen, legendWaterScale, seaHeldScale, waterScale } from './fishscale';
import { buildFish, type FishModel } from './fishmodel';
import { BOAT, boatMotion, inHull } from '../data/sea';
import { LimpRide, bendAlong, keepOff, modelLength, rollAt, surfacingSpot, washPoints } from './legendshow';
import { limpGiant } from './seafish/giants';
import { LEGENDS, SHINY_LEGEND_SPARKLES } from './seafish/legends';
import { setWaves, waveSurface, waveUniforms } from './seawaves';

/** A canvas that draws nothing: the models' skins paint on a canvas when they are made, so no DOM is needed. */
function fakeCanvas(): unknown {
  const canvas: Record<string, unknown> = { width: 0, height: 0 };
  const ctx: unknown = new Proxy({ canvas } as Record<string | symbol, unknown>, {
    get: (t, k) => (k in t ? t[k] : () => ctx),
    set: (t, k, v) => ((t[k] = v), true),
  });
  canvas.getContext = () => ctx;
  return canvas;
}
vi.stubGlobal('document', { createElement: fakeCanvas });
afterAll(() => {
  vi.unstubAllGlobals();
});

const seaLegends = FISH.filter((f) => f.sea && f.legend);
const mid = (f: (typeof FISH)[number]) => (f.minSize + f.maxSize) / 2;
const model = (id: string, shadow = false, shiny = false): FishModel => {
  const f = FISH.find((x) => x.id === id)!;
  return buildFish(f.color, shadow, shiny, f.tier, id);
};
function triangles(m: FishModel): number {
  let n = 0;
  m.group.traverse((o) => {
    const g = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh).geometry : null;
    if (g) n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return n;
}

describe('which legends are shown off', () => {
  it('covers every sea legend and no lake fish', () => {
    expect(Object.keys(LEGEND_SHOW).sort()).toEqual(seaLegends.map((f) => f.id).sort());
  });

  it("surfaces the Abyss's three beside the boat and hangs the rest from the rod", () => {
    for (const f of seaLegends) expect(LEGEND_SHOW[f.id].kind, f.id).toBe(f.locations.includes('abyss') ? 'surface' : 'hang');
    expect(seaLegends.filter((f) => LEGEND_SHOW[f.id].kind === 'surface').map((f) => f.id).sort()).toEqual(['dreamer', 'kraken', 'leviathan']);
  });

  it('holds the card back a beat so the fish is seen first', () => {
    expect(LEGEND_HUD.cardAfter).toBeGreaterThanOrEqual(1);
    expect(LEGEND_HUD.cardAfter).toBeLessThanOrEqual(3);
  });
});

describe('how big a legend is drawn', () => {
  it('hangs within the frame, bigger for a bigger fish', () => {
    for (const f of seaLegends) {
      const spec = LEGEND_SHOW[f.id];
      if (spec.kind !== 'hang') continue;
      const len = legendHangLen(mid(f), f.tier, spec.grow, spec.wet);
      expect(len, f.id).toBeLessThanOrEqual((spec.wet > 0 ? LEGEND_HANG.maxWet : LEGEND_HANG.max) * spec.grow);
      expect(legendHangLen(f.maxSize, f.tier, spec.grow, spec.wet), `${f.id} grows with size`).toBeGreaterThanOrEqual(legendHangLen(f.minSize, f.tier, spec.grow, spec.wet));
    }
  });

  it('hangs no smaller than the biggest everyday fish of its zone', () => {
    for (const f of seaLegends) {
      const spec = LEGEND_SHOW[f.id];
      if (spec.kind !== 'hang') continue;
      // The part above the water, for the Oarfish that hangs with its tail in the sea.
      const len = legendHangLen(mid(f), f.tier, spec.grow, spec.wet) * (1 - spec.wet);
      const everyday = FISH.filter((x) => x.sea && !x.legend && x.locations.join() === f.locations.join());
      const biggest = Math.max(...everyday.map((x) => seaHeldScale(mid(x), x.tier) * modelLength(model(x.id))));
      // On screen it is 1.4 to 1.7 times as tall, since it also hangs nearer (staged with scripts/legendshots.ts).
      expect(len, f.id).toBeGreaterThan(biggest * 0.95);
    }
  });

  it('swims bigger in the water than an everyday fish of the same size', () => {
    for (const f of seaLegends) {
      expect(legendWaterScale(mid(f), f.tier), f.id).toBeGreaterThan(waterScale(mid(f), f.tier));
      expect(legendWaterScale(f.maxSize, f.tier), f.id).toBeLessThanOrEqual(8.5);
    }
  });
});

describe('the surfacing pose', () => {
  it('lays the model along its spine at the drawn length, with the jaw on the spine', () => {
    for (const f of seaLegends) {
      const spec = LEGEND_SHOW[f.id];
      if (spec.kind !== 'surface') continue;
      expect(spec.min, f.id).toBeLessThan(spec.max);
      expect(spec.jaw, f.id).toBeGreaterThanOrEqual(0);
      expect(spec.jaw, f.id).toBeLessThanOrEqual(1);
      const len = THREE.MathUtils.clamp((mid(f) / 100) * spec.real, spec.min, spec.max);
      const { bent } = laid(f.id, spec, len);
      // Something stands out of the water, and the jaw is near the spine's nose end.
      expect(bent.above.max.y, f.id).toBeGreaterThan(0);
      const jaw = bent.at(spec.jaw, 0, new THREE.Vector3());
      const nose = bent.at(0, 0, new THREE.Vector3());
      expect(jaw.distanceTo(nose), f.id).toBeLessThanOrEqual(len * spec.jaw * 1.05 + 1e-6);
    }
  });
});

describe('where a giant surfaces', () => {
  const eye = (x: number, z: number) => new THREE.Vector3(x, 2.1, z);
  const spot = (id: string, x: number, z: number, yaw: number) => {
    const spec = LEGEND_SHOW[id];
    if (spec.kind !== 'surface') throw new Error(id);
    return surfacingSpot(eye(x, z), yaw, spec, spec.min).base;
  };

  it('comes up out past the hull the way the player faces, from the spawn', () => {
    for (const id of ['leviathan', 'dreamer', 'kraken']) {
      const b = spot(id, BOAT.spawn.x, BOAT.spawn.z, 0);
      expect(b.z, id).toBeLessThan(-BOAT.beam);
    }
  });

  it('comes up as near looking along the deck as it does from the rails', () => {
    // Fore and aft from the working deck, from the stern and from the bow: 12 to 17 m off before; the rails give 6 to 11.
    const views: [x: number, z: number, yaw: number][] = [[-1.6, 0.3, Math.PI / 2], [-1.6, 0.3, -Math.PI / 2], [-3, -1, Math.PI / 2], [4.6, 0, -Math.PI / 2], [4.6, 0, Math.PI / 2], [-1.6, -1.5, Math.PI], [0, 0, 0.6]];
    for (const id of ['leviathan', 'dreamer', 'kraken']) {
      const spec = LEGEND_SHOW[id];
      if (spec.kind !== 'surface') throw new Error(id);
      const rail = spot(id, BOAT.spawn.x, -1.6, 0).distanceTo(eye(BOAT.spawn.x, -1.6).setY(0));
      for (const [x, z, yaw] of views) {
        const d = spot(id, x, z, yaw).distanceTo(eye(x, z).setY(0));
        // A pose laid along the hull lies off the boat's widest beam, so a little further where the hull is narrower or the player stands back from that rail.
        expect(d, `${id} from ${x},${z} facing ${yaw.toFixed(2)}`).toBeLessThanOrEqual(Math.hypot(SURFACE_SPOT.reach + spec.out, spec.across) + (spec.alongside ? 0.6 : 0.1));
        expect(d, `${id} from ${x},${z} facing ${yaw.toFixed(2)}`).toBeLessThan(rail + 3.5);
      }
    }
  });

  it('never comes up behind the wheelhouse, looking forward along the deck', () => {
    for (const id of ['leviathan', 'dreamer', 'kraken']) {
      // Looking at the bow from the working deck: the wheelhouse fills the view, so it comes up off a beam instead.
      const b = spot(id, -2.5, 0, -Math.PI / 2);
      expect(Math.abs(b.z), id).toBeGreaterThan(BOAT.beam);
    }
  });
});

/** A giant's model laid out as it is landed: its limp build in place of the one that fought, where it has one, at the scale it fought at. */
function laid(id: string, spec: SurfaceShow, len: number, mirror = false): { m: FishModel; bent: ReturnType<typeof bendAlong>; scale: number } {
  const m = model(id);
  const scale = len / modelLength(m);
  if (spec.limp?.build) expect(limpGiant(m), `${id} has a limp build`).toBe(true);
  return { m, bent: bendAlong(m, spec, len, mirror), scale };
}

/** A giant's lit corners as it lies by the boat (boat frame), seen from (x, z) facing `yaw`, at its mid size (or `size` cm). */
function posed(id: string, spec: SurfaceShow, x: number, z: number, yaw: number, size?: number): { pts: THREE.Vector3[]; spot: ReturnType<typeof surfacingSpot>; len: number } {
  const f = FISH.find((k) => k.id === id)!;
  const len = THREE.MathUtils.clamp(((size ?? mid(f)) / 100) * spec.real, spec.min, spec.max);
  const spot = surfacingSpot(new THREE.Vector3(x, 2.1, z), yaw, spec, len);
  const { m } = laid(id, spec, len, spot.mirror);
  m.group.position.copy(spot.base);
  m.group.rotation.set(0, Math.atan2(-spot.dir.z, spot.dir.x), 0);
  m.group.updateMatrixWorld(true);
  const pts: THREE.Vector3[] = [];
  m.group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh.material as THREE.Material).blending === THREE.AdditiveBlending) return;
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 7) pts.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld));
  });
  return { pts, spot, len };
}

describe('the Leviathan laid out along the hull', () => {
  const spec = LEGEND_SHOW.leviathan as SurfaceShow;
  // The spawn facing each beam, looking along the deck both ways, the stern, the bow, the port rail.
  const views: [x: number, z: number, yaw: number][] = [[BOAT.spawn.x, BOAT.spawn.z, 0], [BOAT.spawn.x, BOAT.spawn.z, Math.PI], [-1.6, 0.3, Math.PI / 2], [-1.6, 0.3, -Math.PI / 2], [-5.2, 0, 0.9], [4.6, 0, -1.2], [-1.6, 1.2, Math.PI], [0, 0, 0.6]];

  it('lies parallel to the boat, off the beam the player faces, its tail to their left from the rails', () => {
    for (const [x, z, yaw] of views) {
      const { spot } = posed('leviathan', spec, x, z, yaw);
      expect(Math.abs(spot.dir.x), `${x},${z} ${yaw}`).toBe(1);
      expect(Math.abs(spot.base.z), `${x},${z} ${yaw}`).toBeCloseTo(BOAT.beam + spec.out, 5);
    }
    // From the spawn it is to starboard, its head by the player and its body running aft (their left).
    const { spot, pts } = posed('leviathan', spec, BOAT.spawn.x, BOAT.spawn.z, 0);
    expect(spot.base.z).toBeLessThan(-BOAT.beam);
    expect(spot.dir.x).toBe(1);
    expect(Math.abs(spot.base.x - BOAT.spawn.x)).toBeLessThan(2.5);
    expect(Math.min(...pts.map((p) => p.x))).toBeLessThan(BOAT.spawn.x - 6);
  });

  it('runs along most of the boat and never through it', () => {
    for (const [x, z, yaw] of views) {
      const { pts, len } = posed('leviathan', spec, x, z, yaw);
      const xs = pts.map((p) => p.x);
      const lo = Math.min(...xs), hi = Math.max(...xs);
      // Alongside the hull for most of its length: no more than the pose allows lies past the boat's ends.
      const beside = Math.min(hi, BOAT.len / 2) - Math.max(lo, -BOAT.len / 2);
      expect(beside / (hi - lo), `${x},${z} ${yaw}`).toBeGreaterThan(0.55);
      expect(hi - lo, `${x},${z} ${yaw}`).toBeGreaterThan(len * 0.8);
      // Clear of the hull by more than the waves can lean it (`SURFACE_LIMP.lean`).
      expect(pts.some((p) => inHull(p.x, p.z, 0.5)), `${x},${z} ${yaw} through the hull`).toBe(false);
    }
  });

  it('lies low on the water, beaten: its head by the rail, nothing of it standing up in the air', () => {
    const { pts, spot, len } = posed('leviathan', spec, BOAT.spawn.x, BOAT.spawn.z, 0);
    // The head, on its side by the hull, where it was carried high over the rail: only the horn that side of it stands up.
    const head = pts.filter((p) => p.x > spot.base.x - 1);
    const ys = head.map((p) => p.y).sort((a, b) => a - b);
    expect(ys[ys.length - 1]).toBeLessThan(3.4);
    expect(ys[Math.floor(ys.length * 0.9)]).toBeLessThan(1.7);
    expect(ys[ys.length - 1]).toBeGreaterThan(0.5);
    // Behind it the body is awash all the way: its top a little out of the water, most of it at the waterline or under.
    for (const [from, to] of [[2.5, 5.5], [6, 9.5]]) {
      const part = pts.filter((p) => p.x < spot.base.x - from && p.x > spot.base.x - to);
      const top = Math.max(...part.map((p) => p.y));
      expect(top, `${from} to ${to} m back`).toBeGreaterThan(0.15);
      expect(top, `${from} to ${to} m back`).toBeLessThan(len * 0.17);
      expect(part.filter((p) => p.y < 0.4).length / part.length, `${from} to ${to} m back, awash`).toBeGreaterThan(0.5);
    }
  });

  it('is drawn as its own mirror image when its tail runs the other way', () => {
    const f = FISH.find((k) => k.id === 'leviathan')!;
    const a = bendAlong(model('leviathan'), spec, mid(f) / 100, false).above;
    const b = bendAlong(model('leviathan'), spec, mid(f) / 100, true).above;
    expect(b.min.z).toBeCloseTo(-a.max.z, 4);
    expect(b.max.z).toBeCloseTo(-a.min.z, 4);
    expect(b.max.y).toBeCloseTo(a.max.y, 4);
  });
});

describe('how a giant is staged as it comes up', () => {
  it('pulls the camera back, and is home before the card comes in', () => {
    const P = SURFACE_PULLBACK;
    expect(Math.max(P.hold, SURFACE_LIMP.cam.hold) + P.home).toBeLessThan(LEGEND_HUD.cardAfter);
    // Out in time to see most of the rise.
    for (const id of ['leviathan', 'dreamer', 'kraken']) expect(P.out, id).toBeLessThan((LEGEND_SHOW[id] as SurfaceShow).rise * 0.7);
  });

  it('brings the Leviathan and the Kraken up beaten, and leaves the Dreamer dreaming', () => {
    expect((LEGEND_SHOW.leviathan as SurfaceShow).limp?.build).toBe(true);
    expect((LEGEND_SHOW.kraken as SurfaceShow).limp?.build).toBe(true);
    expect((LEGEND_SHOW.dreamer as SurfaceShow).limp).toBeUndefined();
  });
});

describe('a beaten giant', () => {
  it('heaves up once and slumps: under at first, thrown up part-way, flat on the water and limp as the rise ends', () => {
    const rise = 2;
    expect(limpAt(0, rise)).toMatchObject({ under: 1, heave: 0, limp: 0 });
    const top = limpAt(rise * (SURFACE_LIMP.lift[1] + SURFACE_LIMP.fall) / 2, rise);
    expect(top).toMatchObject({ under: 0, heave: 1, limp: 0 });
    expect(limpAt(rise, rise)).toMatchObject({ under: 0, heave: 0, limp: 1 });
    // It falls faster and faster, and stays down.
    const f = SURFACE_LIMP.fall;
    expect(limpHeave(f + (1 - f) * 0.5)).toBeCloseTo(0.75, 5);
    expect(limpHeave(1.5)).toBe(0);
    expect(limpAt(60, rise)).toMatchObject({ under: 0, heave: 0, limp: 1 });
  });

  it('turns about its spine by its twist, eased between the stops', () => {
    const show = { roll: 0.1, twist: [[0, 0], [0.5, 1], [1, 0.4]] as [number, number][] };
    expect(rollAt(show, 0)).toBeCloseTo(0.1);
    expect(rollAt(show, 0.25)).toBeCloseTo(0.6);
    expect(rollAt(show, 0.5)).toBeCloseTo(1.1);
    expect(rollAt(show, 1)).toBeCloseTo(0.5);
    expect(rollAt({ roll: 0.3 }, 0.7)).toBe(0.3);
  });

  /** A beaten giant beside the boat on the Abyss's sea at `time`, `t` seconds into its landing: the sea's frame moves as the boat rides. */
  function riding(id: string, t: number, time = 100) {
    const spec = LEGEND_SHOW[id] as SurfaceShow;
    const f = FISH.find((k) => k.id === id)!;
    const len = THREE.MathUtils.clamp(mid(f) / 100, spec.min, spec.max);
    const { m, scale } = laid(id, spec, len);
    const waves = waveUniforms();
    waves.uTime.value = time;
    setWaves(waves, 2);
    const eye = new THREE.Vector3(BOAT.spawn.x, 2.1, BOAT.spawn.z);
    const ride = new LimpRide(m, spec, len, waves, false, scale, eye);
    // The sea's frame, as `Sea.update` sets it: the boat's ride, turned inside out.
    const frame = new THREE.Group();
    const mo = boatMotion(time, 2);
    frame.matrixAutoUpdate = false;
    frame.matrix.makeRotationFromEuler(new THREE.Euler(mo.roll, 0, mo.pitch, 'YXZ')).setPosition(0, mo.heave, 0).invert();
    frame.updateMatrixWorld(true);
    frame.add(m.group);
    ride.t = t;
    const at = new THREE.Vector3(-1, 0, -(BOAT.beam + spec.out));
    ride.update(at, 0, time);
    /** The water drawn over a point of it (its own frame): its height in the sea's frame, and over the boat's own waterline. */
    const water = (p: THREE.Vector3) => {
      const d = waveSurface(waves, at.x + p.x, at.z + p.z, new THREE.Vector3());
      const sea = waveSurface(waves, 2 * (at.x + p.x) - d.x, 2 * (at.z + p.z) - d.z, d).y;
      const w = new THREE.Vector3(p.x, sea, p.z).applyMatrix4(m.group.matrixWorld);
      return { sea, boat: w.y, off: Math.hypot(w.x - eye.x, w.z - eye.z), up: m.group.matrixWorld.elements[5] };
    };
    return { spec, len, m, ride, water, wash: washPoints(m, 48) };
  }

  it('lies with every part of it on its own water, while that water is near the level the boat rides at', () => {
    const { lo, hi } = SURFACE_LIMP.keep;
    for (const id of ['leviathan', 'kraken']) {
      let on = 0;
      for (let time = 100; time < 112; time += 0.5) {
        const { ride, wash, water } = riding(id, 30, time);
        for (const p of wash) {
          const w = water(p);
          if (w.boat < lo + 0.2 || w.boat > hi - 0.2) continue;
          on++;
          expect(ride.point(p).y - p.y, `${id} at ${time}`).toBeCloseTo(w.sea, 1);
        }
      }
      expect(on, id).toBeGreaterThan(40);
    }
  });

  it('rides the swell the boat rides: a crest washes over it and a trough leaves it only a little proud', () => {
    for (const id of ['leviathan', 'kraken']) {
      let seaLo = Infinity, seaHi = -Infinity, lowest = Infinity, highest = -Infinity, proud = 0, washed = 0;
      // A whole swell, and more.
      for (let time = 100; time < 113; time += 0.5) {
        const { ride, wash, water } = riding(id, 30, time);
        for (const p of wash) {
          const w = water(p);
          const y = ride.world(new THREE.Vector3(p.x, 0, p.z)).y;
          seaLo = Math.min(seaLo, w.boat);
          seaHi = Math.max(seaHi, w.boat);
          lowest = Math.min(lowest, y);
          highest = Math.max(highest, y);
          if (w.off < SURFACE_LIMP.keep.from) proud = Math.max(proud, y - w.boat);
          washed = Math.max(washed, w.boat - y);
          expect(ride.awash(p) * w.up, `${id} at ${time}`).toBeCloseTo(-keepOff(w.boat, w.off), 2);
        }
      }
      // The sea beside the boat stands well over and under the boat's own waterline; the body does not rise with it.
      expect(seaHi - seaLo, id).toBeGreaterThan(3);
      expect(highest, id).toBeLessThan(seaHi - 0.5);
      // Near the player a crest washes over it, and in a trough it stands no further out of the water than it lies deep.
      expect(washed, id).toBeGreaterThan(0.4);
      expect(washed, id).toBeLessThanOrEqual(SURFACE_LIMP.keep.under / 0.9);
      expect(proud, id).toBeLessThanOrEqual(SURFACE_LIMP.keep.proud / 0.9);
    }
  });

  it('keeps to its water inside the band, and part of the way back to it outside, more so near the player', () => {
    const { lo, hi, near, far, from, to } = SURFACE_LIMP.keep;
    expect(Math.abs(keepOff((lo + hi) / 2, 5))).toBeLessThan(0.02);
    // A metre over the band: drawn lower than its water by all but the share it follows.
    expect(keepOff(hi + 1, from)).toBeCloseTo(-(1 - near[0]), 1);
    expect(keepOff(hi + 1, to)).toBeCloseTo(-(1 - far[0]), 1);
    expect(keepOff(lo - 1, from)).toBeCloseTo(1 - near[1], 1);
    expect(keepOff(lo - 1, to)).toBeCloseTo(1 - far[1], 1);
    // However high the crest or deep the trough, never further under its water or over it than this.
    expect(keepOff(hi + 6, from)).toBe(-SURFACE_LIMP.keep.under);
    expect(keepOff(lo - 6, from)).toBe(SURFACE_LIMP.keep.proud);
    // Its far end goes down with the water.
    expect(far[1]).toBe(1);
  });

  it('comes up from under and throws its far end out of the water before it lies', () => {
    for (const id of ['leviathan', 'kraken']) {
      const spec = LEGEND_SHOW[id] as SurfaceShow;
      const far = (r: ReturnType<typeof riding>) => r.wash.reduce((a, b) => (Math.hypot(b.x - spec.limp!.heave.from[0] * r.len, b.z) > Math.hypot(a.x - spec.limp!.heave.from[0] * r.len, a.z) ? b : a));
      const start = riding(id, 0), top = riding(id, spec.rise * 0.62), lying = riding(id, 30);
      const p = far(lying);
      expect(start.ride.point(p).y, `${id} starts under`).toBeLessThan(lying.ride.point(p).y - spec.limp!.under * 0.8);
      expect(top.ride.point(p).y, `${id} heaves`).toBeGreaterThan(lying.ride.point(p).y + spec.limp!.heave.up * 0.5);
      expect(lying.ride.point(p, new THREE.Vector3(), true).y, `${id} lying`).toBeCloseTo(lying.ride.point(p).y, 4);
    }
  });

  it("draws its own materials on the water and leaves the kit's as they were", () => {
    const { m, ride } = riding('kraken', 30);
    const shared = new Set<THREE.Material>();
    model('kraken').group.traverse((o) => (o as THREE.Mesh).isMesh && shared.add((o as THREE.Mesh).material as THREE.Material));
    let n = 0;
    for (const o of m.group.children) {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry.attributes.sway) continue;
      n++;
      const mat = mesh.material as THREE.Material;
      expect(shared.has(mat)).toBe(false);
      expect(mat.customProgramCacheKey()).toMatch(/\|limp$/);
    }
    expect(n).toBeGreaterThanOrEqual(3);
    expect(ride.lit.length).toBeGreaterThanOrEqual(2);
  });
});

describe('the Kraken laid out beaten along the hull', () => {
  const spec = LEGEND_SHOW.kraken as SurfaceShow;
  const views: [x: number, z: number, yaw: number][] = [[BOAT.spawn.x, BOAT.spawn.z, 0], [BOAT.spawn.x, BOAT.spawn.z, Math.PI], [-1.6, 0.3, Math.PI / 2], [-1.6, 0.3, -Math.PI / 2], [-5.2, 0, 0.9], [4.6, 0, -1.2], [-1.6, 1.2, Math.PI], [0, 0, 0.6]];

  it('never lies through the hull, at any size, from anywhere on the deck', () => {
    const f = FISH.find((k) => k.id === 'kraken')!;
    for (const size of [f.minSize, mid(f), f.maxSize])
      for (const [x, z, yaw] of views) {
        const { pts } = posed('kraken', spec, x, z, yaw, size);
        // No arm within a metre of the hull: the waves lean and drift it less than that.
        expect(pts.filter((p) => inHull(p.x, p.z, 1)).length, `${size} cm from ${x},${z} facing ${yaw.toFixed(2)}`).toBe(0);
      }
  });

  it('lies flat with its arms spread wide across the water, where it stood up out of it', () => {
    const { pts, len, spot } = posed('kraken', spec, BOAT.spawn.x, BOAT.spawn.z, 0);
    // Nothing stands up in the air: the mantle's back is the highest of it.
    expect(Math.max(...pts.map((p) => p.y))).toBeLessThan(len * 0.16);
    // The arms: everything ahead of the head (toward the player's right, the bow), spread wider than the mantle is
    // long and lying at the waterline.
    const arms = pts.filter((p) => p.x > spot.base.x + len * 0.06);
    const zs = arms.map((p) => p.z);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(len * 0.7);
    expect(Math.max(...arms.map((p) => p.x)) - spot.base.x).toBeGreaterThan(len * 0.4);
    expect(arms.filter((p) => Math.abs(p.y) < 0.9).length / arms.length).toBeGreaterThan(0.9);
    // Their tips sink.
    expect(Math.min(...arms.map((p) => p.y))).toBeLessThan(-0.6);
  });

  it('keeps its eye out of the water for the view to turn to', () => {
    const len = THREE.MathUtils.clamp(mid(FISH.find((k) => k.id === 'kraken')!) / 100, spec.min, spec.max);
    const { m } = laid('kraken', spec, len);
    const glows = m.group.children.filter((o) => (o as THREE.Sprite).isSprite);
    expect(glows.length).toBe(2);
    // The near eye's glow (toward the hull, -z in its own frame) stands over the waterline.
    const near = glows.reduce((a, b) => (b.position.z < a.position.z ? b : a));
    expect(near.position.y).toBeGreaterThan(0.3);
  });
});

describe("a legend's fight", () => {
  it('gives a bigger legend a slower leap, so a giant heaves out instead of hopping', () => {
    expect(leapSecs(1, true)).toBe(LEGEND_FIGHT.leap);
    expect(leapSecs(4, true)).toBeGreaterThan(leapSecs(2, true));
    expect(leapSecs(6, true)).toBeGreaterThanOrEqual(1.4);
    expect(leapSecs(20, true)).toBe(LEGEND_FIGHT.leapMax);
    // Everyday fish leap as they always did, whatever their size.
    expect(leapSecs(3, false)).toBe(LEGEND_FIGHT.leap);
  });

  it("rears the Leviathan slowly: up, held, back down, about two seconds in all", () => {
    const { up, hold, down } = LEGEND_FIGHT.rear;
    const all = up + hold + down;
    expect(all).toBeGreaterThanOrEqual(1.8);
    expect(all).toBeLessThanOrEqual(2.6);
    expect(rearAt(0)).toBe(0);
    expect(rearAt(up + hold / 2)).toBe(1);
    expect(rearAt(up / 2)).toBeCloseTo(0.5);
    expect(rearAt(all - down / 2)).toBeCloseTo(0.5);
    for (let t = 0.05; t < up; t += 0.05) expect(rearAt(t)).toBeGreaterThan(rearAt(t - 0.05));
    expect(rearAt(all)).toBe(-1);
    expect(rearAt(-0.1)).toBe(-1);
  });

  it('keeps the fallback glimpses well apart: a surge is what brings one', () => {
    expect(LEGEND_FIGHT.glimpseGap[0]).toBeGreaterThanOrEqual(10);
    expect(LEGEND_FIGHT.glimpseRest).toBeLessThan(LEGEND_FIGHT.glimpseGap[0]);
  });
});

describe('the legend models', () => {
  // Measured 2026-11-19 after the cut; a model only gets heavier on purpose.
  const BUDGET: Record<string, number> = { kraken: 38_000, dreamer: 25_000 };
  it('stay within their triangle budgets', () => {
    for (const f of seaLegends) {
      expect(triangles(model(f.id)), f.id).toBeLessThanOrEqual(BUDGET[f.id] ?? 15_000);
      expect(triangles(model(f.id, true)), `${f.id} silhouette`).toBeLessThanOrEqual(10_000);
    }
  });

  it('gives the limp builds the same parts and no more triangles', () => {
    const fought = model('kraken'), limp = model('kraken');
    expect(limpGiant(limp)).toBe(true);
    expect(triangles(limp)).toBeLessThanOrEqual(BUDGET.kraken);
    expect(Math.abs(triangles(limp) - triangles(fought))).toBeLessThan(200);
    // The Leviathan's has its jaw slack and its horns laid back: the same count exactly.
    const serpent = model('leviathan');
    const n = triangles(serpent);
    expect(limpGiant(serpent)).toBe(true);
    expect(triangles(serpent)).toBe(n);
    // The Dreamer is laid out as it fought.
    expect(limpGiant(model('dreamer'))).toBe(false);
  });

  /** Every material's colours and finish and every part's vertex colours, the shiny's sparkles left out. */
  function looks(m: FishModel): string[] {
    const out: string[] = [];
    const hex = (c?: THREE.Color) => c?.getHexString() ?? '-';
    m.group.traverse((o) => {
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === m.orbit) return;
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh && !(o as THREE.Sprite).isSprite) return;
      const mat = mesh.material as THREE.MeshPhysicalMaterial;
      const col = mesh.geometry.getAttribute('color');
      let sum = 0;
      if (col) for (let i = 0; i < col.array.length; i++) sum += col.array[i];
      out.push([o.type, mat.type, hex(mat.color), hex(mat.emissive), mat.roughness, mat.metalness, mat.clearcoat, mat.opacity, mat.map?.uuid, mat.emissiveMap?.uuid, sum.toFixed(3)].join(' '));
    });
    return out;
  }

  it('draw a shiny legend in its own colours, its gold sparkles the only mark (the silhouette too)', () => {
    for (const f of seaLegends) {
      const plain = model(f.id), shiny = model(f.id, false, true);
      expect(looks(shiny), f.id).toEqual(looks(plain));
      expect(looks(model(f.id, true, true)), `${f.id} silhouette`).toEqual(looks(model(f.id, true)));
      expect(plain.orbit, f.id).toBeUndefined();
      expect(shiny.orbit?.children.length ?? 0, f.id).toBe(SHINY_LEGEND_SPARKLES ? 10 : 0);
    }
    // Everyday sea fish still turn gold.
    for (const id of ['boneserpent', 'pewtercod']) expect(looks(model(id, false, true)), id).not.toEqual(looks(model(id)));
  });

  it("are made as bright as their light asks, the silhouette left flat", () => {
    for (const [id, legend] of Object.entries(LEGENDS)) {
      const k = legend?.light ?? 1;
      for (const shiny of [false, true]) {
        model(id, false, shiny).group.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (!(o as THREE.Mesh).isMesh || !m?.isMeshStandardMaterial || m.vertexColors !== true) return;
          // Vertex-coloured lit parts are painted white and lifted by the legend's light.
          expect(m.color.r, `${id} ${m.type}`).toBeCloseTo(k, 5);
        });
      }
      model(id, true).group.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
        if ((o as THREE.Mesh).isMesh && m?.color) expect(Math.max(m.color.r, m.color.g, m.color.b), `${id} silhouette`).toBeLessThan(1);
      });
    }
  });
});

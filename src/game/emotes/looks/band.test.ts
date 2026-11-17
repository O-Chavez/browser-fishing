import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { BAR_MS, EIGHTH_MS, INSTRUMENTS, bandNotes, type InstrumentId } from '../../../data/band';
import { defaultLook } from '../../../data/cosmetics';
import { SIT } from '../../../data/emotes';
import { buildInstrument } from '../../instruments';
import { emoteLook } from '../looks';
import { restPose, type EmoteCtx, type EmotePlay, type EmotePose } from '../types';
import { beatAt } from './band';
import { SEAT_TOP } from '../../../data/maps';
import { SIT_LIFT, SIT_SQUASH, sitLift } from './seated';

// The hands' materials glow from a canvas texture at night; a stand-in canvas is enough to build them without a browser.
beforeAll(() => {
  const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
});

/** A bar well into the tune. */
const BAR = 4000;
const ctx = (id: InstrumentId | null, clock: () => number, over: Partial<EmoteCtx> = {}): EmoteCtx => ({
  look: defaultLook(), top: 1.82, reach: 0.28, front: 0.28, face: 0.2, dark: 0, local: true, band: id ? { id, clock } : undefined, ...over,
});
/** The seated look `t` seconds in, and the pose it wrote. */
const at = (play: EmotePlay, t = 3): EmotePose => {
  const pose = restPose();
  play.update(t, 0.016, pose);
  play.group.updateMatrixWorld(true);
  return pose;
};
const meshes = (play: EmotePlay): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  play.group.traverse((o) => void ((o as THREE.Mesh).isMesh && out.push(o as THREE.Mesh)));
  return out;
};
/** The instrument's own meshes (they share its one material) and the hands' (everything else). */
const paint = buildInstrument('jug').group.children[0] as THREE.Mesh;
const isInstrument = (m: THREE.Mesh) => m.material === paint.material;
/** A mesh's vertices in the frame the hands follow: feet at the origin, facing +z, the seated body's lift and lean taken out. */
const points = (play: EmotePlay, ms: THREE.Mesh[]): THREE.Vector3[] => {
  const rig = play.group.children[0];
  const back = new THREE.Matrix4().copy(rig.matrixWorld).invert();
  return ms.flatMap((m) => {
    const pos = m.geometry.getAttribute('position');
    const to = new THREE.Matrix4().multiplyMatrices(back, m.matrixWorld);
    return Array.from({ length: pos.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(to));
  });
};
/** Everything that places the instrument and the hands on the body, and the body's sway: a picture of a frame (the seated body's own breathing left out). */
const picture = (play: EmotePlay, pose: EmotePose): number[] => {
  const out: number[] = [pose.roll, pose.lift, pose.pitch];
  play.group.traverse((o) => void out.push(...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()));
  return out;
};
const sit = emoteLook(SIT.id);

describe('sitting down', () => {
  it('rests the body on its seat, whatever the seat: a log, the seat wall, a bench', () => {
    // A standing body's lowest point is 0.22 m over its feet (the capsule, character.ts).
    for (const [kind, top] of Object.entries(SEAT_TOP)) {
      const play = sit(ctx(null, () => 0, { seatTop: top }));
      const pose = at(play);
      const foot = pose.lift + 0.22 * pose.squash;
      // On the seat: a few centimetres into it, never over it and never deep in it.
      expect(top - foot, kind).toBeGreaterThan(0.01);
      expect(top - foot, kind).toBeLessThan(0.05);
      play.dispose();
    }
    expect(SEAT_TOP.log).toBeCloseTo(0.42, 5);
    expect(sitLift(SEAT_TOP.bench) - sitLift(SEAT_TOP.log)).toBeCloseTo(SEAT_TOP.bench - SEAT_TOP.log, 6);
    // With an instrument the seat is the same height.
    const band = sit(ctx('drum', () => 0, { seatTop: SEAT_TOP.log }));
    expect(at(band).lift).toBeCloseTo(sitLift(SEAT_TOP.log), 5);
    band.dispose();
  });
});

describe('playing in the campfire band', () => {
  it('is the seated look with an instrument and two hands laid over it; on any other seat it is sitting as it was', () => {
    const plain = sit(ctx(null, () => 0));
    expect(meshes(plain)).toHaveLength(0);
    const pose = at(plain);
    expect(pose.lift).toBeCloseTo(SIT_LIFT, 5);
    expect(pose.squash).toBeCloseTo(SIT_SQUASH, 1);
    expect(pose.roll).toBe(0);
    plain.dispose();
    for (const { id } of INSTRUMENTS) {
      const play = sit(ctx(id, () => BAR * BAR_MS));
      const band = at(play);
      const ms = meshes(play);
      expect(ms.filter(isInstrument).length, id).toBe(id === 'squeezebox' ? 3 : 1);
      // Two mittens: a cream hand and its cuff each.
      expect(ms.filter((m) => !isInstrument(m)).length, id).toBe(4);
      // The seat is the same seat: the same lift and lean, within the sway.
      expect(band.lift).toBeCloseTo(pose.lift, 5);
      expect(band.pitch).toBeCloseTo(pose.pitch, 5);
      expect(Math.abs(band.squash - pose.squash)).toBeLessThan(0.03);
      play.dispose();
    }
  });

  it('picks the instrument up as the player settles: nothing in the hands at first, all of it by a second in', () => {
    for (const { id } of INSTRUMENTS) {
      const play = sit(ctx(id, () => BAR * BAR_MS));
      at(play, 0.1);
      const hold = play.group.children[0].children[0];
      expect(hold.scale.x, id).toBe(0);
      at(play, 1);
      expect(hold.scale.x, id).toBe(1);
      play.dispose();
    }
  });

  it('holds every instrument in front of the body: clear of the chest and the head, in reach, over the lap', () => {
    for (const outfit of [{}, { front: 0.38, face: 0.34 }, { front: 0.68, face: 0.46, reach: 0.95 }]) {
      for (const { id } of INSTRUMENTS) {
        let now = BAR * BAR_MS;
        const play = sit(ctx(id, () => now, outfit));
        // The seated body: a capsule 0.28 m in radius between 0.5 and 1.2 m up and a head 0.2 m in radius, squashed and widened.
        const wide = 1 / Math.sqrt(SIT_SQUASH);
        const inBody = (p: THREE.Vector3) => {
          const y = p.y / SIT_SQUASH;
          return Math.hypot(p.x / wide, y - Math.min(1.2, Math.max(0.5, y)), p.z / wide) < 0.28 - 0.015;
        };
        const inHead = (p: THREE.Vector3) => Math.hypot(p.x / wide, (p.y - 1.62 * SIT_SQUASH) / SIT_SQUASH, p.z / wide) < 0.2 - 0.015;
        for (let k = 0; k < 12; k++) {
          now = BAR * BAR_MS + (k * BAR_MS) / 6 + 37;
          at(play);
          const ms = meshes(play);
          const inst = points(play, ms.filter(isInstrument));
          expect(inst.filter(inBody).length, `${id} in the body at ${k}`).toBe(0);
          expect(inst.filter(inHead).length, `${id} in the head at ${k}`).toBe(0);
          // Before the body, not behind it, and no further out than arms would reach.
          const box = new THREE.Box3().setFromPoints(inst);
          expect(box.min.z, id).toBeGreaterThan(0.1);
          expect(box.max.z, id).toBeLessThan(1.05);
          expect(box.min.y, id).toBeGreaterThan(0.12);
          expect(box.max.y, id).toBeLessThan(1.62 * SIT_SQUASH + 0.05);
          expect(Math.max(-box.min.x, box.max.x), id).toBeLessThan(0.8);
          // Each hand is on the instrument: its palm within a hand's width of it.
          const hands = play.group.children[0].children[0].children.filter((o) => o !== play.group.children[0].children[0].children[0]);
          expect(hands).toHaveLength(2);
          for (const h of hands) {
            const palm = points(play, meshes({ group: h } as EmotePlay).slice(0, 1));
            const mid = palm.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(palm.length);
            expect(Math.min(...inst.map((p) => p.distanceTo(mid))), `${id} hand at ${k}`).toBeLessThan(0.2);
          }
        }
        play.dispose();
      }
    }
  });

  it('moves with the part: a different picture through the bar, the same picture for the same moment', () => {
    for (const { id } of INSTRUMENTS) {
      let now = BAR * BAR_MS + 40;
      const a = sit(ctx(id, () => now));
      const b = sit(ctx(id, () => now, { local: false }));
      const first = picture(a, at(a));
      // Another player's copy, started at another time, shows the same hands at the same moment of the clock.
      expect(picture(b, at(b, 7.5))).toEqual(first);
      const seen = new Set<string>([first.map((v) => v.toFixed(4)).join()]);
      for (let k = 1; k < 12; k++) {
        now = BAR * BAR_MS + 40 + (k * BAR_MS) / 12;
        seen.add(picture(a, at(a)).map((v) => v.toFixed(4)).join());
      }
      expect(seen.size, id).toBeGreaterThan(6);
      // Back at the first moment (the clock was set back, as on joining a server): the first picture again.
      now = BAR * BAR_MS + 40;
      expect(picture(a, at(a))).toEqual(first);
      a.dispose();
      b.dispose();
    }
  });

  it('reads the part where the notes are: the last note that began, to the millisecond', () => {
    for (const { id } of INSTRUMENTS) {
      for (let k = 0; k < 400; k++) {
        const now = (BAR + (k % 17)) * BAR_MS + ((k * 7919) % BAR_MS) + 0.5;
        const bar = Math.floor(now / BAR_MS);
        let since = Infinity;
        let vel = 0;
        for (const b of [bar - 1, bar]) {
          for (const n of bandNotes(id, b)) {
            const ago = now - (b * BAR_MS + n.at * EIGHTH_MS);
            if (ago >= 0 && ago < since) {
              since = ago;
              vel = n.vel;
            }
          }
        }
        const beat = beatAt(id, now);
        expect(beat.since, `${id} at ${now}`).toBeCloseTo(since, 3);
        expect(beat.vel, `${id} at ${now}`).toBeCloseTo(vel, 5);
        expect(beat.phase).toBeCloseTo((now - bar * BAR_MS) / BAR_MS, 6);
      }
    }
  });

  it('lands the hands on the notes', () => {
    /** The look's hands (the second and third things in the hold) at a moment of bar `BAR`, in the hold's frame. */
    const hands = (id: InstrumentId, ms: number) => {
      const play = sit(ctx(id, () => BAR * BAR_MS + ms));
      at(play);
      const hold = play.group.children[0].children[0];
      const out = { a: hold.children[1].position.clone(), b: hold.children[2].position.clone(), hold: hold.position.clone(), tilt: hold.rotation.x, inst: hold.children[0] };
      play.dispose();
      return out;
    };
    // The banjo and the washboard: the playing hand is furthest down its stroke just after an eighth, and back up before the next.
    for (const id of ['banjo', 'washboard'] as const) {
      const hand = id === 'banjo' ? 'a' : 'b';
      for (const eighth of [0, 1, 3]) {
        const down = hands(id, eighth * EIGHTH_MS + 65)[hand].y;
        const up = hands(id, (eighth + 1) * EIGHTH_MS - 15)[hand].y;
        expect(up - down, `${id} at eighth ${eighth}`).toBeGreaterThan(0.03);
      }
    }
    // The drum: the right hand is on the skin at the thumps (eighths 0 and 3), the left at the tap on eighth 2.
    const [thump, tap, between] = [hands('drum', 5), hands('drum', 2 * EIGHTH_MS + 5), hands('drum', EIGHTH_MS * 3 - 40)];
    expect(between.a.y - thump.a.y).toBeGreaterThan(0.06);
    expect(between.b.y - tap.b.y).toBeGreaterThan(0.04);
    expect(tap.a.y - thump.a.y).toBeGreaterThan(0.06);
    // The squeezebox: shut as the chord begins, wide open half way through it, and the hands go out with the ends.
    const first = bandNotes('squeezebox', BAR)[0];
    const [shut, wide] = [hands('squeezebox', 5), hands('squeezebox', (first.len * EIGHTH_MS) / 2)];
    const stretch = (h: ReturnType<typeof hands>) => (h.inst.children[0] as THREE.Mesh).scale.x;
    // (`hands` reads the bellows after the play is freed; the stretch is what was last written.)
    expect(stretch(wide)).toBeGreaterThan(0.3);
    expect(Math.abs(wide.a.x - wide.b.x) - Math.abs(shut.a.x - shut.b.x)).toBeGreaterThan(0.15);
    // The jug tips up to the mouth on its note and settles back before the next.
    const [puff, rest] = [hands('jug', 10), hands('jug', 2.8 * EIGHTH_MS)];
    expect(puff.hold.y - rest.hold.y).toBeGreaterThan(0.015);
    expect(rest.tilt - puff.tilt).toBeGreaterThan(0.05);
    // The whistle lifts with the tune: its tilt is not the same on a high note as on a low one.
    const tilts = new Set(Array.from({ length: 12 }, (_, k) => hands('whistle', k * EIGHTH_MS * 0.5 + 100).tilt.toFixed(3)));
    expect(tilts.size).toBeGreaterThan(2);
  });

  it('sways with the bar, to one side on its first beat and the other on its second', () => {
    const roll = (ms: number) => {
      const play = sit(ctx('jug', () => BAR * BAR_MS + ms));
      const pose = at(play);
      play.dispose();
      return pose.roll;
    };
    expect(roll(BAR_MS / 4)).toBeGreaterThan(0.02);
    expect(roll((3 * BAR_MS) / 4)).toBeLessThan(-0.02);
    expect(Math.abs(roll(0))).toBeLessThan(1e-6);
  });

  it('frees its hands when the player gets up and leaves the instrument\'s shared model alone', () => {
    for (const { id } of INSTRUMENTS) {
      const play = sit(ctx(id, () => BAR * BAR_MS));
      at(play);
      const freed: THREE.BufferGeometry[] = [];
      for (const m of meshes(play)) m.geometry.addEventListener('dispose', () => void freed.push(m.geometry));
      const shared = meshes(play).filter(isInstrument).map((m) => m.geometry);
      play.dispose();
      expect(freed).toHaveLength(4);
      for (const g of shared) expect(freed).not.toContain(g);
    }
  });
});

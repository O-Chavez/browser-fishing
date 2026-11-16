import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { defaultLook } from '../../../data/cosmetics';
import { emoteById } from '../../../data/emotes';
import { glowTexture } from '../kit';
import { EMOTE_LOOKS } from '../looks';
import { restPose, type EmoteCamera, type EmoteCtx, type EmoteLook, type EmotePlay, type EmotePose } from '../types';
import { ABYSS_CAMERA, ABYSS_SECONDS, abyss } from './abyss';
import { toyHull } from './pelican';
import { KELP_SECONDS, kelp } from './kelp';
import { MASTER_CAMERA, MASTER_SECONDS, master } from './master';
import { NICE_SECONDS, nice } from './nice';
import { NO_SECONDS, no } from './no';
import { TWILIGHT_SECONDS, twilight } from './twilight';
import { WAVE_SECONDS, wave } from './wave';
import { YES_SECONDS, yes } from './yes';

// The looks draw a soft glow (and Master its whirlpool) on a canvas; a stand-in that takes any drawing call is enough
// to build them without a browser.
beforeAll(() => {
  const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
});

const ctx = (over: Partial<EmoteCtx> = {}): EmoteCtx => ({ look: defaultLook(), top: 2.3, reach: 0.5, dark: 0, local: true, ...over });
const meshes = (play: EmotePlay): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  play.group.traverse((o) => void ((o as THREE.Mesh).isMesh && out.push(o as THREE.Mesh)));
  return out;
};
const triangles = (play: EmotePlay): number =>
  meshes(play).reduce((n, m) => n + ((m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3) * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1), 0);
/** Whether `o` is drawn: it and every parent up to the play's group visible. */
const shows = (o: THREE.Object3D): boolean => {
  for (let q: THREE.Object3D | null = o; q; q = q.parent) if (!q.visible) return false;
  return true;
};
/**
 * Everything a frame draws: the pose, where each object that shows is, and each showing mesh's moving buffers. What's
 * hidden doesn't count (a hidden spray keeps the last place it was written), nor does where a glow of no size was left.
 */
const picture = (play: EmotePlay, pose: EmotePose): number[] => {
  const out: number[] = Object.values(pose);
  play.group.traverse((o) => void (shows(o) ? out.push(...o.position.toArray(), o.rotation.x, o.rotation.y, o.rotation.z, ...o.scale.toArray(), 1) : out.push(0)));
  for (const m of meshes(play)) {
    if (!shows(m)) continue;
    const size = m.geometry.attributes.size?.array as Float32Array | undefined;
    for (const [name, a] of Object.entries(m.geometry.attributes)) {
      if ((a as THREE.BufferAttribute).usage !== THREE.DynamicDrawUsage) continue;
      const arr = a.array as Float32Array;
      if (size && name === 'position') for (let i = 0; i < size.length; i++) out.push(...(size[i] > 0 ? arr.subarray(i * 3, i * 3 + 3) : [0, 0, 0]));
      else out.push(...arr);
    }
    if ((m as THREE.InstancedMesh).isInstancedMesh) out.push(...(m as THREE.InstancedMesh).instanceMatrix.array);
    const mat = m.material as THREE.Material;
    if (mat.transparent) out.push(mat.opacity);
  }
  return out;
};
const at = (play: EmotePlay, t: number): EmotePose => {
  const pose = restPose();
  play.update(t, 1 / 60, pose);
  return pose;
};

/** Each picked look: its id, look, length, camera, the camera's distance if it has its own, its meshes at most and its triangles. */
const PICKED: [string, EmoteLook, number, EmoteCamera, number | undefined, number, number][] = [
  ['wave', wave, WAVE_SECONDS, 'behind', undefined, 8, 230],
  ['nice', nice, NICE_SECONDS, 'behind', undefined, 8, 530],
  ['yes', yes, YES_SECONDS, 'behind', undefined, 8, 440],
  ['no', no, NO_SECONDS, 'behind', undefined, 8, 420],
  ['kelp', kelp, KELP_SECONDS, 'cinematic', undefined, 8, 9500],
  ['twilight', twilight, TWILIGHT_SECONDS, 'cinematic', undefined, 8, 6700],
  // The heaviest: 37 meshes and 3 glows (the lab's 40 objects), each part of it one draw.
  ['master', master, MASTER_SECONDS, 'cinematic', MASTER_CAMERA, 37, 15700],
  // The most work a frame: the legends' spines recomputed and kept out of the boat. 33 meshes and 10 glows.
  ['abyss', abyss, ABYSS_SECONDS, 'cinematic', ABYSS_CAMERA, 33, 16100],
];

describe.each(PICKED)('the %s look', (id, look, seconds, camera, cameraDistance, draws, tris) => {
  it('is the one the emote plays, for the length, in the camera and at the distance the catalog gives it', () => {
    expect(EMOTE_LOOKS[id]).toBe(look);
    expect(emoteById(id)).toMatchObject({ seconds, camera });
    expect(emoteById(id)?.cameraDistance).toBe(cameraDistance);
  });

  it('plays its whole length without a wobble in the numbers, by day and at night, bare or in a wide outfit', () => {
    for (const c of [ctx(), ctx({ dark: 1 }), ctx({ top: 1.82, reach: 0.28, local: false }), ctx({ top: 3.1, reach: 1.2, dark: 0.4 })]) {
      const play = look(c);
      for (let t = 0; t < seconds; t += 1 / 30) {
        const frame = picture(play, at(play, t));
        expect(frame.every(Number.isFinite), `t = ${t.toFixed(2)}`).toBe(true);
      }
      play.dispose();
    }
  });

  it('starts and ends with the body at rest and nothing of its own showing', () => {
    const play = look(ctx());
    for (const t of [0, seconds - 1e-3]) {
      const pose = at(play, t);
      for (const [k, v] of Object.entries(restPose())) expect(pose[k as keyof EmotePose], `${k} at ${t}`).toBeCloseTo(v, 2);
      // Every see-through pool is faded out; the rest is scaled away to nothing or hidden.
      for (const m of meshes(play)) {
        const mat = m.material as THREE.MeshBasicMaterial;
        if (mat.isMeshBasicMaterial && mat.map) expect(mat.opacity, `pool at ${t}`).toBeLessThan(0.01);
      }
    }
    // Mid-way it moves the body and shows something.
    const mid = at(play, seconds * 0.6);
    expect(Math.max(...Object.entries(restPose()).map(([k, v]) => Math.abs(mid[k as keyof EmotePose] - v)))).toBeGreaterThan(0.02);
    expect(picture(play, mid).some((v) => Math.abs(v) > 0.5)).toBe(true);
    play.dispose();
  });

  it('draws the same picture at a moment however it got there, so every screen shows the same', () => {
    const stepped = look(ctx());
    const when = Math.min(5.7, seconds * 0.6);
    let pose = restPose();
    for (let t = 0; t <= when + 1e-9; t += 0.05) pose = at(stepped, Math.min(t, when));
    pose = at(stepped, when);
    const a = picture(stepped, pose);
    // Another play jumps straight there, after a look at the end.
    const jumped = look(ctx());
    at(jumped, seconds - 0.2);
    const b = picture(jumped, at(jumped, when));
    expect(b.length).toBe(a.length);
    let worst = 0;
    for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
    expect(worst).toBeLessThan(1e-6);
    stepped.dispose();
    jumped.dispose();
  });

  it('stays a handful of draws and within its triangles', () => {
    const play = look(ctx());
    expect(meshes(play).length).toBeLessThanOrEqual(draws);
    expect(triangles(play)).toBeGreaterThan(tris * 0.9);
    expect(triangles(play)).toBeLessThan(tris * 1.1);
    // No lights (a new light recompiles every material in the scene) and no shadows.
    play.group.traverse((o) => {
      expect((o as THREE.Light).isLight).toBeFalsy();
      expect(o.castShadow).toBe(false);
    });
    play.dispose();
  });

  it('frees every geometry and instanced buffer it made, and leaves the shared glow texture and its materials', () => {
    const play = look(ctx());
    const parent = new THREE.Group();
    parent.add(play.group);
    at(play, 3);
    const freed = new Set<object>();
    const all = meshes(play);
    for (const m of all) {
      m.geometry.addEventListener('dispose', () => freed.add(m.geometry));
      if ((m as THREE.InstancedMesh).isInstancedMesh) m.addEventListener('dispose' as never, () => freed.add(m));
      for (const mat of [m.material].flat()) mat.addEventListener('dispose', () => freed.add(mat));
    }
    let glowFreed = false;
    glowTexture().addEventListener('dispose', () => (glowFreed = true));
    play.dispose();
    for (const m of all) {
      expect(freed.has(m.geometry)).toBe(true);
      if ((m as THREE.InstancedMesh).isInstancedMesh) expect(freed.has(m)).toBe(true);
      for (const mat of [m.material].flat()) expect(freed.has(mat)).toBe(false);
    }
    expect(glowFreed).toBe(false);
    expect(play.group.parent).toBeNull();
  });
});

/** Where each of a play's meshes is in the character's space, and how big it shows (0 hidden). Instanced meshes place their copies themselves. */
const shown = (play: EmotePlay): { y: number; x: number; size: number }[] => {
  play.group.updateMatrixWorld(true);
  const out: { y: number; x: number; size: number }[] = [];
  const p = new THREE.Vector3();
  play.group.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh || (o as THREE.InstancedMesh).isInstancedMesh) return;
    let vis = true;
    for (let q: THREE.Object3D | null = o; q; q = q.parent) vis &&= q.visible;
    p.setFromMatrixPosition(o.matrixWorld);
    out.push({ x: p.x, y: p.y, size: vis ? o.matrixWorld.getMaxScaleOnAxis() : 0 });
  });
  return out;
};

describe('the base four', () => {
  const BASE: [string, EmoteLook, number][] = [
    ['wave', wave, WAVE_SECONDS],
    ['nice', nice, NICE_SECONDS],
    ['yes', yes, YES_SECONDS],
    ['no', no, NO_SECONDS],
  ];

  it.each(BASE)('%s: the hands pop in from nothing and shrink away by the end, and show mid-way', (_id, look, seconds) => {
    const play = look(ctx());
    for (const t of [0, seconds - 1e-3]) {
      at(play, t);
      for (const m of shown(play)) expect(m.size, `at ${t}`).toBeLessThan(0.01);
    }
    at(play, seconds * 0.6);
    expect(Math.max(...shown(play).map((m) => m.size))).toBeGreaterThan(1);
    play.dispose();
  });

  it.each(BASE)('%s: the hands stay beside the head or over the top of a wide, tall outfit', (_id, look, seconds) => {
    // Bare, and in a wide outfit with a tall hat: the hands move out with the outfit's reach, or up with its top.
    const bare = look(ctx({ top: 1.82, reach: 0.28 }));
    const big = look(ctx({ top: 2.9, reach: 0.9 }));
    const moved = (t: number): number => {
      at(bare, t);
      at(big, t);
      const a = shown(bare).filter((m) => m.size > 0.5);
      const b = shown(big).filter((m) => m.size > 0.5);
      return Math.min(...a.map((m, i) => Math.max(Math.abs(b[i].x) - Math.abs(m.x), b[i].y - m.y)));
    };
    expect(moved(seconds * 0.45)).toBeGreaterThan(0.5);
    bare.dispose();
    big.dispose();
  });

  it("tells a name tag to clear Nice's mittens while they clap over the head; the hands beside the head leave it be", () => {
    for (const top of [1.82, 2.9]) {
      const play = nice(ctx({ top }));
      at(play, 0.98);
      // The mittens' fingertips, a little over their highest mesh's origin (the wrist).
      const wrists = Math.max(...shown(play).filter((m) => m.size > 0.5).map((m) => m.y));
      expect(play.over).toBeGreaterThan(wrists + 0.3);
      expect(play.over).toBeLessThan(wrists + 0.45);
      at(play, NICE_SECONDS - 1e-3);
      expect(play.over).toBe(0);
      play.dispose();
    }
    for (const look of [wave, yes, no]) {
      const play = look(ctx());
      at(play, 1);
      expect(play.over ?? 0).toBe(0);
      play.dispose();
    }
  });
});

describe('the picked looks together', () => {
  it('keeps the kelp clear of a wide outfit and the oarfish over a tall hat', () => {
    // The kelp stands further out round a wide cape, and the oarfish coils higher over a tall crown.
    const reachOf = (play: EmotePlay): number => {
      let r = 0;
      const pos = meshes(play)[1].geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) r = Math.max(r, Math.hypot(pos.getX(i), pos.getZ(i)));
      return r;
    };
    const slim = kelp(ctx({ reach: 0.3 }));
    const wide = kelp(ctx({ reach: 1.1 }));
    at(slim, 4);
    at(wide, 4);
    expect(reachOf(wide)).toBeGreaterThan(reachOf(slim) + 0.5);
    const topOf = (play: EmotePlay): number => {
      let y = 0;
      const pos = meshes(play)[2].geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) y = Math.max(y, pos.getY(i));
      return y;
    };
    const low = twilight(ctx({ top: 1.9 }));
    const tall = twilight(ctx({ top: 3 }));
    at(low, 6);
    at(tall, 6);
    expect(topOf(tall)).toBeGreaterThan(topOf(low) + 0.6);
    for (const p of [slim, wide, low, tall]) p.dispose();
  });
});

describe('the deep sea looks move smoothly', () => {
  it("rides Master's jellies smoothly up the coil, never stepping from station to station", () => {
    const play = master(ctx());
    const jellies: THREE.Object3D[] = [];
    play.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (m.material as THREE.Material).forceSinglePass) jellies.push(o.parent!);
    });
    expect(jellies).toHaveLength(8);
    const P = new THREE.Vector3();
    let last: THREE.Vector3[] | null = null;
    let worst = 0;
    for (let t = 3.2; t < 8.6; t += 1 / 60) {
      at(play, t);
      const now = jellies.map((j) => j.getWorldPosition(P).clone());
      if (last) for (let i = 0; i < now.length; i++) if (jellies[i].visible) worst = Math.max(worst, now[i].distanceTo(last[i]));
      last = now;
    }
    // About 2 cm a frame at most (the coil turning under them); one station of the coil is about 15 cm.
    expect(worst).toBeLessThan(0.035);
    play.dispose();
  });

  it("rocks the Abyss's toy boat a third less than the design round's, on the same swell, with the Kraken's arms still clear of her", () => {
    const play = abyss(ctx());
    at(play, 2);
    // Her deck: the group the look turns in pitch and roll, with the Pelican on it.
    let deck: THREE.Object3D | null = null;
    play.group.traverse((o) => void (!deck && (o as THREE.Group).isGroup && o.rotation.order === 'YXZ' && o.children.length >= 2 && (deck = o)));
    const d = deck! as THREE.Object3D;
    const hull = toyHull(d.children[0].scale.x);
    const arms = meshes(play).find((m) => m.geometry.attributes.position.count === 8 * 19 * 6)!;
    const inv = new THREE.Matrix4();
    const P = new THREE.Vector3();
    const most = { pitch: 0, roll: 0, low: Infinity, high: 0 };
    const inside = { wheelhouse: 0, mast: 0, player: 0 };
    for (let t = 0; t < ABYSS_SECONDS; t += 1 / 60) {
      const pose = at(play, t);
      // While she rides (she surfaces by 1.1 s and sinks from 8.4 s).
      if (t > 1.3 && t < 8.3) {
        most.pitch = Math.max(most.pitch, Math.abs(d.rotation.x));
        most.roll = Math.max(most.roll, Math.abs(d.rotation.z));
        most.low = Math.min(most.low, d.position.y);
        most.high = Math.max(most.high, d.position.y);
        // The player stands on her deck: lifted with it (and a little more when they jump at a strike).
        expect(pose.lift).toBeGreaterThanOrEqual(d.position.y - 1e-9);
        expect(pose.lift).toBeLessThan(d.position.y + 0.15);
      }
      // The arms' points in her own frame: none inside the wheelhouse, the mast or the player.
      play.group.updateMatrixWorld(true);
      inv.copy(d.matrixWorld).invert();
      const pos = arms.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        P.fromBufferAttribute(pos, i);
        if (P.x === 0 && P.y === 0 && P.z === 0) continue;
        P.applyMatrix4(arms.matrixWorld).applyMatrix4(inv);
        if (Math.abs(P.x) < 0.29 && P.y > 0.03 && P.y < 0.81 && P.z > 0.71 && P.z < 1.29) inside.wheelhouse++;
        if (Math.abs(P.x) < 0.05 && P.y > 0.7 && P.y < 1.39 && P.z > 0.87 && P.z < 0.95) inside.mast++;
        if (Math.hypot(P.x, P.z) < 0.3 && P.y > 0 && P.y < 1.9) inside.player++;
      }
    }
    // The design round's F6 pitched up to 0.319 and rolled up to 0.528 radians (18 and 30 degrees); Oscar asked for
    // about a third less (2026-11-16): 0.208 and 0.344 (12 and 20 degrees), 0.65 of it.
    expect(most.pitch).toBeCloseTo(0.208, 2);
    expect(most.roll).toBeCloseTo(0.344, 2);
    expect(most.pitch / 0.319).toBeCloseTo(0.65, 1);
    expect(most.roll / 0.528).toBeCloseTo(0.65, 1);
    // Her heave is the design's: the deck rides between 0.39 and 0.61 m up.
    expect(most.low).toBeCloseTo(0.389, 2);
    expect(most.high).toBeCloseTo(0.611, 2);
    // Of some half a million arm points over the emote, the design had 42 just inside the wheelhouse's wall; the
    // gentler boat has 8. None in the mast or the player, as before.
    expect(inside.wheelhouse).toBeLessThanOrEqual(8);
    expect(inside).toMatchObject({ mast: 0, player: 0 });
    play.dispose();
  });

  it("keeps the Kraken's arms moving continuously, with no frame where a point jumps", () => {
    const play = abyss(ctx());
    // The arms: eight tubes of 19 stations and 6 sides.
    const arms = meshes(play).find((m) => m.geometry.attributes.position.count === 8 * 19 * 6)!;
    expect(arms).toBeDefined();
    const pos = arms.geometry.attributes.position.array as Float32Array;
    let last: Float32Array | null = null;
    const steps: number[] = [];
    for (let t = 1.9; t < 7.8; t += 1 / 60) {
      at(play, t);
      if (last) {
        let m = 0;
        for (let i = 0; i < pos.length; i += 3) {
          // Only where the arm is drawn (a hidden arm's points all sit at zero).
          if (last[i] === 0 && last[i + 1] === 0 && last[i + 2] === 0) continue;
          m = Math.max(m, Math.hypot(pos[i] - last[i], pos[i + 1] - last[i + 1], pos[i + 2] - last[i + 2]));
        }
        steps.push(m);
      }
      last = Float32Array.from(pos);
    }
    // The arms that whip the sea move a tip up to about 36 cm a frame at the bottom of the whip, rising and falling
    // over some 15 frames; a glitch would be one frame far past both its neighbours.
    expect(Math.max(...steps)).toBeLessThan(0.45);
    for (let i = 1; i < steps.length - 1; i++) expect(steps[i], `frame ${i}`).toBeLessThan(2.5 * Math.max(steps[i - 1], steps[i + 1]) + 0.03);
    play.dispose();
  });
});

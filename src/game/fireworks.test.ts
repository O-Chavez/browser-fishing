import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PARTICLE_BUDGET, emitShow, rocketShow, showSounds, type RocketId } from '../data/rockets';
import { MAPS } from '../data/maps';
import { Fireworks } from './fireworks';
import { ShowBus, ShowSounds, crackleCurve } from './rocketsound';

const KINDS: RocketId[] = ['small', 'big', 'finale'];
const attrs = (fw: Fireworks) => ['aP0', 'aV', 'aT', 'aC', 'aS'].map((n) => fw.mesh.geometry.getAttribute(n) as THREE.InstancedBufferAttribute);

describe('the fireworks in the sky', () => {
  it('are one draw of glows: a single mesh with one material, and no light of any kind', () => {
    const fw = new Fireworks();
    const all: THREE.Object3D[] = [];
    fw.mesh.traverse((o) => void all.push(o));
    expect(all).toEqual([fw.mesh]);
    expect(all.some((o) => (o as THREE.Light).isLight)).toBe(false);
    expect(Array.isArray(fw.mesh.material)).toBe(false);
    expect(fw.mesh.material.depthWrite).toBe(false);
    expect(fw.mesh.castShadow).toBe(false);
    // Nothing a player could walk into: it carries no solids, and the map's props are not its business.
    expect('solids' in fw || 'colliders' in fw).toBe(false);
    expect(MAPS[0].camp).toBeDefined();
  });

  it('keep one set of buffers, sized to the budget, for every rocket', () => {
    const fw = new Fireworks();
    const before = attrs(fw).map((a) => a.array);
    expect(before.map((a) => a.length)).toEqual([3, 3, 4, 4, 3].map((n) => n * PARTICLE_BUDGET));
    for (const kind of KINDS) {
      for (let seed = 1; seed < 8; seed++) {
        fw.launch({ kind, seed, at: 0 });
        expect(fw.particles).toBe(emitShow(rocketShow(kind, seed), () => {}));
        expect(fw.mesh.geometry.instanceCount).toBe(fw.particles);
        expect(fw.particles).toBeLessThan(PARTICLE_BUDGET);
      }
    }
    attrs(fw).forEach((a, i) => expect(a.array).toBe(before[i]));
  });

  it('start hidden with every particle off the screen, so the map can draw them once to warm up', () => {
    const fw = new Fireworks();
    expect(fw.mesh.visible).toBe(false);
    expect(fw.mesh.geometry.instanceCount).toBe(PARTICLE_BUDGET);
    expect(attrs(fw).every((a) => (a.array as Float32Array).every((v) => v === 0))).toBe(true);
    expect(fw.elapsed).toBeNull();
  });

  it('do nothing while the sky is clear', () => {
    const fw = new Fireworks();
    const u = fw.mesh.material.uniforms;
    fw.update(123_456, 1);
    expect(fw.mesh.visible).toBe(false);
    expect([u.uTime.value, u.uSolid.value]).toEqual([0, 0]);
  });

  it('follow the shared clock from the moment the rocket was lit, and clear the sky when its show is over', () => {
    const fw = new Fireworks();
    fw.launch({ kind: 'big', seed: 9, at: 50_000 });
    expect(fw.mesh.visible).toBe(true);
    fw.update(51_500, 1);
    expect(fw.elapsed).toBeCloseTo(1.5);
    expect(fw.mesh.material.uniforms.uSolid.value).toBe(0);
    fw.update(54_990, 0);
    expect(fw.elapsed).toBeCloseTo(4.99);
    // By day the sparks are drawn solid.
    expect(fw.mesh.material.uniforms.uSolid.value).toBeGreaterThan(0.9);
    fw.update(55_000, 0);
    expect(fw.mesh.visible).toBe(false);
    expect(fw.elapsed).toBeNull();
  });

  it('draw the same sky from the same seed, wherever in the show a player comes in', () => {
    const a = new Fireworks(), b = new Fireworks();
    b.launch({ kind: 'small', seed: 1, at: 0 });
    for (const kind of KINDS) {
      a.launch({ kind, seed: 77, at: 1000 });
      // The second player arrives four seconds in: the same particles, their clock already running.
      b.launch({ kind, seed: 77, at: 1000 });
      const n = a.particles;
      attrs(a).forEach((at, i) => { const [x, y] = [at.array as Float32Array, attrs(b)[i].array as Float32Array]; let same = true; for (let k = 0; k < n * at.itemSize; k++) if (x[k] !== y[k]) same = false; expect(same).toBe(true); });
      a.update(2000, 1);
      b.update(5000, 1);
      expect(a.elapsed).toBeCloseTo(1);
      expect(b.elapsed === null ? kind : b.elapsed).toBe(kind === 'small' ? 'small' : 4);
    }
    a.launch({ kind: 'finale', seed: 78, at: 0 });
    expect(Array.from(attrs(a)[0].array as Float32Array).slice(0, 600)).not.toEqual(Array.from(attrs(b)[0].array as Float32Array).slice(0, 600));
  });
});

describe("the fireworks' sounds as a show runs", () => {
  it('play each sound once, a little before it is due', () => {
    const show = rocketShow('finale', 5);
    const due = showSounds(show);
    const sounds = new ShowSounds(show);
    const played: [string, number][] = [];
    for (let t = 0; t < 12; t += 1 / 30) sounds.tick(t, { x: 0, y: 2, z: 0 }, (s, _ear, wait) => { played.push([s.kind, wait]); return 0.5; });
    expect(played.map((p) => p[0])).toEqual(due.map((s) => s.kind));
    expect(sounds.played).toBe(due.length);
    for (const [, wait] of played) expect(wait >= -0.6 && wait <= 0.21).toBe(true);
  });

  it('leave out what has already sounded for a player who arrives part way through', () => {
    const show = rocketShow('finale', 5);
    const sounds = new ShowSounds(show);
    let n = 0;
    for (let t = 6; t < 12; t += 1 / 30) sounds.tick(t, { x: 0, y: 2, z: 0 }, () => { n++; return 1; });
    expect(n).toBe(showSounds(show).filter((s) => s.t >= 5.4).length);
    expect(n).toBeLessThan(showSounds(show).length);
  });
});

describe("the fireworks' sound nodes", () => {
  it('write a crackle as one curve of pops: the same from the same seed, never over its level, silent at its end', () => {
    const a = crackleCurve(1507, 1.2, 0.1);
    expect(Array.from(a)).toEqual(Array.from(crackleCurve(1507, 1.2, 0.1)));
    expect(Array.from(a)).not.toEqual(Array.from(crackleCurve(1508, 1.2, 0.1)));
    expect(a.length).toBe(2400);
    expect(Math.max(...a)).toBeLessThanOrEqual(0.1);
    expect(Math.max(...a)).toBeGreaterThan(0.06);
    expect(a.at(-1)).toBe(0);
    // Pops, not a wash: most of it is near silence.
    expect(a.filter((v) => v < 0.005).length).toBeGreaterThan(a.length / 2);
    let pops = 0;
    for (let i = 1; i < a.length; i++) if (a[i] > 0.02 && a[i - 1] <= 0.02) pops++;
    expect(pops).toBeGreaterThan(15);
  });

  it('cut a show off when the player leaves its map, and give the next show a fresh gain', () => {
    const made: { to: unknown; target: number | null; cancelled: boolean }[] = [];
    const ctx = {
      currentTime: 5,
      createGain: () => {
        const g = { to: null as unknown, target: null as number | null, cancelled: false };
        made.push(g);
        return { connect: (n: unknown) => (g.to = n), gain: { cancelScheduledValues: () => (g.cancelled = true), setTargetAtTime: (v: number) => (g.target = v) } };
      },
    } as unknown as BaseAudioContext;
    const master = {} as AudioNode;
    const bus = new ShowBus(ctx, master);
    bus.cut();
    expect(made).toHaveLength(0);
    const first = bus.node;
    expect(bus.node).toBe(first);
    expect(made).toEqual([{ to: master, target: null, cancelled: false }]);
    // Into the casino mid-show: what was sounding fades at once.
    bus.cut();
    expect(made[0]).toMatchObject({ target: 0, cancelled: true });
    expect(bus.node).not.toBe(first);
    expect(made[1]).toEqual({ to: master, target: null, cancelled: false });
  });
});

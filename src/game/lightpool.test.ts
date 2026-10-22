import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LIGHT_FADE, LightPool } from './lightpool';

/** Twelve lights in a row along x, each under its own group (like a lamp post). */
function row(): { root: THREE.Group; lights: THREE.PointLight[] } {
  const root = new THREE.Group();
  const lights = Array.from({ length: 12 }, (_, i) => {
    const post = new THREE.Group();
    post.position.x = i * 5;
    const l = new THREE.PointLight(0xffffff, 8, 12);
    post.add(l);
    root.add(post);
    return l;
  });
  return { root, lights };
}
const on = (lights: THREE.PointLight[]) => lights.filter((l) => l.visible).length;
/** Runs the pool for `seconds` at 60 fps; the owner re-sets intensity every frame, like the game. */
function run(pool: LightPool, lights: THREE.PointLight[], eye: THREE.Vector3, seconds: number, each?: () => void): void {
  for (let f = 0; f < seconds * 60; f++) {
    for (const l of lights) l.intensity = 8;
    pool.update(1 / 60, eye);
    each?.();
  }
}

describe('LightPool', () => {
  it('starts with the nearest lights fully on', () => {
    const { root, lights } = row();
    const pool = new LightPool(8);
    pool.collect(root);
    expect(lights.map((l) => l.visible)).toEqual([...Array(8).fill(true), ...Array(4).fill(false)]);
    expect(lights[0].intensity).toBe(8);
    expect(lights[0].userData.lit).toBe(1);
  });

  it('fades lights in and out while keeping exactly 8 on', () => {
    const { root, lights } = row();
    const pool = new LightPool(8);
    pool.collect(root);
    const eye = new THREE.Vector3(55, 0, 0);
    let rose = false;
    run(pool, lights, eye, 3 * LIGHT_FADE + 0.5, () => {
      expect(on(lights)).toBe(8);
      const lit = lights[11].userData.lit as number;
      if (lit > 0 && lit < 1) rose = true;
    });
    expect(rose).toBe(true);
    expect(lights.map((l) => l.visible)).toEqual([...Array(4).fill(false), ...Array(8).fill(true)]);
    expect(lights[11].intensity).toBe(8);
    expect(lights[0].intensity).toBe(0);
  });

  it('scales whatever intensity the owner sets', () => {
    const { root, lights } = row();
    const pool = new LightPool(8);
    pool.collect(root);
    lights[0].intensity = 3;
    pool.update(1 / 60, new THREE.Vector3());
    expect(lights[0].intensity).toBe(3);
  });

  it('frees a hidden light’s slot at once', () => {
    const { root, lights } = row();
    const pool = new LightPool(8);
    pool.collect(root);
    lights[0].parent!.visible = false;
    pool.update(0.3, new THREE.Vector3());
    expect(lights[0].visible).toBe(false);
    expect(lights[8].visible).toBe(true);
    expect(on(lights)).toBe(8);
  });
});

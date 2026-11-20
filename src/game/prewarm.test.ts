import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { revealAll, SHOWN, Warmups } from './prewarm';

describe('revealAll', () => {
  const build = () => {
    const scene = new THREE.Scene();
    const hidden = new THREE.Group();
    hidden.visible = false;
    const mesh = new THREE.Mesh();
    const hiddenMesh = new THREE.Mesh();
    hiddenMesh.visible = false;
    // A lamp in a hidden group: switched on, but it never lights anything.
    const lampInHidden = new THREE.PointLight();
    hidden.add(mesh, lampInHidden);
    const on = new THREE.PointLight();
    const off = new THREE.PointLight();
    off.visible = false;
    scene.add(hidden, hiddenMesh, on, off);
    return { scene, hidden, mesh, hiddenMesh, lampInHidden, on, off };
  };

  it('shows every object and turns culling off', () => {
    const { scene, hidden, mesh, hiddenMesh } = build();
    revealAll(scene);
    for (const o of [hidden, mesh, hiddenMesh]) {
      expect(o.visible).toBe(true);
      expect(o.frustumCulled).toBe(false);
    }
  });

  it('keeps the same lights on, counting a hidden parent as off', () => {
    const { scene, lampInHidden, on, off } = build();
    revealAll(scene);
    expect(on.visible).toBe(true);
    expect(off.visible).toBe(false);
    expect(lampInHidden.visible).toBe(false);
    const lights: THREE.Object3D[] = [];
    scene.traverseVisible((o) => (o as THREE.Light).isLight && lights.push(o));
    expect(lights).toEqual([on]);
  });

  it('puts everything back', () => {
    const { scene, hidden, mesh, hiddenMesh, lampInHidden, on, off } = build();
    mesh.frustumCulled = false;
    revealAll(scene)();
    expect([hidden, mesh, hiddenMesh, lampInHidden, on, off].map((o) => o.visible)).toEqual([false, true, false, true, true, false]);
    expect(mesh.frustumCulled).toBe(false);
    expect(hidden.frustumCulled).toBe(true);
  });
});

describe('Warmups', () => {
  /** A warm-up whose compiles finish when the test says so; `fresh` is how many programs the next compile makes. */
  const setup = () => {
    const finish: (() => void)[] = [];
    const state = { programs: 3, fresh: 0 };
    const warmups = new Warmups(
      () => {
        state.programs += state.fresh;
        return new Promise<void>((res) => finish.push(res));
      },
      () => state.programs,
    );
    const scene = new THREE.Scene();
    const add = () => {
      const o = new THREE.Group();
      scene.add(o);
      return o;
    };
    /** Finishes every compile started so far and lets their callbacks run. */
    const compiled = async () => {
      for (const f of finish.splice(0)) f();
      await Promise.resolve();
      await Promise.resolve();
    };
    return { warmups, state, add, compiled };
  };

  it('keeps a model with new programs hidden until they are compiled and it has been drawn once', async () => {
    const { warmups, state, add, compiled } = setup();
    const fish = add();
    state.fresh = 2;
    warmups.show(fish);
    expect(fish.visible).toBe(false);
    expect(warmups.isWarm(fish)).toBe(false);
    expect(warmups.idle).toBe(false);
    expect(warmups.due).toEqual([]);
    await compiled();
    // Compiled, but not shown before its one-pixel draw.
    expect(fish.visible).toBe(false);
    expect(warmups.due).toEqual([fish]);
    expect(warmups.idle).toBe(false);
    warmups.drawn();
    expect(fish.visible).toBe(true);
    expect(warmups.isWarm(fish)).toBe(true);
    expect(warmups.due).toEqual([]);
    expect(warmups.idle).toBe(true);
  });

  it('shows a model whose programs were already there without a draw', async () => {
    const { warmups, add, compiled } = setup();
    const fish = add();
    warmups.show(fish);
    expect(fish.visible).toBe(false);
    await compiled();
    expect(warmups.due).toEqual([]);
    expect(fish.visible).toBe(true);
    expect(warmups.isWarm(fish)).toBe(true);
    expect(warmups.idle).toBe(true);
  });

  it('leaves a ready model hidden while its owner says not yet', async () => {
    const { warmups, add, compiled } = setup();
    const fish = add();
    let hooked = false;
    warmups.show(fish, () => hooked);
    await compiled();
    expect(warmups.isWarm(fish)).toBe(true);
    expect(fish.visible).toBe(false);
    // A slow compile that ends after the hook shows it there and then.
    const late = add();
    warmups.show(late, () => hooked);
    hooked = true;
    await compiled();
    expect(late.visible).toBe(true);
  });

  it('draws nothing for a model taken out of the scene while it compiled', async () => {
    const { warmups, state, add, compiled } = setup();
    const fish = add();
    state.fresh = 1;
    warmups.show(fish);
    fish.removeFromParent();
    await compiled();
    expect(warmups.due).toEqual([]);
    expect(warmups.idle).toBe(true);
  });

  it('shows the model even when the compile fails', async () => {
    const warmups = new Warmups(() => Promise.reject(new Error('lost context')), () => 0);
    const fish = new THREE.Group();
    warmups.show(fish);
    await Promise.resolve();
    await Promise.resolve();
    expect(fish.visible).toBe(true);
    expect(warmups.idle).toBe(true);
  });

  it('always draws a hidden stand-in once, and leaves it hidden', async () => {
    const { warmups, add, compiled } = setup();
    const standIn = add();
    standIn.visible = false;
    warmups.warm(standIn);
    expect(warmups.idle).toBe(false);
    await compiled();
    expect(warmups.due).toEqual([standIn]);
    warmups.drawn();
    expect(standIn.visible).toBe(false);
    expect(warmups.idle).toBe(true);
  });

  it('SHOWN leaves everything in sight', () => {
    const fish = new THREE.Group();
    SHOWN.show(fish);
    expect(fish.visible).toBe(true);
    expect(SHOWN.isWarm(fish)).toBe(true);
  });
});

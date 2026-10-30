import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { revealAll } from './prewarm';

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

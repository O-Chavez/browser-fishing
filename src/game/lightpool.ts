import * as THREE from 'three';

/**
 * Every point light adds work to every lit fragment, even at zero intensity. Keep only the
 * `max` lights nearest the camera switched on; the count stays constant so shaders never recompile.
 */
export class LightPool {
  private lights: { l: THREE.PointLight; p: THREE.Vector3 }[] = [];
  private timer = 0;

  constructor(private max = 8) {}

  collect(root: THREE.Object3D): void {
    root.updateMatrixWorld(true);
    this.lights = [];
    root.traverse((o) => {
      const l = o as THREE.PointLight;
      if (l.isPointLight) this.lights.push({ l, p: l.getWorldPosition(new THREE.Vector3()) });
    });
    this.timer = 0;
    this.update(0, new THREE.Vector3());
  }

  update(dt: number, eye: THREE.Vector3): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    const ranked = this.lights
      .map((e) => ({ e, d: e.p.distanceToSquared(eye) }))
      .sort((a, b) => a.d - b.d);
    ranked.forEach((r, i) => (r.e.l.visible = i < this.max));
  }
}

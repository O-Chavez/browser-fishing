import * as THREE from 'three';

/**
 * Every point light adds work to every lit fragment, even at zero intensity. Keep only the
 * `max` lights nearest the camera switched on; the count stays constant so shaders never recompile.
 *
 * Lights fade instead of popping: one leaving the nearest set dims to zero, then hands its slot to
 * the light replacing it, which brightens. `userData.lit` holds each light's 0..1 fade and
 * `userData.base` its unfaded intensity, for the night glow pools to follow.
 */
const shown = (o: THREE.Object3D | null): boolean => {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
};

/** Seconds for a light to fade fully in or out. */
export const LIGHT_FADE = 0.4;

interface Entry {
  l: THREE.PointLight;
  p: THREE.Vector3;
  fade: number;
  /** The intensity its owner last set, and the scaled value written over it. */
  base: number;
  set: number;
}

export class LightPool {
  private lights: Entry[] = [];
  private want = new Set<Entry>();
  private timer = 0;

  constructor(private max = 8) {}

  collect(root: THREE.Object3D): void {
    root.updateMatrixWorld(true);
    this.lights = [];
    root.traverse((o) => {
      const l = o as THREE.PointLight;
      if (l.isPointLight) this.lights.push({ l, p: l.getWorldPosition(new THREE.Vector3()), fade: 0, base: l.intensity, set: NaN });
    });
    this.timer = 0;
    this.rank(new THREE.Vector3());
    // A fresh map starts with its nearest lights already on.
    for (const e of this.lights) {
      e.l.visible = this.want.has(e);
      e.fade = e.l.visible ? 1 : 0;
    }
    this.apply();
  }

  private rank(eye: THREE.Vector3): void {
    // A light under a hidden parent (a found bottle) never renders, so it mustn't take a slot.
    const ranked = this.lights
      .map((e) => ({ e, d: shown(e.l.parent) ? e.p.distanceToSquared(eye) : Infinity }))
      .sort((a, b) => a.d - b.d);
    this.want = new Set(ranked.filter((r, i) => i < this.max && r.d !== Infinity).map((r) => r.e));
  }

  update(dt: number, eye: THREE.Vector3): void {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.25;
      this.rank(eye);
    }
    const step = dt / LIGHT_FADE;
    const waiting = this.lights
      .filter((e) => !e.l.visible && this.want.has(e))
      .sort((a, b) => a.p.distanceToSquared(eye) - b.p.distanceToSquared(eye));
    for (const e of this.lights) {
      if (!e.l.visible) continue;
      if (this.want.has(e)) {
        e.fade = Math.min(1, e.fade + step);
        continue;
      }
      // A hidden light frees its slot at once; a dimming one only once it reaches zero.
      e.fade = shown(e.l.parent) ? Math.max(0, e.fade - step) : 0;
      const next = e.fade === 0 && waiting.shift();
      if (next) {
        e.l.visible = false;
        next.l.visible = true;
        next.fade = 0;
      }
    }
    this.apply();
  }

  /** Scales each light by its fade, on top of whatever intensity its owner set this frame. */
  private apply(): void {
    for (const e of this.lights) {
      const l = e.l;
      if (l.intensity !== e.set) e.base = l.intensity;
      l.intensity = e.set = e.base * (l.visible ? e.fade : 0);
      l.userData.lit = l.visible ? e.fade : 0;
      l.userData.base = e.base;
    }
  }
}

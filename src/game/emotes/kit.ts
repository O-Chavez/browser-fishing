/**
 * Helpers every emote look can use (`src/game/emotes/looks/`): easing and timing, a seed from a name, freeing a play,
 * the shared glow texture and a material in the outfits' style. Random numbers come from the game's own `mulberry`
 * (env.ts), drawn while a look is built and never while it plays, so every play of an emote is the same picture.
 */
import * as THREE from 'three';
import { smooth } from '../env';
import { haloTexture } from '../textures';

// ---------- easing and timing ----------

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** 0 before `a`, 1 after `b`, eased in between (like GLSL's smoothstep): the game's own `smooth`. */
export { smooth as smoothstep };
/** Where `x` sits between `a` and `b`, clamped to 0..1 (linear). */
export const progress = (a: number, b: number, x: number): number => clamp01((x - a) / (b - a));
export const easeInCubic = (t: number): number => t * t * t;
export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;
/** Overshoots a little past 1 and settles: a pop. */
export const easeOutBack = (t: number, s = 1.70158): number => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
/** 0 -> 1 -> 0 over 0..1, smooth at both ends: a hump. */
export const hump = (t: number): number => (t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t) ** 2);
/** How much of a motion shows `t` seconds into one `seconds` long: eases in over `fadeIn` and out over the last `fadeOut`. */
export const envelope = (t: number, seconds: number, fadeIn = 0.25, fadeOut = 0.35): number =>
  Math.min(smooth(0, fadeIn, t), 1 - smooth(seconds - fadeOut, seconds, t));
/** A smooth wobble in -1..1 that depends only on `t` and `seed`: two sines at unrelated rates. */
export const wobble = (t: number, seed = 0, rate = 1): number => 0.6 * Math.sin(t * rate * 2.13 + seed * 1.7) + 0.4 * Math.sin(t * rate * 3.71 + seed * 4.3);
/** A hop's height `t` seconds into a hop `dur` seconds long that peaks at `h` metres (a parabola). */
export const hop = (t: number, dur: number, h: number): number => (t <= 0 || t >= dur ? 0 : 4 * h * (t / dur) * (1 - t / dur));

/** A seed for `mulberry` from a string, so each look seeds its own random by name. */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---------- freeing a play ----------

/** Things made once and shared between plays (a cached texture, a shader material); `freeLook` leaves them alone. */
const KEPT = new WeakSet<object>();

/** Marks a texture, geometry or shader material as shared by every play of a look, so `freeLook` skips it. */
export function keep<T extends object>(x: T): T {
  KEPT.add(x);
  return x;
}

/**
 * Frees what a play made, for `EmotePlay.dispose`: every geometry and texture under `root` (the play's group), and an
 * instanced mesh's per-instance buffers, which only its own `dispose` frees; then takes the group out of the scene.
 * Things passed to `keep` stay, and so does the quad all sprites share. Materials are left alone on purpose, like `disposeTree` (dispose.ts): disposing one
 * releases its compiled shader once nothing else uses it, so the next play would freeze while it recompiles, and the
 * shaders the looks use are a small fixed set. A shader material is the exception (the renderer holds on to each one
 * until it is disposed), so one a play made for itself is freed; share it with `keep` instead.
 */
export function freeLook(root: THREE.Object3D): void {
  const done = new Set<object>();
  const free = (x: { dispose(): void } | null | undefined): void => {
    if (!x || done.has(x) || KEPT.has(x)) return;
    done.add(x);
    x.dispose();
  };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (o instanceof THREE.InstancedMesh) o.dispose();
    // Every sprite shares one quad (three.js's own), which the name tags and chat bubbles draw with too.
    if (!(o as THREE.Sprite).isSprite) free(m.geometry);
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if ((v as THREE.Texture | null)?.isTexture) free(v as THREE.Texture);
      if ((mat as THREE.ShaderMaterial).isShaderMaterial) free(mat);
    }
  });
  root.removeFromParent();
}

// ---------- glows and materials ----------

/** A soft white radial glow, the outfits' own (`haloTexture`): tint it with a sprite's or material's colour. Shared, never freed. */
export const glowTexture = (): THREE.CanvasTexture => keep(haloTexture());

/**
 * A soft glow that adds light, facing the camera, `size` metres across, with its own material so its opacity can be
 * set each frame (`sprite.material.opacity`). Its see-through drawing goes after the water (`drawAfterWater`).
 */
export function glowSprite(color: THREE.ColorRepresentation, size: number, opacity = 0.6): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
  s.scale.setScalar(size);
  return s;
}

/**
 * A flat-shaded material in the game's outfit style (matte, low-poly). `glow` > 0 makes it shine its own colour, like
 * the legendary trims. One per call: share it between meshes.
 */
export function lowPolyMat(color: THREE.ColorRepresentation, opts: { glow?: number; rough?: number; metal?: number; opacity?: number } = {}): THREE.MeshStandardMaterial {
  const { glow = 0, rough = 0.85, metal = 0, opacity = 1 } = opts;
  return new THREE.MeshStandardMaterial({
    color,
    roughness: rough,
    metalness: metal,
    flatShading: true,
    emissive: glow > 0 ? color : 0x000000,
    emissiveIntensity: glow,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  });
}

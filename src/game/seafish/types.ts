import type * as THREE from 'three';
import type { FishLook } from '../../data/fishlook';

/**
 * What a deep zone's module gets to build its parts and finish onto a fish's 3D model (`buildFish`). The model's
 * nose points to -Z and it is 1 unit long, so a point t along the body (0 nose, 1 tail) sits at z = -0.5 + t.
 */
export interface SeaModelCtx {
  group: THREE.Group;
  /** The species' look, and `L`, the same with a shiny's gold applied: colour parts from `L`. */
  look: FishLook;
  L: FishLook;
  id: string;
  shiny: boolean;
  accent: THREE.Color;
  /** The body's skin, and the fins' material: change them for a finish (gloss, glow, see-through). */
  bodyMat: THREE.MeshPhysicalMaterial;
  finMat: THREE.MeshStandardMaterial;
  body: THREE.Mesh;
  /** The tail's pivot at the tail root (z = 0.47); parts added to it wag with the tail. */
  tail: THREE.Group;
  /** Additive glow materials here breathe; objects in `twinkle` sparkle. Both are animated by the game. */
  pulse: THREE.Material[];
  twinkle: THREE.Object3D[];
  /** Half-height (y) and half-width (x) of the body at t. */
  extents: (t: number) => { y: number; x: number };
  /** A flat fin from 2D points (x toward the tail, y up), standing in the YZ plane. */
  finGeo: (pts: [number, number][]) => THREE.BufferGeometry;
  /** A soft round glow texture for additive sprites. */
  glowTexture: () => THREE.Texture;
  /** How much the fins were scaled for this body. */
  finScale: number;
}

/**
 * What a deep zone's module gets to draw its parts onto a fish's 64×40 SVG icon (`fishIcon`). The head is at the
 * right (x = HEAD), the tail root at the left (x = ROOT), the midline at y = MID.
 */
export interface SeaIconCtx {
  look: FishLook;
  id: string;
  /** A unique number for this icon, for SVG ids (filters, gradients). */
  k: number;
  /** An undiscovered fish's silhouette: draw parts in `ink` only, no glow. */
  hidden: boolean;
  shiny: boolean;
  HEAD: number;
  ROOT: number;
  MID: number;
  PX: number;
  hScale: number;
  /** y of the back and the belly at t. */
  topAt: (t: number) => number;
  botAt: (t: number) => number;
  /** x at t. */
  xAt: (t: number) => number;
  /** The body outline's path, for clips and glows. */
  body: string;
  back: string;
  belly: string;
  fin: string;
  accent: string;
  ink: string;
  rng: () => number;
}

/** SVG to splice into the icon, back to front. */
export interface SeaIconLayers {
  /** Behind everything (glows, auras). */
  under?: string;
  /** In front of the tail, behind the body (fins, frills, crests). */
  behind?: string;
  /** Inside the body's clip (markings). */
  clipped?: string;
  /** Over the body, under the eyes. */
  over?: string;
  /** Over everything, eyes included. */
  top?: string;
  /** Extra <defs> content. */
  defs?: string;
}

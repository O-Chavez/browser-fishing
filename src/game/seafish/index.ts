// The deep sea zones' fish parts and finishes, one module per zone, so each zone's looks are built in one place.
import type * as THREE from 'three';
import type { FishLook } from '../../data/fishlook';
import { abyssIcon, abyssModel } from './abyss';
import { kelpIcon, kelpModel } from './kelp';
import { legendShadow } from './giants';
import { twilightIcon, twilightModel } from './twilight';
import type { SeaIconCtx, SeaIconLayers, SeaModelCtx } from './types';

export type { SeaIconCtx, SeaIconLayers, SeaModelCtx } from './types';

/** Adds a deep sea fish's zone parts and finish to its 3D model. */
export function addSeaParts(ctx: SeaModelCtx): void {
  const f = ctx.look.finish;
  if (f === 'overgrown') kelpModel(ctx);
  else if (f === 'lit') twilightModel(ctx);
  else if (f === 'abyssal') abyssModel(ctx);
}

/**
 * Reshapes a deep sea fish's dark underwater silhouette (`buildFish` with `shadow`), for those whose zone parts are
 * their whole outline: the Abyss's legends, which have bodies of their own.
 */
export function addSeaShadow(look: FishLook, group: THREE.Group, body: THREE.Mesh, tail: THREE.Group): void {
  if (look.finish === 'abyssal' && look.abyss?.legend) legendShadow(look.abyss.legend, group, body, tail);
}

/** A deep sea fish's zone parts and finish for its icon, or null for other fish. */
export function seaIconLayers(ctx: SeaIconCtx): SeaIconLayers | null {
  const f = ctx.look.finish;
  return f === 'overgrown' ? kelpIcon(ctx) : f === 'lit' ? twilightIcon(ctx) : f === 'abyssal' ? abyssIcon(ctx) : null;
}

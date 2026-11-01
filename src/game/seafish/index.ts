// The deep sea zones' fish parts and finishes, one module per zone, so each zone's looks are built in one place.
import { abyssIcon, abyssModel } from './abyss';
import { kelpIcon, kelpModel } from './kelp';
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

/** A deep sea fish's zone parts and finish for its icon, or null for other fish. */
export function seaIconLayers(ctx: SeaIconCtx): SeaIconLayers | null {
  const f = ctx.look.finish;
  return f === 'overgrown' ? kelpIcon(ctx) : f === 'lit' ? twilightIcon(ctx) : f === 'abyssal' ? abyssIcon(ctx) : null;
}

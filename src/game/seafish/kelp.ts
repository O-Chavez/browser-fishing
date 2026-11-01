import type { SeaIconCtx, SeaIconLayers, SeaModelCtx } from './types';

/** Builds the Kelp Deep zone's parts (`FishLook.kelp`) and its finish onto a 3D fish. Filled in by its looks slice. */
export function kelpModel(_ctx: SeaModelCtx): void {}

/** Draws the Kelp Deep zone's parts and finish onto a fish icon. Filled in by its looks slice. */
export function kelpIcon(_ctx: SeaIconCtx): SeaIconLayers | null {
  return null;
}

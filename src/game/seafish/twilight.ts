import type { SeaIconCtx, SeaIconLayers, SeaModelCtx } from './types';

/** Builds the Twilight's parts (`FishLook.twilight`) and its finish onto a 3D fish. Filled in by its looks slice. */
export function twilightModel(_ctx: SeaModelCtx): void {}

/** Draws the Twilight's parts and finish onto a fish icon. Filled in by its looks slice. */
export function twilightIcon(_ctx: SeaIconCtx): SeaIconLayers | null {
  return null;
}

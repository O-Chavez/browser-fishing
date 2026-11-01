import type { SeaIconCtx, SeaIconLayers, SeaModelCtx } from './types';

/** Builds the Abyss's parts (`FishLook.abyss`) and its finish onto a 3D fish. Filled in by its looks slice. */
export function abyssModel(_ctx: SeaModelCtx): void {}

/** Draws the Abyss's parts and finish onto a fish icon. Filled in by its looks slice. */
export function abyssIcon(_ctx: SeaIconCtx): SeaIconLayers | null {
  return null;
}

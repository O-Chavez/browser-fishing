import * as THREE from 'three';
import { abyss } from './looks/abyss';
import { kelp } from './looks/kelp';
import { master } from './looks/master';
import { nice } from './looks/nice';
import { no } from './looks/no';
import { sit } from './looks/sit';
import { skipThrow } from './looks/skip';
import { twilight } from './looks/twilight';
import { wave } from './looks/wave';
import { yes } from './looks/yes';
import type { EmoteLook } from './types';

/**
 * The look each emote plays, by emote id (`EMOTES`, `src/data/emotes.ts`). This is the one place a look is wired in:
 * to swap one, point its id at another `EmoteLook`. An id with no entry plays `plain`.
 *
 * A picked look lives in `looks/<emote id>.ts` and exports its `EmoteLook` and its length; shared parts come from
 * `kit.ts` (easing, seeds, `freeLook`) and `meshes.ts` (the one-draw moving meshes), and the base four's hands from
 * `looks/hands.ts`. The emote's length and camera in the catalog are set from its design.
 */
export const EMOTE_LOOKS: Record<string, EmoteLook> = {
  // Oscar's picks (2026-11-15 and 16): all eight.
  wave,
  nice,
  yes,
  no,
  kelp,
  twilight,
  abyss,
  master,
  // Sitting on a seat (`SIT`): not on the wheel.
  sit,
  // Throwing a skipping stone (`SKIP_THROW`): not on the wheel either.
  skip: skipThrow,
};

/** An emote with no look of its own (one added to the catalog before its look; none today): a slow, gentle bob and nothing else. */
export const plain: EmoteLook = () => ({
  group: new THREE.Group(),
  update(t, _dt, pose) {
    pose.lift = (0.5 - 0.5 * Math.cos(t * 2.2)) * 0.06;
  },
  dispose() {},
});

export const emoteLook = (id: string): EmoteLook => (Object.hasOwn(EMOTE_LOOKS, id) ? EMOTE_LOOKS[id] : plain);

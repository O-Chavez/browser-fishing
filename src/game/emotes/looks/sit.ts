import * as THREE from 'three';
import { smoothstep } from '../kit';
import type { EmoteLook } from '../types';
import { bandPlay } from './band';
import { SIT_LIFT, SIT_SQUASH, sitLift } from './seated';

/** Seconds to settle onto the seat. */
const DOWN = 0.4;

/**
 * Sitting down (`SIT`, src/data/emotes.ts): characters have no legs to fold, so the whole body hops up onto the seat,
 * sinks into a squat and leans back a little, then breathes: lifted just as far as rests it on its seat, a log, a
 * bench or a plank of the seat wall (`EmoteCtx.seatTop`). It lasts until the player gets up. On one of the Great
 * Fire's logs the seat's instrument comes up into the player's hands and they play it for as long as they sit
 * (`EmoteCtx.band`, `band.ts`).
 */
export const sit: EmoteLook = (ctx) => {
  const band = ctx.band ? bandPlay(ctx, ctx.band) : null;
  const lift = ctx.seatTop === undefined ? SIT_LIFT : sitLift(ctx.seatTop);
  return {
    group: band?.group ?? new THREE.Group(),
    update(t, _dt, pose) {
      const k = smoothstep(0, DOWN, t);
      // A small hop over the seat's edge on the way down.
      pose.lift = lift * k + Math.sin(Math.min(1, t / DOWN) * Math.PI) * 0.12;
      pose.squash = 1 - (1 - SIT_SQUASH) * k + Math.sin(t * 1.7) * 0.008 * k;
      pose.pitch = -0.09 * k;
      band?.update(t, pose);
    },
    dispose() {
      band?.dispose();
    },
  };
};

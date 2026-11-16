/** Wave's look, "Mitten wave" (Oscar's pick, 2026-11-15; GAME_DESIGN.md §40). */
import * as THREE from 'three';
import { easeOutCubic, envelope, freeLook, lerp, progress, smoothstep } from '../kit';
import { TAU } from '../meshes';
import type { EmoteLook } from '../types';
import { HAND_SCALE, follow, handMats, mitten, popScale, sideOf } from './hands';

/** The emote's length in seconds, which its timings below are written against (`EMOTES`, `src/data/emotes.ts`). */
export const WAVE_SECONDS = 2.4;

/** A chunky cream mitten pops out beside your head and waves hello, while you lean into it with a little bounce. */
export const wave: EmoteLook = (ctx) => {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const side = sideOf(ctx);
  const hand = mitten(1, handMats(ctx));
  rig.add(hand);
  return {
    group,
    update(t, _dt, pose) {
      // In 0.3 s the mitten pops up from the body's side to beside the head; it waves until 2.05 s, then drops away.
      const up = easeOutCubic(progress(0, 0.3, t)) * (1 - smoothstep(2.05, 2.4, t));
      const w = envelope(t - 0.25, 1.85, 0.12, 0.3);
      const ph = Math.sin(TAU * 2.1 * (t - 0.25));
      hand.scale.setScalar(HAND_SCALE * popScale(t, 0, WAVE_SECONDS));
      hand.position.set(-lerp(side - 0.16, side, up) - 0.03 * ph * w, lerp(1.15, 1.66, up), 0.02);
      // Pivot at the wrist: a slight outward tilt with a wide wag on top.
      hand.rotation.set(0, 0, 0.18 * up + 0.5 * ph * w);
      pose.roll = -0.06 * up + 0.025 * ph * w;
      pose.lift = 0.025 * Math.abs(ph) * w;
      pose.squash = 1 - 0.03 * (1 - Math.abs(ph)) * w;
      follow(rig, pose);
    },
    dispose: () => freeLook(group),
  };
};

/** No's look, "Glove finger wag" (Oscar's pick, 2026-11-15; GAME_DESIGN.md §40). */
import * as THREE from 'three';
import { easeOutCubic, envelope, freeLook, lerp, progress, smoothstep } from '../kit';
import { TAU } from '../meshes';
import type { EmoteLook } from '../types';
import { HAND_SCALE, follow, glove, handMats, popScale, sideOf } from './hands';

/** The emote's length in seconds, which its timings below are written against (`EMOTES`, `src/data/emotes.ts`). */
export const NO_SECONDS = 2.2;

/** The chunky glove raises one fat finger beside your head and wags it side to side, "nuh-uh", while you lean back and shake. */
export const no: EmoteLook = (ctx) => {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const side = sideOf(ctx);
  const hand = glove('finger', 1, handMats(ctx));
  rig.add(hand);
  return {
    group,
    update(t, _dt, pose) {
      const up = easeOutCubic(progress(0, 0.28, t)) * (1 - smoothstep(1.9, 2.2, t));
      const w = envelope(t - 0.3, 1.55, 0.1, 0.25);
      const ph = Math.sin(TAU * 3.1 * (t - 0.3));
      hand.scale.setScalar(HAND_SCALE * popScale(t, 0, NO_SECONDS, 0.28));
      hand.position.set(-lerp(side - 0.16, side, up), lerp(1.15, 1.58, up), 0.02);
      // Wags from the wrist, a touch past upright each way, with a small side slide so it reads as a tick-tock.
      hand.rotation.set(0, 0, 0.45 * ph * w);
      hand.position.x -= 0.03 * ph * w;
      pose.yaw = -0.16 * ph * w;
      pose.pitch = -0.06 * smoothstep(0.1, 0.4, t) * (1 - smoothstep(1.8, 2.2, t));
      follow(rig, pose);
    },
    dispose: () => freeLook(group),
  };
};

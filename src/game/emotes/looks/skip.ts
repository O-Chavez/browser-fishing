/** The stone throw's look (GAME_DESIGN.md §41, skipping stones): what the others on the map see a thrower do. */
import * as THREE from 'three';
import { easeInOutSine, easeOutCubic, freeLook, lerp, lowPolyMat, progress, smoothstep } from '../kit';
import type { EmoteLook } from '../types';
import { HAND_SCALE, follow, handMats, mitten, popScale, sideOf } from './hands';

/** The throw's length in seconds (`SKIP_THROW`, `src/data/emotes.ts`), and when the stone leaves the hand. */
export const SKIP_SECONDS = 1.1;
export const SKIP_LET_GO = 0.3;
/** Where the hand lets the stone go, in the character's space (its right is -x, its front +z), for a bare body: the stone's flight starts there. */
export const SKIP_HAND = { side: 0.5, y: 0.85, front: 0.5 };

/**
 * A sidearm throw: the mitten comes out low at the right hip holding a flat stone, the body winds back and round,
 * whips forward as the arm sweeps through, and holds the follow-through for a moment. The stone in the hand goes as
 * the real one starts its flight (`Skipping`, src/game/skipping.ts).
 */
export const skipThrow: EmoteLook = (ctx) => {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const side = Math.max(sideOf(ctx), SKIP_HAND.side);
  const hand = mitten(1, handMats(ctx));
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.035, 7), lowPolyMat(0x8d8a84));
  // Flat on the palm, which faces +z.
  stone.position.set(0, 0.16, 0.07);
  stone.rotation.x = Math.PI / 2;
  hand.add(stone);
  rig.add(hand);
  return {
    group,
    update(t, _dt, pose) {
      // Wind back until 0.2 s, whip through by 0.34 s, hold, then come back to rest.
      const back = easeInOutSine(progress(0, 0.2, t)) * (1 - smoothstep(0.2, 0.32, t));
      const through = easeOutCubic(progress(0.2, 0.34, t)) * (1 - smoothstep(0.7, SKIP_SECONDS - 0.05, t));
      hand.scale.setScalar(HAND_SCALE * popScale(t, 0, SKIP_SECONDS, 0.14, 0.25));
      stone.visible = t < SKIP_LET_GO;
      hand.position.set(-side - 0.08 * back + 0.14 * through, lerp(1, SKIP_HAND.y, Math.max(back, through)), -0.4 * back + SKIP_HAND.front * through);
      // The palm turns out and the fingers point forward as the arm sweeps through.
      hand.rotation.set(1.1 * through - 0.5 * back, 0, -0.3);
      pose.yaw = -0.5 * back + 0.4 * through;
      pose.pitch = -0.07 * back + 0.2 * through;
      pose.squash = 1 - 0.06 * back - 0.03 * through;
      follow(rig, pose);
    },
    dispose: () => freeLook(group),
  };
};

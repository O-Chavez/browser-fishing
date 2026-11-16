/** Yes's look, "Glove thumbs-up" (Oscar's pick, 2026-11-15; GAME_DESIGN.md §40). */
import * as THREE from 'three';
import { easeOutBack, easeOutCubic, freeLook, glowSprite, hump, lerp, lowPolyMat, progress, smoothstep } from '../kit';
import { merge, put } from '../meshes';
import type { EmoteLook } from '../types';
import { HAND_SCALE, follow, glove, handMats, popScale, sideOf } from './hands';

/** The emote's length in seconds, which its timings below are written against (`EMOTES`, `src/data/emotes.ts`). */
export const YES_SECONDS = 2.2;

/** A four-pointed glint with a soft glow behind it, for the tip of the thumb. */
function glinter(parent: THREE.Object3D) {
  const glow = glowSprite(0xfff4c0, 0.55, 0);
  const star = new THREE.Mesh(merge([put(new THREE.OctahedronGeometry(1, 0), [0, 0, 0], [0, 0, 0], [0.025, 0.11, 0.025]), put(new THREE.OctahedronGeometry(1, 0), [0, 0, 0], [0, 0, 0], [0.11, 0.025, 0.025])]), lowPolyMat(0xffffff, { glow: 0.9 }));
  glow.visible = star.visible = false;
  parent.add(glow, star);
  return {
    /** Shows the glint at (x, y, z) with strength g (0 hides it), turning with t. */
    draw(x: number, y: number, z: number, g: number, t: number) {
      glow.visible = star.visible = g > 0.01;
      glow.position.set(x, y, z);
      glow.material.opacity = 0.75 * g;
      star.position.set(x, y, z);
      star.scale.setScalar(Math.max(0.001, g * 1.4));
      star.rotation.z = t * 2;
    },
  };
}

/**
 * The Wave mitten's chunky glove makes a proper thumbs-up beside your head: a round fist with plump curled fingers and a
 * fat thumb. It flips into view with a glint and pumps twice as you nod.
 */
export const yes: EmoteLook = (ctx) => {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const side = sideOf(ctx);
  // On the character's right (-x), the thumb leaning in toward the head.
  const hand = glove('thumbsUp', 1, handMats(ctx));
  rig.add(hand);
  const glint = glinter(rig);
  const PUMPS = [0.75, 1.3];
  return {
    group,
    update(t, _dt, pose) {
      const up = easeOutCubic(progress(0, 0.3, t)) * (1 - smoothstep(1.9, 2.2, t));
      let pump = 0;
      for (const c of PUMPS) pump = Math.max(pump, hump(progress(c - 0.2, c + 0.22, t)));
      // It flips round into view as it pops up.
      const flip = (1 - easeOutBack(progress(0.05, 0.4, t))) * 1.6;
      const g = Math.max(hump(progress(0.36, 0.72, t)), 0.6 * hump(progress(1.2, 1.5, t)));
      hand.scale.setScalar(HAND_SCALE * popScale(t, 0, YES_SECONDS, 0.3));
      hand.position.set(-lerp(side - 0.16, side, up), lerp(1.15, 1.56, up) + 0.1 * pump, 0.02);
      hand.rotation.set(0, -flip, -(0.1 * up - 0.1 * pump));
      // A glint off the thumb's tip as it settles, and again smaller on the second pump.
      glint.draw(hand.position.x + 0.12 * HAND_SCALE, hand.position.y + 0.4 * HAND_SCALE, 0.1, g, t);
      pose.pitch = 0.16 * pump;
      pose.squash = 1 - 0.04 * pump;
      follow(rig, pose);
    },
    dispose: () => freeLook(group),
  };
};

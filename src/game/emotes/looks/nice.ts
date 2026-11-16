/** Nice!'s look, "Mitten clap" (Oscar's pick, 2026-11-15; GAME_DESIGN.md §40). */
import * as THREE from 'three';
import { mulberry } from '../../env';
import { easeOutBack, easeOutCubic, freeLook, hop, hump, lerp, lowPolyMat, progress, seedOf, smoothstep } from '../kit';
import { Instances, TAU } from '../meshes';
import type { EmoteCtx, EmoteLook, EmotePlay } from '../types';
import { HAND_SCALE, MITTEN_TOP, crownOf, follow, handMats, mitten, popScale, sideOf } from './hands';

/** The emote's length in seconds, which its timings below are written against (`EMOTES`, `src/data/emotes.ts`). */
export const NICE_SECONDS = 2.6;

/** A burst of `n` chunky golden sparkles (one instanced draw), flung out from a point. */
function sparkleBurst(n: number, ctx: EmoteCtx) {
  const sparks = new Instances(new THREE.OctahedronGeometry(0.058, 0), lowPolyMat(0xffd35c, { glow: 0.35 + 0.45 * ctx.dark }), n);
  sparks.mesh.visible = false;
  const rnd = mulberry(seedOf('nice-A'));
  const dirs = Array.from({ length: n }, (_, i) => {
    const a = ((i + rnd() * 0.5) / n) * TAU;
    return { x: Math.cos(a), y: Math.sin(a), z: (rnd() - 0.5) * 0.8, len: 0.28 + rnd() * 0.18, spin: rnd() * 6 };
  });
  return {
    mesh: sparks.mesh,
    /** Draws the burst `since` seconds after it went off at (x, y, z); hidden outside 0..life. */
    draw(since: number, x: number, y: number, z: number, life: number) {
      const p = since / life;
      sparks.mesh.visible = p > 0 && p < 1;
      if (!sparks.mesh.visible) return;
      const r = easeOutCubic(p);
      const s = Math.min(1, p * 6) * (1 - p * p);
      dirs.forEach((d, i) => sparks.set(i, x + d.x * d.len * r, y + d.y * d.len * r, z + d.z * d.len * r, s, s * 1.6, s, 0, p * 3, d.spin + p * 4));
      sparks.commit();
    },
  };
}

/**
 * Two mittens pop up over your head and clap three times with a spark on each clap, then throw up a "hooray" as you
 * hop. A cheer anyone can see over a crowd.
 */
export const nice: EmoteLook = (ctx) => {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const side = sideOf(ctx);
  const crown = crownOf(ctx);
  const mats = handMats(ctx);
  // Palms toward each other but turned a third of the way to the front, so the mittens show their shape from the
  // front and from behind rather than an edge; thumbs end up toward the front.
  const TURN = Math.PI / 2 - 0.62;
  const right = mitten(-1, mats);
  right.rotation.y = TURN;
  const left = mitten(1, mats);
  left.rotation.y = -TURN;
  const spark = sparkleBurst(9, ctx);
  rig.add(right, left, spark.mesh);
  const CLAPS = [0.62, 0.98, 1.34];
  const play: EmotePlay = {
    group,
    update(t, _dt, pose) {
      const s = HAND_SCALE * popScale(t, 0, NICE_SECONDS, 0.3, 0.25);
      right.scale.setScalar(s);
      left.scale.setScalar(s);
      // Up over the head by 0.45 s, three claps, then the hands spread for a hooray at 1.5 s.
      const up = easeOutCubic(progress(0.02, 0.45, t));
      let near = 9;
      for (const c of CLAPS) near = Math.min(near, Math.abs(t - c));
      const open = smoothstep(0, 0.16, near);
      const clapX = 0.075 * HAND_SCALE + 0.24 * open;
      const hooray = easeOutBack(progress(1.5, 1.75, t));
      const x = lerp(lerp(side, clapX, up), 0.5, hooray);
      const y = lerp(1.3, crown + 0.04, up) + 0.12 * hooray - 0.25 * smoothstep(2.3, 2.6, t);
      const tilt = 0.45 * hooray + 0.08 * Math.sin(TAU * 3 * (t - 1.5)) * hooray;
      right.position.set(-x, y, 0);
      left.position.set(x, y, 0);
      right.rotation.z = tilt;
      left.rotation.z = -tilt;
      // A spark from the last clap that went off.
      let last = -1;
      for (const c of CLAPS) if (t >= c) last = c;
      spark.draw(last < 0 ? -1 : t - last, 0, y + 0.18 * HAND_SCALE, 0, 0.42);
      // Body: a dip on each clap, a squash and a hop for the hooray.
      let dip = 0;
      for (const c of CLAPS) dip = Math.max(dip, hump(progress(c - 0.08, c + 0.2, t)));
      const h = hop(t - 1.5, 0.42, 0.22);
      pose.lift = h;
      pose.squash = 1 - 0.05 * dip - 0.1 * hump(progress(1.36, 1.54, t)) - 0.08 * hump(progress(1.9, 2.05, t)) + (h > 0 ? 0.05 : 0);
      follow(rig, pose);
      // The mittens' tops, over the head: another player's name tag rises over them.
      play.over = s > 0.01 ? pose.lift + y + MITTEN_TOP * s : 0;
    },
    dispose: () => freeLook(group),
  };
  return play;
};

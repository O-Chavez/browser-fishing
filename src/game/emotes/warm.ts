import * as THREE from 'three';
import { defaultLook } from '../../data/cosmetics';
import { EMOTE_LOOKS } from './looks';

/**
 * An emote's look brings shaders nothing else in the game uses (its instanced bubbles, its glow quads, its painted
 * fish), and compiling them the first time someone nearby played it would stall the game for a few frames. So a day
 * and a night copy of every look is built in idle moments while the page loads, like the avatars' stand-ins for the
 * sea sets (`Avatars.warmLegends`), and handed to `warm` to compile in the background and draw once. The copies stay
 * in the scene, hidden and never played, so every later `World.prewarm` (a new map's lights and fog) covers them too.
 */
export class LookWarmer {
  private holder = new THREE.Group();
  /** True until every look is built and handed to `warm`. */
  building = true;

  constructor(
    scene: THREE.Scene,
    warm: (o: THREE.Object3D) => void,
    whenIdle: (f: (left: () => number) => void) => void,
  ) {
    this.holder.visible = false;
    scene.add(this.holder);
    // A day and a night copy of each: some looks draw differently after dark (Master's fish go unlit, its light adds),
    // which takes shaders of their own.
    const todo = Object.keys(EMOTE_LOOKS).flatMap((id) => [0, 1].map((dark) => ({ id, dark })));
    const next = (left: () => number): void => {
      const t0 = performance.now();
      do {
        const { id, dark } = todo.shift()!;
        try {
          this.holder.add(EMOTE_LOOKS[id]({ look: defaultLook(), top: 1.82, reach: 0.28, dark, local: false }).group);
        } catch (e) {
          // A broken look shouldn't stop the page: it fails again, harmlessly, when someone plays it (`EmotePlayer`).
          console.warn(`Couldn't build the ${id} emote:`, e);
        }
      } while (todo.length && (left() > 15 || performance.now() - t0 < 16));
      if (todo.length) return whenIdle(next);
      this.building = false;
      warm(this.holder);
    };
    whenIdle(next);
  }
}

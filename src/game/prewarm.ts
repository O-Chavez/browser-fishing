import type * as THREE from 'three';

/**
 * Shows everything under `root` for a one-off draw, hidden objects too and nothing frustum-culled,
 * and returns a function that puts every object back as it was. Lights keep the visibility they
 * have now, with a hidden parent counting as hidden: the number of lights is part of every shader
 * program, so a draw with more of them would compile programs that are never used.
 */
export function revealAll(root: THREE.Object3D): () => void {
  const lit = new Set<THREE.Object3D>();
  root.traverseVisible((o) => {
    if ((o as THREE.Light).isLight) lit.add(o);
  });
  const saved: [THREE.Object3D, boolean, boolean][] = [];
  root.traverse((o) => {
    saved.push([o, o.visible, o.frustumCulled]);
    o.visible = (o as THREE.Light).isLight ? lit.has(o) : true;
    o.frustumCulled = false;
  });
  return () => {
    for (const [o, visible, culled] of saved) {
      o.visible = visible;
      o.frustumCulled = culled;
    }
  };
}

/** What an owner of models built during play needs of the warm-up (`Warmups`, on `World`). */
export interface WarmShow {
  /**
   * Hides `obj` until its shaders are ready, then shows it, unless `when` says not yet (the owner shows it later,
   * once `isWarm`). Until then `obj.visible` is the warm-up's to set: hide a parent to keep it out of sight.
   */
  show(obj: THREE.Object3D, when?: () => boolean): void;
  /** Whether something given to `show` is ready to be drawn. */
  isWarm(obj: THREE.Object3D): boolean;
}

/** No warm-up: everything shows at once (tests, and owners built without a world). */
export const SHOWN: WarmShow = { show: () => {}, isWarm: () => true };

/**
 * The book-keeping for shaders compiled after the map's own warm-up (`World.prewarm`). A program compiles in the
 * background, but only until something drawn needs it: the first frame that draws an unfinished one waits for it,
 * which froze the game for 0.3 to 1.3 s on an M1 (seconds under load, more on a phone) the first time each kind of
 * fish was hooked. So nothing new is drawn before its programs are done:
 *
 * - `warm` is for hidden stand-ins that stay in the scene: compiled, then drawn once clipped to one pixel.
 * - `show` is for models built during play (the hooked fish, another player's catch, a dropped fish): hidden while
 *   they compile and shown when ready, a moment late at worst. With programs already made (the usual case, as there
 *   are only a few kinds) nothing is compiled or drawn, and it shows on the next frame or two.
 *
 * Without KHR_parallel_shader_compile (Firefox) a program still compiles on its one-pixel draw, so the wait moves
 * from the moment of the hook to the bobber landing but isn't gone.
 */
export class Warmups implements WarmShow {
  /** Compiles still running. */
  private left = 0;
  /** Compiled, and waiting for their one-pixel draw. */
  private waiting: { obj: THREE.Object3D; then?: () => void }[] = [];
  private ready = new WeakSet<THREE.Object3D>();

  constructor(
    /** Starts compiling what `obj` draws with in the background; settles once its programs are ready. */
    private compile: (obj: THREE.Object3D) => Promise<unknown>,
    /** How many shader programs there are, to tell whether a compile made a new one. */
    private programs: () => number,
  ) {}

  /** Compiles a hidden stand-in's programs and has it drawn once (`due`). */
  warm(obj: THREE.Object3D): void {
    this.start(obj, true);
  }

  show(obj: THREE.Object3D, when: () => boolean = () => true): void {
    obj.visible = false;
    this.start(obj, false, () => {
      this.ready.add(obj);
      obj.visible = when();
    });
  }

  isWarm(obj: THREE.Object3D): boolean {
    return this.ready.has(obj);
  }

  private start(obj: THREE.Object3D, always: boolean, then?: () => void): void {
    this.left++;
    const before = this.programs();
    const compiling = this.compile(obj);
    // The one-pixel draw finishes a new program on GPUs that leave part of the work to the first draw (phones), and
    // costs a pass over the scene, so something drawn with programs that were already there skips it.
    const draw = always || this.programs() !== before;
    const done = (): void => {
      this.left--;
      // Taken out of the scene meanwhile (a cast given up, a player gone): there is nothing to draw.
      if (draw && obj.parent) this.waiting.push({ obj, then });
      else then?.();
    };
    void compiling.then(done, done);
  }

  /** False while something is still compiling or waits for its one-pixel draw. */
  get idle(): boolean {
    return !this.left && !this.waiting.length;
  }

  /** What is compiled and waits to be drawn once; call `drawn` after drawing these (or the whole scene). */
  get due(): THREE.Object3D[] {
    return this.waiting.map((w) => w.obj);
  }

  drawn(): void {
    for (const w of this.waiting.splice(0)) w.then?.();
  }
}

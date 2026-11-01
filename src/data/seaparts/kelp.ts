/**
 * The parts Kelp Deep (slice C): leafy frills, frond crown, kelp beard, lionfish spines and fans, teeth, horns. A fish's `FishLook.kelp` holds the ones it has; `src/game/seafish/kelp.ts` builds them on the
 * 3D model and the icon.
 */
export interface KelpParts {
  /** Leafy frills on little stalks: `n` along the back, with a smaller one under the belly beside every other one. `flanks` puts them on the sides of the body too. */
  frills?: { n: number; color: number; size: number; belly?: boolean; flanks?: boolean };
  /** A crown of `n` big leafy fronds fanning from the head. */
  crown?: { n: number; color: number; size: number };
  /** `n` kelp strands hanging from the chin, `len` long. */
  beard?: { n: number; color: number; len: number };
  /** The lionfish's dorsal crown: `n` long separate spines, each with a striped flag of membrane in `flag` and `stripe`. */
  spines?: { n: number; len: number; color: number; flag: number; stripe: number };
  /** Two big striped pectoral fans (the colours of the membrane and its stripes). */
  fans?: { color: number; stripe: number };
  /** Blunt crushing teeth in `n` pairs, with fleshy jowls on the head in `jowl`. */
  teeth?: { n: number; color: number; jowl: number };
  /** Two curved horns `len` long. */
  horns?: { len: number; color: number };
  /** A few drifting lime motes around a legend. */
  motes?: number;
}

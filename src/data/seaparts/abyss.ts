/**
 * The parts the Abyss (slice E): many eyes, gulper jaw and whip tail, tentacles, halo, ribs, bone spines, plates with molten seams. A fish's `FishLook.abyss` holds the ones it has; `src/game/seafish/abyss.ts` builds them on the
 * 3D model and the icon. Abyss fish leave out the usual eyes (`eye: 'none'`) and get glowing ones from `eye` instead.
 */
export interface AbyssParts {
  /** The main pair of glowing eyes: where along the body (t), radius, how high on the head (0 mid, 1 top), iris colour (default the accent) and pupil. */
  eye: { t: number; r: number; up?: number; iris?: number; pupil?: 'round' | 'slit' | 'bar' | 'lamp' };
  /** More eyes behind the main pair, each a little smaller (the Leviathan's burning row). */
  eyeRow?: number;
  /** Extra eyes scattered over the body, placed from the id: how many, and their radius range. */
  eyes?: { n: number; r: [number, number] };
  /** The gulper's hinged, gaping mouth: its inside colour. */
  jaw?: number;
  /** A long whip tail ending in a glowing lure of this colour. */
  whip?: number;
  /** Tapering tentacles: reaching forward out of the head (squid) or hanging down from the chin (a beard). */
  tentacles?: { n: number; len: number; r: number; color: number; dir: 'forward' | 'down'; suckers?: number };
  /** A pair of squid fins at the tail end, this big (1 is the Kraken Spawn's). */
  squidFins?: number;
  /** A glowing ring floating above the head. */
  halo?: boolean;
  /** Dark rib arcs across the flanks. */
  ribs?: { n: number; color: number };
  /** Glowing seams ringing the body between armour plates. */
  seams?: { n: number; color: number };
  /** Bone spines along the back. */
  spines?: { n: number; len: number; color: number };
  /** Horns on the brow: 2 swept back, or 3 for a crown. */
  horns?: { n: 2 | 3; len: number; color: number };
  /** Needle fangs hanging from the upper jaw, per side. */
  fangs?: number;
  /** Humps along a serpent's body: their height (in body lengths) and how many waves. */
  wave?: { amp: number; freq: number };
}

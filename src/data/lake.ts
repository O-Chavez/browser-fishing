/**
 * The lake's water: how deep it reads (Oscar's pick, 2026-11-19: "Sunlit shallows", its clarity leaning toward the
 * murkier, greener mockup). The colour comes from the water over whatever is under the surface, not from how far it is
 * from the eye; the surface itself only mirrors the sky near the viewer (`src/game/underwater.ts`,
 * `src/game/lakewater.ts`). Every number here is a default to play-test.
 *
 * `clear` is how fast red, green and blue die per metre of water in the shallows: with it alone the bed reads clearly
 * through the first metre or so. `murk` is added on top once the light has come `murkFrom` metres through the water
 * (down to the thing and back up to the eye), so the shore stays clear while the bed fades out about 3 metres
 * down. `green` (0..1) is how far the water's body colour leans from the lake's own blue (`Location.water` and `deep`)
 * toward `body`'s greens, near the eye and far off; `down` is where the body sits between the lake's shallow and deep
 * colours near the eye (0 shallow, 1 deep). That is the water looked down into. Looked across, it is the lake's own
 * colours leaning `pale.amount` of the way to `pale.color`, the grey-blue the old surface showed over its pale bed, so
 * the open lake keeps its colour while the bed's shapes fade out with distance: `across` is how steeply the eye looks
 * down (the sine of the angle) where the body starts to turn from those colours (below the first number) to the body's
 * (from the second).
 *
 * The surface is the old one from `far` metres out (its first number where it starts to come back, its second where it
 * is all of it): the open lake keeps its pale grey-blue, and depth shows near the viewer. `edge` is how many metres of
 * water the surface takes to thin out to nothing at the shore.
 *
 * `caustics` is how bright the sun's net of light on the bed is (0 none); it fades with the sun and is gone at night,
 * and lite graphics leaves it out. `netScale` is how many tiles of the net a metre holds (one tile is four cells), and
 * `netFar` the distance over which it fades out (metres from the eye).
 * `stones` is how many pebbles and stones lie in the shallows (one instanced draw, hidden in lite graphics).
 * `wet` is how high above the water the sand reads wet, and `foam` how strongly the thin foam line shows where the
 * water meets the sand (0 none). In lite graphics nothing fades by itself: the surface veils what is under it by the
 * depth there, as the fade would, but near the viewer no more than `liteVeil` of the way, so a fish or a post in deep
 * water shows.
 */
export const LAKE = {
  clear: [0.42, 0.15, 0.125] as [number, number, number],
  murk: [0.36, 0.15, 0.2] as [number, number, number],
  murkFrom: 1,
  green: 0.42,
  body: { near: 0x4f9a78, far: 0x103f38 },
  down: 0.6,
  across: [0.1, 0.4] as [number, number],
  pale: { color: 0x9cc2cc, amount: 0.5 },
  far: [8, 28] as [number, number],
  edge: 0.17,
  caustics: 1,
  netScale: 0.23,
  netFar: [7, 13] as [number, number],
  stones: 520,
  wet: 0.25,
  liteVeil: 0.7,
  foam: 0.8,
};

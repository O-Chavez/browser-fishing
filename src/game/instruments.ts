import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { InstrumentId } from '../data/band';
import { LOG } from '../data/maps';
import { keep } from './emotes/kit';

/**
 * The campfire band's six instruments (`INSTRUMENTS`, src/data/band.ts), in the town's wood-and-paint style: a
 * 5-string banjo, a hand drum, a squeezebox, a tin whistle, a washboard and a stoneware jug. One builder each, which
 * returns the instrument in its own frame (said on each builder) for a seated player's hands (the playing looks,
 * src/game/emotes/looks/band.ts); `restInstrument` stands the same model by its log for when nobody plays it
 * (`Town.buildCamp`).
 *
 * Each instrument is one mesh: its parts are baked into one geometry with a colour on every vertex, and all six
 * share one material, so an instrument is one draw (the squeezebox three: its bellows stretch between its ends).
 * The geometry is made once and shared by every copy, standing or in a player's hands: an emote look that ends
 * leaves it be (`keep`), and one freed with a map (`disposeTree`) is simply sent to the graphics card again the next
 * time it is drawn.
 */

type V3 = [number, number, number];

// The town's own colours (hub.ts, camp.ts), and tin for the whistle and the washboard.
const WOOD = 0x9b7248;
const DARK = 0x5b4128;
const LOG_BROWN = 0x7a5232;
const PALE_PLANK = 0xc9ad7a;
const CREAM = 0xf6ead0;
const BRASS = 0xc9a24a;
const IRON = 0x3d3d44;
const TIN = 0xb9c0c6;
const TIN_BRIGHT = 0xe1e6ea;
const CORAL = 0xd0553f;
const BLUE = 0x3f82d9;
const PALE_BLUE = 0xa9cde3;
const STONEWARE = 0xe8dcc0;
const GLAZE = 0x8a5a34;

/** The one material every instrument is drawn with: the colours are on the vertices. */
let paintMat: THREE.MeshLambertMaterial | null = null;
const paint = (): THREE.MeshLambertMaterial => (paintMat ??= keep(new THREE.MeshLambertMaterial({ vertexColors: true })));

const tint = new THREE.Color();
const turn = new THREE.Matrix4();
/**
 * One part of an instrument: a primitive in one colour (or coloured by where each vertex is, before it is moved),
 * turned by `r` (Euler XYZ), scaled and moved to `p`.
 */
function part(geo: THREE.BufferGeometry, color: number | ((x: number, y: number, z: number) => number), p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 | number = 1): THREE.BufferGeometry {
  let g = geo;
  if (geo.index) {
    g = geo.toNonIndexed();
    geo.dispose();
  }
  g.deleteAttribute('uv');
  const pos = g.getAttribute('position');
  const rgb = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    tint.setHex(typeof color === 'number' ? color : color(pos.getX(i), pos.getY(i), pos.getZ(i)));
    tint.toArray(rgb, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  const scale = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
  return g.applyMatrix4(turn.compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), scale));
}

/** Each instrument's geometry, made the first time it is asked for and shared from then on. */
const made = new Map<string, THREE.BufferGeometry>();
function shared(key: string, parts: () => THREE.BufferGeometry[]): THREE.BufferGeometry {
  let g = made.get(key);
  if (!g) {
    const list = parts();
    g = keep(mergeGeometries(list, false)!);
    for (const p of list) p.dispose();
    made.set(key, g);
  }
  return g;
}
const mesh = (key: string, parts: () => THREE.BufferGeometry[]): THREE.Mesh => {
  const m = new THREE.Mesh(shared(key, parts), paint());
  m.castShadow = true;
  return m;
};

const cyl = (rt: number, rb: number, h: number, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const QUARTER = Math.PI / 2;

/** An instrument: its model, and for the squeezebox the parts that move as it is squeezed (`squeeze`). */
export interface Instrument {
  id: InstrumentId;
  group: THREE.Group;
  /** The squeezebox's bellows, one unit long along x (scaled to stretch), and its two ends. */
  bellows?: THREE.Mesh;
  ends?: [THREE.Mesh, THREE.Mesh];
}

// ---------- banjo ----------

/** The banjo's pot (radius and depth), and how far its neck runs from the pot's middle to the end of the peghead. */
export const BANJO = { pot: 0.17, depth: 0.09, neck: 0.8 };

/**
 * A 5-string banjo: a round wooden pot with a skin head under a brass hoop, a long dark neck, a peghead with four
 * pegs and the fifth string's peg half way up the neck. Frame: the pot's middle at the origin, the skin toward +z,
 * the neck along +x.
 */
export function buildBanjo(): Instrument {
  const { pot: R, depth: D, neck: N } = BANJO;
  const group = new THREE.Group();
  group.add(
    mesh('banjo', () => [
      part(cyl(R, R, D, 16), LOG_BROWN, [0, 0, 0], [QUARTER, 0, 0]),
      part(cyl(R - 0.022, R - 0.022, 0.014, 16), CREAM, [0, 0, D / 2 + 0.002], [QUARTER, 0, 0]),
      part(new THREE.TorusGeometry(R - 0.012, 0.015, 5, 16), BRASS, [0, 0, D / 2]),
      // The neck, from the pot's rim to the nut, and the peghead beyond it.
      part(box(N - R - 0.1, 0.052, 0.036), DARK, [(R + N - 0.14) / 2, 0, D / 2 - 0.012]),
      part(box(0.13, 0.086, 0.03), WOOD, [N - 0.065, 0, D / 2 - 0.016]),
      ...[-1, 1].flatMap((side) => [N - 0.095, N - 0.035].map((x) => part(cyl(0.015, 0.015, 0.034, 5), CREAM, [x, side * 0.056, D / 2 - 0.016]))),
      part(cyl(0.013, 0.013, 0.03, 5), CREAM, [(R + N) / 2, 0.038, D / 2 - 0.012]),
      // The strings as one pale band from the tailpiece over the bridge to the nut.
      part(box(N - 0.02, 0.03, 0.004), 0xe9e4d6, [(N - 0.3) / 2, 0, D / 2 + 0.014]),
      part(box(0.014, 0.056, 0.014), DARK, [-0.03, 0, D / 2 + 0.012]),
      part(box(0.05, 0.034, 0.012), BRASS, [-R + 0.03, 0, D / 2 + 0.012]),
    ]),
  );
  return { id: 'banjo', group };
}

// ---------- drum ----------

/** The hand drum's skin (radius) and how deep its shell is. */
export const DRUM = { r: 0.2, depth: 0.14 };

/** A hand drum: a painted shell that narrows a little to its foot, a skin head and a wooden hoop top and bottom. Frame: its middle at the origin, the skin toward +y. */
export function buildDrum(): Instrument {
  const { r: R, depth: D } = DRUM;
  const group = new THREE.Group();
  group.add(
    mesh('drum', () => [
      part(cyl(R, R - 0.02, D, 14), CORAL),
      part(cyl(R - 0.004, R - 0.004, 0.016, 14), CREAM, [0, D / 2, 0]),
      part(new THREE.TorusGeometry(R, 0.015, 5, 14), WOOD, [0, D / 2 - 0.01, 0], [QUARTER, 0, 0]),
      part(new THREE.TorusGeometry(R - 0.018, 0.013, 5, 14), WOOD, [0, -D / 2 + 0.008, 0], [QUARTER, 0, 0]),
      // A cream band round the shell's waist.
      part(cyl(R - 0.004, R - 0.007, 0.024, 14), CREAM, [0, 0, 0]),
    ]),
  );
  return { id: 'drum', group };
}

// ---------- squeezebox ----------

/** The squeezebox: its six-sided ends (corner radius and thickness), and how long its bellows are shut and at full stretch. */
export const SQUEEZEBOX = { r: 0.115, end: 0.05, shut: 0.1, open: 0.34 };
/** Folds in the bellows. */
const FOLDS = 5;

/**
 * A squeezebox, a small concertina: two six-sided wooden ends, each with a cream fret plate and a leather hand
 * strap, and red bellows between them that stretch (`squeeze`). Frame: its middle at the origin, the bellows along x,
 * a flat side down.
 */
export function buildSqueezebox(): Instrument {
  const { r: R, end: T } = SQUEEZEBOX;
  const group = new THREE.Group();
  // An end, its outer face toward +x; the other is the same one turned round.
  const end = (): THREE.Mesh =>
    mesh('squeezebox-end', () => [
      part(cyl(R, R, T, 6), 0x8a6440, [0, 0, 0], [0, 0, -QUARTER]),
      part(cyl(R * 0.62, R * 0.62, 0.012, 6), CREAM, [T / 2 + 0.004, 0, 0], [0, 0, -QUARTER]),
      part(box(0.012, 0.034, R * 1.5), DARK, [T / 2 + 0.022, 0.012, 0]),
      ...[-1, 0, 1].map((k) => part(cyl(0.011, 0.011, 0.016, 5), BRASS, [T / 2 + 0.012, -0.04, k * 0.03], [0, 0, -QUARTER])),
    ]);
  const ends: [THREE.Mesh, THREE.Mesh] = [end(), end()];
  ends[0].rotation.y = Math.PI;
  // The bellows: a zigzag turned round the x axis with six sides, red on its ridges and dark in its folds.
  const bellows = mesh('squeezebox-bellows', () => {
    const profile: THREE.Vector2[] = [];
    for (let i = 0; i <= FOLDS * 2; i++) profile.push(new THREE.Vector2(R * (i % 2 ? 0.95 : 0.7), i / (FOLDS * 2) - 0.5));
    return [part(new THREE.LatheGeometry(profile, 6), (x, _y, z) => (Math.hypot(x, z) > R * 0.8 ? CORAL : 0x4a2622), [0, 0, 0], [0, 0, -QUARTER])];
  });
  group.add(bellows, ...ends);
  const made: Instrument = { id: 'squeezebox', group, bellows, ends };
  squeeze(made, 0.3);
  return made;
}

/** Stretches a squeezebox's bellows: `open` from 0 (shut) to 1 (at full stretch); its ends move apart with them. */
export function squeeze(sq: Instrument, open: number): void {
  if (!sq.bellows || !sq.ends) return;
  const len = SQUEEZEBOX.shut + (SQUEEZEBOX.open - SQUEEZEBOX.shut) * Math.min(1, Math.max(0, open));
  sq.bellows.scale.x = len;
  sq.ends[0].position.x = -(len + SQUEEZEBOX.end) / 2;
  sq.ends[1].position.x = (len + SQUEEZEBOX.end) / 2;
}
/** How far apart the outer faces of a squeezebox's ends are when it is `open` (0 to 1). */
export const squeezeboxWidth = (open: number): number => SQUEEZEBOX.shut + (SQUEEZEBOX.open - SQUEEZEBOX.shut) * Math.min(1, Math.max(0, open)) + 2 * SQUEEZEBOX.end;

// ---------- whistle ----------

/** The tin whistle's length, mouthpiece and all, and its tube's radius: twice as thick as a real one, so it reads from across the fire. */
export const WHISTLE = { len: 0.46, r: 0.02 };

/** A tin whistle: a bright tin tube with six finger holes and a blue mouthpiece. Frame: the mouthpiece's tip at the origin, the tube running down -y, the holes toward +z. */
export function buildWhistle(): Instrument {
  const { len: L, r: R } = WHISTLE;
  const group = new THREE.Group();
  group.add(
    mesh('whistle', () => [
      part(cyl(R, R - 0.002, L - 0.07, 7), TIN_BRIGHT, [0, -(L + 0.07) / 2, 0]),
      part(cyl(R + 0.006, R + 0.003, 0.08, 7), BLUE, [0, -0.04, 0]),
      ...Array.from({ length: 6 }, (_, i) => part(box(0.014, 0.014, 0.008), IRON, [0, -0.17 - i * 0.045, R - 0.003])),
    ]),
  );
  return { id: 'whistle', group };
}

// ---------- washboard ----------

/** The washboard: how wide and how tall it is over its legs, and where its ribbed plate begins and ends (y, from its middle). */
export const WASHBOARD = { w: 0.34, h: 0.6, ribs: [-0.19, 0.12] as [number, number] };

/**
 * A washboard: two pale legs, a rail across the top and one under the ribs, a pale blue head board, and a tin plate
 * with seven ribs across it. Frame: its middle at the origin, standing along y, the ribs toward +z.
 */
export function buildWashboard(): Instrument {
  const { w: W, h: H, ribs } = WASHBOARD;
  const group = new THREE.Group();
  const inner = W - 0.08;
  group.add(
    mesh('washboard', () => [
      ...[-1, 1].map((side) => part(box(0.04, H, 0.032), PALE_PLANK, [(side * (W - 0.04)) / 2, 0, 0])),
      part(box(W, 0.036, 0.038), PALE_PLANK, [0, H / 2 - 0.018, 0]),
      part(box(inner, 0.13, 0.02), PALE_BLUE, [0, H / 2 - 0.1, 0]),
      part(box(inner, 0.03, 0.03), PALE_PLANK, [0, ribs[1] + 0.015, 0]),
      part(box(inner, 0.03, 0.03), PALE_PLANK, [0, ribs[0] - 0.015, 0]),
      part(box(inner, ribs[1] - ribs[0], 0.012), TIN, [0, (ribs[0] + ribs[1]) / 2, 0]),
      ...Array.from({ length: 7 }, (_, i) => part(cyl(0.012, 0.012, inner, 5), TIN_BRIGHT, [0, ribs[0] + 0.025 + i * ((ribs[1] - ribs[0] - 0.05) / 6), 0.008], [0, 0, QUARTER])),
    ]),
  );
  return { id: 'washboard', group };
}

// ---------- jug ----------

/** The jug: how tall it is and how wide at its belly (radius). */
export const JUG = { h: 0.38, r: 0.13 };

/**
 * A stoneware jug: cream below and brown-glazed over the shoulder and the neck, with a finger loop at the neck and a
 * dark mouth to blow across. Frame: the middle of its foot at the origin, standing along y, the loop toward +x.
 */
export function buildJug(): Instrument {
  const { h: H, r: R } = JUG;
  const group = new THREE.Group();
  // Where the glaze starts, with a ring of vertices either side of the line so it is a clean edge.
  const LINE = 0.19;
  const profile: [number, number][] = [
    [0.001, 0], [R - 0.04, 0], [R - 0.025, 0.02], [R, 0.12], [R - 0.002, LINE - 0.004], [R - 0.003, LINE + 0.004],
    [R - 0.04, 0.27], [0.05, 0.305], [0.045, H - 0.03], [0.058, H - 0.015], [0.058, H], [0.036, H],
  ];
  group.add(
    mesh('jug', () => [
      part(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 10), (_x, y) => (y > LINE ? GLAZE : STONEWARE)),
      part(cyl(0.037, 0.037, 0.004, 8), 0x2e2620, [0, H - 0.004, 0]),
      part(new THREE.TorusGeometry(0.04, 0.013, 5, 8), GLAZE, [0.078, 0.3, 0]),
    ]),
  );
  return { id: 'jug', group };
}

// ---------- all six, and standing by a log ----------

export const INSTRUMENT_BUILDERS: Record<InstrumentId, () => Instrument> = {
  banjo: buildBanjo,
  drum: buildDrum,
  squeezebox: buildSqueezebox,
  whistle: buildWhistle,
  washboard: buildWashboard,
  jug: buildJug,
};
export const buildInstrument = (id: InstrumentId): Instrument => INSTRUMENT_BUILDERS[id]();

/** The top of a log seat over the ground. */
const LOG_TOP = LOG.rest + LOG.thick;

/**
 * How each instrument waits at the end of its log, in the frame `campStands` (src/data/maps.ts) gives: the origin on
 * the ground under the middle of the log's end, +x on along the log away from it, y up. `lean` is how far it tips
 * back onto the log (radians from upright), `out` how far its foot stands from the log's end, `toFire` how far it is
 * moved toward the fire. Play-test: all of it.
 */
const REST = {
  // Its pot on the cobbles with the back of its rim against the log's end, its neck up past the log, the skin turned out.
  banjo: { lean: 0.28, out: 0.005 },
  // On its edge against the log's end, the skin turned out and up.
  drum: { lean: 0.5, out: 0.01, toFire: 0.06 },
  // Sitting on the cobbles a hand from the log, its bellows a little open, turned a little off the log's line.
  squeezebox: { out: 0.25, yaw: 0.35, open: 0.3, toFire: 0.1 },
  // Stuck upright in a collar on the top of the log's end, the mouthpiece up.
  whistle: { in: 0.1, lean: 0.07 },
  // Its legs on the cobbles, leaning on the top of the log's end, the ribs turned out.
  washboard: { lean: 0.3, out: 0.01 },
  // Standing a hand from the log, its loop turned to the fire.
  jug: { out: 0.21, yaw: -1.1 },
};

/**
 * The instrument of a fire log as it waits by the log while nobody plays it: built as `buildInstrument` builds it
 * and rested against or beside the log's end (`REST`). `end` is which end of the log it is at (`CampDef.logs.stands`):
 * the frame is turned round for the other end, so what is moved toward the fire is moved the other way in it.
 */
export function restInstrument(id: InstrumentId, end: 1 | -1 = 1): Instrument {
  const inst = buildInstrument(id);
  const g = inst.group;
  const stand = new THREE.Group();
  stand.add(g);
  // A leaning thing's axes: `up` along it, tipped back toward the log by `lean`, and `face` out of its front.
  const lean = (a: number) => ({ up: new THREE.Vector3(-Math.sin(a), Math.cos(a), 0), face: new THREE.Vector3(Math.cos(a), Math.sin(a), 0) });
  const Z = new THREE.Vector3(0, 0, 1);
  if (id === 'banjo') {
    const { up, face } = lean(REST.banjo.lean);
    const { pot: R, depth: D } = BANJO;
    // The pot's rim on the ground and the top of its back against the log's end.
    g.position.set(REST.banjo.out + (D / 2) * face.x + R * -up.x, R * up.y + (D / 2) * face.y, 0);
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(up, Z, face));
  } else if (id === 'drum') {
    const { up, face } = lean(REST.drum.lean);
    const { r: R, depth: D } = DRUM;
    // The shell's foot edge on the ground, the top of its back rim on the log's end.
    g.position.set(REST.drum.out + (D / 2) * face.x + R * -up.x, R * up.y + (D / 2) * face.y, end * REST.drum.toFire);
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(Z, face, up));
  } else if (id === 'squeezebox') {
    squeeze(inst, REST.squeezebox.open);
    // A flat side down: the six-sided ends stand `r cos 30°` over the ground.
    g.position.set(REST.squeezebox.out, SQUEEZEBOX.r * Math.cos(Math.PI / 6), end * REST.squeezebox.toFire);
    g.rotation.y = QUARTER + REST.squeezebox.yaw;
  } else if (id === 'whistle') {
    // A dark collar on the log, and the whistle standing in it.
    const collar = mesh('whistle-collar', () => [part(cyl(0.034, 0.042, 0.04, 7), DARK)]);
    collar.position.set(-REST.whistle.in, LOG_TOP - 0.004, 0);
    stand.add(collar);
    g.position.set(-REST.whistle.in + Math.sin(REST.whistle.lean) * WHISTLE.len, LOG_TOP - 0.02 + WHISTLE.len, 0);
    g.rotation.z = -REST.whistle.lean;
  } else if (id === 'washboard') {
    const { up, face } = lean(REST.washboard.lean);
    const H = WASHBOARD.h / 2;
    // Its legs' feet on the ground, its back on the log's top edge.
    const y = H * up.y + 0.016 * face.y;
    const t = (LOG_TOP - y) / up.y;
    g.position.set(REST.washboard.out + t * -up.x + 0.016 * face.x, y, 0);
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(Z.clone().negate(), up, face));
  } else {
    g.position.set(REST.jug.out, 0, 0);
    g.rotation.y = end * REST.jug.yaw;
  }
  return { ...inst, group: stand };
}

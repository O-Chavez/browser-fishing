import { CASINO_LEVEL } from './casino';
import { BOAT } from './sea';
import type { FaceId } from './cosmetics';

export interface Spot {
  x: number;
  z: number;
  /** Direction the object faces, in radians (0 = toward +z, positive turns toward +x). */
  facing: number;
}

/** Facing that points an object at a world position. */
export const faceToward = (x: number, z: number, tx: number, tz: number): number => Math.atan2(tx - x, tz - z);
/** The point `r` m from `c` at a bearing of `deg` degrees round from +z toward +x. */
export const atBearing = (c: { x: number; z: number }, r: number, deg: number): { x: number; z: number } => ({
  x: c.x + r * Math.sin((deg * Math.PI) / 180),
  z: c.z + r * Math.cos((deg * Math.PI) / 180),
});

/**
 * Mags's smoke shack on the quay's east side behind the deck, turned toward the pier root (docs/map-rework/harbour.json);
 * Marlow's stall mirrors it on the west side.
 */
const SMOKEHOUSE: Spot = { x: 5.5, z: 17.5, facing: -2.4 };
/** Where Mags stands: inside the shack, behind her counter. */
const MAGS = { x: SMOKEHOUSE.x - 0.75 * Math.sin(SMOKEHOUSE.facing), z: SMOKEHOUSE.z - 0.75 * Math.cos(SMOKEHOUSE.facing) };

/**
 * Captain Reed's corner: his own wharf under the west headland, at the foot of the lane from the quay's west end.
 * The lane runs straight down the water's edge onto a timber landing (`REED_WHARF` in env.ts), under a CHARTERS
 * arch at its head. Reed stands on the boards beside the nose of his seaplane, which is moored square to the
 * wharf's face, in view from the pier and both jetties; players come back from a charter on the boards in front
 * of him, and the Furthest Out board stands beside the lane on the way down (its look and words are
 * `FURTHEST_BOARD` in src/game/furthestboard.ts). Play-test: the spots.
 */
export const HARBOUR = {
  /** Reed stands on the wharf's boards by the plane's nose, facing up the lane through the arch. */
  stand: { x: -17.2, z: 0, facing: 0 } as Spot,
  /** The middle of the seaplane, between its floats, afloat off the wharf with its nose square to the boards. */
  plane: { x: -12.8, z: -1.6, facing: -Math.PI / 2 } as Spot,
  /** The middle of the CHARTERS arch, across the lane's last cobbles at the head of the wharf; players walk under it. */
  sign: { x: -17.2, z: 3.4, facing: 0 } as Spot,
  /** Where players land back from a charter: on the boards just inside the arch, looking at Reed and the plane. */
  diveStart: { x: -17.2, z: 2.4, yaw: 0 },
  /** The Furthest Out board, beside Reed's lane on the way down, turned to the lane. Play-test: the spot and the turn. */
  board: { x: -19.7, z: 8.1, facing: 1.2 } as Spot,
};
HARBOUR.diveStart.yaw = Math.atan2(-(HARBOUR.stand.x - HARBOUR.diveStart.x), -(HARBOUR.stand.z - HARBOUR.diveStart.z));

/**
 * Ember Point, the town's meeting place on the east headland (docs/community-zone/a-ember-point.md): a small open-air
 * theatre facing the cove. One round cobbled terrace, level, holds the fire and its seats: six logs round the fire, a
 * clear ring to walk behind them, and a low stone seat wall along the cove-side rim. Its back is a wall of panels on
 * the rim, each facing the fire: Thank You, Lake Legends, the stall's bay and Deep Sea, and a flower bed in the bay past it. The
 * ridge behind is cut away to the retaining wall's line, with a bank behind it for the hedge and the picket fence.
 * A crown of lights runs round the rim on tall posts. The campfire lane from the quay's east corner and the lane
 * from the village ring meet up the slope and come in under the gate arch on the quay side. Steps on the lake side
 * go down to Skipper's Beach, a shelf of sand with the rocket jetty off it (`ROCKET_JETTY` in env.ts).
 * `CAMP` holds where everything stands; town.ts builds it (`Town.buildCamp`) with the props of camp.ts, and hub.ts
 * the fire and the boards. Play-test: all of it.
 */
const CAMPFIRE = { x: 20.5, z: 2.7 };
/** A spot `r` m from the fire, `deg` degrees round from +z toward +x (0 is toward town, 90 the hill, 180 the lake, 270 the cove), facing it. */
const byFire = (r: number, deg: number): Spot => {
  const { x, z } = atBearing(CAMPFIRE, r, deg);
  return { x, z, facing: faceToward(x, z, CAMPFIRE.x, CAMPFIRE.z) };
};
/** A stretch of a circle round the fire: `r` m out, from one bearing to another (degrees, like `byFire`). */
export interface Arc { r: number; from: number; to: number }
/** The campfire's terrace (town.ts builds the first five) and where the camp's props stand; bearings are degrees round the fire, like `byFire`. */
export interface CampDef {
  /** Radius of the terrace's cobbles; a kerb of flat stones runs round them. */
  r: number;
  /**
   * Log seats for two round the fire, lying along a ring `r` m out: each one's bearing. `stands` says at which end
   * of each log its instrument waits while nobody plays it (`campStands`; the band is `src/data/band.ts`): 1 is the
   * end on its sitters' left, -1 the one on their right.
   */
  logs: { r: number; at: number[]; stands: (1 | -1)[] };
  /** The low stone seat wall along the cove-side rim, from one end to the other; its plank top leaves `gap` m clear at `pier`, where the stone runs through. */
  seatWall: { from: number; to: number; pier: number; gap: number };
  /** The crown of lights: tall posts on the rim at these bearings, a run of bulbs from each to the next and over the way in by the arch's cove-side post. */
  crown: number[];
  /** The stall's bay: the kerb gives way to cobbles out to `r` between these bearings. */
  apron: Arc;
  /** Log seats on the beach; `facing` is the way their sitters look. */
  beachLogs: Spot[];
  /** The middle of the gate arch across the lane, its front up the lane; its posts stand `w` apart. */
  arch: Spot & { w: number };
  /** The stall's middle, its counter toward the fire. */
  stall: Spot;
  /**
   * The flower bed in the bay on the rim between Deep Sea and the beach steps, `w` deep, outside the kerb on the bank
   * down to the beach, and the stone wall that holds it: the beach wall carried on from its end round the bed's
   * outer face and back to the kerb beside the steps. The Weekly Derby's stand goes here when the Derby is built.
   */
  bayBed: Arc & { w: number };
  bayWall: [number, number][];
  /** The retaining wall that holds the cut bank, in two arcs with the stall's back between them; the hedge behind its top and the picket fence behind that. */
  wall: Arc[];
  hedge: Arc;
  /** The stone gate piers the hedge ends on, each square to the hedge's end. */
  piers: Spot[];
  /** The fence's arc and its runs on from it: to the gate arch's outer post, and down the beach's east end (behind the beach wall as far as its last `via`) into the shallows, past where anyone can wade. */
  fence: { arc: Arc; runs: { from: [number, number]; via?: [number, number][]; to: [number, number] }[] };
  /** The cove side of the rim, between two bearings: the seat wall's footing, a battered face of stone that runs `w` m out and down to the water's edge. */
  rimFace: { from: number; to: number; w: number };
  /** The lantern's stone pier in the seat wall. */
  pier: Spot;
  /** The top of the steps down to the beach, facing down them; `w` wide, `treads` steps of `rise` each. */
  steps: Spot & { w: number; rise: number; treads: number };
  /**
   * The turf behind the panels, between two bearings, and `lip` m on past the last, level, to the low stone wall that
   * holds it above the beach. `beachWall` is that wall, in two runs: along the beach's back from beside the kerb to
   * the hedge's pier, and from the pier along the foot of the bank at the beach's east end to the fence.
   */
  turf: { from: number; to: number; lip: number };
  beachWall: [number, number][][];
  /** The beach's sand, between two bearings, out to `r` in the water or, short of that, to the fence down its east end. */
  sand: { from: number; to: number; r: number };
  /** The Legends' Totem on the beach's west tip, the stone pile and the skip sign at its east end. */
  totem: Spot;
  stones: { x: number; z: number };
  skipSign: Spot;
  /** The rocket rack at the jetty's end, its rockets leaning out over the lake, and the lantern on a pile off the end's corner. */
  rack: Spot;
  jettyLantern: { x: number; z: number };
  /** A short stone pier with a lantern by the foot of the beach steps: the beach's light. */
  beachLantern: Spot;
  /** The signpost where the lanes meet, its front to the lanes; each finger points to the post's right, swung `yaw` radians round toward its back. */
  signpost: Spot & { fingers: { text: string; yaw: number }[] };
  /** The flower bed behind Thank You, `w` deep. */
  flowers: Arc & { w: number };
}
/** The terrace's radius, and the line the boards stand on at its rim. */
const TERRACE = 5.5;
const PANELS = TERRACE + 0.1;
/** The middle line of the seat wall on the terrace's rim; the crown's posts stand on it too. */
export const campRim = (camp: CampDef): number => camp.r + 0.25;
/** Where the lanes meet above the terrace, and where the lane from there ends inside the cobbles. */
const CAMP_JUNCTION = { x: 17.4, z: 9.4 };
const CAMP_ENTRY = byFire(TERRACE - 0.3, 345);
/** The lane's direction from the junction down to the terrace, as a bearing in radians. */
const CAMP_LANE = Math.atan2(CAMP_ENTRY.x - CAMP_JUNCTION.x, CAMP_ENTRY.z - CAMP_JUNCTION.z);
/** A gate arch's two posts, the one nearer `near` first. */
export const archPosts = (arch: Spot & { w: number }, near: { x: number; z: number }): { x: number; z: number }[] =>
  [-1, 1]
    .map((side) => ({ x: arch.x + (side * arch.w * Math.cos(arch.facing)) / 2, z: arch.z - (side * arch.w * Math.sin(arch.facing)) / 2 }))
    .sort((a, b) => Math.hypot(a.x - near.x, a.z - near.z) - Math.hypot(b.x - near.x, b.z - near.z));
const CAMP_ARCH = { x: 18.3, z: 8.55, facing: CAMP_LANE + Math.PI, w: 2.4 };
/** The retaining wall's line behind the terrace, and the bearings its cut bank runs between; the wall, the hedge and the fence run its whole length. */
const CAMP_WALL = 8.55;
const CAMP_BANK: [number, number] = [14, 140];
/** A point `r` m from the fire at a bearing and `off` m on round from it (toward greater bearings), square to that line. */
const beside = (deg: number, r: number, off: number): [number, number] => {
  const p = byFire(r, deg);
  const turn = (deg * Math.PI) / 180;
  return [p.x + off * Math.cos(turn), p.z - off * Math.sin(turn)];
};
/** How far past the bank's lake end the turf runs on, level, to the wall at the bank's foot on the beach. */
const TURF_LIP = 0.8;
/** The hedge's line, and its piers (`PIER` m square): one before its first bearing and one past its last. */
const CAMP_HEDGE = 9.1;
const PIER = 0.75;
const hedgePier = (deg: number, side: number): Spot => {
  const [x, z] = beside(deg, CAMP_HEDGE, (side * PIER) / 2);
  return { x, z, facing: (deg * Math.PI) / 180 };
};
/** The picket fence's line behind the hedge, where its arc ends above the beach, and the arch's outer post, which it runs to from the hedge's pier. */
const CAMP_FENCE = 9.6;
const FENCE_END = byFire(CAMP_FENCE, CAMP_BANK[1]);
const GATE_POST = archPosts(CAMP_ARCH, CAMPFIRE)[1];
/** The stall stands back from the rim, its back in the line of the retaining wall, which stops either side of it. */
const CAMP_STALL = byFire(7.3, 90);
const STALL_GAP = 12;
/** The beach steps: each tread's rise and depth (`TREAD_DEPTH` in camp.ts), three treads from the terrace down to the sand. */
const STEP = { rise: 0.4 / 3, depth: 0.42, treads: 3 };
const CAMP_STEPS = { ...byFire(TERRACE + 0.3, 180), facing: Math.PI, w: 2 };
const CAMP: CampDef = {
  r: TERRACE,
  // Each instrument waits at its sitters' right-hand end, so there is one to a gap between logs and the ways in from
  // the gate (345°) and the beach steps (180°) stay empty; the last log's right-hand end is the gate's opening, so
  // its jug stands at the other. Play-test: which ends.
  logs: { r: 2.9, at: [20, 65, 110, 150, 215, 310], stands: [-1, -1, -1, -1, -1, 1] },
  // The wall stops short of the arch's cove-side post, which stands on its line.
  seatWall: { from: 200, to: 328, pier: 267, gap: 0.8 },
  // None stands in a walking line or in front of a board: they flank the boards, the bays and the steps.
  crown: [9, 36, 69, 111, 144, 170, 191, 229, 267, 301],
  apron: { r: 6.4, from: 74, to: 106 },
  // East of the clear way from the steps to the jetty, turned to the water.
  beachLogs: [
    { x: 21.8, z: -5.5, facing: (150 * Math.PI) / 180 },
    { x: 21.7, z: -7.1, facing: (190 * Math.PI) / 180 },
  ],
  arch: CAMP_ARCH,
  stall: CAMP_STALL,
  bayBed: { r: TERRACE + 0.535, from: 150, to: 167.5, w: 0.43 },
  bayWall: [beside(CAMP_BANK[1], 6.33, TURF_LIP), ...[153, 158.5, 164].map((deg) => beside(deg, TERRACE + 0.875, 0)), beside(180, 6.26, -1.2), beside(180, 5.72, -1.2)],
  wall: [
    { r: CAMP_WALL, from: CAMP_BANK[0], to: 90 - STALL_GAP },
    { r: CAMP_WALL, from: 90 + STALL_GAP, to: CAMP_BANK[1] },
  ],
  hedge: { r: CAMP_HEDGE, from: CAMP_BANK[0], to: CAMP_BANK[1] },
  piers: [hedgePier(CAMP_BANK[0], -1), hedgePier(CAMP_BANK[1], 1)],
  fence: {
    arc: { r: CAMP_FENCE, from: CAMP_BANK[0], to: CAMP_BANK[1] },
    runs: [
      { from: beside(CAMP_BANK[0], CAMP_HEDGE, -PIER), to: [GATE_POST.x, GATE_POST.z] },
      { from: [FENCE_END.x, FENCE_END.z], via: [[26.2, -6], [26, -7.6], [25.2, -9.6]], to: [22.2, -12.05] },
    ],
  },
  rimFace: { from: 197, to: 325, w: 1.3 },
  pier: byFire(TERRACE + 0.25, 267),
  steps: { ...CAMP_STEPS, rise: STEP.rise, treads: STEP.treads },
  // The turf starts where the lane's cobbles meet the kerb. Its wall stands on the beach's sand: from beside the kerb
  // to the pier at the hedge's end, and from the pier's far side round the stones and the skip sign to the fence.
  turf: { from: -5, to: CAMP_BANK[1], lip: TURF_LIP },
  beachWall: [
    [beside(CAMP_BANK[1], TERRACE + 0.5, TURF_LIP), beside(CAMP_BANK[1], CAMP_HEDGE - 0.35, TURF_LIP)],
    [beside(CAMP_BANK[1], CAMP_HEDGE, PIER), [25.55, -6], [25.55, -7.6], [25.3, -9.3]],
  ],
  sand: { from: CAMP_BANK[1], to: 222, r: 14.5 },
  // Its faces turned to whoever comes down the beach steps; the pier sees it side on against the open water.
  totem: { x: 17.75, z: -4.6, facing: faceToward(17.75, -4.6, CAMPFIRE.x, -3.6) },
  stones: { x: 24.7, z: -6.4 },
  skipSign: { x: 24.9, z: -5, facing: faceToward(24.9, -5, 21.5, -5.6) },
  // The rack and its crate fill the jetty's end from edge to edge.
  rack: { x: 18.89, z: -11.7, facing: Math.PI },
  jettyLantern: { x: 17.15, z: -12.15 },
  // West of the steps' foot, off the way to the jetty, where it lights the sand, the logs and the Totem's faces.
  beachLantern: { x: 18.95, z: -4.05, facing: faceToward(18.95, -4.05, 20.6, -5.6) },
  // On the cove side of the round where the lanes meet, off the cobbles, turned to both lanes: its fingers point
  // on through the arch, high enough to walk under.
  signpost: {
    x: 16.15, z: 8.75, facing: faceToward(16.15, 8.75, 17, 10.6),
    fingers: [{ text: 'Fire', yaw: 0.12 }, { text: 'Stones', yaw: 0.3 }, { text: 'Rockets', yaw: 0.5 }],
  },
  flowers: { r: 6.9, from: -4, to: 30, w: 0.9 },
};
/** Bram Tinder's spot behind his stall's counter (`KETTLE_KEEPER` in camp.ts: 0.1 m in front of the stall's middle). */
const BRAM = byFire(7.2, 90);
/** The seat wall's planks, each one's middle bearing and length: laid end to end between the wall's ends, the crown's posts that rise through it and the pier's gap, about `SEAT` m each. One seat on every plank. */
const SEAT = 1.05;
export function seatPlanks(camp: CampDef): { deg: number; len: number }[] {
  const mid = campRim(camp);
  const { from, to, pier, gap } = camp.seatWall;
  const half = ((gap / 2 / mid) * 180) / Math.PI;
  const breaks = [from, ...camp.crown.filter((d) => d > from && d < to && d !== pier), pier - half, pier + half, to].sort((a, b) => a - b);
  const planks: { deg: number; len: number }[] = [];
  for (let i = 1; i < breaks.length; i++) {
    const [a, b] = [breaks[i - 1], breaks[i]];
    // The stretch between the pier's two edges is its gap.
    if (a === pier - half) continue;
    const run = (((b - a) * Math.PI) / 180) * mid;
    const n = Math.max(1, Math.round(run / SEAT));
    for (let k = 0; k < n; k++) planks.push({ deg: a + ((b - a) * (k + 0.5)) / n, len: run / n });
  }
  return planks;
}
/**
 * A log seat: where its two sitters rest and its two colliders stand, as metres along it from its middle, and the
 * colliders' radius; and the log itself, `len` m long and `thick` m in radius, its middle line `rest` m over the ground.
 */
export const LOG = { seats: [-0.38, 0.38], solids: [-0.45, 0.45], r: 0.3, len: 1.5, thick: 0.22, rest: 0.2 };
/** The middle of every log seat at the camp, round the fire and on the beach; `facing` is the way its sitters look. */
export function campLogs(map: MapDef): Spot[] {
  const camp = map.camp;
  if (!camp) return [];
  const fire = map.campfire;
  const facingFire = (deg: number, r: number): Spot => {
    const { x, z } = atBearing(fire, r, deg);
    return { x, z, facing: faceToward(x, z, fire.x, fire.z) };
  };
  return [...camp.logs.at.map((deg) => facingFire(deg, camp.logs.r)), ...camp.beachLogs];
}
/**
 * Where each fire log's instrument waits while nobody plays it, in the fire logs' order: the spot on the ground
 * under the middle of the log's end (`CampDef.logs.stands` says which end), turned so that a prop's +x there points
 * on along the log, away from it. The instruments' builders (src/game/instruments.ts) rest each one against or
 * beside that end.
 */
export function campStands(map: MapDef): Spot[] {
  const camp = map.camp;
  if (!camp) return [];
  return campLogs(map)
    .slice(0, camp.logs.at.length)
    .map((l, i) => {
      const end = camp.logs.stands[i] ?? -1;
      const lx = (end * LOG.len) / 2;
      return { x: l.x + lx * Math.cos(l.facing), z: l.z - lx * Math.sin(l.facing), facing: end > 0 ? l.facing : l.facing + Math.PI };
    });
}
/**
 * How high each kind of seat's top is over the ground it stands on, where a seated body rests (the seated look,
 * src/game/emotes/looks/sit.ts): a log seat, a plank of the campfire's seat wall, and a town bench.
 */
export const SEAT_TOP = { log: LOG.rest + LOG.thick, wall: 0.46, bench: 0.55 };
/** Every seat at the camp: two on each log, one on each plank of the seat wall, facing the fire; `top` is the seat's height (`SEAT_TOP`). */
export function campSeats(map: MapDef): (Spot & { top: number })[] {
  const camp = map.camp;
  if (!camp) return [];
  const fire = map.campfire;
  return [
    ...campLogs(map).flatMap((l) => LOG.seats.map((lx) => ({ x: l.x + lx * Math.cos(l.facing), z: l.z - lx * Math.sin(l.facing), facing: l.facing, top: SEAT_TOP.log }))),
    ...seatPlanks(camp).map((p) => {
      const { x, z } = atBearing(fire, campRim(camp), p.deg);
      return { x, z, facing: faceToward(x, z, fire.x, fire.z), top: SEAT_TOP.wall };
    }),
  ];
}
/** Where a player stands to read a board: `d` m in front of its face. */
export const readingSpot = (board: Spot, d = 1.5): { x: number; z: number } => ({ x: board.x + d * Math.sin(board.facing), z: board.z + d * Math.cos(board.facing) });

export interface HouseDef extends Spot {
  /** Wall and roof colours. */
  wall: number;
  roof: number;
  /** Optional hanging sign by the door. */
  sign?: string;
  /** A fenced garden beside the door, on the house's own +x side (1) or -x side (-1); its sign hangs on the -x side. */
  yard?: 1 | -1;
}

export interface NpcDef extends Spot {
  name: string;
  /** Cycled one by one each time the player talks to them. */
  lines: string[];
  /** Used instead of `lines` after dark, if given. */
  nightLines?: string[];
  coat: number;
  hat?: number;
  /** Painted face, from `FACES` (defaults to a smile). */
  face?: FaceId;
  /** A headscarf instead of a hat or hair. */
  scarf?: number;
  /** A work apron over the coat. */
  apron?: number;
  /** A keeper behind a counter: the way the counter faces. They are talked to from its front, by a player looking at it. */
  front?: number;
  /** What they sell across their counter: talking to them opens it, led by their next line (Bram Tinder's rockets, `src/data/rockets.ts`). */
  sells?: 'rockets';
  /** A loop they stroll around; without one they stand still. */
  walk?: NpcWalk;
}

/** A stop on an NPC's walk: they pause there `wait` seconds, turned toward `face` if given. */
export interface NpcStop {
  x: number;
  z: number;
  wait?: number;
  face?: number;
}

/**
 * Starts and ends at the NPC's own spot, where they pause `wait` seconds facing `facing`, and visits
 * `stops` in order in between. Legs run straight, so each one must stay clear of water and props.
 */
export interface NpcWalk {
  /** Metres per second. */
  speed: number;
  wait: number;
  stops: NpcStop[];
}

export interface BottleDef { id: string; x: number; z: number; note: string }

/** Decorative and explorable parts of the town around the shop. */
export interface TownDef {
  /** The cobbled square with the well. */
  square: { x: number; z: number; r: number };
  houses: HouseDef[];
  npcs: NpcDef[];
  bottles: BottleDef[];
  /** Waterfront fish-drying racks and rowboats. */
  racks: Spot[];
  boats: Spot[];
  /** Flower beds: centre and size. */
  flowers: { x: number; z: number; w: number; d: number }[];
  /** Cobbled paths: the main street and the lanes, each a straight strip `w` wide. */
  paths: { from: [number, number]; to: [number, number]; w: number }[];
  /** Round cobbled patches besides the square (the campfire's terrace), laid on the ground like the paths. */
  circles?: { x: number; z: number; r: number }[];
  /** Benches besides the square's own pair; on a dock they stand on the deck. */
  benches: Spot[];
  /** Trees inside the town, where the forest keeps out: leafy ones among the houses, pines round the edge. `s` is the scale. */
  trees: { x: number; z: number; s: number; pine?: boolean }[];
}

export interface MapDef {
  id: string;
  /** Visual/fish palette in `LOCATIONS`. */
  locationId: string;
  name: string;
  /** Where new players appear. */
  /** Camera yaw 0 looks along -z, toward the water at the end of the dock. */
  spawn: { x: number; z: number; yaw: number };
  /** Where players coming back through the gate from `next` appear, instead of `spawn`. */
  gateArrival?: { x: number; z: number; yaw: number };
  /** Flat build area for the hub. */
  pad: { x: number; z: number; r: number; h: number };
  vendor: { name: string; shop: Spot; npc: Spot; face?: FaceId };
  gate: Spot;
  /** The Lake Legends board: every account's best lake catch; E opens the player list. */
  leaderboard: Spot;
  /** The Deep Sea board: every account's best charter catch. */
  seaboard?: Spot;
  /** The smaller Thanks board listing supporters. */
  thanks: Spot;
  campfire: Spot;
  /** Beach patch where broke players with no bait can dig up worms. */
  worms?: { x: number; z: number };
  /** What this map's shop menu sells (ids from `RODS`, `LINES` and `BAITS`). */
  stock: { rods: string[]; lines: string[]; bait: string[] };
  next: { id: string; name: string } | null;
  /** Walkable radius from the map origin. */
  radius: number;
  /** Where the random forest and shore rocks stay out: lanes, beaches and the bare headland tips behind their pines. */
  clearings?: { x: number; z: number; r: number }[];
  /** Flat sand banks (`Apron` in env.ts) the quay's rear and ends stand on, so the deck meets the ground flush. */
  aprons?: { x0: number; x1: number; z0: number; z1: number; h: number }[];
  /** Level floors cut into a slope and built out from it (`Level` in env.ts): the campfire's terrace and its beach. */
  levels?: { x: number; z: number; h: number; hw: number; hd?: number; rot?: number; arc?: [number, number]; cut: number; bank?: number; blend?: number; grass?: boolean }[];
  /** The campfire's terrace and the camp round it (`CAMP`). */
  camp?: CampDef;
  /** A rock islet with a tree and a lantern out in the lake: its centre and the radius casts stop short of. */
  islet?: { x: number; z: number; r: number };
  town: TownDef;
  /** Mags Cinder's smoke shack: the middle of its counter, facing out; the shack stands behind it. */
  smokehouse?: Spot;
  /** Captain Reed's seaplane charters (`HARBOUR`): where he stands, the plane, his sign arch and where charters come back to. */
  harbour?: { stand: Spot; plane: Spot; sign: Spot; board: Spot; diveStart: { x: number; z: number; yaw: number } };
  /** The open sea: players stand on the charter boat's deck (`BOAT` in sea.ts) instead of the shore. */
  sea?: boolean;
  /** Casino maps: where the tables and prize counter stand. */
  casino?: { roulette: Spot; blackjack: Spot; wheel: Spot; prizes: Spot; mirror: Spot; records: Spot; hall: { x: number; z: number; w: number; d: number } };
  /** Player level needed to travel here. */
  minLevel?: number;
}

/**
 * Map template. To add a map: add a `Location` palette and fish in content.ts, then add a
 * `MapDef` here with its own spawn, hub layout and `next` link.
 */
export const MAPS: MapDef[] = [
  {
    id: 'pond',
    locationId: 'pond',
    name: 'Starter Pond',
    spawn: { x: 0, z: 1, yaw: 0 },
    // The harbour's town pad (docs/map-rework/harbour.json): its bank carries dry ground down to the quay at z 14.5.
    pad: { x: 0, z: 37, r: 21.5, h: 0.9 },
    vendor: {
      name: 'Marlow',
      face: 'joy',
      // Behind the quay's west half, turned toward the pier root; Marlow stands inside the shack at its window
      // (`KEEPER_Z` in baitshop.ts).
      shop: { x: -5.5, z: 17.5, facing: 2.4 },
      npc: { x: -5.5 - 0.85 * Math.sin(2.4), z: 17.5 - 0.85 * Math.cos(2.4), facing: 2.4 },
    },
    gate: { x: 0, z: 56, facing: Math.PI },
    // Just inside the arch, facing into town, and outside the gate's own "Travel" prompt.
    gateArrival: { x: 0, z: 50.5, yaw: 0 },
    // The wall of panels on the terrace's back rim (`CAMP`), each facing the fire and read from the clear ring behind
    // the logs: Thank You, Lake Legends, then past the stall's bay Deep Sea.
    leaderboard: byFire(PANELS, 52),
    seaboard: byFire(PANELS, 128),
    thanks: byFire(PANELS, 21),
    // The campfire on the east headland, seen across the water from the jetty bench.
    campfire: { ...CAMPFIRE, facing: 0 },
    // Beside the top of Reed's lane.
    worms: { x: -18.6, z: 12 },
    smokehouse: SMOKEHOUSE,
    harbour: HARBOUR,
    stock: { rods: ['twig', 'fiberglass', 'graphite', 'carbon', 'aurora'], lines: ['twine', 'mono', 'fluoro', 'braid', 'moonsilk'], bait: ['worm', 'fly', 'minnow', 'lure', 'pearl'] },
    next: { id: 'casino', name: 'Casino Cove' },
    radius: 100,
    aprons: [
      // Along the quay's rear edge, and under its two ends where the lanes to Reed's beach and the campfire leave it.
      { x0: -13.5, x1: 13.5, z0: 13.5, z1: 16.5, h: 0.72 },
      { x0: -16, x1: -11, z0: 9.5, z1: 16.5, h: 0.72 },
      { x0: 11, x1: 16, z0: 9.5, z1: 16.5, h: 0.72 },
      // Reed's lane on a low bank down the water's edge to his wharf, and the sand behind the wharf level with its
      // boards. Both stop short of the wharf's face, so it stands in water. Play-test: the shore.
      { x0: -18.6, x1: -16.2, z0: 3, z1: 9.5, h: 0.72 },
      { x0: -20.2, x1: -18.6, z0: -4.4, z1: 3, h: 0.72 },
      // The quay's east bank carried on under the campfire lane and the lane from the village ring, so neither has
      // a dip to cross where the bank's edge met the foot of the hill.
      { x0: 15.5, x1: 17.2, z0: 9.6, z1: 12, h: 0.72 },
    ],
    // The camp's ground, laid in this order. The bank behind the retaining wall: the ridge's top, levelled and carried
    // on round the terrace's back where the ground falls away behind it. The beach: a shelf of sand on the point's
    // lake side, cut into the foot of that bank at its east end, and a round of it under the Totem on its west tip.
    // The terrace's back: turf, flat from its rim to a step past the wall's line, so the wall holds the bank and the
    // bank's foot stays behind it. The terrace itself, built up on its water side, where its bank is steeper than the
    // quay's so the shore keeps close to where it was. The round where the lanes meet and a causeway from it, at the
    // same height, that carries the lane in under the arch; their banks are steeper still, so the reeds below keep
    // their ground. The sand at the jetty's root, up to its boards. And the ramp of sand under the beach steps, which
    // falls a tread's rise in a tread's depth.
    // Play-test: the heights and the shore.
    levels: [
      { ...CAMPFIRE, h: 1.7, hw: 11.2, arc: [CAMP_BANK[0] - 4, CAMP_BANK[1]], cut: 0, bank: 1, blend: 1 },
      { x: 21.15, z: -5.4, h: 0.45, hw: 3.75, hd: 2.55, cut: 0.7, bank: 0.75, blend: 1 },
      { ...CAMP.totem, h: 0.45, hw: 1.2, cut: 0, bank: 0.75 },
      { ...CAMPFIRE, h: 0.85, hw: CAMP_WALL + 0.85, arc: [CAMP_BANK[0] - 6, CAMP_BANK[1]], cut: 0, bank: 0.75, blend: 1, grass: true },
      { ...CAMPFIRE, h: 0.85, hw: TERRACE + 0.4, cut: 1, bank: 0.75 },
      { ...CAMP_JUNCTION, h: 0.85, hw: 1.3, cut: 0.4, bank: 1 },
      { x: CAMP_JUNCTION.x + 1.2 * Math.sin(CAMP_LANE), z: CAMP_JUNCTION.z + 1.2 * Math.cos(CAMP_LANE), h: 0.85, hw: 1.4, hd: 1.2, rot: CAMP_LANE, cut: 0.4, bank: 1 },
      { x: 18.5, z: -7.2, h: 0.6, hw: 0.9, hd: 0.3, cut: 0, bank: 2 },
      { x: CAMP_STEPS.x, z: CAMP_STEPS.z, h: 0.85, hw: CAMP_STEPS.w / 2, hd: 0, cut: 0, bank: STEP.rise / STEP.depth },
    ],
    camp: CAMP,
    // The eye's target from the pier: 30 m past the T end and a few metres left of the pier's line, so it sits in
    // the first look without standing in front of the cast. Play-test: the spot.
    islet: { x: -4.5, z: -39, r: 6.2 },
    clearings: [
      // Reed's beach and wharf, his lane, the campfire headland, and the two ring lanes down to the water.
      { x: -19.5, z: 4, r: 7 },
      { x: -15, z: 11, r: 3.5 },
      { x: 18, z: 2, r: 5 },
      // The terrace's back and the bank behind it, where the ground was too low for trees before it was built up.
      // Sized to stop short of the trees that stand round it.
      { x: 25.5, z: 4.5, r: 6 },
      { x: -16.5, z: 18, r: 6 },
      { x: 18, z: 20, r: 6 },
      // The headland tips stay bare behind their four pines, so the pines stand against the sky. Play-test: the radius.
      { x: 21, z: -2, r: 9 },
      { x: -22.5, z: -1, r: 9 },
    ],
    town: {
      square: { x: 0, z: 32, r: 5.5 },
      houses: [
        // Close to the street, 4-5 m back from its edge, so the walk up is a village street and not a plain: the
        // Fishmonger and Net Mender behind the stalls, Wren's and the blue house on the square, two more by the gate.
        // Play-test: how close.
        { x: -8.6, z: 23, facing: faceToward(-8.6, 23, -2.2, 23.5), wall: 0xe6c9c9, roof: 0x4a7a4a, sign: 'Fishmonger', yard: -1 },
        { x: 9.2, z: 25.5, facing: faceToward(9.2, 25.5, 2.2, 26), wall: 0xd9d2c5, roof: 0x7a3f3f, sign: 'Net Mender', yard: 1 },
        { x: -11.5, z: 35.5, facing: faceToward(-11.5, 35.5, -3, 33), wall: 0xe8d7b0, roof: 0xb5473a, sign: "Wren's Cottage", yard: 1 },
        { x: 10.5, z: 38.5, facing: faceToward(10.5, 38.5, 3, 35), wall: 0xc9d9e0, roof: 0x3f6f8f, yard: 1 },
        { x: -8.8, z: 45.6, facing: 2.3, wall: 0xe0c3a0, roof: 0x6b4a8a },
        { x: 8.8, z: 49.6, facing: -2.6, wall: 0xd8e0c0, roof: 0x8a5a2b },
      ],
      npcs: [
        {
          // On the quay by the pier root; strolls out to the T end and back.
          name: 'Old Salty', face: 'sleepy', x: 2.5, z: 12, facing: faceToward(2.5, 12, 0, 7), coat: 0x3d5a80, hat: 0xd9b84a,
          walk: {
            speed: 0.9,
            wait: 6,
            stops: [
              { x: 0, z: 7 },
              { x: 0, z: -7.5, wait: 8, face: Math.PI },
              { x: 0, z: 7 },
            ],
          },
          lines: [
            'The far end of the pier is where the big ones bite. Stand out on the T and see.',
            "Nothing wrong with the shore, but the fish there are lazy and small. The pier's the thing.",
            'A gold-zone cast pulls better fish toward your bait. Practice your timing.',
            "Run dry of bait and coin? Dig in the soft sand at the top of Reed's lane, past the quay's west end. Worms aplenty.",
          ],
          nightLines: ['Fireflies on the water... best time of day. The quiet ones always bite after dark.'],
        },
        {
          name: 'Pip', face: 'tongue', x: 2.6, z: 33.5, facing: faceToward(2.6, 33.5, 0, 32), coat: 0xc2543d,
          // Laps the well, then runs down the main path and round to the fish racks behind the Smokehouse.
          walk: {
            speed: 2.2,
            wait: 3,
            stops: [
              { x: 0, z: 37.5 },
              { x: -1.63, z: 36.8 },
              { x: -2.3, z: 32 },
              { x: -1.63, z: 27.9 },
              { x: 0, z: 26.5 },
              { x: 3.5, z: 23 },
              // Round the Smokehouse's back to the racks, clear of the smoker behind it.
              { x: 10.6, z: 21.6, wait: 4, face: faceToward(10.6, 21.6, 9, 20.2) },
              { x: 3.5, z: 23 },
              { x: 0, z: 26.5 },
              { x: 2.9, z: 31.1 },
            ],
          },
          lines: [
            'Psst! I found a message in a bottle under the bench on the little jetty. There are more hidden around town!',
            'Better bait lets you hook rarer fish. A better rod makes the fight easier.',
            "Granny Wren says seven bottles are scattered around. I've only found two...",
          ],
        },
        {
          name: 'Granny Wren', face: 'smile', x: -6.8, z: 33, facing: faceToward(-6.8, 33, -3, 32), coat: 0x7a4a8a, hat: 0xeeeeee,
          walk: {
            speed: 0.7,
            wait: 8,
            stops: [
              { x: -6.9, z: 30.9 },
              { x: -6.4, z: 35.2, wait: 5, face: Math.PI / 2 },
              { x: -7, z: 38.2, wait: 3 },
            ],
          },
          lines: [
            "I've seen this town change. Folks used to leave notes in bottles for luck. They wash up in odd corners.",
            'Sit by the campfire out on the headland when you tire. Cozy there, with the whole cove in front of you.',
            'Collect every bottle and the town will thank you handsomely.',
          ],
          nightLines: ['Mind the dark paths, dear. Follow the lamps.'],
        },
        {
          // Stands behind her counter; the counter itself opens the Smokehouse menu.
          name: 'Mags Cinder', face: 'grin', ...MAGS, facing: SMOKEHOUSE.facing, coat: 0xb5654a, scarf: 0xc0392b, apron: 0x5a3a24,
          lines: [
            "Fish in, smoke out. Don't touch the racks.",
            "Bring me fish, a few at a time if you must. The rack keeps what you've brought.",
            'Smoke keeps going while you sleep. Fill my racks before you head off.',
            "Ten batches of the same and you'll have the knack of it. Then I'll smoke you two for one.",
          ],
          nightLines: ["Lantern Glaze, that's the night angler's secret. The eels bite from dusk with a bit of that in you."],
        },
        {
          name: 'Captain Reed', face: 'grin', ...HARBOUR.stand, coat: 0x2f4f4f, hat: 0x2b2b2b,
          // Talking to Reed opens his charter panel (`reedHtml`, src/game/divehud.ts), which leads with his next line.
          lines: [
            'A charter lasts till my hold is full. A fish that gets away takes no room. The Shelf is free.',
            'Further out, fish pay more and fight harder. Coins buy a bigger hold and a better rod.',
            'Black Pearls buy the boat part that opens the next zone.',
            'The Abyss has no end. Every fifth fish takes us a marker further.',
          ],
        },
        {
          // The fire keeper, behind the counter of his stall at the campfire (`CAMP.stall`), where he sells rockets.
          name: 'Bram Tinder', face: 'joy', ...BRAM, front: CAMP_STALL.facing, coat: 0xc98a2b, hat: 0x7a2f2a, apron: 0x3d4450, sells: 'rockets',
          lines: [
            "Welcome to Anglers' Rest. Pull up a log. The kettle's always on.",
            "Rockets, three sizes. Light one at the rack on the jetty's end and the whole lake looks up.",
            "Lake Legends and Deep Sea, behind you. That fish over each board is the one to beat, and that's its angler's name under it.",
            "Walk up to any seat and take it. The wall's the best spot to watch the cove.",
            "Skipper's Beach is down the steps, and the jetty's past it.",
          ],
          nightLines: ["Fire's best after dark. So is the company."],
        },
      ],
      bottles: [
        { id: 'b1', x: 7.0, z: 7.2, note: 'Day 3. Caught nothing. Again. The pier is where I should have been.' },
        { id: 'b2', x: -21, z: -1, note: 'To whoever finds this: the best catch of my life was a tiny trout with a big heart.' },
        { id: 'b3', x: -19.5, z: 38, note: 'The Net Mender swears he mended a net that caught a ghost.' },
        { id: 'b4', x: 12.5, z: 58, note: 'Smoked fish keeps the winter at bay. Share the first of the season.' },
        { id: 'b5', x: -14.5, z: 51, note: 'A gate at the edge of town leads somewhere wonderful. Keep fishing.' },
        // On the beach below the fire, at the water's edge west of the jetty's root: out of reach of the beach's seats,
        // so walking up to one offers the seat.
        { id: 'b6', x: 17.3, z: -6.4, note: 'Warm hands by the fire, cold water at my feet. Perfect.' },
        { id: 'b7', x: -4.4, z: -8.3, note: 'You found the secret at the end of the pier. Well fished, friend.' },
      ],
      racks: [
        // Behind the quay road's east end, clear of its cobbles.
        { x: 11, z: 17.8, facing: 0.3 },
        { x: 9, z: 20.2, facing: 1.2 },
      ],
      // Moored in the water beside the west jetty.
      boats: [{ x: -10.3, z: 6.2, facing: 0.2 }],
      flowers: [
        // Wren's beds, by her gable and past her door; the blue house's either side of it.
        { x: -13.4, z: 30.6, w: 2.5, d: 0.8 },
        { x: -8.4, z: 39.2, w: 2.5, d: 0.8 },
        { x: 12, z: 34.5, w: 2.5, d: 0.8 },
        { x: 12.4, z: 42.8, w: 2.5, d: 0.8 },
        { x: -6.5, z: 49.5, w: 2, d: 0.8 },
        { x: 5.2, z: 47.3, w: 2, d: 0.8 },
        // Under the Fishmonger's front window, by the bench on the walk up.
        { x: -5.9, z: 21.3, w: 0.8, d: 2 },
      ],
      paths: [
        // The main street from the quay's rear edge to the gate.
        { from: [0, 14.5], to: [0, 54.5], w: 4.4 },
        // The quay road: cobbles along the deck's rear edge in front of the two stalls, so the deck meets stone. It
        // runs the deck's whole length, wraps round each of its rear corners and carries on down as a lane, so one
        // cobbled way leads from the square to Reed's beach and to the campfire. Each bend is two gentle turns.
        { from: [-11.6, 15.6], to: [11.6, 15.6], w: 2.2 },
        // Lanes off the square and the upper street to the houses' doors.
        { from: [-2, 32], to: [-8.4, 34.5], w: 1.6 },
        { from: [2, 32], to: [7.6, 36.9], w: 1.6 },
        { from: [-1.5, 42], to: [-6.3, 43.5], w: 1.6 },
        { from: [1.5, 42.5], to: [7, 46.9], w: 1.6 },
        // Reed's lane: the quay road's west arm, round the deck's corner, on to the water's edge and straight down it
        // to his wharf, where its cobbles run on to the first boards.
        { from: [-11.6, 15.6], to: [-13.7, 14.5], w: 2.2 },
        { from: [-13.7, 14.5], to: [-14.8, 12.6], w: 2.2 },
        { from: [-14.8, 12.6], to: [-17.2, 8.6], w: 2.2 },
        { from: [-17.2, 8.6], to: [-17.2, 4.45], w: 2.2 },
        // The campfire lane: its east arm, round the deck's other corner and along the foot of the hill to where the
        // lanes meet, and from there down under the arch onto the terrace (`circles`).
        { from: [11.6, 15.6], to: [13.7, 14.5], w: 2.2 },
        { from: [13.7, 14.5], to: [14.6, 12.2], w: 2.2 },
        { from: [14.6, 12.2], to: [CAMP_JUNCTION.x, CAMP_JUNCTION.z], w: 2.2 },
        { from: [CAMP_JUNCTION.x, CAMP_JUNCTION.z], to: [CAMP_ENTRY.x, CAMP_ENTRY.z], w: 2.2 },
        // The village ring: west from the square between Wren's and the Fishmonger's garden, down past the worm patch into Reed's lane...
        { from: [-4.5, 30.5], to: [-12.5, 28.6], w: 1.6 },
        { from: [-12.5, 28.6], to: [-16.5, 22], w: 1.6 },
        { from: [-16.5, 22], to: [-17, 15], w: 1.6 },
        { from: [-17, 15], to: [-15.5, 11.2], w: 1.6 },
        // ...and east between the blue house and the Net Mender's garden, down to where it meets the campfire lane.
        { from: [4.8, 31.2], to: [15.5, 31], w: 1.6 },
        { from: [15.5, 31], to: [18.5, 24], w: 1.6 },
        { from: [18.5, 24], to: [18.5, 16], w: 1.6 },
        { from: [18.5, 16], to: [CAMP_JUNCTION.x, CAMP_JUNCTION.z], w: 1.6 },
      ],
      // The campfire's terrace, and a round of cobbles where the three lanes meet above it.
      circles: [{ ...CAMPFIRE, r: TERRACE }, { ...CAMP_JUNCTION, r: 1.2 }],
      benches: [
        // Along the east jetty's edge, looking across the water to the campfire headland.
        { x: 6.9, z: 7.2, facing: Math.PI / 2 },
        // At the quay's east end where the boards stood, near the deck's rear edge looking out over the cove, with
        // room behind it for its lamp to stand clear of the quay road.
        { x: 11.2, z: 13.3, facing: Math.PI },
        // The rest stop on the walk up, beside the main street in front of the Fishmonger.
        { x: -4.6, z: 24.5, facing: Math.PI / 2 },
        // On Skipper's Beach below the terrace, its back to the wall of the bay's flower bed and 0.25 m clear of it, looking out over the open lake.
        { x: 22.6, z: -4.25, facing: Math.PI },
      ],
      trees: [
        // Leafy ones by the Fishmonger's garden, behind the Net Mender, and one up each side of the upper street.
        { x: -7.4, z: 27.7, s: 1.25 },
        { x: 13.8, z: 27.5, s: 1.2 },
        { x: -6.6, z: 40.2, s: 1.3 },
        { x: 5, z: 42, s: 1.2 },
        // Pines round the pad's edge, closing the town in.
        { x: -16.5, z: 41.5, s: 1.2, pine: true },
        { x: 16.2, z: 44, s: 1.1, pine: true },
        { x: 14.4, z: 53.5, s: 1, pine: true },
      ],
    },
  },
];

const pond = MAPS[0];

/** Where a player lands on `dest` when coming from map `from`: back through the gate, by the seaplane from a dive, or at the spawn. */
/** True within `pad` metres of a map's cobbles: its paths, the square and the round patches. */
export const onCobbles = (map: MapDef, x: number, z: number, pad = 0): boolean => {
  const t = map.town;
  for (const p of t.paths) {
    const dx = p.to[0] - p.from[0];
    const dz = p.to[1] - p.from[1];
    const k = Math.max(0, Math.min(1, ((x - p.from[0]) * dx + (z - p.from[1]) * dz) / (dx * dx + dz * dz || 1)));
    if (Math.hypot(x - p.from[0] - dx * k, z - p.from[1] - dz * k) < p.w / 2 + pad) return true;
  }
  return [t.square, ...(t.circles ?? [])].some((c) => c.r > 0 && Math.hypot(x - c.x, z - c.z) < c.r + pad);
};

export const arrivalSpot = (dest: MapDef, from?: string): { x: number; z: number; yaw: number } =>
  (from && dest.next?.id === from && dest.gateArrival)
  || (from && dest.harbour && MAPS.find((m) => m.id === from)?.sea && dest.harbour.diveStart)
  || dest.spawn;

/** The endgame: an indoor casino with its own floor plan; the front door leads back to the pond. */
const toward = (x: number, z: number): number => faceToward(x, z, x, 30);
MAPS.push({
  ...pond,
  id: 'casino',
  locationId: 'lake',
  name: 'Casino Cove',
  next: { id: 'pond', name: 'Starter Pond' },
  minLevel: CASINO_LEVEL,
  spawn: { x: 0, z: 29.5, yaw: Math.PI },
  pad: { x: 0, z: 43, r: 80, h: 0 },
  radius: 400,
  gate: { x: 0, z: 27.4, facing: 0 },
  gateArrival: undefined,
  worms: undefined,
  smokehouse: undefined,
  clearings: undefined,
  aprons: undefined,
  levels: undefined,
  camp: undefined,
  islet: undefined,
  casino: {
    hall: { x: 0, z: 43, w: 34, d: 34 },
    roulette: { x: -9, z: 43, facing: toward(-9, 43) },
    blackjack: { x: 9, z: 43, facing: toward(9, 43) },
    // The Lucky Wheel stands in the back corner on the roulette side, across the hall from the record board, turned to the room.
    wheel: { x: -11.5, z: 56.6, facing: faceToward(-11.5, 56.6, -5, 45) },
    prizes: { x: 0, z: 56.4, facing: toward(0, 56.4) },
    mirror: { x: -15.4, z: 31, facing: Math.PI / 2 },
    // The record board hangs on the back wall between the blackjack-side painting and the corner.
    records: { x: 14.4, z: 59.94, facing: Math.PI },
  },
  town: {
    square: { x: 0, z: 43, r: 0 },
    houses: [],
    npcs: [
      {
        name: 'Madame Fortuna', face: 'wink', x: 0, z: 58.1, facing: Math.PI, coat: 0x7a1f3f, hat: 0xf2d16b,
        walk: { speed: 0.6, wait: 5, stops: [{ x: -1.2, z: 58.1, wait: 4, face: Math.PI }, { x: 1.2, z: 58.1, wait: 4, face: Math.PI }] },
        lines: [
          'Turn your catch in for chips, darling. Bet it first if you are feeling lucky.',
          'A fish that wins is worth more, a fish that loses is gone.',
          'No limit at my tables, darling. Double it, double it again, then cash it in before your luck turns.',
        ],
      },
      {
        name: 'Croupier Vale', face: 'toothy', x: -9, z: 45.2, facing: Math.PI, coat: 0x1b1b24, hat: 0xc4262e,
        walk: { speed: 0.6, wait: 6, stops: [{ x: -9.9, z: 45.2, wait: 4, face: Math.PI }, { x: -8.1, z: 45.2, wait: 4, face: Math.PI }] },
        lines: ['Red, black, or green. The wheel does not care who you are.', 'Hold a fish in your hand, then pick red, black or green on the table.'],
      },
      {
        name: 'Dealer Rue', face: 'cat', x: 9, z: 45.2, facing: Math.PI, coat: 0x1b1b24, hat: 0x2a6fc4,
        walk: { speed: 0.6, wait: 7, stops: [{ x: 9.9, z: 45.2, wait: 4, face: Math.PI }, { x: 8.1, z: 45.2, wait: 4, face: Math.PI }] },
        lines: ['I stand on seventeen. Always.', 'Double down and a winning fish is worth four times as much.'],
      },
    ],
    bottles: [],
    racks: [],
    boats: [],
    flowers: [],
    paths: [],
    benches: [],
    trees: [],
  },
});

/**
 * The open sea of the dives: the charter boat alone on open water, where players fish off the rails.
 * The look follows the dive's depth (`seaMood`). Each dive is its own instance of this map (`placeOf`, protocol.ts),
 * started at Captain Reed's stand or with the dev console's `/sea`.
 */
MAPS.push({
  ...pond,
  id: 'sea',
  locationId: 'shelf',
  name: 'The Open Sea',
  sea: true,
  next: null,
  spawn: { ...BOAT.spawn },
  gateArrival: undefined,
  pad: { x: 0, z: 0, r: 0, h: 0 },
  radius: BOAT.len / 2 + 1,
  // Nothing on board is a gate; this keeps the gate's prompt out of reach.
  gate: { x: 0, z: 1e4, facing: 0 },
  worms: undefined,
  smokehouse: undefined,
  harbour: undefined,
  clearings: undefined,
  aprons: undefined,
  levels: undefined,
  camp: undefined,
  islet: undefined,
  town: { square: { x: 0, z: 0, r: 0 }, houses: [], npcs: [], bottles: [], racks: [], boats: [], flowers: [], paths: [], benches: [], trees: [] },
});

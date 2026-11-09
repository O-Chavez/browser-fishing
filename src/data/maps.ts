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

/**
 * Mags's smoke shack on the quay's east side behind the deck, turned toward the pier root (docs/map-rework/harbour.json);
 * Marlow's stall mirrors it on the west side.
 */
const SMOKEHOUSE: Spot = { x: 5.5, z: 17.5, facing: -2.4 };
/** Where Mags stands: inside the shack, behind her counter. */
const MAGS = { x: SMOKEHOUSE.x - 0.75 * Math.sin(SMOKEHOUSE.facing), z: SMOKEHOUSE.z - 0.75 * Math.cos(SMOKEHOUSE.facing) };

/**
 * Captain Reed's corner: his own beach under the west headland, at the foot of the lane from the quay's west end
 * (docs/map-rework/harbour.json). The seaplane floats in the cove with its nose toward the sand, in view from the
 * pier and both jetties; Reed stands on the beach by the CHARTERS signpost, players come back from a dive on the
 * sand beside him, and the Furthest Out board stands at the top of his lane by the worm patch (its look and words
 * are `FURTHEST_BOARD` in src/game/furthestboard.ts).
 */
export const HARBOUR = {
  /** Reed stands on the sand facing up the lane toward the quay. */
  stand: { x: -20, z: 1, facing: 0.9 } as Spot,
  /** The middle of the seaplane, between its floats, afloat in the cove with its nose toward the beach. */
  plane: { x: -14.5, z: -2.5, facing: -1.35 } as Spot,
  /** The CHARTERS signpost, between Reed and the lane. */
  sign: { x: -18.8, z: 2.5, facing: 0.9 } as Spot,
  /** Where players land back from a dive: on the sand beside Reed, looking at the plane. */
  diveStart: { x: -21.5, z: 3.5, yaw: 0 },
  /** The Furthest Out board, at the top of Reed's lane under its lamp, facing down the lane. Play-test: the spot and the turn. */
  board: { x: -19.2, z: 8.2, facing: 1.2 } as Spot,
};
HARBOUR.diveStart.yaw = Math.atan2(-(HARBOUR.plane.x - HARBOUR.diveStart.x), -(HARBOUR.plane.z - HARBOUR.diveStart.z));

export interface HouseDef extends Spot {
  /** Wall and roof colours. */
  wall: number;
  roof: number;
  /** Optional hanging sign by the door. */
  sign?: string;
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
  /** Benches besides the square's own pair; on a dock they stand on the deck. */
  benches: Spot[];
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
  /** Live "Top Anglers" board; E opens the player list. */
  leaderboard: Spot;
  /** Dressing mirror; E opens the wardrobe. */
  mirror: Spot;
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
  town: TownDef;
  /** Mags Cinder's smoke shack: the middle of its counter, facing out; the shack stands behind it. */
  smokehouse?: Spot;
  /** Captain Reed's seaplane charters (`HARBOUR`): where he stands, the plane, his signpost and where dives come back to. */
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
      // Behind the quay's west half, turned toward the pier root; Marlow stands behind the counter.
      shop: { x: -5.5, z: 17.5, facing: 2.4 },
      npc: { x: -5.5 - 1.4 * Math.sin(2.4), z: 17.5 - 1.4 * Math.cos(2.4), facing: 2.4 },
    },
    gate: { x: 0, z: 56, facing: Math.PI },
    // Just inside the arch, facing into town, and outside the gate's own "Travel" prompt.
    gateArrival: { x: 0, z: 50.5, yaw: 0 },
    // Top Anglers and Thanks stand on the quay deck east of the pier root, facing the water, so the leaderboard is
    // the first thing passed after a catch (the plan had them at the east jetty's root, which they blocked).
    leaderboard: { x: 6.9, z: 13.6, facing: Math.PI },
    // The wardrobe mirror at the quay's east end by the bench jetty.
    mirror: { x: 11.6, z: 13.3, facing: -2.36 },
    // The campfire on the east headland, seen across the water from the jetty bench.
    campfire: { x: 18, z: 2, facing: 0 },
    // Beside Reed's lane, at the top of his beach.
    worms: { x: -18.6, z: 12 },
    smokehouse: SMOKEHOUSE,
    harbour: HARBOUR,
    stock: { rods: ['twig', 'fiberglass', 'graphite', 'carbon', 'aurora'], lines: ['twine', 'mono', 'fluoro', 'braid', 'moonsilk'], bait: ['worm', 'fly', 'minnow', 'lure', 'pearl'] },
    next: { id: 'casino', name: 'Casino Cove' },
    radius: 100,
    clearings: [
      // Reed's beach and the landing spot, his lane, the campfire headland, and the two ring lanes down to the water.
      { x: -19.5, z: 4, r: 7 },
      { x: -15, z: 11, r: 3.5 },
      { x: 18, z: 2, r: 5 },
      { x: -16.5, z: 18, r: 6 },
      { x: 18, z: 20, r: 6 },
      // The headland tips stay bare behind their four pines, so the pines stand against the sky. Play-test: the radius.
      { x: 21, z: -2, r: 9 },
      { x: -22.5, z: -1, r: 9 },
    ],
    town: {
      square: { x: 0, z: 32, r: 5.5 },
      houses: [
        // The Fishmonger and Net Mender flank the stalls; Wren's, the blue house and two more stagger up the ring to the gate.
        { x: -12, z: 22.5, facing: 2.3, wall: 0xe6c9c9, roof: 0x4a7a4a, sign: 'Fishmonger' },
        { x: 13, z: 23.5, facing: -2.1, wall: 0xd9d2c5, roof: 0x7a3f3f, sign: 'Net Mender' },
        { x: -15, z: 34, facing: 1.4, wall: 0xe8d7b0, roof: 0xb5473a, sign: "Wren's Cottage" },
        { x: 14.5, z: 38.5, facing: -1.9, wall: 0xc9d9e0, roof: 0x3f6f8f },
        { x: -10.5, z: 46, facing: 2.3, wall: 0xe0c3a0, roof: 0x6b4a8a },
        { x: 10.5, z: 50.5, facing: -2.6, wall: 0xd8e0c0, roof: 0x8a5a2b },
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
          // Laps the well, then runs down the main path to the fish racks behind the Smokehouse.
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
              { x: 9, z: 18.5, wait: 4, face: faceToward(9, 18.5, 10.5, 16.8) },
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
          name: 'Granny Wren', face: 'smile', x: -10.5, z: 33, facing: faceToward(-10.5, 33, -6, 32), coat: 0x7a4a8a, hat: 0xeeeeee,
          walk: {
            speed: 0.7,
            wait: 8,
            stops: [
              { x: -10, z: 30.5 },
              { x: -8, z: 34, wait: 5, face: Math.PI / 2 },
              { x: -10.5, z: 37.5, wait: 3 },
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
            'Every five fish you land, we reach a marker: head home with the haul, or sail on.',
            'One spool of line a charter. Run it out and the haul goes over the side.',
            "Chart a marker and I'll fly you straight back out to it next time.",
          ],
        },
      ],
      bottles: [
        { id: 'b1', x: 6.6, z: 5.8, note: 'Day 3. Caught nothing. Again. The pier is where I should have been.' },
        { id: 'b2', x: -21, z: -1, note: 'To whoever finds this: the best catch of my life was a tiny trout with a big heart.' },
        { id: 'b3', x: -19.5, z: 38, note: 'The Net Mender swears he mended a net that caught a ghost.' },
        { id: 'b4', x: 12.5, z: 58, note: 'Smoked fish keeps the winter at bay. Share the first of the season.' },
        { id: 'b5', x: -14.5, z: 51, note: 'A gate at the edge of town leads somewhere wonderful. Keep fishing.' },
        { id: 'b6', x: 20, z: -2, note: 'Warm hands by the fire, cold water at my feet. Perfect.' },
        { id: 'b7', x: -4.4, z: -8.3, note: 'You found the secret at the end of the pier. Well fished, friend.' },
      ],
      racks: [
        { x: 10.5, z: 16.8, facing: 0.3 },
        { x: 9, z: 20.2, facing: 1.2 },
      ],
      // Moored in the water beside the west jetty.
      boats: [{ x: -10.3, z: 6.2, facing: 0.2 }],
      flowers: [
        { x: -11, z: 35.5, w: 2.5, d: 0.8 },
        { x: -12.5, z: 38, w: 2.5, d: 0.8 },
        { x: 12, z: 34.5, w: 2.5, d: 0.8 },
        { x: 12.5, z: 42, w: 2.5, d: 0.8 },
        { x: -6.5, z: 49.5, w: 2, d: 0.8 },
        { x: 6.8, z: 47.5, w: 2, d: 0.8 },
        // In front of the Fishmonger, by the bench on the walk up.
        { x: -6.6, z: 22.6, w: 2.2, d: 0.8 },
      ],
      paths: [
        // The main street from the quay's rear edge to the gate.
        { from: [0, 14.5], to: [0, 54.5], w: 4.4 },
        // Lanes off the square and the upper street to the houses' doors.
        { from: [-2, 32], to: [-12, 32.5], w: 1.6 },
        { from: [2, 32], to: [11.5, 36], w: 1.6 },
        { from: [-1.5, 42], to: [-7.5, 43.5], w: 1.6 },
        { from: [1.5, 42.5], to: [8, 47], w: 1.6 },
        // Reed's lane, a street of the town, from the quay's west end down to his beach.
        { from: [-13, 13.5], to: [-16.5, 9], w: 2.4 },
        { from: [-16.5, 9], to: [-18.5, 3.5], w: 2.4 },
        // The ramp from the quay's east end to the campfire headland.
        { from: [12.5, 11], to: [16.5, 5.5], w: 1.6 },
        // The village ring: west from the square past Wren's Cottage and behind the Fishmonger to the worm patch and the quay...
        { from: [-9, 32.3], to: [-13.5, 28.5], w: 1.6 },
        { from: [-13.5, 28.5], to: [-16.5, 22], w: 1.6 },
        { from: [-16.5, 22], to: [-17, 15], w: 1.6 },
        { from: [-17, 15], to: [-15.5, 11.2], w: 1.6 },
        // ...and east past the blue house and behind the Net Mender down to the campfire path.
        { from: [6, 33.7], to: [15.5, 31], w: 1.6 },
        { from: [15.5, 31], to: [18.5, 24], w: 1.6 },
        { from: [18.5, 24], to: [18.5, 16], w: 1.6 },
        { from: [18.5, 16], to: [15.5, 8.5], w: 1.6 },
      ],
      benches: [
        // On the east jetty, looking across the water to the campfire headland.
        { x: 7.5, z: 4.8, facing: Math.PI },
        // The rest stop on the walk up, beside the main street in front of the Fishmonger.
        { x: -4.6, z: 24.5, facing: Math.PI / 2 },
      ],
    },
  },
];

const pond = MAPS[0];

/** Where a player lands on `dest` when coming from map `from`: back through the gate, by the seaplane from a dive, or at the spawn. */
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
        lines: ['Red, black, or green. The wheel does not care who you are.', 'Hold a fish in your hand, then click red, black or green on the table.'],
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
  town: { square: { x: 0, z: 0, r: 0 }, houses: [], npcs: [], bottles: [], racks: [], boats: [], flowers: [], paths: [], benches: [] },
});

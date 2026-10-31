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

/** Right beside the Lucky Wheel, facing Marlow's stall across the main path. */
const SMOKEHOUSE: Spot = { x: -5.8, z: 21.9, facing: Math.PI / 2 };
/** Where Mags stands: inside the shack, behind her counter. */
const MAGS = { x: SMOKEHOUSE.x - 0.75 * Math.sin(SMOKEHOUSE.facing), z: SMOKEHOUSE.z - 0.75 * Math.cos(SMOKEHOUSE.facing) };

/** Along the west beach, toward the town end, and straight out from it into the lake (unit vectors in x, z). */
const SHORE = { x: -0.83, z: 0.55 };
const OUT = { x: -0.55, z: -0.83 };
const fromReed = (along: number, out: number, x = -15.1, z = 13.9) => ({ x: x + SHORE.x * along + OUT.x * out, z: z + SHORE.z * along + OUT.z * out });
/** Facing from the lake toward the beach. */
const INLAND = Math.atan2(-OUT.x, -OUT.z);

/**
 * The harbour for the dives, on the west beach between the rowboat and the bottle at (-15, 18), away from
 * the east beach's racks (a placeholder; a map rework may move it): Captain Reed's seaplane floats in the
 * shallows with its nose toward the sand, Reed stands on the beach beside it by a CHARTERS signpost, and
 * players come back from a dive on the sand between them. The Furthest Out board (D6) has no spot yet.
 */
export const HARBOUR = {
  /** Reed stands on the sand facing up the beach, the plane behind his right shoulder. */
  stand: { ...fromReed(0, 0), facing: INLAND } as Spot,
  /** The middle of the seaplane, between its floats; it faces the beach, its nose at the water's edge. */
  plane: { ...fromReed(2.4, 4.3), facing: INLAND } as Spot,
  /** The CHARTERS signpost, on Reed's other side, toward the pier. */
  sign: { ...fromReed(-1.3, -0.2), facing: INLAND } as Spot,
  /** Where players land back from a dive: on the sand between Reed and the plane, looking at it. */
  diveStart: { ...fromReed(1.4, -0.6), yaw: 0 },
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
  wheel: Spot;
  /** Live "Top Anglers" board; E opens the player list. */
  leaderboard: Spot;
  /** Dressing mirror; E opens the wardrobe. */
  mirror: Spot;
  campfire: Spot;
  /** Beach patch where broke players with no bait can dig up worms. */
  worms?: { x: number; z: number };
  /** What this map's shop menu sells (ids from `RODS` and `BAITS`). */
  stock: { rods: string[]; bait: string[] };
  next: { id: string; name: string } | null;
  /** Walkable radius from the map origin. */
  radius: number;
  town: TownDef;
  /** Mags Cinder's smoke shack: the middle of its counter, facing out; the shack stands behind it. */
  smokehouse?: Spot;
  /** Captain Reed's seaplane charters (`HARBOUR`): where he stands, the plane, his signpost and where dives come back to. */
  harbour?: { stand: Spot; plane: Spot; sign: Spot; diveStart: { x: number; z: number; yaw: number } };
  /** The open sea: players stand on the charter boat's deck (`BOAT` in sea.ts) instead of the shore. */
  sea?: boolean;
  /** Casino maps: where the tables and prize counter stand. */
  casino?: { roulette: Spot; blackjack: Spot; prizes: Spot; mirror: Spot; records: Spot; hall: { x: number; z: number; w: number; d: number } };
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
    spawn: { x: 0, z: 2, yaw: 0 },
    pad: { x: 0, z: 35, r: 24, h: 0.9 },
    vendor: {
      name: 'Marlow',
      face: 'joy',
      shop: { x: 5.5, z: 21, facing: -Math.PI / 2 },
      npc: { x: 6.9, z: 21, facing: -Math.PI / 2 },
    },
    gate: { x: 0, z: 56, facing: Math.PI },
    // Just inside the arch, facing into town, and outside the gate's own "Travel" prompt.
    gateArrival: { x: 0, z: 50.5, yaw: 0 },
    wheel: { x: -6, z: 18.5, facing: Math.PI / 2 },
    leaderboard: { x: 10.5, z: 30, facing: faceToward(10.5, 30, 2, 27) },
    mirror: { x: -8.5, z: 40, facing: faceToward(-8.5, 40, 0, 32) },
    campfire: { x: -15, z: 24, facing: 0 },
    worms: { x: -8.5, z: 10.5 },
    smokehouse: SMOKEHOUSE,
    harbour: HARBOUR,
    stock: { rods: ['twig', 'fiberglass', 'graphite', 'carbon', 'aurora'], bait: ['worm', 'fly', 'minnow', 'lure', 'pearl'] },
    next: { id: 'casino', name: 'Casino Cove' },
    radius: 100,
    town: {
      square: { x: 0, z: 32, r: 5.5 },
      houses: [
        { x: -15, z: 43, facing: faceToward(-15, 43, 0, 35), wall: 0xe8d7b0, roof: 0xb5473a, sign: "Wren's Cottage" },
        { x: 15, z: 43, facing: faceToward(15, 43, 0, 35), wall: 0xc9d9e0, roof: 0x3f6f8f },
        { x: -9, z: 51, facing: faceToward(-9, 51, 0, 40), wall: 0xe0c3a0, roof: 0x6b4a8a },
        { x: 9, z: 51, facing: faceToward(9, 51, 0, 40), wall: 0xd8e0c0, roof: 0x8a5a2b },
        { x: 17, z: 28, facing: faceToward(17, 28, 4, 31), wall: 0xe6c9c9, roof: 0x4a7a4a, sign: 'Fishmonger' },
        { x: -17, z: 33, facing: faceToward(-17, 33, -2, 33), wall: 0xd9d2c5, roof: 0x7a3f3f, sign: 'Net Mender' },
      ],
      npcs: [
        {
          name: 'Old Salty', face: 'sleepy', x: 4.2, z: 15, facing: faceToward(4.2, 15, 0, 18), coat: 0x3d5a80, hat: 0xd9b84a,
          walk: {
            speed: 0.9,
            wait: 6,
            stops: [
              { x: 0, z: 9 },
              { x: 0, z: -5, wait: 8, face: Math.PI },
              { x: 0, z: 9 },
            ],
          },
          lines: [
            'The far end of the pier is where the big ones bite. Stand out on the T and see.',
            "Nothing wrong with the shore, but the fish there are lazy and small. The pier's the thing.",
            'A gold-zone cast pulls better fish toward your bait. Practice your timing.',
            'Run dry of bait and coin? Dig in the soft sand on the beach left of the pier. Worms aplenty.',
          ],
          nightLines: ['Fireflies on the water... best time of day. The quiet ones always bite after dark.'],
        },
        {
          name: 'Pip', face: 'tongue', x: 2.6, z: 33.5, facing: faceToward(2.6, 33.5, 0, 32), coat: 0xc2543d,
          // Laps the well, then runs down to the fish racks where the first bottle hides.
          walk: {
            speed: 2.2,
            wait: 3,
            stops: [
              { x: 0, z: 34.3 },
              { x: -1.63, z: 33.63 },
              { x: -2.3, z: 32.0 },
              { x: -1.63, z: 30.37 },
              { x: 0, z: 29.7 },
              { x: 0, z: 24 },
              { x: 1.2, z: 17 },
              { x: 9.3, z: 15.6, wait: 4, face: faceToward(9.3, 15.6, 12, 16) },
              { x: 1.2, z: 17 },
              { x: 0, z: 24 },
              { x: 0, z: 29.7 },
              { x: 2.9, z: 31.1 },
            ],
          },
          lines: [
            'Psst! I found a message in a bottle behind the fish racks. There are more hidden around town!',
            'Better bait lets you hook rarer fish. A better rod makes the fight easier.',
            "Granny Wren says seven bottles are scattered around. I've only found two...",
          ],
        },
        {
          name: 'Granny Wren', face: 'smile', x: -10.5, z: 44.5, facing: faceToward(-10.5, 44.5, -6, 40), coat: 0x7a4a8a, hat: 0xeeeeee,
          walk: {
            speed: 0.7,
            wait: 8,
            stops: [
              { x: -9.5, z: 41.5 },
              { x: -5.4, z: 41.2, wait: 5, face: Math.PI / 2 },
              { x: -7, z: 46.3, wait: 3 },
            ],
          },
          lines: [
            "I've seen this town change. Folks used to leave notes in bottles for luck. They wash up in odd corners.",
            'Sit by the campfire down the shore when you tire. Cozy there.',
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
            'Every fish you land takes us a league further out. Every five, a marker: head home with the haul, or sail on.',
            'One spool of line a charter. Run it out and the haul goes over the side.',
            "Chart a marker and I'll fly you straight back out to it next time.",
          ],
        },
      ],
      bottles: [
        { id: 'b1', x: 13.5, z: 16.5, note: 'Day 3. Caught nothing. Again. The pier is where I should have been.' },
        { id: 'b2', x: -15, z: 18, note: 'To whoever finds this: the best catch of my life was a tiny trout with a big heart.' },
        { id: 'b3', x: -20, z: 31, note: 'The Net Mender swears he mended a net that caught a ghost.' },
        { id: 'b4', x: 19, z: 48, note: 'Smoked fish keeps the winter at bay. Share the first of the season.' },
        { id: 'b5', x: 13, z: 54, note: 'A gate at the edge of town leads somewhere wonderful. Keep fishing.' },
        { id: 'b6', x: -19, z: 24, note: 'Warm hands by the fire, cold water at my feet. Perfect.' },
        { id: 'b7', x: -4.4, z: -5.2, note: 'You found the secret at the end of the pier. Well fished, friend.' },
      ],
      racks: [
        { x: 12, z: 16, facing: 0.3 },
        { x: 16, z: 19, facing: -0.2 },
      ],
      boats: [{ x: -13.5, z: 8.5, facing: 0.6 }],
      flowers: [
        { x: -12.5, z: 38.8, w: 3, d: 0.8 },
        { x: 12.5, z: 38.8, w: 3, d: 0.8 },
        { x: -12.5, z: 48.2, w: 2, d: 0.8 },
        { x: 12.5, z: 48.2, w: 2, d: 0.8 },
        { x: 17, z: 24, w: 2.5, d: 0.8 },
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
  town: { square: { x: 0, z: 0, r: 0 }, houses: [], npcs: [], bottles: [], racks: [], boats: [], flowers: [] },
});

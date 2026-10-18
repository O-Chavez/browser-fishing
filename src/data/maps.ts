export interface Spot {
  x: number;
  z: number;
  /** Direction the object faces, in radians (0 = toward +z, positive turns toward +x). */
  facing: number;
}

/** Facing that points an object at a world position. */
export const faceToward = (x: number, z: number, tx: number, tz: number): number => Math.atan2(tx - x, tz - z);

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
  /** Flat build area for the hub. */
  pad: { x: number; z: number; r: number; h: number };
  vendor: { name: string; shop: Spot; npc: Spot };
  board: Spot;
  gate: Spot;
  wheel: Spot;
  /** Live "Top Anglers" board; E opens the player list. */
  leaderboard: Spot;
  /** Dressing mirror; E opens the wardrobe. */
  mirror: Spot;
  campfire: Spot;
  /** What this map's shop menu sells (ids from `RODS` and `BAITS`). */
  stock: { rods: string[]; bait: string[] };
  /** Pooled coins the whole room must hand in to open the gate. */
  goal: number;
  next: { id: string; name: string } | null;
  /** Walkable radius from the map origin. */
  radius: number;
  town: TownDef;
  /** Casino maps: where the tables and prize counter stand. */
  casino?: { roulette: Spot; blackjack: Spot; prizes: Spot; mirror: Spot; hall: { x: number; z: number; w: number; d: number } };
  /** Player level needed to travel here. */
  minLevel?: number;
}

/**
 * Map template. To add a map: add a `Location` palette and fish in content.ts, then add a
 * `MapDef` here with its own spawn, hub layout, goal and `next` link.
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
      shop: { x: 5.5, z: 21, facing: -Math.PI / 2 },
      npc: { x: 6.9, z: 21, facing: -Math.PI / 2 },
    },
    board: { x: -5.5, z: 25, facing: Math.PI / 2 + 0.5 },
    gate: { x: 0, z: 56, facing: Math.PI },
    wheel: { x: -6, z: 18.5, facing: Math.PI / 2 },
    leaderboard: { x: 10.5, z: 30, facing: faceToward(10.5, 30, 2, 27) },
    mirror: { x: -8.5, z: 40, facing: faceToward(-8.5, 40, 0, 32) },
    campfire: { x: -15, z: 24, facing: 0 },
    stock: { rods: ['twig', 'fiberglass', 'graphite', 'carbon', 'aurora'], bait: ['worm', 'fly', 'minnow', 'lure', 'pearl'] },
    goal: 300,
    next: { id: 'casino', name: 'Casino Cove' },
    radius: 100,
    town: {
      square: { x: 0, z: 32, r: 5.5 },
      houses: [
        { x: -15, z: 43, facing: faceToward(-15, 43, 0, 35), wall: 0xe8d7b0, roof: 0xb5473a, sign: "Wren's Cottage" },
        { x: 15, z: 43, facing: faceToward(15, 43, 0, 35), wall: 0xc9d9e0, roof: 0x3f6f8f, sign: 'Smokehouse' },
        { x: -9, z: 51, facing: faceToward(-9, 51, 0, 40), wall: 0xe0c3a0, roof: 0x6b4a8a },
        { x: 9, z: 51, facing: faceToward(9, 51, 0, 40), wall: 0xd8e0c0, roof: 0x8a5a2b },
        { x: 17, z: 28, facing: faceToward(17, 28, 4, 31), wall: 0xe6c9c9, roof: 0x4a7a4a, sign: 'Fishmonger' },
        { x: -17, z: 33, facing: faceToward(-17, 33, -2, 33), wall: 0xd9d2c5, roof: 0x7a3f3f, sign: 'Net Mender' },
      ],
      npcs: [
        {
          name: 'Old Salty', x: 4.2, z: 15, facing: faceToward(4.2, 15, 0, 18), coat: 0x3d5a80, hat: 0xd9b84a,
          lines: [
            'The far end of the pier is where the big ones bite. Stand out on the T and see.',
            "Nothing wrong with the shore, but the fish there are lazy and small. The pier's the thing.",
            'A gold-zone cast pulls better fish toward your bait. Practice your timing.',
          ],
          nightLines: ['Fireflies on the water... best time of day. The quiet ones always bite after dark.'],
        },
        {
          name: 'Pip', x: 2.6, z: 33.5, facing: faceToward(2.6, 33.5, 0, 32), coat: 0xc2543d,
          lines: [
            'Psst! I found a message in a bottle behind the fish racks. There are more hidden around town!',
            'Better bait lets you hook rarer fish. A better rod makes the fight easier.',
            "Granny Wren says seven bottles are scattered around. I've only found two...",
          ],
        },
        {
          name: 'Granny Wren', x: -10.5, z: 44.5, facing: faceToward(-10.5, 44.5, -6, 40), coat: 0x7a4a8a, hat: 0xeeeeee,
          lines: [
            "I've seen this town change. Folks used to leave notes in bottles for luck. They wash up in odd corners.",
            'Sit by the campfire down the shore when you tire. Cozy there.',
            'Collect every bottle and the town will thank you handsomely.',
          ],
          nightLines: ['Mind the dark paths, dear. Follow the lamps.'],
        },
        {
          name: 'Captain Reed', x: 4, z: 53.5, facing: faceToward(4, 53.5, 0, 56), coat: 0x2f4f4f, hat: 0x2b2b2b,
          lines: [
            "Beyond the gate lies Forest Lake. Big water. I'll open it when the town fund is full.",
            'Every coin in the fund brings the day closer. Hand yours to Marlow.',
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
      boats: [{ x: -13, z: 17, facing: 0.6 }],
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

/** The endgame: an indoor casino with its own floor plan; the front door leads back to the pond. */
const toward = (x: number, z: number): number => faceToward(x, z, x, 30);
MAPS.push({
  ...pond,
  id: 'casino',
  locationId: 'lake',
  name: 'Casino Cove',
  goal: 1,
  next: { id: 'pond', name: 'Starter Pond' },
  minLevel: 15,
  spawn: { x: 0, z: 29.5, yaw: Math.PI },
  pad: { x: 0, z: 43, r: 80, h: 0 },
  radius: 400,
  gate: { x: 0, z: 27.4, facing: 0 },
  casino: {
    hall: { x: 0, z: 43, w: 34, d: 34 },
    roulette: { x: -9, z: 43, facing: toward(-9, 43) },
    blackjack: { x: 9, z: 43, facing: toward(9, 43) },
    prizes: { x: 0, z: 56.4, facing: toward(0, 56.4) },
    mirror: { x: -15.4, z: 31, facing: Math.PI / 2 },
  },
  town: {
    square: { x: 0, z: 43, r: 0 },
    houses: [],
    npcs: [
      {
        name: 'Madame Fortuna', x: 0, z: 58.1, facing: Math.PI, coat: 0x7a1f3f, hat: 0xf2d16b,
        lines: [
          'Turn your catch in for chips, darling. Bet it first if you are feeling lucky.',
          'A fish that wins is worth more, a fish that loses is gone.',
          'A fish worth sixteen times its price is too rich for the tables. Cash it in.',
        ],
      },
      {
        name: 'Croupier Vale', x: -9, z: 45.2, facing: Math.PI, coat: 0x1b1b24, hat: 0xc4262e,
        lines: ['Red, black, or green. The wheel does not care who you are.', 'Hold a fish, click it in your hotbar, and place your bet.'],
      },
      {
        name: 'Dealer Rue', x: 9, z: 45.2, facing: Math.PI, coat: 0x1b1b24, hat: 0x2a6fc4,
        lines: ['I stand on seventeen. Always.', 'Double down and a winning fish is worth four times as much.'],
      },
    ],
    bottles: [],
    racks: [],
    boats: [],
    flowers: [],
  },
});

export const mapById = (id: string): MapDef => {
  const m = MAPS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown map: ${id}`);
  return m;
};

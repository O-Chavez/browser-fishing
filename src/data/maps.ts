export interface Spot {
  x: number;
  z: number;
  /** Direction the object faces, in radians (0 = toward +z, positive turns toward +x). */
  facing: number;
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
  /** What this map's stall sells (ids from `RODS` and `BAITS`). */
  stock: { rods: string[]; bait: string[] };
  /** Pooled coins the whole room must hand in to open the gate. */
  goal: number;
  next: { id: string; name: string } | null;
  /** Walkable radius from the map origin. */
  radius: number;
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
    pad: { x: 0, z: 22, r: 10, h: 0.9 },
    vendor: {
      name: 'Marlow',
      shop: { x: 5.5, z: 21, facing: -Math.PI / 2 },
      npc: { x: 6.9, z: 21, facing: -Math.PI / 2 },
    },
    board: { x: -5.5, z: 25, facing: Math.PI / 2 + 0.5 },
    gate: { x: 0, z: 31, facing: Math.PI },
    wheel: { x: -6, z: 18.5, facing: Math.PI / 2 },
    stock: { rods: ['twig'], bait: ['worm'] },
    goal: 300,
    next: { id: 'lake', name: 'Forest Lake' },
    radius: 100,
  },
];

export const mapById = (id: string): MapDef => {
  const m = MAPS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown map: ${id}`);
  return m;
};

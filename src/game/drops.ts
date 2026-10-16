import type { Slot } from './state';

export interface Drop {
  id: number;
  map: string;
  x: number;
  z: number;
  item: Slot;
  expires: number;
}

export const DROP_TTL_MS = 30_000;
export const PICKUP_RANGE = 3;
const MAX_DROPS = 60;

/** Where an item lands when dropped: just ahead of the player (camera forward is (-sin yaw, -cos yaw)). */
export const dropSpot = (x: number, z: number, yaw: number) => ({
  x: x - Math.sin(yaw) * 1.3,
  z: z - Math.cos(yaw) * 1.3,
});

/** Items on the ground. They vanish after 30 seconds unless picked up. */
export class Drops {
  private list: Drop[] = [];
  private nextId = 1;

  constructor(private now: () => number = Date.now) {}

  all(): Drop[] {
    return this.list;
  }

  add(map: string, x: number, z: number, item: Slot): Drop {
    const d: Drop = { id: this.nextId++, map, x, z, item, expires: this.now() + DROP_TTL_MS };
    this.list.push(d);
    if (this.list.length > MAX_DROPS) this.list.shift();
    return d;
  }

  get(id: number): Drop | undefined {
    return this.list.find((d) => d.id === id);
  }

  remove(id: number): void {
    this.list = this.list.filter((d) => d.id !== id);
  }

  /** Drops expired items; true if anything changed. */
  expire(): boolean {
    const t = this.now();
    const n = this.list.length;
    this.list = this.list.filter((d) => d.expires > t);
    return this.list.length !== n;
  }

  nearest(map: string, x: number, z: number, range = PICKUP_RANGE): Drop | undefined {
    let best: Drop | undefined;
    let bd = range;
    for (const d of this.list) {
      const dist = Math.hypot(d.x - x, d.z - z);
      if (d.map === map && dist <= bd) {
        best = d;
        bd = dist;
      }
    }
    return best;
  }
}

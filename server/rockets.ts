import { RACK_RANGE, STALL_RANGE, buyRocket, rocketBuyError, rocketById, rocketCount, skyBusy, spendRocket, type RocketBag, type RocketUp } from '../src/data/rockets';
import type { MapDef } from '../src/data/maps';

/** What the fireworks need of a player: who and where they are, and their coins and rockets. */
export interface RocketPlayer {
  id: number;
  name: string;
  x: number;
  z: number;
  save: { coins: number; rockets: RocketBag };
}

/** A refusal: what the player is told, if anything. */
export type Refusal = { no: string | null };
export const refused = (r: RocketUp | Refusal | true): r is Refusal => typeof r === 'object' && 'no' in r;

/**
 * One room's fireworks (GAME_DESIGN.md §41): Bram Tinder's sales, and the one rocket that may be in the sky over the
 * town's lake at a time. The room passes the player's messages here and sends on what comes back; the rules shared
 * with the client are `src/data/rockets.ts`.
 */
export class RocketSky {
  /** The rocket last lit; it holds the sky until its show is over (`skyBusy`). */
  private up: RocketUp | null = null;

  constructor(private now: () => number, private rng: () => number) {}

  /** The rocket in the sky right now, for a player who arrives on the map mid-show; null when the sky is clear. */
  current(): RocketUp | null {
    return skyBusy(this.up, this.now()) ? this.up : null;
  }

  /** Buys one rocket at Bram's Kettle: the player stands at the stall and has the coins and the room in the bag. */
  buy(map: MapDef | undefined, p: RocketPlayer, id: string): true | Refusal {
    const stall = map?.camp?.stall;
    if (!stall || Math.hypot(p.x - stall.x, p.z - stall.z) > STALL_RANGE) return { no: null };
    const why = rocketBuyError(p.save, id);
    if (why || !buyRocket(p.save, id)) return { no: why };
    return true;
  }

  /**
   * Lights a rocket at the jetty's rack: the player stands by it, has one of that kind and the sky is clear. The
   * rocket leaves the bag and the show starts now on the server's clock; the room tells everyone on the map.
   */
  light(map: MapDef | undefined, p: RocketPlayer, id: string): RocketUp | Refusal {
    const rack = map?.camp?.rack;
    const def = rocketById(id);
    if (!rack || !def || Math.hypot(p.x - rack.x, p.z - rack.z) > RACK_RANGE) return { no: null };
    if (rocketCount(p.save, def.id) <= 0) return { no: "You have no rocket to light. Bram sells them at Bram's Kettle." };
    if (this.current()) return { no: 'Wait for the sky: a rocket is still up.' };
    spendRocket(p.save, def.id);
    this.up = { kind: def.id, seed: Math.floor(this.rng() * 0x7fffffff), at: this.now(), by: p.id, name: p.name };
    return this.up;
  }
}

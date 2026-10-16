import type { MapDef } from '../data/maps';
import type { SaveData } from './state';

/** Each extra player in the lobby raises a map's goal by half its base amount. */
export const fundGoal = (map: MapDef, players: number): number => Math.round(map.goal * (1 + 0.5 * (Math.max(1, players) - 1)));
/** Fund-record key marking a map's gate as permanently open for the room. */
export const openKey = (mapId: string): string => `${mapId}:open`;

export interface FundState {
  total: number;
  goal: number;
  unlocked: boolean;
  /** Coins handed in by the local player. */
  mine: number;
}

/**
 * The pooled town fund of a map. The room owns it, so the multiplayer server will implement
 * this same interface; `LocalFund` stands in for single-player.
 */
export interface Fund {
  state(map: MapDef): FundState;
  /** Returns the number of coins actually accepted. */
  contribute(map: MapDef, coins: number): number;
}

export class LocalFund implements Fund {
  constructor(private data: SaveData) {}

  state(map: MapDef): FundState {
    const total = Math.min(map.goal, this.data.fund[map.id] ?? 0);
    return { total, goal: map.goal, unlocked: total >= map.goal, mine: this.data.contributed[map.id] ?? 0 };
  }

  contribute(map: MapDef, coins: number): number {
    const st = this.state(map);
    const accepted = Math.max(0, Math.min(Math.floor(coins), st.goal - st.total));
    if (accepted > 0) {
      this.data.fund[map.id] = st.total + accepted;
      this.data.contributed[map.id] = st.mine + accepted;
    }
    return accepted;
  }
}

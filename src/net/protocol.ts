import type { CosSlot, Look } from '../data/cosmetics';
import type { Drop } from '../game/drops';
import type { BestCatch, SaveData } from '../game/state';

export interface PlayerInfo {
  id: number;
  name: string;
  map: string;
  x: number;
  z: number;
  yaw: number;
  look: Look;
  coins: number;
  level?: number;
  best?: BestCatch | null;
  /** Current fishing activity, for other players' avatars. */
  act?: Activity;
}

export type Activity =
  | { a: 'cast'; x: number; z: number }
  | { a: 'hold'; fish: string; size: number; shiny?: boolean }
  | { a: 'carry'; fish: string; size: number; shiny?: boolean };

export type ClientMsg =
  | { t: 'join'; name: string; token: string; map: string; color?: number }
  | { t: 'pos'; x: number; z: number; yaw: number }
  | { t: 'map'; map: string }
  | { t: 'give'; map: string; coins: number }
  | { t: 'buyrod'; id: string }
  | { t: 'buybait'; id: string }
  /** Gear from the tackle locker into the hotbar, or a hotbar rod/bait stack back to the locker. */
  | { t: 'equiprod'; id: string }
  | { t: 'equipbait'; id: string }
  | { t: 'stow'; i: number }
  /** Sell the fish in hand, or in hotbar slot i. */
  | { t: 'sell'; i?: number }
  | { t: 'buycos'; id: string }
  | { t: 'equip'; slot: CosSlot; id: string | null }
  | { t: 'color'; color: number }
  | { t: 'reset' }
  /** Take the hotbar slot (0-based) in hand. */
  | { t: 'slot'; i: number }
  /** Drop the item in hand. */
  | { t: 'drop' }
  | { t: 'pickup'; id: number }
  | { t: 'cast'; x: number; z: number; perfect?: boolean }
  | { t: 'catch' }
  | { t: 'lost' }
  | { t: 'gamble' };

export type ServerMsg =
  | { t: 'welcome'; id: number; room: string; save: SaveData; players: PlayerInfo[] }
  | { t: 'error'; msg: string }
  | { t: 'state'; save: SaveData }
  | { t: 'drops'; list: Drop[] }
  | { t: 'castok'; fishId: string | null; size: number; wait: number; shiny?: boolean; perfect?: boolean }
  | { t: 'castfail'; msg: string }
  | { t: 'wheel'; win: boolean; ms: number }
  | { t: 'joined'; player: PlayerInfo }
  | { t: 'left'; id: number }
  | { t: 'snap'; p: [number, number, number, number][] }
  | { t: 'moved'; id: number; map: string }
  | { t: 'act'; id: number; act: Activity | null }
  | { t: 'look'; id: number; look: Look }
  /** Coins per player id, for the leaderboard. */
  | { t: 'board'; coins: Record<number, number>; stats: Record<number, { level: number; best: BestCatch | null }> }
  | { t: 'fund'; map: string; total: number; by?: string; coins?: number; open?: boolean };

export const SERVER_PORT = 8787;

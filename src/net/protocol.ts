import type { CosSlot, Look } from '../data/cosmetics';
import type { Drop } from '../game/drops';
import type { RouletteBet } from '../data/casino';
import type { BlackjackView } from '../game/casino';
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
  | { t: 'buyrod'; id: string }
  | { t: 'buybait'; id: string }
  /** Gear from the tackle locker into the hotbar, or a hotbar rod/bait stack back to the locker. */
  | { t: 'equiprod'; id: string }
  | { t: 'equipbait'; id: string }
  | { t: 'stow'; i: number }
  /** Sell the fish in hand, or in hotbar slot i. */
  | { t: 'sell'; i?: number }
  | { t: 'bottle'; id: string }
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
  | { t: 'gamble' }
  /** Walk through the gate to another map. */
  | { t: 'travel'; to: string }
  /** Bet the fish in hotbar slot i on a roulette colour. */
  | { t: 'roulette'; bet: RouletteBet; i: number }
  /** Blackjack: `deal` starts a hand with the fish in slot i. */
  | { t: 'bj'; a: 'deal' | 'hit' | 'stand' | 'double'; i?: number }
  /** Turn the fish in slot i in at the prize shop for chips. */
  | { t: 'cashout'; i: number }
  | { t: 'buyperk'; id: string }
  /** A global chat line. */
  | { t: 'chat'; text: string };

export type ServerMsg =
  | { t: 'welcome'; id: number; room: string; save: SaveData; players: PlayerInfo[] }
  | { t: 'error'; msg: string }
  /** A plain message for the player (a refused bet, a locked gate). */
  | { t: 'notice'; msg: string }
  | { t: 'state'; save: SaveData }
  | { t: 'drops'; list: Drop[] }
  | { t: 'castok'; fishId: string | null; size: number; wait: number; shiny?: boolean; perfect?: boolean; spot?: string }
  | { t: 'castfail'; msg: string }
  | { t: 'wheel'; win: boolean; ms: number }
  | { t: 'roulette'; pocket: number; color: RouletteBet; factor: number; ms: number }
  | { t: 'bj'; view: BlackjackView | null }
  | { t: 'joined'; player: PlayerInfo }
  | { t: 'left'; id: number }
  | { t: 'snap'; p: [number, number, number, number][] }
  | { t: 'moved'; id: number; map: string }
  | { t: 'act'; id: number; act: Activity | null }
  | { t: 'look'; id: number; look: Look }
  /** Coins per player id, for the leaderboard. */
  | { t: 'board'; coins: Record<number, number>; stats: Record<number, { level: number; best: BestCatch | null }> }
  /** Hall of fame: best catches of every account, including players who are offline. */
  | { t: 'hall'; rows: HallRow[] }
  /** A chat line from anyone on the server; `room` and `id` let same-room clients show a bubble. */
  | { t: 'chat'; room: string; id: number; name: string; map: string; text: string };

export interface HallRow { name: string; level: number; best: BestCatch }

export const SERVER_PORT = 8787;

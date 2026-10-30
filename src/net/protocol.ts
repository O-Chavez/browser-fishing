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
  /** Title id worn under the name tag (see `TITLES`, `src/data/ranks.ts`). */
  title?: string | null;
  /** Current fishing activity, for other players' avatars. */
  act?: Activity;
}

export type Activity =
  | { a: 'cast'; x: number; z: number }
  /** `mult` is the Lucky Charm bonus baked into the catch (missing from older servers: treat as 1). */
  | { a: 'hold'; fish: string; size: number; shiny?: boolean; mult?: number }
  | { a: 'carry'; fish: string; size: number; shiny?: boolean };

export type ClientMsg =
  /** `pass` logs in on a browser the account doesn't know yet (the server asked with `need: 'password'`). */
  | { t: 'join'; name: string; token: string; color?: number; pass?: string }
  | { t: 'pos'; x: number; z: number; yaw: number }
  /** The player jumped; others on the map replay the arc. */
  | { t: 'jump' }
  | { t: 'buyrod'; id: string }
  | { t: 'buybait'; id: string }
  /** Gear from the tackle locker into the hotbar's rod or bait slot (the one it replaces goes back). */
  | { t: 'equiprod'; id: string }
  | { t: 'equipbait'; id: string }
  /** Sell the fish in hand, or in hotbar slot i. */
  | { t: 'sell'; i?: number }
  | { t: 'bottle'; id: string }
  /** Dig up free worms at the map's beach patch (only when out of bait and coins). */
  | { t: 'dig' }
  | { t: 'buycos'; id: string }
  | { t: 'equip'; slot: CosSlot; id: string | null }
  | { t: 'color'; color: number }
  | { t: 'face'; id: string }
  /** Wear an earned title under the name tag, or none. */
  | { t: 'title'; id: string | null }
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
  /** Switch the Shiny Lure on or off (off saves its charges). */
  | { t: 'lure'; on: boolean }
  /** Smokehouse: put the fish in hotbar slot i on a rack for recipe r. */
  | { t: 'smoke'; r: string; i: number }
  /** Smokehouse: take fish j back off a rack that hasn't started smoking. */
  | { t: 'unsmoke'; rack: number; j: number }
  /** Eat a smoked item from the Pantry for its buff. */
  | { t: 'eat'; id: string }
  /** A new-player tip was shown, so it isn't shown again. */
  | { t: 'tip'; id: string }
  /** A global chat line. */
  | { t: 'chat'; text: string }
  /** A slash command: /bug, /idea, /feedback or the dev console (never broadcast). */
  | { t: 'cmd'; text: string }
  /** Set or change the account password; every other browser is signed out. */
  | { t: 'setpass'; pass: string }
  /** Log out: this browser stops logging in by itself. An account without a password is deleted. */
  | { t: 'forget' };

export type ServerMsg =
  /** `now` is the server's clock (ms), so every player's sky follows the same day instead of their device's clock. */
  | { t: 'welcome'; id: number; room: string; save: SaveData; players: PlayerInfo[]; hasPass: boolean; now: number }
  /** The server's clock again (every CLOCK_MS), in case the device's clock jumps mid-session. */
  | { t: 'clock'; now: number }
  /** `need: 'password'`: the name has a password and this browser isn't one of its devices yet. */
  | { t: 'error'; msg: string; need?: 'password' }
  /** Reply to `setpass`: `msg` is set if it was refused. */
  | { t: 'account'; hasPass: boolean; msg?: string }
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
  /** [id, x, z, yaw] of the players on the receiver's map who moved since the last snap. */
  | { t: 'snap'; p: [number, number, number, number][] }
  | { t: 'moved'; id: number; map: string }
  | { t: 'act'; id: number; act: Activity | null }
  /** Player `id` jumped (sent to the others on their map). */
  | { t: 'jump'; id: number }
  | { t: 'look'; id: number; look: Look }
  /** Player `id` now wears this title id (or none). */
  | { t: 'title'; id: number; title: string | null }
  /** Coins per player id, for the leaderboard. */
  | { t: 'board'; coins: Record<number, number>; stats: Record<number, { level: number; best: BestCatch | null }> }
  /** Hall of fame: best catches of every account, including players who are offline. */
  | { t: 'hall'; rows: HallRow[] }
  /** Every Ko-fi supporter's name, newest first, for the 💗 by their names and the thank-you board. */
  | { t: 'supporters'; names: string[] }
  /** The casino's all-time biggest single win and loss, sent on join and whenever one is beaten. */
  | { t: 'records'; records: CasinoRecords }
  /** A chat line from anyone on the server; `room` and `id` let same-room clients show a bubble. */
  | { t: 'chat'; room: string; id: number; name: string; map: string; text: string }
  /** A server-wide notice for the chat window ("Ann has joined"). */
  | { t: 'sys'; text: string }
  /**
   * Slash command replies, for the player who typed the command only; `time` (dev console) overrides their day/night.
   * `sent` answers a /bug, /idea or /feedback: whether the report went through (the feedback form reads it).
   */
  | { t: 'dev'; lines: string[]; time?: number | null; sent?: boolean };

export interface HallRow { name: string; level: number; best: BestCatch; title?: string | null }

export type CasinoGame = 'blackjack' | 'roulette' | 'wheel';
/** One settled hand or spin: the coins it won or lost, and the fish that was bet. */
export interface Gamble { amount: number; game: CasinoGame; fishId: string; shiny?: boolean; at: number }
export interface CasinoRecord extends Gamble { name: string }
export interface CasinoRecords { win: CasinoRecord | null; loss: CasinoRecord | null }

export const SERVER_PORT = 8787;

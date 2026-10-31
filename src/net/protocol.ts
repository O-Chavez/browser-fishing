import type { CosSlot, Look } from '../data/cosmetics';
import type { Drop } from '../game/drops';
import type { RouletteBet } from '../data/casino';
import type { DishId, StageId } from '../data/smokehouse';
import type { BlackjackView } from '../game/casino';
import type { BestCatch, SaveData } from '../game/state';
import type { Behaviour } from '../data/dive';
import type { DiveState } from '../game/dive';
import type { LossReason } from '../game/reel';

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
  /** The dive this player is on: players only see the others on the same map and the same dive. */
  dive?: number;
}

/** Where a player is for seeing each other: the map, or the dive's own sea. */
export const placeOf = (p: { map: string; dive?: number }): string => (p.dive ? `${p.map}#${p.dive}` : p.map);

/** A dive as its player sees it (`Dive` in `src/game/dive.ts`, with the fish counted). */
export interface DiveView {
  /** The dive's instance (`PlayerInfo.dive`). */
  id: number;
  start: number;
  depth: number;
  /** Metres of line left. */
  line: number;
  state: DiveState;
  ledges: number;
  /** Pearls in the haul, before its growth (`haulBonus(ledges)`). */
  pearls: number;
  /** Fish landed this dive. */
  fish: number;
  /** Metres the last fight wore off the spool, and why it was lost if it was. */
  worn?: number;
  lost?: LossReason | 'gone';
}

/**
 * How a dive ended. Surfaced: the haul banked with its growth, and the ledge charted. Sunk: the line ran out (`line`),
 * the player was away longer than the dive waits (`away`), or reset their account (`quit`); the fish were sold as
 * they were landed either way.
 */
export type DiveEnd =
  | { result: 'surfaced'; ledge: number; pearls: number; record: boolean; fish: number }
  | { result: 'sunk'; why: 'line' | 'away' | 'quit'; depth: number; pearls: number; fish: number; lost?: LossReason | 'gone' };

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
  /** `h`: the button over the fight, one bit per 1/60 s step (`HoldLog`); the server replays it to check the catch. */
  | { t: 'catch'; h: string }
  /** A fish got away (or the cast ended). On a dive `h` is the lost fight's button log, which the line pays for. */
  | { t: 'lost'; h?: string }
  /** Start a dive at Captain Reed's stand, from the harbour (0) or a charted ledge. */
  | { t: 'dive'; from: number }
  /** At a ledge: dive on, or surface with the haul. */
  | { t: 'ledge'; a: 'on' | 'surface' }
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
  /** Smokehouse: put the fish in hotbar slot i on the smoker. */
  | { t: 'smoke'; i: number }
  /** Smokehouse: put every non-shiny hotbar fish on the smoker. */
  | { t: 'smokeall' }
  /** Smokehouse: sell the best smoked fish of a species to Mags, or every one with `all`. */
  | { t: 'sellsmoked'; id: string; all?: boolean }
  /** Eat a smoked fish from the Pantry as a snack; `all` eats as many as fit under the cap. */
  | { t: 'eat'; id: string; all?: boolean }
  /** Smokehouse Kitchen: cook a dish from smoked fish into the Pantry. */
  | { t: 'cook'; id: DishId }
  /** Eat a cooked dish from the Pantry. */
  | { t: 'eatdish'; id: DishId }
  /** A new-player tip was shown, so it isn't shown again. */
  | { t: 'tip'; id: string }
  /** A global chat line. */
  | { t: 'chat'; text: string }
  /** A slash command: /bug, /idea, /feedback or the dev console (never broadcast). */
  | { t: 'cmd'; text: string }
  /** Set or change the account password; every other browser is signed out. */
  | { t: 'setpass'; pass: string }
  /** Log out: this browser stops logging in by itself. An account without a password is deleted. */
  | { t: 'forget' }
  /** Change the account's name, at most once per `RENAME_COOLDOWN_MS`. */
  | { t: 'rename'; name: string };

export type ServerMsg =
  /**
   * `name` is the account's current name, which differs from the joined one after a rename; `renameIn` is ms until it can change again.
   * `now` is the server's clock (ms), so every player's sky follows the same day instead of their device's clock.
   */
  | { t: 'welcome'; id: number; room: string; name: string; save: SaveData; players: PlayerInfo[]; hasPass: boolean; renameIn: number; now: number; /** A dive that waited for this player to come back. */ dive?: DiveView }
  /** The server's clock again (every CLOCK_MS), in case the device's clock jumps mid-session. */
  | { t: 'clock'; now: number }
  /** `need: 'password'`: the name has a password and this browser isn't one of its devices yet. */
  | { t: 'error'; msg: string; need?: 'password' }
  /** Reply to `setpass` (and a refused `rename`): `msg` is set if it was refused. */
  | { t: 'account'; hasPass: boolean; msg?: string }
  /** A plain message for the player (a refused bet, a locked gate). */
  | { t: 'notice'; msg: string }
  /** Smokehouse stages just opened; `intro` is an existing player's first look at the Smokehouse. */
  | { t: 'stages'; ids: StageId[]; intro: boolean }
  | { t: 'state'; save: SaveData }
  | { t: 'drops'; list: Drop[] }
  /** With a fish, `seed` and `d` set up its fight (`new Reel(d, mulberry(seed))`); the server replays the catch from them. */
  /** `b`: a sea fish's behaviour, whose reel levers (`BEHAVIOUR_TUNE`) the fight uses. */
  | { t: 'castok'; fishId: string | null; size: number; wait: number; shiny?: boolean; perfect?: boolean; spot?: string; seed?: number; d?: number; b?: Behaviour }
  | { t: 'castfail'; msg: string }
  | { t: 'wheel'; win: boolean; ms: number }
  | { t: 'roulette'; pocket: number; color: RouletteBet; factor: number; ms: number }
  | { t: 'bj'; view: BlackjackView | null }
  | { t: 'joined'; player: PlayerInfo }
  | { t: 'left'; id: number }
  /** [id, x, z, yaw] of the players on the receiver's map who moved since the last snap. */
  | { t: 'snap'; p: [number, number, number, number][] }
  | { t: 'moved'; id: number; map: string; dive?: number }
  /** The server refused a move (too far, too fast): the player goes back here. */
  | { t: 'pos'; x: number; z: number }
  /** The player's dive after a fight or a ledge choice. Sent before the save that takes them to sea. */
  | { t: 'divestate'; dive: DiveView }
  /** The dive is over; the save that brings the player back to the harbour follows. */
  | { t: 'diveend'; end: DiveEnd }
  | { t: 'act'; id: number; act: Activity | null }
  /** Player `id` jumped (sent to the others on their map). */
  | { t: 'jump'; id: number }
  | { t: 'look'; id: number; look: Look }
  /** Player `id` (possibly the receiver) changed their name. */
  | { t: 'named'; id: number; name: string }
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
   * Slash command replies, for the player who typed the command only; `time` (dev console) overrides their day/night,
   * `depth` sets the dive depth their sea looks like.
   * `sent` answers a /bug, /idea or /feedback: whether the report went through (the feedback form reads it).
   */
  | { t: 'dev'; lines: string[]; time?: number | null; depth?: number; sent?: boolean };

export interface HallRow { name: string; level: number; best: BestCatch; title?: string | null }

export type CasinoGame = 'blackjack' | 'roulette' | 'wheel';
/** One settled hand or spin: the coins it won or lost, and the fish that was bet. */
export interface Gamble { amount: number; game: CasinoGame; fishId: string; shiny?: boolean; at: number }
export interface CasinoRecord extends Gamble { name: string }
export interface CasinoRecords { win: CasinoRecord | null; loss: CasinoRecord | null }

export const SERVER_PORT = 8787;

/** How long after a name change before the next one. */
export const RENAME_COOLDOWN_MS = 7 * 24 * 60 * 60_000;

/** "3 days" or "5 hours", rounded up, for how long until the next name change. */
export function waitText(ms: number): string {
  const [n, unit] = ms > 24 * 60 * 60_000 ? [Math.ceil(ms / (24 * 60 * 60_000)), 'day'] : [Math.max(1, Math.ceil(ms / (60 * 60_000))), 'hour'];
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

import { DIVE } from '../src/data/dive';
import { startDive, type Dive } from '../src/game/dive';
import type { LossReason } from '../src/game/reel';
import type { DiveEnd, DiveView } from '../src/net/protocol';

/**
 * One dive at sea: its own instance of the sea map, with its own player list (one diver for now; a crew later is more
 * names on it) and the dive's rules state (`src/game/dive.ts`). It lives on the account, not the room, so a player who
 * drops out can come back to it in any room within `DIVE.holdMs`.
 */
export interface DiveRun {
  id: number;
  dive: Dive;
  /** Account names on board. */
  crew: string[];
  /** When the diver left, while the dive waits for them; null while they're on board. */
  heldAt: number | null;
  /** Coins from the fish sold as they were landed, for the end-of-dive card. */
  coins: number;
  /** The last fight's line cost and loss reason, for the HUD. */
  worn?: number;
  lost?: LossReason | 'gone';
}

let nextId = 1;

export function newRun(start: number, name: string): DiveRun {
  return { id: nextId++, dive: startDive(start), crew: [name], heldAt: null, coins: 0 };
}

/** True once a dive has waited longer than `DIVE.holdMs` for its diver. */
export const expired = (run: DiveRun, now: number): boolean => run.heldAt !== null && now - run.heldAt > DIVE.holdMs;

export function diveView(run: DiveRun): DiveView {
  const d = run.dive;
  const v: DiveView = { id: run.id, start: d.start, depth: d.depth, line: Math.round(d.line * 10) / 10, state: d.state, ledges: d.ledges, pearls: d.pearls, fish: d.fish.length, coins: run.coins };
  if (run.worn !== undefined) v.worn = Math.round(run.worn * 10) / 10;
  if (run.lost) v.lost = run.lost;
  return v;
}

/** The end of a dive whose haul sank: the line ran out, the diver was away too long, headed home early or reset. */
export function sunkEnd(run: DiveRun, why: 'line' | 'away' | 'home' | 'quit', pearls = run.dive.pearls, lost?: LossReason | 'gone'): DiveEnd {
  return { result: 'sunk', why, depth: run.dive.depth, pearls, fish: run.dive.fish.length, coins: run.coins, ...(lost ? { lost } : {}) };
}

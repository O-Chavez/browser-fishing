import { DIVE } from '../src/data/dive';
import { lineCost, payAt, seaRating, spoolPrice, startDive, type Dive, type SeaRod } from '../src/game/dive';
import type { LossReason } from '../src/game/reel';
import type { DiveEnd, DiveView } from '../src/net/protocol';

/**
 * One charter at sea: its own instance of the sea map, with its own player list (one angler for now; a crew later is
 * more names on it) and the charter's rules state (`src/game/dive.ts`). It lives on the account, not the room, so a
 * player who drops out can come back to it in any room within `DIVE.holdMs`.
 */
export interface DiveRun {
  id: number;
  dive: Dive;
  /** Account names on board. */
  crew: string[];
  /** When the angler left, while the charter waits for them; null while they're on board. */
  heldAt: number | null;
  /** The last fight's line cost and loss reason, for the HUD. */
  cost?: number;
  lost?: LossReason | 'gone';
  /** Pearls the last fish paid: set after a landed fish, unset after a lost one. */
  gain?: number;
}

let nextId = 1;

/** A new charter in a zone (and Abyss marker) with the angler's Deep Sea Rod (`eco.seaRod`), fixed for the charter. */
export function newRun(zone: number, marker: number, name: string, rod: SeaRod): DiveRun {
  return { id: nextId++, dive: startDive(zone, marker, rod), crew: [name], heldAt: null };
}

/** True once a charter has waited longer than `DIVE.holdMs` for its angler. */
export const expired = (run: DiveRun, now: number): boolean => run.heldAt !== null && now - run.heldAt > DIVE.holdMs;

export function diveView(run: DiveRun): DiveView {
  const d = run.dive;
  const v: DiveView = {
    id: run.id, zone: d.zone, marker: d.marker, toNext: d.toNext, line: d.line, state: d.state,
    rating: seaRating(d.zone, d.marker, d.rod), fishLine: lineCost(d.zone, d.marker, d.rod), pay: payAt(d.zone, d.marker),
    spool: spoolPrice(d.zone), tally: { ...d.tally },
  };
  if (run.cost !== undefined) v.cost = run.cost;
  if (run.lost) v.lost = run.lost;
  if (run.gain !== undefined) v.gain = run.gain;
  return v;
}

/** The end card's message: why the charter ended, where, and its tally. Nothing is settled here: fish paid as they landed. */
export const diveEnd = (run: DiveRun, why: DiveEnd['why']): DiveEnd => ({ why, zone: run.dive.zone, marker: run.dive.marker, tally: { ...run.dive.tally } });

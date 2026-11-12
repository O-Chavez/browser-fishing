import { DIVE } from '../src/data/dive';
import { diveGear, haulBonus, startDive, type Dive, type SeaGear } from '../src/game/dive';
import type { SaveData } from '../src/game/state';
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
  /** Pearls the last fight added to the haul: set (maybe 0) after a landed fish, unset after a lost one. */
  gain?: number;
}

let nextId = 1;

/** A new dive from `start` with the diver's Deep Sea Rod and Line levels (`eco.seaGear`), fixed for the dive. */
export function newRun(start: number, name: string, gear: SeaGear): DiveRun {
  return { id: nextId++, dive: startDive(start, gear), crew: [name], heldAt: null, coins: 0 };
}

/**
 * Fills in what a dive kept from before dives knew their gear and the haul's growth would lack: the diver's levels now
 * (levels can't change at sea) and no growth. Dives aren't saved, so only a run held in memory across an update needs it.
 */
export function healRun(run: DiveRun, gear: SeaGear): DiveRun {
  const d: Partial<Dive> = run.dive;
  if (!d.gear) d.gear = { rod: gear.rod, line: gear.line };
  if (!Number.isFinite(d.grown)) d.grown = 0;
  return run;
}

/** True once a dive has waited longer than `DIVE.holdMs` for its diver. */
export const expired = (run: DiveRun, now: number): boolean => run.heldAt !== null && now - run.heldAt > DIVE.holdMs;

export function diveView(run: DiveRun): DiveView {
  const d = run.dive;
  const gear = diveGear(d);
  const v: DiveView = {
    id: run.id, start: d.start, depth: d.depth, line: Math.round(d.line * 10) / 10, state: d.state, ledges: d.ledges, grown: d.grown ?? 0,
    pearls: d.pearls, gear: { rod: gear.rod, line: gear.line }, fish: d.fish.length, coins: run.coins,
  };
  if (run.worn !== undefined) v.worn = Math.round(run.worn * 10) / 10;
  if (run.lost) v.lost = run.lost;
  if (run.gain !== undefined) v.gain = run.gain;
  return v;
}

/**
 * The end of a dive that didn't head home at a marker: the line ran out, the diver was away too long, headed home
 * between markers or reset. The haul keeps its pearls (`pearls`) and loses its bonus (`bonus`, in pearls).
 */
export function sunkEnd(run: DiveRun, why: 'line' | 'away' | 'home' | 'quit', lost?: LossReason | 'gone'): DiveEnd {
  const pearls = run.dive.pearls;
  const bonus = Math.round(pearls * haulBonus(run.dive.grown ?? 0)) - pearls;
  return { result: 'sunk', why, depth: run.dive.depth, pearls, bonus, fish: run.dive.fish.length, coins: run.coins, ...(lost ? { lost } : {}) };
}

/** Ends a dive the `sunkEnd` way: the haul's pearls, without the bonus, go to the diver's save. Returns the end card. */
export function sinkRun(run: DiveRun, save: SaveData, why: 'line' | 'away' | 'home' | 'quit', lost?: LossReason | 'gone'): DiveEnd {
  const end = sunkEnd(run, why, lost);
  save.pearls += run.dive.pearls;
  return end;
}

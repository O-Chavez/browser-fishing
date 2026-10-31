import { FISH, byId } from '../data/content';
import {
  FREE_FISH, REPLACE_ASK_MS, SELL_TIER, SMOKED_SELL, SMOKER_SPOTS, SMOKE_LEVEL, SNACKS, SNACK_MAX_MINUTES, SNACK_MINUTES, STAGES,
  smokeSeconds, type BuffKind, type Stage, type StageId,
} from '../data/smokehouse';
import { sellValue } from './progression';
import { FISH_SLOT, clearSlot, type FishItem, type SaveData } from './state';

/**
 * The Smokehouse (GAME_DESIGN.md §38.2): fish go on Mags's smoker one per spot, smoke for seconds
 * (offline too) into the Pantry, and are sold or eaten as snacks whose buff ticks down in online
 * time only. Pure save mutations, like economy.ts: the server runs them and the client mirrors them.
 */

type S = Pick<SaveData, 'smoke'>;

const SNACK_MS = SNACK_MINUTES * 60_000;
const SNACK_MAX_MS = SNACK_MAX_MINUTES * 60_000;

export const smokerOpen = (s: Pick<SaveData, 'level'>): boolean => s.level >= SMOKE_LEVEL;

/** Whether a stage is open: Small Fry by level, the others by a first catch of their lowest tier, read from the Fishdex. */
export function stageOpen(s: Pick<SaveData, 'level' | 'dex'>, st: Stage): boolean {
  if (!smokerOpen(s)) return false;
  if (st.id === 'smallfry') return true;
  return Object.keys(s.dex).some((id) => FISH.find((f) => f.id === id)?.tier === st.tiers[0]);
}
export const kitchenOpen = (s: Pick<SaveData, 'level' | 'dex'>): boolean => stageOpen(s, STAGES[1]);

/** The snack a smoked fish makes, or null for tiers 4-5. */
export const snackFor = (fishId: string): { kind: BuffKind; bonus: number } | null => SNACKS[byId(FISH, fishId).tier] ?? null;

/**
 * Marks newly opened stages as seen and returns them. Opening the smoker hands over the free smoked
 * fish. `intro` is set when nothing was seen before but several stages open at once: an existing
 * player meeting the Smokehouse for the first time, who gets one "New in town" banner.
 */
export function openStages(s: Pick<SaveData, 'level' | 'dex' | 'smoke'>): { ids: StageId[]; intro: boolean } {
  const fresh = s.smoke.seen.length === 0;
  const ids = STAGES.filter((st) => !s.smoke.seen.includes(st.id) && stageOpen(s, st)).map((st) => st.id);
  if (!ids.length) return { ids, intro: false };
  s.smoke.seen.push(...ids);
  if (ids.includes('smallfry')) {
    const t1 = FISH.filter((f) => f.tier === 1);
    const fav = t1.reduce((a, b) => ((s.dex[b.id]?.count ?? 0) > (s.dex[a.id]?.count ?? 0) ? b : a), t1[0]);
    stock(s, fav.id, sellValue(fav, fav.minSize), FREE_FISH);
  }
  return { ids, intro: fresh && ids.length > 1 };
}

// ---------- The smoker ----------

/** The first free spot on the smoker, or -1. */
export const freeSpot = (s: S): number => s.smoke.spots.findIndex((x) => !x);

/** Puts the fish in hotbar slot `slot` on the smoker. Returns why it can't, or null. */
export function smokeFish(s: SaveData, slot: number, now: number): string | null {
  if (!smokerOpen(s)) return `Mags opens up at level ${SMOKE_LEVEL}.`;
  const item = Number.isInteger(slot) ? s.slots[slot] : null;
  if (item?.k !== 'fish') return 'Pick a fish from your hotbar.';
  const at = freeSpot(s);
  if (at < 0) return 'The smoker is full. A spot frees up when a fish is done.';
  s.smoke.spots[at] = { fish: item, doneAt: now + smokeSeconds(byId(FISH, item.fishId).tier) * 1000 };
  clearSlot(s, slot);
  return null;
}

/** Hotbar slots Smoke all would load, in order: every fish but the shinies, which sell for 5×. */
export function smokeAllSlots(s: SaveData): number[] {
  const out: number[] = [];
  for (let i = FISH_SLOT; i < s.slots.length; i++) {
    const it = s.slots[i];
    if (it?.k === 'fish' && !it.shiny) out.push(i);
  }
  return out.slice(0, s.smoke.spots.filter((x) => !x).length);
}

/** Puts every non-shiny hotbar fish on the smoker, as many as fit. Returns why none went on, or null. */
export function smokeAll(s: SaveData, now: number): string | null {
  if (!smokerOpen(s)) return `Mags opens up at level ${SMOKE_LEVEL}.`;
  if (freeSpot(s) < 0) return 'The smoker is full. A spot frees up when a fish is done.';
  const slots = smokeAllSlots(s);
  if (!slots.length) return s.slots.some((x) => x?.k === 'fish') ? 'Smoke all skips shinies: click one to smoke it anyway.' : 'No fish in your hotbar.';
  for (const i of slots) {
    const item = s.slots[i] as FishItem;
    s.smoke.spots[freeSpot(s)] = { fish: item, doneAt: now + smokeSeconds(byId(FISH, item.fishId).tier) * 1000 };
  }
  // From the end, so clearing an extra slot past the hotbar doesn't shift the ones still to clear.
  for (const i of [...slots].reverse()) clearSlot(s, i);
  return null;
}

/** Adds `n` smoked fish of a species to the Pantry; each keeps its raw sale value, highest first. */
export function stock(s: S, fishId: string, value: number, n = 1): void {
  const list = listOf(s, fishId) ?? (s.smoke.pantry[fishId] = []);
  for (let i = 0; i < n; i++) list.push(Math.round(value));
  list.sort((a, b) => b - a);
}

/** A species' smoked fish, or undefined; client-sent ids like `constructor` never reach the object's prototype. */
const listOf = (s: S, fishId: unknown): number[] | undefined =>
  typeof fishId === 'string' && Object.hasOwn(s.smoke.pantry, fishId) && FISH.some((f) => f.id === fishId) ? s.smoke.pantry[fishId] : undefined;

export const pantryCount = (s: S, fishId: string): number => listOf(s, fishId)?.length ?? 0;
export const pantryTotal = (s: S): number => Object.values(s.smoke.pantry).reduce((a, l) => a + (l?.length ?? 0), 0);

/** Moves every finished fish into the Pantry; returns how many of each species. */
export function collect(s: S, now: number): { fishId: string; n: number }[] {
  const out: { fishId: string; n: number }[] = [];
  s.smoke.spots.forEach((sp, i) => {
    if (!sp || sp.doneAt > now) return;
    stock(s, sp.fish.fishId, sellValue(byId(FISH, sp.fish.fishId), sp.fish.size, sp.fish.shiny) * (sp.fish.mult ?? 1));
    s.smoke.spots[i] = null;
    const d = out.find((x) => x.fishId === sp.fish.fishId);
    if (d) d.n++;
    else out.push({ fishId: sp.fish.fishId, n: 1 });
  });
  return out;
}

// ---------- Selling ----------

export const sellable = (fishId: string): boolean => byId(FISH, fishId).tier <= SELL_TIER;
/** What Mags pays for every smoked fish of a species, or (`one`) for the most valuable one. */
export function smokedPrice(s: S, fishId: string, one = false): number {
  const list = listOf(s, fishId) ?? [];
  return Math.round((one ? (list[0] ?? 0) : list.reduce((a, v) => a + v, 0)) * SMOKED_SELL);
}

/**
 * Sells smoked fish of a species to Mags: every one with `all`, else the most valuable one (eating
 * takes the cheapest first, so the two leave each other the right fish). Returns why it can't, or null.
 */
export function sellSmoked(s: Pick<SaveData, 'smoke' | 'coins'>, fishId: unknown, all = false): string | null {
  const list = listOf(s, fishId);
  if (!list?.length) return 'There are none in your Pantry.';
  const id = fishId as string;
  if (!sellable(id)) return 'Mags only buys smoked tier 1 and 2 fish. Save these for her kitchen.';
  s.coins += smokedPrice(s, id, !all);
  if (all) list.length = 0;
  else list.shift();
  if (!list.length) delete s.smoke.pantry[id];
  return null;
}

// ---------- Snacks ----------

/** The snack being eaten, with what it does, or null. */
export function snack(s: S): { fishId: string; ms: number; kind: BuffKind; bonus: number } | null {
  const sn = s.smoke.snack;
  const d = sn && sn.ms > 0 ? snackFor(sn.fishId) : null;
  return sn && d ? { ...sn, ...d } : null;
}

/** Same buff, same strength: eating it adds time instead of replacing. */
const sameSnack = (a: string, b: string): boolean => byId(FISH, a).tier === byId(FISH, b).tier;

/** Whether eating this would replace a different snack with more than a minute left, so the game asks first. */
export function wouldReplace(s: S, fishId: string): boolean {
  const cur = snack(s);
  return !!cur && !sameSnack(cur.fishId, fishId) && cur.ms > REPLACE_ASK_MS;
}

/**
 * What eating would do: how many fish it takes, the snack time before (`from`, 0 when it starts or
 * replaces one) and after (`ms`). Eating more never makes a snack stronger, only longer: each fish
 * adds 5 minutes, up to 30, and Eat all eats only as many as fit. Null with the reason it can't.
 */
export function eatPlan(s: S, fishId: unknown, all = false): { n: number; from: number; ms: number } | string {
  const list = listOf(s, fishId);
  if (!list?.length) return 'There are none in your Pantry.';
  const id = fishId as string;
  if (!snackFor(id)) return 'Smoked jewels and spirits are for dishes, not snacks.';
  const cur = snack(s);
  const from = cur && sameSnack(cur.fishId, id) ? cur.ms : 0;
  if (from >= SNACK_MAX_MS - 1000) return `That's already ${SNACK_MAX_MINUTES} minutes' worth.`;
  const n = all ? Math.min(list.length, Math.ceil((SNACK_MAX_MS - from) / SNACK_MS)) : 1;
  return { n, from, ms: Math.min(SNACK_MAX_MS, from + n * SNACK_MS) };
}

/** Eats one smoked fish (or, with `all`, as many as fit under the cap) for its snack buff. Returns why it can't, or null. */
export function eat(s: S, fishId: unknown, all = false): string | null {
  const plan = eatPlan(s, fishId, all);
  if (typeof plan === 'string') return plan;
  const id = fishId as string;
  const list = listOf(s, id)!;
  // The cheapest ones go first; the best are kept for selling.
  list.splice(list.length - plan.n, plan.n);
  if (!list.length) delete s.smoke.pantry[id];
  s.smoke.snack = { fishId: id, ms: plan.ms };
  return null;
}

/** Runs the snack down by `ms` of online time; true if it wore off. */
export function tickSnack(s: S, ms: number): boolean {
  const sn = s.smoke.snack;
  if (!sn || !(ms > 0)) return false;
  sn.ms -= ms;
  if (sn.ms > 0) return false;
  s.smoke.snack = null;
  return true;
}

/** The snack's bonus of this kind at catch (0.25 for +25%), with the species to credit. */
export function buff(s: S, kind: BuffKind): { bonus: number; fishId: string } | null {
  const sn = snack(s);
  return sn && sn.kind === kind ? { bonus: sn.bonus, fishId: sn.fishId } : null;
}

import { FISH, byId, type Fish } from '../data/content';
import {
  BITE_WAIT, BUFF_MINUTES, CONTROL_BUFF, DUSK_BITE, GLAZE_NIGHT_FISH, LUCK_BUFF, MAX_BUFFS, RECIPES, SHINY_BUFF, TROPHY_BONUS, TROPHY_TOP, WELL_SMOKED,
  fits, needLabel, rackCount, recipeById, type Recipe, type RecipeId,
} from '../data/smokehouse';
import { NIGHT_BITE } from './daynight';
import { clearSlot, freeFishSlot, type FishItem, type Rack, type SaveData } from './state';

/**
 * The Smokehouse (GAME_DESIGN.md §38.2): fish go onto Mags's racks a few at a time, smoke in real
 * time (offline too) into the Pantry, and are eaten for buffs that tick down in online time only.
 * Pure save mutations, like economy.ts: the server runs them and the client mirrors them.
 */

type S = Pick<SaveData, 'level' | 'smoke'>;

export const unlocked = (s: Pick<SaveData, 'level'>, r: Recipe): boolean => s.level >= r.level;

/** Trophy size: the top fifth of the species' size range. */
export function isTrophy(f: { fishId: string; size: number }): boolean {
  const d = byId(FISH, f.fishId);
  return f.size >= d.maxSize - TROPHY_TOP * (d.maxSize - d.minSize);
}

/** A batch's buff length in seconds: trophy-size fish add up to half again, by their share of the batch. */
export function batchSeconds(fish: FishItem[]): number {
  const share = fish.filter(isTrophy).length / Math.max(1, fish.length);
  return Math.round(BUFF_MINUTES * 60 * (1 + TROPHY_BONUS * share));
}

export const madeCount = (s: S, id: RecipeId): number => s.smoke.made[id] ?? 0;
/** Smoked `WELL_SMOKED` times: every batch from then on yields two. */
export const wellSmoked = (s: S, id: RecipeId): boolean => madeCount(s, id) >= WELL_SMOKED;

/** The rack a fish for this recipe goes on: the one already being loaded with it, else the first free one. */
export function rackFor(s: S, r: Recipe): number {
  const racks = s.smoke.racks.slice(0, rackCount(s.level));
  const loading = racks.findIndex((x) => x?.r === r.id && !x.doneAt);
  return loading >= 0 ? loading : racks.indexOf(null);
}

/** The spot on the rack this fish would fill, or -1. */
export const spotFor = (rack: Rack | null, r: Recipe, fish: Fish): number => r.needs.findIndex((n, j) => !rack?.fish[j] && fits(n, fish));

/** The spots still empty on the rack being loaded with this recipe, in words. */
export function stillNeeds(s: S, r: Recipe): string[] {
  const at = rackFor(s, r);
  const rack = at >= 0 ? s.smoke.racks[at] : null;
  return r.needs.filter((_, j) => !rack?.fish[j]).map((n) => needLabel(n, (id) => byId(FISH, id).name));
}

/** Puts a hotbar fish on a rack for this recipe; the rack starts smoking once full. Returns why it can't, or null. */
export function loadFish(s: SaveData, id: unknown, slot: number, now: number): string | null {
  const r = recipeById(id);
  if (!r) return 'Pick a recipe first.';
  if (!unlocked(s, r)) return `${r.name} unlocks at level ${r.level}.`;
  const item = Number.isInteger(slot) ? s.slots[slot] : null;
  if (item?.k !== 'fish') return 'Pick a fish from your hotbar.';
  const at = rackFor(s, r);
  if (at < 0) return 'Every rack is busy. Come back when one is done.';
  const rack: Rack = s.smoke.racks[at] ?? { r: r.id, fish: r.needs.map(() => null) };
  const fish = byId(FISH, item.fishId);
  const j = spotFor(rack, r, fish);
  if (j < 0) return `${r.name} doesn't take a ${fish.name}. It still needs: ${stillNeeds(s, r).join(', ')}.`;
  rack.fish[j] = item;
  s.smoke.racks[at] = rack;
  clearSlot(s, slot);
  if (rack.fish.every(Boolean)) rack.doneAt = now + r.minutes * 60_000;
  return null;
}

/** Takes a fish back off a rack that hasn't started smoking. Returns why it can't, or null. */
export function takeFish(s: SaveData, at: number, j: number): string | null {
  const rack = Number.isInteger(at) ? s.smoke.racks[at] : null;
  const item = rack && Number.isInteger(j) ? rack.fish[j] : null;
  if (!rack || !item) return 'Nothing there to take.';
  if (rack.doneAt) return "It's already smoking.";
  const free = freeFishSlot(s);
  if (free < 0) return 'Your fish slots are full.';
  s.slots[free] = item;
  rack.fish[j] = null;
  if (rack.fish.every((f) => !f)) s.smoke.racks[at] = null;
  return null;
}

/** Adds `n` items to the Pantry, keeping each recipe's list longest first. */
export function stock(s: S, id: RecipeId, seconds: number, n = 1): void {
  const list = (s.smoke.pantry[id] ??= []);
  for (let i = 0; i < n; i++) list.push(seconds);
  list.sort((a, b) => b - a);
}

export const pantryCount = (s: S, id: RecipeId): number => s.smoke.pantry[id]?.length ?? 0;

/** Moves every finished rack into the Pantry; returns what was smoked. */
export function collectRacks(s: S, now: number): { id: RecipeId; n: number }[] {
  const out: { id: RecipeId; n: number }[] = [];
  s.smoke.racks.forEach((rack, i) => {
    if (!rack?.doneAt || rack.doneAt > now) return;
    const n = wellSmoked(s, rack.r) ? 2 : 1;
    stock(s, rack.r, batchSeconds(rack.fish.filter((f): f is FishItem => !!f)), n);
    s.smoke.made[rack.r] = madeCount(s, rack.r) + 1;
    s.smoke.racks[i] = null;
    out.push({ id: rack.r, n });
  });
  return out;
}

/** The best recipe this player has unlocked: what a level-up gift comes as. */
export const bestRecipe = (s: Pick<SaveData, 'level'>): Recipe => RECIPES.filter((r) => unlocked(s, r)).at(-1)!;

/** Puts banked provision gifts (levels past 50) in the Pantry as the best recipe unlocked; returns how many. */
export function stockGifts(s: Pick<SaveData, 'level' | 'smoke' | 'gifts'>): number {
  const n = s.gifts.provisions;
  if (n <= 0) return 0;
  stock(s, bestRecipe(s).id, BUFF_MINUTES * 60, n);
  s.gifts.provisions = 0;
  return n;
}

/** Eats the longest-lasting item of a recipe. Different kinds stack, the same kind refreshes. Returns why it can't, or null. */
export function eat(s: S, id: unknown): string | null {
  const r = recipeById(id);
  const list = r && s.smoke.pantry[r.id];
  if (!r || !list?.length) return 'There are none in your Pantry.';
  const cur = s.smoke.buffs.find((b) => b.id === r.id);
  if (!cur && s.smoke.buffs.length >= MAX_BUFFS) return `You're full! At most ${MAX_BUFFS} kinds at once.`;
  const ms = list.shift()! * 1000;
  if (!list.length) delete s.smoke.pantry[r.id];
  if (cur) cur.ms = Math.max(cur.ms, ms);
  else s.smoke.buffs.push({ id: r.id, ms });
  return null;
}

/** Runs the buffs down by `ms` of online time; true if one wore off. */
export function tickBuffs(s: S, ms: number): boolean {
  if (!s.smoke.buffs.length || !(ms > 0)) return false;
  for (const b of s.smoke.buffs) b.ms -= ms;
  const before = s.smoke.buffs.length;
  s.smoke.buffs = s.smoke.buffs.filter((b) => b.ms > 0);
  return s.smoke.buffs.length < before;
}

export const buffOn = (s: Pick<SaveData, 'smoke'>, id: RecipeId): boolean => s.smoke.buffs.some((b) => b.id === id && b.ms > 0);

/** What eaten buffs do. Each one multiplies with the rod, bait and casino perks. */
export const biteWait = (s: Pick<SaveData, 'smoke'>): number => (buffOn(s, 'minnowbites') ? BITE_WAIT : 1);
export const buffLuck = (s: Pick<SaveData, 'smoke'>): number => (buffOn(s, 'kippers') ? LUCK_BUFF : 1);
export const buffControl = (s: Pick<SaveData, 'smoke'>): number => (buffOn(s, 'pikejerky') ? CONTROL_BUFF : 1);
export const buffNightFish = (s: Pick<SaveData, 'smoke'>): number => (buffOn(s, 'lanternglaze') ? GLAZE_NIGHT_FISH : 1);
export const buffShiny = (s: Pick<SaveData, 'smoke'>): number => (buffOn(s, 'jewelplatter') ? SHINY_BUFF : 1);

/** Whether night fish bite at this darkness (`nightness`): from dusk with Lantern Glaze, else once it's properly dark. */
export const nightBite = (s: Pick<SaveData, 'smoke'>, dark: number): boolean => dark >= (buffOn(s, 'lanternglaze') ? DUSK_BITE : NIGHT_BITE);

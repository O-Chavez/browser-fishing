import { FISH, byId } from '../data/content';
import {
  DISHES, DISH_COINS, DISH_MAX_MINUTES, DISH_MINUTES_PER_FISH, DISH_SHINY, FREE_FISH, REPLACE_ASK_MS,
  SELL_TIER, SMOKED_SELL, SMOKER_SPOTS, SMOKE_LEVEL, SNACKS, SNACK_MAX_MINUTES, SNACK_MINUTES, STAGES, dishById, smokeSeconds,
  type BuffKind, type Dish, type DishId, type Stage, type StageId,
} from '../data/smokehouse';
import { sellValue } from './progression';
import { FISH_SLOT, clearSlot, type FishItem, type SaveData } from './state';

/**
 * The Smokehouse (GAME_DESIGN.md §38.2): fish go on Mags's smoker one per spot, smoke for seconds
 * (offline too) into the Pantry, and are sold, eaten as snacks, or cooked into dishes. A snack and a
 * dish can run together, ticking down in online time only. Pure save mutations, like economy.ts:
 * the server runs them and the client mirrors them.
 */

type S = Pick<SaveData, 'smoke'>;

const SNACK_MS = SNACK_MINUTES * 60_000;
const SNACK_MAX_MS = SNACK_MAX_MINUTES * 60_000;

export const smokerOpen = (s: Pick<SaveData, 'level'>): boolean => s.level >= SMOKE_LEVEL;

/** Whether the Fishdex has a fish of this tier or higher: a tier 4 catch opens everything a tier 3 one would. */
export const reachedTier = (s: Pick<SaveData, 'dex'>, tier: number): boolean => Object.keys(s.dex).some((id) => (FISH.find((f) => f.id === id)?.tier ?? 0) >= tier);

/** Whether a stage is open: Small Fry by level, the others by a first catch of their lowest tier or higher, read from the Fishdex. */
export function stageOpen(s: Pick<SaveData, 'level' | 'dex'>, st: Stage): boolean {
  if (!smokerOpen(s)) return false;
  return st.id === 'smallfry' || reachedTier(s, st.tiers[0]);
}
export const kitchenOpen = (s: Pick<SaveData, 'level' | 'dex'>): boolean => stageOpen(s, STAGES[1]);

/** The snack a smoked fish makes, or null for tiers 4-5. */
export const snackFor = (fishId: string): { kind: BuffKind; bonus: number } | null => SNACKS[byId(FISH, fishId).tier] ?? null;

/**
 * Marks newly opened stages as seen and returns them. Opening the smoker hands over the free smoked
 * fish, and opening the Kitchen a free Fish Cakes. `intro` is set when nothing was seen before but several stages open at once: an existing
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
  if (ids.includes('giants')) addCooked(s, 'fishcakes', 1);
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

/** Runs the snack and the dish down by `ms` of online time; says which wore off. */
export function tickBuffs(s: S, ms: number): { snack: boolean; dish: boolean } {
  const worn = { snack: false, dish: false };
  if (!(ms > 0)) return worn;
  for (const k of ['snack', 'dish'] as const) {
    const b = s.smoke[k];
    if (!b) continue;
    b.ms -= ms;
    if (b.ms > 0) continue;
    s.smoke[k] = null;
    worn[k] = true;
  }
  return worn;
}

/**
 * The bonus of this kind at catch (0.25 for +25% XP, 1 for ✨ ×2), with what to credit
 * ("Smoked Perch", "Angler's Supper"). With a snack and a dish of the same kind, the stronger counts.
 */
export function buff(s: S, kind: BuffKind): { bonus: number; from: string } | null {
  const sn = snack(s);
  const a = sn && sn.kind === kind ? { bonus: sn.bonus, from: `Smoked ${byId(FISH, sn.fishId).name}` } : null;
  const d = dish(s);
  const b = d && d[kind] > 0 ? { bonus: d[kind], from: d.name } : null;
  return a && b ? (b.bonus > a.bonus ? b : a) : (a ?? b);
}

/** The shiny chance multiplier from a dish's ✨ (1 without one). */
export const shinyMult = (s: S): number => 1 + (buff(s, 'shiny')?.bonus ?? 0);

// ---------- The Kitchen ----------

const DISH_MAX_MS = DISH_MAX_MINUTES * 60_000;

export const fishIn = (d: Dish): number => d.needs.reduce((a, n) => a + n, 0);
const tiersIn = (d: Dish): number[] => d.needs.flatMap((n, i) => (n ? [i + 1] : []));
/** The highest tier in a dish: its stage and colour. */
export const topTier = (d: Dish): number => Math.max(...tiersIn(d));

/** A dish is open once the Kitchen is and its top tier (or higher) has been caught. */
export const dishOpen = (s: Pick<SaveData, 'level' | 'dex'>, d: Dish): boolean => kitchenOpen(s) && reachedTier(s, topTier(d));
/** What opens a locked dish, in words. */
export function dishGoal(s: Pick<SaveData, 'level' | 'dex'>, d: Dish): string {
  const t = [3, topTier(d)].find((x) => !reachedTier(s, x));
  return t ? `Catch a tier ${t} fish` : `Reach level ${SMOKE_LEVEL}`;
}

/**
 * What a dish does. The tiers in it decide the buffs: 💰 at twice its best snack, ⭐ at its best
 * snack (so at most +50%), ✨ from tier 4 and 5 fish. The fish count decides how long: 3 minutes
 * each.
 */
export function dishBuffs(d: Dish): Record<BuffKind, number> & { ms: number } {
  const tiers = tiersIn(d);
  const best = (kind: BuffKind) => Math.max(0, ...tiers.map((t) => (SNACKS[t]?.kind === kind ? SNACKS[t]!.bonus : 0)));
  return {
    xp: best('xp'),
    coins: best('coins') * DISH_COINS,
    shiny: Math.max(0, ...tiers.map((t) => (DISH_SHINY[t] ?? 1) - 1)),
    ms: fishIn(d) * DISH_MINUTES_PER_FISH * 60_000,
  };
}

/** Smoked fish of a tier in the Pantry. */
export const tierCount = (s: S, tier: number): number =>
  Object.entries(s.smoke.pantry).reduce((a, [id, l]) => a + (byId(FISH, id).tier === tier ? (l?.length ?? 0) : 0), 0);

/** The smoked fish a dish still needs, by tier (index 0 is tier 1); all zeros when it can be cooked. */
export const shortfall = (s: S, d: Dish): number[] => d.needs.map((n, i) => Math.max(0, n - tierCount(s, i + 1)));

/** Takes the cheapest smoked fish of a tier, keeping the best ones for selling. */
function takeCheapest(s: S, tier: number): void {
  let pick: string | null = null;
  for (const [id, l] of Object.entries(s.smoke.pantry)) {
    if (!l?.length || byId(FISH, id).tier !== tier) continue;
    if (!pick || l[l.length - 1] < s.smoke.pantry[pick]!.at(-1)!) pick = id;
  }
  if (!pick) return;
  const list = s.smoke.pantry[pick]!;
  list.pop();
  if (!list.length) delete s.smoke.pantry[pick];
}

const cookedStack = (s: S, id: DishId) => s.smoke.cooked.find((c) => c.id === id);
export const cookedCount = (s: S, id: DishId): number => cookedStack(s, id)?.n ?? 0;
export const cookedTotal = (s: S): number => s.smoke.cooked.reduce((a, c) => a + c.n, 0);

/** Puts `n` cooked dishes in the Pantry. */
export function addCooked(s: S, id: DishId, n: number): void {
  const c = cookedStack(s, id);
  if (c) c.n += n;
  else s.smoke.cooked.push({ id, n });
}

/**
 * Cooks a dish from the Pantry's smoked fish (the cheapest of each tier) into the Pantry. Returns why
 * it can't, or null.
 */
export function cook(s: Pick<SaveData, 'smoke' | 'level' | 'dex'>, id: unknown): string | null {
  const d = dishById(id);
  if (!d) return "Mags doesn't know that dish.";
  if (!dishOpen(s, d)) return `${d.name}: ${dishGoal(s, d)} to unlock it.`;
  if (shortfall(s, d).some((n) => n > 0)) return `Not enough smoked fish for ${d.name}.`;
  d.needs.forEach((n, i) => {
    for (let k = 0; k < n; k++) takeCheapest(s, i + 1);
  });
  addCooked(s, d.id, 1);
  return null;
}

/** The dish being eaten, with what it does, or null. */
export function dish(s: S): (Record<BuffKind, number> & { id: DishId; ms: number; name: string }) | null {
  const cur = s.smoke.dish;
  const d = cur && cur.ms > 0 ? dishById(cur.id) : undefined;
  return cur && d ? { ...dishBuffs(d), ...cur, name: d.name } : null;
}

/**
 * What eating a cooked dish would do: the dish time before (`from`, 0 when it starts or replaces
 * one) and after (`ms`). The same dish adds its time, up to an hour; another replaces it. Null with
 * the reason it can't.
 */
export function dishPlan(s: S, id: unknown): { from: number; ms: number } | string {
  const d = dishById(id);
  if (!d || !cookedCount(s, d.id)) return 'There are none in your Pantry.';
  const cur = s.smoke.dish;
  const from = cur && cur.id === d.id ? cur.ms : 0;
  if (from >= DISH_MAX_MS - 1000) return `That's already ${DISH_MAX_MINUTES} minutes' worth.`;
  return { from, ms: Math.min(DISH_MAX_MS, from + dishBuffs(d).ms) };
}

/** Whether eating this dish would replace a different one with more than a minute left, so the game asks first. */
export function wouldReplaceDish(s: S, id: DishId): boolean {
  const cur = dish(s);
  return !!cur && cur.id !== id && cur.ms > REPLACE_ASK_MS;
}

/** Eats a cooked dish from the Pantry. Returns why it can't, or null. */
export function eatDish(s: S, id: unknown): string | null {
  const plan = dishPlan(s, id);
  if (typeof plan === 'string') return plan;
  const d = dishById(id)!;
  const c = cookedStack(s, d.id)!;
  if (--c.n <= 0) s.smoke.cooked.splice(s.smoke.cooked.indexOf(c), 1);
  s.smoke.dish = { id: d.id, ms: plan.ms };
  return null;
}

/** The best dish unlocked, for level gifts. */
export const bestDish = (s: Pick<SaveData, 'level' | 'dex'>): Dish | undefined => [...DISHES].reverse().find((d) => dishOpen(s, d));

/** Turns banked level gifts (one per level past 50) into the best dish unlocked, in the Pantry. */
export function serveGifts(s: Pick<SaveData, 'level' | 'dex' | 'smoke' | 'gifts'>): { id: DishId; n: number } | null {
  const n = s.gifts.provisions;
  const d = n > 0 ? bestDish(s) : undefined;
  if (!d) return null;
  addCooked(s, d.id, n);
  s.gifts.provisions = 0;
  return { id: d.id, n };
}

/** "🎁 Level gifts: Mags cooked you 3 Angler's Supper. They're in your Pantry." */
export const giftText = (g: { id: DishId; n: number }): string =>
  `🎁 Level gift${g.n === 1 ? '' : 's'}: Mags cooked you ${g.n === 1 ? 'a' : g.n} ${dishById(g.id)!.name}. ${g.n === 1 ? "It's" : "They're"} in your Pantry.`;

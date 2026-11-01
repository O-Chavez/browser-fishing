import { CASINO_LEVEL } from '../data/casino';
import { BAITS, FISH, LINES, RODS, type Fish, type Line, type Rod } from '../data/content';
import { BAIT_PACK, CLEAN_BONUS } from './economy';
import { COIN } from './format';
import type { SaveData } from './state';

/**
 * One-time tips that walk a new player through the core loop: cast, reel, sell, buy better bait,
 * catch better fish. Each shows once per account; the ids seen are kept in the save.
 */
export const TIP_IDS = ['start', 'reel', 'catch', 'sold', 'bait', 'tier', 'smoker', 'snack', 'dish', 'fray', 'slack'] as const;
export type TipId = (typeof TIP_IDS)[number];

export const isTip = (id: unknown): id is TipId => TIP_IDS.includes(id as TipId);

/** Records a tip as seen. False if the id is unknown or it was already seen. */
export function markTip(s: Pick<SaveData, 'tips'>, id: unknown): boolean {
  if (!isTip(id) || s.tips.includes(id)) return false;
  s.tips.push(id);
  return true;
}

/** The next bait up from the best one the player owns, or null at the top. */
function nextBait(s: Pick<SaveData, 'slots' | 'locker'>) {
  let best = 1;
  for (const sl of s.slots) if (sl?.k === 'bait') best = Math.max(best, BAITS.find((b) => b.id === sl.id)?.tier ?? 1);
  for (const [id, n] of Object.entries(s.locker.bait)) if (n > 0) best = Math.max(best, BAITS.find((b) => b.id === id)?.tier ?? 1);
  return BAITS.find((b) => b.tier === best + 1) ?? null;
}

/** Tip text as HTML. Only game data goes in, so nothing needs escaping. `touch` words controls for the on-screen buttons. */
export function tipText(id: TipId, s: Pick<SaveData, 'level' | 'slots' | 'locker' | 'dex'>, vendor: string, touch = false): string {
  switch (id) {
    case 'start':
      return touch
        ? '<b>Hold the cast button</b> to wind up, let go to cast. Wait for the <b>!</b>, then tap it to hook the fish.'
        : '<b>Hold Click</b> to wind up, let go to cast. Wait for the <b>!</b>, then click to hook the fish.';
    case 'reel':
      return `<b>${touch ? 'Hold the button' : 'Hold Click'}</b> to reel in. When the fish surges, keep the gauge <b>green</b>: ease off before the red, and tighten before the fish takes your line.`;
    case 'fray':
      // Shown at the first fray, so players from before the fight rework learn the new rule too.
      return `Line frayed! You held in the red too long: ease off when it says <b>EASE OFF!</b>. Two frays snap the line, and a fish landed with none is a <b>clean catch</b>, worth ${Math.round(CLEAN_BONUS * 100)}% more.`;
    case 'slack':
      return `The fish took all your line! When it surges, keep the gauge above the white marker: ${touch ? 'hold the button' : 'hold Click'} to tighten the line when it says <b>TIGHTEN!</b>.`;
    case 'catch':
      return `Your first fish! Sell it to <b>${vendor}</b> at the striped stall by the pier: walk up and ${touch ? 'tap the prompt' : 'press <kbd>E</kbd>'}.`;
    case 'sold': {
      const b = nextBait(s);
      if (!b) return 'Coins earned! Spend them on better rods and bait at the stall.';
      const pack = `${BAIT_PACK} for ${b.price * BAIT_PACK} ${COIN}`;
      return s.level >= b.unlockLevel
        ? `Coins earned! Better bait brings better fish: <b>${b.name}</b> is for sale at the stall (${pack}).`
        : `Coins earned! Better bait brings better fish: <b>${b.name}</b> unlocks at <b>Lv ${b.unlockLevel}</b> (${pack}).`;
    }
    case 'bait':
      return 'New bait on your line! Better bait draws bigger fish that sell for more.';
    case 'tier':
      return `A new tier of fish! Keep upgrading your bait and rod to reach rarer ones. Casino Cove opens at <b>Lv ${CASINO_LEVEL}</b>.`;
    case 'smoker':
      return 'Small fry? Smoke it instead of selling it: <b>Mags Cinder</b> at the Smokehouse, across the path from Marlow\'s stall, smokes it in seconds.';
    case 'snack':
      return `Smoked fish ready! Eat one from your <b>Bag</b> (${touch ? 'the 🎒 button' : '<kbd>Tab</kbd>'}) for ⭐ more XP on every catch.`;
    case 'dish': {
      // Names the player's own tier 3 catch, so the next Fish Cakes is easy to picture.
      const t3 = FISH.filter((f) => f.tier === 3 && s.dex[f.id]).sort((a, b) => s.dex[b.id]!.count - s.dex[a.id]!.count)[0];
      return `Mags's Kitchen is open! A dish combines its fish's buffs, stronger and longer than a snack: your free <b>Fish Cakes</b> is in the Pantry. For the next one, smoke <b>3 tier 1 fish and ${t3 ? `your ${t3.name}` : 'a tier 3 fish'}</b>.`;
    }
  }
}

/** Fights longer than this count as tough. Medium fights take about 18 s, hard ones 30-40 s. */
export const TOUGH_FIGHT_SECS = 30;

/** How a fight went badly enough to suggest a better rod. */
export type FightEnd = 'snapped' | 'escaped' | 'tough';

/** The next rod up from the best one the player owns, if it's unlocked and not bought yet; null otherwise. */
export function rodUpgrade(s: Pick<SaveData, 'level' | 'slots' | 'locker'>): Rod | null {
  const owned = (id: string) => s.locker.rods.includes(id) || s.slots.some((sl) => sl?.k === 'rod' && sl.id === id);
  const best = Math.max(1, ...RODS.filter((r) => owned(r.id)).map((r) => r.tier));
  const next = RODS.find((r) => r.tier === best + 1);
  return next && s.level >= next.unlockLevel ? next : null;
}

/** The next line up from the one on the rod, if it's unlocked; null otherwise. */
export function lineUpgrade(s: Pick<SaveData, 'level' | 'line'>): Line | null {
  const cur = LINES.find((l) => l.id === s.line)?.tier ?? 1;
  const next = LINES.find((l) => l.tier === cur + 1);
  return next && s.level >= next.unlockLevel ? next : null;
}

/**
 * Gear upgrade hint as HTML, like `tipText`: a snap is the line's doing, a run-off or a long fight the rod's
 * (REELING.md: a message names exactly one piece of gear).
 */
export function gearHintText(end: FightEnd, gear: Rod | Line, vendor: string): string {
  const lead = end === 'snapped' ? 'Line snapped?' : end === 'escaped' ? 'Fish got away?' : 'Tough fight!';
  const why = end === 'snapped' ? 'Stronger line holds a harder-pulling fish' : 'A better rod wins line back faster from a heavy fish';
  return `${lead} ${why}: the <b>${gear.name}</b> is at ${vendor}'s stall (${gear.price.toLocaleString('en-US')} ${COIN}).`;
}

/** @deprecated use `gearHintText` */
export const rodHintText = gearHintText;

export type LossEnd = 'snapped' | 'escaped';
/** The card after a lost fight: one big word, the cause in a line, the fix in a line (REELING.md, "What the player feels"). */
export interface Verdict {
  title: string;
  cause: string;
  fix: string;
}

/**
 * What to say when a fight is lost. A fish over the line snapped it, a fish over the rod ran off with the line, and
 * each names the one piece of gear that fixes it and where it is; anything else was the player's own doing, so the
 * fix is a reel tip. `fish` is null at sea, where gear tiers don't apply.
 */
export function lossVerdict(end: LossEnd, s: Pick<SaveData, 'rod' | 'line' | 'level'>, fish: Fish | null, vendor: string): Verdict {
  const where = (g: { unlockLevel: number; price: number }) => (s.level < g.unlockLevel ? `unlocks at level ${g.unlockLevel}` : `${vendor}'s, ${g.price.toLocaleString('en-US')} ${COIN}`);
  if (end === 'snapped') {
    const line = LINES.find((l) => l.id === s.line) ?? LINES[0];
    const need = fish && fish.tier > line.tier ? LINES.find((l) => l.tier === fish.tier) : null;
    return need
      ? { title: 'SNAP!', cause: `Too strong for your ${line.name}`, fix: `${need.name} holds it · ${where(need)}` }
      : { title: 'SNAP!', cause: 'Held in the red through a surge', fix: 'Ease off when the gauge goes red' };
  }
  const rod = RODS.find((r) => r.id === s.rod) ?? RODS[0];
  const need = fish && fish.tier > rod.tier ? RODS.find((r) => r.tier === fish.tier) : null;
  return need
    ? { title: 'RAN OFF!', cause: `Too heavy for your ${rod.name}`, fix: `The ${need.name} lands it · ${where(need)}` }
    : { title: 'RAN OFF!', cause: 'The fish took all your line', fix: 'Tighten when the needle drops below the marker' };
}

import { CASINO_LEVEL } from '../data/casino';
import { BAITS, FISH, LINES, RODS, type Bait, type Fish, type Line, type Rod } from '../data/content';
import { DIVES_OPEN } from '../data/dive';
import { KOFI_URL } from '../data/support';
import { nextRodBuy, rodBuyName, seaFightRating } from './dive';
import { BAIT_PACK, CLEAN_BONUS, hasSailed } from './economy';
import { COIN } from './format';
import { gapsOf, matchupWords, overGear } from './progression';
import type { Gaps } from './reel';
import type { SaveData } from './state';

/**
 * One-time tips that walk a new player through the core loop: cast, reel, sell, buy better bait,
 * catch better fish. Each shows once per account; the ids seen are kept in the save.
 */
export const TIP_IDS = ['start', 'reel', 'catch', 'sold', 'bait', 'tier', 'smoker', 'snack', 'dish', 'fray', 'slack', 'charter'] as const;
export type TipId = (typeof TIP_IDS)[number];

export const isTip = (id: unknown): id is TipId => TIP_IDS.includes(id as TipId);

/**
 * The tip nudge: a card that asks whether the player would like to tip, at most once per milestone level (Oscar,
 * 2026-11-13). It follows a level-up that leaves a milestone at or under the player's level unseen: reaching 20,
 * 30 and 50 each show it once, and a player already past some of them (from before the nudge, or back-paid past
 * them) gets one card for all of those after their next level-up. The milestones seen are kept with the tips.
 */
export const NUDGE_LEVELS = [20, 30, 50] as const;
export const nudgeId = (level: number): string => `nudge${level}`;
export const NUDGE_IDS: readonly string[] = NUDGE_LEVELS.map(nudgeId);

/** Whether an id may be kept in `SaveData.tips`: a new-player tip or a tip nudge milestone. */
export const isSeenId = (id: unknown): id is string => isTip(id) || NUDGE_IDS.includes(id as string);

/** Records a tip (or a tip nudge milestone) as seen. False if the id is unknown or it was already seen. */
export function markTip(s: Pick<SaveData, 'tips'>, id: unknown): boolean {
  if (!isSeenId(id) || s.tips.includes(id)) return false;
  s.tips.push(id);
  return true;
}

/** The milestones a tip nudge shown now would cover: those reached and not seen yet. Empty when none is due. */
export function nudgesDue(s: Pick<SaveData, 'level' | 'tips'>): string[] {
  return NUDGE_LEVELS.filter((l) => s.level >= l).map(nudgeId).filter((id) => !s.tips.includes(id));
}

/** The card opens once the player has stood idle this long after releasing a catch. A default, to tune in play. */
export const NUDGE_BEAT_SECS = 1;

/** The tip nudge card's heading, in the window's bar. */
export const NUDGE_TITLE = 'Enjoying Lakeside?';

/**
 * The tip nudge card as HTML (Oscar chose the short wording, 2026-11-13). `name` is the player's name, already
 * escaped: a tip only gets its 💗 when the Ko-fi message carries it, so the card says so under the buttons.
 */
export function nudgeHtml(name: string): string {
  return `<div class="nudge"><p>The server costs money to run. If you'd like to help keep it going, you can leave a tip.</p>
    <p>Tips give nothing in game, only a 💗 by your name.</p>
    <div class="btns"><a class="btn gold" href="${KOFI_URL}" target="_blank" rel="noopener">☕ Tip on Ko-fi</a><button class="btn plain" data-act="close">Keep fishing</button></div>
    <p class="foot">Write your name (<b>${name}</b>) in the Ko-fi message to get the 💗.</p></div>`;
}

/** The next bait up from the best one the player owns, or null at the top. */
function nextBait(s: Pick<SaveData, 'slots' | 'locker'>) {
  let best = 1;
  for (const sl of s.slots) if (sl?.k === 'bait') best = Math.max(best, BAITS.find((b) => b.id === sl.id)?.tier ?? 1);
  for (const [id, n] of Object.entries(s.locker.bait)) if (n > 0) best = Math.max(best, BAITS.find((b) => b.id === id)?.tier ?? 1);
  return BAITS.find((b) => b.tier === best + 1) ?? null;
}

/**
 * Whether charters are worth pointing the player at: they own the Deep Sea Rod, haven't landed a sea fish yet (none
 * in the Fishdex), and the seaplane is taking players out (`open`, `DIVES_OPEN`), so nothing points at closed
 * charters and the usual goals come back after a first charter.
 */
export function chartersToTry(s: Pick<SaveData, 'seaRod' | 'dex'>, open = DIVES_OPEN): boolean {
  return open && s.seaRod && !hasSailed(s);
}

/** True when the one-time charter tip should show now. */
export const charterTipDue = (s: Pick<SaveData, 'seaRod' | 'dex' | 'tips'>, open = DIVES_OPEN): boolean => !s.tips.includes('charter') && chartersToTry(s, open);

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
      if (!b) return 'Coins earned! Spend them on better rods, line and bait at the stall.';
      const pack = `${BAIT_PACK} for ${b.price * BAIT_PACK} ${COIN}`;
      return s.level >= b.unlockLevel
        ? `Coins earned! Better bait brings better fish: <b>${b.name}</b> is for sale at the stall (${pack}).`
        : `Coins earned! Better bait brings better fish: <b>${b.name}</b> unlocks at <b>Lv ${b.unlockLevel}</b> (${pack}).`;
    }
    case 'bait':
      return 'New bait on your line! Better bait draws bigger fish that sell for more.';
    case 'tier':
      return `A new tier of fish! Keep upgrading your bait, line and rod to reach rarer ones. Casino Cove opens at <b>Lv ${CASINO_LEVEL}</b>.`;
    case 'smoker':
      return 'Small fry? Smoke it instead of selling it: <b>Mags Cinder</b> at the Smokehouse, across the path from Marlow\'s stall, smokes it in seconds.';
    case 'snack':
      return `Smoked fish ready! Eat one from your <b>Bag</b> (${touch ? 'the 🎒 button' : '<kbd>Tab</kbd>'}) for ⭐ more XP on every catch.`;
    case 'charter':
      return 'Your Deep Sea Rod is waiting on <b>Captain Reed</b>\'s seaplane! Find him on the <b>west beach</b>, buy a spool of line and cast off: the further out, the more the fish pay.';
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
/**
 * The card after a lost fight (REELING.md, "What the player feels"): one big word for how it ended, then either one
 * short line per piece of gear the fish was over, naming the next one to get (Oscar, 2026-11-03: "Rod too weak", no
 * wall of text), or, when the gear handled it, the cause and a reel tip.
 */
export interface Verdict {
  title: string;
  /** What went wrong, when it was the player's doing; none when it was the gear. */
  cause?: string;
  /** The gear lines, or the reel tip. */
  fixes: string[];
}

const ended = (end: LossEnd) => (end === 'snapped' ? 'SNAP!' : 'RAN OFF!');
/** A fish over neither piece of gear: the player's doing. */
const reelTip = (end: LossEnd): Verdict =>
  end === 'snapped'
    ? { title: 'SNAP!', cause: 'Held in the red through a surge', fixes: ['Ease off when the gauge goes red'] }
    : { title: 'RAN OFF!', cause: 'The fish took all your line', fixes: ['Hold in the green, above the blue'] };

/**
 * What to say when a fight is lost: the big word says how it ended, and the lines follow the matchup rather than the
 * ending (Oscar, 2026-11-03: a fish too strong for the line snaps it if the player wrestles it and runs off if they
 * let it go, and either way the line is the fix): "Line too weak", "Rod too weak" or both, each with the next one to
 * get. `fish` is null at sea, where gear tiers don't apply.
 */
export function lossVerdict(end: LossEnd, s: Pick<SaveData, 'rod' | 'line' | 'level'>, fish: Fish | null): Verdict {
  const next = (g: { name: string; unlockLevel: number }) => (s.level < g.unlockLevel ? `${g.name} at level ${g.unlockLevel}` : g.name);
  const line = LINES.find((l) => l.id === s.line) ?? LINES[0];
  const rod = RODS.find((r) => r.id === s.rod) ?? RODS[0];
  const needLine = fish && fish.tier > line.tier ? LINES.find((l) => l.tier === fish.tier) : null;
  const needRod = fish && fish.tier > rod.tier ? RODS.find((r) => r.tier === fish.tier) : null;
  const fixes = [needLine && `Line too weak → ${next(needLine)}`, needRod && `Rod too weak → ${next(needRod)}`].filter((x): x is string => !!x);
  return fixes.length ? { title: ended(end), fixes } : reelTip(end);
}

/**
 * The card after a lost sea fight, as the pond's: a fish Tough or Too much for the rod (`seaFightRating` on its own
 * gaps, `g`) names the rod's next step or Abyss level ("Rod too weak → Deep Sea Rod step 5"); a Fair or Easy one
 * was the player's doing, and gets the cause and a reel tip.
 */
export function seaLossVerdict(end: LossEnd, s: Pick<SaveData, 'rodStep' | 'abyssLevels'>, g: Gaps): Verdict {
  const r = seaFightRating(g);
  if (r !== 'tough' && r !== 'over') return reelTip(end);
  return { title: ended(end), fixes: [`Rod too weak → ${rodBuyName(nextRodBuy({ steps: s.rodStep, levels: s.abyssLevels }))}`] };
}

/**
 * A bait's top fish against the player's line and rod, in the hook toast's words (`matchupWords`; Oscar, 2026-11-03),
 * for the bait's details: "Its top fish: strong for your line." From two rungs over (`too`) it's a ⚠ warning that names
 * the gear that handles them, and shows after buying too. Null when the gear handles them. `who` names the fish.
 */
export function baitWarning(s: Pick<SaveData, 'rod' | 'line'>, bait: Bait, who = 'Its top fish'): { text: string; too: boolean } | null {
  const line = LINES.find((l) => l.id === s.line) ?? LINES[0];
  const rod = RODS.find((r) => r.id === s.rod) ?? RODS[0];
  const g = gapsOf({ strength: bait.tier, weight: bait.tier }, { line: line.tier, rod: rod.tier });
  const { words, too } = matchupWords(g);
  if (!words) return null;
  const said = `${who}: ${words[0].toLowerCase()}${words.slice(1)}.`;
  if (!too) return { text: said, too };
  const over = overGear(g);
  const needLine = over.line ? LINES.find((l) => l.tier === bait.tier)?.name : undefined;
  const needRod = over.rod ? RODS.find((r) => r.tier === bait.tier)?.name : undefined;
  const fix = needLine && needRod ? `${needLine} and the ${needRod} handle them.` : needLine ? `${needLine} holds them.` : `The ${needRod} handles them.`;
  return { text: `⚠ ${said} ${fix}`, too };
}

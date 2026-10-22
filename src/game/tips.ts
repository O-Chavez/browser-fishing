import { CASINO_LEVEL } from '../data/casino';
import { BAITS } from '../data/content';
import { BAIT_PACK } from './economy';
import type { SaveData } from './state';

/**
 * One-time tips that walk a new player through the core loop: cast, reel, sell, buy better bait,
 * catch better fish. Each shows once per account; the ids seen are kept in the save.
 */
export const TIP_IDS = ['start', 'reel', 'catch', 'sold', 'bait', 'tier'] as const;
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
export function tipText(id: TipId, s: Pick<SaveData, 'level' | 'slots' | 'locker'>, vendor: string, touch = false): string {
  switch (id) {
    case 'start':
      return touch
        ? '<b>Hold the cast button</b> to wind up, let go to cast. Wait for the <b>!</b>, then tap it to hook the fish.'
        : '<b>Hold Click</b> to wind up, let go to cast. Wait for the <b>!</b>, then click to hook the fish.';
    case 'reel':
      return `<b>${touch ? 'Hold the button' : 'Hold Click'}</b> to reel in. Ease off when the fish surges, or the line can snap.`;
    case 'catch':
      return `Your first fish! Sell it to <b>${vendor}</b> at the striped stall by the pier: walk up and ${touch ? 'tap the prompt' : 'press <kbd>E</kbd>'}.`;
    case 'sold': {
      const b = nextBait(s);
      if (!b) return 'Coins earned! Spend them on better rods and bait at the stall.';
      const pack = `${BAIT_PACK} for ${b.price * BAIT_PACK} 🪙`;
      return s.level >= b.unlockLevel
        ? `Coins earned! Better bait brings better fish: <b>${b.name}</b> is for sale at the stall (${pack}).`
        : `Coins earned! Better bait brings better fish: <b>${b.name}</b> unlocks at <b>Lv ${b.unlockLevel}</b> (${pack}).`;
    }
    case 'bait':
      return 'New bait on your line! Better bait draws bigger fish that sell for more.';
    case 'tier':
      return `A new tier of fish! Keep upgrading your bait and rod to reach rarer ones. Casino Cove opens at <b>Lv ${CASINO_LEVEL}</b>.`;
  }
}

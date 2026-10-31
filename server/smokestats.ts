import { DISHES, STAGES, type DishId } from '../src/data/smokehouse';
import * as smoke from '../src/game/smoke';
import type { SaveData } from '../src/game/state';

/** Play-test counters for the Smokehouse (GAME_DESIGN.md §38.2), kept with the saves so a redeploy doesn't wipe them. */
export interface SmokeCounts {
  /** When counting started. */
  since: number;
  /** Fish by tier (index 0 is tier 1). */
  smoked: number[];
  sold: number[];
  snacks: number[];
  /** Dishes cooked and eaten, by dish. */
  cooked: Partial<Record<DishId, number>>;
  eaten: Partial<Record<DishId, number>>;
}

const tiers = () => [0, 0, 0, 0, 0];
const fresh = (now: number): SmokeCounts => ({ since: now, smoked: tiers(), sold: tiers(), snacks: tiers(), cooked: {}, eaten: {} });

/** Reads saved counts, keeping only well-formed numbers; anything else starts over. */
function clean(raw: unknown, now: number): SmokeCounts {
  const d = (raw ?? {}) as Partial<SmokeCounts>;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  const list = (x: unknown) => tiers().map((_, i) => (Array.isArray(x) ? n(x[i]) : 0));
  const out = fresh(typeof d.since === 'number' && Number.isFinite(d.since) ? d.since : now);
  out.smoked = list(d.smoked);
  out.sold = list(d.sold);
  out.snacks = list(d.snacks);
  for (const dish of DISHES) {
    if (n(d.cooked?.[dish.id])) out.cooked[dish.id] = n(d.cooked?.[dish.id]);
    if (n(d.eaten?.[dish.id])) out.eaten[dish.id] = n(d.eaten?.[dish.id]);
  }
  return out;
}

export class SmokeStats {
  data: SmokeCounts;

  constructor(raw: unknown, now: number = Date.now()) {
    this.data = clean(raw, now);
  }

  /** Counts `n` fish of a tier smoked, sold or eaten as snacks. */
  fish(kind: 'smoked' | 'sold' | 'snacks', tier: number, n = 1): void {
    if (tier >= 1 && tier <= 5) this.data[kind][tier - 1] += n;
  }

  cooked(id: DishId): void {
    this.data.cooked[id] = (this.data.cooked[id] ?? 0) + 1;
  }

  eaten(id: DishId): void {
    this.data.eaten[id] = (this.data.eaten[id] ?? 0) + 1;
  }

  /** The `/smokestats` report: everything by stage, then how many players online have a buff running. */
  report(online: SaveData[], now: number = Date.now()): string[] {
    const d = this.data;
    const days = Math.max(0, (now - d.since) / 86_400_000);
    const byTier = (list: number[], ts: number[]) => ts.map((t) => list[t - 1]).join('/');
    const lines = [`🔥 Smokehouse since ${new Date(d.since).toISOString().slice(0, 10)} (${days < 1 ? 'under a day' : `${Math.floor(days)} day${days >= 2 ? 's' : ''}`}):`];
    for (const st of STAGES) {
      const ts = st.tiers;
      const label = `T${ts.join('/T')}`;
      const parts = [`smoked ${byTier(d.smoked, ts)}`];
      if (ts[0] <= 2) parts.push(`sold ${byTier(d.sold, ts)}`);
      if (ts[0] <= 3) parts.push(`snacks ${byTier(d.snacks, ts)}`);
      // A dish belongs to the stage of its highest tier.
      for (const dish of DISHES.filter((x) => st.tiers.includes(smoke.topTier(x)))) {
        parts.push(`${dish.name} ${d.cooked[dish.id] ?? 0} cooked, ${d.eaten[dish.id] ?? 0} eaten`);
      }
      lines.push(`${st.icon} ${st.name} (${label}): ${parts.join(' · ')}`);
    }
    const snack = online.filter((s) => smoke.snack(s)).length;
    const dish = online.filter((s) => smoke.dish(s)).length;
    const any = online.filter((s) => smoke.snack(s) || smoke.dish(s)).length;
    lines.push(`Online now: ${any} of ${online.length} with a buff (${snack} snack, ${dish} dish)`);
    return lines;
  }
}

/**
 * Play-test counters for the Shiny Lure's pace (PLAYTEST.md, "The plan agreed"): what a player earns an hour at the
 * lake, what they spend on lures and where, and what the lures do at sea. They are kept per account, with the
 * accounts (outside the save, so a reset keeps them), so a redeploy doesn't wipe them. Counting starts when this
 * shipped: an older account starts at zero.
 */
export interface LakeCounts {
  /** Seconds online at the lake side (connected, not on a charter) and on charters. */
  lakeSec: number;
  seaSec: number;
  /** Chips from fish turned in at the Prize Counter, one at a time or with "Turn in all". */
  chips: number;
  /** Shiny Lure casts bought (charges: a bulk buy counts all its casts). */
  bought: number;
  /** Shiny Lure casts spent at the lake and at sea. */
  lakeLures: number;
  seaLures: number;
  /** Sea casts that hooked a fish, and the Black Pearls they landed. */
  seaHooks: number;
  pearls: number;
}

const KEYS: (keyof LakeCounts)[] = ['lakeSec', 'seaSec', 'chips', 'bought', 'lakeLures', 'seaLures', 'seaHooks', 'pearls'];

export const freshLake = (): LakeCounts => ({ lakeSec: 0, seaSec: 0, chips: 0, bought: 0, lakeLures: 0, seaLures: 0, seaHooks: 0, pearls: 0 });

/** Reads saved counts, keeping only well-formed numbers; anything else (or an account from before the counters) is zero. */
export function cleanLake(raw: unknown): LakeCounts {
  const d = (raw ?? {}) as Partial<Record<keyof LakeCounts, unknown>>;
  const out = freshLake();
  for (const k of KEYS) {
    const v = d[k];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
  }
  return out;
}

/** The counters of an account, started at zero if it has none yet. */
export const lakeOf = (a: { lake?: LakeCounts }): LakeCounts => (a.lake ??= freshLake());

const round1 = (n: number) => Math.round(n * 10) / 10;
const hours = (sec: number) => round1(sec / 3600);
/** A rate, or "-" when there is nothing to divide by. */
const rate = (n: number, per: number, unit = 1) => (per > 0 ? String(Math.round((n / per) * unit)) : '-');

/** One report line: `name: ...` for a player, or the totals. */
function line(name: string, c: LakeCounts): string {
  return [
    `${name}: lake ${hours(c.lakeSec)}h · ${Math.round(c.chips)} chips (${rate(c.chips, c.lakeSec, 3600)}/h)`,
    `lures ${c.bought} bought, ${c.lakeLures} lake, ${c.seaLures} sea`,
    `sea ${hours(c.seaSec)}h · ${rate(c.seaLures, c.seaHooks, 100)}% lured · ${rate(c.pearls, c.seaSec, 3600)} pearls/h`,
  ].join(' · ');
}

/** The `/lakestats` report: a line for each player who turned in a fish, bought a lure or went on a charter, and the totals. */
export function lakeReport(rows: { name: string; lake?: LakeCounts }[]): string[] {
  const shown = rows
    .map((r) => ({ name: r.name, c: cleanLake(r.lake) }))
    .filter(({ c }) => c.chips > 0 || c.bought > 0 || c.seaSec > 0 || c.seaHooks > 0)
    .sort((a, b) => b.c.lakeSec - a.c.lakeSec || a.name.localeCompare(b.name));
  if (!shown.length) return ['No lake stats yet: nobody has turned in a fish, bought a lure or gone on a charter.'];
  const total = freshLake();
  for (const { c } of shown) for (const k of KEYS) total[k] += c[k];
  return ['🎣 Lake stats (counted since they shipped):', ...shown.map(({ name, c }) => line(name, c)), line(`All ${shown.length}`, total)];
}

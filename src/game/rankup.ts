import { cosById } from '../data/cosmetics';
import type { Rank } from '../data/ranks';

export interface RankUp {
  /** The big gold banner: "⚓ BOSUN ⚓". */
  title: string;
  /** The line under it. */
  line: string;
  /** The highest rank's title id, for [Wear title]. */
  titleId: string;
  /** The outfit for [Wear it]: the last one the ranks gave, if any. */
  outfit?: string;
}

/** The rank-up banner and catch-card buttons for the ranks one catch reached (several only after a back-pay-sized jump). */
export function rankUp(ranks: Rank[]): RankUp | null {
  const top = ranks.at(-1);
  if (!top) return null;
  const outfits = ranks.flatMap((r) => (r.outfit ? [r.outfit] : []));
  const names = outfits.map((id) => cosById(id)?.name ?? id);
  const titles = ranks.map((r) => r.title);
  const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0]);
  const line = names.length
    ? `Level ${top.level} · ${list(names)} added to your Wardrobe`
    : `Level ${top.level} · new title${titles.length > 1 ? 's' : ''}: ${list(titles)}`;
  return { title: `⚓ ${top.title.toUpperCase()} ⚓`, line, titleId: top.id, outfit: outfits.at(-1) };
}

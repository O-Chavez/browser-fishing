import { cosById, legendPieces } from '../data/cosmetics';
import { FISH } from '../data/content';
import type { Rank } from '../data/ranks';
import { ZONES } from '../data/dive';
import type { LegendPiece, ZonePiece } from './economy';

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

/** Each legend's mark on its pieces' banners; a legend without one gets a plain star. */
export const LEGEND_MARK: Record<string, string> = { kraken: '🦑', leviathan: '🐉', dreamer: '💤' };

export interface LegendUp {
  /** The big teal banner: "🦑 KRAKEN CROWN 🦑". */
  title: string;
  /** The line under it: "Unlocked at Captain Reed's · piece 1 of 3". */
  line: string;
  /** The catch card's line, with the piece's mark: "🦑 Kraken Crown · unlocked at Reed's". */
  card: string;
}

/** The banner and catch-card line for a piece of a legend's set that a landing unlocked (bought at Captain Reed's). */
export function legendUp(p: LegendPiece): LegendUp | null {
  const c = cosById(p.id);
  const fish = FISH.find((f) => f.id === c?.legend);
  if (!c || !fish) return null;
  const mark = LEGEND_MARK[fish.id] ?? '✦';
  return {
    title: `${mark} ${c.name.toUpperCase()} ${mark}`,
    line: c.slot === 'pet' ? `${fish.name}'s pet · unlocked at Captain Reed's` : `Unlocked at Captain Reed's · piece ${p.landing} of ${p.of}`,
    card: `${mark} ${c.name} · unlocked at Reed's`,
  };
}

/** Each sea zone's mark on its set's heading at Reed's and its unlock line (by zone id); a zone without one gets a plain star. */
export const ZONE_MARK: Record<string, string> = { kelp: '🌿', twilight: '🪼' };

/**
 * The one line for a piece of a zone's set that a landing unlocked: "🌿 Kelp Cap unlocked at Captain Reed's · 30 fish
 * landed in Kelp Deep". Only the player sees it (on the catch card), like a legend's piece.
 */
export function zoneUp(p: ZonePiece): string | null {
  const c = cosById(p.id);
  const zone = ZONES[p.zone];
  if (!c || c.zone !== p.zone || !zone) return null;
  return `${ZONE_MARK[zone.id] ?? '✦'} ${c.name} unlocked at Captain Reed's · ${p.fish.toLocaleString('en-US')} fish landed in ${zone.name.replace(/^The /, 'the ')}`;
}

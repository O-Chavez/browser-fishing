/** How a chat bubble lays out its text and how long it stays. No canvas here: the caller passes the text measure. */

/** A bubble stays this long, plus a little for each character past the first `BUBBLE_QUICK_CHARS`, so a long line can be read. */
export const BUBBLE_MS = 6000;
export const BUBBLE_QUICK_CHARS = 40;
export const BUBBLE_MS_PER_CHAR = 50;

export type Measure = (text: string) => number;

export function bubbleMs(text: string): number {
  return BUBBLE_MS + Math.max(0, [...text].length - BUBBLE_QUICK_CHARS) * BUBBLE_MS_PER_CHAR;
}

/** Splits into the pieces a line may be cut between, keeping an emoji and its skin tone or a flag's two letters together. */
function glyphs(word: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(word), (s) => s.segment);
  }
  return [...word];
}

/** Fills each line with as many words as fit in `max`; a word wider than a line is cut where the line ends. */
function fill(words: string[], max: number, measure: Measure): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const joined = line ? `${line} ${word}` : word;
    if (measure(joined) <= max) {
      line = joined;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const g of glyphs(word)) {
      if (line && measure(line + g) > max) {
        lines.push(line);
        line = g;
      } else line += g;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The whole message as lines no wider than `max` (in the units `measure` returns). Once the number of lines is known
 * they're evened out, so a bubble doesn't end on one stray word under a full line.
 */
export function wrapBubble(text: string, max: number, measure: Measure): string[] {
  const words = text.split(' ').filter(Boolean);
  const lines = fill(words, max, measure);
  if (lines.length < 2) return lines;
  // The narrowest width that still takes this many lines.
  let lo = 0;
  let hi = max;
  let best = lines;
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2;
    const tried = fill(words, mid, measure);
    if (tried.length <= lines.length) {
      hi = mid;
      best = tried;
    } else lo = mid;
  }
  return best;
}

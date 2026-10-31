/** Short coin amounts for tight spots like the hotbar: 950, 1.2k, 12k, 1.2M. */
export function shortCoins(n: number): string {
  const f = (v: number, unit: string) => `${v >= 10 ? Math.floor(v) : Math.floor(v * 10) / 10}${unit}`;
  // Round first, so 999.6 becomes "1k" rather than a four-digit "1000".
  const r = Math.round(n);
  return r < 1000 ? String(r) : r < 1e6 ? f(r / 1e3, 'k') : f(r / 1e6, 'M');
}

export const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The HUD's gold coin, sized to sit on a line of text. Prices use it instead of the 🪙 emoji, which looks different on every platform. */
export const COIN = '<span class="coin t"></span>';

/** HTML with every 🪙 swapped for the gold coin: for text that also travels as plain text (server notices, casino results). */
export const withCoins = (html: string): string => html.replaceAll('🪙', COIN);

/** Plain text (a toast, a chat line) as HTML, with the gold coin in place of 🪙. */
export const coinText = (text: string): string => withCoins(escapeHtml(text));

/** A countdown as m:ss, rounded up so it never shows 0:00 early. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

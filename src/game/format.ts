/** Short coin amounts for tight spots like the hotbar: 950, 1.2k, 12k, 1.2M. */
export function shortCoins(n: number): string {
  const f = (v: number, unit: string) => `${v >= 10 ? Math.floor(v) : Math.floor(v * 10) / 10}${unit}`;
  // Round first, so 999.6 becomes "1k" rather than a four-digit "1000".
  const r = Math.round(n);
  return r < 1000 ? String(r) : r < 1e6 ? f(r / 1e3, 'k') : f(r / 1e6, 'M');
}

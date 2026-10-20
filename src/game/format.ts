/** Short coin amounts for tight spots like the hotbar: 950, 1.2k, 12k, 1.2M. */
export function shortCoins(n: number): string {
  const f = (v: number, unit: string) => `${v >= 10 ? Math.floor(v) : Math.floor(v * 10) / 10}${unit}`;
  return n < 1000 ? String(Math.round(n)) : n < 1e6 ? f(n / 1e3, 'k') : f(n / 1e6, 'M');
}

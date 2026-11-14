// Scratch: the blackjack table's edge and what a double down turns coins into. Kept from the charter boost workshop (2026-11-13) as a scratch file: not type-checked, tested or maintained. Run with npx tsx from the repository root.
import { actBlackjack, blackjackFactor, dealBlackjack, handTotal, type Blackjack, type Card } from '../../../src/game/casino';
import { mulberry } from '../../../src/game/env';
const rng = mulberry(42);
const soft = (cards: Card[]) => { let t = 0, a = 0; for (const c of cards) { if (c.r === 1) { a++; t += 11; } else t += Math.min(10, c.r); } while (t > 21 && a > 0) { t -= 10; a--; } return a > 0; };
const up = (g: Blackjack) => (g.dealer[0].r === 1 ? 11 : Math.min(10, g.dealer[0].r));
function basic(g: Blackjack): 'hit' | 'stand' | 'double' {
  const t = handTotal(g.player), d = up(g), two = g.player.length === 2;
  if (soft(g.player)) {
    if (t >= 19) return 'stand';
    if (t === 18) return two && d >= 3 && d <= 6 ? 'double' : d <= 8 ? 'stand' : 'hit';
    return two && d >= 4 && d <= 6 ? 'double' : 'hit';
  }
  if (t >= 17) return 'stand';
  if (t >= 13) return d <= 6 ? 'stand' : 'hit';
  if (t === 12) return d >= 4 && d <= 6 ? 'stand' : 'hit';
  if (t === 11) return two ? 'double' : 'hit';
  if (t === 10) return two && d <= 9 ? 'double' : 'hit';
  if (t === 9) return two && d >= 2 && d <= 6 ? 'double' : 'hit';
  return 'hit';
}
function run(policy: (g: Blackjack) => 'hit' | 'stand' | 'double', n = 400_000) {
  let fish = 0, stake = 0, refund = 0, doubles = 0, lost = 0;
  for (let i = 0; i < n; i++) {
    const g = dealBlackjack(2, rng);
    while (!g.done) {
      const a = policy(g);
      if (a === 'double') { doubles++; stake += 1; g.stake = 1; }
      actBlackjack(g, a);
    }
    const f = blackjackFactor(g);
    fish += f; if (f === 0) lost++;
    if (g.result === 'push') refund += g.stake;
  }
  return { fishOut: fish / n, coinsIn: (stake - refund) / n, doubles: doubles / n, lost: lost / n, ev: (fish - n - (stake - refund)) / n };
}
const show = (name: string, r: ReturnType<typeof run>) => console.log(`${name.padEnd(34)} fish out x${r.fishOut.toFixed(3)} per hand | coins staked ${r.coinsIn.toFixed(3)} V | doubles ${(r.doubles * 100).toFixed(1)}% | fish lost ${(r.lost * 100).toFixed(1)}% | EV per hand ${(r.ev * 100).toFixed(2)}% of the fish`);
show('basic strategy', run(basic));
show('basic, never double', run((g) => { const a = basic(g); return a === 'double' ? (handTotal(g.player) >= 18 ? 'stand' : 'hit') : a; }));
const always = run((g) => (g.player.length === 2 ? 'double' : basic(g)));
show('always double', always);
const nd = run((g) => { const a = basic(g); return a === 'double' ? (handTotal(g.player) >= 18 ? 'stand' : 'hit') : a; });
const b = run(basic);
console.log(`coins -> fish value: basic doubles turn 1 coin into ${((b.fishOut - nd.fishOut) / b.coinsIn).toFixed(2)} coins of fish; always-double ${((always.fishOut - nd.fishOut) / always.coinsIn).toFixed(2)}`);
// wheel
console.log('wheel EV', [0, 0.5, 0, 2, 0, 2, 0, 0.5, 0, 2, 0, 5].reduce((a, x) => a + x, 0) / 12);

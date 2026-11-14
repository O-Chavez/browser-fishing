// Scratch: idea 2, the best fish of a hold in chips, plain and lured. Kept from the charter boost workshop (2026-11-13) as a scratch file: not type-checked, tested or maintained. Run with npx tsx from the repository root.
import { rollSeaFish, markerGrowth } from '../../../src/game/dive';
import { mulberry } from '../../../src/game/env';
import { rollSize, sellValue, rollTag } from '../../../src/game/progression';
const HOLD = Number(process.argv[2] ?? 30), T = 4000, CHARM = 1.15;
const rng = mulberry(9);
for (let z = 0; z < 5; z++) for (const lured of [false, true]) {
  let sum = 0;
  for (let t = 0; t < T; t++) {
    let best = 0;
    for (let i = 0; i < HOLD; i++) {
      const b = rollSeaFish(z, rng); const size = rollSize(b.fish, rng);
      const shiny = lured || rng() < 0.05; const tag = rollTag(rng);
      const marker = z === 4 ? 1 + Math.floor(i / 3) : 0;
      const v = sellValue(b.fish, size, shiny) * 1.1 * (tag ? 1.15 : 1) * CHARM * markerGrowth(z, marker);
      if (v > best) best = v;
    }
    sum += best;
  }
  console.log(`zone ${z} ${lured ? 'lured' : 'plain'} hold ${HOLD}: pick worth ${(sum / T / 1000).toFixed(0)} chips; a lured hold needs ${HOLD * 5} chips`);
}

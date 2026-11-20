// Renders the six Shelf-to-Twilight legends' portraits (`src/game/seafish/legends/`): side, hero, hang and shadow for
// each, under brighter studio light than the sea's. The Abyss's three are `giant-portraits.ts`.
// Usage: npx tsx scripts/legend-portraits.ts <outdir> [id,id...] [view,view...]
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.PORT ?? 5342);
const OUT = process.argv[2];
if (!OUT) throw new Error('usage: legend-portraits.ts <outdir> [ids] [views]');
const IDS = (process.argv[3] && process.argv[3] !== 'all' ? process.argv[3] : 'grouper,marlin,kelpbeard,kelpwyrm,oarfish,chandelier').split(',');
const VIEWS = (process.argv[4] ?? 'side,hero,hang,shadow').split(',');
const SIZE: Record<string, [number, number]> = { side: [1600, 900], hero: [1600, 900], hang: [1000, 1300], shadow: [1600, 900], anim: [1600, 900], shiny: [1600, 900] };
fs.mkdirSync(OUT, { recursive: true });
const vite = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, timeout: 180000, protocolTimeout: 600000, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 1600, height: 1300 } });
try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => console.error('pageerror', e.message));
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') console.error('console', m.text()); });
  await p.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 1500));
  const stats: Record<string, { calls: number; triangles: number }> = {};
  for (const id of IDS) {
    for (const view of VIEWS) {
      const [W, H] = SIZE[view];
      const s = (await p.evaluate(async (id, view, W, H) => {
        const g: any = await import('/scripts/legend-portraits-page.ts' as string);
        // 'anim' is the side view posed mid-swim, to check the moving parts.
        return view === 'anim' ? g.renderPortrait(id, 'side', W, H, 1.3) : g.renderPortrait(id, view, W, H);
      }, id, view, W, H)) as { calls: number; triangles: number };
      await new Promise((r) => setTimeout(r, 150));
      await p.screenshot({ path: path.join(OUT, `${id}-${view}.jpg`), type: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: W, height: H } });
      if (view === 'side') stats[id] = s;
      if (view === 'shadow') console.log(`${id} shadow: ${s.calls} draw calls, ${s.triangles} triangles`);
    }
    if (stats[id]) console.log(`${id}: ${stats[id].calls} draw calls, ${stats[id].triangles} triangles`);
  }
  if (Object.keys(stats).length === 6) fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify(stats, null, 2));
} finally {
  await browser.close();
  await vite.close();
  process.exit(0);
}

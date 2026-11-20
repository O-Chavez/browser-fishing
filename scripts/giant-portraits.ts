// Renders the Abyss's three legends' portraits (`src/game/seafish/giants/`). Usage: npx tsx scripts/giant-portraits.ts <outdir> [ids] [views]
//   ids: comma list of leviathan,dreamer,kraken (default all); views: comma list of side,hero,above,head,shadow,shiny,back
//   (default side,hero,above,head,shadow). Prints each model's draw calls and triangles.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.PORT) || 5352;
const OUT = process.argv[2];
if (!OUT) throw new Error('usage: abyss-portraits.ts <outdir> [ids] [views]');
const IDS = (process.argv[3] || 'leviathan,dreamer,kraken').split(',');
const VIEWS = (process.argv[4] || 'side,hero,above,head,shadow').split(',');
fs.mkdirSync(OUT, { recursive: true });
const vite = await createServer({ server: { port: PORT, strictPort: true, hmr: false }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 1600, height: 900 } });
try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => console.error('page error:', e.message));
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') console.error('console:', m.text()); });
  await p.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  console.log('page loaded');
  await new Promise((r) => setTimeout(r, 1500));
  await p.evaluate(async () => {
    const g: any = await import('/scripts/giant-portraits-page.ts' as string);
    (window as any).__portraits = g;
    g.setup();
  });
  console.log('renderer ready');
  for (const id of IDS) {
    for (const view of VIEWS) {
      const stats = await p.evaluate((id, view) => (window as any).__portraits.shoot(id, view), id, view);
      await new Promise((r) => setTimeout(r, 150));
      await p.screenshot({ path: path.join(OUT, `${id}-${view}.jpg`), type: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: 1600, height: 900 } });
      console.log(`${id}-${view}.jpg  draw calls ${stats.calls}  triangles ${stats.triangles}`);
    }
  }
} catch (e) {
  console.error('FAILED:', e);
  process.exitCode = 1;
} finally {
  await browser.close();
  await vite.close();
  process.exit(process.exitCode ?? 0);
}

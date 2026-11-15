// Staging views of Marlow's BAIT & TACKLE shack (baitshop.ts) from the spots players see it: from the deck, a
// three-quarter view, at the counter, from the main street and from the pier root, by day, dusk and night.
// Desktop only.
//
//   npx tsx scripts/shopviews.ts <out dir> [view ...]
//
// Runs the game offline (no server), so nothing is saved.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';
import { createServer } from 'vite';
import { TIP_IDS } from '../src/game/tips';
import { newSave } from '../src/game/state';
import { MAPS } from '../src/data/maps';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = Number(process.env.MAP_PORT ?? 5299);
const [outArg, ...only] = process.argv.slice(2);
if (!outArg) {
  console.error('usage: npx tsx scripts/shopviews.ts <out dir> [view ...]');
  process.exit(2);
}
const OUT = path.resolve(outArg);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const { shop: S } = MAPS[0].vendor;
const fwd = { x: Math.sin(S.facing), z: Math.cos(S.facing) };
const right = { x: Math.cos(S.facing), z: -Math.sin(S.facing) };
/** A spot `f` m in front of the counter and `r` m to its right (as you face it, `r` > 0 is the stall's left). */
const off = (f: number, r: number) => ({ x: S.x + fwd.x * f - right.x * r, z: S.z + fwd.z * f - right.z * r });
const yawTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z));
interface View { x: number; z: number; yaw: number; pitch: number; times: Record<string, number> }
const view = (f: number, r: number, pitch: number, times: Record<string, number>, lookF = -0.4, lookR = 0): View => {
  const p = off(f, r);
  const t = off(lookF, lookR);
  return { ...p, yaw: yawTo(p.x, p.z, t.x, t.z), pitch, times };
};
const DAY = { day: 0.3 };
const VIEWS: Record<string, View> = {
  hero: view(7.5, 0.6, 0.06, { day: 0.3, night: 0.72 }),
  quarter: view(5, -3.6, 0.04, DAY),
  counter: view(2.6, 0.3, 0.1, DAY),
  street: view(3.4, 4.6, 0.04, DAY),
  // From the pier root, the way most players first see it.
  pier: { x: 0, z: 10.5, yaw: yawTo(0, 10.5, S.x, S.z), pitch: 0.02, times: { day: 0.3, dusk: 0.53 } },
  counternight: view(2.6, 0.3, 0.1, { night: 0.72 }),
};

const vite = await createServer({ server: { port: VITE_PORT, strictPort: true }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});

async function open(): Promise<Page> {
  const page = await (await browser.createBrowserContext()).newPage();
  page.on('pageerror', (e) => console.error(`page error: ${e.message}`));
  await page.setViewport({ width: 1280, height: 720 });
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await page.evaluateOnNewDocument(() => localStorage.setItem('fishing-news', String(Number.MAX_SAFE_INTEGER)));
  await page.evaluateOnNewDocument((save) => localStorage.setItem('fishing-game-save', save), JSON.stringify({ ...newSave(), tips: [...TIP_IDS], held: 4 }));
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game);
  await page.click('#join-offline');
  await page.waitForFunction(() => document.getElementById('join')?.classList.contains('hidden'), { timeout: 20000 });
  await page.evaluate(() => window.__game.activate());
  await page.addStyleTag({ content: '#hud, #crosshair, #toast, #banner, #tip, #guide, #touch, #chat, #fps, .prompt, #prompt { display: none !important; }' });
  return page;
}
const game = (p: Page, js: string) => p.evaluate(`(() => { const G = window.__game; ${js} })()`);

let failed = false;
try {
  const page = await open();
  await sleep(1500);
  for (const [name, v] of Object.entries(VIEWS).filter(([k]) => !only.length || only.includes(k))) {
    for (const [time, f] of Object.entries(v.times)) {
      await game(page, `G.teleport(${v.x}, ${v.z}); G.look(${v.yaw}, ${v.pitch}); G.day(${f});`);
      await sleep(1100);
      const file = `${name}-${time}.jpg`;
      await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 84 });
      console.log(`wrote ${file}`);
    }
  }
} catch (e) {
  console.error(e);
  failed = true;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(failed ? 1 : 0);

declare global {
  interface Window {
    __game: any;
  }
}

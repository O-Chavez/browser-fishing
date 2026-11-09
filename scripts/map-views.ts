// Hero views of the lakeside map, staged headlessly for the map rework (docs/map-rework/harbour.md):
// each view at a desktop and a phone-sized viewport, by day and at dusk (the night view at night).
//
//   npx tsx scripts/map-views.ts <out dir> [view ...]
//
// Runs the game offline (no server), so nothing is saved. The view names are the keys of VIEWS.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';
import { createServer } from 'vite';
import { TIP_IDS } from '../src/game/tips';
import { newSave } from '../src/game/state';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = 5298;
const [outArg, ...only] = process.argv.slice(2);
if (!outArg) {
  console.error('usage: npx tsx scripts/map-views.ts <out dir> [view ...]');
  process.exit(2);
}
const OUT = path.resolve(outArg);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Camera yaw 0 looks along -z (out to the lake), π toward the gate; positive turns toward -x. */
interface View { x: number; z: number; yaw: number; pitch?: number; note: string; times?: Record<string, number> }
const DAY = { day: 0.3, dusk: 0.53 };
export const VIEWS: Record<string, View> = {
  tend: { x: 0, z: -7.5, yaw: 0.3, note: 'T end looking out: open lake, mountains, the islet left of centre' },
  spawn: { x: 0, z: 1, yaw: Math.PI, note: 'spawn turned round: lanterns, boards at the root, stalls, harbour front, gate on the axis' },
  westjetty: { x: -7.5, z: 4.5, yaw: 0, note: 'west jetty: the rowboat alongside, Reed\'s beach, the Furthest Out board and the seaplane to the left' },
  quaywest: { x: -12, z: 13, yaw: -0.5, note: 'quay west end: down Reed\'s lane past the worm patch to the board, the sign and the plane' },
  westlane: { x: -16.5, z: 22, yaw: 0.6, note: 'west lane behind the Fishmonger looking down to the worm patch and the quay' },
  // The three views below are the plan's views turned to what their notes name: in the game's yaw, positive turns
  // toward -x, so the plan's yaws for the quay's west end and the west lane looked east, not down Reed's lane.
  westjetty2: { x: -7.5, z: 4.5, yaw: 0.55, note: 'west jetty turned left: the cove\'s west side, Reed\'s beach and where the seaplane will float' },
  quaylane: { x: -12, z: 13, yaw: 0.9, note: 'quay west end down Reed\'s lane: the worm patch, the board, the sign and the plane (all still in their old spots)' },
  westlane2: { x: -16.5, z: 22, yaw: -0.1, note: 'west lane looking down to the worm patch and the quay\'s west end' },
  bench: { x: 7.5, z: 6, yaw: -1.34, note: 'jetty bench across the water to the campfire headland at dusk' },
  night: { x: 0, z: -7.5, yaw: Math.PI, note: 'T end at night: pier, three reflections, string lights, gate glow', times: { night: 0.72 } },
};
const unknown = only.filter((v) => !VIEWS[v]);
if (unknown.length) {
  console.error(`Unknown view(s): ${unknown.join(', ')}. Choose from: ${Object.keys(VIEWS).join(', ')}`);
  process.exit(2);
}
const views = Object.entries(VIEWS).filter(([k]) => !only.length || only.includes(k));

const vite = await createServer({ server: { port: VITE_PORT, strictPort: true }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});

/** Opens the game offline at a viewport: the README's desktop size, or a phone in landscape (touch mode, 2x pixels). */
async function open(phone: boolean): Promise<Page> {
  const page = await (await browser.createBrowserContext()).newPage();
  page.on('pageerror', (e) => console.error(`page error: ${e.message}`));
  if (phone) await page.setViewport({ width: 915, height: 412, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1280, height: 720 });
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await page.evaluateOnNewDocument(() => localStorage.setItem('fishing-news', String(Number.MAX_SAFE_INTEGER)));
  // Every tip seen, so no tip box covers the shot; hand on an empty slot, so no rod in view.
  await page.evaluateOnNewDocument((save) => localStorage.setItem('fishing-game-save', save), JSON.stringify({ ...newSave(), tips: [...TIP_IDS], held: 4 }));
  await page.goto(`http://localhost:${VITE_PORT}/${phone ? '?touch' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game);
  await page.click('#join-offline');
  await page.waitForFunction(() => document.getElementById('join')?.classList.contains('hidden'), { timeout: 20000 });
  await page.evaluate(() => window.__game.activate());
  await page.addStyleTag({ content: '#hud, #crosshair, #toast, #banner, #tip, #guide, #touch, #chat, #fps { display: none !important; }' });
  return page;
}
const game = (p: Page, js: string) => p.evaluate(`(() => { const G = window.__game; ${js} })()`);

let failed = false;
try {
  for (const phone of [false, true]) {
    const page = await open(phone);
    await sleep(1500);
    for (const [name, v] of views) {
      for (const [time, f] of Object.entries(v.times ?? DAY)) {
        await game(page, `G.teleport(${v.x}, ${v.z}); G.look(${v.yaw}, ${v.pitch ?? -0.03}); G.day(${f});`);
        await sleep(1200);
        const file = `${name}-${phone ? 'phone' : 'desktop'}-${time}.jpg`;
        await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 82 });
        console.log(`wrote ${path.relative(process.cwd(), path.join(OUT, file))}`);
      }
    }
    await page.browserContext().close();
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

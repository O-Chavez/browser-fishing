// README screenshots: stages scenes in headless Chrome and writes them to docs/images/.
//
//   npm run screenshots              # every shot
//   npm run screenshots -- dock reel # only these (dock, night, reel, fish, outfits, wardrobe, casino)
//
// `casino` re-shoots src/assets/images/casino-preview.jpg, the look inside shown by the poster at the
// pond's casino gate (and in the README).
//
// Starts its own game server on a throwaway data folder with seeded, dressed-up accounts, so your
// saves are never touched. Re-run after visual changes and check the images before committing.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';
import { createServer } from 'vite';
import { COSMETICS } from '../src/data/cosmetics';
import { TIP_IDS } from '../src/game/tips';
import { newSave } from '../src/game/state';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = 5299;
const SERVER_PORT = 8799;
const OUT = path.resolve('docs/images');
const SHOTS = ['dock', 'night', 'reel', 'fish', 'outfits', 'wardrobe', 'casino'];
const only = process.argv.slice(2);
const unknown = only.filter((s) => !SHOTS.includes(s));
if (unknown.length) {
  console.error(`Unknown shot(s): ${unknown.join(', ')}. Choose from: ${SHOTS.join(', ')}`);
  process.exit(2);
}
const want = (name: string) => !only.length || only.includes(name);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

// ---------- server with seeded accounts ----------

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fishing-shots-'));
const token = (name: string) => `${name}-token-0123456789abcdef`;
const account = (name: string, look: object, extra: object = {}) => ({
  name,
  hash: createHash('sha256').update(token(name)).digest('hex'),
  save: {
    ...newSave(),
    level: 22,
    coins: 50000,
    // All tips seen, so no tip box covers the shot; hand on an empty slot, so no rod in view.
    tips: [...TIP_IDS],
    held: 4,
    owned: Object.values(look).filter((v) => typeof v === 'string'),
    look: { ...newSave().look, ...look },
    ...extra,
  },
});
const accounts = {
  maya: account('Maya', { color: 0xe86a5a, face: 'grin', hat: 'straw', shirt: 'striped', jewelry: 'shell' }),
  theo: account('Theo', { color: 0x4a8fd6, face: 'joy', hat: 'captain', shirt: 'vest', jewelry: null }),
  cam: account('Cam', { color: 0x7ac76a, face: 'smile' }),
  reeler: account('Reeler', {}, { held: 0, rod: 'aurora', bait: 'pearl', slots: [{ k: 'rod', id: 'aurora' }, { k: 'bait', id: 'pearl', n: 20 }, null, null, null] }),
  fishcam: account('Fishcam', {}),
  vegas: account('Vegas', {}, { location: 'casino' }),
  ivy: account('Ivy', { color: 0xf2c14e, face: 'wink', hat: 'crown', shirt: 'cloak', jewelry: 'diamond' }, { owned: COSMETICS.map((c) => c.id) }),
  // The outfits line-up, left to right as the camera sees them (Ivy stands in the middle).
  dee: account('Dee', { color: 0x38b6a8, face: 'toothy', hat: 'visor', shirt: 'dealer', jewelry: 'dice' }),
  juno: account('Juno', { color: 0x7bc86c, face: 'smile', hat: 'horned', shirt: 'vest', jewelry: 'pearl' }),
  rex: account('Rex', { color: 0x8e6bd8, face: 'grin', hat: 'tophat', shirt: 'tux', jewelry: 'jackpot' }),
  nell: account('Nell', { color: 0x4a90e2, face: 'joy', hat: 'captain', shirt: 'coat', jewelry: 'amulet' }),
  kai: account('Kai', { color: 0xe8704a, face: 'cat', hat: 'straw', shirt: 'hawaiian', jewelry: 'shell' }),
  pip: account('Pip', { color: 0xe06aa8, face: 'tongue', hat: 'bucket', shirt: 'striped', jewelry: 'chain' }),
};
fs.writeFileSync(path.join(dataDir, 'accounts.json'), JSON.stringify(accounts));

const server = spawn('npx', ['tsx', 'server/index.ts'], {
  env: { ...process.env, DATA_DIR: dataDir, PORT: String(SERVER_PORT), DATABASE_URL: '' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise<void>((res) => server.stdout!.on('data', (d) => /fishing server on port/.test(String(d)) && res()));
process.env.VITE_SERVER_URL = `ws://localhost:${SERVER_PORT}`;
const vite = await createServer({ server: { port: VITE_PORT, strictPort: true }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  defaultViewport: { width: 1600, height: 900 },
});

async function join(name: string, room: string): Promise<Page> {
  const page = await (await browser.createBrowserContext()).newPage();
  page.on('pageerror', (e) => console.error(`${name}: ${e.message}`));
  // tsx keeps function names by wrapping them in __name(); functions sent to the page need it too.
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await page.evaluateOnNewDocument((t) => localStorage.setItem('fishing-token', t), token(name));
  await page.goto(`http://localhost:${VITE_PORT}/?name=${name}&room=${room}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game?.online(), { timeout: 20000 });
  await page.evaluate(() => window.__game.activate());
  return page;
}
/** Closes a scene's pages so they stop rendering and don't slow the next scene down. */
const leave = (...pages: Page[]) => Promise.all(pages.map((p) => p.browserContext().close()));
/** Runs a snippet in the page with `G` bound to the game's debug API. */
const game = (p: Page, js: string) => p.evaluate(`(() => { const G = window.__game; ${js} })()`);
const hideHud = (p: Page) => p.addStyleTag({ content: '#hud, #crosshair, #toast, #banner, #tip, #guide { display: none !important; }' });
const shoot = async (p: Page, name: string, clip?: { x: number; y: number; width: number; height: number }) => {
  await p.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 85, clip });
  console.log(`wrote docs/images/${name}.jpg`);
};
/** Camera yaw that looks from (x, z) toward (tx, tz); yaw 0 looks along -z. */
const yawTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z));

let failed = false;
try {
  // Two friends chatting on the pier head at sunset, seen by a third player.
  if (want('dock') || want('night')) {
    const [maya, theo, cam] = [await join('Maya', 'shots'), await join('Theo', 'shots'), await join('Cam', 'shots')];
    const M = { x: -0.75, z: -5.2 }, T = { x: 0.75, z: -5.2 }, C = { x: 0.3, z: -1.6 };
    // Each faces halfway between the other and the camera, so both faces show.
    await game(maya, `G.teleport(${M.x}, ${M.z}); G.look(${yawTo(M.x, M.z, (T.x + C.x) / 2, (T.z + C.z) / 2)}, 0);`);
    await game(theo, `G.teleport(${T.x}, ${T.z}); G.look(${yawTo(T.x, T.z, (M.x + C.x) / 2, (M.z + C.z) / 2)}, 0);`);
    await game(cam, `G.teleport(${C.x}, ${C.z}); G.look(${yawTo(C.x, C.z, 0, -5.2)}, 0.02); G.day(0.5);`);
    await sleep(1500);
    await maya.keyboard.press('Enter');
    await maya.keyboard.type('the pier at sunset never gets old');
    await maya.keyboard.press('Enter');
    await sleep(1200);
    await hideHud(cam);
    if (want('dock')) await shoot(cam, 'dock');
    if (want('night')) {
      await game(cam, `G.teleport(0, 25.5); G.look(Math.PI, -0.04); G.day(0.72);`);
      await sleep(1500);
      await shoot(cam, 'night');
    }
    await leave(maya, theo, cam);
  }

  // A real cast with top gear, caught mid-fight with the tension ring showing.
  if (want('reel')) {
    const p = await join('Reeler', 'reel');
    await game(p, `G.teleport(0.2, -5.4); G.look(0.15, -0.12); G.day(0.44);`);
    await sleep(800);
    let shot = false;
    for (let attempt = 0; attempt < 6 && !shot; attempt++) {
      await game(p, `G.press();`);
      await sleep(300);
      await game(p, `G.setPower(0.9); G.release();`);
      let phase = '';
      for (let i = 0; i < 120 && phase !== 'bite' && phase !== 'idle'; i++) {
        await sleep(250);
        phase = ((await game(p, `return G.state();`)) as { phase: string }).phase;
      }
      if (phase !== 'bite') continue;
      await game(p, `G.press();`);
      // Reel in pulses, keeping tension mid-range, until the fight is about half done.
      for (let i = 0; i < 400; i++) {
        const st = (await game(p, `return G.state();`)) as { phase: string; tension: number; progress: number };
        if (st.phase !== 'reeling') break;
        await game(p, `G.hold(${st.tension < 0.55});`);
        if (st.progress > 0.45 && st.tension > 0.4 && st.tension < 0.7) {
          await shoot(p, 'reel');
          shot = true;
          break;
        }
        await sleep(60);
      }
    }
    await leave(p);
    if (!shot) throw new Error('reel: never got a mid-fight moment in 6 casts');
  }

  // Every fish by tier, rendered on its own canvas by screenshot-fish.ts.
  if (want('fish')) {
    const p = await join('Fishcam', 'fish');
    await p.setViewport({ width: 1600, height: 1450 });
    await hideHud(p);
    const height = (await p.evaluate(async () => {
      const mod = await import('/scripts/screenshot-fish.ts' as string);
      return mod.renderGrid(1600);
    })) as number;
    await sleep(500);
    await shoot(p, 'fish', { x: 0, y: 0, width: 1600, height });
    await leave(p);
  }

  // Seven players in different outfits on the cross-pier, facing a camera on the main pier. The sun
  // always sits toward -z, so looking +z lights them from the front.
  if (want('outfits')) {
    const names = ['Dee', 'Juno', 'Rex', 'Ivy', 'Nell', 'Kai', 'Pip'];
    const models: Page[] = [];
    for (const n of names) models.push(await join(n, 'outfits'));
    const cam = await join('Cam', 'outfits');
    const C = { x: 0, z: 0.4 };
    for (let i = 0; i < names.length; i++) {
      // Looking +z puts +x on the left of the frame. A shallow arc keeps the ends from looking far away.
      const x = ((names.length - 1) / 2 - i) * 1.2;
      const z = 4.6 - Math.abs(x) * 0.1;
      await game(models[i], `G.teleport(${x}, ${z}); G.look(${yawTo(x, z, C.x, C.z)}, 0);`);
    }
    await game(cam, `G.teleport(${C.x}, ${C.z}); G.look(Math.PI, -0.04); G.day(0.45);`);
    await sleep(2500);
    await hideHud(cam);
    // Cropped above the dock's crate, which sits between the camera and the group.
    await shoot(cam, 'outfits', { x: 0, y: 20, width: 1600, height: 715 });
    await leave(cam, ...models);
  }

  if (want('wardrobe')) {
    const p = await join('Ivy', 'wardrobe');
    await game(p, `G.teleport(0, 24); G.day(0.1); G.openMenu('wardrobe');`);
    await sleep(1500);
    await shoot(p, 'wardrobe');
    await leave(p);
  }
  // The casino floor from just inside the entrance, for the poster at the pond's casino gate.
  if (want('casino')) {
    const p = await join('Vegas', 'casino');
    await p.setViewport({ width: 1200, height: 675 });
    await hideHud(p);
    await game(p, `G.teleport(0, 32.5); G.look(Math.PI, -0.06);`);
    await sleep(1500);
    await p.screenshot({ path: 'src/assets/images/casino-preview.jpg', type: 'jpeg', quality: 85 });
    console.log('wrote src/assets/images/casino-preview.jpg');
    await leave(p);
  }
} catch (e) {
  console.error(e);
  failed = true;
} finally {
  await browser.close();
  await vite.close();
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);

declare global {
  interface Window {
    __game: any;
  }
}

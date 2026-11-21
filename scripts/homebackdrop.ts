// The home screen's backdrop: a still of the lake, staged in headless Chrome and written to
// src/assets/images/home-backdrop.jpg (1920x1080, at most 300 KB).
//
//   npx tsx scripts/homebackdrop.ts                    # the home screen's still (`PICK`)
//   npx tsx scripts/homebackdrop.ts <dir> [shot ...]   # the candidates (dock, morning, vista) as <dir>/<shot>.jpg
//
// Starts its own game server on a throwaway data folder with seeded, dressed-up accounts, so your saves are never
// touched. The card covers the middle of the picture (and nearly all of its height on a phone), so each shot keeps
// its anglers, lanterns and jetties about a fifth of the way in from the left and right edges, and the sun, pines and
// mountains in the upper band. Re-run after visible changes to the pond and look at the picture before committing.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';
import { createServer } from 'vite';
import { TIP_IDS } from '../src/game/tips';
import { newSave } from '../src/game/state';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = 5311;
const SERVER_PORT = 8811;
const W = 1920, H = 1080;
const MAX_BYTES = 300_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A player fishing in the shot: where they stand, the way they face and how hard they cast (0 to 1). */
interface Angler { name: string; x: number; z: number; yaw: number; power: number }
interface Shot {
  /** The free camera. Yaw 0 looks along -z (out over the lake, toward the sun), positive turns toward -x; pitch below 0 looks down. */
  cam: { x: number; y: number; z: number; yaw: number; pitch: number };
  /**
   * Where the camera's own player stands, unseen. Sun shadows and lamp light are centred on them. Seen from a camera
   * well away from their eyes, a ring of light shows on the lake bed 6 to 10 m east of them (looked for from straight
   * above, 2026-11-20; not seen in play): each shot stands them where that ring is behind the camera or under land.
   */
  stand: { x: number; z: number };
  /** Time of day (`dayFraction`): 0 bright morning, 0.5 dusk, 0.95 dawn. */
  day: number;
  anglers: Angler[];
}
const SHOTS: Record<string, Shot> = {
  // Golden hour from the pier's T end, at eye height behind the last boards: an angler by each lantern, the islet
  // and the mountains between them, the sun upper left.
  dock: {
    cam: { x: 0, y: 2.4, z: -4.4, yaw: 0.04, pitch: -0.06 }, stand: { x: 0, z: -4.4 }, day: 0.505,
    anglers: [{ name: 'Maya', x: -3.5, z: -8.4, yaw: 0.1, power: 0.7 }, { name: 'Theo', x: 3.0, z: -8.4, yaw: -0.1, power: 0.85 }],
  },
  // Soft morning light, low over the cove east of the pier: two anglers on the T end's east arm on the left, the
  // rocket jetty and its lantern on the right.
  morning: {
    cam: { x: 13.1, y: 1.0, z: -1.5, yaw: 0.25, pitch: -0.14 }, stand: { x: 0, z: 5 }, day: 0.955,
    anglers: [{ name: 'Maya', x: 4.6, z: -8.4, yaw: -0.3, power: 0.7 }, { name: 'Theo', x: 3.4, z: -8.5, yaw: 0, power: 0.85 }],
  },
  // Late afternoon from above the quay's west end: Reed's wharf and the seaplane on the left, the pier across the
  // middle, two anglers on it and the Anglers' Rest on the right.
  vista: {
    cam: { x: -10, y: 8, z: 12, yaw: -0.34, pitch: -0.33 }, stand: { x: 0, z: 20 }, day: 0.49,
    anglers: [{ name: 'Maya', x: -0.6, z: 6.3, yaw: 0.95, power: 0.1 }, { name: 'Theo', x: -0.6, z: 7.7, yaw: 0.8, power: 0.12 }],
  },
};
/** The shot the home screen uses. */
const PICK = 'dock';

const [outArg, ...only] = process.argv.slice(2);
const unknown = only.filter((s) => !SHOTS[s]);
if (unknown.length) {
  console.error(`Unknown shot(s): ${unknown.join(', ')}. Choose from: ${Object.keys(SHOTS).join(', ')}`);
  process.exit(2);
}
/** Each shot to take and the file it goes to. */
const jobs: [string, string][] = outArg
  ? (only.length ? only : Object.keys(SHOTS)).map((s) => [s, path.resolve(outArg, `${s}.jpg`)])
  : [[PICK, path.resolve('src/assets/images/home-backdrop.jpg')]];
if (outArg) fs.mkdirSync(path.resolve(outArg), { recursive: true });

// ---------- server with seeded accounts ----------

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fishing-backdrop-'));
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
/** The anglers hold a rod, so the others see it, the line and the bobber. */
const ROD = { held: 0, rod: 'aurora', line: 'moonsilk', bait: 'pearl', slots: [{ k: 'rod', id: 'aurora' }, { k: 'bait', id: 'pearl', n: 20 }, null, null, null] };
// Keyed by the lowercase name, as the server looks accounts up.
const accounts = {
  cam: account('Cam', { color: 0x7ac76a, face: 'smile' }),
  maya: account('Maya', { color: 0xe86a5a, face: 'grin', hat: 'straw', shirt: 'striped', jewelry: 'shell' }, ROD),
  theo: account('Theo', { color: 0x4a8fd6, face: 'joy', hat: 'captain', shirt: 'vest', jewelry: null }, ROD),
};
fs.writeFileSync(path.join(dataDir, 'accounts.json'), JSON.stringify(accounts));

// The server runs in its own process group (`detached`): npx starts tsx, which starts the server, and
// stopping only npx would leave the server on the port. stopServer() signals the whole group.
let serverGroup: number | undefined;
const serverGroupAlive = (): boolean => {
  if (serverGroup === undefined) return false;
  try { process.kill(-serverGroup, 0); return true; } catch { return false; }
};
const signalServerGroup = (sig: NodeJS.Signals): void => {
  if (serverGroup === undefined) return;
  try { process.kill(-serverGroup, sig); } catch { /* already gone */ }
};
let serverStopping: Promise<void> | undefined;
/** Stops the game server and everything it started: SIGTERM, then SIGKILL if it's still up after 2 s. */
function stopServer(): Promise<void> {
  serverStopping ??= (async () => {
    signalServerGroup('SIGTERM');
    for (let i = 0; i < 20 && serverGroupAlive(); i++) await new Promise((r) => setTimeout(r, 100));
    if (serverGroupAlive()) signalServerGroup('SIGKILL');
  })();
  return serverStopping;
}
// Any other exit (a thrown error, process.exit): kill the group at once, there's no time to wait.
process.on('exit', () => { if (serverGroupAlive()) signalServerGroup('SIGKILL'); });
// Ctrl-C and kill don't reach the detached server, so stop it before this script ends.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(sig, () => void stopServer().then(() => process.exit(128 + os.constants.signals[sig])));
}

const server = spawn('npx', ['tsx', 'server/index.ts'], {
  // TEST_HOOKS: the test hook's teleports get past the server's move check.
  env: { ...process.env, DATA_DIR: dataDir, PORT: String(SERVER_PORT), DATABASE_URL: '', TEST_HOOKS: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
  detached: true,
});
serverGroup = server.pid;
await new Promise<void>((res) => server.stdout!.on('data', (d) => /fishing server on port/.test(String(d)) && res()));
process.env.VITE_SERVER_URL = `ws://localhost:${SERVER_PORT}`;
const vite = await createServer({ server: { port: VITE_PORT, strictPort: true }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  defaultViewport: { width: 1280, height: 720 },
});

async function join(name: string): Promise<Page> {
  const page = await (await browser.createBrowserContext()).newPage();
  page.on('pageerror', (e) => console.error(`${name}: ${e.message}`));
  // tsx keeps function names by wrapping them in __name(); functions sent to the page need it too.
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await page.evaluateOnNewDocument((t) => localStorage.setItem('fishing-token', t), token(name));
  // Every "What's new" entry read, so no card opens over the scene on joining.
  await page.evaluateOnNewDocument(() => localStorage.setItem('fishing-news', String(Number.MAX_SAFE_INTEGER)));
  await page.goto(`http://localhost:${VITE_PORT}/?name=${name}&room=backdrop`, { waitUntil: 'load', timeout: 150_000 });
  await page.waitForFunction(() => window.__game?.online(), { timeout: 60000 });
  await page.evaluate(() => window.__game.activate());
  return page;
}
/** Runs a snippet in the page with `G` bound to the game's debug API. */
const game = (p: Page, js: string) => p.evaluate(`(() => { const G = window.__game; ${js} })()`);

let failed = false;
try {
  const cam = await join('Cam');
  // Drawn at twice the size and scaled down by the screenshot, for clean edges on the low-poly shapes.
  await cam.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
  await cam.addStyleTag({ content: '#hud, #crosshair, #toast, #banner, #tip, #guide, #touch, #chat, #fps, #resume, #prompt, #ctx { display: none !important; }' });
  // A free camera: the game sets `world.view` every frame (null in first person), so the property is swapped for
  // one that always answers with the staged view. Full graphics, at two render pixels per CSS pixel.
  await game(cam, `
    window.__view = null;
    Object.defineProperty(G.world, 'view', { get: () => window.__view, set: () => {}, configurable: true });
    G.world.setLite(false);
    G.world.setPixelCap(2);
  `);
  const anglers: Record<string, Page> = {};
  for (const [name, file] of jobs) {
    const shot = SHOTS[name];
    // Anglers of an earlier shot wait up the street, out of sight.
    for (const [n, p] of Object.entries(anglers)) if (!shot.anglers.some((a) => a.name === n)) await game(p, 'G.teleport(0, 45);');
    for (const a of shot.anglers) {
      const p = (anglers[a.name] ??= await join(a.name));
      // A line still out from an earlier shot is pulled in first (a bite meanwhile is left to get away).
      for (let i = 0; i < 60 && (await game(p, `if (G.state().phase === 'waiting') G.press(); return G.state().phase;`)) !== 'idle'; i++) await sleep(500);
      await game(p, `G.teleport(${a.x}, ${a.z}); G.look(${a.yaw}, -0.1);`);
      for (let i = 0; i < 8 && (await game(p, 'return G.state().phase;')) !== 'waiting'; i++) {
        await sleep(600);
        await game(p, `if (G.state().phase === 'idle') G.press();`);
        await sleep(300);
        await game(p, `G.setPower(${a.power}); G.release();`);
        await sleep(1200);
      }
      if ((await game(p, 'return G.state().phase;')) !== 'waiting') throw new Error(`${name}: ${a.name} never got a line out`);
      // No bite before the picture is taken.
      await game(p, 'G.waitLeft(1e6);');
    }
    await game(cam, `
      G.teleport(${shot.stand.x}, ${shot.stand.z});
      G.day(${shot.day});
      window.__view = ${JSON.stringify(shot.cam)};
      // Old Salty strolls the pier and would walk through the shot: he stays home on the quay.
      const t = G.world.town, i = t.npcs.findIndex((n) => n.def.name === 'Old Salty'), d = t.npcs[i].def;
      Object.assign(t.heads[i].walker, { x: d.x, z: d.z, yaw: d.facing, at: 0, next: 1, dir: 1, wait: 1e9, held: 0 });
    `);
    // The bobbers land, the light settles and whatever the new view shows has its shaders.
    await sleep(3000);
    await cam.waitForFunction(() => window.__game.world.ready && window.__game.world.warmedAll, { timeout: 60000 });
    // The anglers go on waiting for a bite; name tags and chat bubbles (sprites drawn over everything) are hidden.
    for (const a of shot.anglers) await game(anglers[a.name], 'G.waitLeft(1e6);');
    await game(cam, `G.world.scene.traverse((o) => { if (o.isSprite && o.material.depthTest === false) o.visible = false; });`);
    await sleep(600);
    // One frame, held, and saved at the best JPEG quality that fits the size budget. `scale: 0.5` brings the
    // doubled render back down to 1920x1080.
    await game(cam, 'G.freeze(true);');
    await sleep(200);
    let jpeg: Uint8Array | undefined, quality = 92;
    for (; quality >= 60; quality -= 2) {
      jpeg = await cam.screenshot({ type: 'jpeg', quality, clip: { x: 0, y: 0, width: W, height: H, scale: 0.5 } });
      if (jpeg.length <= MAX_BYTES) break;
    }
    await game(cam, 'G.freeze(false);');
    if (!jpeg || jpeg.length > MAX_BYTES) throw new Error(`${name}: over ${MAX_BYTES} bytes even at quality 60`);
    fs.writeFileSync(file, jpeg);
    const shown = path.relative(process.cwd(), file);
    console.log(`wrote ${shown.startsWith('..') ? file : shown} (${name}, quality ${quality}, ${Math.round(jpeg.length / 1000)} KB)`);
  }
} catch (e) {
  console.error(e);
  failed = true;
} finally {
  await browser.close();
  await vite.close();
  await stopServer();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);

declare global {
  interface Window {
    __game: any;
    __view: any;
  }
}

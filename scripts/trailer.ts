// README gameplay trailer: stages scenes with scripted players in headless Chrome, films the
// camera player's view with the Chrome screencast, and cuts a ~10 s clip with ffmpeg.
//
//   npm run trailer    # writes docs/images/gameplay.mp4 and docs/images/gameplay.gif (~3 min)
//
// Needs ffmpeg on the PATH (`brew install ffmpeg`) or FFMPEG_PATH. Starts its own game server on
// a throwaway data folder, so your saves are never touched. Cuts are timed from in-game events
// (cast, bite, landing, spin result), so re-runs line up even though fights and spins vary.
// Check the result before committing: each re-record adds ~10 MB to the repo history.
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';
import { createServer } from 'vite';
import { COSMETICS } from '../src/data/cosmetics';
import { ROULETTE_MS } from '../src/data/casino';
import { TIP_IDS } from '../src/game/tips';
import { newSave } from '../src/game/state';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
if (spawnSync(FFMPEG, ['-version']).status !== 0) {
  console.error('npm run trailer needs ffmpeg: `brew install ffmpeg`, or set FFMPEG_PATH.');
  process.exit(2);
}
const VITE_PORT = 5298;
const SERVER_PORT = 8798;
const W = 1280, H = 720;
const OUT = path.resolve('docs/images');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'fishing-trailer-'));
const dataDir = path.join(work, 'data');
fs.mkdirSync(dataDir);

// ---------- server with seeded accounts ----------

const token = (name: string) => `${name}-token-0123456789abcdef`;
const ROD = { k: 'rod', id: 'aurora' };
const account = (name: string, look: object, extra: object = {}) => ({
  name,
  hash: createHash('sha256').update(token(name)).digest('hex'),
  save: {
    ...newSave(),
    level: 24,
    coins: 50000,
    // All tips seen, so no tip box covers the shot.
    tips: [...TIP_IDS],
    rod: 'aurora',
    bait: 'pearl',
    held: 0,
    slots: [ROD, { k: 'bait', id: 'pearl', n: 50 }, null, null, null],
    owned: COSMETICS.map((c) => c.id),
    look: { ...newSave().look, ...look },
    ...extra,
  },
});
const CAM = { color: 0x4a90e2, face: 'smile', hat: 'bucket', shirt: 'vest', jewelry: 'chain' };
// Four fish to bet with: roulette is random, so the casino scene retries until red wins.
const betFish = [ROD, ...['dorado', 'sturgeon', 'arowana', 'koi'].map((fishId) => ({ k: 'fish', fishId, size: 120 }))];
const accounts = Object.fromEntries(
  [
    account('Cam', CAM),
    account('Sam', CAM, { held: 4 }),
    account('Maya', { color: 0xe86a5a, face: 'grin', hat: 'straw', shirt: 'striped', jewelry: 'shell' }),
    account('Theo', { color: 0x38b6a8, face: 'joy', hat: 'captain', shirt: 'coat', jewelry: 'pendant' }),
    account('Ivy', { color: 0xf2c14e, face: 'wink', hat: 'crown', shirt: 'cloak', jewelry: 'diamond' }),
    account('Kai', { color: 0x8e6bd8, face: 'tongue', hat: 'tophat', shirt: 'tux', jewelry: 'jackpot' }),
    account('Lu', { color: 0x7bc86c, face: 'cat', hat: 'horned', shirt: 'hawaiian', jewelry: 'amulet' }),
    account('Cam2', CAM, { location: 'casino', slots: betFish }),
    account('Cam3', CAM, { location: 'casino', slots: betFish }),
    account('Rosa', { color: 0xe06aa8, face: 'grin', hat: 'tophat', shirt: 'tux', jewelry: 'jackpot' }, { location: 'casino', held: 4 }),
    account('Jun', { color: 0xf2b441, face: 'joy', hat: 'visor', shirt: 'dealer', jewelry: 'dice' }, { location: 'casino', held: 4 }),
    account('Bea', { color: 0x38b6a8, face: 'wink', hat: 'crown', shirt: 'cloak', jewelry: 'diamond' }, { location: 'casino', held: 4 }),
  ].map((a) => [a.name.toLowerCase(), a]),
);
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
  defaultViewport: { width: W, height: H },
});

/** Joins as `name`. Extras get a tiny viewport so their rendering doesn't slow the camera page down. */
async function join(name: string, room: string, camera = false): Promise<Page> {
  const page = await (await browser.createBrowserContext()).newPage();
  if (!camera) await page.setViewport({ width: 240, height: 136 });
  page.on('pageerror', (e) => console.error(`${name}: ${e.message}`));
  // tsx keeps function names by wrapping them in __name(); functions sent to the page need it too.
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await page.evaluateOnNewDocument((t) => localStorage.setItem('fishing-token', t), token(name));
  await page.goto(`http://localhost:${VITE_PORT}/?name=${name}&room=${room}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game?.online(), { timeout: 30000 });
  await page.evaluate(() => window.__game.activate());
  if (camera) {
    await page.addStyleTag({
      content: '#crosshair, #toast, #tip, #guide, #help, #prompt, #resume, #spot, #nightchip, #tablehud { display: none !important; }',
    });
  }
  return page;
}
/** Closes a scene's pages so they stop rendering and don't slow the next scene down. */
const leave = (...pages: Page[]) => Promise.all(pages.map((p) => p.browserContext().close()));
/** Runs a snippet in the page with `G` bound to the game's debug API. */
const game = (p: Page, js: string) => p.evaluate(`(() => { const G = window.__game; ${js} })()`);
/** Camera yaw that looks from (x, z) toward (tx, tz); yaw 0 looks along -z. */
const yawTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z));
const place = (p: Page, x: number, z: number, yaw: number, pitch = 0) => game(p, `G.teleport(${x}, ${z}); G.look(${yaw}, ${pitch});`);
const phase = async (p: Page) => ((await game(p, `return G.state();`)) as { phase: string }).phase;
const say = async (p: Page, text: string) => {
  await p.keyboard.press('Enter');
  await p.keyboard.type(text, { delay: 8 });
  await p.keyboard.press('Enter');
};
const cast = async (p: Page, power: number) => {
  await game(p, `G.press();`);
  await sleep(250);
  await game(p, `G.setPower(${power}); G.release();`);
};
/** Keeps a hooked fish's tension mid-range for up to `steps` ticks, or until the fight ends. */
async function reel(p: Page, steps: number) {
  for (let i = 0; i < steps; i++) {
    const st = (await game(p, `return G.state();`)) as { phase: string; tension: number };
    if (st.phase !== 'reeling') return;
    await game(p, `G.hold(${st.tension < 0.55});`);
    await sleep(60);
  }
}
/** Eased camera move, run in the page so it's smooth whatever the puppeteer latency. Doesn't wait. */
const pan = (p: Page, y0: number, y1: number, p0: number, p1: number, ms: number) =>
  p.evaluate(
    (y0, y1, p0, p1, ms) => {
      const G = window.__game;
      const t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / ms);
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        G.look(y0 + (y1 - y0) * e, p0 + (p1 - p0) * e);
        if (k < 1) requestAnimationFrame(step);
      };
      step();
    },
    y0, y1, p0, p1, ms,
  );

// ---------- recording ----------

interface Take {
  file: string;
  length: number;
  /** Seconds from the take's first frame to each named moment. */
  marks: Record<string, number>;
}

/** Films the page for `ms` while `action` runs, and encodes the take at a steady 30 fps. */
async function record(p: Page, name: string, ms: number, action: (mark: (label: string) => void) => Promise<unknown>): Promise<Take> {
  const dir = path.join(work, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir);
  const cdp = await p.createCDPSession();
  const frames: { ts: number; file: string }[] = [];
  cdp.on('Page.screencastFrame', (f) => {
    const file = path.join(dir, `f${String(frames.length).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ ts: f.metadata.timestamp!, file });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  const at: Record<string, number> = {};
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  await Promise.all([action((label) => (at[label] = Date.now() / 1000)), sleep(ms)]);
  await cdp.send('Page.stopScreencast');
  await cdp.detach();
  // Frames arrive unevenly; the concat demuxer holds each one until the next, then fps=30 resamples.
  const list = frames.map((f, i) => `file '${f.file}'\nduration ${((frames[i + 1]?.ts ?? f.ts + 1 / 30) - f.ts).toFixed(4)}`);
  fs.writeFileSync(path.join(dir, 'list.txt'), `${list.join('\n')}\nfile '${frames.at(-1)!.file}'\n`);
  const file = path.join(work, `${name}.mp4`);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'),
    '-vf', `fps=30,scale=${W}:${H}`, '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', file]);
  fs.rmSync(dir, { recursive: true, force: true });
  const t0 = frames[0].ts;
  const length = frames.at(-1)!.ts - t0;
  console.log(`${name}: ${frames.length} frames over ${length.toFixed(1)}s`);
  return { file, length, marks: Object.fromEntries(Object.entries(at).map(([k, v]) => [k, v - t0])) };
}

/** A slice of a take: `from`/`to` are seconds relative to the named mark. */
interface Cut { take: Take; mark: string; from: number; to: number }

const FADE = 0.25;
/** Joins the cuts with short crossfades, fades in and out, and writes the MP4 and a lighter GIF. */
function edit(cuts: Cut[]) {
  const spans = cuts.map(({ take, mark, from, to }) => {
    const m = take.marks[mark];
    if (m === undefined) throw new Error(`${path.basename(take.file)}: never reached "${mark}"`);
    const a = Math.max(0, m + from);
    return { a, b: Math.min(take.length, Math.max(a + 0.5, m + to)) };
  });
  const graph = cuts.map((c, i) => `[${i}:v]trim=${spans[i].a.toFixed(3)}:${spans[i].b.toFixed(3)},setpts=PTS-STARTPTS,fps=30,format=yuv420p[v${i}]`);
  let last = 'v0';
  let t = spans[0].b - spans[0].a;
  for (let i = 1; i < cuts.length; i++) {
    const offset = t - FADE;
    graph.push(`[${last}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}[x${i}]`);
    last = `x${i}`;
    t = offset + spans[i].b - spans[i].a;
  }
  graph.push(`[${last}]fade=t=in:st=0:d=0.3,fade=t=out:st=${(t - 0.4).toFixed(3)}:d=0.4[out]`);
  const mp4 = path.join(OUT, 'gameplay.mp4');
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', ...cuts.flatMap((c) => ['-i', c.take.file]), '-filter_complex', graph.join(';'),
    '-map', '[out]', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', mp4, '-vf',
    'fps=12,scale=560:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
    path.join(OUT, 'gameplay.gif')]);
  console.log(`wrote docs/images/gameplay.mp4 and docs/images/gameplay.gif (${t.toFixed(1)}s)`);
}

// ---------- scenes ----------

let failed = false;
try {
  // Friends fishing off the pier at sunset; the camera casts, hooks a fish, then lands an Aurora Pike.
  const cam = await join('Cam', 'pier', true);
  const [maya, theo] = [await join('Maya', 'pier'), await join('Theo', 'pier')];
  await game(cam, 'G.day(0.5);');
  await place(maya, -1.25, -5.4, -0.3, -0.1);
  await place(theo, 1.35, -5.3, 0.3, -0.1);
  await place(cam, 0.1, -4.2, 0.55, -0.06);
  await sleep(1500);
  await cast(maya, 0.7);
  await sleep(400);
  await cast(theo, 0.85);
  await sleep(2500);
  const pier = await record(cam, 'pier', 9000, async (mark) => {
    await pan(cam, 0.55, 0.0, -0.06, -0.1, 2000);
    await sleep(200);
    await say(maya, 'the sunset bite is the best 🎣');
    await sleep(1500);
    mark('cast');
    await cast(cam, 0.75);
    for (let i = 0; i < 40 && (await phase(cam)) !== 'waiting'; i++) await sleep(50);
    await sleep(500);
    await game(cam, 'G.skipWait();');
    for (let i = 0; i < 40 && (await phase(cam)) !== 'bite'; i++) await sleep(50);
    mark('bite');
    await sleep(250);
    await game(cam, 'G.press();');
    await say(theo, 'ooh that one looks big');
    await reel(cam, 60);
  });
  // Finish the fight off camera and clear the catch card, so the staged landing starts from idle.
  await reel(cam, 600);
  for (let i = 0; i < 100 && (await phase(cam)) !== 'idle'; i++) {
    if ((await phase(cam)) === 'result') await game(cam, 'G.press(); G.hold(false);');
    await sleep(100);
  }
  await place(cam, 0.25, -4.6, -0.05, -0.08);
  await sleep(1000);
  const landing = await record(cam, 'landing', 4000, async (mark) => {
    mark('land');
    await game(cam, `G.land('aurorapike', 255);`);
    await sleep(2600);
    await say(maya, 'NO WAY an Aurora Pike!!');
  });
  await leave(cam, maya, theo);

  // Dressed-up friends hanging out by the well at dusk, chatting about a casino run.
  const sam = await join('Sam', 'square', true);
  const crew = [await join('Maya', 'square'), await join('Kai', 'square'), await join('Ivy', 'square'), await join('Theo', 'square'), await join('Lu', 'square')];
  const C = { x: 0.3, z: 25.2 };
  const spots = [{ x: -2.3, z: 29.3 }, { x: -1.1, z: 28.6 }, { x: 0.3, z: 28.3 }, { x: 1.6, z: 28.6 }, { x: 2.8, z: 29.4 }];
  for (const [i, p] of crew.entries()) await place(p, spots[i].x, spots[i].z, yawTo(spots[i].x, spots[i].z, C.x, C.z));
  await place(sam, C.x, C.z, Math.PI - 0.25, -0.04);
  await game(sam, 'G.day(0.58);');
  await sleep(2500);
  const [, kai, ivy, theo2] = crew;
  const square = await record(sam, 'square', 5000, async (mark) => {
    await pan(sam, Math.PI - 0.25, Math.PI + 0.2, -0.04, -0.06, 5000);
    await say(ivy, 'finally got the crown 👑');
    mark('crown');
    await sleep(900);
    await say(kai, 'casino run? 🎰');
    await sleep(700);
    await say(theo2, "i'm in!");
  });
  await leave(sam, ...crew);

  // Betting a fish on red at the roulette wheel with friends watching, until red comes up.
  let table = await join('Cam2', 'casino', true);
  const [rosa, jun, bea] = [await join('Rosa', 'casino'), await join('Jun', 'casino'), await join('Bea', 'casino')];
  const T = { x: -9, z: 43 };
  await game(table, `G.teleport(-8.6, 39.7);`);
  await place(jun, -6.8, 42.2, yawTo(-6.8, 42.2, T.x, T.z));
  await place(rosa, -11.2, 41.9, yawTo(-11.2, 41.9, T.x, T.z));
  await place(bea, -11.7, 44.0, yawTo(-11.7, 44.0, T.x, T.z));
  await sleep(1500);
  /** Yaw and pitch from the camera to a roulette bet patch, or to the wheel when `bet` is null. */
  const aimAt = (bet: string | null) =>
    table.evaluate((bet) => {
      const G = window.__game;
      const c = G.world.camera.position;
      const V = c.constructor;
      const v = bet ? G.world.hall.picks.find((o: any) => o.userData.tag?.id === bet).getWorldPosition(new V()) : new V(-9, 1.1, 43);
      const dx = v.x - c.x, dy = v.y - c.y, dz = v.z - c.z;
      return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
    }, bet) as Promise<{ yaw: number; pitch: number }>;
  const red = await aimAt('red');
  const wheel = await aimAt(null);
  // Unwrap so the pan never turns the long way round.
  red.yaw = wheel.yaw + Math.atan2(Math.sin(red.yaw - wheel.yaw), Math.cos(red.yaw - wheel.yaw));
  const lines = [['come on RED!!', 'omg omg'], ['red red red', 'here we go'], ['one more spin', 'lets gooo'], ['all in on red', 'no way']];
  let spin: Take | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    if (attempt === 4) {
      // Out of fish: a second account with a fresh set.
      await leave(table);
      table = await join('Cam3', 'casino', true);
      await game(table, `G.teleport(-8.6, 39.7);`);
      await sleep(1500);
    }
    await table.keyboard.press(`Digit${(attempt % 4) + 2}`);
    await game(table, `G.look(${wheel.yaw}, ${wheel.pitch + 0.05});`);
    await sleep(1200);
    spin = await record(table, 'casino', 8500, async (mark) => {
      await pan(table, wheel.yaw, red.yaw, wheel.pitch + 0.05, red.pitch, 900);
      await sleep(1100);
      await game(table, 'G.press(); G.hold(false);');
      mark('result');
      await say(rosa, lines[attempt % 4][0]);
      await sleep(200);
      await pan(table, red.yaw, wheel.yaw, red.pitch, wheel.pitch + 0.05, 1200);
      await sleep(1600);
      await say(jun, lines[attempt % 4][1]);
    });
    spin.marks.result += ROULETTE_MS / 1000;
    const won = await table.evaluate(() => document.getElementById('tableresult')!.className.includes('win'));
    console.log(`roulette spin ${attempt + 1}: ${won ? 'win' : 'lose'}`);
    if (won) break;
    if (attempt === 7) console.warn('roulette: no win in 8 spins, using a losing spin');
    await sleep(1500);
  }
  await leave(table, rosa, jun, bea);

  edit([
    { take: pier, mark: 'cast', from: -1.5, to: 0.7 },
    { take: pier, mark: 'bite', from: -0.1, to: 1.3 },
    { take: landing, mark: 'land', from: 0, to: 1.9 },
    { take: square, mark: 'crown', from: -0.15, to: 2.55 },
    { take: spin!, mark: 'result', from: -1.3, to: 1.5 },
  ]);
} catch (e) {
  console.error(e);
  failed = true;
} finally {
  await browser.close();
  await vite.close();
  server.kill();
  fs.rmSync(work, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);

declare global {
  interface Window {
    __game: any;
  }
}

// Scratch: stages the open sea at several depths, times and angles for an art review.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { TIP_IDS } from '../src/game/tips';
import { newSave } from '../src/game/state';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = 5311, SERVER_PORT = 8811;
const OUT = process.argv[2];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fishing-seashots-'));
const TOKEN = 'shots-token-0123456789abcdef';
fs.writeFileSync(path.join(dataDir, 'accounts.json'), JSON.stringify({ shots: { name: 'Shots', hash: createHash('sha256').update(TOKEN).digest('hex'), save: { ...newSave(), level: 60, coins: 50000, tips: [...TIP_IDS], held: 4 } } }));
const server = spawn('npx', ['tsx', 'server/index.ts'], { env: { ...process.env, DATA_DIR: dataDir, PORT: String(SERVER_PORT), DATABASE_URL: '', DISCORD_FEEDBACK_WEBHOOK: '', DISCORD_JOINS_WEBHOOK: '', DISCORD_TIPS_WEBHOOK: '', DEV_USER: 'shots', DEV_PASS: 'shots-dev-pass', TEST_HOOKS: '1' }, stdio: ['ignore', 'pipe', 'inherit'], detached: true });
process.on('exit', () => { try { process.kill(-server.pid!, 'SIGKILL'); } catch {} });
await new Promise<void>((res) => server.stdout!.on('data', (d) => /fishing server on port/.test(String(d)) && res()));
process.env.VITE_SERVER_URL = `ws://localhost:${SERVER_PORT}`;
const vite = await createServer({ server: { port: VITE_PORT, strictPort: true }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 1120, height: 630 } });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(e.message));
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await page.evaluateOnNewDocument((t) => { localStorage.setItem('fishing-token', t); localStorage.setItem('fishing-news', String(Number.MAX_SAFE_INTEGER)); }, TOKEN);
  await page.goto(`http://localhost:${VITE_PORT}/?name=Shots&room=shots`, { waitUntil: 'load' });
  await page.waitForFunction(() => (window as any).__game?.online() && (window as any).__game.world.hub, { timeout: 20000 });
  await page.evaluate(() => (window as any).__game.activate());
  await sleep(600);
  const say = async (text: string) => { await page.keyboard.press('Enter'); await page.keyboard.type(text); await page.keyboard.press('Enter'); await sleep(300); };
  await say('/login shots shots-dev-pass');
  for (const [name, day, yaw, pitch] of [['pond-day', 0.3, 0, 0.12], ['pond-night', 0.75, 0, 0.12], ['pond-night-right', 0.75, -0.6, 0.2], ['pond-dusk', 0.525, 0, 0.12]] as [string, number, number, number][]) {
    await page.evaluate((day, yaw, pitch) => { const G = (window as any).__game; G.teleport(0.2, -5.4); G.look(yaw, pitch); G.day(day); }, day, yaw, pitch);
    await sleep(1200);
    await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 80 });
  }
  await say('/sea 1');
  await page.waitForFunction(() => (window as any).__game.world.sea && document.getElementById('castoff')!.classList.contains('hidden'), { timeout: 20000 });
  await page.addStyleTag({ content: '#hud, #crosshair, #toast, #banner, #tip, #guide, #divehud, #chat, #chatbox, #hotbar { display: none !important; }' });
  // Camera override: an outside view when set, applied just before each render.
  await page.evaluate(() => {
    const w = (window as any).__game.world;
    const orig = w.renderer.render.bind(w.renderer);
    (window as any).__cam = null;
    w.renderer.render = (scene: any, cam: any) => {
      const c = (window as any).__cam;
      if (c && cam === w.camera) { cam.position.set(c[0], c[1], c[2]); cam.lookAt(c[3], c[4], c[5]); cam.updateMatrixWorld(true); }
      orig(scene, cam);
    };
  });
  type Shot = { name: string; depth: number; day: number; look?: [number, number]; tp?: [number, number]; cam?: number[] };
  const OUTSEA: [number, number] = [0, -0.02];
  const shots: Shot[] = [];
  const D: [string, number][] = [['shelf', 1], ['dropoff', 20], ['kelp', 60], ['twilight', 110], ['abyss', 200]];
  for (const [n, d] of D) shots.push({ name: `day-${n}-sea`, depth: d, day: 0.45, look: OUTSEA });
  for (const [n, d] of [D[0], D[1], D[3]]) shots.push({ name: `night-${n}-sea`, depth: d, day: 0.75, look: OUTSEA });
  shots.push({ name: 'dusk-shelf-sea', depth: 1, day: Number(process.env.DUSK ?? 0.62), look: OUTSEA });
  shots.push({ name: 'day-shelf-fwd', depth: 1, day: 0.45, tp: [-3.5, 0], look: [-Math.PI / 2, 0.05] });
  shots.push({ name: 'day-shelf-aft', depth: 1, day: 0.45, tp: [0.8, -0.9], look: [Math.PI / 2, 0.0] });
  shots.push({ name: 'night-shelf-right', depth: 1, day: 0.75, look: [-0.6, 0.15] });
  shots.push({ name: 'night-shelf-up', depth: 1, day: 0.75, look: [-0.3, 0.6] });
  shots.push({ name: 'day-shelf-right', depth: 1, day: 0.3, look: [-0.9, 0.1] });
  shots.push({ name: 'day-shelf-up', depth: 1, day: 0.45, look: [0, 0.75] });
  shots.push({ name: 'day-shelf-land', depth: 1, day: 0.45, tp: [-2.5, 0.9], look: [Math.PI, 0.0] });
  shots.push({ name: 'day-dropoff-up', depth: 20, day: 0.45, look: [0, 0.6] });
  shots.push({ name: 'day-shelf-ext', depth: 1, day: 0.45, cam: [9, 3.2, -11, 0, 1.4, 0] });
  shots.push({ name: 'day-shelf-ext-port', depth: 1, day: 0.45, cam: [-10, 4.5, 10, 0, 1.4, 0] });
  shots.push({ name: 'day-shelf-ext-far', depth: 1, day: 0.45, cam: [10, 9, -34, 0, 3, 0] });
  shots.push({ name: 'night-shelf-ext', depth: 1, day: 0.75, cam: [9, 3.2, -11, 0, 1.4, 0] });
  shots.push({ name: 'dusk-shelf-ext', depth: 1, day: Number(process.env.DUSK ?? 0.62), cam: [9, 3.2, -11, 0, 1.4, 0] });
  shots.push({ name: 'day-twilight-ext', depth: 110, day: 0.45, cam: [9, 3.2, -11, 0, 1.4, 0] });
  shots.push({ name: 'night-twilight-fwd', depth: 110, day: 0.75, tp: [-3.5, 0], look: [-Math.PI / 2, 0.05] });
  for (const s of shots) {
    await page.evaluate((s) => {
      const G = (window as any).__game;
      G.world.setDepth(s.depth, true);
      G.day(s.day);
      const tp = s.tp ?? [-1.6, 0.3];
      G.teleport(tp[0], tp[1]);
      if (s.look) G.look(s.look[0], s.look[1]);
      (window as any).__cam = s.cam ?? null;
    }, s);
    await sleep(1500);
    await page.screenshot({ path: `${OUT}/${s.name}.jpg`, type: 'jpeg', quality: 80 });
    console.log(s.name);
  }
  console.log(await page.evaluate(() => { const i = (window as any).__game.world.renderer.info; return JSON.stringify({ calls: i.render.calls, tris: i.render.triangles }); }));
} finally {
  await browser.close();
  await vite.close();
  try { process.kill(-server.pid!, 'SIGTERM'); } catch {}
}
process.exit(0);

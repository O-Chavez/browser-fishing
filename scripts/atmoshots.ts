// Scratch: stages sea shots from a JSON list (argv[3]) into argv[2]; each shot may run `js` (G = __game, w = world) first.
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
const VITE_PORT = 5315, SERVER_PORT = 8815;
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
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: Number(process.env.W ?? 1120), height: Number(process.env.H ?? 630) } });
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
  type Shot = { name: string; depth: number; day: number; look?: [number, number]; tp?: [number, number]; cam?: number[]; js?: string; time?: number; wait?: number };
  const shots: Shot[] = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  for (const s of shots) {
    await page.evaluate((s) => {
      const G = (window as any).__game;
      G.world.setDepth(s.depth, true);
      G.day(s.day);
      const tp = s.tp ?? [-1.6, 0.3];
      G.teleport(tp[0], tp[1]);
      if (s.look) G.look(s.look[0], s.look[1]);
      (window as any).__cam = s.cam ?? null;
      G.world.time = s.time ?? 100;
      if (s.js) new Function('G', 'w', s.js)(G, G.world);
    }, s);
    await sleep(s.wait ?? 1500);
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

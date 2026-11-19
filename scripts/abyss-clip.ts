// Scratch: films the sea from the deck with the Chrome screencast. `npx tsx scripts/abyss-clip.ts <out.mp4> <depth> <day> <seconds> [js]`;
// `js` runs first (G = __game, w = world), and may set `window.__events = [[ms, 'js'], ...]` to run more during the take.
// Needs ffmpeg on the PATH or FFMPEG_PATH; W and H set the size (960x540).
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { TIP_IDS } from '../src/game/tips';
import { newSave } from '../src/game/state';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = 5316, SERVER_PORT = 8816;
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const OUT = process.argv[2];
const [DEPTH, DAY, SECONDS] = [3, 4, 5].map((i) => Number(process.argv[i]));
const JS = process.argv[6] ?? '';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fishing-seashots-'));
const TOKEN = 'shots-token-0123456789abcdef';
fs.writeFileSync(path.join(dataDir, 'accounts.json'), JSON.stringify({ shots: { name: 'Shots', hash: createHash('sha256').update(TOKEN).digest('hex'), save: { ...newSave(), level: 60, coins: 50000, tips: [...TIP_IDS], held: 4 } } }));
const server = spawn('npx', ['tsx', 'server/index.ts'], { env: { ...process.env, DATA_DIR: dataDir, PORT: String(SERVER_PORT), DATABASE_URL: '', DISCORD_FEEDBACK_WEBHOOK: '', DISCORD_JOINS_WEBHOOK: '', DISCORD_TIPS_WEBHOOK: '', DEV_USER: 'shots', DEV_PASS: 'shots-dev-pass', TEST_HOOKS: '1' }, stdio: ['ignore', 'pipe', 'inherit'], detached: true });
process.on('exit', () => { try { process.kill(-server.pid!, 'SIGKILL'); } catch {} });
await new Promise<void>((res) => server.stdout!.on('data', (d) => /fishing server on port/.test(String(d)) && res()));
process.env.VITE_SERVER_URL = `ws://localhost:${SERVER_PORT}`;
const vite = await createServer({ server: { port: VITE_PORT, strictPort: true }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: Number(process.env.W ?? 960), height: Number(process.env.H ?? 540) } });
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
  await say('/sea 0');
  await page.waitForFunction(() => (window as any).__game.world.sea && document.getElementById('castoff')!.classList.contains('hidden'), { timeout: 20000 });
  await page.addStyleTag({ content: '#hud, #crosshair, #toast, #banner, #tip, #guide, #divehud, #chat, #chatbox, #hotbar { display: none !important; }' });
  await page.evaluate((depth, day, js) => {
    const G = (window as any).__game;
    G.world.setDepth(depth, true);
    G.day(day);
    G.teleport(-1.6, 0.3);
    G.look(0, 0.05);
    (window as any).__events = [];
    if (js) new Function('G', 'w', js)(G, G.world);
  }, DEPTH, DAY, JS);
  await sleep(2500);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fishing-abyss-film-'));
  const cdp = await page.createCDPSession();
  const shots: { ts: number; file: string }[] = [];
  cdp.on('Page.screencastFrame', (f) => {
    const file = path.join(dir, `f${String(shots.length).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    shots.push({ ts: f.metadata.timestamp!, file });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
  // The take's events run on the page's own clock.
  await page.evaluate(() => {
    const G = (window as any).__game;
    for (const [ms, js] of (window as any).__events as [number, string][]) setTimeout(() => new Function('G', 'w', js)(G, G.world), ms);
  });
  await sleep(SECONDS * 1000);
  await cdp.send('Page.stopScreencast');
  await cdp.detach();
  // Frames arrive unevenly and sometimes out of order; the concat demuxer holds each until the next, then fps=30 resamples.
  shots.sort((a, b) => a.ts - b.ts);
  const list = shots.map((f, i) => `file '${f.file}'\nduration ${((shots[i + 1]?.ts ?? f.ts + 1 / 30) - f.ts).toFixed(4)}`);
  fs.writeFileSync(path.join(dir, 'list.txt'), `${list.join('\n')}\nfile '${shots.at(-1)!.file}'\n`);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-vf', 'fps=30', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT]);
  if (process.env.KEEP_FRAMES) console.log(dir);
  else fs.rmSync(dir, { recursive: true, force: true });
  console.log(`${OUT} (${shots.length} frames)`);
  console.log(await page.evaluate(() => { const i = (window as any).__game.world.renderer.info; return JSON.stringify({ calls: i.render.calls, tris: i.render.triangles, log: (window as any).__log ?? [] }); }));
} finally {
  await browser.close();
  await vite.close();
  try { process.kill(-server.pid!, 'SIGTERM'); } catch {}
}
process.exit(0);

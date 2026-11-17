// The campfire band, played with real players: two headless players on a seeded server (its own, on a throwaway
// data folder; ports 8771 and 5271). Checks through the test hook (`__game.band()`) that the tune starts with
// nobody seated, that a player seated at a fire log plays its part on their own screen and on the other player's,
// that the cove wall's seats are quiet, the band's and the town layer's levels near and far, that M silences the
// band with the music, and that getting up ends the part. Prints PASS/FAIL per check, exits non-zero on a failure.
//
//   CHROME_PATH=... npx tsx scripts/band-check.ts
//
// The sound itself is checked by scripts/band-audio.ts; the levels read here are rough (headless audio stutters).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';
import { createServer } from 'vite';
import { MAPS, campSeats } from '../src/data/maps';
import { TIP_IDS } from '../src/game/tips';
import { newSave } from '../src/game/state';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = 5271, SERVER_PORT = 8771, WAIT = 120_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fishing-band-'));
const token = (n: string) => `${n}-band-token-0123456789abcdef`;
const account = (name: string) => ({ name, hash: createHash('sha256').update(token(name)).digest('hex'), save: { ...newSave(), level: 22, tips: [...TIP_IDS], held: 4 } });
fs.writeFileSync(path.join(dataDir, 'accounts.json'), JSON.stringify({ ann: account('Ann'), bob: account('Bob') }));
const server = spawn('npx', ['tsx', 'server/index.ts'], { env: { ...process.env, DATA_DIR: dataDir, PORT: String(SERVER_PORT), DATABASE_URL: '', DISCORD_FEEDBACK_WEBHOOK: '', DISCORD_JOINS_WEBHOOK: '', DISCORD_TIPS_WEBHOOK: '', TEST_HOOKS: '1' }, stdio: ['ignore', 'pipe', 'inherit'], detached: true });
const kill = () => { try { process.kill(-server.pid!, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', kill);
await new Promise<void>((res) => server.stdout!.on('data', (d) => /fishing server on port/.test(String(d)) && res()));
process.env.VITE_SERVER_URL = `ws://localhost:${SERVER_PORT}`;
const vite = await createServer({ server: { port: VITE_PORT, strictPort: true, hmr: false, watch: null }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling'], defaultViewport: { width: 640, height: 360 }, protocolTimeout: 300_000 });
async function join(name: string): Promise<Page> {
  const page = await (await browser.createBrowserContext()).newPage();
  page.on('pageerror', (e) => { fails++; console.error(`${name}: ${e.message}`); });
  page.setDefaultTimeout(WAIT);
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await page.evaluateOnNewDocument((t) => { localStorage.setItem('fishing-token', t); localStorage.setItem('fishing-news', String(Number.MAX_SAFE_INTEGER)); }, token(name));
  await page.goto(`http://localhost:${VITE_PORT}/?name=${name}&room=band`, { waitUntil: 'load', timeout: 300_000 });
  await page.waitForFunction(() => (window as any).__game?.online(), { timeout: 300_000 });
  await page.evaluate(() => (window as any).__game.activate());
  return page;
}
type Band = { mask: number; dist: number; audio: { mask: number; sounding: number; bar: number | null; band: number; town: number; music: boolean }; level: number };
const band = (p: Page) => p.evaluate(() => (window as any).__game.band()) as Promise<Band>;
/** The music's level averaged over `secs` seconds. */
const level = async (p: Page, secs = 6) => { await p.bringToFront(); let s = 0, n = 0; for (let t = 0; t < secs; t += 0.5) { await sleep(500); const b = await band(p); s += b.level ** 2; n++; } return Math.sqrt(s / n); };
const db = (v: number) => (20 * Math.log10(Math.max(v, 1e-9))).toFixed(1);
const until = async (p: Page, what: string, f: (b: Band) => boolean, ms = WAIT) => { await p.bringToFront(); const t0 = Date.now(); let b = await band(p); while (!f(b) && Date.now() - t0 < ms) { await sleep(200); b = await band(p); } check(what, f(b), b); return b; };
const seats = campSeats(MAPS[0]);
const walk = async (p: Page, key: string) => { await p.bringToFront(); await p.evaluate((k) => (window as any).__game.key(k, true), key); await p.waitForFunction(() => (window as any).__game.emoteState().id === null, { timeout: WAIT }); await p.evaluate((k) => (window as any).__game.key(k, false), key); };
const sit = async (p: Page, i: number) => {
  const s = seats[i];
  await p.bringToFront();
  await p.evaluate((s) => { const g = (window as any).__game; g.teleport(s.x + 0.9 * Math.sin(s.facing), s.z + 0.9 * Math.cos(s.facing)); g.look(s.facing, -0.2); }, s);
  await p.waitForFunction(() => (window as any).__game.player().near?.startsWith('Sit down'), { timeout: WAIT });
  await p.evaluate(() => (window as any).__game.interact());
};
try {
  const ann = await join('Ann');
  const bob = await join('Bob');
  // 1. Nobody seated: the tune plays as before.
  let a = await until(ann, '1a. the tune starts (a bar is scheduled, context running) with an empty band', (b) => b.audio.bar !== null && b.mask === 0 && b.audio.sounding === 0);
  check('1b. nobody plays: town layer at 1', a.audio.town === 1, a.audio);
  const clocks = await Promise.all([ann, bob].map((p) => p.evaluate(() => (window as any).__game.world.clock() - Date.now())));
  console.log('INFO  1c. the two players\' shared clocks minus the device clock (ms):', clocks);
  const bars = await Promise.all([ann, bob].map((p) => p.evaluate(() => ({ bar: (window as any).__game.band().audio.bar, now: (window as any).__game.world.clock() }))));
  for (const p of [ann, bob]) await until(p, '1d. the bar scheduled is the bar the clock is in or the next', () => true).then(async (b) => { const now = await p.evaluate(() => (window as any).__game.world.clock()); const d = b.audio.bar! - Math.floor(now / 2160); check('    (bars ahead of the clock)', d >= 0 && d <= 1, d); });
  const quiet = await level(ann);
  check('1e. the town tune is sounding at the pier', quiet > 0.001, `${db(quiet)} dB`);
  // 2. Bob sits at the banjo's log.
  await sit(bob, 1);
  let b = await until(bob, '2a. Bob seated on log 0 plays the banjo on his own screen; full band, town layer stepped back', (x) => x.mask === 1 && x.audio.sounding === 1 && x.audio.band === 1 && Math.abs(x.audio.town - 0.12) < 1e-9);
  a = await until(ann, '2b. Ann at the pier works out the same mask from Bob\'s avatar; faint band over the full tune', (x) => x.mask === 1 && x.audio.sounding === 1 && x.audio.town === 1 && x.audio.band > 0.1 && x.audio.band < 0.14);
  // 3. Ann sits on a quiet seat (the cove wall), then at the whistle's log.
  await sit(ann, 20);
  a = await until(ann, '3a. Ann on the cove wall adds no part', (x) => x.dist > 5 && x.dist < 6 && x.mask === 1);
  await walk(ann, 'KeyW');
  await sit(ann, 6);
  a = await until(ann, '3b. Ann on log 3 adds the whistle', (x) => x.mask === 0b1001 && x.audio.sounding === 0b1001);
  b = await until(bob, '3c. Bob sees both parts', (x) => x.mask === 0b1001 && x.audio.sounding === 0b1001);
  const loud = await level(bob);
  check('3d. Bob on the terrace hears music', loud > 0.001, `${db(loud)} dB (the tune alone at the pier was ${db(quiet)} dB)`);
  // 4. The music switch silences the band too.
  await bob.bringToFront();
  await bob.keyboard.press('m');
  await sleep(4000);
  const off = await level(bob, 3);
  b = await band(bob);
  check('4a. M: music off, the band with it', !b.audio.music && off < loud / 100, `${db(off)} dB, mask ${b.mask}`);
  await bob.keyboard.press('m');
  await sleep(3000);
  const on = await level(bob, 4);
  check('4b. M again: back', on > loud / 4, `${db(on)} dB`);
  // 5. Bob gets up: his part goes, Ann's stays.
  await walk(bob, 'KeyS');
  b = await until(bob, '5a. Bob up: only the whistle left, on his screen', (x) => x.mask === 0b1000 && x.audio.sounding === 0b1000);
  a = await until(ann, '5b. ...and on Ann\'s', (x) => x.mask === 0b1000 && x.audio.sounding === 0b1000);
  await walk(ann, 'KeyS');
  a = await until(ann, '5c. Ann up: nobody plays, the town layer is back at 1 once the bar has ended', (x) => x.mask === 0 && x.audio.sounding === 0 && x.audio.town === 1);
} catch (e) { check('ran to the end', false, String(e)); }
await browser.close(); await vite.close(); kill();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);

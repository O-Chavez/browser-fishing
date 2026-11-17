// The campfire band's instruments, seen by real players: three headless players on a seeded server (its own, on a
// throwaway data folder; ports 8773 and 5273). Ann sits at the banjo's log; Bob, who was there, and Cat, who joins
// after, must each see the banjo off its stand and in Ann's avatar's hands, and back on its stand when she gets up;
// Bob then joins her on the same log and each holds one. Prints PASS/FAIL per check, saves a picture from each
// watcher, exits non-zero on a failure. The pictures of every instrument are staged by scripts/band-views.ts.
//
//   CHROME_PATH=... npx tsx scripts/band-seen.ts [out dir]      (default .bench/band-views)
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { createServer } from 'vite';
import { MAPS, campSeats } from '../src/data/maps';
import { TIP_IDS } from '../src/game/tips';
import { newSave } from '../src/game/state';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = 5273, SERVER_PORT = 8773, WAIT = 240_000;
const OUT = path.resolve(process.argv[2] ?? '.bench/band-views');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fishing-band-seen-'));
const token = (n: string) => `${n}-seen-token-0123456789abcdef`;
const account = (name: string, color: number) => ({ name, hash: createHash('sha256').update(token(name)).digest('hex'), save: { ...newSave(), level: 22, tips: [...TIP_IDS], held: 4, look: { ...newSave().look, color } } });
fs.writeFileSync(path.join(dataDir, 'accounts.json'), JSON.stringify({ ann: account('Ann', 0xe86a5a), bob: account('Bob', 0x4a8fd6), cat: account('Cat', 0x7ac76a) }));
const server = spawn('npx', ['tsx', 'server/index.ts'], { env: { ...process.env, DATA_DIR: dataDir, PORT: String(SERVER_PORT), DATABASE_URL: '', DISCORD_FEEDBACK_WEBHOOK: '', DISCORD_JOINS_WEBHOOK: '', DISCORD_TIPS_WEBHOOK: '', TEST_HOOKS: '1' }, stdio: ['ignore', 'pipe', 'inherit'], detached: true });
const kill = () => { try { process.kill(-server.pid!, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', kill);
await new Promise<void>((res) => server.stdout!.on('data', (d) => /fishing server on port/.test(String(d)) && res()));
process.env.VITE_SERVER_URL = `ws://localhost:${SERVER_PORT}`;
const vite = await createServer({ server: { port: VITE_PORT, strictPort: true, hmr: false, watch: null }, logLevel: 'error' });
await vite.listen();
// One browser per player: headless Chrome draws only the page in front, and the game moves only as it draws.
const browsers: Browser[] = [];
async function join(name: string): Promise<Page> {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 800, height: 450 }, protocolTimeout: 600_000 });
  browsers.push(browser);
  const page = (await browser.pages())[0] ?? (await browser.newPage());
  page.on('pageerror', (e) => { fails++; console.error(`${name}: ${e.message}`); });
  page.setDefaultTimeout(WAIT);
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await page.evaluateOnNewDocument((t) => { localStorage.setItem('fishing-token', t); localStorage.setItem('fishing-news', String(Number.MAX_SAFE_INTEGER)); }, token(name));
  await page.goto(`http://localhost:${VITE_PORT}/?name=${name}&room=seen`, { waitUntil: 'load', timeout: 600_000 });
  await page.waitForFunction(() => (window as any).__game?.online(), { timeout: 600_000 });
  await page.evaluate(() => (window as any).__game.activate());
  await page.addStyleTag({ content: '#hud, #crosshair, #toast, #banner, #tip, #guide, #chat { display: none !important; }' });
  // The instruments' one material, from the module the game itself loaded: whatever is drawn with it is an instrument.
  await page.evaluate(`(async () => { window.__paint = (await import('/src/game/instruments.ts')).buildInstrument('jug').group.children[0].material; })()`);
  return page;
}
/** What a player's screen shows of the band: which instruments stand by their logs, and how many are in players' hands (shown, and not the town's). */
type Seen = { stands: boolean[]; held: number };
const seen = (p: Page) => p.evaluate(() => {
  const G = (window as any).__game;
  const town = G.world.town;
  let held = 0;
  G.world.scene.traverse((o: any) => {
    if (!o.isMesh || o.material !== (window as any).__paint) return;
    let shown = true, inTown = false, grown = true;
    for (let q = o; q; q = q.parent) { if (!q.visible) shown = false; if (q === town.group) inTown = true; if (q.scale.x === 0) grown = false; }
    if (shown && grown && !inTown) held++;
  });
  return { stands: town.instruments.map((g: any) => g.visible), held };
}) as Promise<Seen>;
const until = async (p: Page, what: string, f: (s: Seen) => boolean) => { const t0 = Date.now(); let s = await seen(p); while (!f(s) && Date.now() - t0 < WAIT) { await sleep(300); s = await seen(p); } check(what, f(s), s); };
const seats = campSeats(MAPS[0]);
const sit = async (p: Page, i: number) => {
  const s = seats[i];
  await p.evaluate((s) => { const g = (window as any).__game; g.teleport(s.x + 0.9 * Math.sin(s.facing), s.z + 0.9 * Math.cos(s.facing)); g.look(s.facing, -0.2); }, s);
  await p.waitForFunction(() => (window as any).__game.player().near?.startsWith('Sit down'), { timeout: WAIT });
  const prompt = await p.evaluate(() => (window as any).__game.player().near);
  await p.evaluate(() => (window as any).__game.interact());
  await p.waitForFunction(() => (window as any).__game.emoteState().id === 'sit', { timeout: WAIT });
  return prompt as string;
};
const watch = async (p: Page, i: number, file: string) => {
  const s = seats[i];
  // In front of the seat and a little to one side, looking at the sitter.
  const [x, z] = [s.x + 2.2 * Math.sin(s.facing) + 1.2 * Math.cos(s.facing), s.z + 2.2 * Math.cos(s.facing) - 1.2 * Math.sin(s.facing)];
  await p.evaluate((a) => { const g = (window as any).__game; g.teleport(a.x, a.z); g.look(Math.atan2(-(a.tx - a.x), -(a.tz - a.z)), -0.25); }, { x, z, tx: s.x, tz: s.z });
  await sleep(4000);
  await p.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 86 });
  console.log(`wrote ${path.relative(process.cwd(), path.join(OUT, file))}`);
};
const up = async (p: Page) => { await p.evaluate(() => (window as any).__game.key('KeyS', true)); await p.waitForFunction(() => (window as any).__game.emoteState().id === null, { timeout: WAIT }); await p.evaluate(() => (window as any).__game.key('KeyS', false)); };
const all = [true, true, true, true, true, true];
const noBanjo = [false, true, true, true, true, true];
const same = (a: boolean[], b: boolean[]) => a.join() === b.join();
try {
  const ann = await join('Ann');
  const bob = await join('Bob');
  await until(bob, '1. nobody seated: all six instruments stand by their logs, none in hand', (s) => same(s.stands, all) && s.held === 0);
  const prompt = await sit(ann, 0);
  check("2a. the banjo log's prompt", prompt === 'Sit down · play the banjo', prompt);
  await until(ann, '2b. Ann seated: on her own screen the banjo is off its stand and in her hands', (s) => same(s.stands, noBanjo) && s.held === 1);
  await until(bob, '2c. Bob, who was there, sees the banjo off its stand and in her avatar\'s hands', (s) => same(s.stands, noBanjo) && s.held === 1);
  await watch(bob, 0, 'g-real-bob-sees-ann.jpg');
  const cat = await join('Cat');
  await until(cat, '3. Cat, who joined while Ann played, sees the same', (s) => same(s.stands, noBanjo) && s.held === 1);
  await watch(cat, 0, 'g-real-cat-joined-late.jpg');
  await sit(bob, 1);
  await until(ann, '4a. Bob on the same log: two banjos in hand on Ann\'s screen (her own and his avatar\'s)', (s) => same(s.stands, noBanjo) && s.held === 2);
  await until(cat, '4b. ...and on Cat\'s', (s) => same(s.stands, noBanjo) && s.held === 2);
  await watch(cat, 0, 'g-real-two-on-a-log.jpg');
  await up(ann);
  await until(cat, '5a. Ann up, Bob still playing: one banjo in hand, none on the stand', (s) => same(s.stands, noBanjo) && s.held === 1);
  await up(bob);
  await until(cat, '5b. both up: the banjo is back by its log on Cat\'s screen', (s) => same(s.stands, all) && s.held === 0);
  await until(ann, '5c. ...and on Ann\'s', (s) => same(s.stands, all) && s.held === 0);
  await watch(cat, 0, 'g-real-after.jpg');
} catch (e) { check('ran to the end', false, String(e)); }
await Promise.all(browsers.map((b) => b.close())); await vite.close(); kill();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);

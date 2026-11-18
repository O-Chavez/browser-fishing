// All six instruments of the campfire band played by REAL players over the network: a seeded server (its own, on a
// throwaway data folder; ports 4181 and 4182, or BAND_SIX_PORT / BAND_SIX_VITE_PORT), one watcher and six real
// headless players, each of whom walks to a different fire log (in `CAMP.logs.at` order: banjo, drum, squeezebox,
// whistle, washboard, jug) and sits through the real sit path (the prompt and `interact()`; no `__game.bandFakes`).
// For each instrument, on the player's own screen and on the watcher's: the instrument's stand is empty, one
// instrument is in hand and its parts are the ones the instrument's own models are made of, and its part is
// sounding (`__game.band()`'s mask has that bit and no other); getting up empties the hand, puts the instrument
// back on its stand and stops the part. First one instrument at a time, then all six seated together (and getting
// up together). Prints PASS/FAIL per assertion and a total, exits non-zero on a failure.
//
//   CHROME_PATH=... npx tsx scripts/band-six.ts
//
// What "in hand" means is what scripts/band-seen.ts reads: the meshes drawn with the instruments' one material that
// are visible and not the town's own. "Right instrument" is read from those meshes' geometry sizes against the six
// builders' (`buildInstrument`). "Sounding" is the band's mask on that screen; the sound itself is band-audio.ts's.
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
const VITE_PORT = Number(process.env.BAND_SIX_VITE_PORT) || 4182, SERVER_PORT = Number(process.env.BAND_SIX_PORT) || 4181, WAIT = 240_000;
const NAMES = ['banjo', 'drum', 'squeezebox', 'whistle', 'washboard', 'jug'];
const PLAYERS = ['Ann', 'Bob', 'Cat', 'Dan', 'Eve', 'Fay'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let fails = 0, total = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { total++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fishing-band-six-'));
const token = (n: string) => `${n}-six-token-0123456789abcdef`;
const account = (name: string) => ({ name, hash: createHash('sha256').update(token(name)).digest('hex'), save: { ...newSave(), level: 22, tips: [...TIP_IDS], held: 4 } });
fs.writeFileSync(path.join(dataDir, 'accounts.json'), JSON.stringify(Object.fromEntries([...PLAYERS, 'Wat'].map((n) => [n.toLowerCase(), account(n)]))));
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
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 480, height: 270 }, protocolTimeout: 600_000 });
  browsers.push(browser);
  const page = (await browser.pages())[0] ?? (await browser.newPage());
  page.on('pageerror', (e) => { fails++; total++; console.error(`${name}: ${e.message}`); });
  page.setDefaultTimeout(WAIT);
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await page.evaluateOnNewDocument((t) => { localStorage.setItem('fishing-token', t); localStorage.setItem('fishing-news', String(Number.MAX_SAFE_INTEGER)); }, token(name));
  await page.goto(`http://localhost:${VITE_PORT}/?name=${name}&room=six`, { waitUntil: 'load', timeout: 600_000 });
  await page.waitForFunction(() => (window as any).__game?.online(), { timeout: 600_000 });
  await page.evaluate(() => (window as any).__game.activate());
  await page.addStyleTag({ content: '#hud, #crosshair, #toast, #banner, #tip, #guide, #chat { display: none !important; }' });
  // The instruments' one material, and each instrument's meshes' geometry sizes (mm), from the game's own module.
  await page.evaluate(`(async () => {
    const m = await import('/src/game/instruments.ts');
    window.__paint = m.buildInstrument('jug').group.children[0].material;
    const sizes = (g) => { const out = []; g.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); const s = o.geometry.boundingBox.getSize(new o.position.constructor()); out.push([s.x, s.y, s.z].map((v) => Math.round(v * 1000)).join('x')); } }); return out; };
    window.__sigs = Object.fromEntries(${JSON.stringify(NAMES)}.map((n) => [n, sizes(m.buildInstrument(n).group)]));
    window.__counts = Object.fromEntries(${JSON.stringify(NAMES)}.map((n) => { let c = 0; m.buildInstrument(n).group.traverse((o) => { if (o.isMesh && o.material === window.__paint) c++; }); return [n, c]; }));
  })()`);
  return page;
}
type Seen = { stands: boolean[]; held: number; kinds: string[]; mask: number; sounding: number };
/** What a screen shows of the band: which stands are visible, how many instruments are in hand and of which kinds (every mesh in hand belongs to that kind's builder), and the band's mask and what sounds. */
const seen = (p: Page) => p.evaluate(() => {
  const w = window as any, G = w.__game, town = G.world.town;
  const heldMeshes: any[] = [];
  G.world.scene.traverse((o: any) => {
    if (!o.isMesh || o.material !== w.__paint) return;
    let shown = true, inTown = false, grown = true;
    for (let q = o; q; q = q.parent) { if (!q.visible) shown = false; if (q === town.group) inTown = true; if (q.scale.x === 0) grown = false; }
    if (shown && grown && !inTown) heldMeshes.push(o);
  });
  const sig = (o: any) => { o.geometry.computeBoundingBox(); const s = o.geometry.boundingBox.getSize(o.position.clone()); return [s.x, s.y, s.z].map((v: number) => Math.round(v * 1000)).join('x'); };
  const perKind: Record<string, number> = {};
  for (const o of heldMeshes) { const s = sig(o); const owners = Object.keys(w.__sigs).filter((n) => w.__sigs[n].includes(s)); const k = owners.length === 1 ? owners[0] : `?${owners.join('|')}`; perKind[k] = (perKind[k] ?? 0) + 1; }
  const kinds = new Set(Object.keys(perKind));
  // An instrument may be several meshes (the squeezebox's ends and bellows): count instruments, not meshes.
  const held = Object.entries(perKind).reduce((n, [k, c]) => n + c / (w.__counts[k] || 1), 0);
  const b = G.band();
  return { stands: town.instruments.map((g: any) => g.visible), held, kinds: [...kinds].sort(), mask: b.mask, sounding: b.audio.sounding };
}) as Promise<Seen>;
const until = async (p: Page, what: string, f: (s: Seen) => boolean) => { await p.bringToFront(); const t0 = Date.now(); let s = await seen(p); while (!f(s) && Date.now() - t0 < WAIT) { await sleep(300); s = await seen(p); } check(what, f(s), s); };
const seats = campSeats(MAPS[0]);
// Walk to the log's seat through the real path: stand in front of it, look at it, wait for the prompt, press the key.
const sit = async (p: Page, log: number, side: 0 | 1 = 0) => {
  const s = seats[log * 2 + side];
  await p.bringToFront();
  await p.evaluate((s) => { const g = (window as any).__game; g.teleport(s.x + 0.9 * Math.sin(s.facing), s.z + 0.9 * Math.cos(s.facing)); g.look(s.facing, -0.2); }, s);
  await p.waitForFunction((n) => (window as any).__game.player().near === `Sit down · play the ${n}`, { timeout: WAIT }, NAMES[log]);
  await p.evaluate(() => (window as any).__game.interact());
  await p.waitForFunction(() => (window as any).__game.emoteState().id === 'sit', { timeout: WAIT });
};
const up = async (p: Page) => { await p.bringToFront(); await p.evaluate(() => (window as any).__game.key('KeyS', true)); await p.waitForFunction(() => (window as any).__game.emoteState().id === null, { timeout: WAIT }); await p.evaluate(() => (window as any).__game.key('KeyS', false)); };
/** What a screen shows when exactly the logs in `on` have a player seated: their stands empty, one instrument of each kind in hand, exactly their parts sounding. */
const shows = (on: number[]) => (s: Seen) => {
  const mask = on.reduce((m, i) => m | (1 << i), 0);
  return s.stands.every((v, i) => v === !on.includes(i)) && s.held === on.length && s.kinds.join() === on.map((i) => NAMES[i]).sort().join() && s.mask === mask && s.sounding === mask;
};
try {
  const players: Page[] = [];
  for (const n of PLAYERS) players.push(await join(n));
  const wat = await join('Wat');
  // The watcher stands where it looks over the whole ring, off the logs.
  await wat.evaluate(() => { const g = (window as any).__game; g.teleport(20.5, 9.5); g.look(Math.PI, -0.1); });
  await until(wat, '0. nobody seated: every stand full, nothing in hand, nothing sounding', shows([]));
  for (let i = 0; i < 6; i++) {
    const n = NAMES[i];
    await sit(players[i], i);
    await until(players[i], `${i + 1}a. ${PLAYERS[i]} sits at the ${n}'s log: on their own screen the ${n} is in hand, its stand is empty, only its part sounds`, shows([i]));
    await until(wat, `${i + 1}b. ...on the watcher's screen: the ${n} in ${PLAYERS[i]}'s avatar's hands, its part sounding`, shows([i]));
    await up(players[i]);
    await until(players[i], `${i + 1}c. ${PLAYERS[i]} gets up: on their own screen the ${n} is back on its stand, nothing sounds`, shows([]));
    await until(wat, `${i + 1}d. ...on the watcher's screen`, shows([]));
  }
  const all: number[] = [];
  for (let i = 0; i < 6; i++) {
    await sit(players[i], i);
    all.push(i);
    await until(wat, `7.${i + 1} all together: ${PLAYERS[i]} sits at the ${NAMES[i]}'s log; the watcher sees ${all.map((j) => NAMES[j]).join(', ')} in hand and sounding`, shows(all));
  }
  for (let i = 0; i < 6; i++) await until(players[i], `8.${i + 1} all six seated: ${PLAYERS[i]}'s own screen shows all six in hand and sounding`, shows(all));
  for (let i = 5; i >= 0; i--) {
    await up(players[i]);
    all.pop();
    await until(wat, `9.${6 - i} ${PLAYERS[i]} gets up: the watcher sees ${all.length ? all.map((j) => NAMES[j]).join(', ') : 'nothing'} left`, shows(all));
  }
  for (let i = 0; i < 6; i++) await until(players[i], `10.${i + 1} all up: ${PLAYERS[i]}'s own screen is quiet and every stand is full`, shows([]));
} catch (e) { check('ran to the end', false, String(e)); }
await Promise.all(browsers.map((b) => b.close())); await vite.close(); kill();
console.log(`${total - fails} of ${total} passed${fails ? `, ${fails} FAILED` : ''}`);
process.exit(fails ? 1 : 0);

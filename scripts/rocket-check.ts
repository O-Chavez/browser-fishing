// The fireworks, played with real players (GAME_DESIGN.md §41): three headless players on a seeded server (its own,
// on a throwaway data folder; ports 4302 and 5312). Ann has coins, Bob has two rockets and no coins, Cat is in the
// casino. Checks Bram's counter and its prices, buying, the plaque, the rack's three prompts, the card that picks a
// rocket, that Bob far off sees and hears Ann's rocket from the same seed, that the sky is busy for Bob while it is
// up, the Grand Finale's line on both screens, that Cat in the casino gets nothing, that the bag is the server's
// when a player joins again, and the sound's level near and far. Prints PASS/FAIL per check and a total; exits non-zero on a failure.
//
//   CHROME_PATH=... npx tsx scripts/rocket-check.ts          (on Linux add CHROMIUM_WEBGL_RENDERER=lavapipe)
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';
import { createServer } from 'vite';
import { MAPS } from '../src/data/maps';
import { TIP_IDS } from '../src/game/tips';
import { newSave } from '../src/game/state';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = Number(process.env.ROCKET_PORT ?? 5312), SERVER_PORT = Number(process.env.ROCKET_SERVER_PORT ?? 4302), WAIT = 180_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let fails = 0, total = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { total++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fishing-rocket-'));
const token = (n: string) => `${n}-rocket-token-0123456789abcdef`;
const account = (name: string, save: object) => ({ name, hash: createHash('sha256').update(token(name)).digest('hex'), save: { ...newSave(), level: 60, tips: [...TIP_IDS], held: 4, ...save } });
fs.writeFileSync(path.join(dataDir, 'accounts.json'), JSON.stringify({
  ann: account('Ann', { coins: 60_000 }),
  bob: account('Bob', { coins: 100, rockets: { small: 2 } }),
  cat: account('Cat', { coins: 60_000, location: 'casino' }),
}));
const server = spawn('npx', ['tsx', 'server/index.ts'], { env: { ...process.env, DATA_DIR: dataDir, PORT: String(SERVER_PORT), DATABASE_URL: '', DISCORD_FEEDBACK_WEBHOOK: '', DISCORD_JOINS_WEBHOOK: '', DISCORD_TIPS_WEBHOOK: '', TEST_HOOKS: '1' }, stdio: ['ignore', 'pipe', 'inherit'], detached: true });
const kill = () => { try { process.kill(-server.pid!, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', kill);
await new Promise<void>((res) => server.stdout!.on('data', (d) => /fishing server on port/.test(String(d)) && res()));
process.env.VITE_SERVER_URL = `ws://localhost:${SERVER_PORT}`;
const vite = await createServer({ server: { port: VITE_PORT, strictPort: true, hmr: false, watch: null }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'], protocolTimeout: 600_000 });
async function join(name: string, w = 640, h = 360): Promise<Page> {
  const page = await (await browser.createBrowserContext()).newPage();
  page.on('pageerror', (e) => { fails++; console.error(`${name}: ${e.message}`); });
  if (process.env.ROCKET_DEBUG) page.on('console', (m) => console.error(`${name} console ${m.type()}: ${m.text().slice(0, 200)}`));
  page.setDefaultTimeout(WAIT);
  await page.setViewport({ width: w, height: h });
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  if (process.env.ROCKET_DEBUG) await page.evaluateOnNewDocument(() => { const W = WebSocket; (window as any).WebSocket = class extends W { constructor(u: string) { super(u); console.log('ws open to', u); this.addEventListener('close', (e) => console.log('ws close', e.code, e.reason)); this.addEventListener('error', () => console.log('ws error')); this.addEventListener('message', (e) => console.log('ws msg', String(e.data).slice(0, 60))); } }; });
  await page.evaluateOnNewDocument((t) => { localStorage.setItem('fishing-token', t); localStorage.setItem('fishing-news', String(Number.MAX_SAFE_INTEGER)); }, token(name));
  await page.goto(`http://localhost:${VITE_PORT}/?name=${name}&room=rockets`, { waitUntil: 'load', timeout: 300_000 });
  try { await page.waitForFunction(() => (window as any).__game?.online(), { timeout: 120_000 }); } catch (e) { console.error(`${name} never came online:`, await page.evaluate(() => [...document.querySelectorAll('#join, #offline, #resume, #toast, #notice')].map((el) => `${el.id}${el.classList.contains('hidden') ? ' (hidden)' : ''}: ${(el.textContent ?? '').replace(/\s+/g, ' ').slice(0, 160)}`))); throw e; }
  await page.evaluate(() => (window as any).__game.activate());
  console.log(`INFO  ${name} joined`);
  return page;
}
type Sky = { up: { kind: string; seed: number; at: number; by: number; name: string } | null; busy: boolean; drawn: boolean; particles: number; t: number | null; seen: number; sounds: number; gain: number; sound: boolean };
const sky = (p: Page) => p.evaluate(() => (window as any).__game.rocket()) as Promise<Sky>;
const bag = (p: Page) => p.evaluate(() => { const s = (window as any).__game.s; return { coins: s.coins as number, rockets: { ...s.rockets } as Record<string, number> }; });
const near = (p: Page) => p.evaluate(() => (window as any).__game.player().near as string | null);
const frames = (p: Page, n = 3) => p.evaluate((n) => new Promise<void>((done) => { let k = 0; const f = () => (++k > n ? done() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
/** Waits for something to become true on a page (polled, since software GL draws a few frames a second); false on a timeout. */
const until = async (p: Page, f: () => Promise<boolean>, ms = 30_000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await sleep(100); } return false; };
const yawTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z));
const stand = async (p: Page, x: number, z: number, tx: number, tz: number, pitch = -0.15) => {
  await p.bringToFront();
  await p.evaluate((x, z, yaw, pitch) => { const g = (window as any).__game; g.teleport(x, z); g.look(yaw, pitch); }, x, z, yawTo(x, z, tx, tz), pitch);
  await sleep(400);
  await frames(p, 4);
};
const CAMP = MAPS[0].camp!, FIRE = MAPS[0].campfire, RACK = CAMP.rack;
const atRack = (p: Page) => stand(p, RACK.x - 0.3, RACK.z + 1.7, RACK.x, RACK.z, -0.25);
const atStall = (p: Page) => stand(p, FIRE.x + 3.9, FIRE.z, CAMP.stall.x, CAMP.stall.z, -0.05);
const atPier = (p: Page) => stand(p, 0.8, -7.4, 4, -30, 0.5);
const prompt = async (p: Page, want: string) => { const ok = await until(p, async () => (await near(p)) === want); return [ok, await near(p)] as const; };
/** Presses a button of the menu: found and clicked in one step, since the menu is redrawn whenever the save changes. */
const tap = async (p: Page, sel: string) => { await p.waitForSelector(sel); await p.evaluate((sel) => (document.querySelector(sel) as HTMLElement).click(), sel); };
const menuShut = (p: Page) => p.evaluate(() => document.getElementById('menu')!.classList.contains('hidden'));
type Notes = { shows: { up: NonNullable<Sky['up']>; drawn: boolean; particles: number; hash: number }[]; toasts: string[]; waited: number; pressable: number; prompts: string[]; sent: number };
/**
 * Starts a page keeping notes from now on, 20 times a second: each rocket it is told of (with what is drawn of it),
 * every toast, and what the rack's prompt read while a rocket was up. With `send`, it asks the server to light one of
 * that kind the moment it first sees a rocket up.
 */
const watch = (p: Page, send: string | null = null) => p.evaluate((send) => {
  const w = window as any;
  clearInterval(w.__iv);
  const n = (w.__notes = { shows: [], toasts: [], waited: 0, pressable: 0, prompts: [], sent: 0 } as any);
  const g = w.__game;
  let seen = g.rocket().seen;
  w.__iv = setInterval(() => {
    const r = g.rocket();
    if (r.seen > seen && r.up) {
      seen = r.seen;
      const fw = g.world.fireworks;
      let h = 0;
      for (const name of ['aP0', 'aV', 'aT', 'aC', 'aS']) { const a = fw.mesh.geometry.getAttribute(name); const m = fw.particles * a.itemSize; for (let i = 0; i < m; i++) h = (Math.imul(h, 31) + Math.round(a.array[i] * 1000)) | 0; }
      n.shows.push({ up: r.up, drawn: r.drawn, particles: r.particles, hash: h });
      if (send && !n.sent) { n.sent = 1; g.rocketSend(send); }
    }
    const toast = document.getElementById('toast')!;
    const t = toast.classList.contains('show') ? (toast.textContent ?? '') : '';
    if (t && !n.toasts.includes(t)) n.toasts.push(t);
    if (r.busy) {
      const el = document.getElementById('prompt')!;
      const label = el.classList.contains('hidden') ? '' : (el.textContent ?? '');
      if (label === 'Wait for the sky' && el.classList.contains('info')) n.waited++;
      // The prompt is redrawn with the next frame, so until then it may still read as it did before the rocket went up.
      else if (/Light a rocket/.test(label)) { if (n.waited) n.pressable++; }
      else if (!n.prompts.includes(label)) n.prompts.push(label);
    }
  }, 50);
}, send);
const notes = (p: Page) => p.evaluate(() => (window as any).__notes) as Promise<Notes>;
const text = (p: Page, sel: string) => p.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent ?? '').join(' | '), sel);

try {
  const ann = await join('Ann');
  const bob = await join('Bob');
  const cat = await join('Cat', 240, 135);
  check('0. Cat joined in the casino', (await cat.evaluate(() => (window as any).__game.s.location)) === 'casino');

  // 1. Bram's counter.
  await atStall(ann);
  let [ok, got] = await prompt(ann, 'Talk to Bram Tinder · rockets');
  check('1a. at the counter, facing Bram: "Talk to Bram Tinder · rockets"', ok, got ?? 'no prompt');
  await ann.evaluate(() => (window as any).__game.interact());
  await ann.waitForSelector('.reed.bram');
  const say = await text(ann, '.reed.bram .say');
  const lines = MAPS[0].town.npcs.find((n) => n.name === 'Bram Tinder')!;
  check('1b. the counter opens led by one of his lines', [...lines.lines, ...(lines.nightLines ?? [])].some((l) => say.includes(l)), say);
  const tiles = await ann.evaluate(() => [...document.querySelectorAll('.reed.bram .tile')].map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()));
  check('1c. three rockets on sale: Small Rocket 250, Big Rocket 2,000, Grand Finale 50,000', tiles.length === 3 && /Small Rocket.*250/.test(tiles[0]) && /Big Rocket.*2,000/.test(tiles[1]) && /Grand Finale.*50,000/.test(tiles[2]), tiles);
  check('1d. the same menu as the other vendors: Bram\'s name and the coins to spend on its head', /Bram's Kettle/.test(await text(ann, '#menu-who')) && /60,000/.test(await text(ann, '#menu-who')), await text(ann, '#menu-who'));

  // 2. Buying.
  await tap(ann, '[data-act="buyrocket"][data-id="small"]');
  ok = await until(ann, async () => { const b = await bag(ann); return b.coins === 59_750 && b.rockets.small === 1; });
  check('2a. Ann buys a Small Rocket: 250 coins, one in the bag', ok, await bag(ann));
  await tap(ann, '[data-act="buyrocket"][data-id="small"]');
  ok = await until(ann, async () => (await bag(ann)).rockets.small === 2 && (await bag(ann)).coins === 59_500);
  check('2b. a second one stacks', ok, await bag(ann));
  check('2c. the tile counts them', /×2 in your bag/.test(await text(ann, '.reed.bram .tile.sel')), await text(ann, '.reed.bram .tile.sel'));
  await tap(ann, '[data-pick="rocket"][data-id="finale"]');
  await tap(ann, '[data-act="buyrocket"][data-id="finale"]');
  ok = await until(ann, async () => { const b = await bag(ann); return b.coins === 9500 && b.rockets.finale === 1; });
  check('2d. and a Grand Finale for 50,000', ok, await bag(ann));
  const need = await ann.evaluate(() => { const b = document.querySelector('.reed.bram .actions .btn') as HTMLButtonElement; return [b.disabled, b.textContent]; });
  check('2e. with 9,500 left the button reads "Need 50,000" and can\'t be pressed', need[0] === true && /Need 50,000/.test(String(need[1])), need);
  await ann.evaluate(() => (window as any).__game.closeMenu());
  // Bob has 100 coins: the server refuses whatever his client sends.
  await atStall(bob);
  await bob.evaluate(() => (window as any).__game.interact());
  await bob.waitForSelector('.reed.bram');
  const bobBtn = await bob.evaluate(() => { const b = document.querySelector('.reed.bram .actions .btn') as HTMLButtonElement; return [b.disabled, b.textContent]; });
  check('2f. Bob, with 100 coins, sees "Need 250"', bobBtn[0] === true && /Need 250/.test(String(bobBtn[1])), bobBtn);
  await bob.evaluate(() => (window as any).__game.rocketSend('small', true));
  await sleep(800);
  check('2g. and still has 100 coins and his two rockets', JSON.stringify(await bag(bob)) === JSON.stringify({ coins: 100, rockets: { small: 2 } }), await bag(bob));
  await bob.evaluate(() => (window as any).__game.closeMenu());

  // 3. The plaque.
  // A canvas can't be read back as words, so this reads the one place the plaque is written (the stall's builder) and
  // that nothing writes over it; the picture is scripts/rocket-views.ts plaque.
  const camp = fs.readFileSync('src/game/camp.ts', 'utf8'), town = fs.readFileSync('src/game/town.ts', 'utf8');
  const written = [...camp.matchAll(/writePlaque\(plaque\.ctx, plaque\.tex, '([^']*)'\)/g)].map((m) => m[1]);
  check('3. the counter\'s plaque is written once, "Light it on the jetty", and nothing says "Rockets soon"', written.length === 1 && written[0] === 'Light it on the jetty' && !/writePlaque\(stall/.test(town) && !/Rockets soon/.test(camp + town), written);

  // 4. The rack's prompts.
  await atRack(ann);
  [ok, got] = await prompt(ann, 'Light a rocket');
  check('4a. Ann at the rack with rockets: "Light a rocket"', ok, got ?? 'no prompt');
  check('4b. with the E to press', /^E\s*Light a rocket$/.test((await text(ann, '#prompt')).trim()) && !(await ann.evaluate(() => document.getElementById('prompt')!.classList.contains('info'))), await text(ann, '#prompt'));
  await stand(ann, RACK.x - 0.3, RACK.z + 1.7, RACK.x, RACK.z + 8, -0.25);
  ok = await until(ann, async () => (await near(ann)) !== 'Light a rocket', 8000);
  check('4c. with her back to it: no rack prompt', ok, (await near(ann)) ?? 'no prompt');
  // Two kinds in her bag: the card.
  await atRack(ann);
  await prompt(ann, 'Light a rocket');
  await ann.evaluate(() => (window as any).__game.interact());
  await ann.waitForSelector('.dcard.rack');
  const cards = await ann.evaluate(() => [...document.querySelectorAll('.dcard.rack [data-act="lightrocket"]')].map((e) => `${(e as HTMLElement).dataset.id}: ${(e.textContent ?? '').replace(/\s+/g, ' ').trim()}`));
  check('4d. two kinds in the bag: a card with a button for each', cards.length === 2 && /^small: .*Small Rocket.*×2/.test(cards[0]) && /^finale: .*Grand Finale.*×1/.test(cards[1]), cards);
  check('4e. nothing lit yet', !(await sky(ann)).busy && (await sky(bob)).seen === 0);

  // 5. Ann lights the small one from the card; Bob, far off on the pier, sees it. Headless frames are slow, so each
  // page keeps its own notes as things happen (`watch`), and the checks read them afterwards.
  await atPier(bob);
  await watch(bob);
  await watch(ann);
  await ann.bringToFront();
  await tap(ann, '.dcard.rack [data-act="lightrocket"][data-id="small"]');
  ok = await until(ann, async () => (await notes(ann)).shows.length === 1 && (await notes(bob)).shows.length === 1 && !(await sky(ann)).busy, 60_000);
  let na = await notes(ann), nb = await notes(bob);
  const a1 = na.shows[0], b1 = nb.shows[0];
  check('5a. Ann picks the Small Rocket: it is in her sky', ok && a1?.up.kind === 'small' && a1.drawn && a1.particles > 100, a1);
  check('5b. Bob on the pier has the same rocket: kind, seed, moment and who lit it', !!b1 && JSON.stringify(b1.up) === JSON.stringify(a1.up) && b1.up.name === 'Ann', b1?.up ?? 'nothing');
  check('5c. drawn on his screen from the same particles', !!b1 && b1.drawn && b1.particles === a1.particles && b1.hash === a1.hash, { ann: [a1?.particles, a1?.hash], bob: [b1?.particles, b1?.hash] });
  ok = await until(ann, async () => (await bag(ann)).rockets.small === 1, 10_000);
  check('5d. the rocket left Ann\'s bag', ok, await bag(ann));
  check('5e. the card closed', await menuShut(ann));
  await frames(ann, 3); await bob.bringToFront(); await frames(bob, 3);
  const a1b = await sky(ann), b1b = await sky(bob);
  check('5f. 2.5 s after it was lit the sky is clear on both screens', !a1b.busy && !a1b.drawn && !b1b.busy && !b1b.drawn, { ann: a1b.drawn, bob: b1b.drawn });
  console.log('INFO  5g. sounds scheduled for the small rocket (a whoosh and a boom; software GL may draw no frame in its 2.5 s):', JSON.stringify({ ann: [a1b.sounds, +a1b.gain.toFixed(3)], bob: [b1b.sounds, +b1b.gain.toFixed(3)] }));

  // 6. No rockets: the rack tells where to get one.
  await ann.evaluate(() => { const g = (window as any).__game; (window as any).__bag = { ...g.s.rockets }; g.s.rockets = {}; });
  await atRack(ann);
  [ok, got] = await prompt(ann, "Rockets at Bram's Kettle");
  check('6a. with no rocket in the bag: "Rockets at Bram\'s Kettle"', ok, got ?? 'no prompt');
  const info = await ann.evaluate(() => [document.getElementById('prompt')!.classList.contains('info'), document.getElementById('prompt')!.textContent]);
  check('6b. nothing to press: no E on it', info[0] === true && info[1] === "Rockets at Bram's Kettle", info);
  await ann.evaluate(() => (window as any).__game.interact());
  await sleep(600);
  check('6c. pressing E there does nothing', (await sky(ann)).seen === 1 && (await menuShut(ann)));

  // 7. The Grand Finale: the sky is busy for Bob, and both read who lit it. Ann's client holds only the finale, so E
  // lights it with no card (the server's bag still has her Small Rocket).
  await ann.evaluate(() => { (window as any).__game.s.rockets = { finale: 1 }; });
  await atRack(bob);
  [ok, got] = await prompt(bob, 'Light a rocket');
  check('7a. Bob at the rack with his two Small Rockets: "Light a rocket"', ok, got ?? 'no prompt');
  await atRack(ann);
  await prompt(ann, 'Light a rocket');
  // Bob's page tries to light one of his the moment it sees the finale up, whatever his prompt says.
  await watch(bob, 'small');
  await watch(ann);
  await ann.evaluate(() => (window as any).__game.interact());
  ok = await until(ann, async () => (await notes(ann)).shows.length === 1 && (await notes(bob)).shows.length === 1, 60_000);
  check('7b. one kind in the bag: E lights it straight away, no card', ok && (await notes(ann)).shows[0]?.up.kind === 'finale' && (await menuShut(ann)), (await notes(ann)).shows[0]?.up ?? 'nothing');
  // Let the 12 s run out on both pages, each drawing in turn.
  for (let i = 0; i < 40 && ((await sky(ann)).busy || (await sky(bob)).busy); i++) { await (i % 2 ? ann : bob).bringToFront(); await sleep(1500); }
  await ann.bringToFront(); await frames(ann, 4); await bob.bringToFront(); await frames(bob, 4);
  na = await notes(ann); nb = await notes(bob);
  check('7c. Ann reads "Ann lit a Grand Finale!"', na.toasts.some((t) => /Ann lit a Grand Finale!/.test(t)), na.toasts);
  check('7d. so does Bob', nb.toasts.some((t) => /Ann lit a Grand Finale!/.test(t)), nb.toasts);
  check('7e. and it is a line in both chat windows', /Ann lit a Grand Finale!/.test(await text(ann, '.chat-line.sys')) && /Ann lit a Grand Finale!/.test(await text(bob, '.chat-line.sys')), await text(bob, '.chat-line.sys'));
  check('7f. while it was up Bob\'s prompt read "Wait for the sky", with nothing to press, from the first frame after it was lit', nb.waited > 0 && nb.pressable === 0, { samples: nb.waited, pressable: nb.pressable, other: nb.prompts });
  check('7g. the server refused the rocket his page sent anyway', nb.sent === 1 && nb.toasts.some((t) => /Wait for the sky/.test(t)) && nb.shows.length === 1, nb.toasts);
  check('7h. and Bob kept both of his', (await bag(bob)).rockets.small === 2 && (await sky(bob)).seen === 2, await bag(bob));
  check('7i. Ann, who lit it, waited too', na.waited > 0 && na.pressable === 0, { samples: na.waited, other: na.prompts });
  const fa = na.shows[0], fb = nb.shows[0];
  check('7j. the finale on Bob\'s screen: thousands of particles, inside the budget, the same as Ann\'s', !!fb && fb.particles > 2500 && fb.particles < 4096 && fb.particles === fa.particles && fb.hash === fa.hash, { ann: [fa?.particles, fa?.hash], bob: [fb?.particles, fb?.hash] });
  // 8. Sound.
  const sa = await sky(ann), sb = await sky(bob);
  check('8a. both pages scheduled the finale\'s sounds as it ran (a whoosh and a boom for each burst, unless a slow frame skipped one)', sa.sounds >= 6 && sb.sounds >= 6, { ann: sa.sounds, bob: sb.sounds });
  check('8b. at a gain under 1 for the distance, with the sound switch on', sb.gain > 0.05 && sb.gain < 1 && sb.sound, { gain: +sb.gain.toFixed(3) });
  [ok, got] = await prompt(bob, 'Light a rocket');
  check('7k. once the 12 s are over the rack is free again: "Light a rocket", with no other wait, and the sky is clear', ok && !(await sky(bob)).drawn && !(await sky(ann)).drawn, got ?? 'no prompt');
  // Bob lights one of his: Ann sees Bob's.
  await watch(ann);
  await bob.evaluate(() => (window as any).__game.interact());
  ok = await until(ann, async () => (await notes(ann)).shows.length === 1, 30_000);
  na = await notes(ann);
  check('7l. Bob lights a Small Rocket and Ann sees his', ok && na.shows[0]?.up.kind === 'small' && na.shows[0]?.up.name === 'Bob', na.shows[0]?.up ?? 'nothing');
  check('7m. no finale line for a small one', !/Bob lit/.test(await text(ann, '.chat-line.sys')));
  ok = await until(bob, async () => (await bag(bob)).rockets.small === 1, 10_000);
  check('7n. one left in Bob\'s bag', ok, await bag(bob));

  // 9. Cat in the casino.
  await cat.bringToFront();
  await frames(cat, 3);
  const c = await sky(cat);
  check('9a. Cat in the casino was told of no rocket', c.seen === 0 && c.up === null && !c.drawn, c);
  check('9b. and reads no line about one', !/lit a/.test(await text(cat, '.chat-line')) && !/lit a/.test(await text(cat, '#toast')), await text(cat, '.chat-line.sys'));

  // 10. The bag is the server's: Ann joins again on a fresh page.
  await until(ann, async () => !(await sky(ann)).busy, 20_000);
  await bob.close(); await cat.close(); await ann.close();
  const again = await join('Ann');
  const after = await bag(again);
  check('10. when Ann joins again her bag is what the server kept: 9,500 coins, one Small Rocket, the finale gone', after.coins === 9500 && JSON.stringify(after.rockets) === JSON.stringify({ small: 1 }), after);
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'accounts.json'), 'utf8')) as Record<string, { save: { coins: number; rockets?: object } }>;
  console.log('INFO  accounts.json on the server\'s disk (written on its own timer):', JSON.stringify({ ann: [saved.ann.save.coins, saved.ann.save.rockets], bob: [saved.bob.save.coins, saved.bob.save.rockets] }));

  // 11. The sound itself: the finale rendered offline with the game's own code, near and far.
  const levels = await again.evaluate(async () => {
    const R = await import('/src/data/rockets.ts' as string), S = await import('/src/game/rocketsound.ts' as string);
    const show = R.rocketShow('finale', 20261117);
    const out: Record<string, number> = {};
    for (const [name, ear] of Object.entries({ jetty: { x: 18.5, y: 2.4, z: -9 }, terrace: { x: 20.5, y: 3.2, z: -2 }, pier: { x: 0.8, y: 2.4, z: -7.4 }, 'town gate': { x: 0, y: 2.4, z: 62 } })) {
      const ctx = new OfflineAudioContext(1, 48000 * 14, 48000);
      const noise = ctx.createBuffer(1, 48000 * 3, 48000);
      const d = noise.getChannelData(0);
      let a = 12345;
      for (let i = 0; i < d.length; i++) { a = (Math.imul(a, 1664525) + 1013904223) | 0; d[i] = a / 2147483648; }
      const master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(ctx.destination);
      for (const s of R.showSounds(show)) S.playShowSound(ctx, master, noise, s, ear, s.t);
      const buf = (await ctx.startRendering()).getChannelData(0);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
      out[name] = +(20 * Math.log10(Math.max(peak, 1e-9))).toFixed(1);
    }
    return out;
  });
  check('11a. the finale never clips at the master\'s level (peak under 0 dBFS at every spot)', Object.values(levels).every((v) => v < 0), levels);
  check('11b. and is quieter the further off: the town gate under the pier and the jetty', levels['town gate'] < levels.pier - 3 && levels['town gate'] < levels.jetty - 3, levels);
} catch (e) { check('ran to the end', false, String(e)); }
await browser.close(); await vite.close(); kill();
console.log(`${total - fails} of ${total} passed${fails ? `, ${fails} FAILED` : ''}`);
process.exit(fails ? 1 : 0);

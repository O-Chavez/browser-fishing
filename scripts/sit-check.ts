// Sitting, played with real players: two (and then a third and a fourth) headless players on a seeded server, one
// sitting on a camp log seat while the others watch. Checks what the step 1 review fixed:
//
//   1. an emote refused while seated (too soon after the last, not owned, while moving) leaves the player seated;
//   2. a player who joins, or arrives on the map (from the casino, or back from it), sees someone seated as seated;
//   3. a jump from a seat is a real jump, on the sitter's screen and on the watcher's;
//   4. a seat with another player on it is not offered.
//
//   npx tsx scripts/sit-check.ts [out dir]      (default .bench/sit/)
//
// Starts its own game server (SIT_PORT, default 8777) and Vite (SIT_VITE_PORT, default 5277) on a throwaway data
// folder. Prints PASS/FAIL per check, saves a screenshot per check from both players, exits non-zero on a failure.
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { createServer } from 'vite';
import { MAPS } from '../src/data/maps';
import { TIP_IDS } from '../src/game/tips';
import { newSave } from '../src/game/state';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = Number(process.env.SIT_VITE_PORT) || 5277;
const SERVER_PORT = Number(process.env.SIT_PORT) || 8777;
const OUT = path.resolve(process.argv[2] ?? '.bench/sit');
// Software GL draws a few frames a second, so everything waits on a condition with room to spare.
const WAIT = 60_000;
fs.mkdirSync(OUT, { recursive: true });

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
const errors: string[] = [];
const check = (name: string, ok: boolean, detail: unknown = ''): void => {
  const d = typeof detail === 'string' ? detail : JSON.stringify(detail);
  results.push({ name, ok, detail: d });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${d ? `  (${d})` : ''}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- server with seeded accounts ----------

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fishing-sit-'));
const token = (name: string) => `${name}-sit-token-0123456789abcdef`;
const account = (name: string, color: number, extra: object = {}) => ({
  name,
  hash: createHash('sha256').update(token(name)).digest('hex'),
  save: {
    ...newSave(),
    level: 22,
    coins: 5000,
    // All tips seen, so no tip box covers the shot; hand on an empty slot, so no rod in view.
    tips: [...TIP_IDS],
    held: 4,
    look: { ...newSave().look, color },
    ...extra,
  },
});
// Ann sits; Bob watches (and goes to the casino and back); Cat joins while Ann sits; Dan starts in the casino and walks over.
const accounts = {
  ann: account('Ann', 0xe86a5a),
  bob: account('Bob', 0x4a8fd6),
  cat: account('Cat', 0x7ac76a),
  dan: account('Dan', 0xf2c14e, { location: 'casino' }),
};
fs.writeFileSync(path.join(dataDir, 'accounts.json'), JSON.stringify(accounts));

// The server runs in its own process group (`detached`), as in smoke.ts: stopping only npx would leave it on the port.
let serverGroup: number | undefined;
const serverGroupAlive = (): boolean => {
  if (serverGroup === undefined) return false;
  try { process.kill(-serverGroup, 0); return true; } catch { return false; }
};
const signalServerGroup = (sig: NodeJS.Signals): void => {
  if (serverGroup === undefined) return;
  try { process.kill(-serverGroup, sig); } catch { /* already gone */ }
};
async function stopServer(): Promise<void> {
  signalServerGroup('SIGTERM');
  for (let i = 0; i < 20 && serverGroupAlive(); i++) await sleep(100);
  if (serverGroupAlive()) signalServerGroup('SIGKILL');
}
process.on('exit', () => { if (serverGroupAlive()) signalServerGroup('SIGKILL'); });
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(sig, () => void stopServer().then(() => process.exit(128 + os.constants.signals[sig])));
}
function waitForLine(proc: ChildProcess, re: RegExp): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('game server did not start')), 60_000);
    proc.stdout!.on('data', (b: Buffer) => { if (re.test(b.toString())) { clearTimeout(timer); resolve(); } });
    proc.on('exit', (c) => reject(new Error(`game server exited (${c})`)));
  });
}

const server = spawn('npx', ['tsx', 'server/index.ts'], {
  // TEST_HOOKS: the test hook's teleports get past the server's move check.
  env: { ...process.env, DATA_DIR: dataDir, PORT: String(SERVER_PORT), DATABASE_URL: '', DISCORD_FEEDBACK_WEBHOOK: '', DISCORD_JOINS_WEBHOOK: '', DISCORD_TIPS_WEBHOOK: '', TEST_HOOKS: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
  detached: true,
});
serverGroup = server.pid;
await waitForLine(server, /fishing server on port/);
process.env.VITE_SERVER_URL = `ws://localhost:${SERVER_PORT}`;
// No file watching or hot reload: an edit saved elsewhere in the checkout mid-run would reload every player's page.
const vite = await createServer({ server: { port: VITE_PORT, strictPort: true, hmr: false, watch: null }, logLevel: 'error' });
await vite.listen();
// One browser per player: headless Chrome draws only the page in front, and the game moves only frame by frame, so
// players sharing a browser would stand still while another is in front (a jump seen from behind would never play).
const browsers = new Set<Browser>();
const launch = () => puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  // Small, so software GL keeps a few frames a second with several players open.
  defaultViewport: { width: 800, height: 450 },
  protocolTimeout: 300_000,
});

async function join(name: string): Promise<Page> {
  const browser = await launch();
  browsers.add(browser);
  const page = (await browser.pages())[0] ?? (await browser.newPage());
  page.on('pageerror', (e) => { errors.push(`${name}: ${e.message}`); console.error(`${name}: ${e.message}`); });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') console.error(`      ${name} console ${m.type()}: ${m.text().slice(0, 300)}`); });
  page.setDefaultTimeout(WAIT);
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await page.evaluateOnNewDocument((t) => localStorage.setItem('fishing-token', t), token(name));
  await page.evaluateOnNewDocument(() => localStorage.setItem('fishing-news', String(Number.MAX_SAFE_INTEGER)));
  await page.goto(`http://localhost:${VITE_PORT}/?name=${name}&room=sit`, { waitUntil: 'load', timeout: 300_000 });
  await page.waitForFunction(() => window.__game?.online(), { timeout: 300_000 }).catch(async (e) => {
    const why = await page.evaluate(() => ({ game: !!window.__game, join: document.getElementById('join')?.innerText.slice(0, 200) })).catch((x) => String(x));
    throw new Error(`${name} never came online: ${JSON.stringify(why)} (${e})`);
  });
  // Daylight on every screen, so the shots compare.
  await page.evaluate(() => { window.__game.activate(); window.__game.day(0.35); });
  // No HUD in the shots: the prompt box would sit right over the seat. Prompts are read from the game, not the page.
  await page.addStyleTag({ content: '#hud, #crosshair, #toast, #banner, #tip, #guide, #chat { display: none !important; }' });
  return page;
}
const leave = (...pages: Page[]) => Promise.all(pages.map((p) => { browsers.delete(p.browser()); return p.browser().close(); }));
const shoot = async (p: Page, name: string) => {
  await p.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 85 });
  console.log(`      wrote ${path.relative(process.cwd(), path.join(OUT, `${name}.jpg`))}`);
};
/** Lets a page draw `n` frames (positions lerp and emotes advance only frame by frame). */
const frames = (p: Page, n: number) => p.evaluate(async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); }, n);
/** Camera yaw that looks from (x, z) toward (tx, tz); yaw 0 looks along -z. */
const yawTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z));

type Seat = { x: number; z: number; facing: number };
type Own = { id: string | null; seat: { x: number; z: number } | null; x: number; z: number; y: number; near: string | null };
type Seen = { emote: string | null; at: { x: number; y: number; z: number } | null };
const own = (p: Page): Promise<Own> => p.evaluate(() => {
  const g = window.__game;
  const e = g.emoteState();
  return { id: e.id, seat: e.seat, ...g.player() };
});
const seen = (p: Page, id: number): Promise<Seen> => p.evaluate((id) => ({ emote: window.__game.avatarEmote(id), at: window.__game.avatarAt(id) }), id);
/** A seat's prompt: "Sit down", with what a seat by the campfire has the sitter play after it. */
const sitPrompt = (label: string | null) => !!label?.startsWith('Sit down');
const flat = (a: { x: number; z: number } | null, b: { x: number; z: number }) => (a ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity);
const r2 = (v: number) => Math.round(v * 100) / 100;
/** Seated as the sitter sees it: the SIT emote playing, a stand-up spot kept, standing on the seat's spot. */
const seatedOwn = (o: Own, s: Seat) => o.id === 'sit' && !!o.seat && flat(o, s) < 0.05;
/** Seated as another player sees it: the SIT emote on the avatar, drawn on the seat's spot. */
const seatedSeen = (v: Seen, s: Seat) => v.emote === 'sit' && flat(v.at, s) < 0.15;
/** Waits until a watcher's copy of the sitter has settled (its position lerps in over a few frames). */
const settle = (p: Page, id: number, s: Seat) => p.waitForFunction((id, s) => {
  const a = window.__game.avatarAt(id);
  return window.__game.avatarEmote(id) === 'sit' && a && Math.hypot(a.x - s.x, a.z - s.z) < 0.15;
}, { timeout: WAIT }, id, s).then(() => true, () => false);

let failed = false;
try {
  const ann = await join('Ann');
  const bob = await join('Bob');
  const annId = (await ann.evaluate(() => window.__game.netId())) as number;

  // A two-seat log by the campfire: Ann's seat S, its partner T on the same log.
  const fire = MAPS[0].campfire;
  const { S, T } = (await ann.evaluate((fire) => {
    const seats = (window.__game.world as any).town.seats as Seat[];
    const logs = seats.filter((s) => Math.hypot(s.x - fire.x, s.z - fire.z) < 3);
    for (const s of logs) {
      const t = logs.find((o) => o !== s && o.facing === s.facing && Math.hypot(o.x - s.x, o.z - s.z) < 1.2);
      if (t) return { S: s, T: t };
    }
    throw new Error('no two-seat log by the campfire');
  }, fire)) as { S: Seat; T: Seat };
  console.log(`seat S ${JSON.stringify(S)}, its partner T ${JSON.stringify(T)}`);
  // In front of a seat (the way a sitter faces), looking at it: where its "Sit down" prompt is offered.
  const front = (s: Seat, d: number, side = 0) => ({
    x: s.x + d * Math.sin(s.facing) + side * Math.cos(s.facing),
    z: s.z + d * Math.cos(s.facing) - side * Math.sin(s.facing),
  });
  const stand = front(S, 0.9);
  // Bob watches from the side of the log away from T, a few steps off, so both seats and Ann's face show.
  const away = Math.sign((S.x - T.x) * Math.cos(S.facing) - (S.z - T.z) * Math.sin(S.facing)) || 1;
  const watch = front(S, 2.2, away * 2.2);
  const watchYaw = yawTo(watch.x, watch.z, S.x, S.z);
  const toWatch = async (p: Page) => {
    await p.evaluate((w, yaw) => { window.__game.teleport(w.x, w.z); window.__game.look(yaw, -0.4); }, watch, watchYaw);
  };
  await toWatch(bob);
  await ann.evaluate((p, yaw) => { window.__game.teleport(p.x, p.z); window.__game.look(yaw, -0.2); }, stand, S.facing);
  await ann.waitForFunction(() => window.__game.player().near?.startsWith('Sit down'), { timeout: WAIT }).catch(async (e) => {
    throw new Error(`no "Sit down" prompt for Ann in front of S: ${JSON.stringify({ stand, ...(await own(ann)) })} (${e})`);
  });
  const standing = await own(ann);

  // ---------- 1. refused emotes leave the player seated ----------

  // Too soon: E sits Ann down (an emote), and a wave straight after is inside EMOTE_GAP_MS.
  const soon = (await ann.evaluate(async () => {
    const g = window.__game;
    // What E does on the prompt.
    g.interact();
    const sat = g.emoteState().id;
    const waved = g.emote('wave');
    return { sat, waved };
  })) as { sat: string | null; waved: boolean };
  await frames(ann, 5);
  let a = await own(ann);
  const bobSaw = await settle(bob, annId, S);
  let b = await seen(bob, annId);
  check('1a. the prompt (E) sits Ann on the seat (both screens)', soon.sat === 'sit' && seatedOwn(a, S) && bobSaw, { soon, ann: { id: a.id, seat: !!a.seat, d: r2(flat(a, S)) }, bob: { emote: b.emote, d: r2(flat(b.at, S)) } });
  check('1b. a wave too soon after sitting is refused and Ann stays seated (both screens)', !soon.waved && seatedOwn(a, S) && seatedSeen(b, S), { waved: soon.waved, ann: a.id, bob: b.emote, annD: r2(flat(a, S)), bobD: r2(flat(b.at, S)) });
  await shoot(ann, '1-soon-ann');
  await shoot(bob, '1-soon-bob');

  // Not owned: kelp is a deep sea emote Ann hasn't bought.
  await sleep(1200);
  const kelp = (await ann.evaluate(() => window.__game.emote('kelp'))) as boolean;
  await frames(ann, 5);
  await frames(bob, 5);
  a = await own(ann);
  b = await seen(bob, annId);
  check("1c. an emote Ann doesn't own is refused and she stays seated (both screens)", !kelp && seatedOwn(a, S) && seatedSeen(b, S), { kelp, ann: a.id, bob: b.emote, annD: r2(flat(a, S)), bobD: r2(flat(b.at, S)) });
  await shoot(ann, '1-notowned-ann');
  await shoot(bob, '1-notowned-bob');

  // Moving: a walk key held as the wave is asked for (let go before the next frame, so the step itself never lands).
  const moving = (await ann.evaluate(() => {
    const g = window.__game;
    g.key('KeyW', true);
    const r = g.emote('wave');
    g.key('KeyW', false);
    return r;
  })) as boolean;
  await frames(ann, 5);
  await frames(bob, 5);
  a = await own(ann);
  b = await seen(bob, annId);
  check('1d. a wave asked for while a walk key is down is refused and Ann stays seated (both screens)', !moving && seatedOwn(a, S) && seatedSeen(b, S), { moving, ann: a.id, bob: b.emote, annD: r2(flat(a, S)), bobD: r2(flat(b.at, S)) });
  await shoot(ann, '1-moving-ann');
  await shoot(bob, '1-moving-bob');
  // Two more looks for the eye: from the end of the log, along it and level with the seat (the seated body should rest
  // on top of the log, not float beside it), and square on from the fire's side.
  for (const [name, at] of [['side', front(S, 0, away * 2.6)], ['front', front(S, 2.6)]] as const) {
    await bob.evaluate((at, s, id) => {
      const g = window.__game;
      g.teleport(at.x, at.z);
      const seatY = g.avatarAt(id).y + 0.45;
      const d = Math.hypot(s.x - at.x, s.z - at.z);
      g.look(Math.atan2(-(s.x - at.x), -(s.z - at.z)), Math.atan2(seatY - g.player().y, d));
    }, at, S, annId);
    await frames(bob, 6);
    await shoot(bob, `1-${name}-bob`);
  }

  // ---------- 4. a taken seat isn't offered ----------

  // Bob where Ann stood to sit, facing S: its prompt mustn't come up. T, the log's other seat, may be offered; if a
  // "Sit down" shows, E must sit him on T, not on Ann.
  await bob.evaluate((p, yaw) => { window.__game.teleport(p.x, p.z); window.__game.look(yaw, -0.2); }, stand, S.facing);
  await frames(bob, 8);
  const facing = (await own(bob)).near;
  let onT: Own | null = null;
  if (sitPrompt(facing)) {
    await bob.evaluate(() => window.__game.interact());
    await frames(bob, 3);
    onT = await own(bob);
  }
  check("4a. facing Ann's seat from where she sat down, Bob isn't offered it (T may be)", !sitPrompt(facing) || (!!onT && onT.id === 'sit' && flat(onT, T) < 0.05 && flat(onT, S) > 0.5), { prompt: facing, satOn: onT && { id: onT.id, dS: r2(flat(onT, S)), dT: r2(flat(onT, T)) } });
  await shoot(bob, '4-taken-bob');
  await shoot(ann, '4-taken-ann');
  if (onT?.id === 'sit') {
    // Up again: a step back.
    await bob.evaluate(() => window.__game.key('KeyS', true));
    await frames(bob, 3);
    await bob.evaluate(() => window.__game.key('KeyS', false));
  }
  // On the far side of S from T, close to S and facing it: only S is in reach, and it's taken.
  const side = front(S, 0.8, away * 0.5);
  await bob.evaluate((p, yaw) => { window.__game.teleport(p.x, p.z); window.__game.look(yaw, -0.2); }, side, yawTo(side.x, side.z, S.x, S.z));
  await frames(bob, 8);
  const sideNear = (await own(bob)).near;
  // And for contrast, the same spot by T is offered T.
  const sideT = front(T, 0.8, -away * 0.5);
  await bob.evaluate((p, yaw) => { window.__game.teleport(p.x, p.z); window.__game.look(yaw, -0.2); }, sideT, yawTo(sideT.x, sideT.z, T.x, T.z));
  await frames(bob, 8);
  const sideTNear = (await own(bob)).near;
  check('4b. right by S, facing it, Bob gets no "Sit down"; the same by the free seat T does', !sitPrompt(sideNear) && sitPrompt(sideTNear), { byS: sideNear, byT: sideTNear });
  a = await own(ann);
  check('4c. Ann is still seated after all that', seatedOwn(a, S), { id: a.id, d: r2(flat(a, S)) });

  // ---------- 2. joining or arriving shows Ann seated ----------

  await leave(bob);
  const cat = await join('Cat');
  const catSaw = await settle(cat, annId, S);
  await toWatch(cat);
  await frames(cat, 10);
  const c = await seen(cat, annId);
  check('2a. Cat, joining while Ann sits, sees her seated on the seat', catSaw && seatedSeen(c, S), { emote: c.emote, d: r2(flat(c.at, S)) });
  await shoot(cat, '2-join-cat');
  await shoot(ann, '2-join-ann');
  await leave(cat);

  // Dan starts in the casino and walks out of its front door to the pond.
  const dan = await join('Dan');
  const casino = MAPS.find((m) => m.id === 'casino')!;
  const out = (await dan.evaluate(async (gate) => {
    const g = window.__game;
    const before = { hall: !!(g.world as any).hall };
    g.teleport(gate.x, gate.z + 1.2);
    g.look(gate.facing + 0.6, 0);
    const t0 = performance.now();
    while (performance.now() - t0 < 60_000 && !(g.world as any).hub) {
      await new Promise((r) => setTimeout(r, 300));
      if (g.player().near?.startsWith('Exit')) g.interact();
    }
    return { inCasino: before.hall, atPond: !!(g.world as any).hub };
  }, casino.gate)) as { inCasino: boolean; atPond: boolean };
  const danSaw = out.atPond && (await settle(dan, annId, S));
  const d0 = await seen(dan, annId);
  await toWatch(dan);
  await frames(dan, 10);
  check('2b. Dan, arriving from the casino while Ann sits, sees her seated on the seat', out.inCasino && danSaw && seatedSeen(d0, S), { ...out, emote: d0.emote, d: r2(flat(d0.at, S)) });
  await shoot(dan, '2-arrive-dan');
  await shoot(ann, '2-arrive-ann');
  await leave(dan);

  // Bob again: he saw Ann sit, goes into the casino (she's gone from his screen) and comes back out.
  const bob2 = await join('Bob');
  await settle(bob2, annId, S);
  const pg = MAPS[0].gate;
  const round = (await bob2.evaluate(async (pg, gate, annId) => {
    const g = window.__game;
    const t0 = performance.now();
    g.teleport(pg.x + 2.4 * Math.sin(pg.facing), pg.z + 2.4 * Math.cos(pg.facing));
    g.look(pg.facing, 0);
    while (performance.now() - t0 < 60_000 && !(g.world as any).hall) {
      await new Promise((r) => setTimeout(r, 300));
      if (g.player().near?.startsWith('Travel to')) g.interact();
    }
    const inHall = !!(g.world as any).hall;
    const hiddenThere = g.avatarAt(annId) === null;
    await new Promise((r) => setTimeout(r, 1500));
    g.teleport(gate.x, gate.z + 1.2);
    g.look(gate.facing + 0.6, 0);
    const t1 = performance.now();
    while (performance.now() - t1 < 60_000 && !(g.world as any).hub) {
      await new Promise((r) => setTimeout(r, 300));
      if (g.player().near?.startsWith('Exit')) g.interact();
    }
    return { inHall, hiddenThere, back: !!(g.world as any).hub };
  }, pg, casino.gate, annId)) as { inHall: boolean; hiddenThere: boolean; back: boolean };
  const bobBack = round.back && (await settle(bob2, annId, S));
  await toWatch(bob2);
  await frames(bob2, 10);
  b = await seen(bob2, annId);
  check('2c. Bob, back on the map from the casino while Ann sits, sees her seated on the seat', round.inHall && bobBack && seatedSeen(b, S), { ...round, emote: b.emote, d: r2(flat(b.at, S)) });
  await shoot(bob2, '2-back-bob');
  await shoot(ann, '2-back-ann');

  // ---------- 3. a jump from the seat ----------

  // Both screens sample every frame (the game steps at most 0.05 s a frame, so a jump spans a dozen frames however
  // slow the drawing): Ann's own lift over the ground, and where Bob draws her copy and whether it still sits.
  // Ann samples at least 40 frames and at least 3 s, since Space comes a second in: on a real GPU 40 frames are over
  // before it does.
  const annArc = ann.evaluate(async () => {
    const g = window.__game;
    const lifts: number[] = [];
    const t0 = performance.now();
    while ((lifts.length < 40 || performance.now() - t0 < 3000) && performance.now() - t0 < 120_000) {
      await new Promise((r) => requestAnimationFrame(r));
      // The eye height follows the ground; the jump's lift rides on top of it (with the step bob, nil standing still).
      lifts.push(g.world.walkBob);
    }
    return lifts;
  });
  const bobArc = bob2.evaluate(async (id) => {
    const g = window.__game;
    const ys: number[] = [];
    let stopped = -1;
    const t0 = performance.now();
    while ((stopped < 0 || ys.length - stopped < 40) && performance.now() - t0 < 120_000) {
      await new Promise((r) => requestAnimationFrame(r));
      const at = g.avatarAt(id);
      if (at) ys.push(at.y);
      if (stopped < 0 && g.avatarEmote(id) === null) stopped = ys.length - 1;
    }
    return { ys, stopped };
  }, annId);
  await sleep(1000);
  await ann.keyboard.press('Space');
  const lifts = await annArc;
  const seenArc = await bobArc;
  a = await own(ann);
  b = await seen(bob2, annId);
  const peak = Math.max(...lifts);
  check('3a. Space from the seat: Ann stands up where she sat down from and really jumps', a.id === null && !a.seat && flat(a, standing) < 0.05 && peak > 0.6, { peak: r2(peak), id: a.id, d: r2(flat(a, standing)), lifts: lifts.map(r2) });
  // Her copy's height over where it lands (the ground there, once the jump is over).
  const landed = seenArc.ys[seenArc.ys.length - 1];
  const seenPeak = Math.max(...seenArc.ys.slice(Math.max(0, seenArc.stopped))) - landed;
  check('3b. Bob sees Ann stop sitting and jump, landing off the seat', b.emote === null && seenArc.stopped >= 0 && seenPeak > 0.6 && flat(b.at, S) > 0.5, { seenPeak: r2(seenPeak), stoppedAtFrame: seenArc.stopped, emote: b.emote, dS: r2(flat(b.at, S)), dStand: r2(flat(b.at, standing)), ys: seenArc.ys.map(r2) });
  await shoot(ann, '3-jump-ann');
  await shoot(bob2, '3-jump-bob');
  await leave(ann, bob2);
} catch (e) {
  check('sit check ran to the end', false, String(e));
} finally {
  await Promise.all([...browsers].map((b) => b.close()));
  await vite.close();
  await stopServer();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} checks passed. Screenshots in ${path.relative(process.cwd(), OUT)}/`);
failed = bad.length > 0;
process.exit(failed ? 1 : 0);

declare global {
  interface Window {
    __game: any;
  }
}

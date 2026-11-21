// Stages the Abyss giants' fights in the real game, headlessly, for looking at: every move of every giant in the act
// it belongs to, each act's look, the last stand and the wallow after it (`LEGEND_FIGHT`, `src/game/giantfight.ts`).
// Each giant is hooked on a real cast (its bite swapped in on its way from the server, as `legendshots.ts` does) from
// the charter boat's spawn; then the game's clock is stepped by hand (`G.freeze`, `G.step`), the fight is held in the
// wanted act with the line where that act has it (`G.giantAct`, `G.giantLine`), the move is played (`G.giantMove`,
// `G.giantLast`) and frames are taken at the given seconds into it: `<giant>-<name>-<n>.jpg` with every overlay
// hidden, and `<giant>-<name>-hud.jpg` (the gauge over it, as the player sees it) at the middle one.
//
//   npx tsx scripts/giantmoves.ts <out dir> [giants, comma-separated] [names, comma-separated]
//
// RUN=1 instead plays each giant's whole fight through on a simple hand (reel in, ease off near the red) with the
// director left to itself, stepped as fast as the machine draws: logs each act, move, the last stand and the landing
// with the fight's clock, the view and the storm, how many shader programs there are (none should be made during a
// fight), any frame that took over 30 ms to step and draw, and the calls made to the sound (`audio.giant*`), and takes a frame every FRAME_EVERY
// seconds (default 4) as `<giant>-run-<seconds>.jpg`. ROD (default 7) is the Deep Sea Rod's step for it; QUIET=1 holds
// the giant's moves and last stand back (the fight as it was before them), to compare frame times.
// CUT=1.0 instead stages the landing cutting a last stand short: each giant's last stand is started close in, and that
// many seconds into it the line is brought right in; frames follow the landing through as `<giant>-cut-<n>.jpg`
// (0.3, 0.8, 1.5, 2.3, 3.5 and 5 s into it), with the calls made to the sound logged. CUT=9 lands a giant already spent.
// (Then the card is put away and the send-off is followed too: `<giant>-cut-sink-<n>.jpg`, 0.3, 0.8, 1.4 and 2.4 s on.)
// STRIP=0.15 takes each staged moment in motion instead: a frame every that many seconds for STRIP_SECS (default 2.4)
// from the moment it is played, as `<giant>-<name>-s<nn>.jpg`, tiled into `<giant>-<name>-strip.jpg` (needs ffmpeg),
// which is how to see that an arm moves or an eye opens and shuts. The `thrash` moments hold the Kraken's arms at a
// surge's full build-up (`G.giantStir`).
// COST=1 instead times each staged moment: 1.5 s into it, 150 frames stepped and drawn with the GPU made to finish
// each one (a one-pixel read-back), as they are and then with the lurkers' arms and eyes not drawn; it logs both, the
// difference (what the arms or the eyes cost a frame on this machine, at this window's size) and how many were up.
// TOUCH=1: a phone's layout. LITE=1: lite graphics. YAW, PITCH: where the player looks (default the spawn's).
// Its own server and Vite on MOMENT_PORT (8831) and MOMENT_VITE_PORT (5331).
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';
import { createServer } from 'vite';
import { FISH } from '../src/data/content';
import { TIP_IDS } from '../src/game/tips';
import { newSave } from '../src/game/state';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = Number(process.env.MOMENT_VITE_PORT) || 5331;
const SERVER_PORT = Number(process.env.MOMENT_PORT) || 8831;
const TOUCH = !!process.env.TOUCH;
const W = TOUCH ? 1400 : 1280, H = TOUCH ? 647 : 720;
const OUT = path.resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('usage: giantmoves.ts <out dir> [giants] [names]');
const GIANTS = (process.argv[3] || 'kraken,leviathan,dreamer').split(',');
const ONLY = process.argv[4] ? new Set(process.argv[4].split(',')) : null;
const RUN = !!process.env.RUN;
const CUT = process.env.CUT ? Number(process.env.CUT) : null;
const COST = !!process.env.COST;
const STRIP = process.env.STRIP ? Number(process.env.STRIP) : null;
const STRIP_SECS = Number(process.env.STRIP_SECS ?? 2.4);
const FFMPEG = fs.existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg';
const ROD = Number(process.env.ROD ?? 7);
const FRAME_EVERY = Number(process.env.FRAME_EVERY ?? 4);
const LOOK: [number, number] = [Number(process.env.YAW ?? 0), Number(process.env.PITCH ?? -0.12)];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

/** A staged moment: the act and the line (`progress`, and the fight left) it is staged at, what is played, and the seconds into it the frames are taken. */
interface Shot {
  name: string;
  act: 1 | 2 | 3;
  line: [progress: number, fightLeft: number];
  play: string | 'last' | 'surge' | null;
  at: number[];
  /** The Kraken's arms held at this much of a surge's build-up (0..1) for the moment. */
  stir?: number;
}
const FAR: [number, number] = [0.4, 0.9], MID: [number, number] = [0.6, 0.6], NEAR: [number, number] = [0.84, 0.3];
const SHOTS: Record<string, Shot[]> = {
  kraken: [
    { name: 'act1', act: 1, line: FAR, play: 'surge', at: [0.5, 1.1] },
    // Between surges: its arms alone, standing where the line holds it (the body is never drawn).
    { name: 'idle-19', act: 2, line: [0.3, 0.7], play: null, at: [1, 3.5, 6] },
    { name: 'idle-14', act: 2, line: [0.5, 0.7], play: null, at: [1, 3.5, 6] },
    { name: 'idle-close', act: 3, line: NEAR, play: null, at: [1, 3.5, 6] },
    // At the rail, just before the landing.
    { name: 'idle-rail', act: 3, line: [0.96, 0.2], play: null, at: [1, 3.5, 6] },
    // A surge at its height: the arms thrashing.
    { name: 'thrash-14', act: 2, line: [0.5, 0.7], play: null, at: [1, 2, 3], stir: 1 },
    { name: 'thrash-close', act: 3, line: NEAR, play: null, at: [1, 2, 3], stir: 1 },
    { name: 'arm', act: 2, line: MID, play: 'arm', at: [0.9, 1.8] },
    { name: 'slap', act: 2, line: MID, play: 'slap', at: [1.0, 1.3, 1.5, 1.9] },
    { name: 'twin', act: 2, line: [0.5, 0.7], play: 'twin', at: [1.2, 2.0] },
    { name: 'grip', act: 3, line: NEAR, play: 'grip', at: [0.6, 1.0, 1.6, 2.4] },
    { name: 'slap-close', act: 3, line: NEAR, play: 'slap', at: [1.0, 1.4, 1.8] },
    { name: 'twin-close', act: 3, line: NEAR, play: 'twin', at: [1.4] },
    { name: 'last', act: 3, line: NEAR, play: 'last', at: [0.3, 0.6, 0.9, 1.2, 1.5, 2.0, 4.5, 7.0] },
  ],
  leviathan: [
    { name: 'act1', act: 1, line: FAR, play: 'surge', at: [0.5, 1.1] },
    // Between surges: its coils (or its ridge of spines) weaving where the line holds it, at the distances a Fair fight has it.
    { name: 'idle-19', act: 2, line: [0.3, 0.7], play: null, at: [1, 3.5, 6] },
    { name: 'idle-14', act: 2, line: [0.5, 0.7], play: null, at: [1, 3.5, 6] },
    { name: 'idle-close', act: 3, line: NEAR, play: null, at: [1, 3.5, 6] },
    { name: 'rear-19', act: 2, line: [0.3, 0.7], play: 'rear', at: [0.5, 0.9, 1.3] },
    { name: 'rear-14', act: 2, line: [0.5, 0.7], play: 'rear', at: [0.5, 0.9, 1.3, 2.0] },
    { name: 'rear', act: 2, line: MID, play: 'rear', at: [0.5, 0.9, 1.3] },
    { name: 'tail-14', act: 2, line: [0.5, 0.7], play: 'tail', at: [0.5, 0.9, 1.35, 1.7] },
    { name: 'coil-19', act: 2, line: [0.3, 0.7], play: 'coil', at: [0.6, 1.2, 1.8] },
    { name: 'coil-14', act: 2, line: [0.5, 0.7], play: 'coil', at: [0.6, 1.0, 1.4, 1.8, 2.3] },
    { name: 'coil-far', act: 2, line: MID, play: 'coil', at: [0.6, 1.2, 1.8] },
    { name: 'tail', act: 3, line: NEAR, play: 'tail', at: [0.6, 0.95, 1.3, 1.6] },
    { name: 'coil', act: 3, line: NEAR, play: 'coil', at: [0.7, 1.1, 1.5, 2.0] },
    { name: 'rear-close', act: 3, line: NEAR, play: 'rear', at: [0.8, 1.1] },
    { name: 'last', act: 3, line: NEAR, play: 'last', at: [0.3, 0.6, 0.9, 1.2, 1.5, 2.0, 5.0] },
    { name: 'last-14', act: 3, line: [0.5, 0.3], play: 'last', at: [0.3, 0.6, 0.9, 1.2, 1.5] },
  ],
  dreamer: [
    { name: 'act1', act: 1, line: FAR, play: 'surge', at: [0.5, 1.1] },
    // Between surges: its eyes on the water round the line.
    { name: 'idle-19', act: 2, line: [0.3, 0.7], play: null, at: [1, 3.5, 6] },
    { name: 'idle-14', act: 2, line: [0.5, 0.7], play: null, at: [1, 3.5, 6] },
    { name: 'idle-close', act: 3, line: NEAR, play: null, at: [1, 3.5, 6] },
    { name: 'ring-14', act: 2, line: [0.5, 0.7], play: 'ring', at: [0.6, 1.4, 2.4] },
    { name: 'trail-14', act: 2, line: [0.5, 0.7], play: 'trail', at: [0.5, 1.0, 1.6, 2.4] },
    { name: 'ring', act: 2, line: MID, play: 'ring', at: [1.2, 2.2] },
    { name: 'under', act: 3, line: NEAR, play: 'under', at: [1.0, 2.2] },
    { name: 'trail', act: 3, line: NEAR, play: 'trail', at: [0.6, 1.2, 2.0] },
    { name: 'ring-close', act: 3, line: NEAR, play: 'ring', at: [1.5] },
    { name: 'last', act: 3, line: NEAR, play: 'last', at: [0.3, 0.6, 0.9, 1.2, 1.5, 2.2, 4.5, 7.0] },
  ],
};

const fishOf = (id: string) => FISH.find((f) => f.id === id)!;
const mid = (id: string) => Math.round((fishOf(id).minSize + fishOf(id).maxSize) / 2);
// A seasoned angler with the Deep Sea Rod; every legend's set unlocked, so no piece banner.
const dex = Object.fromEntries(GIANTS.map((id) => [id, { count: 40, best: fishOf(id).maxSize }]));
const legends = Object.fromEntries(FISH.filter((f) => f.legend).map((f) => [f.id, 99]));
const save = { ...newSave(), level: 60, coins: 50000, tips: [...TIP_IDS], rod: 'aurora', line: 'moonsilk', bait: 'pearl', slots: [{ k: 'rod', id: 'aurora' }, { k: 'bait', id: 'pearl', n: 99 }, null, null, null, null, null, null], held: 0, dex, legends, seaRod: true, rodStep: 0, holdLevel: 4 };
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fishing-giantmoves-'));
const TOKEN = 'moment-token-0123456789abcdef';
fs.writeFileSync(path.join(dataDir, 'accounts.json'), JSON.stringify({ moment: { name: 'Moment', hash: createHash('sha256').update(TOKEN).digest('hex'), save } }));
const server = spawn('npx', ['tsx', 'server/index.ts'], { env: { ...process.env, DATA_DIR: dataDir, PORT: String(SERVER_PORT), DATABASE_URL: '', DISCORD_FEEDBACK_WEBHOOK: '', DISCORD_JOINS_WEBHOOK: '', DISCORD_TIPS_WEBHOOK: '', DEV_USER: 'moment', DEV_PASS: 'moment-dev-pass', TEST_HOOKS: '1' }, stdio: ['ignore', 'pipe', 'inherit'], detached: true });
process.on('exit', () => { try { process.kill(-server.pid!, 'SIGKILL'); } catch { /* gone */ } });
await new Promise<void>((res) => server.stdout!.on('data', (d) => /fishing server on port/.test(String(d)) && res()));
process.env.VITE_SERVER_URL = `ws://localhost:${SERVER_PORT}`;
const vite = await createServer({ server: { port: VITE_PORT, strictPort: true, hmr: false, watch: null }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: W, height: H, deviceScaleFactor: 1, isMobile: TOUCH, hasTouch: TOUCH }, protocolTimeout: 600_000 });

const OVERLAYS = '#crosshair, #gauge, #alert, #hud, #divehud, #fishtag, #ctx, #prompt, #verdict, #guide, #heldname, #hotbar, #seagear, #help, #catch, #banner, #toast, #tip, #emotewheel';

async function shoot(page: Page, name: string, clean: boolean): Promise<void> {
  await page.evaluate((c) => document.documentElement.classList.toggle('moment-clean', c), clean);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 85 });
  await page.evaluate(() => document.documentElement.classList.remove('moment-clean'));
}

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/toNonIndexed|WebSocket/.test(m.text())) console.error(`[page] ${m.text()}`); });
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await page.evaluateOnNewDocument((t, lite) => { localStorage.setItem('fishing-token', t); localStorage.setItem('fishing-news', String(Number.MAX_SAFE_INTEGER)); if (lite) localStorage.setItem('fishing-graphics', 'lite'); }, TOKEN, !!process.env.LITE);
  // A cast's roll is swapped for the wanted giant on its way in (only this page sees it).
  await page.evaluateOnNewDocument(() => {
    const d = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage')!;
    Object.defineProperty(WebSocket.prototype, 'onmessage', {
      configurable: true,
      get() { return d.get!.call(this); },
      set(fn) {
        d.set!.call(this, fn && function (this: WebSocket, e: MessageEvent) {
          const f = (window as any).__force;
          if (f && typeof e.data === 'string' && e.data.includes('"castok"')) {
            const m = JSON.parse(e.data);
            if (m.t === 'castok') {
              Object.assign(m, { fishId: f.id, size: f.size, shiny: false, wait: f.wait });
              return fn.call(this, { data: JSON.stringify(m) });
            }
          }
          return fn.call(this, e);
        });
      },
    });
  });
  await page.goto(`http://localhost:${VITE_PORT}/?${TOUCH ? 'touch&' : ''}name=Moment&room=moment`, { waitUntil: 'load' });
  await page.waitForFunction(() => (window as any).__game?.online() && (window as any).__game.world.hub, { timeout: 60000 });
  await page.evaluate(() => (window as any).__game.activate());
  await sleep(600);
  const say = async (text: string) => { await page.evaluate((t) => (window as any).__game.cmd(t), text); await sleep(400); };
  await say('/login moment moment-dev-pass');
  await page.addStyleTag({ content: `#chat, #chatbox, #devprompt { display: none !important; } html.moment-clean :is(${OVERLAYS}) { display: none !important; }` });
  // The calls the game makes to the giants' sound, logged on the page with the fight's clock.
  await page.evaluate(async () => {
    const { audio } = await import('/src/game/audio.ts' as string);
    const log: unknown[] = ((window as any).__calls = []);
    for (const k of ['giantFightStart', 'giantCall', 'giantFightEnd', 'giant'] as const) {
      const was = audio[k].bind(audio);
      audio[k] = (...a: unknown[]) => { log.push([k, ...a]); return was(...a); };
    }
    let frames = 0;
    const was = audio.giantFight.bind(audio);
    audio.giantFight = (dt: number, s: unknown) => { (window as any).__fightFrames = ++frames; (window as any).__fightState = s; return was(dt, s); };
  });
  const phase = () => page.evaluate(() => (window as any).__game.state().phase as string);
  const waitPhase = async (want: string[], ms: number) => {
    const t0 = Date.now();
    for (;;) {
      const p = await phase();
      if (want.includes(p) || Date.now() - t0 > ms) return p;
      await sleep(50);
    }
  };
  /** Steps the game `secs` seconds on, 60 frames a second, a simple hand on the reel (in, easing off near the red). */
  const step = (secs: number, line: [number, number] | null = null) => page.evaluate((secs, line) => {
    const G = (window as any).__game;
    for (let i = 0, n = Math.round(secs * 60); i < n; i++) {
      const st = G.state();
      if (st.phase !== 'reeling') break;
      G.hold((st.tension ?? 0) < 0.5);
      // (Staging: the line held where the moment is staged, while the reel runs on under the stepped clock.)
      if (line) G.giantLine(line[0], line[1]);
      const t0 = performance.now();
      G.step(1 / 60);
      // The slowest frame since it was last read (RUN logs it: a move must not make a frame stall).
      (window as any).__slow = Math.max((window as any).__slow ?? 0, performance.now() - t0);
    }
    return G.state().phase as string;
  }, secs, line);

  await say(`/rodstep ${ROD}`);
  await say('/abysslevel 0');
  await say('/sea 4');
  await page.waitForFunction(() => (window as any).__game.world.sea && document.getElementById('castoff')!.classList.contains('hidden'), { timeout: 60000 });
  await sleep(1500);
  await page.evaluate(() => { const G = (window as any).__game; G.world.setDepth(G.seaDepth(), true); });
  // The Abyss's own sightings are put away, so frames compare.
  await page.evaluate(() => { const L = (window as any).__game.world.sea?.lurk; if (L) { L.auto = false; L.hide(); } });

  for (const id of GIANTS) {
    await page.evaluate((look) => { const G = (window as any).__game; G.day(0.45); G.teleport(-1.6, 0.3); G.look(look[0], look[1]); }, LOOK);
    await sleep(800);
    await page.evaluate((id, size) => { (window as any).__force = { id, size, wait: 1.0 }; (window as any).__calls.length = 0; }, id, mid(id));
    let ok = false;
    for (let attempt = 0; attempt < 4 && !ok; attempt++) {
      await page.evaluate(() => (window as any).__game.press());
      await sleep(400);
      await page.evaluate(() => { const G = (window as any).__game; G.setPower(0.75); G.release(); });
      if ((await waitPhase(['waiting', 'idle'], 8000)) !== 'waiting') continue;
      if ((await waitPhase(['bite', 'idle'], 12000)) !== 'bite') continue;
      // Stopped at the hook: from here the clock is stepped by hand.
      // (How many shader programs there are before the hook: the hook must make none, nor the fight after it.)
      await page.evaluate(() => { const G = (window as any).__game; G.freeze(true); (window as any).__programs = G.world.renderer.info.programs?.length; G.press(); G.step(1 / 60); });
      ok = (await phase()) === 'reeling';
      if (!ok) await page.evaluate(() => (window as any).__game.freeze(false));
    }
    await page.evaluate(() => { (window as any).__force = null; });
    if (!ok) { console.error(`${id}: could not stage a fight`); continue; }
    await page.evaluate(() => document.getElementById('banner')?.classList.add('hidden'));

    if (RUN) {
      console.log(`${id}: shader programs before the hook ${await page.evaluate(() => (window as any).__programs)}, a frame after it ${await page.evaluate(() => (window as any).__game.world.renderer.info.programs?.length)}`);
      // The whole fight, the director left to itself (QUIET=1: its moves and last stand held back, to compare frame times).
      if (process.env.QUIET) await page.evaluate(() => (window as any).__game.giantAuto(false));
      let last = '';
      let shot = 0;
      const slowest: number[] = [];
      for (let t = 0; t < 400; t += 0.5) {
        const p = await step(0.5);
        const st = await page.evaluate(() => {
          const G = (window as any).__game, w = G.world, F = w.sea?.fight;
          const slow = (window as any).__slow ?? 0;
          (window as any).__slow = 0;
          return { ...G.state(), slow, calls: (window as any).__calls.splice(0), frames: (window as any).__fightFrames, fs: (window as any).__fightState, view: `fov ${w.fovFight.toFixed(1)} bolts ${F?.bolts.toFixed(2)} rain ${F?.rain.toFixed(2)} wind ${F?.wind.toFixed(2)} programs ${w.renderer.info.programs?.length}` };
        });
        const g = st.giant;
        slowest.push(st.slow);
        if (st.slow > 30) console.log(`${id} ${t.toFixed(1)}s: a frame took ${st.slow.toFixed(0)} ms`);
        const now = g ? `act ${g.act} move ${g.move ?? '-'} (${g.moves}) lastStand ${g.lastStand} spent ${g.spent}` : 'no fight';
        if (now !== last || st.calls.length) console.log(`${id} ${t.toFixed(1)}s line ${Math.round((st.progress ?? 0) * 100)}% fight ${Math.round((st.fightLeft ?? 0) * 100)}% | ${now} | ${st.view}${st.calls.length ? ` | sound: ${st.calls.map((c: unknown[]) => `${c[0]}(${c.slice(1).map((a) => (typeof a === 'object' ? JSON.stringify(a, (_k, v) => (typeof v === 'number' ? +v.toFixed(2) : v)) : a)).join(', ')})`).join(' ')}` : ''}`);
        last = now;
        if (t >= shot) { await shoot(page, `${id}-run-${String(Math.round(t)).padStart(3, '0')}`, true); shot += FRAME_EVERY; }
        if (p !== 'reeling') {
          const sorted = [...slowest].sort((a, b) => a - b);
          console.log(`${id}: fight over at ${t.toFixed(1)}s, phase ${p}, status ${st.status}, giantFight frames ${st.frames}, last state ${JSON.stringify(st.fs)}; slowest frame in each half second: median ${sorted[Math.floor(sorted.length / 2)].toFixed(1)} ms, worst ${sorted[sorted.length - 1].toFixed(1)} ms`);
          break;
        }
      }
      // The landing (or the loss), running on its own clock again.
      await page.evaluate(() => (window as any).__game.freeze(false));
      await sleep(4500);
      await shoot(page, `${id}-run-end`, true);
      const tail = await page.evaluate(() => ({ phase: (window as any).__game.state().phase, giant: (window as any).__game.state().giant, calls: (window as any).__calls.splice(0) }));
      console.log(`${id}: after: phase ${tail.phase}, giant ${JSON.stringify(tail.giant)}, sound: ${tail.calls.map((c: unknown[]) => `${c[0]}(${c.slice(1).join(', ')})`).join(' ') || '-'}`);
      await page.evaluate(() => { const G = (window as any).__game; if (G.state().phase === 'result') G.press(); G.hold(false); });
      await sleep(2500);
      continue;
    }

    await page.evaluate(() => (window as any).__game.giantAuto(false));
    if (CUT !== null) {
      await page.evaluate((line, sea) => { const G = (window as any).__game; G.giantAct(3); G.giantLine(line[0], line[1]); G.world.time = Number(sea); }, NEAR, process.env.SEA_TIME ?? '100');
      await step(4, NEAR);
      await page.evaluate(() => (window as any).__game.giantLast());
      await step(CUT, NEAR);
      await shoot(page, `${id}-cut-0`, true);
      const before = await page.evaluate(() => (window as any).__game.state().giant);
      // The line right in: the reel lands it on its next step, and the landing runs on under the stepped clock.
      await page.evaluate(() => { const G = (window as any).__game; G.giantLine(0.9999); G.hold(true); for (let i = 0; i < 30 && G.state().phase === 'reeling'; i++) G.step(1 / 60); });
      let at = 0;
      const land = [0.3, 0.8, 1.5, 2.3, 3.5, 5];
      for (let k = 0; k < land.length; k++) {
        await page.evaluate((secs) => { const G = (window as any).__game; for (let i = 0, n = Math.round(secs * 60); i < n; i++) G.step(1 / 60); }, land[k] - at);
        at = land[k];
        await shoot(page, `${id}-cut-${k + 1}`, true);
      }
      const after = await page.evaluate(() => { const G = (window as any).__game, w = G.world; return { phase: G.state().phase, giant: G.state().giant, calls: (window as any).__calls.splice(0), view: `fov ${w.fovFight.toFixed(2)} storm ${JSON.stringify(w.sea.fight)} shove ${JSON.stringify(w.sea.shove)}` }; });
      console.log(`${id}: cut ${CUT}s into its last stand (${JSON.stringify(before)}); 5 s on: phase ${after.phase}, giant ${JSON.stringify(after.giant)}, shown ${JSON.stringify(await page.evaluate(() => (window as any).__game.state().giantShown))}, ${after.view}; sound: ${after.calls.map((c: unknown[]) => `${c[0]}:${(c[2] as { kind?: string })?.kind ?? c[1]}`).join(' ')}`);
      // As the player sees it, the card up; then the card put away and the send-off followed.
      await shoot(page, `${id}-cut-card`, false);
      for (let i = 0; i < 240 && (await phase()) !== 'result'; i++) await page.evaluate(() => (window as any).__game.step(1 / 60));
      await shoot(page, `${id}-cut-result`, false);
      await page.evaluate(() => { const G = (window as any).__game; G.hold(false); if (G.state().phase === 'result') G.press(); });
      at = 0;
      const sink = [0.3, 0.8, 1.4, 2.4];
      for (let k = 0; k < sink.length; k++) {
        await page.evaluate((secs) => { const G = (window as any).__game; for (let i = 0, n = Math.round(secs * 60); i < n; i++) G.step(1 / 60); }, sink[k] - at);
        at = sink[k];
        await shoot(page, `${id}-cut-sink-${k + 1}`, true);
      }
      console.log(`${id}: sunk: shown ${JSON.stringify(await page.evaluate(() => (window as any).__game.state().giantShown))}`);
      await page.evaluate(() => { const G = (window as any).__game; G.freeze(false); if (G.state().phase === 'result') G.press(); G.hold(false); });
      await sleep(4000);
      continue;
    }
    for (const s of (SHOTS[id] ?? []).filter((s) => !ONLY || ONLY.has(s.name))) {
      // The act, with the line where that act has it; a few seconds for the last move to clear and the act's look to ease in.
      await page.evaluate((s, sea) => { const G = (window as any).__game; G.giantAct(s.act); G.giantLine(s.line[0], s.line[1]); G.world.time = Number(sea); }, s, process.env.SEA_TIME ?? '100');
      await page.evaluate((k) => (window as any).__game.giantStir(k), s.stir ?? null);
      await step(4, s.line);
      if (s.play === 'surge') {
        // Act 1's boil comes with a surge: the director left to itself until one starts.
        await page.evaluate(() => (window as any).__game.giantAuto(true));
        for (let k = 0; k < 400 && !(await page.evaluate(() => (window as any).__game.state().surging)); k++) await step(1 / 30, s.line);
        await page.evaluate(() => (window as any).__game.giantAuto(false));
      } else if (s.play === 'last') await page.evaluate(() => (window as any).__game.giantLast());
      else if (s.play) {
        const played = await page.evaluate((m) => (window as any).__game.giantMove(m), s.play);
        if (!played) console.error(`${id}-${s.name}: ${s.play} would not play`);
      }
      if (COST) {
        await step(1.5, s.line);
        const cost = await page.evaluate((line) => {
          const G = (window as any).__game, L = G.world.sea.lurk, gl = G.world.renderer.getContext();
          const px = new Uint8Array(4);
          const run = (n: number) => {
            const t0 = performance.now();
            for (let i = 0; i < n; i++) {
              G.hold((G.state().tension ?? 0) < 0.5);
              G.giantLine(line[0], line[1]);
              G.step(1 / 60);
              gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            }
            return (performance.now() - t0) / n;
          };
          const draw = (on: boolean) => { for (const g of [L.eyeGeo, L.armGeo]) g.setDrawRange(0, on ? Infinity : 0); };
          run(30);
          // By turns, so a drift in the machine's speed falls on both alike.
          let withThem = 0, without = 0;
          for (let k = 0; k < 5; k++) {
            draw(true);
            withThem += run(15) / 5;
            draw(false);
            without += run(15) / 5;
          }
          draw(true);
          const info = G.world.renderer.info;
          return { withThem, without, shown: G.state().giantShown, eyes: L.eyeGeo.instanceCount, arms: L.armGeo.instanceCount, programs: info.programs?.length };
        }, s.line);
        console.log(`${id}-${s.name}: ${cost.withThem.toFixed(2)} ms a frame, ${cost.without.toFixed(2)} without the lurkers: ${(cost.withThem - cost.without).toFixed(2)} ms for ${cost.arms} arms and ${cost.eyes} eyes drawn (${JSON.stringify(cost.shown)}), programs ${cost.programs}`);
        if ((await phase()) !== 'reeling') { console.error(`${id}: the fight ended during ${s.name}`); break; }
        continue;
      }
      if (STRIP) {
        // In motion: a frame every STRIP seconds, tiled into one sheet.
        const n = Math.round(STRIP_SECS / STRIP);
        for (let k = 0; k <= n; k++) {
          if (k) await step(STRIP, s.line);
          await shoot(page, `${id}-${s.name}-s${String(k).padStart(2, '0')}`, true);
        }
        const cols = Math.min(6, n + 1);
        spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', path.join(OUT, `${id}-${s.name}-s%02d.jpg`), '-vf', `scale=640:-1,tile=${cols}x${Math.ceil((n + 1) / cols)}`, '-frames:v', '1', '-q:v', '4', path.join(OUT, `${id}-${s.name}-strip.jpg`)]);
        const st = await page.evaluate(() => ({ g: (window as any).__game.state().giant, n: (window as any).__game.state().giantShown, programs: (window as any).__game.world.renderer.info.programs?.length }));
        console.log(`${id}-${s.name}: ${JSON.stringify(st.g)} shown ${JSON.stringify(st.n)} programs ${st.programs}`);
        if ((await phase()) !== 'reeling') { console.error(`${id}: the fight ended during ${s.name}`); break; }
        continue;
      }
      let at = 0;
      const times = s.at;
      for (let k = 0; k < times.length; k++) {
        await step(times[k] - at, s.line);
        at = times[k];
        await shoot(page, `${id}-${s.name}-${k + 1}`, true);
        if (k === Math.floor((times.length - 1) / 2)) await shoot(page, `${id}-${s.name}-hud`, false);
      }
      const st = await page.evaluate(() => ({ g: (window as any).__game.state().giant, n: (window as any).__game.state().giantShown, calls: (window as any).__calls.splice(0) }));
      console.log(`${id}-${s.name}: ${JSON.stringify(st.g)} shown ${JSON.stringify(st.n)} sound: ${st.calls.map((c: unknown[]) => `${c[0]}:${(c[2] as { kind?: string })?.kind ?? c[1]}`).join(' ') || '-'}`);
      if ((await phase()) !== 'reeling') { console.error(`${id}: the fight ended during ${s.name}`); break; }
    }
    // Let it go: the line run right out.
    await page.evaluate(() => { const G = (window as any).__game; G.hold(false); G.giantLine(0.01); G.freeze(false); });
    await waitPhase(['idle', 'result'], 30000);
    const end = await page.evaluate(() => (window as any).__calls.splice(0));
    console.log(`${id}: let go: ${end.map((c: unknown[]) => `${c[0]}(${c.slice(1).join(', ')})`).join(' ') || '-'}`);
    await page.evaluate(() => { const G = (window as any).__game; if (G.state().phase === 'result') G.press(); });
    await sleep(6500);
  }
} finally {
  await browser.close();
  await vite.close();
  try { process.kill(-server.pid!, 'SIGTERM'); } catch { /* gone */ }
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* still writing */ }
}
process.exit(0);

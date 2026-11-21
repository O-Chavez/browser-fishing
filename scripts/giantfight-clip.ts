// Films a whole Abyss giant fight in the real game, headlessly, with its sound: from a few seconds before the bite (an
// Abyss legend's tell by the bobber takes the last 3.6 s of the wait), the bite, the hooked banner, the whole reel
// fight played by a bot, the landing (the camera pulls back, the giant heaves up beside the boat) and `AFTER` seconds
// of the landed show, from the player's view with the HUD (the chat, which only holds the staging's dev commands, is
// hidden).
//
//   npx tsx scripts/giantfight-clip.ts <out dir> [leviathan,kraken,dreamer]
//
// For each giant, in the out dir:
// - `<id>.mp4`: H.264 960x540 and AAC, +faststart;
// - `<id>-picture.mp4`: the picture alone, what `AUDIO_ONLY` muxes new sound onto;
// - `<id>.wav` (48 kHz, 16-bit stereo) and `<id>-spectrum.png` (ffmpeg's `showspectrumpic`);
// - `<id>-timeline.json`: the fight's set-up (gaps, seeds, bot, rating) and its moments (bite, hook, end), and per
//   frame its time on the clip (`t`, s, when the frame shows) with the reel's progress, fight left, surging, warning,
//   tension and phase, plus every other field of the debug state (`__game.state()`) as it is;
// - `<id>-audio-log.json`: every call the game made on the `audio` instance during the stepped run (`t`: clip time, s,
//   negative in the pre-roll; `name`; `args`), its arguments encoded as JSON (non-finite numbers as {"$num": "Infinity"},
//   undefined as {"$u": 1}); calls whose arguments are not plain data are left out and counted in `skipped`.
//
// The picture: the save is seeded (rod step `ROD_STEP`, Abyss level `ABYSS_LEVEL`, charter at Abyss marker `MARKER`:
// 7, 0, 1 is Fair, the rating of a player who fishes there), a real cast is made at sea and its roll is swapped on its
// way in from the server for the giant (mid size, its gaps rolled as the server rolls an Abyss legend's: Brutish at its
// zone's weight, `rollFishGaps`). The game's clock is stepped by hand (`__game.freeze` / `step`) at 1/60 s, three steps a
// frame at `FPS` 20, the page's timers and CSS animations stepped with it, so a busy machine can't spoil the timing.
// The fight is the game's own `Reel`: a bot sets the reel button (`__game.hold`, the field the mouse button sets) before
// every reel step, by `reelbot.ts`'s policy (eases off at the red's edge, takes up again below `take`, a reaction time
// jittered ±25%). Before filming, candidate seeds are fought in Node with the same policy on the same `Reel`, and the
// first that lands with at most `MAX_FRAYS` frays is filmed; a fight lost in the page tries the next one.
//
// The sound is replayed, not captured: the audio log is fed to the game's own audio module in a fresh page whose
// `AudioContext` is one `OfflineAudioContext` (2 channels, 48 kHz), at a tick every 1/60 s (`ctx.suspend`), with the
// page's `setTimeout` / `setInterval` / `Date.now` / `performance.now` on the offline clock (so the lake tune's passes,
// the campfire crackle and any delayed sound land where they would), `ctx.state` reading "running", and the sound and
// music switches on. `audio.band`'s shared-clock argument is re-based onto the offline clock (the stepped run's wall
// clock is not the game's). `PREROLL` seconds of the run before the clip are rendered and cut, so the sea's beds have
// settled at the clip's first frame.
//
// Env:
//   FPS=20  PREROLL=4 (s)  LEAD=5.5 (s before the bite the clip starts)  AFTER=9 (s after the reel ends)
//   BITE_REACT=0.35 (s from the bite to the strike)
//   ROD_STEP=7  ABYSS_LEVEL=0  MARKER=1
//   BOT=edge (Oscar's own: lets go as the needle tips into the red, `EDGE_STYLES[0]`) | edge-safe | careful
//   REACT=0.2 (s)  SEED=1 (first candidate)  MAX_FRAYS=1
//   CRF=27 (raised until the clip fits MAX_MB=12)  KEEP_FRAMES=1 keeps the JPEG frames  LURK=1 keeps the random lurkers
//   AUDIO_ONLY=1: re-renders the sound from the saved audio log and muxes it onto `<id>-picture.mp4`; no game server.
//   Its own server and Vite on MOMENT_PORT (8861) and MOMENT_VITE_PORT (5361).
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { createServer, type ViteDevServer } from 'vite';
import { FISH } from '../src/data/content';
import { ZONES } from '../src/data/dive';
import { seaGaps, seaRating } from '../src/game/dive';
import { mulberry } from '../src/game/env';
import { rollFishGaps } from '../src/game/progression';
import { FIGHT_DT, GOOD_MAX, Reel } from '../src/game/reel';
import { EDGE_STYLES, STYLES, type BotStyle } from '../src/game/reelbot';
import { newSave } from '../src/game/state';
import { TIP_IDS } from '../src/game/tips';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FFMPEG = process.env.FFMPEG ?? (fs.existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg');
const VITE_PORT = Number(process.env.MOMENT_VITE_PORT) || 5361;
const SERVER_PORT = Number(process.env.MOMENT_PORT) || 8861;
const W = 1280, H = 720;
if (!process.argv[2]) throw new Error('usage: giantfight-clip.ts <out dir> [leviathan,kraken,dreamer]');
const OUT = path.resolve(process.argv[2]);
const GIANTS = ['leviathan', 'kraken', 'dreamer'] as const;
type GiantId = (typeof GIANTS)[number];
const IDS = (process.argv[3] ? process.argv[3].split(',').map((s) => s.trim()) : [...GIANTS]) as GiantId[];
for (const id of IDS) if (!GIANTS.includes(id)) throw new Error(`not an Abyss giant: ${id}`);

const num = (k: string, d: number) => (process.env[k] !== undefined && process.env[k] !== '' ? Number(process.env[k]) : d);
const FPS = num('FPS', 20);
/** Game steps a second (the reel's own fixed step), so every reel step gets its own press or release. */
const HZ = 60;
const SUB = Math.round(HZ / FPS);
if (SUB * FPS !== HZ) throw new Error('FPS must divide 60');
const PREROLL = num('PREROLL', 4);
const LEAD = num('LEAD', 5.5);
const AFTER = num('AFTER', 9);
const BITE_REACT = num('BITE_REACT', 0.35);
const ROD_STEP = num('ROD_STEP', 7);
const ABYSS_LEVEL = num('ABYSS_LEVEL', 0);
const MARKER = num('MARKER', 1);
const REACT = num('REACT', 0.2);
const SEED = num('SEED', 1);
const MAX_FRAYS = num('MAX_FRAYS', 1);
const MAX_MB = num('MAX_MB', 12);
const CRF = num('CRF', 27);
const AUDIO_ONLY = !!process.env.AUDIO_ONLY;
const BOTS: Record<string, BotStyle> = { edge: EDGE_STYLES[0], 'edge-safe': EDGE_STYLES[1], careful: STYLES[3] };
const BOT_NAME = process.env.BOT ?? 'edge';
const STYLE = BOTS[BOT_NAME];
if (!STYLE) throw new Error(`BOT is one of ${Object.keys(BOTS).join(', ')}`);
const SR = 48000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const fishOf = (id: string) => FISH.find((f) => f.id === id)!;
const mid = (id: string) => Math.round((fishOf(id).minSize + fishOf(id).maxSize) / 2);
const ffmpeg = (args: string[]) => {
  const r = spawnSync(FFMPEG, ['-y', '-hide_banner', ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}\n${r.stderr}`);
  return r.stderr;
};

// ---------------------------------------------------------------------------------------------------------------
// The bot. One function, run in Node for the pre-check and in the page for the fight (from its source), so the two
// fight the same fight. It reads only what the debug state shows: the pull marker (`need`) is `pullAt` times `pull` in
// a surge and `pull` itself in the calm (reel.ts), which is what `botRun` reads off the reel.
// ---------------------------------------------------------------------------------------------------------------
interface BotState {
  holding: boolean;
  desired: boolean;
  queue: { at: number; v: boolean }[];
  t: number;
  k: number;
  rnd: number[];
  react: number;
  style: BotStyle;
  pullAt: number;
  goodMax: number;
  dt: number;
  presses: number;
}
interface ReelView { tension: number; surging: boolean; pull: number; strain: number; frays: number }
function botDecide(b: BotState, st: ReelView): boolean {
  const s = b.style, G = b.goodMax;
  const need = st.surging ? b.pullAt * st.pull : st.pull;
  const take = st.surging ? Math.min(need + s.lo, G - Math.max(0, s.hi) - 0.03) : 0.6;
  const spent = s.push !== undefined && st.tension > G && st.strain * 2 - st.frays > s.push;
  const want = b.desired ? st.tension <= G - s.hi && !spent : st.tension < take;
  if (want !== b.desired) {
    b.desired = want;
    b.queue.push({ at: b.t + b.react * (0.75 + 0.5 * b.rnd[b.k++ % b.rnd.length]), v: want });
  }
  while (b.queue.length && b.queue[0].at <= b.t) {
    const v = b.queue.shift()!.v;
    if (v && !b.holding) b.presses++;
    b.holding = v;
  }
  b.t += b.dt;
  return b.holding;
}
const newBot = (seed: number, pullAt: number): BotState => {
  const r = mulberry(seed);
  return { holding: true, desired: true, queue: [], t: 0, k: 0, rnd: Array.from({ length: 4096 }, () => r()), react: REACT, style: STYLE, pullAt, goodMax: GOOD_MAX, dt: FIGHT_DT, presses: 0 };
};

/** A giant's fight as the server would roll it at this rod and marker (`rollSeaCast`'s gaps), from candidate `c`. */
function candidate(id: GiantId, c: number) {
  const rod = { steps: ROD_STEP, levels: ABYSS_LEVEL };
  const rng = mulberry(c * 7919 + GIANTS.indexOf(id) * 104729 + 13);
  const m = rollFishGaps(seaGaps(4, MARKER, rod), rng, ZONES[4].legendTag);
  const fightSeed = Math.floor(rng() * 4294967296);
  return { d: m.d, tag: m.tag, fightSeed, botSeed: c * 31 + GIANTS.indexOf(id) + 5, rating: seaRating(4, MARKER, rod) };
}
type Cand = ReturnType<typeof candidate>;

/** The pre-check: the candidate fought in Node, step for step as the page will. */
function simulate(c: Cand) {
  const r = new Reel(c.d, mulberry(c.fightSeed));
  const b = newBot(c.botSeed, r.pullAt);
  let steps = 0, surges = 0;
  while (r.status === 'reeling' && steps < 600 * 60) {
    const h = botDecide(b, { tension: r.tension, surging: r.surging, pull: r.pull, strain: r.strain, frays: r.wear.frays });
    const was = r.surgeCount;
    r.update(FIGHT_DT, h);
    if (r.surgeCount > was) surges++;
    steps++;
  }
  return { status: r.status, steps, seconds: +(steps * FIGHT_DT).toFixed(2), frays: r.wear.frays, surges, presses: b.presses, pullAt: r.pullAt };
}

function pickFight(id: GiantId, from: number) {
  for (let c = from; c < from + 40; c++) {
    const cand = candidate(id, c);
    const sim = simulate(cand);
    if (sim.status === 'caught' && sim.frays <= MAX_FRAYS) return { c, cand, sim };
  }
  throw new Error(`${id}: no candidate from seed ${from} lands within ${MAX_FRAYS} frays with BOT=${BOT_NAME} REACT=${REACT}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Encoding the audio log's arguments.
// ---------------------------------------------------------------------------------------------------------------
/** In the page: `args` as plain JSON data, or undefined when any of it isn't plain data (a node, a class instance, a function). */
function encodeArgs(args: unknown[]): unknown[] | undefined {
  const enc = (v: unknown, depth: number): unknown => {
    if (depth > 6) throw 0;
    if (v === undefined) return { $u: 1 };
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? v : { $num: String(v) };
    if (Array.isArray(v)) return v.map((x) => enc(x, depth + 1));
    if (typeof v === 'object') {
      const p = Object.getPrototypeOf(v);
      if (p !== Object.prototype && p !== null) throw 0;
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as object)) o[k] = enc(x, depth + 1);
      return o;
    }
    throw 0;
  };
  const a = [...args];
  while (a.length && a[a.length - 1] === undefined) a.pop();
  try {
    return a.map((x) => enc(x, 0));
  } catch {
    return undefined;
  }
}

interface LogEntry { n: number; t: number; name: string; args: unknown[] }
interface AudioLog { id: string; preroll: number; seconds: number; hz: number; fps: number; frames: number; calls: Record<string, number>; skipped: Record<string, number>; log: LogEntry[] }

// ---------------------------------------------------------------------------------------------------------------
// Servers and the browser.
// ---------------------------------------------------------------------------------------------------------------
let server: ReturnType<typeof spawn> | null = null;
let dataDir = '';
let refused = 0;
const TOKEN = 'giantclip-token-0123456789abcdef';
async function startServer(): Promise<void> {
  // A seasoned angler at sea: top lake gear, the Deep Sea Rod, every fish in the Fishdex at its biggest and every
  // legend's set unlocked, so the landing reads as an ordinary one (no NEW!, no personal best, no piece banner).
  const dex = Object.fromEntries(FISH.filter((f) => f.sea).map((f) => [f.id, { count: 40, best: f.maxSize }]));
  const legends = Object.fromEntries(FISH.filter((f) => f.legend).map((f) => [f.id, 99]));
  const save = { ...newSave(), level: 60, coins: 50000, tips: [...TIP_IDS], rod: 'aurora', line: 'moonsilk', bait: 'pearl', slots: [{ k: 'rod', id: 'aurora' }, { k: 'bait', id: 'pearl', n: 99 }, null, null, null, null, null, null], held: 0, dex, legends, seaRod: true, rodStep: ROD_STEP, abyssLevels: ABYSS_LEVEL, holdLevel: 4, boatParts: 4, abyssRecord: Math.max(1, MARKER) };
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fishing-giantclip-'));
  fs.writeFileSync(path.join(dataDir, 'accounts.json'), JSON.stringify({ giantclip: { name: 'Giantclip', hash: createHash('sha256').update(TOKEN).digest('hex'), save } }));
  server = spawn('npx', ['tsx', 'server/index.ts'], { cwd: ROOT, env: { ...process.env, DATA_DIR: dataDir, PORT: String(SERVER_PORT), DATABASE_URL: '', DISCORD_FEEDBACK_WEBHOOK: '', DISCORD_JOINS_WEBHOOK: '', DISCORD_TIPS_WEBHOOK: '', DEV_USER: 'giantclip', DEV_PASS: 'giantclip-dev-pass', TEST_HOOKS: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  server.stderr!.on('data', (d) => {
    const s = String(d);
    if (/catch refused/.test(s)) refused++;
    process.stderr.write(`[server] ${s}`);
  });
  process.on('exit', () => { try { process.kill(-server!.pid!, 'SIGKILL'); } catch { /* gone */ } });
  await new Promise<void>((res) => server!.stdout!.on('data', (d) => /fishing server on port/.test(String(d)) && res()));
}

let vite!: ViteDevServer;
let browser!: Browser;
async function startBrowser(): Promise<void> {
  process.env.VITE_SERVER_URL = `ws://localhost:${SERVER_PORT}`;
  vite = await createServer({ root: ROOT, server: { port: VITE_PORT, strictPort: true, hmr: false, watch: null }, logLevel: 'error' });
  await vite.listen();
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'], defaultViewport: { width: W, height: H, deviceScaleFactor: 1 }, protocolTimeout: 1_200_000 });
}

// ---------------------------------------------------------------------------------------------------------------
// The picture: the game page, set up once at sea.
// ---------------------------------------------------------------------------------------------------------------
async function gamePage(): Promise<Page> {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(`[page] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/toNonIndexed|WebSocket/.test(m.text())) console.error(`[page] ${m.text()}`); });
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await page.evaluateOnNewDocument((t) => {
    localStorage.setItem('fishing-token', t);
    localStorage.setItem('fishing-news', String(Number.MAX_SAFE_INTEGER));
    localStorage.setItem('fishing-sound', 'on');
    localStorage.setItem('fishing-music', 'on');
  }, TOKEN);
  // The page's timers and CSS animations follow a clock stepped by hand while `__virt` is on (as legendshots.ts).
  await page.evaluateOnNewDocument(() => {
    const realST = window.setTimeout.bind(window), realCT = window.clearTimeout.bind(window);
    let virt = false, now = 0, seq = 1;
    const q = new Map<number, { at: number; fn: () => void }>();
    (window as any).setTimeout = (fn: (...a: unknown[]) => void, ms = 0, ...args: unknown[]) => {
      if (!virt || typeof fn !== 'function') return realST(fn as TimerHandler, ms, ...args);
      const id = -seq++;
      q.set(id, { at: now + ms, fn: () => fn(...args) });
      return id;
    };
    (window as any).clearTimeout = (id: number) => (typeof id === 'number' && id < 0 ? q.delete(id) : realCT(id));
    const hold = () => { for (const a of document.getAnimations()) if (a.playState === 'running') a.pause(); };
    (window as any).__virt = {
      on() { virt = true; now = 0; hold(); },
      off() {
        virt = false;
        for (const t of q.values()) realST(t.fn, Math.max(0, t.at - now));
        q.clear();
        for (const a of document.getAnimations()) if (a.playState === 'paused') a.play();
      },
      advance(ms: number) {
        now += ms;
        for (const a of document.getAnimations()) { if (a.playState === 'running') a.pause(); a.currentTime = (Number(a.currentTime) || 0) + ms; }
        // In time order, including timers set by the ones that run.
        for (;;) {
          let best: [number, { at: number; fn: () => void }] | null = null;
          for (const e of q) if (e[1].at <= now && (!best || e[1].at < best[1].at)) best = e;
          if (!best) break;
          q.delete(best[0]);
          best[1].fn();
        }
      },
      hold,
    };
  });
  // A cast's roll is swapped for the giant on its way in from the server (only this page sees it).
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
              (window as any).__forcedFrom = { fishId: m.fishId, d: m.d, tag: m.tag };
              Object.assign(m, { fishId: f.id, size: f.size, shiny: false, wait: f.wait, d: f.d, seed: f.seed });
              if (f.tag) m.tag = f.tag;
              else delete m.tag;
              delete m.lured;
              return fn.call(this, { data: JSON.stringify(m) });
            }
          }
          return fn.call(this, e);
        });
      },
    });
  });
  await page.goto(`http://localhost:${VITE_PORT}/?name=Giantclip&room=giantclip`, { waitUntil: 'load' });
  await page.waitForFunction(() => (window as any).__game?.online() && (window as any).__game.world.hub, { timeout: 90000 });
  await page.evaluate(() => (window as any).__game.activate());
  await sleep(600);
  const say = async (text: string) => { await page.evaluate((t) => (window as any).__game.cmd(t), text); await sleep(400); };
  await say('/login giantclip giantclip-dev-pass');
  await page.addStyleTag({ content: '#chat, #chatbox, #devprompt { display: none !important; }' });
  await say(`/rodstep ${ROD_STEP}`);
  await say(`/abysslevel ${ABYSS_LEVEL}`);
  await say(`/sea 4 ${MARKER}`);
  await page.waitForFunction(() => (window as any).__game.world.sea && document.getElementById('castoff')!.classList.contains('hidden'), { timeout: 90000 });
  await sleep(1500);
  // The sea's look eases toward a new zone's: snap it, as arriving on a fresh charter does.
  await page.evaluate(() => { const G = (window as any).__game; G.world.setDepth(G.seaDepth(), true); });
  // The Abyss's random lurkers (the Leviathan in the swell, the Kraken's arms, the Dreamer's eyes) put away, so the
  // only giant in the clip is the one on the line (LURK=1 leaves them on).
  if (!process.env.LURK) await page.evaluate(() => { const L = (window as any).__game.world.sea?.lurk; if (L) { L.auto = false; L.hide(); } });
  // Every call made on the game's `audio` instance is logged while `__audioLog` is set. The module is the game's own
  // (the same URL, so the same instance). Generic: every method on its prototype chain and every function of its own,
  // so methods added later are caught. Only the game's calls: not those one audio method makes of another (`depth`),
  // nor those from the sound modules' own timers (the caller's file), since the replay makes those itself.
  await page.evaluate(`window.__encodeArgs = ${encodeArgs.toString()}`);
  const wrapped = await page.evaluate(async () => {
    const W = window as any;
    const { audio } = await import('/src/game/audio.ts' as string);
    W.__audioLog = null;
    W.__audioSkipped = {};
    W.__clipN = 0;
    const internal = /\/src\/game\/(audio|giantsound|bandsound|rocketsound|seamix)\.ts/;
    let depth = 0;
    const names = new Set<string>();
    for (let p = Object.getPrototypeOf(audio); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
      for (const k of Object.getOwnPropertyNames(p)) if (k !== 'constructor' && typeof Object.getOwnPropertyDescriptor(p, k)?.value === 'function') names.add(k);
    }
    for (const k of Object.getOwnPropertyNames(audio)) if (typeof (audio as any)[k] === 'function') names.add(k);
    const enc = W.__encodeArgs as (a: unknown[]) => unknown[] | undefined;
    for (const k of names) {
      const fn = (audio as any)[k];
      (audio as any)[k] = function (this: unknown, ...args: unknown[]) {
        if (depth === 0 && W.__audioLog) {
          const caller = (new Error().stack ?? '').split('\n')[2] ?? '';
          if (!internal.test(caller)) {
            const a = enc(args);
            if (a) W.__audioLog.push({ n: W.__clipN, name: k, args: a });
            else W.__audioSkipped[k] = (W.__audioSkipped[k] ?? 0) + 1;
          }
        }
        depth++;
        try { return fn.apply(this, args); } finally { depth--; }
      };
    }
    return [...names];
  });
  console.log(`audio: logging ${wrapped.length} methods`);
  return page;
}

interface FrameRow { t: number; phase: string; progress?: number; fightLeft?: number; surging?: boolean; warning?: boolean; tension?: number; holding: boolean; [k: string]: unknown }

/** One giant's picture, its timeline and its audio log; false when the fight was lost (try another seed). */
async function record(page: Page, id: GiantId, pick: ReturnType<typeof pickFight>): Promise<{ ok: boolean; why?: string; summary?: Record<string, unknown> }> {
  const { cand, sim } = pick;
  const size = mid(id);
  const framesDir = path.join(OUT, `${id}-frames`);
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });
  // Back to the spawn on the deck, looking where the game faces the player; any last catch put away.
  await page.evaluate(() => {
    const G = (window as any).__game;
    if (G.state().phase === 'result') G.press();
    G.hold(false);
    G.day(0.45);
    G.teleport(-1.6, 0.3);
    G.look(0, -0.12);
    document.getElementById('banner')?.classList.add('hidden');
  });
  await sleep(1500);
  const LONG_WAIT = 60;
  await page.evaluate((f) => { (window as any).__force = f; }, { id, size, tag: cand.tag, wait: LONG_WAIT, d: cand.d, seed: cand.fightSeed });
  let cast = false;
  for (let attempt = 0; attempt < 4 && !cast; attempt++) {
    await page.evaluate(() => { const G = (window as any).__game; if (G.state().phase === 'result') G.press(); });
    await sleep(300);
    await page.evaluate(() => (window as any).__game.press());
    await sleep(400);
    await page.evaluate(() => { const G = (window as any).__game; G.setPower(0.75); G.release(); });
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      const ph = await page.evaluate(() => (window as any).__game.state().phase as string);
      if (ph === 'waiting') { cast = true; break; }
      await sleep(50);
    }
  }
  await page.evaluate(() => { (window as any).__force = null; });
  if (!cast) return { ok: false, why: 'could not cast' };
  const forcedFrom = await page.evaluate(() => (window as any).__forcedFrom);
  // Past the server's own wait for its roll (2.5 to 6.5 s), so the strike isn't early by its clock.
  await sleep(7000);
  const preFrames = Math.round(PREROLL * FPS);
  const PRE_N = preFrames * SUB;
  await page.evaluate((left, pullAt, bot, botDecideSrc) => {
    const W = window as any, G = W.__game;
    G.freeze(true);
    W.__virt.on();
    G.waitLeft(left);
    W.__audioLog = [];
    W.__audioSkipped = {};
    W.__clipN = 0;
    W.__fight = { biteN: -1, hookN: -1, endN: -1, status: null, bot: null, botInit: bot, pullAt, reelSteps: 0, released: false };
    W.__botDecide = new Function(`return (${botDecideSrc})`)();
  }, PREROLL + LEAD, sim.pullAt, newBot(cand.botSeed, sim.pullAt), botDecide.toString());

  const rows: FrameRow[] = [];
  const wall0 = Date.now();
  let k = 0;
  let endN = -1;
  let status: string | null = null;
  const MAX_FRAMES = Math.round((PREROLL + LEAD + 240) * FPS);
  for (; k < MAX_FRAMES; k++) {
    const st = await page.evaluate((sub, hz, biteReact) => {
      const W = window as any, G = W.__game, V = W.__virt, F = W.__fight;
      for (let i = 0; i < sub; i++) {
        const n = W.__clipN;
        V.advance(1000 / hz);
        let s = G.state();
        if (s.phase === 'bite' && F.biteN < 0) F.biteN = n;
        if (s.phase === 'bite' && F.biteN >= 0 && (n - F.biteN) / hz >= biteReact && F.hookN < 0) {
          G.press();
          F.hookN = n;
          s = G.state();
        }
        if (s.phase === 'reeling' && s.status === 'reeling') {
          if (!F.bot) F.bot = JSON.parse(JSON.stringify(F.botInit));
          G.hold(W.__botDecide(F.bot, { tension: s.tension, surging: !!s.surging, pull: s.pull, strain: s.strain, frays: s.frays }));
          F.reelSteps++;
        } else if (F.bot && !F.released) {
          // The fight is over: the button comes up.
          F.released = true;
          G.hold(false);
        }
        G.step(1 / hz);
        W.__clipN = n + 1;
        if (F.hookN >= 0 && F.endN < 0) {
          const after = G.state();
          if (after.phase !== 'reeling') { F.endN = n + 1; F.status = after.status ?? after.phase; }
        }
        // Missed the bite, or something else put the cast away.
        if (F.hookN < 0 && F.biteN >= 0 && G.state().phase === 'idle') { F.endN = n + 1; F.status = 'missed'; }
      }
      V.hold();
      return { ...G.state(), holding: !!F.bot?.holding && !F.released, n: W.__clipN, endN: F.endN, fstatus: F.status, biteN: F.biteN, hookN: F.hookN, reelSteps: F.reelSteps, presses: F.bot?.presses ?? 0 };
    }, SUB, HZ, BITE_REACT);
    endN = st.endN;
    status = st.fstatus;
    if (k >= preFrames) {
      const kk = k - preFrames;
      await page.screenshot({ path: path.join(framesDir, `f${String(kk).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 88 });
      const { n: _n, endN: _e, fstatus: _f, biteN: _b, hookN: _h, reelSteps: _r, presses: _p, ...state } = st;
      rows.push({ t: +(kk / FPS).toFixed(3), ...state });
    }
    if (endN >= 0 && status !== 'caught') break;
    if (endN >= 0 && st.n >= endN + AFTER * HZ) { k++; break; }
    // Never faster than the game's own clock: the server checks a catch against the time since the bite.
    const ahead = ((k + 1) / FPS) * 1000 - (Date.now() - wall0);
    if (ahead > 0) await sleep(ahead);
    if (k % (FPS * 10) === 0) console.log(`${id}: ${((k - preFrames) / FPS).toFixed(0)} s on the clip, ${st.phase}${st.progress !== undefined ? `, progress ${(+st.progress).toFixed(2)}` : ''}`);
  }
  const fight = await page.evaluate(() => {
    const W = window as any;
    const F = W.__fight;
    const out = { biteN: F.biteN, hookN: F.hookN, endN: F.endN, status: F.status, reelSteps: F.reelSteps, presses: F.bot?.presses ?? 0, log: W.__audioLog, skipped: W.__audioSkipped };
    W.__audioLog = null;
    W.__virt.off();
    W.__game.freeze(false);
    W.__game.hold(false);
    return out;
  });
  if (fight.status !== 'caught') {
    fs.rmSync(framesDir, { recursive: true, force: true });
    return { ok: false, why: `fight ended ${fight.status}` };
  }
  const frames = rows.length;
  const tOf = (n: number) => +((n - PRE_N) / HZ).toFixed(4);
  const calls: Record<string, number> = {};
  const log: LogEntry[] = (fight.log as { n: number; name: string; args: unknown[] }[]).map((e) => {
    calls[e.name] = (calls[e.name] ?? 0) + 1;
    return { n: e.n, t: tOf(e.n), name: e.name, args: e.args };
  });
  const audioLog: AudioLog = { id, preroll: PREROLL, seconds: frames / FPS, hz: HZ, fps: FPS, frames, calls, skipped: fight.skipped, log };
  fs.writeFileSync(path.join(OUT, `${id}-audio-log.json`), JSON.stringify(audioLog));
  const summary = {
    id, fish: fishOf(id).name, size, rating: cand.rating, rodStep: ROD_STEP, abyssLevel: ABYSS_LEVEL, marker: MARKER,
    gaps: cand.d, tag: cand.tag, fightSeed: cand.fightSeed, candidate: pick.c, bot: { name: BOT_NAME, style: STYLE, react: REACT, seed: cand.botSeed },
    precheck: sim,
    fight: { status: fight.status, seconds: +(fight.reelSteps / HZ).toFixed(2), reelSteps: fight.reelSteps, matchesPrecheck: fight.reelSteps === sim.steps, presses: fight.presses, frays: Math.max(0, ...rows.map((r) => (typeof r.frays === 'number' ? r.frays : 0))) },
    moments: { bite: tOf(fight.biteN), hook: tOf(fight.hookN), reelEnd: tOf(fight.endN) },
    clip: { seconds: frames / FPS, frames, fps: FPS, preroll: PREROLL, lead: LEAD, after: AFTER },
    serverRoll: forcedFrom,
    serverRefusedCatches: refused,
  };
  fs.writeFileSync(path.join(OUT, `${id}-timeline.json`), JSON.stringify({ ...summary, note: 't: clip seconds when the frame shows (the state after its game steps); the other fields are __game.state() as it is, plus holding (the bot\'s button)', frames: rows }));
  // The picture alone, re-encoded with a higher CRF until the clip fits.
  const pic = path.join(OUT, `${id}-picture.mp4`);
  const audioBytes = (160_000 / 8) * (frames / FPS) * 1.05;
  for (let crf = CRF; ; crf += 2) {
    ffmpeg(['-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(framesDir, 'f%05d.jpg'), '-vf', 'scale=960:540', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', String(crf), '-preset', 'slow', '-movflags', '+faststart', pic]);
    const mb = (fs.statSync(pic).size + audioBytes) / 1e6;
    if (mb <= MAX_MB || crf >= 40) { console.log(`${id}-picture.mp4: ${frames} frames at ${FPS} fps, CRF ${crf}, ${(fs.statSync(pic).size / 1e6).toFixed(2)} MB`); break; }
  }
  if (!process.env.KEEP_FRAMES) fs.rmSync(framesDir, { recursive: true, force: true });
  console.log(`${id}: ${JSON.stringify(summary.fight)}, clip ${summary.clip.seconds} s, real ${((Date.now() - wall0) / 1000).toFixed(0)} s`);
  return { ok: true, summary };
}

// ---------------------------------------------------------------------------------------------------------------
// The sound: the log replayed into the game's audio module on an offline clock.
// ---------------------------------------------------------------------------------------------------------------
interface ReplayResult { band?: { bar: number | null; music: boolean }; chunks: number; frames: number; stats: { peak: number[]; rms: number[]; clipped: number[] }; calls: Record<string, number>; errors: Record<string, string>; timers: number; skippedNames: string[] }

async function replay(id: GiantId): Promise<void> {
  const logFile = path.join(OUT, `${id}-audio-log.json`);
  if (!fs.existsSync(logFile)) throw new Error(`${id}: no audio log at ${logFile}`);
  const al = JSON.parse(fs.readFileSync(logFile, 'utf8')) as AudioLog;
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(`[replay] ${e.message}`));
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warn') && !/Failed to load resource/.test(m.text())) console.error(`[replay] ${m.text()}`); });
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  // Any page of the Vite server, for its origin: the game's modules are imported from it. Not run, only shown.
  await page.goto(`http://localhost:${VITE_PORT}/src/game/audio.ts`, { waitUntil: 'load' });
  const t0 = Date.now();
  const r: ReplayResult = await page.evaluate(async (al: AudioLog, sr: number) => {
    const Win = window as any;
    const total = Math.round((al.preroll + al.seconds) * al.hz);
    const seconds = total / al.hz;
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
    // Inside a suspend callback an offline context reads "suspended"; the game's audio checks for "running".
    Object.defineProperty(ctx, 'state', { configurable: true, get: () => 'running' });
    // `start()` resumes a context it already has; the offline one only resumes from our own ticks.
    const realResume = ctx.resume.bind(ctx);
    (ctx as any).resume = () => Promise.resolve();
    Win.AudioContext = function AudioContext() { return ctx; };
    Win.webkitAudioContext = Win.AudioContext;

    // The page's clocks and timers on the offline clock: `vnow` ms since the render's start.
    const firstBand = al.log.find((e) => e.name === 'band');
    const base = firstBand && typeof firstBand.args[2] === 'number' ? (firstBand.args[2] as number) - (firstBand.n / al.hz) * 1000 : Date.now();
    let vnow = 0;
    Date.now = () => Math.round(base + vnow);
    Object.defineProperty(performance, 'now', { configurable: true, value: () => vnow });
    let seq = 1;
    let fired = 0;
    const timers = new Map<number, { at: number; fn: () => void; every?: number }>();
    Win.setTimeout = (fn: unknown, ms = 0, ...args: unknown[]) => {
      if (typeof fn !== 'function') return 0;
      const id = seq++;
      timers.set(id, { at: vnow + Math.max(0, Number(ms) || 0), fn: () => fn(...args) });
      return id;
    };
    Win.setInterval = (fn: unknown, ms = 0, ...args: unknown[]) => {
      if (typeof fn !== 'function') return 0;
      const id = seq++;
      const every = Math.max(1, Number(ms) || 0);
      timers.set(id, { at: vnow + every, fn: () => fn(...args), every });
      return id;
    };
    Win.clearTimeout = Win.clearInterval = (id: number) => { timers.delete(id); };
    Win.requestAnimationFrame = (fn: (t: number) => void) => Win.setTimeout(() => fn(vnow), 1000 / 60);
    const runTimers = () => {
      for (;;) {
        let best: [number, { at: number; fn: () => void; every?: number }] | null = null;
        for (const e of timers) if (e[1].at <= vnow && (!best || e[1].at < best[1].at)) best = e;
        if (!best) return;
        const [tid, tm] = best;
        if (tm.every) tm.at += tm.every;
        else timers.delete(tid);
        fired++;
        try { tm.fn(); } catch (e) { console.error(`timer: ${e}`); }
      }
    };

    localStorage.setItem('fishing-sound', 'on');
    localStorage.setItem('fishing-music', 'on');
    const mod = await import('/src/game/audio.ts' as string);
    const audio = mod.audio as any;
    audio.start();

    const decode = (v: any): any => {
      if (Array.isArray(v)) return v.map(decode);
      if (v && typeof v === 'object') {
        if (v.$u === 1 && Object.keys(v).length === 1) return undefined;
        if (typeof v.$num === 'string' && Object.keys(v).length === 1) return Number(v.$num);
        const o: Record<string, unknown> = {};
        for (const [k, x] of Object.entries(v)) o[k] = decode(x);
        return o;
      }
      return v;
    };
    // Not replayed: starting the sound (done above), the switches, and the test hooks' readings.
    const SKIP = new Set(['start', 'toggleSound', 'toggleMusic', 'musicLevel', 'bandState']);
    const byN: { name: string; args: unknown[] }[][] = [];
    for (const e of al.log) (byN[e.n] ??= []).push(e);
    const calls: Record<string, number> = {};
    const errors: Record<string, string> = {};
    const skippedNames = new Set<string>();
    const run = (n: number) => {
      vnow = (n / al.hz) * 1000;
      runTimers();
      for (const e of byN[n] ?? []) {
        if (SKIP.has(e.name)) { skippedNames.add(e.name); continue; }
        const f = audio[e.name];
        if (typeof f !== 'function') { errors[e.name] = 'not a method here'; continue; }
        const args = decode(e.args);
        // The shared clock as the offline clock has it (the stepped run's wall clock is not the game's).
        if (e.name === 'band') args[2] = Date.now();
        try { f.apply(audio, args); calls[e.name] = (calls[e.name] ?? 0) + 1; } catch (err) { errors[e.name] = String(err); }
      }
    };
    run(0);
    const next = (n: number): void => {
      if (n >= total) return;
      ctx.suspend(n / al.hz).then(() => {
        run(n);
        next(n + 1);
        return realResume();
      });
    };
    next(1);
    const buf = await ctx.startRendering();
    // Cut the pre-roll, keep the clip: 16-bit stereo, interleaved.
    const skip = Math.round(al.preroll * sr);
    const len = Math.round(al.seconds * sr);
    const chans = [buf.getChannelData(0), buf.getChannelData(1)];
    const pcm = new Int16Array(len * 2);
    const peak = [0, 0], sum = [0, 0], clipped = [0, 0];
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < 2; c++) {
        const x = chans[c][skip + i] ?? 0;
        const a = Math.abs(x);
        if (a > peak[c]) peak[c] = a;
        if (a >= 0.999) clipped[c]++;
        sum[c] += x * x;
        pcm[i * 2 + c] = Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
      }
    }
    // Handed back in chunks of base64.
    const bytes = new Uint8Array(pcm.buffer);
    const CH = 1 << 20;
    Win.__wavChunks = [];
    for (let i = 0; i < bytes.length; i += CH) {
      let s = '';
      const part = bytes.subarray(i, i + CH);
      for (let j = 0; j < part.length; j += 0x8000) s += String.fromCharCode(...part.subarray(j, j + 0x8000));
      Win.__wavChunks.push(btoa(s));
    }
    const band = audio.bandState?.();
    return { band, chunks: Win.__wavChunks.length, frames: len, stats: { peak, rms: sum.map((s) => Math.sqrt(s / len)), clipped }, calls, errors, timers: fired, skippedNames: [...skippedNames] };
  }, al as any, SR);
  const parts: Buffer[] = [];
  for (let i = 0; i < r.chunks; i++) parts.push(Buffer.from(await page.evaluate((i) => (window as any).__wavChunks[i] as string, i), 'base64'));
  await page.close();
  const pcm = Buffer.concat(parts);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22);
  head.writeUInt32LE(SR, 24); head.writeUInt32LE(SR * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(pcm.length, 40);
  const wav = path.join(OUT, `${id}.wav`);
  fs.writeFileSync(wav, Buffer.concat([head, pcm]));
  const db = (x: number) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf');
  console.log(`${id}.wav: ${(r.frames / SR).toFixed(2)} s rendered in ${((Date.now() - t0) / 1000).toFixed(0)} s; peak ${r.stats.peak.map(db).join('/')} dBFS, RMS ${r.stats.rms.map(db).join('/')} dBFS, clipped samples ${r.stats.clipped.join('/')}; ${r.timers} virtual timers fired; music's last bar ${r.band?.bar ?? 'none'}`);
  if (Object.keys(r.errors).length) console.error(`${id}: replay errors ${JSON.stringify(r.errors)}`);
  // Mux onto the picture, and a spectrogram of the sound.
  const pic = path.join(OUT, `${id}-picture.mp4`);
  if (!fs.existsSync(pic)) throw new Error(`${id}: no picture at ${pic}`);
  const mp4 = path.join(OUT, `${id}.mp4`);
  ffmpeg(['-loglevel', 'error', '-i', pic, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', mp4]);
  const vd = ffmpeg(['-i', mp4, '-map', '0:a', '-af', 'volumedetect', '-f', 'null', '-']);
  const vol = (k: string) => vd.match(new RegExp(`${k}: (-?[\\d.]+|-inf) dB`))?.[1];
  ffmpeg(['-loglevel', 'error', '-i', wav, '-lavfi', `showspectrumpic=s=${Math.min(3600, Math.max(1200, Math.round(r.frames / SR) * 24))}x600:mode=combined:legend=1:scale=log:fscale=log:stop=8000`, path.join(OUT, `${id}-spectrum.png`)]);
  console.log(`${id}.mp4: ${(fs.statSync(mp4).size / 1e6).toFixed(2)} MB; volumedetect mean ${vol('mean_volume')} dB, max ${vol('max_volume')} dB`);
  fs.writeFileSync(path.join(OUT, `${id}-audio-stats.json`), JSON.stringify({ ...r, chunks: undefined, seconds: r.frames / SR, volumedetect: { mean: vol('mean_volume'), max: vol('max_volume') } }, null, 1));
}

try {
  if (!AUDIO_ONLY) await startServer();
  await startBrowser();
  if (!AUDIO_ONLY) {
    const page = await gamePage();
    for (const id of IDS) {
      let from = SEED;
      let done = false;
      for (let tries = 0; tries < 4 && !done; tries++) {
        const pick = pickFight(id, from);
        console.log(`${id}: candidate ${pick.c}, gaps ${JSON.stringify(pick.cand.d)} (${pick.cand.rating}), pre-check ${pick.sim.status} in ${pick.sim.seconds} s, ${pick.sim.frays} frays, ${pick.sim.surges} surges`);
        const r = await record(page, id, pick);
        if (r.ok) done = true;
        else { console.error(`${id}: ${r.why}; next seed`); from = pick.c + 1; }
      }
      if (!done) throw new Error(`${id}: no fight filmed`);
    }
    await page.close();
  }
  for (const id of IDS) await replay(id);
} finally {
  await browser?.close();
  await vite?.close();
  if (server) { try { process.kill(-server.pid!, 'SIGTERM'); } catch { /* gone */ } }
  if (dataDir) { try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* still writing */ } }
}
process.exit(0);

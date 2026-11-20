// Stages the landed-fish moment in the real game, headlessly: everyday fish against their zone's legends, and fights.
// Each fish is landed at its mid size with the debug `G.land` in the place it is caught, from the player's own view
// (the lake's pier end, or the charter boat's spawn at sea, looking where the game faces the player). Two frames a fish:
// `<id>-hud.jpg` (the catch card, banner and charter strip as the player sees them; the chat, which only holds the
// staging's dev commands, is hidden) and `<id>-clean.jpg` (every overlay hidden). The fight frames (`<id>-fight*.jpg`)
// come from a real cast whose bite is swapped on its way in from the server for the wanted fish (the client builds the
// fish in the water from that message). Then two contact sheets from the frames, and `measure.json` with each fish's
// box on screen (projected from its model's vertices). The Abyss's random lurkers are put away (LURK=1 keeps them).
//
//   npx tsx scripts/legendshots.ts <out dir> [only ids, comma-separated]
//
// TAG=feisty (or brutish) gives every staged fish that tag (landings and fights).
// SHINY=1 lands (and fights) every staged fish shiny.
// FRESH=1: no legend landed yet, so each staged legend's landing is its first and unlocks a piece of its set.
// RISE="0.5,0.9" (seconds): `<id>-rise-<n>` frames that long after a surfacing (Abyss) legend starts to come up
//   (its bolt lands half-way up its rise).
// SINK="0.5,1.1" (seconds): after a surfacing (Abyss) legend's clean frame its card is put away and `<id>-sink-<n>`
//   frames are taken that long into its send-off.
// CLIP=6 (seconds): each Abyss legend's landing is also recorded from the moment it starts up, as `<id>.mp4` (H.264,
//   needs ffmpeg) with its frames in `<id>-clip/` and a strip of every `STRIP`th second (default 0.5) as `<id>-strip.jpg`
//   left to the caller. The game's clock is stepped by hand, FPS (default 20) frames a second of the game's time, so a
//   busy machine can't spoil the timing; the page's timers and CSS animations are stepped with it. CLIP_CLEAN=1 hides the overlays.
// PROBE=1: after a surfacing (Abyss) legend's clean frame, the scene is drawn 120 times over with it and without it
//   (three rounds, the best of each kept) and the milliseconds a draw are logged: what the giant costs a frame here.
// SEA_TIME=100 (seconds): the sea's clock when each fish is landed (the same swell every run; another value another moment of it).
// The fights: WAIT (seconds, default 1.2) is the staged cast's wait for the bite (an Abyss legend's tell by the bobber
//   takes its last 3.6 s: use WAIT=6); SHADOW_AFTER="350" (ms, a list) when the `-shadow` frames are taken after the
//   wait is set to 4 s left; BITE_AFTER="280" (ms, a list) the `-bite` frames after the bite (a list catches the bolt);
//   FIGHT_AT="1.5,3.5" (seconds, a list) the fight's frames, each logged with whether the fish is surging.
// Its own server and Vite on MOMENT_PORT (8831) and MOMENT_VITE_PORT (5331).
import { spawn } from 'node:child_process';
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
// TOUCH=1: a phone's touch layout (1400x647 at DPR 1, `?touch`), for checking nothing is lost on a phone.
const TOUCH = !!process.env.TOUCH;
const W = TOUCH ? 1400 : 1280, H = TOUCH ? 647 : 720;
const OUT = path.resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('usage: moment-shots.ts <out dir> [ids]');
const ONLY = process.argv[3] ? new Set(process.argv[3].split(',')) : null;
/** Seconds after the catch card comes up: the HUD frame (the legend banner holds 4.6 s), then the clean one once the swing has settled. */
const HUD_AT = Number(process.env.HUD_AT ?? 2.2);
/** A legend's card holds back a beat: its `-beat` frame comes in that beat, its `-hud` once the card is in. */
const LEGEND_BEAT_AT = Number(process.env.BEAT_AT ?? 0.8);
const LEGEND_HUD_AT = Number(process.env.LEGEND_HUD_AT ?? 3.0);
const CLEAN_AT = Number(process.env.CLEAN_AT ?? 6);
const list = (v: string | undefined, d: string) => (v ?? d).split(',').filter((x) => x.trim() !== '').map(Number).filter((n) => Number.isFinite(n));
const SINK = list(process.env.SINK, '');
const RISE = list(process.env.RISE, '');
const WAIT = Number(process.env.WAIT ?? 1.2);
const SHINY = !!process.env.SHINY;
const CLIP = Number(process.env.CLIP ?? 0);
const FPS = Number(process.env.FPS ?? 20);
const SHADOW_AFTER = list(process.env.SHADOW_AFTER, '350');
const BITE_AFTER = list(process.env.BITE_AFTER, '280');
const FIGHT_AT = list(process.env.FIGHT_AT, '1.5,3.5');
/** `-2`, `-3` … after the first of a run of frames. */
const nth = (k: number) => (k === 0 ? '' : `-${k + 1}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const DAY = 0.45, NIGHT = 0.75;
/** The game's own spawn view: yaw 0 out over the water, and the camera's starting pitch (`World.pitch`). */
const LOOK: [number, number] = [0, -0.12];
/** The lake's pier end (where the README's fishing shots stand). */
const PIER: [number, number] = [0.2, -8.4];
/**
 * Where on the deck the sea's fish are landed from (x, z on the boat, and the view's yaw): the spawn by default, or
 * `SPOTS="bow:4.5,0,0|far:-1.6,-1.5,3.14"` to land each fish from every spot listed (each frame named `<id>-<spot>`).
 */
type Spot = { name: string; at: [number, number]; yaw: number };
const SPOTS: Spot[] = process.env.SPOTS
  ? process.env.SPOTS.split('|').map((s) => { const [name, v] = s.split(':'); const [x, z, yaw] = v.split(',').map(Number); return { name, at: [x, z], yaw }; })
  : [{ name: '', at: [-1.6, 0.3], yaw: LOOK[0] }];
type Place = { key: string; label: string; zone: number | null; fish: { id: string; day: number; suffix?: string }[]; fights?: string[] };
const PLACES: Place[] = [
  { key: 'lake', label: 'Lake (pond pier)', zone: null, fish: [{ id: 'carp', day: DAY }, { id: 'gar', day: DAY }, { id: 'sturgeon', day: DAY }, { id: 'constellation', day: NIGHT }] },
  { key: 'shelf', label: 'The Shelf', zone: 0, fish: [{ id: 'pewtercod', day: DAY }, { id: 'grouper', day: DAY }], fights: ['pewtercod'] },
  { key: 'dropoff', label: 'The Drop-off', zone: 1, fish: [{ id: 'irontuna', day: DAY }, { id: 'marlin', day: DAY }] },
  { key: 'kelp', label: 'Kelp Deep', zone: 2, fish: [{ id: 'wolfeel', day: DAY }, { id: 'kelpbeard', day: DAY }, { id: 'kelpwyrm', day: DAY }] },
  { key: 'twilight', label: 'The Twilight', zone: 3, fish: [{ id: 'fangjaw', day: DAY }, { id: 'oarfish', day: DAY }, { id: 'chandelier', day: DAY }], fights: ['oarfish'] },
  { key: 'twilight-night', label: 'The Twilight (night)', zone: 3, fish: [{ id: 'fangjaw', day: NIGHT, suffix: '-night' }, { id: 'oarfish', day: NIGHT, suffix: '-night' }, { id: 'chandelier', day: NIGHT, suffix: '-night' }] },
  { key: 'abyss', label: 'The Abyss', zone: 4, fish: [{ id: 'boneserpent', day: DAY }, { id: 'leviathan', day: DAY }, { id: 'dreamer', day: DAY }, { id: 'kraken', day: DAY }], fights: ['kraken'] },
];
const fishOf = (id: string) => FISH.find((f) => f.id === id)!;
const mid = (id: string) => Math.round((fishOf(id).minSize + fishOf(id).maxSize) / 2);
const BAIT_FOR_TIER = ['worm', 'fly', 'minnow', 'lure', 'pearl'];

// A seasoned angler: top lake gear, the Deep Sea Rod, every fish here already in the Fishdex at its biggest (so the
// card reads as an ordinary landing: no NEW!, no personal best) and every legend's set unlocked (no piece banner).
const allIds = PLACES.flatMap((p) => p.fish.map((f) => f.id));
const dex = Object.fromEntries(allIds.map((id) => [id, { count: 40, best: fishOf(id).maxSize }]));
const legends = process.env.FRESH ? {} : Object.fromEntries(FISH.filter((f) => f.legend).map((f) => [f.id, 99]));
const save = { ...newSave(), level: 60, coins: 50000, tips: [...TIP_IDS], rod: 'aurora', line: 'moonsilk', bait: 'pearl', slots: [{ k: 'rod', id: 'aurora' }, { k: 'bait', id: 'pearl', n: 99 }, null, null, null, null, null, null], held: 0, dex, legends, seaRod: true, rodStep: 0, holdLevel: 4 };
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fishing-moment-'));
const TOKEN = 'moment-token-0123456789abcdef';
fs.writeFileSync(path.join(dataDir, 'accounts.json'), JSON.stringify({ moment: { name: 'Moment', hash: createHash('sha256').update(TOKEN).digest('hex'), save } }));
const server = spawn('npx', ['tsx', 'server/index.ts'], { env: { ...process.env, DATA_DIR: dataDir, PORT: String(SERVER_PORT), DATABASE_URL: '', DISCORD_FEEDBACK_WEBHOOK: '', DISCORD_JOINS_WEBHOOK: '', DISCORD_TIPS_WEBHOOK: '', DEV_USER: 'moment', DEV_PASS: 'moment-dev-pass', TEST_HOOKS: '1' }, stdio: ['ignore', 'pipe', 'inherit'], detached: true });
process.on('exit', () => { try { process.kill(-server.pid!, 'SIGKILL'); } catch { /* gone */ } });
await new Promise<void>((res) => server.stdout!.on('data', (d) => /fishing server on port/.test(String(d)) && res()));
process.env.VITE_SERVER_URL = `ws://localhost:${SERVER_PORT}`;
const vite = await createServer({ server: { port: VITE_PORT, strictPort: true, hmr: false, watch: null }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: W, height: H, deviceScaleFactor: 1, isMobile: TOUCH, hasTouch: TOUCH }, protocolTimeout: 600_000 });

/** Every overlay the clean frames hide (the lens spray and vignette are the scene's own). */
// KEEP="#banner" keeps those overlays in the clean frames and shoots a legend's beat frame clean too (a photo with
// only LEGEND LANDED! over the scene, as for the What's new board).
const KEEP = (process.env.KEEP ?? '').split(',').map((k) => k.trim()).filter(Boolean);
const OVERLAYS = '#crosshair, #gauge, #alert, #hud, #divehud, #fishtag, #ctx, #prompt, #verdict, #guide, #heldname, #hotbar, #seagear, #help, #catch, #banner, #toast, #tip, #emotewheel'
  .split(', ').filter((o) => !KEEP.includes(o)).join(', ');
const measures: Record<string, unknown> = {};

async function shoot(page: Page, name: string, clean: boolean): Promise<void> {
  await page.evaluate((c) => document.documentElement.classList.toggle('moment-clean', c), clean);
  await sleep(clean ? 60 : 0);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 85 });
  await page.evaluate(() => document.documentElement.classList.remove('moment-clean'));
}

/** The staged fish's box on screen, from its meshes' vertices (pixels; `cut` when part of it is off screen or behind the camera). */
async function measure(page: Page): Promise<unknown> {
  return page.evaluate((W, H) => {
    const o = (window as any).__fishObj;
    const w = (window as any).__game.world;
    if (!o) return null;
    o.updateMatrixWorld(true);
    const cam = w.camera;
    cam.updateMatrixWorld(true);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const V = o.position.constructor;
    const v = new V();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, behind = 0, n = 0;
    o.traverse((m: any) => {
      if (!m.isMesh || !m.visible || !m.geometry?.attributes?.position) return;
      const p = m.geometry.attributes.position;
      const step = Math.max(1, Math.floor(p.count / 400));
      for (let i = 0; i < p.count; i += step) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).applyMatrix4(cam.matrixWorldInverse);
        n++;
        // Behind (or level with) the lens: off the picture; it would project to nonsense.
        if (-v.z < cam.near) { behind++; continue; }
        v.applyMatrix4(cam.projectionMatrix);
        const sx = (v.x + 1) / 2 * W, sy = (1 - v.y) / 2 * H;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
    });
    const r = (k: number) => Math.round(k);
    // The box as projected (past the screen's edges when cut), and the part of it on screen.
    const cx0 = Math.max(0, x0), cy0 = Math.max(0, y0), cx1 = Math.min(W, x1), cy1 = Math.min(H, y1);
    return { x0: r(x0), y0: r(y0), x1: r(x1), y1: r(y1), w: r(x1 - x0), h: r(y1 - y0), onScreen: { w: r(cx1 - cx0), h: r(cy1 - cy0) }, behindLens: behind, cut: behind > 0 || x0 < 0 || y0 < 0 || x1 > W || y1 > H, scale: +o.scale.x.toFixed(2), dist: +o.getWorldPosition(new V()).distanceTo(cam.getWorldPosition(new V())).toFixed(2) };
  }, W, H);
}

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/toNonIndexed|WebSocket/.test(m.text())) console.error(`[page] ${m.text()}`); });
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await page.evaluateOnNewDocument((t) => { localStorage.setItem('fishing-token', t); localStorage.setItem('fishing-news', String(Number.MAX_SAFE_INTEGER)); }, TOKEN);
  // For clips: the page's timers and CSS animations follow a clock stepped by hand while `__virt` is on.
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
        for (const [id, t] of [...q]) if (t.at <= now) { q.delete(id); t.fn(); }
      },
      hold,
    };
  });
  // The fight frames: a cast's roll is swapped for the wanted fish on its way in (only this page sees it).
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
              Object.assign(m, { fishId: f.id, size: f.size, shiny: f.shiny, wait: f.wait });
              // The roll's own Feisty or Brutish tag was for the fish swapped out: dropped, or `TAG=feisty|brutish` stages one.
              if (f.tag) m.tag = f.tag;
              else delete m.tag;
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
  // Through the debug hook rather than the chat box, which the frames hide.
  const say = async (text: string) => { await page.evaluate((t) => (window as any).__game.cmd(t), text); await sleep(400); };
  await say('/login moment moment-dev-pass');
  await page.addStyleTag({ content: `#chat, #chatbox, #devprompt { display: none !important; } html.moment-clean :is(${OVERLAYS}) { display: none !important; }` });
  const phase = () => page.evaluate(() => (window as any).__game.state().phase as string);
  const waitPhase = async (want: string[], ms: number) => {
    const t0 = Date.now();
    for (;;) {
      const p = await phase();
      if (want.includes(p)) return p;
      if (Date.now() - t0 > ms) return p;
      await sleep(50);
    }
  };
  const setView = (day: number, tp: [number, number] | null, yaw = LOOK[0]) => page.evaluate((day, tp, look) => {
    const G = (window as any).__game;
    G.day(day);
    if (tp) G.teleport(tp[0], tp[1]);
    G.look(look[0], look[1]);
  }, day, tp, [yaw, LOOK[1]]);

  for (const place of PLACES) {
    // LANDS=0 or FIGHTS=0 leaves that half out, for quicker runs; NIGHT=0 skips the night row.
    const fish = process.env.LANDS === '0' || (process.env.NIGHT === '0' && place.key.endsWith('night')) ? [] : place.fish.filter((f) => !ONLY || ONLY.has(f.id));
    // FIGHTS=legends stages a fight for each of the place's legends instead of its listed fights.
    const fightIds = process.env.FIGHTS === 'legends' ? place.fish.filter((f) => fishOf(f.id).legend && !f.suffix).map((f) => f.id) : (place.fights ?? []);
    const fights = process.env.FIGHTS === '0' ? [] : fightIds.filter((id) => !ONLY || ONLY.has(id));
    if (!fish.length && !fights.length) continue;
    if (place.zone !== null) {
      // The Deep Sea Rod a player would bring: the steps that make the zone read Fair (the Shelf is Easy on any rod).
      await say(`/rodstep ${[0, 1, 3, 5, 7][place.zone]}`);
      await say('/abysslevel 0');
      await say(`/sea ${place.zone}`);
      await page.waitForFunction(() => (window as any).__game.world.sea && document.getElementById('castoff')!.classList.contains('hidden'), { timeout: 60000 });
      await sleep(1500);
      // The sea's look eases toward a new zone's: snap it, as arriving on a fresh charter does.
      await page.evaluate(() => { const G = (window as any).__game; G.world.setDepth(G.seaDepth(), true); });
      // The Abyss's lurkers (the Leviathan in the swell, the Kraken's arms, the Dreamer's eyes) come on their own
      // at random: put away so before and after frames compare (LURK=1 leaves them on).
      if (!process.env.LURK) await page.evaluate(() => { const L = (window as any).__game.world.sea?.lurk; if (L) { L.auto = false; L.hide(); } });
      // Back to the spawn on the deck, as a new charter starts.
      await setView(DAY, [-1.6, 0.3]);
    } else {
      await setView(DAY, PIER);
    }
    await sleep(1500);
    for (const spot of place.zone === null ? [null] : SPOTS) for (const f of fish) {
      const size = mid(f.id);
      const name = `${f.id}${f.suffix ?? ''}${spot?.name ? `-${spot.name}` : ''}`;
      await setView(f.day, spot?.at ?? null, spot?.yaw);
      if (spot) await sleep(400);
      await page.evaluate((bait) => { const G = (window as any).__game; if (bait) G.s.bait = bait; }, place.zone === null ? BAIT_FOR_TIER[fishOf(f.id).tier - 1] : null);
      await sleep(f.day === NIGHT ? 1500 : 600);
      const legend = !!fishOf(f.id).legend;
      const clip = CLIP > 0 && place.zone === 4 && legend;
      // Any banner left from joining (a staging account's "New in town") is put away first.
      if (clip) await page.evaluate(() => { document.getElementById('banner')?.classList.add('hidden'); (window as any).__game.freeze(true); (window as any).__virt.on(); });
      await page.evaluate((id, size, tag, sea, shiny) => {
        const G = (window as any).__game;
        const sc = G.world.scene;
        const add = sc.add;
        let got: any = null;
        sc.add = function (...o: any[]) { got ??= o[0]; return add.apply(this, o); };
        // The same moment of the swell (the boat's heave and roll swing the catch) for every landing, so runs compare.
        G.world.time = Number(sea);
        try { G.land(id, size, shiny, false, tag); } finally { sc.add = add; }
        (window as any).__fishObj = got;
      }, f.id, size, process.env.TAG ?? null, process.env.SEA_TIME ?? '100', SHINY);
      if (clip) {
        // The landing from its first frame, the game's clock stepped by hand.
        const dir = path.join(OUT, `${name}-clip`);
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
        const clean = !!process.env.CLIP_CLEAN;
        await page.evaluate((c) => document.documentElement.classList.toggle('moment-clean', c), clean);
        for (let k = 0; k < Math.round(CLIP * FPS); k++) {
          await page.evaluate((dt) => {
            const G = (window as any).__game, V = (window as any).__virt;
            // Two frames of the game for each one kept: its springs and easings are tuned for 40 frames a second and up.
            for (let i = 0; i < 2; i++) { V.advance(dt * 500); G.step(dt / 2); }
            V.hold();
          }, 1 / FPS);
          await page.screenshot({ path: path.join(dir, `f${String(k).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 88 });
        }
        await page.evaluate(() => { document.documentElement.classList.remove('moment-clean'); (window as any).__virt.off(); (window as any).__game.freeze(false); });
        const mp4 = path.join(OUT, `${name}.mp4`);
        const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.jpg'), '-vf', 'scale=960:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', process.env.CRF ?? '27', '-preset', 'slow', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
        await new Promise((res) => ff.on('close', res));
        console.log(`${name}.mp4: ${(fs.statSync(mp4).size / 1e6).toFixed(2)} MB, ${Math.round(CLIP * FPS)} frames at ${FPS} fps`);
      }
      if (place.zone === 4 && legend && !clip) {
        const r0 = Date.now();
        for (let k = 0; k < RISE.length; k++) {
          await sleep(Math.max(0, RISE[k] * 1000 - (Date.now() - r0)));
          await shoot(page, `${name}-rise-${k + 1}`, true);
        }
      }
      const p = await waitPhase(['result'], 20000);
      if (p !== 'result') { console.error(`${name}: never landed (phase ${p})`); continue; }
      let mb: unknown;
      if (legend) {
        await sleep(LEGEND_BEAT_AT * 1000);
        mb = await measure(page);
        await shoot(page, `${name}-beat`, KEEP.length > 0);
      }
      const hudAt = legend ? LEGEND_HUD_AT : HUD_AT;
      await sleep((hudAt - (legend ? LEGEND_BEAT_AT : 0)) * 1000);
      const mh = await measure(page);
      await shoot(page, `${name}-hud`, false);
      await sleep(Math.max(0, CLEAN_AT - hudAt) * 1000);
      const mc = await measure(page);
      await shoot(page, `${name}-clean`, true);
      measures[name] = { size, ...(mb ? { beat: mb } : {}), hud: mh, clean: mc };
      console.log(`${name}: ${size} cm, clean box ${JSON.stringify(mc)}`);
      if (process.env.PROBE && place.zone === 4 && legend) {
        const cost = await page.evaluate(() => {
          const G = (window as any).__game, w = G.world, o = (window as any).__fishObj;
          const gl = w.renderer.getContext() as WebGLRenderingContext;
          const px = new Uint8Array(4);
          // Each draw is read back, so the graphics card has finished it before the clock is read.
          const time = (n: number) => {
            const t0 = performance.now();
            for (let i = 0; i < n; i++) { w.renderer.render(w.scene, w.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
            return (performance.now() - t0) / n;
          };
          G.freeze(true);
          time(20);
          let on = Infinity, off = Infinity;
          for (let k = 0; k < 3; k++) {
            o.visible = true;
            on = Math.min(on, time(120));
            o.visible = false;
            off = Math.min(off, time(120));
          }
          o.visible = true;
          G.freeze(false);
          return { with: +on.toFixed(3), without: +off.toFixed(3), giant: +(on - off).toFixed(3) };
        });
        console.log(`${name}: a draw of the scene, ms ${JSON.stringify(cost)}`);
      }
      // A surfacing legend's send-off: the card put away, and frames as it sinks back.
      if (SINK.length && place.zone === 4 && legend) {
        await page.evaluate(() => (window as any).__game.press());
        let at = 0;
        for (let k = 0; k < SINK.length; k++) {
          await sleep((SINK[k] - at) * 1000);
          at = SINK[k];
          await shoot(page, `${name}-sink-${k + 1}`, true);
        }
        await sleep(1500);
      }
    }
    // Put the last catch away before the fights or the next place.
    await page.evaluate(() => (window as any).__game.lock(false));
    await page.evaluate(() => { const G = (window as any).__game; if (G.state().phase === 'result') G.press(); G.hold(false); });
    await sleep(500);
    for (const id of fights) {
      const size = mid(id);
      await setView(DAY, [-1.6, 0.3]);
      await sleep(800);
      await page.evaluate((id, size, tag, wait, shiny) => { (window as any).__force = { id, size, tag, wait, shiny }; }, id, size, process.env.TAG ?? null, WAIT, SHINY);
      let ok = false;
      for (let attempt = 0; attempt < 4 && !ok; attempt++) {
        await page.evaluate(() => (window as any).__game.press());
        await sleep(400);
        await page.evaluate(() => { const G = (window as any).__game; G.setPower(0.75); G.release(); });
        if ((await waitPhase(['waiting', 'idle'], 8000)) !== 'waiting') continue;
        // The last moments before the bite (a legend's shadow runs out to the bobber), then the bite itself.
        await page.evaluate(() => (window as any).__game.waitLeft(4.0));
        const s0 = Date.now();
        for (let k = 0; k < SHADOW_AFTER.length; k++) {
          await sleep(Math.max(0, SHADOW_AFTER[k] - (Date.now() - s0)));
          if ((await phase()) !== 'waiting') break;
          await page.evaluate(() => { (window as any).__fishObj = null; });
          await shoot(page, `${id}-shadow${nth(k)}`, true);
          if (k === 0) await shoot(page, `${id}-shadow-hud`, false);
        }
        if ((await waitPhase(['bite', 'idle'], 12000)) !== 'bite') continue;
        // The bite waits about a second for the press: on a busy machine a frame can take that long, so frames
        // that would run past 0.6 s are left out.
        const b0 = Date.now();
        for (let k = 0; k < BITE_AFTER.length; k++) {
          await sleep(Math.max(0, BITE_AFTER[k] - (Date.now() - b0)));
          if (k > 0 && Date.now() - b0 > 600) break;
          await shoot(page, `${id}-bite${nth(k)}`, true);
        }
        if (Date.now() - b0 < 500) await shoot(page, `${id}-bite-hud`, false);
        // The hook: the fish in the water is the first thing the strike adds to the scene.
        await page.evaluate(() => {
          const G = (window as any).__game;
          const sc = G.world.scene;
          const add = sc.add;
          let got: any = null;
          sc.add = function (...o: any[]) { got ??= o[0]; return add.apply(this, o); };
          try { G.press(); } finally { sc.add = add; }
          (window as any).__fishObj = got;
        });
        if ((await waitPhase(['reeling'], 3000)) !== 'reeling') continue;
        ok = true;
      }
      await page.evaluate(() => { (window as any).__force = null; });
      if (!ok) { console.error(`${id}: could not stage a fight`); continue; }
      // Reel in pulses, keeping the tension in the middle, as a player riding the gauge would; a frame every few seconds.
      const t0 = Date.now();
      const frames = FIGHT_AT;
      const fm: unknown[] = [];
      for (let k = 0; k < frames.length; k++) {
        while (Date.now() - t0 < frames[k] * 1000) {
          const st = await page.evaluate(() => (window as any).__game.state());
          if (st.phase !== 'reeling') break;
          await page.evaluate((h) => (window as any).__game.hold(h), (st.tension ?? 0) < 0.45);
          await sleep(80);
        }
        if ((await phase()) !== 'reeling') { console.error(`${id}: the fight ended early`); break; }
        const tag = nth(k);
        // The clean frame first, measured as it is taken; the HUD one straight after (the fish moves between them).
        // Not the first: hiding the banner for a clean frame starts its fade-in again, so the hooked banner would show dim.
        if (k === 0) await shoot(page, `${id}-fight${tag}-hud`, false);
        fm.push({ ...((await measure(page)) as object), surging: await page.evaluate(() => !!(window as any).__game.state().surging) });
        await shoot(page, `${id}-fight${tag}`, true);
        if (k > 0) await shoot(page, `${id}-fight${tag}-hud`, false);
      }
      measures[`${id}-fight`] = { size, frames: fm };
      console.log(`${id}-fight: ${JSON.stringify(fm)}`);
      // Let it go: slack line until it gets away (or lands), then put any card away.
      await page.evaluate(() => (window as any).__game.hold(false));
      await waitPhase(['idle', 'result'], 60000);
      await page.evaluate(() => { const G = (window as any).__game; if (G.state().phase === 'result') G.press(); });
      await sleep(1500);
    }
  }
  // Merged into what an earlier run measured, so a run of a few ids keeps the rest.
  const mfile = path.join(OUT, 'measure.json');
  const before = fs.existsSync(mfile) ? JSON.parse(fs.readFileSync(mfile, 'utf8')) : {};
  fs.writeFileSync(mfile, JSON.stringify({ ...before, ...measures }, null, 1));

  // Contact sheets: one row per place, everyday fish then legends, from the frames on disk.
  const CELL = 640;
  const sheet = async (kind: 'clean' | 'hud', file: string) => {
    const rows = PLACES.map((p) => ({ label: p.label, cells: [...p.fish].sort((a, b) => Number(!!fishOf(a.id).legend) - Number(!!fishOf(b.id).legend)).map((f) => ({ f, file: path.join(OUT, `${f.id}${f.suffix ?? ''}-${kind}.jpg`) })).filter((c) => fs.existsSync(c.file)) })).filter((r) => r.cells.length);
    if (!rows.length) return;
    const cols = Math.max(...rows.map((r) => r.cells.length));
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      body { margin: 0; background: #16181d; color: #e8e6e1; font: 15px/1.3 -apple-system, Helvetica, sans-serif; padding: 18px; width: ${170 + cols * (CELL + 10)}px; }
      h1 { font-size: 22px; margin: 0 0 14px; }
      .row { display: flex; gap: 10px; margin-bottom: 14px; align-items: flex-start; }
      .place { width: 150px; flex: none; font-weight: 700; font-size: 17px; padding-top: 8px; }
      .cell { width: ${CELL}px; }
      .cell img { width: ${CELL}px; height: ${CELL * H / W}px; display: block; }
      .cap { padding: 5px 2px; }
      .leg { color: #ffc933; font-weight: 800; letter-spacing: .05em; margin-left: 6px; }
      .m { color: #9aa3ad; margin-left: 6px; }
    </style></head><body><h1>Landed fish, ${kind === 'clean' ? 'overlays hidden' : 'as the player sees it'} (mid size, 1280x720 frames)</h1>
    ${rows.map((r) => `<div class="row"><div class="place">${r.label}</div>${r.cells.map((c) => {
      const fi = fishOf(c.f.id);
      return `<div class="cell"><img src="data:image/jpeg;base64,${fs.readFileSync(c.file).toString('base64')}"><div class="cap"><b>${fi.name}</b>${fi.legend ? '<span class="leg">LEGEND</span>' : ''}<span class="m">${(mid(c.f.id) / 100).toFixed(2)} m${c.f.suffix ? ' · night' : ''}</span></div></div>`;
    }).join('')}</div>`).join('')}</body></html>`;
    const p = await browser.newPage();
    await p.setViewport({ width: 200 + cols * (CELL + 10), height: 600, deviceScaleFactor: 1 });
    await p.setContent(html, { waitUntil: 'load' });
    await p.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 85, fullPage: true });
    await p.close();
  };
  await sheet('clean', 'contact-everyday-vs-legend.jpg');
  await sheet('hud', 'contact-hud.jpg');
} finally {
  await browser.close();
  await vite.close();
  try { process.kill(-server.pid!, 'SIGTERM'); } catch { /* gone */ }
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* still writing */ }
}
process.exit(0);

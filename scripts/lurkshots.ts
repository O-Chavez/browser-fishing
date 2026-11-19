// Stages the Abyss's lurkers (`src/game/abysslurk.ts`) headlessly, from a JSON list of shots (argv[3]) into argv[2]:
// stills (`<name>.jpg`) and, for a shot with `clip` seconds, a film (`<name>.mp4`, needs ffmpeg on the PATH or
// FFMPEG_PATH). Its own server and Vite, on LURK_PORT (default 8835) and LURK_VITE_PORT (default 5335); W and H set
// the picture's size (default 1120x630). Prints the draw calls and triangles of each shot.
//
// A shot: { name, depth, day, look: [yaw, pitch], tp?: [x, z], cam?: [x, y, z, tx, ty, tz], time?, js?, wait?,
// clip?, steps?: [{ at, js }], sight?: [x, z, y], crest?, at? }. The Abyss's swell hides the far water half the time:
// `sight` picks the sea's clock so that, when the still is taken (or `at` seconds into a clip), the point y metres
// over the water at (x, z) is seen from the deck against the sky, with the water under it behind a nearer crest; `crest` picks it for the boat on a crest, and
// `lift: [x, z]` for the swell at its highest there (for a close view of something standing in it). `cam`
// is in the sea's own frame (level with the water, not with the pitching boat; `camBoat` for the boat's) and drawn
// without the rod. A shot's `js` may change the knobs (`L.knobs`): they are put back before the next. `clean` leaves
// the spray off the lens, and `lite` stages it in lite graphics. `js` runs with G (window.__game), w (G.world), L (the
// lurkers) and `flash(on)`, which holds a lightning flash lit (or lets it go); `steps` run that many seconds into a
// clip. Before each shot the lurkers are put away and stopped from coming on their own, the marker buoy is put away
// (`w.atMarker = true` calls it alongside, about 9 s), and the sea's own lightning is quietened.
//
//   npx tsx scripts/lurkshots.ts <out dir> <shots.json>
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { seaHeight, seaMood } from '../src/data/sea';
import { seaSight } from '../src/game/abysslurk';
import { TIP_IDS } from '../src/game/tips';
import { newSave } from '../src/game/state';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = Number(process.env.LURK_VITE_PORT) || 5335;
const SERVER_PORT = Number(process.env.LURK_PORT) || 8835;
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const OUT = process.argv[2];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fishing-lurkshots-'));
const TOKEN = 'shots-token-0123456789abcdef';
fs.writeFileSync(path.join(dataDir, 'accounts.json'), JSON.stringify({ shots: { name: 'Shots', hash: createHash('sha256').update(TOKEN).digest('hex'), save: { ...newSave(), level: 60, coins: 50000, tips: [...TIP_IDS], held: 0 } } }));
const server = spawn('npx', ['tsx', 'server/index.ts'], { env: { ...process.env, DATA_DIR: dataDir, PORT: String(SERVER_PORT), DATABASE_URL: '', DISCORD_FEEDBACK_WEBHOOK: '', DISCORD_JOINS_WEBHOOK: '', DISCORD_TIPS_WEBHOOK: '', DEV_USER: 'shots', DEV_PASS: 'shots-dev-pass', TEST_HOOKS: '1' }, stdio: ['ignore', 'pipe', 'inherit'], detached: true });
process.on('exit', () => { try { process.kill(-server.pid!, 'SIGKILL'); } catch { /* gone */ } });
await new Promise<void>((res) => server.stdout!.on('data', (d) => /fishing server on port/.test(String(d)) && res()));
process.env.VITE_SERVER_URL = `ws://localhost:${SERVER_PORT}`;
const vite = await createServer({ server: { port: VITE_PORT, strictPort: true, hmr: false, watch: null }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: Number(process.env.W ?? 1120), height: Number(process.env.H ?? 630) }, protocolTimeout: 600_000 });
type Shot = { name: string; depth: number; day: number; look?: [number, number]; tp?: [number, number]; cam?: number[]; js?: string; time?: number; wait?: number; clip?: number; steps?: { at: number; js: string }[]; sight?: [number, number, number]; crest?: boolean; lift?: [number, number]; at?: number; clean?: boolean; lite?: boolean; camBoat?: boolean };
/** The sea's clock to start a shot at, so that `lead` seconds later the view (or the boat's height) is at its best. */
function startTime(s: Shot, lead: number): number {
  if (s.time != null || (!s.sight && !s.crest && !s.lift)) return s.time ?? 100;
  const mood = seaMood(s.depth);
  let best = 100, top = -Infinity;
  for (let t = 100 + lead; t < 124 + lead; t += 0.05) {
    // For a sight: its top clear with sky behind, and (so it stands in the swell, not over it) its waterline behind a nearer crest.
    const v = s.lift ? seaHeight(s.lift[0], s.lift[1], t, mood) : s.sight ? Math.min(3, seaSight(s.sight[0], s.sight[1], s.sight[2], t, mood, 150)) - Math.max(0, seaSight(s.sight[0], s.sight[1], 0, t, mood)) : seaHeight(0, 0, t, mood);
    if (v > top) [top, best] = [v, t];
  }
  return best - lead;
}
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(e.message));
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warn') && !/toNonIndexed/.test(m.text())) console.error(`[page] ${m.text()}`); });
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await page.evaluateOnNewDocument((t) => { localStorage.setItem('fishing-token', t); localStorage.setItem('fishing-news', String(Number.MAX_SAFE_INTEGER)); }, TOKEN);
  await page.goto(`http://localhost:${VITE_PORT}/?name=Shots&room=shots`, { waitUntil: 'load' });
  await page.waitForFunction(() => (window as any).__game?.online() && (window as any).__game.world.hub, { timeout: 60000 });
  await page.evaluate(() => (window as any).__game.activate());
  await sleep(600);
  const say = async (text: string) => { await page.keyboard.press('Enter'); await page.keyboard.type(text); await page.keyboard.press('Enter'); await sleep(300); };
  await say('/login shots shots-dev-pass');
  await say('/sea 0');
  await page.waitForFunction(() => (window as any).__game.world.sea && document.getElementById('castoff')!.classList.contains('hidden'), { timeout: 60000 });
  await page.addStyleTag({ content: '#hud, #crosshair, #toast, #banner, #tip, #guide, #divehud, #chat, #chatbox, #hotbar { display: none !important; }' });
  await page.evaluate(() => {
    const w = (window as any).__game.world;
    // Camera override: an outside view when set, applied just before each render.
    const orig = w.renderer.render.bind(w.renderer);
    (window as any).__cam = null;
    w.renderer.render = (scene: any, cam: any) => {
      const c = (window as any).__cam;
      if (!c || cam !== w.camera) return orig(scene, cam);
      // An outside view: without the rod in the player's hands.
      const shown = cam.children.map((k: any) => k.visible);
      for (const k of cam.children) k.visible = false;
      if ((window as any).__camBoat) {
        cam.position.set(c[0], c[1], c[2]);
        cam.lookAt(c[3], c[4], c[5]);
      } else {
        // Given in the sea's own frame, which heaves and tilts under the boat: the view is level with the water.
        const m = w.sea.frame.matrix, e = m.elements;
        cam.position.set(c[0], c[1], c[2]).applyMatrix4(m);
        cam.up.set(e[4], e[5], e[6]);
        cam.lookAt(cam.position.clone().set(c[3], c[4], c[5]).applyMatrix4(m));
        cam.up.set(0, 1, 0);
      }
      cam.updateMatrixWorld(true);
      orig(scene, cam);
      cam.children.forEach((k: any, i: number) => { k.visible = shown[i]; });
    };
    // The sea's own lightning: quiet unless a shot asks, and a flash can be held lit for a still.
    const bolt = w.sea.lightning;
    const update = bolt.update.bind(bolt);
    (window as any).__flash = false;
    bolt.update = (dt: number) => {
      if ((window as any).__flash) bolt.age = 0.01;
      update(dt, 0);
    };
  });
  const run = (js: string) => page.evaluate((js) => {
    const G = (window as any).__game;
    const flash = (on: boolean) => { (window as any).__flash = on; };
    new Function('G', 'w', 'L', 'flash', js)(G, G.world, G.world.sea.lurk, flash);
  }, js);
  const stats = () => page.evaluate(() => { const i = (window as any).__game.world.renderer.info; return `${i.render.calls} calls, ${i.render.triangles} triangles`; });
  const shots: Shot[] = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  for (const s of shots) {
    const lead = 0.25 + (s.clip ? (s.wait ?? 0) / 1000 + (s.at ?? s.clip / 2) : (s.wait ?? 1500) / 1000);
    const time = startTime(s, lead);
    await page.evaluate((s, time) => {
      const G = (window as any).__game;
      const L = G.world.sea.lurk;
      L.hide();
      L.auto = false;
      L.eyeHold = null;
      L.level = null;
      // The marker buoy too, if the last shot called it alongside (`w.atMarker = true`).
      G.world.atMarker = false;
      G.world.sea.buoy.group.visible = false;
      (window as any).__flash = false;
      (window as any).__camBoat = !!s.camBoat;
      document.getElementById('spray')!.style.visibility = s.clean ? 'hidden' : '';
      // The knobs as they shipped, whatever the last shot set.
      const knobs = ((window as any).__knobs ??= JSON.stringify(L.knobs));
      const put = (to: any, from: any) => { for (const k of Object.keys(from)) if (from[k] && typeof from[k] === 'object' && !Array.isArray(from[k])) put(to[k], from[k]); else to[k] = from[k]; };
      put(L.knobs, JSON.parse(knobs));
      G.world.setLite(!!s.lite);
      G.world.setDepth(s.depth, true);
      G.day(s.day);
      const tp = s.tp ?? [-1.6, 0.3];
      G.teleport(tp[0], tp[1]);
      if (s.look) G.look(s.look[0], s.look[1]);
      (window as any).__cam = s.cam ?? null;
      G.world.time = time;
    }, s, time);
    await sleep(250);
    if (s.js) await run(s.js);
    if (!s.clip) {
      await sleep(s.wait ?? 1500);
      await page.screenshot({ path: `${OUT}/${s.name}.jpg`, type: 'jpeg', quality: 88 });
      console.log(`${s.name}: ${await stats()}`);
      continue;
    }
    // A film: the screen's frames as they come, each held until the next, resampled to a steady 30 a second.
    await sleep(s.wait ?? 0);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fishing-lurk-film-'));
    const cdp = await page.createCDPSession();
    const frames: { ts: number; file: string }[] = [];
    cdp.on('Page.screencastFrame', (f) => {
      const file = path.join(dir, `f${String(frames.length).padStart(5, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
      frames.push({ ts: f.metadata.timestamp!, file });
      cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
    const t0 = Date.now();
    for (const step of [...(s.steps ?? [])].sort((a, b) => a.at - b.at)) {
      await sleep(Math.max(0, step.at * 1000 - (Date.now() - t0)));
      await run(step.js);
    }
    await sleep(Math.max(0, s.clip * 1000 - (Date.now() - t0)));
    console.log(`${s.name}: ${await stats()}`);
    await cdp.send('Page.stopScreencast');
    await cdp.detach();
    frames.sort((a, b) => a.ts - b.ts);
    const list = frames.map((f, i) => `file '${f.file}'\nduration ${((frames[i + 1]?.ts ?? f.ts + 1 / 30) - f.ts).toFixed(4)}`);
    fs.writeFileSync(path.join(dir, 'list.txt'), `${list.join('\n')}\nfile '${frames.at(-1)!.file}'\n`);
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-vf', 'fps=30', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${OUT}/${s.name}.mp4`]);
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`  wrote ${s.name}.mp4 (${frames.length} frames)`);
  }
} finally {
  await browser.close();
  await vite.close();
  try { process.kill(-server.pid!, 'SIGTERM'); } catch { /* gone */ }
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* the server was still writing */ }
}
process.exit(0);

// Another player's walk, seen by a real player: two headless players on a seeded server (its own, on a throwaway
// data folder; WALK_PORT, default 8779, and WALK_VITE_PORT, default 5279). Ann walks, sprints, jumps and stops on the
// main street; Bob watches and records what her avatar does on his screen: it should bounce and sway with her steps
// like the townsfolk do (`src/game/gait.ts`), about 3 steps a second at a walk and under 4 at a sprint, hold still
// mid-jump and stand level again once she stops. Prints PASS/FAIL per check, films the walk and the sprint from Bob's
// screen (with ffmpeg on the PATH or FFMPEG_PATH), exits non-zero on a failure.
//
//   CHROME_PATH=... npx tsx scripts/walk-check.ts [out dir]      (default .bench/walk)
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { createServer } from 'vite';
import { GAIT_BOB, GAIT_SWAY } from '../src/game/gait';
import { TIP_IDS } from '../src/game/tips';
import { newSave } from '../src/game/state';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = Number(process.env.WALK_VITE_PORT) || 5279;
const SERVER_PORT = Number(process.env.WALK_PORT) || 8779;
const WAIT = 240_000;
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const HAS_FFMPEG = spawnSync(FFMPEG, ['-version']).status === 0;
const OUT = path.resolve(process.argv[2] ?? '.bench/walk');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fishing-walk-'));
const token = (n: string) => `${n}-walk-token-0123456789abcdef`;
// Hand on the rod (slot 0) for Ann, so her avatar's rod shows; Bob's on an empty slot, out of his view.
const account = (name: string, color: number, held: number) => ({ name, hash: createHash('sha256').update(token(name)).digest('hex'), save: { ...newSave(), level: 22, tips: [...TIP_IDS], held, look: { ...newSave().look, color } } });
fs.writeFileSync(path.join(dataDir, 'accounts.json'), JSON.stringify({ ann: account('Ann', 0xe86a5a, 0), bob: account('Bob', 0x4a8fd6, 4) }));
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
  await page.goto(`http://localhost:${VITE_PORT}/?name=${name}&room=walk`, { waitUntil: 'load', timeout: 600_000 });
  await page.waitForFunction(() => (window as any).__game?.online(), { timeout: 600_000 });
  await page.evaluate(() => { (window as any).__game.activate(); (window as any).__game.day(0.35); });
  await page.addStyleTag({ content: '#hud, #crosshair, #toast, #banner, #tip, #guide, #chat { display: none !important; }' });
  return page;
}

/** One frame of Ann's avatar on Bob's screen: ms since the recording began, her walk (`avatarStep`) and where she is drawn. */
type Frame = { t: number; moving: number; lift: number; sway: number; x: number; y: number; z: number };
/** Records Ann's avatar on Bob's screen for `ms`, a frame at a time. */
const record = (bob: Page, id: number, ms: number): Promise<Frame[]> => bob.evaluate(async (id, ms) => {
  const G = (window as any).__game;
  const out: Frame[] = [];
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    await new Promise((r) => requestAnimationFrame(r));
    const s = G.avatarStep(id);
    const a = G.avatarAt(id);
    if (s && a) out.push({ t: performance.now() - t0, ...s, ...a });
  }
  return out;
}, id, ms);
/** Steps a second while she's fully walking: the sway changes side once a step, timed from the first change to the last. */
function stepRate(fr: Frame[]): number {
  const on = fr.filter((f) => f.moving > 0.95);
  const at: number[] = [];
  for (let i = 1; i < on.length; i++) if (Math.sign(on[i].sway) !== Math.sign(on[i - 1].sway)) at.push(on[i].t);
  return at.length > 1 ? (at.length - 1) / ((at[at.length - 1] - at[0]) / 1000) : 0;
}
const peak = (fr: Frame[], key: 'lift' | 'sway' | 'moving') => Math.max(...fr.map((f) => Math.abs(f[key])));
/** Films Bob's screen while `action` runs, into `<name>.mp4` at a steady 30 fps (skipped without ffmpeg). */
async function film<T>(bob: Page, name: string, action: () => Promise<T>): Promise<T> {
  if (!HAS_FFMPEG) return action();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fishing-walk-film-'));
  const cdp = await bob.createCDPSession();
  const shots: { ts: number; file: string }[] = [];
  cdp.on('Page.screencastFrame', (f) => {
    const file = path.join(dir, `f${String(shots.length).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    shots.push({ ts: f.metadata.timestamp!, file });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
  const result = await action();
  await cdp.send('Page.stopScreencast');
  await cdp.detach();
  // Frames arrive unevenly and sometimes out of order; the concat demuxer holds each until the next, then fps=30 resamples.
  shots.sort((a, b) => a.ts - b.ts);
  const list = shots.map((f, i) => `file '${f.file}'\nduration ${((shots[i + 1]?.ts ?? f.ts + 1 / 30) - f.ts).toFixed(4)}`);
  fs.writeFileSync(path.join(dir, 'list.txt'), `${list.join('\n')}\nfile '${shots.at(-1)!.file}'\n`);
  const out = path.join(OUT, `${name}.mp4`);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-vf', 'fps=30', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`      wrote ${path.relative(process.cwd(), out)} (${shots.length} frames)`);
  return result;
}

try {
  const ann = await join('Ann');
  const bob = await join('Bob');
  const id = (await ann.evaluate(() => (window as any).__game.netId())) as number;
  const G = (p: Page, f: string) => p.evaluate(`(() => { const g = window.__game; ${f} })()`);
  /** Stands Ann on the main street at z, facing up it (+z), and waits for her copy on Bob's screen to settle there. */
  const place = async (z: number) => {
    await G(ann, `g.key('KeyW', false); g.key('ShiftLeft', false); g.teleport(0, ${z}); g.look(Math.PI, 0);`);
    await bob.waitForFunction((id, z) => { const a = (window as any).__game.avatarAt(id); const s = (window as any).__game.avatarStep(id); return a && Math.abs(a.z - z) < 0.05 && s.moving < 0.001; }, {}, id, z);
  };

  // The upper street, past the square's well: a clear run from START up to the gate.
  const START = 37;
  // ---------- standing: level ----------
  // Bob stands up the street and looks down it, so Ann walks at him: the sway shows best from the front.
  await G(bob, `g.teleport(0.6, 52.5); g.look(0, -0.12);`);
  await place(START);
  const stood = await record(bob, id, 500);
  check('standing: no bounce, no sway', peak(stood, 'moving') < 0.001 && peak(stood, 'lift') === 0 && peak(stood, 'sway') === 0, { frames: stood.length, moving: peak(stood, 'moving') });
  await bob.screenshot({ path: path.join(OUT, 'stand.jpg'), type: 'jpeg', quality: 85 });

  // ---------- walking toward Bob ----------
  const { walk, stop } = await film(bob, 'walk-front', async () => {
    await G(ann, `g.key('KeyW', true);`);
    const walk = await record(bob, id, 2800);
    await G(ann, `g.key('KeyW', false);`);
    // Counted from her key's release: the word of it takes a moment to arrive, then her copy glides to a stop.
    return { walk, stop: await record(bob, id, 1500) };
  });
  const walkRate = stepRate(walk);
  check('walk: the body bounces a full step high and sways a full lean each way', peak(walk, 'moving') > 0.99 && peak(walk, 'lift') > GAIT_BOB * 0.9 && peak(walk, 'lift') <= GAIT_BOB + 1e-9 && peak(walk, 'sway') > GAIT_SWAY * 0.9, { frames: walk.length, lift: r3(peak(walk, 'lift')), sway: r3(peak(walk, 'sway')) });
  check('walk: about 3 steps a second', walkRate > 2.6 && walkRate < 3.8, { stepsPerSec: r3(walkRate), moved: r3(walk[walk.length - 1].z - walk[0].z) });

  // ---------- stopping ----------
  const last = stop[stop.length - 1];
  const stillBy = stop.find((f) => f.moving < 0.05)?.t ?? Infinity;
  check('stop: she stands level again within a second', last.moving < 0.01 && last.lift < 0.001 && Math.abs(last.sway) < 0.001 && stillBy < 1000, { stillByMs: Math.round(stillBy), last: { moving: r3(last.moving), lift: last.lift } });

  // ---------- sprinting past Bob, side on ----------
  await G(bob, `g.teleport(-4.6, 45); g.look(-Math.PI / 2, -0.1);`);
  await place(START);
  const sprint = await film(bob, 'sprint-side', async () => {
    await G(ann, `g.key('ShiftLeft', true); g.key('KeyW', true);`);
    const sprint = await record(bob, id, 2400);
    await G(ann, `g.key('KeyW', false); g.key('ShiftLeft', false);`);
    await record(bob, id, 600);
    return sprint;
  });
  const sprintRate = stepRate(sprint);
  check('sprint: quicker steps than a walk, under 4.5 a second, the same bounce', sprintRate > walkRate && sprintRate < 4.5 && peak(sprint, 'lift') > GAIT_BOB * 0.9, { stepsPerSec: r3(sprintRate), lift: r3(peak(sprint, 'lift')), moved: r3(sprint[sprint.length - 1].z - sprint[0].z) });

  // ---------- a jump mid-walk ----------
  await G(bob, `g.teleport(0.6, 52.5); g.look(0, -0.12);`);
  await place(START);
  await G(ann, `g.key('KeyW', true);`);
  await sleep(900);
  const rec = record(bob, id, 1500);
  await ann.keyboard.press('Space');
  const jump = await rec;
  await G(ann, `g.key('KeyW', false);`);
  // Her drawn height over the street's own slope: the highest frame, and how much she was stepping there.
  const top = jump.reduce((a, f) => (f.y > a.y ? f : a));
  const after = jump[jump.length - 1];
  check('jump: mid-air the steps stop, and pick up again on landing', top.y - jump[0].y > 0.5 && top.moving < 0.5 && after.moving > 0.9, { rise: r3(top.y - jump[0].y), movingAtTop: r3(top.moving), movingAfter: r3(after.moving) });
} catch (e) {
  check('walk check ran to the end', false, String(e));
} finally {
  await Promise.all(browsers.map((b) => b.close()));
  await vite.close();
  kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} failed` : `\nall passed; films in ${path.relative(process.cwd(), OUT)}/`);
process.exit(fails ? 1 : 0);

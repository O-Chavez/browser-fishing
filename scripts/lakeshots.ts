// Stills of the lake's water and bed (src/game/lakewater.ts, underwater.ts), staged headlessly, and short clips.
//
//   npx tsx scripts/lakeshots.ts <out dir> [--views quay,pierend,...] [--times day,dusk,night] [--lite]
//   npx tsx scripts/lakeshots.ts <out dir> --fish
//   npx tsx scripts/lakeshots.ts <out dir> --clip <seconds> [--views jetty,pierend]
//
// Files are <view>.jpg, with -dusk / -night and -lite added. `--fish` casts from the T end, hooks a fish and shoots it
// being reeled in under the surface (fish.jpg, fish-near.jpg), then a row of fish held at depths (fish-row.jpg). `--clip` films each view for that many seconds with the
// Chrome screencast into <view>.mp4 and a small <view>.gif (needs ffmpeg on the PATH, or FFMPEG_PATH).
// LAKE_ROOT=<checkout> shoots another checkout (main) the same way. LAKE_JS='LAKE.caustics = 0' tries a knob (src/data/lake.ts) without editing it. Runs the game offline (no server), so nothing is saved. One page per time of day: the townsfolk wander, and one of
// them walks up the pier into the quay view after a while.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';
import { createServer } from 'vite';
import { TIP_IDS } from '../src/game/tips';
import { newSave } from '../src/game/state';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const VITE_PORT = Number(process.env.MAP_PORT ?? 5311);
const args = process.argv.slice(2);
const WITH_VALUE = ['--views', '--times', '--clip'];
const flag = (name: string): string[] | null => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? null : args[i + 1].split(',');
};
const outArg = args.find((a, i) => !a.startsWith('--') && !WITH_VALUE.includes(args[i - 1]));
if (!outArg) {
  console.error('usage: npx tsx scripts/lakeshots.ts <out dir> [--views quay,jetty] [--times day,dusk,night] [--lite] [--fish] [--clip seconds]');
  process.exit(2);
}
const OUT = path.resolve(outArg);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Camera yaw 0 looks along -z (out to the lake), π toward the gate; positive turns toward -x. */
interface View { x: number; z: number; yaw: number; pitch: number }
const yawTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z));
const VIEWS: Record<string, View> = {
  // From the pier back to the quay and the town, like docs/images/harbour.jpg, tipped down to the water.
  quay: { x: 0, z: -1.5, yaw: Math.PI, pitch: -0.3 },
  // The T end's east arm, looking back and well down along the pier's posts, where players fish.
  pierend: { x: 4.4, z: -6.5, yaw: yawTo(4.4, -6.5, 1.6, -0.5), pitch: -0.5 },
  // The west jetty, along the shallows to Reed's beach.
  jetty: { x: -7.5, z: 4.5, yaw: yawTo(-7.5, 4.5, -17, 0.5), pitch: -0.3 },
  // Skipper's Beach, along the waterline and out over the bay.
  beach: { x: 20.6, z: -9.9, yaw: yawTo(20.6, -9.9, 27, -14.5), pitch: -0.26 },
  // The T end, out across the open lake to the islet and the mountains.
  open: { x: 0, z: -7.5, yaw: 0.3, pitch: -0.1 },
};
const TIMES: Record<string, number> = { day: 0.3, dusk: 0.53, night: 0.72 };
const views = flag('views') ?? Object.keys(VIEWS);
const times = flag('times') ?? ['day'];
const lite = args.includes('--lite');
const clip = flag('clip');

// LAKE_ROOT shoots another checkout (main, for the same views before the change).
const ROOT = path.resolve(process.env.LAKE_ROOT ?? '.');
const vite = await createServer({ root: ROOT, ...(process.env.LAKE_ROOT ? { cacheDir: path.join(ROOT, '.vite-lakeshots-cache') } : {}), server: { port: VITE_PORT, strictPort: true }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});

async function open(rod = false): Promise<Page> {
  const page = await (await browser.createBrowserContext()).newPage();
  page.on('pageerror', (e) => console.error(`page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' || /THREE|shader|WebGL/i.test(m.text())) console.error(`console ${m.type()}: ${m.text().slice(0, 1500)}`); });
  await page.setViewport({ width: 1280, height: 720 });
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await page.evaluateOnNewDocument(() => localStorage.setItem('fishing-news', String(Number.MAX_SAFE_INTEGER)));
  // Every tip seen, so no tip box covers the shot; the hand on an empty slot (no rod in view) unless fishing.
  await page.evaluateOnNewDocument((save) => localStorage.setItem('fishing-game-save', save), JSON.stringify({ ...newSave(), tips: [...TIP_IDS], ...(rod ? {} : { held: 4 }) }));
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game);
  await page.click('#join-offline');
  await page.waitForFunction(() => document.getElementById('join')?.classList.contains('hidden'), { timeout: 20000 });
  await page.evaluate(() => window.__game.activate());
  await page.addStyleTag({ content: '#hud, #crosshair, #toast, #banner, #tip, #guide, #touch, #chat, #fps { display: none !important; }' });
  if (lite) await page.evaluate(() => window.__game.world.setLite(true));
  // For trying knobs without editing them: LAKE_JS runs in the page with `LAKE` (src/data/lake.ts) in scope.
  if (process.env.LAKE_JS) await page.evaluate(`import('/src/data/lake.ts').then(({ LAKE }) => { ${process.env.LAKE_JS} })`);
  return page;
}
const game = (p: Page, js: string) => p.evaluate(`(() => { const G = window.__game; ${js} })()`);
const at = (p: Page, v: View) => game(p, `G.teleport(${v.x}, ${v.z}); G.look(${v.yaw}, ${v.pitch});`);

/** Films the page for `seconds` into <name>.mp4 and <name>.gif. */
async function film(page: Page, name: string, seconds: number): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lake-film-'));
  const cdp = await page.createCDPSession();
  const shots: { ts: number; file: string }[] = [];
  cdp.on('Page.screencastFrame', (f) => {
    const file = path.join(dir, `f${String(shots.length).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    shots.push({ ts: f.metadata.timestamp!, file });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
  await sleep(seconds * 1000);
  await cdp.send('Page.stopScreencast');
  await cdp.detach();
  // Frames arrive unevenly; the concat demuxer holds each until the next, then fps=30 resamples.
  shots.sort((a, b) => a.ts - b.ts);
  const list = shots.map((f, i) => `file '${f.file}'\nduration ${((shots[i + 1]?.ts ?? f.ts + 1 / 30) - f.ts).toFixed(4)}`);
  fs.writeFileSync(path.join(dir, 'list.txt'), `${list.join('\n')}\nfile '${shots.at(-1)!.file}'\n`);
  const mp4 = path.join(OUT, `${name}.mp4`);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-vf', 'fps=30', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', mp4, '-vf', 'fps=12,scale=560:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', path.join(OUT, `${name}.gif`)]);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`wrote ${mp4} (${shots.length} frames) and its gif`);
}

/** Casts from the T end, hooks a fish and shoots it under the surface while it is reeled in. */
async function fish(): Promise<void> {
  const page = await open(true);
  await game(page, `G.day(${TIMES.day});`);
  const v: View = { x: 1.4, z: -6.6, yaw: 0.15, pitch: -0.62 };
  await at(page, v);
  await sleep(1500);
  await game(page, 'G.press(); G.setPower(0.25);');
  await sleep(200);
  await game(page, 'G.setPower(0.25); G.release();');
  for (let i = 0; i < 200; i++) {
    const phase = (await game(page, 'return G.state().phase;')) as string;
    if (phase === 'waiting') await game(page, 'G.skipWait();');
    else if (phase === 'bite') await game(page, 'G.press();');
    else if (phase === 'reeling') break;
    await sleep(100);
  }
  await game(page, 'G.release(); G.hold(false);');
  await sleep(900);
  await game(page, `G.look(${v.yaw}, ${v.pitch});`);
  await page.screenshot({ path: path.join(OUT, 'fish.jpg'), type: 'jpeg', quality: 88 });
  // Reeled in closer, under the T end.
  for (let i = 0; i < 12; i++) {
    await game(page, 'const s = G.state(); G.hold((s.tension ?? 0) < 0.55);');
    await sleep(150);
  }
  await game(page, `G.hold(false); G.look(${v.yaw}, ${v.pitch - 0.15});`);
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, 'fish-near.jpg'), type: 'jpeg', quality: 88 });
  console.log(`wrote fish shots, phase ${await game(page, 'return G.state().phase;')}`);
  await page.browserContext().close();
  // A row of fish held still off the T end, one breaking the surface and the rest 0.3, 0.8 and 1.6 m down.
  const row = await open();
  // As a string: the page's modules are served by Vite, not seen by this script's compiler.
  await row.evaluate(`(async () => {
    const G = window.__game;
    G.day(0.3);
    G.teleport(0, -9.6);
    G.look(0, -0.55);
    const { buildFish } = await import('/src/game/fishmodel.ts');
    const { FISH } = await import('/src/data/content.ts');
    const f = FISH.find((x) => x.tier === 3);
    [0, 0.3, 0.8, 1.6].forEach((d, i) => {
      const m = buildFish(f.color, false, false, f.tier, f.id);
      m.group.scale.setScalar(2.2);
      m.group.position.set(-2.1 + i * 1.4, -d, -13.4);
      m.group.rotation.y = Math.PI / 2;
      G.world.scene.add(m.group);
    });
  })()`);
  await sleep(1800);
  await row.screenshot({ path: path.join(OUT, 'fish-row.jpg'), type: 'jpeg', quality: 88 });
  console.log('wrote fish-row.jpg');
  await row.browserContext().close();
}

let failed = false;
try {
  if (args.includes('--fish')) await fish();
  else {
    for (const time of times) {
      const page = await open();
      await game(page, `G.day(${TIMES[time]});`);
      await sleep(2500);
      for (const name of views) {
        await at(page, VIEWS[name]);
        await sleep(1300);
        const file = `${name}${time === 'day' ? '' : `-${time}`}${lite ? '-lite' : ''}`;
        if (clip) await film(page, file, Number(clip[0]));
        else {
          await page.screenshot({ path: path.join(OUT, `${file}.jpg`), type: 'jpeg', quality: 85 });
          console.log(`wrote ${path.join(OUT, `${file}.jpg`)}`);
        }
      }
      if (process.env.LAKE_PERF) console.log(time, JSON.stringify(await game(page, 'return { perf: G.perf(), ms: G.renderMs() };')));
      await page.browserContext().close();
    }
  }
} catch (e) {
  console.error(e);
  failed = true;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(failed ? 1 : 0);

declare global {
  interface Window {
    __game: any;
  }
}

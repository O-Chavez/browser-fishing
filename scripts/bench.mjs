// Repeatable render benchmark. Starts Vite, drives the game in headless Chrome through fixed
// scenes and writes the metrics to bench-results/<label>.json.
//
//   npm run bench -- <label>          e.g. npm run bench -- baseline
//   npm run bench:compare -- <a> <b>  table of b against a
//
// Set CHROME_PATH if Chrome isn't in the default macOS location.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';

const label = process.argv[2] ?? 'run';
// bench-ab.mjs points these at a git worktree of another commit and a scratch output folder.
const ROOT = path.resolve(process.env.BENCH_ROOT ?? '.');
const OUT_DIR = path.resolve(process.env.BENCH_OUT ?? 'bench-results');
const SAMPLES = 9; // timed batches per scene visit; the median is that visit's result
const ROUNDS = Number(process.env.BENCH_ROUNDS) || 3; // visits per scene; the median visit is reported, the min-max is the spread
const PORT = 5299;
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const server = await createServer({ root: ROOT, cacheDir: path.join(ROOT, '.vite-bench-cache'), server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  // A Retina-class laptop screen: 1600x900 CSS pixels at devicePixelRatio 2.
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 2 },
});

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
  // Tag every rAF callback so we can count how many independent render loops are alive, and let
  // the bench hold the game's loops while it measures so they don't compete for the GPU.
  await page.evaluateOnNewDocument(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.__rafSeen = new Set();
    window.__held = null;
    window.__hold = (on) => {
      if (on) window.__held ??= [];
      else if (window.__held) {
        const q = window.__held;
        window.__held = null;
        q.forEach((cb) => raf(cb));
      }
    };
    window.requestAnimationFrame = (cb) => raf((t) => {
      if (window.__held) return void window.__held.push(cb);
      window.__rafSeen.add(cb);
      cb(t);
    });
  });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game);
  await page.evaluate(async () => {
    const [{ MAPS }, { LOCATIONS }] = await Promise.all([import('/src/data/maps.ts'), import('/src/data/content.ts')]);
    window.__bench = {
      goto(id) {
        const m = MAPS.find((x) => x.id === id);
        const w = window.__game.world;
        const t0 = performance.now();
        w.setLocation(LOCATIONS.find((l) => l.id === m.locationId), m);
        const build = performance.now() - t0;
        window.__game.teleport(m.spawn.x, m.spawn.z);
        window.__game.look(m.spawn.yaw, -0.12);
        const t1 = performance.now();
        w.renderer.render(w.scene, w.camera);
        w.renderer.getContext().finish();
        return { build, firstRender: performance.now() - t1 };
      },
      spawn(id) {
        return MAPS.find((x) => x.id === id).spawn;
      },
    };
  });

  const gpu = await page.evaluate(() => {
    const gl = window.__game.world.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });

  // Leave the join screen the way a player does when the server is unreachable.
  await page.click('#join-offline');
  await page.evaluate(() => window.__game.activate());
  await sleep(1500);

  const loops = () => page.evaluate(() => new Promise((res) => {
    window.__rafSeen.clear();
    setTimeout(() => res(window.__rafSeen.size), 2000);
  }));

  // GPU throughput: after a warm-up that lets the GPU clock up, time SAMPLES batches of 60
  // back-to-back renders with one GPU sync per batch. Syncing every frame lets the GPU idle and
  // clock down, which made the numbers swing by 2x. Shadows refresh every 3rd render, as in World.update.
  const measure = () => page.evaluate((samples) => {
    window.__hold(true);
    const w = window.__game.world;
    const r = w.renderer;
    const gl = r.getContext();
    const px = new Uint8Array(4);
    const batch = (n) => {
      const t0 = performance.now();
      for (let k = 0; k < n; k++) {
        if (k % 3 === 0) r.shadowMap.needsUpdate = true;
        r.render(w.scene, w.camera);
      }
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return (performance.now() - t0) / n;
    };
    const t = performance.now();
    while (performance.now() - t < 2000) batch(10);
    const ms = Array.from({ length: samples }, () => batch(60)).sort((a, b) => a - b);
    r.render(w.scene, w.camera);
    const info = r.info;
    let lights = 0;
    w.scene.traverse((o) => { if (o.isLight && o.visible) lights++; });
    window.__hold(false);
    return {
      renderMs: ms[ms.length >> 1],
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      visibleLights: lights,
      pixelRatio: r.getPixelRatio(),
    };
  }, SAMPLES);

  const scene = async (setup) => {
    await page.evaluate(setup);
    await sleep(400);
    return measure();
  };

  const R = { label, date: new Date().toISOString(), gpu, scenes: {}, loops: {}, mapChange: {} };

  R.loops.afterPlayOffline = await loops();
  // The spinning character preview lives on the wardrobe tab.
  await page.evaluate(() => window.__game.openMenu('inventory'));
  await page.click('[data-act="invtab"][data-id="wardrobe"]');
  await sleep(300);
  await page.evaluate(() => { window.__game.closeMenu(); window.__game.activate(); });
  await sleep(300);
  R.loops.afterWardrobeClosed = await loops();

  // Each scene is measured once per round, round-robin, and the median across rounds is reported,
  // so slow drift in GPU clocks during a run shows up as spread instead of skewing one scene.
  const SCENES = {
    pondDay: ['pond', () => { const s = window.__bench.spawn('pond'); window.__game.teleport(s.x, s.z); window.__game.look(s.yaw, -0.12); window.__game.day(0.1); }],
    pondNight: ['pond', () => { const s = window.__bench.spawn('pond'); window.__game.teleport(s.x, s.z); window.__game.look(s.yaw, -0.12); window.__game.day(0.7); }],
    plazaDay: ['pond', () => { window.__game.teleport(0, 24); window.__game.look(Math.PI, -0.1); window.__game.day(0.1); }],
    plazaNight: ['pond', () => { window.__game.teleport(0, 24); window.__game.look(Math.PI, -0.1); window.__game.day(0.7); }],
    casino: ['casino', () => { const s = window.__bench.spawn('casino'); window.__game.teleport(s.x, s.z); window.__game.look(s.yaw, -0.12); window.__game.day(0.1); }],
  };
  const runs = {};
  let map = '';
  for (let round = 0; round < ROUNDS; round++) {
    for (const [name, [id, setup]] of Object.entries(SCENES)) {
      if (map !== id) {
        const visit = await page.evaluate((id) => window.__bench.goto(id), (map = id));
        // The very first casino visit pays for compiling its shaders; later visits hit the cache.
        if (id === 'casino' && !R.firstVisit) R.firstVisit = { firstCasinoVisitBuildMs: visit.build, firstCasinoVisitRenderMs: visit.firstRender };
      }
      (runs[name] ??= []).push(await scene(setup));
    }
  }
  for (const [name, list] of Object.entries(runs)) {
    const ms = list.map((r) => r.renderMs).sort((a, b) => a - b);
    R.scenes[name] = { ...list[0], renderMs: median(ms), renderMsLo: ms[0], renderMsHi: ms[ms.length - 1], renderMsRounds: list.map((r) => r.renderMs) };
  }

  // Map changes: build time, first-render (shader compile) time and leftover GPU resources.
  const mem = () => page.evaluate(() => {
    const w = window.__game.world;
    const culled = [];
    w.scene.traverse((o) => { if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });
    w.renderer.render(w.scene, w.camera);
    culled.forEach((o) => (o.frustumCulled = true));
    const i = w.renderer.info;
    return { geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs.length }; });
  await page.evaluate(() => { window.__game.day(0.1); window.__bench.goto('casino'); window.__bench.goto('pond'); }); // warm-up trip
  const before = await mem();
  const trips = [];
  for (let i = 0; i < 3; i++) {
    const casino = await page.evaluate(() => window.__bench.goto('casino'));
    const pond = await page.evaluate(() => window.__bench.goto('pond'));
    trips.push({ casino, pond });
  }
  const after = await mem();
  R.mapChange = {
    pondBuildMs: median(trips.map((t) => t.pond.build)),
    pondFirstRenderMs: median(trips.map((t) => t.pond.firstRender)),
    casinoBuildMs: median(trips.map((t) => t.casino.build)),
    casinoFirstRenderMs: median(trips.map((t) => t.casino.firstRender)),
    leakedGeometriesPerTrip: (after.geometries - before.geometries) / 3,
    leakedTexturesPerTrip: (after.textures - before.textures) / 3,
    newProgramsPerTrip: (after.programs - before.programs) / 3,
    ...R.firstVisit,
  };
  delete R.firstVisit;

  const out = path.join(OUT_DIR, `${label}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(R, null, 2) + '\n');
  console.log(`GPU: ${gpu}`);
  for (const [k, s] of Object.entries(R.scenes)) {
    console.log(`${k.padEnd(11)} render ${s.renderMs.toFixed(2)} ms (rounds ${s.renderMsRounds.map((x) => x.toFixed(2)).join(' / ')})  calls ${s.drawCalls}  lights ${s.visibleLights}`);
  }
  console.log('render loops:', R.loops, '\nmap change:', R.mapChange);
  console.log(`\nWrote ${path.relative(process.cwd(), out)}`);
} finally {
  await browser.close();
  await server.close();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
}

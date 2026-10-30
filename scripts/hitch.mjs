// Load-hitch probe: loads the game fresh (a new browser each run, so no cached shaders) and records
// every frame of the first seconds: frame gaps, time in the GL calls that block (shader compile and
// link, texture and buffer uploads), new shader programs per frame, and long tasks. It waits on the
// join screen, joins, stands 3 s, turns a full circle over 4 s and stands 3 s more.
//
//   npm run bench:load -- [--phone] [--online] [--night] [--runs N] [--wait S] [--json]
//
// --phone:  SwiftShader at the touch resolution (1400x647, DPR 1) as a touch device, tapping
//           "Try touch controls" after 1 s: a rough phone stand-in (slow and noisy, repeat it).
// --online: a game server with another player at the spawn; joins through the join screen.
// --trace FILE / --load-trace FILE: a Chrome trace of the join / of the first 2.5 s.
// "slow" lists frames over 34 ms as seconds-from-join:gap/callback ms/compile ms/texture ms/programs.
// BENCH_ROOT points it at another checkout (e.g. a worktree of main) for before/after runs.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
const PHONE = flag('--phone');
const NIGHT = flag('--night');
const RUNS = Number(opt('--runs', 3));
const WAIT = Number(opt('--wait', 5)) * 1000; // time on the join screen before joining
const PORT = Number(opt('--port', 5317));
const JSON_OUT = flag('--json');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.resolve(process.env.BENCH_ROOT ?? '.');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --online: a game server with one other player standing at the spawn, and the probe joins through
// the join screen like a new player (so other players' avatars appear right after joining).
const ONLINE = flag('--online');
let game = null;
if (ONLINE) {
  const SERVER_PORT = Number(opt('--server-port', 8797));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fishing-hitch-'));
  game = spawn('npx', ['tsx', 'server/index.ts'], { cwd: ROOT, env: { ...process.env, DATA_DIR: dataDir, PORT: String(SERVER_PORT), DATABASE_URL: '', DISCORD_FEEDBACK_WEBHOOK: '', DISCORD_WEBHOOK: '' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res) => game.stdout.on('data', (d) => /fishing server on port/.test(String(d)) && res()));
  process.env.VITE_SERVER_URL = `ws://localhost:${SERVER_PORT}`;
}
const server = await createServer({ root: ROOT, cacheDir: path.join(ROOT, '.vite-bench-cache'), server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();

const gpuArgs = PHONE ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
const viewport = PHONE ? { width: 1400, height: 647, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { width: 1600, height: 900, deviceScaleFactor: 2 };

function probe(night) {
  const now = () => performance.now();
  const B = (window.__glt = { compile: 0, tex: 0, buf: 0, draw: 0, other: 0 });
  const groups = {
    compile: ['compileShader', 'linkProgram', 'getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getShaderInfoLog', 'getActiveUniform', 'getActiveAttrib', 'getUniformLocation', 'getAttribLocation', 'getUniformBlockIndex'],
    tex: ['texImage2D', 'texSubImage2D', 'texStorage2D', 'texImage3D', 'texSubImage3D', 'generateMipmap', 'copyTexSubImage2D'],
    buf: ['bufferData', 'bufferSubData'],
    draw: ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'],
    other: ['readPixels', 'clear'],
  };
  for (const proto of [WebGL2RenderingContext.prototype]) {
    for (const [g, names] of Object.entries(groups)) {
      for (const n of names) {
        const f = proto[n];
        if (!f) continue;
        proto[n] = function (...a) {
          const t = now();
          try { return f.apply(this, a); } finally { B[g] += now() - t; }
        };
      }
    }
  }
  const frames = (window.__frames = []);
  const longs = (window.__longs = []);
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push({ t: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true });
  } catch {}
  // Names a new program by the first scene object whose material uses it.
  window.__progLabel = (pr) => {
    let hit = '';
    const props = renderer.properties;
    window.__g.world.scene.traverse((o) => {
      if (hit || !o.material) return;
      for (const m of [].concat(o.material)) {
        if (props.get(m).currentProgram === pr) {
          let path = o.name || o.type;
          for (let q = o.parent, n = 0; q && n < 2; q = q.parent, n++) path = (q.name || q.type) + '/' + path;
          hit = `${pr.type}${o.visible ? '' : '(hidden)'}@${path}`;
        }
      }
    });
    return hit || pr.type + '@?';
  };
  let renderer = null;
  let prog = 0;
  Object.defineProperty(window, '__game', {
    configurable: true,
    get() { return window.__g; },
    set(v) {
      window.__g = v;
      renderer = v.world.renderer;
      console.log(`pre-frame: game ready at ${(now() / 1000).toFixed(2)}s, GL ms so far ${JSON.stringify(Object.fromEntries(Object.entries(B).map(([k, x]) => [k, Math.round(x)])))}, programs ${renderer.info.programs.length}`);
      if (night != null) v.day(night);
    },
  });
  const raf = window.requestAnimationFrame.bind(window);
  let cur = null;
  const tick = (ts) => {
    // One record per frame: gap since the last frame, and what the callbacks spent.
    if (cur) frames.push(cur);
    cur = { ts, t: now(), cb: 0, compile: 0, tex: 0, buf: 0, draw: 0, newProg: [] };
    raf(tick);
  };
  raf(tick);
  window.requestAnimationFrame = (cb) => raf((ts) => {
    const s = { ...B };
    const t0 = now();
    cb(ts);
    if (!cur) return;
    cur.cb += now() - t0;
    for (const k of ['compile', 'tex', 'buf', 'draw']) cur[k] += B[k] - s[k];
    if (renderer) {
      const p = renderer.info.programs;
      if (p && p.length > prog) {
        for (let i = prog; i < p.length; i++) cur.newProg.push(window.__progLabel(p[i]));
        prog = p.length;
      }
    }
  });
}

function summarize(frames, longs, joinAt) {
  const fr = frames.filter((f) => !f.mark);
  const rows = [];
  for (let i = 0; i < fr.length; i++) rows.push({ ...fr[i], gap: i ? fr[i].ts - fr[i - 1].ts : 0 });
  const phase = (a, b) => {
    const r = rows.filter((x) => x.t >= a && x.t < b);
    const gaps = r.map((x) => x.gap).sort((x, y) => y - x);
    const sum = (k) => +r.reduce((s, x) => s + x[k], 0).toFixed(0);
    return {
      frames: r.length,
      over50: r.filter((x) => x.gap > 50).length,
      over100: r.filter((x) => x.gap > 100).length,
      worst: gaps.slice(0, 5).map((g) => +g.toFixed(0)),
      compileMs: sum('compile'),
      texMs: sum('tex'),
      bufMs: sum('buf'),
      cbMs: sum('cb'),
      programs: r.reduce((s, x) => s + x.newProg.length, 0),
    };
  };
  const first = rows.length ? rows[0].t : 0;
  const top = [...rows].sort((a, b) => b.gap - a.gap).slice(0, 6).map((x) => ({
    at: +(x.t / 1000).toFixed(2), gap: +x.gap.toFixed(0), cb: +x.cb.toFixed(0), compile: +x.compile.toFixed(0), tex: +x.tex.toFixed(0), buf: +x.buf.toFixed(0), progs: x.newProg.length,
  }));
  const slow = rows.filter((x) => x.gap > 34).map((x) => `${((x.t - joinAt) / 1000).toFixed(2)}:${x.gap.toFixed(0)}/${x.cb.toFixed(0)}cb/${x.compile.toFixed(0)}c/${x.tex.toFixed(0)}t${x.newProg.length ? '/' + x.newProg.length + 'p' : ''}`).join(' ');
  return {
    slow,
    firstFrameAt: +(first / 1000).toFixed(2),
    joinScreen: phase(0, joinAt),
    afterJoin: phase(joinAt, joinAt + 10000),
    top,
    longTasks: longs.filter((l) => l.d > 50).map((l) => `${(l.t / 1000).toFixed(2)}s:${l.d.toFixed(0)}`).join(' '),
    programsTotal: rows.reduce((s, x) => s + x.newProg.length, 0),
    newProgFrames: rows.filter((x) => x.newProg.length).map((x) => `${(x.t / 1000).toFixed(2)}s:${x.newProg.length}(${x.compile.toFixed(0)}ms)`).join(' '),
    progNames: rows.filter((x) => x.newProg.length).map((x) => `${((x.t - joinAt) / 1000).toFixed(2)}: ${x.newProg.join(',')}`),
  };
}

const results = [];
let friend = null;
if (ONLINE) {
  friend = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=metal'], defaultViewport: { width: 400, height: 300 } });
  const fp = await friend.newPage();
  await fp.goto(`http://localhost:${PORT}/?name=Friend&room=hitch`, { waitUntil: 'load' });
  await fp.waitForFunction(() => window.__game?.online(), { timeout: 30000 });
  // Stand still and stop drawing, so the friend's browser doesn't add load.
  await fp.evaluate(() => { window.__game.activate(); window.__game.world.paused = true; });
}
try {
  for (let run = 0; run < RUNS; run++) {
    // A fresh browser (and temporary profile) each run: Chrome's GPU process caches compiled
    // programs, so a second page in the same browser would load warm.
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: [...gpuArgs], defaultViewport: viewport });
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
    await page.evaluateOnNewDocument(probe, NIGHT ? 0.7 : 0.1);
    if (!JSON_OUT) page.on('console', (m) => /^pre-frame/.test(m.text()) && console.log(m.text()));
    const LTRACE = opt('--load-trace', '');
    if (LTRACE) await page.tracing.start({ path: LTRACE, categories: ['toplevel', 'gpu', 'viz', 'cc', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-gpu.service', 'disabled-by-default-gpu.decoder', 'disabled-by-default-gpu.angle', 'gpu.angle', 'disabled-by-default-gpu.device'] });
    const q = [ONLINE && 'room=hitch'].filter(Boolean).join('&');
    await page.goto(`http://localhost:${PORT}/${q ? '?' + q : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game);
    // A phone opens on the "made for desktop" notice (the world isn't drawn); the player taps "Try touch controls".
    if (PHONE) {
      await sleep(1000);
      await page.evaluate(() => document.getElementById('desktop-anyway').click());
    }
    if (LTRACE) { await sleep(2500); await page.tracing.stop(); await sleep(WAIT - 2500); } else
    await sleep(WAIT);
    const TRACE = opt('--trace', '');
    if (TRACE) await page.tracing.start({ path: TRACE, categories: ['toplevel', 'gpu', 'viz', 'cc', 'blink', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-gpu.service', 'disabled-by-default-gpu.decoder', 'webaudio', 'audio', 'media'] });
    const joinAt = await page.evaluate(() => performance.now());
    if (ONLINE) {
      await page.type('#join-name', `Newbie${run}x${Date.now() % 1000}`);
      await page.click('#join-go');
      await page.waitForFunction(() => document.getElementById('join').classList.contains('hidden'), { timeout: 30000 });
    } else await page.click('#join-offline');
    await page.evaluate(() => window.__game.activate());
    if (TRACE) { await sleep(1500); await page.tracing.stop(); }
    // Stand 3 s, turn a full circle over 4 s, then stand 3 s: what a new player does.
    await sleep(3000);
    await page.evaluate(() => new Promise((res) => {
      const g = window.__game;
      const y0 = g.world.yaw;
      const t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / 4000);
        g.look(y0 + k * Math.PI * 2, -0.12);
        if (k < 1) requestAnimationFrame(step);
        else res();
      };
      requestAnimationFrame(step);
    }));
    await sleep(3000);
    const { frames, longs, gpu, progs } = await page.evaluate(() => {
      const gl = window.__game.world.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return { frames: window.__frames, longs: window.__longs, gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?', progs: window.__game.world.renderer.info.programs.length };
    });
    const s = summarize(frames, longs, joinAt);
    s.gpu = gpu;
    s.programsAtEnd = progs;
    results.push(s);
    if (!JSON_OUT) console.log(`run ${run + 1}:`, JSON.stringify(s, null, 1));
    await browser.close();
  }
  if (JSON_OUT) console.log(JSON.stringify(results));
} finally {
  await friend?.close();
  game?.kill();
  await server.close();
}

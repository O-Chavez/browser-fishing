// The fireworks as players see them, staged headlessly (GAME_DESIGN.md §41). Pictures only; the rules are checked in
// src/data/rockets.test.ts and server/rockets.test.ts, and with real players in scripts/rocket-check.ts.
//
//   npx tsx scripts/rocket-views.ts [out dir] [part ...]      default out dir: docs/community-zone/fireworks
//
// Parts (all of them when none is named):
//   shop    Bram's counter open with the three rockets, on a desktop-shaped screen and a phone-sized one; and the Bag's row
//   plaque  the stall's counter plaque, close
//   rack    the rack's three prompts (none, light, wait) and the card that picks a rocket, desktop and phone
//   night   each rocket at its best moment from the jetty, the terrace and the pier, at night
//   day     each rocket from the terrace by day, and the finale at dusk
//   finale  the willow from the three views, and the line that names who lit it
//   seq     eight moments across one big rocket and twelve across the finale, from the terrace at night
//   perf    draw calls and frame time at the terrace and the pier: a clear sky against the finale's densest moment
//
// Runs the game offline on its own Vite server (ROCKET_PORT, default 5312). A rocket's show is held at a chosen
// moment for each picture (`__game.rocketStage`), from a fixed seed, so every run draws the same sky.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';
import { createServer } from 'vite';
import { MAPS } from '../src/data/maps';
import { PARTICLE_BUDGET, emitShow, rocketShow, type RocketId } from '../src/data/rockets';
import { TIP_IDS } from '../src/game/tips';
import { newSave } from '../src/game/state';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = Number(process.env.ROCKET_PORT ?? 5312);
const PARTS = ['shop', 'plaque', 'rack', 'night', 'day', 'finale', 'seq', 'perf'];
const args = process.argv.slice(2);
const OUT = path.resolve(args[0] && !PARTS.includes(args[0]) ? args.shift()! : 'docs/community-zone/fireworks');
const parts = args.length ? args : PARTS;
const bad = parts.filter((p) => !PARTS.includes(p));
if (bad.length) {
  console.error(`Unknown part(s): ${bad.join(', ')}. Choose from: ${PARTS.join(', ')}`);
  process.exit(2);
}
const doing = (p: string) => parts.includes(p);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const WAIT = 180_000;

const MAP = MAPS[0];
const FIRE = MAP.campfire;
const CAMP = MAP.camp!;
const DAY = 0.3, DUSK = 0.56, NIGHT = 0.72;
/** The seed every picture's rockets come from. */
const SEED = Number(process.env.ROCKET_SEED ?? 20261117);
/** Each rocket's best moment (s after it is lit), and the willow's. */
const BEST: Record<RocketId, number> = { small: 1.4, big: 2.95, finale: densest(0, 9).t };
const WILLOW = 11.0;
/** The moment of the finale between two times with the most particles alive. */
function densest(from: number, to: number): { t: number; n: number } {
  const show = rocketShow('finale', SEED);
  const spans: [number, number][] = [];
  emitShow(show, (q) => spans.push([q.t0, q.t0 + q.life]));
  let best = { t: 0, n: 0 };
  for (let t = from; t < to; t += 0.05) {
    const n = spans.filter(([a, b]) => t >= a && t < b).length;
    if (n > best.n) best = { t, n };
  }
  return best;
}
/** Where the pictures are taken from: the jetty before the rack, the terrace's lake side between two of the crown's posts, and the pier's T. */
const VIEWS = { jetty: { x: 18.6, z: -9.8 }, terrace: { x: FIRE.x + 4.6 * Math.sin((210 * Math.PI) / 180), z: FIRE.z + 4.6 * Math.cos((210 * Math.PI) / 180) }, pier: { x: 0.8, z: -7.4 } } as const;
type View = keyof typeof VIEWS;
/** Camera yaw that looks from (x, z) toward (tx, tz): yaw 0 looks along -z. */
const yawTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z));

const vite = await createServer({ server: { port: VITE_PORT, strictPort: true, hmr: false, watch: null }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], protocolTimeout: 600_000 });

/** Opens the game offline as "Oscar": a desktop-shaped screen, or a phone in landscape (touch mode, 2x pixels). `hud` keeps the HUD in the picture. */
async function open(o: { phone?: boolean; hud?: boolean; save?: object } = {}): Promise<Page> {
  const page = await (await browser.createBrowserContext()).newPage();
  page.on('pageerror', (e) => console.error(`page error: ${e.message}`));
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warn') && !/GPU stall|GL Driver Message/.test(m.text()) && console.error(`console ${m.type()}: ${m.text().slice(0, 300)}`));
  page.setDefaultTimeout(WAIT);
  if (o.phone) await page.setViewport({ width: 915, height: 412, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1280, height: 720 });
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await page.evaluateOnNewDocument(() => localStorage.setItem('fishing-news', String(Number.MAX_SAFE_INTEGER)));
  await page.evaluateOnNewDocument((save) => localStorage.setItem('fishing-game-save', save), JSON.stringify({ ...newSave(), level: 30, tips: [...TIP_IDS], held: 4, ...o.save }));
  await page.goto(`http://localhost:${VITE_PORT}/?name=Oscar${o.phone ? '&touch' : ''}`, { waitUntil: 'load', timeout: 300_000 });
  await page.waitForFunction(() => (window as any).__game, { timeout: 300_000 });
  // With a name in the address the game skips the join screen and, with no server to find, plays offline under that name.
  if (await page.evaluate(() => !document.getElementById('join')?.classList.contains('hidden'))) await page.click('#join-offline');
  await page.waitForFunction(() => document.getElementById('join')?.classList.contains('hidden'), { timeout: WAIT });
  await page.evaluate(() => (window as any).__game.activate());
  if (!o.phone && !o.hud) await page.addStyleTag({ content: '#hud, #crosshair, #toast, #banner, #tip, #guide, #touch, #chat, #fps, #offline { display: none !important; }' });
  else await page.addStyleTag({ content: '#tip, #guide, #fps, #offline { display: none !important; }' });
  return page;
}
const game = <T = unknown>(p: Page, js: string) => p.evaluate(`(() => { const G = window.__game; ${js} })()`) as Promise<T>;
const frames = (p: Page, n = 2) => p.evaluate((n) => new Promise<void>((done) => { let k = 0; const f = () => (++k > n ? done() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
async function shot(p: Page, name: string): Promise<void> {
  await frames(p, 3);
  await p.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 88 });
  console.log(`wrote ${path.relative(process.cwd(), path.join(OUT, `${name}.jpg`))}`);
}
/** Stands the player at a spot looking at another, `pitch` up, at a time of day. */
async function stand(p: Page, x: number, z: number, tx: number, tz: number, pitch: number, time: number): Promise<void> {
  await game(p, `G.teleport(${x}, ${z}); G.look(${yawTo(x, z, tx, tz)}, ${pitch}); G.day(${time});`);
  await sleep(700);
  await frames(p, 3);
}
/** Stands at one of the three views looking at the middle of a rocket's bursts, with the shore still in the picture. */
async function watch(p: Page, view: View, kind: RocketId, time: number, willow = false): Promise<void> {
  const show = rocketShow(kind, SEED);
  const bursts = willow ? show.bursts.slice(-1) : show.bursts;
  const mid = { x: bursts.reduce((a, b) => a + b.x, 0) / bursts.length, y: bursts.reduce((a, b) => a + b.y, 0) / bursts.length, z: bursts.reduce((a, b) => a + b.z, 0) / bursts.length };
  const v = VIEWS[view];
  const up = Math.atan2(mid.y - 2, Math.hypot(mid.x - v.x, mid.z - v.z));
  // A little under the bursts' middle, so the water and the jetty stay in the picture.
  await stand(p, v.x, v.z, mid.x, mid.z, Math.max(0.12, up - 0.2), time);
}
const stage = (p: Page, kind: RocketId, t: number | null) => game(p, `G.rocketStage(${JSON.stringify(kind)}, ${SEED}, ${t});`);

try {
  for (const kind of ['small', 'big', 'finale'] as const) {
    const show = rocketShow(kind, SEED);
    console.log(`${kind}: ${show.bursts.length} bursts, ${emitShow(show, () => {})} of ${PARTICLE_BUDGET} particles (seed ${SEED})`);
  }

  if (doing('shop')) {
    for (const phone of [false, true]) {
      const p = await open({ phone, hud: true, save: { coins: 61500, rockets: { small: 2 } } });
      const tag = phone ? 'phone' : 'desktop';
      await stand(p, FIRE.x + 3.9, FIRE.z, CAMP.stall.x, CAMP.stall.z, -0.05, DAY);
      await p.waitForFunction(() => (window as any).__game.player().near?.startsWith('Talk to Bram Tinder'), { timeout: WAIT });
      await shot(p, `shop-prompt-${tag}`);
      await game(p, 'G.interact();');
      await p.waitForSelector('.reed.bram');
      await shot(p, `shop-${tag}`);
      await p.click('[data-pick="rocket"][data-id="finale"]');
      await shot(p, `shop-finale-${tag}`);
      await p.click('[data-act="buyrocket"]');
      await shot(p, `shop-bought-${tag}`);
      await game(p, "G.closeMenu(); G.openMenu('inventory');");
      await p.click('[data-pick="bag"][data-id="rocket:finale"]');
      await shot(p, `bag-${tag}`);
      await p.close();
    }
  }

  if (doing('plaque')) {
    const p = await open();
    const s = CAMP.stall;
    // Half a step off the counter, looking down at the plaque on it.
    await stand(p, s.x + 2.7 * Math.sin(s.facing) - 0.55 * Math.cos(s.facing), s.z + 2.7 * Math.cos(s.facing) + 0.55 * Math.sin(s.facing), s.x + 1.2 * Math.sin(s.facing) - 0.55 * Math.cos(s.facing), s.z + 1.2 * Math.cos(s.facing) + 0.55 * Math.sin(s.facing), -0.62, DAY);
    await shot(p, 'plaque');
    await stand(p, FIRE.x + 3.4, FIRE.z + 0.9, s.x, s.z, -0.05, DAY);
    await shot(p, 'plaque-stall');
    await p.close();
  }

  if (doing('rack')) {
    for (const phone of [false, true]) {
      const tag = phone ? 'phone' : 'desktop';
      const p = await open({ phone, hud: true });
      const r = CAMP.rack;
      const at = async (want: string) => {
        await stand(p, r.x - 0.3, r.z + 1.7, r.x, r.z, -0.25, DUSK);
        await p.waitForFunction((w) => (window as any).__game.player().near === w, { timeout: WAIT }, want);
      };
      await at("Rockets at Bram's Kettle");
      await shot(p, `rack-none-${tag}`);
      await game(p, 'G.s.rockets = { big: 1 };');
      await at('Light a rocket');
      await shot(p, `rack-light-${tag}`);
      await game(p, 'G.s.rockets = { small: 3, big: 1, finale: 1 };');
      await frames(p, 3);
      await game(p, 'G.interact();');
      await p.waitForSelector('.dcard.rack');
      await shot(p, `rack-pick-${tag}`);
      // Lights the small one from the card: the sky is busy, and the prompt says so.
      if (phone) await p.tap('[data-act="lightrocket"][data-id="small"]');
      else await p.click('[data-act="lightrocket"][data-id="small"]');
      await p.waitForFunction(() => (window as any).__game.rocket().seen === 1, { timeout: WAIT });
      await stage(p, 'small', 1.3);
      await p.waitForFunction(() => (window as any).__game.player().near === 'Wait for the sky', { timeout: WAIT });
      await shot(p, `rack-wait-${tag}`);
      await p.close();
    }
  }

  const sky = doing('night') || doing('day') || doing('finale') || doing('seq') || doing('perf') ? await open() : null;
  if (sky && doing('night')) {
    for (const kind of ['small', 'big', 'finale'] as const) {
      for (const view of ['jetty', 'terrace', 'pier'] as const) {
        await watch(sky, view, kind, NIGHT);
        await stage(sky, kind, BEST[kind]);
        await shot(sky, `night-${kind}-${view}`);
      }
    }
  }
  if (sky && doing('day')) {
    for (const kind of ['small', 'big', 'finale'] as const) {
      await watch(sky, 'terrace', kind, DAY);
      await stage(sky, kind, BEST[kind]);
      await shot(sky, `day-${kind}-terrace`);
    }
    await watch(sky, 'pier', 'finale', DAY);
    await stage(sky, 'finale', BEST.finale);
    await shot(sky, 'day-finale-pier');
    await watch(sky, 'terrace', 'finale', DAY, true);
    await stage(sky, 'finale', WILLOW);
    await shot(sky, 'day-willow-terrace');
    await watch(sky, 'terrace', 'finale', DUSK);
    await stage(sky, 'finale', BEST.finale);
    await shot(sky, 'dusk-finale-terrace');
  }
  if (sky && doing('finale')) {
    for (const view of ['jetty', 'terrace', 'pier'] as const) {
      await watch(sky, view, 'finale', NIGHT, true);
      await stage(sky, 'finale', WILLOW);
      await shot(sky, `night-willow-${view}`);
    }
    await stage(sky, 'finale', null);
    // The line that names who lit it: a Grand Finale lit for real (offline, so by this player), with the HUD showing.
    for (const phone of [false, true]) {
      const p = await open({ phone, hud: true, save: { rockets: { finale: 1 } } });
      const r = CAMP.rack;
      await stand(p, r.x - 0.3, r.z + 1.7, r.x, r.z, -0.25, NIGHT);
      await p.waitForFunction(() => (window as any).__game.player().near === 'Light a rocket', { timeout: WAIT });
      await game(p, 'G.interact();');
      await p.waitForFunction(() => (window as any).__game.rocket().seen === 1, { timeout: WAIT });
      await stage(p, 'finale', WILLOW);
      await watch(p, 'terrace', 'finale', NIGHT, true);
      await game(p, 'G.look(G.world.yaw, G.world.pitch - 0.16);');
      await shot(p, `finale-line-${phone ? 'phone' : 'desktop'}`);
      await p.close();
    }
  }
  if (sky && doing('seq')) {
    const run = async (kind: RocketId, times: number[]) => {
      await watch(sky, 'terrace', kind, NIGHT);
      for (const [i, t] of times.entries()) {
        await stage(sky, kind, t);
        await shot(sky, `seq-${kind}-${String(i + 1).padStart(2, '0')}-${t.toFixed(2)}s`);
      }
    };
    await run('big', [0.4, 1.0, 1.5, 1.8, 2.3, 2.9, 3.5, 4.3]);
    await run('finale', [0.6, 1.4, 2.4, 3.6, 4.8, 6.0, 7.2, 8.4, 9.3, 9.9, 10.75, 11.6]);
    await run('small', [0.5, 1.05, 1.4, 2.1]);
  }
  if (sky && doing('perf')) {
    const read = () => game<{ calls: number; tris: number; ms: number }>(sky, 'const ms = G.renderMs(); const a = G.perf(); return { calls: a.calls, tris: a.tris, ms };');
    const dense = densest(0, 12);
    console.log(`PERF  the finale's densest moment: ${dense.n} particles alive at ${dense.t.toFixed(2)} s; its buffers hold ${emitShow(rocketShow('finale', SEED), () => {})} quads`);
    for (const time of [NIGHT, DAY]) {
      for (const view of ['terrace', 'pier', 'jetty'] as const) {
        await watch(sky, view, 'finale', time);
        // Software GL on a shared machine: a clear sky and the finale in turn, six times, and the quickest of each.
        const best = { clear: { calls: 0, tris: 0, ms: Infinity }, full: { calls: 0, tris: 0, ms: Infinity } };
        for (let i = 0; i < 6; i++) {
          for (const k of ['clear', 'full'] as const) {
            await stage(sky, 'finale', k === 'clear' ? null : dense.t);
            await frames(sky, 3);
            const m = await read();
            if (m.ms < best[k].ms) best[k] = m;
          }
        }
        const when = time === NIGHT ? 'night' : 'day';
        console.log(`PERF  ${view}, ${when}: clear sky ${best.clear.calls} draw calls, ${best.clear.tris} triangles, ${best.clear.ms} ms a frame; finale at ${dense.t.toFixed(2)} s ${best.full.calls} draw calls, ${best.full.tris} triangles, ${best.full.ms} ms; +${best.full.calls - best.clear.calls} draw call, ${(best.full.ms - best.clear.ms).toFixed(2)} ms`);
      }
    }
    await stage(sky, 'finale', null);
  }
  await sky?.close();
} finally {
  await browser.close();
  await vite.close();
}
process.exit(0);

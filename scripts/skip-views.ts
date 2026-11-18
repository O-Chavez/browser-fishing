// Skipping stones as players see them, staged headlessly with two players on a seeded server: the prompt at the pile
// (desktop and a phone-sized screen), the gauge mid-hold, a stone in flight from the thrower's view and a watcher's,
// the count, the sign with a best on it, by day and at night, and eight frames of one throw. Pictures only: the
// checks are in scripts/skip-check.ts and the unit tests.
//
//   npx tsx scripts/skip-views.ts [out dir]      (default docs/community-zone/stones/)
//
// Starts its own game server and Vite (skip-stage.ts: SKIP_PORT, SKIP_VITE_PORT). The stones are held still for each
// picture (`__game.skip.hold`), and the gauge with `__game.skip.freeze`.
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'puppeteer-core';
import { AIM, DX, DZ, PILE, SIGN, SKIP, WAIT, byPile, frames, put, skipState, sleep, stage, yawTo, type SkipState } from './skip-stage';

const OUT = path.resolve(process.argv[2] ?? 'docs/community-zone/stones');
fs.mkdirSync(OUT, { recursive: true });
const DAY = 0.35;
const NIGHT = 0.72;
const shot = async (p: Page, name: string) => {
  await frames(p, 2);
  await p.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 84 });
  console.log(`wrote ${path.relative(process.cwd(), path.join(OUT, `${name}.jpg`))}`);
};
async function until(p: Page, ok: (s: SkipState) => boolean, ms = WAIT): Promise<SkipState> {
  const t0 = Date.now();
  let s = await skipState(p);
  while (!ok(s) && Date.now() - t0 < ms) {
    await sleep(100);
    s = await skipState(p);
  }
  return s;
}
const prompt = (p: Page) => p.waitForFunction(() => window.__game.player().near === 'Skip a stone', { timeout: WAIT }).catch(async (e) => {
  throw new Error(`no prompt at the pile: ${JSON.stringify(await p.evaluate(() => ({ ...window.__game.player(), yaw: window.__game.world.yaw, phase: window.__game.state().phase, emote: window.__game.emoteState().id, skip: window.__game.skip.state() })))} (${e})`);
});
const hold = (t: number | null, ...pages: Page[]) => Promise.all(pages.map((p) => p.evaluate((t) => window.__game.skip.hold(t), t)));
const day = (f: number, ...pages: Page[]) => Promise.all(pages.map((p) => p.evaluate((f) => window.__game.day(f), f)));
/** Winds up at the pile and lets go at `power`; with `freezeAt` the gauge is held there first for a picture. */
async function wind(p: Page, freezeAt: number): Promise<void> {
  await p.evaluate((at) => { window.__game.interact(); window.__game.skip.freeze(at); }, freezeAt);
  // The view comes round to the lake over the first moments of the hold.
  await frames(p, 16);
}
/** Throws on the sweet spot until the count is `want` or more (luck is the server's); the count. */
async function throwFor(p: Page, power: number, want: number, at: { x: number; z: number; yaw: number }): Promise<number> {
  for (let i = 0; i < 8; i++) {
    await put(p, at.x, at.z, at.yaw);
    await prompt(p);
    await wind(p, power);
    await p.evaluate(() => window.__game.skip.release());
    const n = (await until(p, (s) => s.stones.some((o) => o.own), 20_000)).stones.find((o) => o.own)?.n ?? -1;
    if (n >= want) return n;
    await hold(null, p);
    await until(p, (s) => !s.stones.length && !s.busy);
  }
  return -1;
}

const st = await stage(['Oscar', 'Bob', 'Cat']);
try {
  const spot = byPile(1.05, 235);
  const look = byPile(1.18, 235);
  // SKIP_VIEWS=phone stages only the phone's pictures.
  if (process.env.SKIP_VIEWS !== 'phone') {
  const oscar = await st.join('Oscar', { hud: true, size: [960, 540] });
  const bob = await st.join('Bob', { size: [960, 540] });
  // Bob stands back on the sand, side on to the throw: the thrower, the pile and the water are all in view.
  const watch = { x: PILE.x - 3.6, z: PILE.z + 2.2 };
  const watchYaw = yawTo(watch.x, watch.z, PILE.x + DX * 5, PILE.z + DZ * 5);
  await put(bob, watch.x, watch.z, watchYaw, -0.1);
  // And from the rocket jetty, beside the rack: the stones come past its end and go out over the lake.
  const jetty = { x: 18.0, z: -10.4 };
  const jettyYaw = yawTo(jetty.x, jetty.z, PILE.x + DX * 16, PILE.z + DZ * 16);

  // The prompt at the pile, looking down at it, on a desktop.
  await put(oscar, look.x, look.z, look.yaw, -0.5);
  await prompt(oscar);
  await shot(oscar, 'prompt-desktop');
  // The empty sign, as built.
  const read = { x: SIGN.x + 1.6 * Math.sin(SIGN.facing), z: SIGN.z + 1.6 * Math.cos(SIGN.facing) };
  await put(bob, read.x, read.z, yawTo(read.x, read.z, SIGN.x, SIGN.z), 0);
  await shot(bob, 'sign-empty');
  await put(bob, watch.x, watch.z, watchYaw, -0.1);

  // The gauge mid-hold, a little short of the sweet spot, and then on it.
  await wind(oscar, SKIP.sweet - 0.17);
  await shot(oscar, 'gauge');
  await oscar.evaluate((p) => window.__game.skip.freeze(p), SKIP.sweet);
  await shot(oscar, 'gauge-sweet');
  await oscar.evaluate(() => { window.__game.skip.freeze(0); window.__game.skip.release(); });
  // The server's word can be slow on a loaded machine: wait for the stone before waiting for it to sink.
  await until(oscar, (s) => s.stones.some((o) => o.own), 30_000);
  await until(oscar, (s) => !s.stones.length && !s.busy);

  // A middling throw, held just as it leaves the hand: the watcher sees the arm come through.
  await hold(0.05, oscar, bob);
  await put(oscar, spot.x, spot.z, spot.yaw);
  await prompt(oscar);
  await wind(oscar, SKIP.sweet - 0.03);
  const oscarId = (await oscar.evaluate(() => window.__game.netId())) as number;
  await oscar.evaluate(() => window.__game.skip.release());
  await bob.waitForFunction((id) => window.__game.avatarEmote(id) === 'skip' && window.__game.skip.state().stones.some((o: { t: number }) => o.t >= 0.05), { timeout: WAIT }, oscarId).catch(() => console.log('the pose was over before the stone showed'));
  await shot(bob, 'throw-watcher');
  // On to mid-flight: the stone between skips with its rings behind it, on both screens.
  await put(bob, jetty.x, jetty.z, jettyYaw, -0.16);
  await hold(1.75, oscar, bob);
  await until(oscar, (s) => s.stones.some((o) => o.t >= 1.75));
  await until(bob, (s) => s.stones.some((o) => o.t >= 1.75));
  console.log('mid-flight:', JSON.stringify((await skipState(oscar)).stones));
  await shot(oscar, 'flight-thrower');
  await shot(bob, 'flight-watcher');
  // The end: the count on the thrower's screen.
  await hold(null, oscar, bob);
  await until(oscar, (s) => s.stones.some((o) => o.sunk) || !s.stones.length);
  await shot(oscar, 'count');
  await until(oscar, (s) => !s.stones.length && !s.busy);
  await until(bob, (s) => !s.stones.length);

  // A perfect throw for the sign and for the frames of one throw, from the watcher's side.
  await put(bob, jetty.x, jetty.z, jettyYaw, -0.16);
  await hold(0.02, oscar, bob);
  const n = await throwFor(oscar, SKIP.sweet, 11, spot);
  console.log(`the throw for the frames: ${n} skips`);
  const moments = [0.2, 0.55, 0.9, 1.35, 1.85, 2.5, 3.2, 4.0];
  for (const [i, t] of moments.entries()) {
    await hold(t, oscar, bob);
    await until(bob, (s) => s.stones.some((o) => o.t >= t) || !s.stones.length);
    await until(oscar, (s) => s.stones.some((o) => o.t >= t) || !s.stones.length);
    await shot(bob, `frames-watcher-${i + 1}`);
    await shot(oscar, `frames-thrower-${i + 1}`);
  }
  await hold(null, oscar, bob);
  await until(oscar, (s) => !s.stones.length && !s.busy);
  await until(bob, (s) => !s.stones.length);

  // The sign with the day's best on it, by day: close, and with the pile beside it.
  await put(bob, read.x, read.z, yawTo(read.x, read.z, SIGN.x, SIGN.z), 0);
  await shot(bob, 'sign-day');
  const back = { x: PILE.x - 3.2, z: PILE.z + 0.9 };
  await put(bob, back.x, back.z, yawTo(back.x, back.z, (PILE.x + SIGN.x) / 2, (PILE.z + SIGN.z) / 2), -0.12);
  await shot(bob, 'sign-and-pile-day');

  // At night: the sign, and a stone in flight from both views.
  await day(NIGHT, oscar, bob);
  await sleep(1500);
  await put(bob, read.x, read.z, yawTo(read.x, read.z, SIGN.x, SIGN.z), 0);
  await shot(bob, 'sign-night');
  await put(bob, jetty.x, jetty.z, jettyYaw, -0.16);
  await hold(1.75, oscar, bob);
  await throwFor(oscar, SKIP.sweet - 0.03, 0, spot);
  await until(oscar, (s) => s.stones.some((o) => o.t >= 1.75));
  await until(bob, (s) => s.stones.some((o) => o.t >= 1.75));
  await shot(oscar, 'flight-thrower-night');
  await shot(bob, 'flight-watcher-night');
  await hold(null, oscar, bob);
  await day(DAY, oscar, bob);
  await st.leave(bob);

  await st.leave(oscar);
  }

  // A phone-sized touch screen: the prompt and the SKIP button, the gauge, and the count.
  const cat = await st.join('Cat', { phone: true });
  await put(cat, look.x, look.z, look.yaw, -0.5);
  await prompt(cat);
  await frames(cat, 3);
  await shot(cat, 'prompt-phone');
  await wind(cat, SKIP.sweet - 0.08);
  await shot(cat, 'gauge-phone');
  await hold(1.75, cat);
  await cat.evaluate(() => window.__game.skip.release());
  await until(cat, (s) => s.stones.some((o) => o.own), 30_000);
  await until(cat, (s) => s.stones.some((o) => o.t >= 1.75) || s.stones.some((o) => o.sunk) || !s.stones.length);
  await shot(cat, 'flight-phone');
  await hold(null, cat);
  await until(cat, (s) => s.stones.some((o) => o.sunk) || !s.stones.length);
  await shot(cat, 'count-phone');
} finally {
  await st.close();
}
if (st.errors.length) console.error(`page errors: ${st.errors.join(' | ')}`);
console.log(`AIM ${AIM.toFixed(2)}; pictures in ${path.relative(process.cwd(), OUT)}/`);
process.exit(st.errors.length ? 1 : 0);

declare global {
  interface Window {
    __game: any;
  }
}

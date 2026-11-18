// Skipping stones, played with real players: headless players on a seeded server at the stone pile on Skipper's
// Beach (GAME_DESIGN.md §41). Checks:
//
//   1. the prompt: facing the pile within reach, and looking out over the lake from beside it; not with the back
//      turned, not out of reach, not at the sign, and a seat nearby still offers its own;
//   2. a throw by Ann is seen by Bob: the same stone (count, place) and the throwing pose on her avatar;
//   3. the thrower's counter ticks up to the count and ends on it;
//   4. the sign: unchanged while the stone is in the air, then the day's best on both screens, drawn once;
//   5. more skips take the sign; a tie keeps the holder and redraws nothing;
//   6. one stone at a time: no prompt while the thrower's stone flies, and the server drops a second release;
//   7. no throw while seated, on the screen or past it; none while a cast is winding up;
//   8. a late joiner (on a phone-sized touch screen) sees the sign's best, gets the prompt and the SKIP button, and
//      throws with a finger.
//
//   npx tsx scripts/skip-check.ts [out dir]      (default .bench/skip/)
//
// Starts its own game server and Vite (skip-stage.ts: SKIP_PORT, SKIP_VITE_PORT) on a throwaway data folder. Prints
// PASS/FAIL per check, saves a few screenshots, exits non-zero on a failure.
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'puppeteer-core';
import { skipSignText, skipsText } from '../src/data/skip';
import { AIM, PILE, SIGN, SKIP, WAIT, byPile, frames, near, put, signDraws, skipState, sleep, stage, throwStone, yawTo, type SkipState } from './skip-stage';

const OUT = path.resolve(process.argv[2] ?? '.bench/skip');
fs.mkdirSync(OUT, { recursive: true });

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
const check = (name: string, ok: boolean, detail: unknown = ''): void => {
  const d = typeof detail === 'string' ? detail : JSON.stringify(detail);
  results.push({ name, ok, detail: d });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${d ? `  (${d})` : ''}`);
};
const shoot = async (p: Page, name: string) => {
  await p.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 85 });
  console.log(`      wrote ${path.relative(process.cwd(), path.join(OUT, `${name}.jpg`))}`);
};
const r2 = (v: number) => Math.round(v * 100) / 100;
const SKIP_PROMPT = 'Skip a stone';
/** Waits for a page's skipping state to satisfy `ok`; the state it ended on either way. */
async function until(p: Page, ok: (s: SkipState) => boolean, ms = WAIT): Promise<SkipState> {
  const t0 = Date.now();
  let s = await skipState(p);
  while (!ok(s) && Date.now() - t0 < ms) {
    await sleep(120);
    s = await skipState(p);
  }
  return s;
}
/** No stone of anyone's left in the air on a screen. */
const settled = (p: Page) => until(p, (s) => s.stones.length === 0 && !s.busy);
/** Throws from where the player stands and waits for their stone to show: its count, or -1 if the prompt wasn't offered or no stone came. */
async function throwAndCount(p: Page, power: number): Promise<number> {
  if (!(await throwStone(p, power))) return -1;
  const s = await until(p, (x) => x.stones.some((o) => o.own), 20_000);
  return s.stones.find((o) => o.own)?.n ?? -1;
}

const st = await stage(['Ann', 'Bob', 'Cat']);
try {
  const ann = await st.join('Ann', { hud: true });
  const bob = await st.join('Bob');
  const annId = (await ann.evaluate(() => window.__game.netId())) as number;
  const bobId = (await bob.evaluate(() => window.__game.netId())) as number;
  const spot = byPile();
  // Bob stands back on the sand, where Ann, the pile, the sign and the water are all in view.
  const watch = { x: PILE.x - 3.4, z: PILE.z + 2.6 };
  const watchYaw = yawTo(watch.x, watch.z, PILE.x - 1.5, PILE.z - 3.5);
  await put(bob, watch.x, watch.z, watchYaw, -0.12);

  // ---------- 1. the prompt ----------

  await put(ann, spot.x, spot.z, spot.yaw);
  await ann.waitForFunction((want) => window.__game.player().near === want, { timeout: WAIT }, SKIP_PROMPT).catch(() => {});
  const facingPile = await near(ann);
  const shown = await ann.evaluate(() => ({ text: document.getElementById('prompt')?.textContent ?? '', hidden: document.getElementById('prompt')?.classList.contains('hidden') }));
  check('1a. facing the pile within reach: "Skip a stone" (E)', facingPile === SKIP_PROMPT && !shown.hidden && shown.text.includes(SKIP_PROMPT), { near: facingPile, prompt: shown });
  await shoot(ann, '1-prompt-ann');
  await put(ann, spot.x, spot.z, AIM);
  const facingLake = await near(ann);
  check('1b. beside the pile, looking out over the lake the way the stones fly: offered too', facingLake === SKIP_PROMPT, { near: facingLake });
  // Back turned to the pile and to the lake: toward the terrace.
  await put(ann, spot.x, spot.z, yawTo(spot.x, spot.z, spot.x - 3, spot.z + 5));
  const backTurned = await near(ann);
  check('1c. beside the pile with the back to it and to the lake: not offered', backTurned !== SKIP_PROMPT, { near: backTurned });
  const far = byPile(SKIP.reach + 0.5);
  await put(ann, far.x, far.z, far.yaw);
  const outOfReach = await near(ann);
  check(`1d. ${r2(SKIP.reach + 0.5)} m from the pile, facing it: not offered`, outOfReach !== SKIP_PROMPT, { near: outOfReach });
  // Reading the sign: a step in front of its face, looking at it; and right up against it.
  const signs: (string | null)[] = [];
  for (const d of [1.2, 0.7]) {
    const at = { x: SIGN.x + d * Math.sin(SIGN.facing), z: SIGN.z + d * Math.cos(SIGN.facing) };
    await put(ann, at.x, at.z, yawTo(at.x, at.z, SIGN.x, SIGN.z), -0.05);
    signs.push(await near(ann));
  }
  check('1e. in front of the sign, reading it: no prompt', signs.every((s) => s !== SKIP_PROMPT), { near: signs });
  await shoot(ann, '1-sign-ann');
  // The seat nearest the pile still offers itself from in front, and the pile is not offered from there.
  type Seat = { x: number; z: number; facing: number };
  const seat = (await ann.evaluate((pile) => {
    const seats = (window.__game.world as any).town.seats as Seat[];
    return seats.map((s) => ({ x: s.x, z: s.z, facing: s.facing })).sort((a, b) => Math.hypot(a.x - pile.x, a.z - pile.z) - Math.hypot(b.x - pile.x, b.z - pile.z))[0];
  }, PILE)) as Seat;
  const seatFront = { x: seat.x + 0.9 * Math.sin(seat.facing), z: seat.z + 0.9 * Math.cos(seat.facing) };
  await put(ann, seatFront.x, seatFront.z, seat.facing, -0.2);
  const atSeat = await near(ann);
  check('1f. at the seat nearest the pile, facing it: "Sit down", not the pile', !!atSeat?.startsWith('Sit down'), { near: atSeat, seatToPile: r2(Math.hypot(seat.x - PILE.x, seat.z - PILE.z)) });

  // ---------- 2-4. a throw, seen by both, and the sign ----------

  await put(ann, spot.x, spot.z, spot.yaw);
  const draws0 = { ann: await signDraws(ann), bob: await signDraws(bob) };
  const before = { ann: await skipState(ann), bob: await skipState(bob) };
  check('4a. before anyone skips, the sign reads "today: none yet" on both screens', before.ann.sign === skipSignText(null) && before.bob.sign === skipSignText(null) && before.ann.best === null, { ann: before.ann.sign, bob: before.bob.sign });
  // Both screens hold their stones 1.2 s into the flight, so the same moment can be compared.
  for (const p of [ann, bob]) await p.evaluate(() => window.__game.skip.hold(1.2));
  // Bob watches Ann's avatar from the moment she lets go: the pose it plays, sampled every frame.
  const bobSaw = bob.evaluate(async (id) => {
    const g = window.__game;
    const poses = new Set<string>();
    const t0 = performance.now();
    while (performance.now() - t0 < 25_000) {
      await new Promise((r) => requestAnimationFrame(r));
      const e = g.avatarEmote(id);
      if (e) poses.add(e);
      if (poses.size && !e) break;
    }
    return [...poses];
  }, annId);
  // A release a little under the sweet spot: a middling throw (about 5 skips), so there is room to beat it.
  const threw = await throwStone(ann, SKIP.sweet - 0.065);
  const view = await ann.evaluate(() => ({ yaw: window.__game.world.yaw as number }));
  const a1 = await until(ann, (s) => s.stones.some((o) => o.own && o.t >= 1.2));
  const b1 = await until(bob, (s) => s.stones.some((o) => o.id === annId && o.t >= 1.2));
  const sa = a1.stones.find((o) => o.own);
  const sb = b1.stones.find((o) => o.id === annId);
  const n1 = sa?.n ?? -1;
  check('2a. E at the pile and letting go throws a stone: a middling release skips 3 to 7 times', threw && n1 >= 3 && n1 <= 7, { threw, n: n1 });
  check('2b. winding up turns the thrower to look out over the lake', Math.abs(Math.atan2(Math.sin(view.yaw - AIM), Math.cos(view.yaw - AIM))) < 0.5, { yaw: r2(view.yaw), aim: r2(AIM) });
  const apart = sa && sb ? Math.hypot(sa.x - sb.x, sa.y - sb.y, sa.z - sb.z) : Infinity;
  check("2c. Bob sees Ann's stone: the same count, in the same place at the same moment, out over the water", !!sa && !!sb && sb.n === n1 && !sb.own && apart < 0.1 && sb.seen && sb.z < PILE.z - 6, { ann: sa, bob: sb, apart: r2(apart) });
  check('2d. rings on the water on both screens', a1.rings >= 1 && b1.rings >= 1, { ann: a1.rings, bob: b1.rings });
  check('4b. the sign waits while the stone is in the air', a1.sign === skipSignText(null) && b1.sign === skipSignText(null), { ann: a1.sign, bob: b1.sign });
  await shoot(ann, '2-flight-ann');
  await shoot(bob, '2-flight-bob');
  // On, to the end: the counter's readings on Ann's screen as the stone skips.
  const counting = ann.evaluate(async () => {
    const g = window.__game;
    const seen: string[] = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 60_000) {
      await new Promise((r) => requestAnimationFrame(r));
      const s = g.skip.state();
      if (s.counter && seen[seen.length - 1] !== s.counter) seen.push(s.counter);
      if (!s.stones.length) break;
    }
    return seen;
  });
  for (const p of [ann, bob]) await p.evaluate(() => window.__game.skip.hold(null));
  const counted = (await counting) as string[];
  const ticks = counted.slice(0, -1).map(Number);
  const rising = ticks.every((v, i) => Number.isInteger(v) && v >= 1 && v <= n1 && (i === 0 || v > ticks[i - 1]));
  check('3a. the thrower sees the count tick up and end on the final count', rising && ticks.length >= 1 && counted.at(-1) === skipsText(n1), { counted, n: n1 });
  const poses = (await bobSaw) as string[];
  check('2e. Bob sees Ann throw: the throwing pose plays on her avatar, then ends', poses.length === 1 && poses[0] === 'skip' && (await bob.evaluate((id) => window.__game.avatarEmote(id), annId)) === null, { poses });
  const a2 = await settled(ann);
  const b2 = await settled(bob);
  const want1 = skipSignText({ n: n1, name: 'Ann' });
  const draws1 = { ann: await signDraws(ann), bob: await signDraws(bob) };
  check("4c. once it has sunk the sign reads the day's best on both screens, drawn once", a2.sign === want1 && b2.sign === want1 && draws1.ann === draws0.ann + 1 && draws1.bob === draws0.bob + 1, { sign: a2.sign, bob: b2.sign, draws: [draws1.ann - draws0.ann, draws1.bob - draws0.bob] });
  const cleared = await ann.evaluate(async () => { const t0 = performance.now(); while (performance.now() - t0 < 60_000 && window.__game.skip.state().counter) await new Promise((r) => requestAnimationFrame(r)); return window.__game.skip.state().counter; });
  check('3b. the count goes away by itself a moment later', cleared === null, { counter: cleared });
  // Bob looks at the sign from in front.
  const read = { x: SIGN.x + 1.5 * Math.sin(SIGN.facing), z: SIGN.z + 1.5 * Math.cos(SIGN.facing) };
  await put(bob, read.x, read.z, yawTo(read.x, read.z, SIGN.x, SIGN.z), 0.05);
  await shoot(bob, '4-sign-bob');

  // ---------- 5. more skips take the sign; a tie keeps the holder ----------

  // Bob throws on the sweet spot (11 or 12): the sign is his.
  const bobSpot = byPile(1, 205);
  await put(bob, bobSpot.x, bobSpot.z, bobSpot.yaw);
  await bob.waitForFunction((want) => window.__game.player().near === want, { timeout: WAIT }, SKIP_PROMPT).catch(() => {});
  let best = { n: await throwAndCount(bob, SKIP.sweet), name: 'Bob' };
  await settled(bob);
  await settled(ann);
  let [as, bs] = [await skipState(ann), await skipState(bob)];
  check('5a. a throw on the sweet spot skips 11 or 12 times and takes the sign, on both screens', best.n >= 11 && as.sign === skipSignText(best) && bs.sign === skipSignText(best), { n: best.n, ann: as.sign, bob: bs.sign });
  // The other player throws on the sweet spot until they tie the holder. (Luck is the server's, a skip either way:
  // if they beat an 11 with a 12 the sign is theirs, and the first holder then ties that, at the top count.)
  const players = { Ann: ann, Bob: bob } as const;
  let tied = false;
  let tieDetail: unknown = null;
  for (let round = 0; round < 10 && !tied; round++) {
    const who = best.name === 'Bob' ? 'Ann' : 'Bob';
    const p = players[who];
    const at = who === 'Ann' ? spot : bobSpot;
    await put(p, at.x, at.z, at.yaw);
    await p.waitForFunction((want) => window.__game.player().near === want, { timeout: WAIT }, SKIP_PROMPT).catch(() => {});
    const drawsWas = { ann: await signDraws(ann), bob: await signDraws(bob) };
    const n = await throwAndCount(p, SKIP.sweet);
    await settled(ann);
    await settled(bob);
    await frames(ann, 3);
    await frames(bob, 3);
    [as, bs] = [await skipState(ann), await skipState(bob)];
    const drawsNow = { ann: await signDraws(ann), bob: await signDraws(bob) };
    if (n === best.n) {
      tied = as.sign === skipSignText(best) && bs.sign === skipSignText(best) && drawsNow.ann === drawsWas.ann && drawsNow.bob === drawsWas.bob;
      tieDetail = { thrower: who, n, holder: best, ann: as.sign, bob: bs.sign, redraws: [drawsNow.ann - drawsWas.ann, drawsNow.bob - drawsWas.bob] };
      break;
    }
    if (n > best.n) {
      best = { n, name: who };
      check(`5b. ${who} beats it with ${n}: the sign is theirs on both screens`, as.sign === skipSignText(best) && bs.sign === skipSignText(best), { ann: as.sign, bob: bs.sign });
    } else {
      check(`5b. ${who} throws fewer (${n}): the sign keeps ${best.name}`, as.sign === skipSignText(best) && bs.sign === skipSignText(best), { ann: as.sign, bob: bs.sign });
    }
  }
  check('5c. a tie keeps the holder: the sign is unchanged and not redrawn, on both screens', tied, tieDetail);

  // ---------- 6. one stone at a time ----------

  await put(ann, spot.x, spot.z, spot.yaw);
  await ann.waitForFunction((want) => window.__game.player().near === want, { timeout: WAIT }, SKIP_PROMPT).catch(() => {});
  for (const p of [ann, bob]) await p.evaluate(() => window.__game.skip.hold(0.6));
  // A second release sent to the server right behind the first (what a tampered client could do) is dropped: her
  // stone is in the air. While it is, the prompt is withheld and E does nothing.
  const first = (await ann.evaluate(async (p) => {
    const g = window.__game;
    g.interact();
    for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
    g.skip.release(p);
    g.skip.send(p);
    const t0 = performance.now();
    while (performance.now() - t0 < 20_000 && !g.skip.state().stones.length) await new Promise((r) => setTimeout(r, 10));
    return g.skip.state().stones[0]?.n ?? -1;
  }, SKIP.sweet)) as number;
  await until(bob, (s) => s.stones.some((o) => o.id === annId));
  await put(ann, spot.x, spot.z, spot.yaw);
  const midAir = await near(ann);
  const again = await throwStone(ann, SKIP.sweet);
  await sleep(1500);
  await frames(bob, 6);
  const [a6, b6] = [await skipState(ann), await skipState(bob)];
  check('6a. while her stone is in the air Ann is not offered another, and E throws nothing', first >= 0 && midAir !== SKIP_PROMPT && !again && a6.stones.length === 1, { first, near: midAir, again, stones: a6.stones.length });
  check('6b. a second release sent to the server anyway brings no second stone, on either screen', a6.stones.filter((o) => o.id === annId).length === 1 && b6.stones.filter((o) => o.id === annId).length === 1, { ann: a6.stones.length, bob: b6.stones.length });
  // Bob's own stone is not held up by hers.
  await put(bob, bobSpot.x, bobSpot.z, bobSpot.yaw);
  await bob.waitForFunction((want) => window.__game.player().near === want, { timeout: WAIT }, SKIP_PROMPT).catch(() => {});
  const bobToo = await throwAndCount(bob, 0.2);
  const a6b = await until(ann, (s) => s.stones.some((o) => o.id === bobId), 20_000);
  check("6c. Bob can throw while Ann's stone is in the air: two stones on both screens", bobToo >= 0 && a6b.stones.length === 2, { bobToo, stones: a6b.stones.map((o) => o.id) });
  for (const p of [ann, bob]) await p.evaluate(() => window.__game.skip.hold(null));
  await settled(ann);
  await settled(bob);
  await put(ann, spot.x, spot.z, spot.yaw);
  await ann.waitForFunction((want) => window.__game.player().near === want, { timeout: 20_000 }, SKIP_PROMPT).catch(() => {});
  check('6d. once it has sunk the prompt is back', (await near(ann)) === SKIP_PROMPT, { near: await near(ann) });

  // ---------- 7. not while seated, nor while a cast winds up ----------

  await put(ann, seatFront.x, seatFront.z, seat.facing, -0.2);
  await ann.waitForFunction(() => window.__game.player().near?.startsWith('Sit down'), { timeout: WAIT }).catch(() => {});
  await ann.evaluate(() => window.__game.interact());
  await frames(ann, 6);
  const sat = (await ann.evaluate(() => window.__game.emoteState().id)) as string | null;
  await bob.waitForFunction((id) => window.__game.avatarEmote(id) === 'sit', { timeout: WAIT }, annId).catch(() => {});
  // Seated, she looks at the pile: no prompt; E (the hook's interact) does nothing; a release sent anyway is dropped.
  await ann.evaluate((yaw) => window.__game.look(yaw, -0.15), yawTo(seat.x, seat.z, PILE.x, PILE.z));
  await frames(ann, 4);
  const seatedNear = await near(ann);
  const seatedThrow = await throwStone(ann, SKIP.sweet);
  await ann.evaluate((p) => window.__game.skip.send(p), SKIP.sweet);
  await sleep(1500);
  await frames(bob, 6);
  const [a7, b7] = [await skipState(ann), await skipState(bob)];
  const stillSat = (await ann.evaluate(() => window.__game.emoteState().id)) as string | null;
  check('7a. seated by the pile: no prompt, no throw, and she stays seated', sat === 'sit' && seatedNear !== SKIP_PROMPT && !seatedThrow && !a7.charging && stillSat === 'sit', { sat, near: seatedNear, threw: seatedThrow, still: stillSat, seatToPile: r2(Math.hypot(seat.x - PILE.x, seat.z - PILE.z)) });
  check('7b. a release sent to the server while seated brings no stone, on either screen', a7.stones.length === 0 && b7.stones.length === 0, { ann: a7.stones.length, bob: b7.stones.length });
  // Up again (a step back), and to the pile with the rod in hand: a cast winding up withholds the prompt.
  await ann.evaluate(() => window.__game.key('KeyS', true));
  await frames(ann, 3);
  await ann.evaluate(() => window.__game.key('KeyS', false));
  await put(ann, spot.x, spot.z, AIM);
  await ann.keyboard.press('Digit1');
  await frames(ann, 3);
  const fishing = (await ann.evaluate(async () => {
    const g = window.__game;
    const was = g.player().near;
    g.press();
    for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
    const out = { was, phase: g.state().phase as string, near: g.player().near as string | null, charging: g.skip.state().charging as boolean };
    g.setPower(0.5);
    g.release();
    return out;
  })) as { was: string | null; phase: string; near: string | null; charging: boolean };
  check('7c. while a cast winds up at the pile the stones are not offered', fishing.was === SKIP_PROMPT && fishing.phase === 'charging' && fishing.near !== SKIP_PROMPT && !fishing.charging, fishing);
  // Pull the line in again and put the rod away.
  await ann.evaluate(async () => {
    const g = window.__game;
    const t0 = performance.now();
    while (performance.now() - t0 < 20_000 && g.state().phase !== 'waiting' && g.state().phase !== 'idle') await new Promise((r) => requestAnimationFrame(r));
    if (g.state().phase === 'waiting') { g.press(); g.release(); }
  });
  await ann.keyboard.press('Digit5');

  // ---------- 8. a late joiner, on a phone ----------

  const cat = await st.join('Cat', { phone: true });
  await frames(cat, 4);
  const c0 = await skipState(cat);
  check("8a. Cat, joining later, has the day's best on her sign", c0.best?.n === best.n && c0.best?.name === best.name && c0.sign === skipSignText(best), { best: c0.best, sign: c0.sign });
  const catSpot = byPile(1.05, 228);
  await put(cat, catSpot.x, catSpot.z, catSpot.yaw);
  await cat.waitForFunction((want) => window.__game.player().near === want, { timeout: WAIT }, SKIP_PROMPT).catch(() => {});
  await frames(cat, 3);
  const phone = await cat.evaluate(() => {
    const prompt = document.getElementById('prompt')!;
    const action = document.querySelector('.t-action') as HTMLElement;
    const box = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    return { near: window.__game.player().near, prompt: prompt.textContent, hidden: prompt.classList.contains('hidden'), box: box(prompt), action: action.textContent, actionBox: box(action), screen: [innerWidth, innerHeight] };
  });
  const onScreen = (b: { x: number; y: number; w: number; h: number }) => b.w > 0 && b.x >= 0 && b.y >= 0 && b.x + b.w <= phone.screen[0] && b.y + b.h <= phone.screen[1];
  check('8b. on a phone-sized touch screen the prompt shows and the action button reads SKIP, both on screen', phone.near === SKIP_PROMPT && !phone.hidden && !!phone.prompt?.includes(SKIP_PROMPT) && !!phone.action?.includes('SKIP') && onScreen(phone.box) && onScreen(phone.actionBox), phone);
  await shoot(cat, '8-prompt-phone');
  // A finger down on the action button winds up, and lifting it throws.
  const mid = (b: { x: number; y: number; w: number; h: number }) => [b.x + b.w / 2, b.y + b.h / 2] as const;
  await cat.touchscreen.touchStart(...mid(phone.actionBox));
  await frames(cat, 6);
  const finger = await cat.evaluate((p) => {
    const g = window.__game;
    const out = { charging: g.skip.state().charging as boolean, action: document.querySelector('.t-action')?.textContent, prompt: document.getElementById('prompt')?.textContent, phase: g.state().phase as string };
    g.skip.freeze(p);
    return out;
  }, SKIP.sweet - 0.1);
  await cat.touchscreen.touchEnd();
  const c1 = await until(cat, (s) => s.stones.some((o) => o.own), 20_000);
  check('8c. a finger held on the action button winds up (RELEASE, "Let go to throw") and lifting it throws; no cast starts', finger.charging && !!finger.action?.includes('RELEASE') && !!finger.prompt?.includes('Let go to throw') && finger.phase === 'idle' && c1.stones.some((o) => o.own), { finger, stones: c1.stones.length });
  const b8 = await until(bob, (s) => s.stones.some((o) => o.id !== annId && o.id !== bobId), 20_000);
  check("8d. Bob sees Cat's stone too", b8.stones.length === 1, { stones: b8.stones.map((o) => ({ id: o.id, n: o.n })) });
  await settled(cat);
  // A finger on the prompt itself does the same.
  await put(cat, catSpot.x, catSpot.z, catSpot.yaw);
  await cat.waitForFunction((want) => window.__game.player().near === want, { timeout: WAIT }, SKIP_PROMPT).catch(() => {});
  const box = await cat.evaluate(() => { const r = document.getElementById('prompt')!.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  // On its icon at the left, an element the prompt rewrites every frame: the finger's release must still arrive.
  await cat.touchscreen.touchStart(box.x + 24, box.y + box.h / 2);
  await frames(cat, 6);
  const held = (await cat.evaluate(() => window.__game.skip.state().charging)) as boolean;
  await cat.touchscreen.touchEnd();
  await frames(cat, 4);
  const onPrompt = { charging: held, after: (await cat.evaluate(() => window.__game.skip.state().charging)) as boolean };
  const c2 = await until(cat, (s) => s.stones.some((o) => o.own), 20_000);
  check('8e. a finger held on the prompt winds up and lifting it throws once (the tap that follows starts nothing)', onPrompt.charging && !onPrompt.after && c2.stones.filter((o) => o.own).length === 1, { onPrompt, stones: c2.stones.length });
  await settled(cat);
} catch (e) {
  check('skip check ran to the end', false, String(e));
} finally {
  await st.close();
}

check('no page errors', st.errors.length === 0, st.errors.slice(0, 5).join(' | '));
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} checks passed. Screenshots in ${path.relative(process.cwd(), OUT)}/`);
process.exit(bad.length ? 1 : 0);

declare global {
  interface Window {
    __game: any;
  }
}

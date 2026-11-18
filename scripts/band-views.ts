// The campfire band as players see it, staged headlessly: the six instruments alone, standing by their logs at
// Anglers' Rest, and in the hands of seated players, by day and at night. Pictures only; nothing is checked here
// (the rules are in src/game/point.test.ts, the sound in scripts/band-audio.ts, real players in scripts/band-check.ts).
//
//   npx tsx scripts/band-views.ts [out dir] [part ...]      default out dir: .bench/band-views
//
// Parts (all of them when none is named):
//   props   each instrument alone, close, from two sides
//   ring    the empty fire ring by day and at night from the gate, the cove wall and above, and each stand close up;
//           with `before-` copies of the far views with the instruments hidden, to compare with the camp as it was
//   play    for each instrument: the player's own seated view at two moments of the bar, and a seated player seen
//           from the ring at the same two moments (the whistle's and the jug's at night), and from the fire's side
//   band    all six logs taken, from the cove side, from above and from the pier (day and night)
//   extras  two on one log, bulky outfits playing, and the prompt on a phone-sized screen
//   after   the ring once everyone has got up
//   seats   each kind of seat (a fire log, the cove wall, a bench) from the side, level with it: the
//           player's own seated body and another player's, with the gap between the body and the seat measured;
//           BAND_TAG=<word> puts the word before these pictures' names (a `before` run on older code)
//
// Runs the game offline on its own Vite server (BAND_PORT, default 5296). The player who sits is the real player;
// every other sitter is one of the game's made-up players (`__game.bandFakes`, a staging hook), drawn and seated the
// way a real player's avatar is. The band's clock is held still for each picture (`__game.bandClock`), so the two
// moments of a bar are the same two on every run.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';
import { createServer } from 'vite';
import { BAR_MS, EIGHTH_MS, INSTRUMENTS, type InstrumentId } from '../src/data/band';
import { MAPS, SEAT_TOP, atBearing, campSeats, campStands } from '../src/data/maps';
import { TIP_IDS } from '../src/game/tips';
import { newSave } from '../src/game/state';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = Number(process.env.BAND_PORT ?? 5296);
const args = process.argv.slice(2);
const OUT = path.resolve(args[0] && !['props', 'ring', 'play', 'band', 'extras', 'after', 'seats'].includes(args[0]) ? args.shift()! : '.bench/band-views');
const PARTS = ['props', 'ring', 'play', 'band', 'extras', 'after', 'seats'];
const parts = args.length ? args : PARTS;
const bad = parts.filter((p) => !PARTS.includes(p) && !INSTRUMENTS.some((i) => i.id === p));
if (bad.length) {
  console.error(`Unknown part(s): ${bad.join(', ')}. Choose from: ${PARTS.join(', ')} (and an instrument's name, to stage only its play views)`);
  process.exit(2);
}
/** Instruments named on the command line narrow `play` to them. */
const onlyInstruments = parts.filter((p) => INSTRUMENTS.some((i) => i.id === p)) as InstrumentId[];
const doing = (p: string) => parts.includes(p) || (p === 'play' && onlyInstruments.length > 0);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Software GL draws a few frames a second, so everything waits on a condition with room to spare.
const WAIT = 180_000;

const MAP = MAPS[0];
const FIRE = MAP.campfire;
const CAMP = MAP.camp!;
const SEATS = campSeats(MAP);
const STANDS = campStands(MAP);
const DAY = 0.3;
const NIGHT = 0.72;
/** A bar well into the tune, so every part has a bar before it: the pictures' moments are counted from its start. */
const BAR = 4000;
/**
 * Two moments of the bar for each instrument, in ms from the bar's start: one as a note lands (the hand down, the
 * bellows going out) and one between notes (the hand back up, the bellows wide).
 */
const MOMENTS: Record<InstrumentId, [number, number]> = {
  banjo: [60, 250],
  drum: [20, 2 * EIGHTH_MS + 20],
  squeezebox: [150, 1000],
  whistle: [40, 3 * EIGHTH_MS + 40],
  washboard: [70, 300],
  jug: [30, 800],
};
/** Camera yaw that looks from (x, z) toward (tx, tz): yaw 0 looks along -z. */
const yawTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z));
const bearingOf = (p: { x: number; z: number }) => ((Math.atan2(p.x - FIRE.x, p.z - FIRE.z) * 180) / Math.PI + 360) % 360;

const vite = await createServer({ server: { port: VITE_PORT, strictPort: true, hmr: false, watch: null }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  protocolTimeout: 600_000,
});

/** Opens the game offline: on a desktop-shaped screen with the HUD hidden, or on a phone in landscape with it showing. */
async function open(phone = false): Promise<Page> {
  const page = await (await browser.createBrowserContext()).newPage();
  page.on('pageerror', (e) => console.error(`page error: ${e.message}`));
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warn') && console.error(`console ${m.type()}: ${m.text().slice(0, 300)}`));
  page.setDefaultTimeout(WAIT);
  if (phone) await page.setViewport({ width: 915, height: 412, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // Smaller than the README's shots: software GL draws this size about twice as fast.
  else await page.setViewport({ width: 960, height: 540 });
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await page.evaluateOnNewDocument(() => localStorage.setItem('fishing-news', String(Number.MAX_SAFE_INTEGER)));
  // Every tip seen, so no tip box covers the shot; hand on an empty slot, so no rod in view.
  await page.evaluateOnNewDocument((save) => localStorage.setItem('fishing-game-save', save), JSON.stringify({ ...newSave(), tips: [...TIP_IDS], held: 4 }));
  await page.goto(`http://localhost:${VITE_PORT}/${phone ? '?touch' : ''}`, { waitUntil: 'load', timeout: 300_000 });
  await page.waitForFunction(() => window.__game, { timeout: 300_000 });
  await page.click('#join-offline');
  await page.waitForFunction(() => document.getElementById('join')?.classList.contains('hidden'), { timeout: WAIT });
  await page.evaluate(() => window.__game.activate());
  if (!phone) await page.addStyleTag({ content: '#hud, #crosshair, #toast, #banner, #tip, #guide, #touch, #chat, #fps { display: none !important; }' });
  return page;
}
const game = <T = unknown>(p: Page, js: string) => p.evaluate(`(() => { const G = window.__game; ${js} })()`) as Promise<T>;
/** Lets the game draw `n` more frames. */
const frames = (p: Page, n = 2) => p.evaluate((n) => new Promise<void>((done) => { let k = 0; const f = () => (++k > n ? done() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
async function shot(p: Page, name: string): Promise<void> {
  await frames(p);
  await p.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 86 });
  console.log(`wrote ${path.relative(process.cwd(), path.join(OUT, `${name}.jpg`))}`);
}
/** Stands the player at a spot looking at another, at a time of day; `lens` narrows the view (degrees, 70 is the game's). */
async function stand(p: Page, x: number, z: number, tx: number, tz: number, pitch = -0.1, time = DAY, lens = 70): Promise<void> {
  await game(p, `clearInterval(window.__lens); window.__lens = setInterval(() => { G.world.fovKick = ${lens - 70}; }, 4);
    G.teleport(${x}, ${z}); G.look(${yawTo(x, z, tx, tz)}, ${pitch}); G.day(${time});`);
  await sleep(900);
}
/** A picture from a camera of the script's own (the game's camera is the player's eyes): from `from` looking at `at`. */
async function fromAbove(p: Page, name: string, from: [number, number, number], at: [number, number, number], fov = 40): Promise<void> {
  await frames(p);
  const url = await game<string>(p, `const w = G.world; const cam = w.camera.clone();
    cam.fov = ${fov}; cam.position.set(${from.join(',')}); cam.up.set(0, 1, 0); cam.lookAt(${at.join(',')}); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    w.renderer.render(w.scene, cam);
    const c = document.createElement('canvas'); c.width = w.renderer.domElement.width; c.height = w.renderer.domElement.height;
    c.getContext('2d').drawImage(w.renderer.domElement, 0, 0);
    return c.toDataURL('image/jpeg', 0.88);`);
  fs.writeFileSync(path.join(OUT, `${name}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
  console.log(`wrote ${path.relative(process.cwd(), path.join(OUT, `${name}.jpg`))}`);
}
const clock = (p: Page, ms: number | null) => game(p, `G.bandClock(${ms === null ? 'null' : BAR * BAR_MS + ms});`);
const fakes = (p: Page, sitters: { seat?: number; at?: object; look?: object; name?: string }[]) => game(p, `G.bandFakes(${JSON.stringify(sitters)});`);
/** Sits the real player on a seat, as a player does: walk up, face it, press E; then waits until they have settled. */
async function sit(p: Page, seat: number | { x: number; z: number; facing: number }): Promise<void> {
  const s = typeof seat === 'number' ? SEATS[seat] : seat;
  // Close in front of it, so no other seat is nearer; and through the game's own lens, whatever the last picture used.
  await game(p, `clearInterval(window.__lens); G.world.fovKick = 0; G.teleport(${s.x + 0.7 * Math.sin(s.facing)}, ${s.z + 0.7 * Math.cos(s.facing)}); G.look(${s.facing}, -0.2);`);
  // The prompt is worked out as the game draws: a few frames, so it is this spot's and not the last one's.
  await frames(p, 4);
  await p.waitForFunction(() => window.__game.player().near?.startsWith('Sit down'), { timeout: WAIT });
  await game(p, 'G.interact();');
  await p.waitForFunction(() => window.__game.emoteState().id === 'sit' && window.__game.emoteState().t > 1.6, { timeout: WAIT });
  const at = await game<{ x: number; z: number }>(p, 'return G.player();');
  if (Math.hypot(at.x - s.x, at.z - s.z) > 0.05) throw new Error(`sat at ${at.x.toFixed(2)}, ${at.z.toFixed(2)}, not on the seat at ${s.x.toFixed(2)}, ${s.z.toFixed(2)}`);
}
/** Waits until a made-up sitter has settled on its seat (the game moves only as fast as it draws), and says how high its body's lowest point is. */
async function settled(p: Page, id = 900000): Promise<number | null> {
  let last: number | null = null;
  for (let i = 0; i < 120; i++) {
    await frames(p, 4);
    const y = await game<number | null>(p, `return G.avatarEmote(${id}) === 'sit' ? G.avatarFoot(${id}) : null;`);
    if (y !== null && last !== null && Math.abs(y - last) < 0.002) return y;
    last = y;
  }
  return last;
}
/** Gets the real player up: a step back. */
async function getUp(p: Page): Promise<void> {
  await game(p, "G.key('KeyS', true);");
  await p.waitForFunction(() => window.__game.emoteState().id === null, { timeout: WAIT });
  await game(p, "G.key('KeyS', false);");
  await sleep(400);
}
/** Where someone standing in the ring behind the logs sees a seat from the side: `round` degrees on round the fire, `r` m out. */
const beside = (seat: number, round: number, r: number) => atBearing(FIRE, r, bearingOf(SEATS[seat]) + round);

// Outfits for the made-up players: plain ones in the body colours of the tests, and a few bulky ones.
const PLAIN = [0xe86a5a, 0x4a8fd6, 0x7ac76a, 0xf2c14e, 0xb07ad6, 0x5ac7c0].map((color) => ({ color }));
const BULKY: Record<string, object> = {
  kraken: { color: 0x7a4fd0, hat: 'krakencrown', shirt: 'krakenarmor', jewelry: 'krakenbeak', pet: 'krakenpet' },
  leviathan: { color: 0x3f82d9, hat: 'leviathanjaw', shirt: 'leviathancoil', jewelry: 'leviathanfangs', pet: 'leviathanpet' },
  dreamer: { color: 0xd98ad0, hat: 'dreamercap', shirt: 'dreamerrobe', jewelry: 'dreamcatcher', pet: 'dreamerpet' },
  town: { color: 0xf2c14e, hat: 'straw', shirt: 'cloak', jewelry: 'compass' },
  tophat: { color: 0x444b5a, hat: 'tophat', shirt: 'tux', jewelry: 'diamond' },
  visor: { color: 0x7ac76a, hat: 'visor', shirt: 'hawaiian', jewelry: 'shell' },
};

let failed = false;
try {
  const page = await open();
  await sleep(1500);

  if (doing('props')) {
    // Each instrument as its builder makes it, held up at eye height on the upper street, turned two ways.
    await page.evaluate(`(async () => { window.INS = await import('/src/game/instruments.ts'); window.ENV = await import('/src/game/env.ts'); })()`);
    const S = { x: 0, z: 40 };
    for (const { id } of INSTRUMENTS) {
      for (const [k, yaw] of [0.45, 0.45 + 2.5].entries()) {
        await game(page, `const scene = G.world.scene; if (window.__prop) scene.remove(window.__prop);
          const inst = window.INS.buildInstrument(${JSON.stringify(id)});
          const g = inst.group; const holder = new (g.constructor)(); holder.add(g);
          // Upright and facing the camera: the banjo's neck up, the drum's skin and the squeezebox's bellows side on.
          if (${JSON.stringify(id)} === 'banjo') { g.rotation.z = Math.PI / 2; g.position.y = -0.3; }
          if (${JSON.stringify(id)} === 'drum') g.rotation.x = 1.0;
          if (${JSON.stringify(id)} === 'squeezebox') window.INS.squeeze(inst, 0.6);
          if (${JSON.stringify(id)} === 'whistle') g.position.y = 0.23;
          if (${JSON.stringify(id)} === 'jug') g.position.y = -0.19;
          holder.rotation.y = ${yaw};
          holder.position.set(${S.x}, window.ENV.groundHeight(${S.x}, ${S.z}) + 1.62, ${S.z});
          scene.add(holder); window.__prop = holder;`);
        await stand(page, S.x, S.z + 1.5, S.x, S.z, 0, DAY, 46);
        await shot(page, `a-${id}-${k + 1}`);
      }
    }
    await game(page, 'if (window.__prop) G.world.scene.remove(window.__prop); window.__prop = null;');
  }

  /** The far views of the ring: from the gate, from the cove wall's middle across the fire, and from above. */
  const ringViews = async (tag: string, time: number, t: string) => {
    await stand(page, CAMP.arch.x - 0.3, CAMP.arch.z + 1.2, FIRE.x, FIRE.z, -0.12, time);
    await shot(page, `${tag}-gate-${t}`);
    const wall = atBearing(FIRE, CAMP.r - 0.5, CAMP.seatWall.pier);
    await stand(page, wall.x, wall.z, FIRE.x, FIRE.z, -0.14, time);
    await shot(page, `${tag}-covewall-${t}`);
    // The player stands by the fire for this one, so the lights nearest the ring are the ones lit.
    await stand(page, FIRE.x - 1.6, FIRE.z, FIRE.x, FIRE.z, -0.2, time);
    await fromAbove(page, `${tag}-above-${t}`, [FIRE.x, 14, FIRE.z + 0.01], [FIRE.x, 0.85, FIRE.z], 44);
  };
  const hideStands = (hide: boolean) => game(page, `for (const g of G.world.town.instruments) g.visible = ${!hide};`);

  if (doing('ring')) {
    for (const [t, time] of [['day', DAY], ['night', NIGHT]] as const) {
      await ringViews('b-ring', time, t);
      // The same views with the instruments hidden: the camp as it was before the band.
      await hideStands(true);
      await ringViews('b-before', time, t);
      await hideStands(false);
    }
    // Each instrument on its stand, close: from the ring behind the log, and from the fire's side.
    for (const [i, { id }] of INSTRUMENTS.entries()) {
      const s = STANDS[i];
      const out = atBearing(FIRE, CAMP.logs.r + 1.7, bearingOf(s));
      await stand(page, out.x, out.z, s.x, s.z, -0.62, DAY);
      await shot(page, `b-stand-${id}-ring`);
      const inn = atBearing(FIRE, CAMP.logs.r - 1.5, bearingOf(s) + (CAMP.logs.stands[i] > 0 ? -12 : 12));
      await stand(page, inn.x, inn.z, s.x, s.z, -0.7, DAY);
      await shot(page, `b-stand-${id}-fire`);
    }
    await stand(page, STANDS[0].x + 1.5, STANDS[0].z + 1.5, STANDS[0].x, STANDS[0].z, -0.6, NIGHT);
    await shot(page, 'b-stand-banjo-night');
  }

  if (doing('play')) {
    for (const [i, { id }] of INSTRUMENTS.entries()) {
      if (onlyInstruments.length && !onlyInstruments.includes(id)) continue;
      const seat = i * 2;
      const time = id === 'whistle' || id === 'jug' ? NIGHT : DAY;
      const t = time === NIGHT ? 'night' : 'day';
      await game(page, `G.day(${time});`);
      // The player's own seated view.
      await sit(page, seat);
      for (const [k, ms] of MOMENTS[id].entries()) {
        await clock(page, ms);
        await shot(page, `c-${id}-own-${k + 1}-${t}`);
      }
      await getUp(page);
      // The same seat taken by another player, seen from the ring well round to one side (so the sitter's front shows),
      // from by the fire, and from the ring right behind them.
      await fakes(page, [{ seat, look: PLAIN[i], name: INSTRUMENTS[i].name }]);
      const side = beside(seat, -75, 3.7);
      await stand(page, side.x, side.z, SEATS[seat].x, SEATS[seat].z, -0.2, time);
      await settled(page);
      for (const [k, ms] of MOMENTS[id].entries()) {
        await clock(page, ms);
        await shot(page, `c-${id}-seen-${k + 1}-${t}`);
      }
      const front = beside(seat, -38, 1.5);
      await stand(page, front.x, front.z, SEATS[seat].x, SEATS[seat].z, -0.25, time);
      await shot(page, `c-${id}-front-${t}`);
      const back = atBearing(FIRE, 4.7, bearingOf(SEATS[seat]) + 6);
      await stand(page, back.x, back.z, SEATS[seat].x, SEATS[seat].z, -0.3, time);
      await shot(page, `c-${id}-back-${t}`);
      await fakes(page, []);
    }
    await clock(page, null);
  }

  if (doing('band')) {
    // All six logs taken, one player on each, in six plain outfits.
    await fakes(page, INSTRUMENTS.map((ins, i) => ({ seat: i * 2 + (i % 2), look: PLAIN[i], name: ins.name })));
    await clock(page, 60);
    for (const [t, time] of [['day', DAY], ['night', NIGHT]] as const) {
      const cove = atBearing(FIRE, CAMP.r - 0.6, 262);
      await stand(page, cove.x, cove.z, FIRE.x, FIRE.z, -0.13, time);
      await settled(page, 900005);
      await shot(page, `d-band-cove-${t}`);
      await stand(page, FIRE.x - 1.6, FIRE.z, FIRE.x, FIRE.z, -0.2, time);
      await fromAbove(page, `d-band-above-${t}`, [FIRE.x - 5.5, 6.5, FIRE.z + 0.01], [FIRE.x, 1, FIRE.z], 50);
      // From the pier across the cove (map-views.ts's `piercamp`), and the same through a longer lens.
      await stand(page, 1, 1, 1 + Math.sin(1.4) * 10, 1 - Math.cos(1.4) * 10, -0.03, time);
      await shot(page, `d-band-pier-${t}`);
      await stand(page, 1, 1, FIRE.x, FIRE.z, -0.02, time, 24);
      await shot(page, `d-band-pier-long-${t}`);
    }
    await fakes(page, []);
    await clock(page, null);
  }

  if (doing('extras')) {
    // Two on one log: the real player and another on the banjo's log, each with a banjo.
    await game(page, `G.day(${DAY});`);
    await fakes(page, [{ seat: 1, look: PLAIN[1], name: 'banjo two' }]);
    await sit(page, 0);
    await clock(page, 60);
    await shot(page, 'e-two-on-a-log-own');
    await getUp(page);
    await fakes(page, [{ seat: 0, look: PLAIN[0], name: 'banjo one' }, { seat: 1, look: PLAIN[1], name: 'banjo two' }]);
    const two = beside(0, -30, 1.3);
    await stand(page, two.x, two.z, (SEATS[0].x + SEATS[1].x) / 2, (SEATS[0].z + SEATS[1].z) / 2, -0.25, DAY);
    await settled(page, 900001);
    await shot(page, 'e-two-on-a-log-seen');
    // Bulky outfits, one to an instrument, each seen from the fire's side and from the ring; and the player's own in one.
    const outfits = Object.entries(BULKY);
    await fakes(page, INSTRUMENTS.map((ins, i) => ({ seat: i * 2, look: outfits[i][1], name: `${ins.name} · ${outfits[i][0]}` })));
    await clock(page, 250);
    for (const [i, { id }] of INSTRUMENTS.entries()) {
      const seat = i * 2;
      const front = beside(seat, -38, 1.5);
      await stand(page, front.x, front.z, SEATS[seat].x, SEATS[seat].z, -0.22, DAY);
      if (i === 0) await settled(page, 900005);
      await shot(page, `e-bulky-${id}-${outfits[i][0]}-front`);
      const side = beside(seat, 75, 3.7);
      await stand(page, side.x, side.z, SEATS[seat].x, SEATS[seat].z, -0.2, DAY);
      await shot(page, `e-bulky-${id}-${outfits[i][0]}-side`);
    }
    // The same six outfits moved on one log each, so every outfit is seen with two instruments.
    await fakes(page, INSTRUMENTS.map((ins, i) => ({ seat: i * 2, look: outfits[(i + 3) % 6][1], name: `${ins.name} · ${outfits[(i + 3) % 6][0]}` })));
    for (const [i, { id }] of INSTRUMENTS.entries()) {
      const seat = i * 2;
      const front = beside(seat, -38, 1.5);
      await stand(page, front.x, front.z, SEATS[seat].x, SEATS[seat].z, -0.22, DAY);
      if (i === 0) await settled(page, 900005);
      await shot(page, `e-bulky-${id}-${outfits[(i + 3) % 6][0]}-front`);
    }
    await fakes(page, []);
    await clock(page, null);
    // The prompt on a phone-sized screen, HUD and all.
    const phone = await open(true);
    await sleep(1500);
    const s = SEATS[0];
    await game(phone, `G.teleport(${s.x + 0.9 * Math.sin(s.facing)}, ${s.z + 0.9 * Math.cos(s.facing)}); G.look(${s.facing}, -0.2); G.day(${DAY});`);
    await phone.waitForFunction(() => window.__game.player().near?.startsWith('Sit down'), { timeout: WAIT });
    console.log(`prompt at the banjo's log: ${await game<string>(phone, 'return G.player().near;')}`);
    await sleep(800);
    await shot(phone, 'e-prompt-phone');
    const wall = SEATS[20];
    await game(phone, `G.teleport(${wall.x + 0.9 * Math.sin(wall.facing)}, ${wall.z + 0.9 * Math.cos(wall.facing)}); G.look(${wall.facing}, -0.2);`);
    await phone.waitForFunction(() => window.__game.player().near?.startsWith('Sit down'), { timeout: WAIT });
    console.log(`prompt at the cove wall: ${await game<string>(phone, 'return G.player().near;')}`);
    await shot(phone, 'e-prompt-phone-wall');
    await phone.browserContext().close();
  }

  if (doing('seats')) {
    const tag = process.env.BAND_TAG ? `${process.env.BAND_TAG}-` : '';
    await page.evaluate(`(async () => { window.ENV = await import('/src/game/env.ts'); })()`);
    const bench = MAP.town.benches.find((b) => Math.hypot(b.x - FIRE.x, b.z - FIRE.z) < 12)!;
    const kinds: [string, { x: number; z: number; facing: number }, number][] = [
      ['firelog', SEATS[4], SEAT_TOP.log],
      ['wall', SEATS[20], SEAT_TOP.wall],
      ['bench', { x: bench.x + 0.42 * Math.cos(bench.facing), z: bench.z - 0.42 * Math.sin(bench.facing), facing: bench.facing }, SEAT_TOP.bench],
    ];
    await game(page, `G.day(${DAY});`);
    // BAND_SEATS=wall,bench stages only those kinds.
    const wanted = process.env.BAND_SEATS?.split(',');
    for (const [kind, s, top] of kinds) {
      if (wanted && !wanted.includes(kind)) continue;
      const ground = await game<number>(page, `return window.ENV.standHeight(${s.x}, ${s.z});`);
      // Level with the sitter, 3 m along the seat to their left and a little to the front.
      const cam: [number, number, number] = [s.x + 3 * Math.cos(s.facing) + 0.6 * Math.sin(s.facing), ground + 0.9, s.z - 3 * Math.sin(s.facing) + 0.6 * Math.cos(s.facing)];
      const at: [number, number, number] = [s.x, ground + 0.95, s.z];
      await sit(page, s);
      await frames(page, 3);
      const own = await game<number>(page, 'return G.bodyFoot();');
      await fromAbove(page, `h-${tag}seat-${kind}-own`, cam, at, 44);
      if (kind === 'firelog' || kind === 'bench') await shot(page, `h-${tag}seat-${kind}-camera`);
      await getUp(page);
      await fakes(page, [{ at: s, look: PLAIN[0], name: kind }]);
      // The watcher stands where the camera is, so the sitter is drawn as a nearby player's is.
      await stand(page, cam[0], cam[2], s.x, s.z, -0.3, DAY);
      const seen = await settled(page);
      await fromAbove(page, `h-${tag}seat-${kind}-seen`, cam, at, 44);
      await fakes(page, []);
      const gap = (y: number | null) => (y === null ? 'hidden' : `${(y - ground - top).toFixed(3)} m`);
      console.log(`SEAT ${tag}${kind}: the seat's top is ${top.toFixed(2)} m up; the body's lowest point is ${gap(own)} over it on the sitter's own screen, ${gap(seen)} on a watcher's`);
    }
  }

  if (doing('after')) {
    // Everyone sits, everyone gets up: the instruments are back by their logs.
    await game(page, `G.day(${DAY});`);
    await fakes(page, INSTRUMENTS.map((ins, i) => ({ seat: i * 2, look: PLAIN[i], name: ins.name })));
    await stand(page, FIRE.x - 1.6, FIRE.z, FIRE.x, FIRE.z, -0.2, DAY);
    await settled(page, 900005);
    const during = await game<boolean[]>(page, 'return G.world.town.instruments.map((g) => g.visible);');
    await fakes(page, []);
    await sleep(1000);
    const after = await game<boolean[]>(page, 'return G.world.town.instruments.map((g) => g.visible);');
    console.log(`instruments on their stands while all six logs are taken: ${JSON.stringify(during)}; after everyone is up: ${JSON.stringify(after)}`);
    await ringViews('f-after', DAY, 'day');
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
    __lens: ReturnType<typeof setInterval>;
  }
}

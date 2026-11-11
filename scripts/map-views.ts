// Hero views of the lakeside map, staged headlessly for the map rework (docs/map-rework/harbour.md):
// each view at a desktop and a phone-sized viewport, by day and at dusk (the night view at night).
//
//   npx tsx scripts/map-views.ts <out dir> [view ...]
//   npx tsx scripts/map-views.ts <out dir> --walk [waypoint ...]   the routes players walk (`WALK`), desktop by day
//
// Runs the game offline (no server), so nothing is saved. The view names are the keys of VIEWS.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';
import { createServer } from 'vite';
import { TIP_IDS } from '../src/game/tips';
import { newSave } from '../src/game/state';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = 5298;
const [outArg, ...only] = process.argv.slice(2);
if (!outArg) {
  console.error('usage: npx tsx scripts/map-views.ts <out dir> [view ...]');
  process.exit(2);
}
const OUT = path.resolve(outArg);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Camera yaw 0 looks along -z (out to the lake), π toward the gate; positive turns toward -x. */
interface View { x: number; z: number; yaw: number; pitch?: number; note: string; times?: Record<string, number> }
const DAY = { day: 0.3, dusk: 0.53 };
export const VIEWS: Record<string, View> = {
  tend: { x: 0, z: -7.5, yaw: 0.3, note: 'T end looking out: open lake, mountains, the islet left of centre' },
  spawn: { x: 0, z: 1, yaw: Math.PI, note: 'spawn turned round: lanterns, boards at the root, stalls, harbour front, gate on the axis' },
  westjetty: { x: -7.5, z: 4.5, yaw: 0, note: 'west jetty: the rowboat alongside, Reed\'s beach, the Furthest Out board and the seaplane to the left' },
  quaywest: { x: -12.6, z: 12.2, yaw: -0.5, note: 'quay west end: down Reed\'s lane past the worm patch to the board, the sign and the plane' },
  westlane: { x: -16.5, z: 22, yaw: 0.6, note: 'west lane behind the Fishmonger looking down to the worm patch and the quay' },
  // The three views below are the plan's views turned to what their notes name: in the game's yaw, positive turns
  // toward -x, so the plan's yaws for the quay's west end and the west lane looked east, not down Reed's lane.
  westjetty2: { x: -7.5, z: 4.5, yaw: 0.55, note: 'west jetty turned left: the cove\'s west side, Reed\'s beach and where the seaplane will float' },
  quaylane: { x: -12, z: 13, yaw: 0.9, note: 'quay west end down Reed\'s lane: the worm patch, the board, the sign and the plane (all still in their old spots)' },
  westlane2: { x: -16.5, z: 22, yaw: -0.1, note: 'west lane looking down to the worm patch and the quay\'s west end' },
  fishmonger: { x: -8.5, z: 13.5, yaw: 2.75, note: 'from the quay: the Fishmonger with its door to the main street, the bench and flower bed in front' },
  netmender: { x: 8.5, z: 13.5, yaw: -2.72, note: 'from the quay: the Net Mender with its door to the main street, the racks behind the Smokehouse' },
  smokehouse: { x: 0, z: 8.5, yaw: -2.55, note: 'pier root looking at the Smokehouse: the smoker beside it on the street side' },
  jetty: { x: 7.5, z: 9.6, yaw: 0.15, note: 'east jetty from its root: the bench along the edge, the lamp at the end' },
  bench: { x: 7.5, z: 6, yaw: -1.34, note: 'jetty bench across the water to the campfire headland at dusk' },
  night: { x: 0, z: -7.5, yaw: Math.PI, note: 'T end at night: pier, three reflections, string lights, gate glow', times: { night: 0.72 } },
};
/** Camera yaw that looks from (x, z) toward (tx, tz). */
const yawTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z));
const at = (x: number, z: number, tx: number, tz: number, note: string, times?: Record<string, number>): View => ({ x, z, yaw: yawTo(x, z, tx, tz), note, times });
/**
 * `--walk`: instead of the hero views, the waypoints of the routes players walk, each looking the way they would:
 * the first minutes, Reed's loop and the east loop, with a few spots at night. Desktop only.
 */
export const WALK: Record<string, View> = {
  w01_spawn: { x: 0, z: 1, yaw: 0, note: 'spawn: the first look, out along the pier' },
  w02_tend: { x: 0, z: -7.5, yaw: 0, note: 'T end: the first cast' },
  w03_tend_back: { x: 0, z: -7.5, yaw: Math.PI, note: 'T end turned round: the walk back' },
  w04_pier: { x: 0, z: 4, yaw: Math.PI, note: 'halfway up the pier: the quay ahead' },
  w05_root: { x: 0, z: 10.5, yaw: Math.PI, note: 'stepping onto the quay: the stalls and the street' },
  w06_marlow: at(-3.9, 15.6, -5.5, 17.5, "at Marlow's counter"),
  w07_mags: at(4.1, 16.1, 5.5, 17.5, "at the Smokehouse counter"),
  w08_boards: at(11, 11.6, 11, 13.6, 'reading Top Anglers'),
  w09_boards_back: at(11, 11.6, 0, 1, 'from the boards, turning back to the pier'),
  w10_street: { x: 0, z: 19, yaw: Math.PI, note: 'up the main street from the quay' },
  w11_square_in: { x: 0, z: 27, yaw: Math.PI, note: 'arriving at the square' },
  w12_square_w: at(0, 32, -11.5, 35.5, 'the square looking west down the lane to Wren\'s'),
  w13_square_e: at(0, 32, 10.5, 38.5, 'the square looking east down the lane to the blue house'),
  w14_upper: { x: 0, z: 42, yaw: Math.PI, note: 'the upper street: fences, cottages, the gate' },
  w15_gate: { x: 0, z: 52.5, yaw: Math.PI, note: 'at the gate' },
  w16_gate_back: { x: 0, z: 52.5, yaw: 0, note: 'from the gate looking back down to the water' },
  r01_quay_w: at(-9.5, 12.3, -16.5, 9, "quay west end, heading for Reed's lane"),
  r02_lane: at(-15, 11, -19.2, 8.2, 'on the lane: the worm patch and the Furthest Out board ahead'),
  r03_board: at(-17.3, 9.4, -19.2, 8.2, 'reading the Furthest Out board'),
  r04_reed: at(-18.2, 1.6, -20, 1, 'talking to Reed'),
  r05_landing: at(-21.5, 3.5, -14.5, -2.5, 'landing back from a charter, looking at the plane'),
  r06_beach_back: at(-19.5, 3, -13, 13.5, "from Reed's beach looking back up the lane to the quay"),
  r07_ring_w1: at(-17, 15, -16.5, 22, 'the west ring lane, going up behind the Fishmonger'),
  r08_ring_w2: at(-16.5, 22, -12.5, 28.6, "the west ring lane toward Wren's"),
  r09_ring_w3: at(-12.5, 28.6, -2, 32, 'arriving at the square from the west lane'),
  e01_quay_e: at(11, 12, 16.5, 5.5, 'quay east end, heading down the campfire ramp'),
  e02_ramp: at(14.5, 8.2, 18, 2, 'on the ramp: the campfire ahead'),
  e03_camp: at(19.8, 2, 18, 2, 'sitting at the campfire'),
  e04_camp_view: at(19.8, 2, -7.5, 7, 'from the campfire looking back across the cove to the west jetty'),
  e05_ring_e1: at(18.5, 16, 18.5, 24, 'the east ring lane going up behind the Net Mender'),
  e06_ring_e2: at(18.5, 24, 15.5, 31, 'the east ring lane toward the blue house'),
  e07_ring_e3: at(15.5, 31, 2, 32, 'arriving at the square from the east lane'),
  j01_west_jetty: { x: -7.5, z: 5, yaw: 0, note: 'casting from the west jetty' },
  j02_east_jetty: { x: 7.5, z: 5, yaw: 0, note: 'casting from the east jetty' },
  n01_root: { x: 0, z: 10.5, yaw: Math.PI, note: 'stepping onto the quay at night', times: { night: 0.72 } },
  n02_square: { x: 0, z: 27, yaw: Math.PI, note: 'arriving at the square at night', times: { night: 0.72 } },
  n03_lane: at(-15, 11, -19.2, 8.2, "Reed's lane at night", { night: 0.72 }),
  n04_ramp: at(14.5, 8.2, 18, 2, 'the campfire ramp at night', { night: 0.72 }),
  n06_street: { x: 0, z: 17, yaw: Math.PI, note: 'the main street at night from the quay road: far lamps light the cobbles', times: { night: 0.72 } },
  n08_pier: { x: 0, z: 6, yaw: Math.PI, note: 'from the pier at night: the street lamp is far enough to be a light pool, which must lie on the cobbles', times: { night: 0.72 } },
  n07_upper: { x: 0, z: 40, yaw: Math.PI, note: 'the upper street at night', times: { night: 0.72 } },
  n05_ring_w: at(-16.5, 22, -12.5, 28.6, 'the west ring lane at night', { night: 0.72 }),
};
const walk = only[0] === '--walk';
const TABLE = walk ? WALK : VIEWS;
if (walk) only.shift();
const unknown = only.filter((v) => !TABLE[v]);
if (unknown.length) {
  console.error(`Unknown view(s): ${unknown.join(', ')}. Choose from: ${Object.keys(TABLE).join(', ')}`);
  process.exit(2);
}
const views = Object.entries(TABLE).filter(([k]) => !only.length || only.includes(k));

const vite = await createServer({ server: { port: VITE_PORT, strictPort: true }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});

/** Opens the game offline at a viewport: the README's desktop size, or a phone in landscape (touch mode, 2x pixels). */
async function open(phone: boolean): Promise<Page> {
  const page = await (await browser.createBrowserContext()).newPage();
  page.on('pageerror', (e) => console.error(`page error: ${e.message}`));
  if (phone) await page.setViewport({ width: 915, height: 412, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1280, height: 720 });
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await page.evaluateOnNewDocument(() => localStorage.setItem('fishing-news', String(Number.MAX_SAFE_INTEGER)));
  // Every tip seen, so no tip box covers the shot; hand on an empty slot, so no rod in view.
  await page.evaluateOnNewDocument((save) => localStorage.setItem('fishing-game-save', save), JSON.stringify({ ...newSave(), tips: [...TIP_IDS], held: 4 }));
  await page.goto(`http://localhost:${VITE_PORT}/${phone ? '?touch' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game);
  await page.click('#join-offline');
  await page.waitForFunction(() => document.getElementById('join')?.classList.contains('hidden'), { timeout: 20000 });
  await page.evaluate(() => window.__game.activate());
  await page.addStyleTag({ content: '#hud, #crosshair, #toast, #banner, #tip, #guide, #touch, #chat, #fps { display: none !important; }' });
  return page;
}
const game = (p: Page, js: string) => p.evaluate(`(() => { const G = window.__game; ${js} })()`);

let failed = false;
try {
  for (const phone of walk ? [false] : [false, true]) {
    const page = await open(phone);
    await sleep(1500);
    for (const [name, v] of views) {
      for (const [time, f] of Object.entries(v.times ?? (walk ? { day: DAY.day } : DAY))) {
        await game(page, `G.teleport(${v.x}, ${v.z}); G.look(${v.yaw}, ${v.pitch ?? -0.03}); G.day(${f});`);
        await sleep(1200);
        const file = `${name}-${phone ? 'phone' : 'desktop'}-${time}.jpg`;
        await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 82 });
        console.log(`wrote ${path.relative(process.cwd(), path.join(OUT, file))}`);
      }
    }
    await page.browserContext().close();
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

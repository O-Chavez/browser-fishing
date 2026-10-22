// End-to-end smoke test: plays the game in headless Chrome and checks the flows most likely to
// break silently (merged scenery, the wardrobe preview, map travel, the casino tables).
//
//   npm run smoke
//
// Starts its own game server on a throwaway data folder (your saves are never touched), seeds a
// level-20 test account that starts in the casino, and writes screenshots to .bench/smoke/.
// Exits non-zero if any check fails or the page logs an error.
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';
import { createServer } from 'vite';
import { FISH } from '../src/data/content';
import { MAPS } from '../src/data/maps';
import { newSave } from '../src/game/state';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = 5288;
// Its own game server port, so a local `npm run dev:all` can keep running; the client is pointed at it below.
const SMOKE_SERVER_PORT = 8788;
const SHOTS = path.resolve('.bench/smoke');
const TOKEN = 'smoke-test-token-0123456789abcdef';

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
const errors: string[] = [];
const check = (name: string, ok: boolean, detail = ''): void => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- server with a seeded account ----------

if (await portInUse(SMOKE_SERVER_PORT)) {
  console.error(`Port ${SMOKE_SERVER_PORT} is in use (a previous smoke run still going?).`);
  process.exit(2);
}
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fishing-smoke-'));
const fish = (i: number) => ({ k: 'fish' as const, fishId: FISH[i % FISH.length].id, size: 40 + i * 5 });
// The last slot holds a top-tier fish: anything worth under 1 chip is refused at the tray.
const rich = { k: 'fish' as const, fishId: FISH.find((f) => f.tier === 5)!.id, size: 60 };
const save = { ...newSave(), level: 20, coins: 5000, chips: 100, location: 'casino', slots: [{ k: 'rod', id: 'twig' }, { k: 'bait', id: 'worm', n: 15 }, fish(0), fish(1), rich] };
fs.writeFileSync(
  path.join(dataDir, 'accounts.json'),
  JSON.stringify({ smoke: { name: 'Smoke', hash: createHash('sha256').update(TOKEN).digest('hex'), save } }),
);
fs.mkdirSync(SHOTS, { recursive: true });

const server = spawn('npx', ['tsx', 'server/index.ts'], {
  env: { ...process.env, DATA_DIR: dataDir, PORT: String(SMOKE_SERVER_PORT), DATABASE_URL: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await waitForLine(server, /fishing server on port/);
process.env.VITE_SERVER_URL = `ws://localhost:${SMOKE_SERVER_PORT}`;
const vite = await createServer({ server: { port: VITE_PORT, strictPort: true }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  defaultViewport: { width: 1280, height: 720 },
});

try {
  await pondChecks();
  await casinoChecks();
  await chatChecks();
} catch (e) {
  check('smoke test ran to the end', false, String(e));
} finally {
  await browser.close();
  await vite.close();
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots in ${path.relative(process.cwd(), SHOTS)}/`);
process.exit(failed.length ? 1 : 0);

// ---------- pond (offline) ----------

async function pondChecks(): Promise<void> {
  const page = await openPage(`http://localhost:${VITE_PORT}/`);
  await page.click('#join-offline');
  const joined = await page.evaluate(() => ({
    menu: !document.getElementById('menu')!.classList.contains('hidden'),
    banner: document.getElementById('banner')!.classList.contains('hidden') ? '' : document.getElementById('banner')!.textContent,
    resume: document.getElementById('resume')!.classList.contains('hidden') ? '' : document.getElementById('resume')!.textContent,
  }));
  check('join: the inventory stays closed after joining', !joined.menu);
  check('join: a new player gets the welcome banner', joined.banner!.includes('Welcome to Lakeside'), joined.banner!);
  check('join: the banner asks for a click to start fishing', joined.resume!.includes('Click to start fishing'), joined.resume!);
  await page.evaluate(() => window.__game.activate());
  check('join: starting to play dismisses the welcome', await page.evaluate(() => document.getElementById('banner')!.classList.contains('hidden') && document.getElementById('resume')!.classList.contains('hidden')));
  await sleep(800);

  let r = await page.evaluate(() => window.__smoke.attachedReport('hub'));
  check('pond: hub animated parts still in the scene', r.missing.length === 0, r.missing.join(', ') || `${r.checked} checked`);
  r = await page.evaluate(() => window.__smoke.attachedReport('town'));
  check('pond: town animated parts still in the scene', r.missing.length === 0, r.missing.join(', ') || `${r.checked} checked`);

  // Dock decorations and townsfolk don't block movement; shore props still do.
  const blocked = await page.evaluate(() => {
    const cs = (window.__game.world as any).colliders as { x: number; z: number; r: number }[];
    const hit = (x: number, z: number) => cs.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 0.05);
    return { bucket: hit(-0.8, 1.6), barrel: hit(7.8, 4.5), reed: hit(4, 53.5), stallBarrel: hit(8.4, 19.2) };
  });
  check('pond: dock props and NPCs can be walked through', !blocked.bucket && !blocked.barrel && !blocked.reed, JSON.stringify(blocked));
  check('pond: shore props still block', blocked.stallBarrel, JSON.stringify(blocked));

  // Night: lamps, windows and torches must still be on meshes that are drawn.
  await page.evaluate(() => { window.__game.day(0.7); window.__game.teleport(0, 24); window.__game.look(Math.PI, -0.15); });
  await sleep(600);
  const night = await page.evaluate(() => {
    const w = window.__game.world as any;
    const used = window.__smoke.materialsInScene();
    return {
      hubLamps: w.hub.lampLights.some((l: any) => l.intensity > 1),
      hubLampMats: w.hub.lampMats.every((m: any) => used.has(m) && m.emissiveIntensity > 1),
      townLamps: w.town.lights.some((l: any) => l.intensity > 1),
      townLampMats: w.town.lamps.every((m: any) => used.has(m)),
      windows: used.has(w.town.windowMat),
    };
  });
  check('pond night: hub lamps lit and their bulbs drawn', night.hubLamps && night.hubLampMats);
  check('pond night: town lamps lit, lanterns and windows drawn', night.townLamps && night.townLampMats && night.windows);
  await page.screenshot({ path: `${SHOTS}/pond-plaza-night.png` });

  const anim = await page.evaluate(async () => {
    const w = window.__game.world as any;
    const hang0 = w.hub.hanging[0].rotation.z;
    const flame0 = w.hub.flames[0].scale.y;
    const smoke0 = w.town.smoke[0]?.m.position.y;
    await new Promise((r) => setTimeout(r, 500));
    return { hanging: w.hub.hanging[0].rotation.z !== hang0, flames: w.hub.flames[0].scale.y !== flame0, smoke: w.town.smoke[0]?.m.position.y !== smoke0 };
  });
  check('pond: hanging fish, campfire flames and chimney smoke animate', anim.hanging && anim.flames && anim.smoke, JSON.stringify(anim));

  // Shopkeeper turns to face you (stand off to his side, so "facing you" isn't straight ahead).
  await page.evaluate(() => {
    window.__game.day(0.1);
    const h = (window.__game.world as any).hub;
    window.__game.teleport(h.vendorSpot.x + Math.cos(h.npcYaw) * 2, h.vendorSpot.z - Math.sin(h.npcYaw) * 2);
  });
  await sleep(1200);
  const head = await page.evaluate(() => (window.__game.world as any).hub.head.rotation.y);
  check('pond: shopkeeper head turns toward the player', Math.abs(head) > 0.05, `head yaw ${head.toFixed(3)}`);
  // Talking to him opens the shop.
  await page.evaluate(() => { const v = (window.__game.world as any).hub.vendorSpot; window.__game.teleport(v.x, v.z); });
  await sleep(500);
  const label = await page.evaluate(() => window.__game.player().near);
  await page.evaluate(() => window.__game.interact());
  await sleep(300);
  const shop = await page.evaluate(() => !document.getElementById('menu')!.classList.contains('hidden') && document.body.classList.contains('shopping'));
  check('pond: talking to the vendor opens the shop', shop, `prompt "${label}"`);
  // Shop: picking a tile shows it in the details panel, and its Buy button buys it.
  await page.click('[data-shop="gear"]');
  await page.click('[data-pick="gear"][data-id="bait:worm"]');
  await sleep(100);
  const picked = await page.evaluate(() => document.querySelector('#tab .detail .hero b')?.textContent ?? '');
  const coins0 = await page.evaluate(() => (window.__game.s as any).coins as number);
  await page.click('#tab .detail [data-act="buybait"]');
  await sleep(150);
  const coins1 = await page.evaluate(() => (window.__game.s as any).coins as number);
  check('shop: picking an item shows it, and Buy buys it', picked === 'Worm' && coins1 < coins0, `${picked}, ${coins0} -> ${coins1} coins`);
  await page.click('#menu .close');
  await sleep(100);
  check('menus: the close button closes the window', await page.evaluate(() => document.getElementById('menu')!.classList.contains('hidden')));
  check('menus: the HUD comes back after leaving the shop', await page.evaluate(() => getComputedStyle(document.getElementById('hud-tl')!).display !== 'none'));
  await page.evaluate(() => { window.__game.closeMenu(); window.__game.activate(); });

  // Players tab lists levels, not coins.
  await page.evaluate(() => window.__game.openMenu('players'));
  await sleep(200);
  const me = await page.evaluate(() => ({ row: document.querySelector('#tab .angler.me')?.textContent ?? '', level: (window.__game.s as any).level as number }));
  await page.evaluate(() => { window.__game.closeMenu(); window.__game.activate(); });
  check('players tab: shows your level, not coins', me.row.includes(`Lv ${me.level}`) && !me.row.includes('🪙'), `"${me.row}"`);

  // Wardrobe preview: running while shown, stopped when the menu closes, running again on reopen.
  await page.evaluate(() => window.__game.openMenu('wardrobe'));
  await sleep(300);
  const open1 = { loops: await loops(page), inSlot: await previewInSlot(page) };
  await page.evaluate(() => { window.__game.closeMenu(); window.__game.activate(); });
  await sleep(300);
  const closed = await loops(page);
  await page.evaluate(() => window.__game.openMenu('wardrobe'));
  await sleep(300);
  const open2 = { loops: await loops(page), inSlot: await previewInSlot(page) };
  await page.evaluate(() => { window.__game.closeMenu(); window.__game.activate(); });
  check('wardrobe: preview runs while shown', open1.loops === 2 && open1.inSlot, JSON.stringify(open1));

  // Escape closes whichever menu tab is open.
  const escClosed: string[] = [];
  for (const tab of ['inventory', 'shop', 'players', 'dex']) {
    await page.evaluate((t) => window.__game.openMenu(t), tab);
    await sleep(100);
    await page.keyboard.press('Escape');
    await sleep(100);
    if (await page.evaluate(() => document.getElementById('menu')!.classList.contains('hidden'))) escClosed.push(tab);
  }
  await page.evaluate(() => window.__game.activate());
  check('menus: Escape closes every tab', escClosed.length === 4, escClosed.join(', '));

  // Faces: the wardrobe lists them, and clicking one wears it.
  await page.evaluate(() => window.__game.openMenu('wardrobe'));
  await sleep(200);
  const faceCount = await page.evaluate(() => document.querySelectorAll('#tab .face').length);
  const pick = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#tab .face')].find((b) => !b.classList.contains('on'))!.dataset.id!);
  await page.click(`#tab .face[data-id="${pick}"]`);
  await sleep(200);
  await page.screenshot({ path: `${SHOTS}/wardrobe-faces.png` });
  const worn = await page.evaluate(() => (window.__game.s as any).look.face as string);
  // Dragging the preview turns the character, and the auto-spin waits instead of fighting it.
  const spinNow = () => page.evaluate(() => (window.__game.preview() as any).spin as number);
  const box = (await (await page.$('#pv-slot canvas'))!.boundingBox())!;
  const s0 = await spinNow();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  const s1 = await spinNow();
  await sleep(500);
  const s2 = await spinNow();
  check('wardrobe: dragging the preview turns the character', s1 - s0 > 1 && Math.abs(s2 - s1) < 0.01, JSON.stringify({ s0, s1, s2 }));
  await page.evaluate(() => { window.__game.closeMenu(); window.__game.activate(); });
  check('wardrobe: faces listed and clicking one wears it', faceCount === 8 && worn === pick, `${faceCount} faces, picked ${pick}, wearing ${worn}`);
  check('wardrobe: preview stops when the menu closes', closed === 1, `${closed} render loops`);
  check('wardrobe: preview runs again when reopened', open2.loops === 2 && open2.inSlot, JSON.stringify(open2));

  // Switching slots while sprinting (Shift turns "2" into "@" in e.key).
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await sleep(200);
  // 'Digit2' (not '2') so puppeteer applies Shift, as a real keyboard does.
  await page.keyboard.press('Digit2');
  await sleep(100);
  const sprintSlot = await page.evaluate(() => (window.__game.s as any).held as number);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  check('hotbar: number keys switch slots while sprinting', sprintSlot === 1, `held slot ${sprintSlot + 1}`);

  // Lucky Wheel with a fish in hand (offline, rolled locally).
  await page.evaluate((f) => { (window.__game.s as any).slots[2] = f; }, fish(3));
  await page.keyboard.press('3');
  await page.evaluate(() => { const s = (window.__game.world as any).hub.wheelSpot; window.__game.teleport(s.x + 1.2, s.z + 1.2); });
  await sleep(500);
  const wheel = await page.evaluate(async () => {
    const hub = (window.__game.world as any).hub;
    const label = window.__game.player().near;
    const r0 = hub.disc.rotation.z;
    window.__game.interact();
    await new Promise((r) => setTimeout(r, 1200));
    return { label, spun: hub.disc.rotation.z !== r0 };
  });
  check('pond: Lucky Wheel spins with a fish in hand', wheel.spun, `prompt "${wheel.label}"`);
  await sleep(4000);

  // Scroll wheel: each notch moves exactly one slot, and the new slot pops.
  const heldNow = () => page.evaluate(() => (window.__game.s as any).held as number);
  await page.keyboard.press('1');
  const w0 = await heldNow();
  for (let k = 0; k < 3; k++) {
    await page.mouse.wheel({ deltaY: 100 });
    await sleep(60);
  }
  const w1 = await heldNow();
  const popped = await page.evaluate(() => !!document.querySelector('#hotbar .slot.held.pick'));
  const n = await page.evaluate(() => (window.__game.s as any).slots.length as number);
  check('hotbar: each scroll notch moves one slot', w1 === (w0 + 3) % n, `${w0 + 1} -> ${w1 + 1}`);
  check('hotbar: newly held slot animates', popped);

  // Drop a fish and pick it back up.
  await page.evaluate((f) => { (window.__game.s as any).slots[3] = f; }, fish(4));
  await page.evaluate(() => window.__game.teleport(0, 20));
  await sleep(300);
  await page.keyboard.press('4');
  const dropCount = () => page.evaluate(() => window.__smoke.dropsShown());
  const d0 = await dropCount();
  await page.keyboard.press('g');
  await sleep(400);
  const d1 = await dropCount();
  const pickLabel = await page.evaluate(() => window.__game.player().near);
  await page.evaluate(() => window.__game.interact());
  await sleep(400);
  const d2 = await dropCount();
  const back = await page.evaluate(() => (window.__game.s as any).slots.some((x: any) => x?.k === 'fish'));
  check('pond: dropping a fish shows it on the ground', d1 === d0 + 1, `${d0} -> ${d1}`);
  check('pond: picking it up removes it and returns the fish', d2 === d0 && back, `prompt "${pickLabel}", ${d1} -> ${d2}`);

  // Fishing: cast off the end of the pier and play the catch out.
  await page.keyboard.press('1');
  await page.evaluate(() => { window.__game.teleport(0, -5); window.__game.look(0, -0.1); });
  await sleep(500);
  const fishing = await page.evaluate(async () => {
    const g = window.__game;
    const seen = new Set<string>();
    g.press();
    await new Promise((r) => setTimeout(r, 400));
    g.release();
    const t0 = performance.now();
    while (performance.now() - t0 < 45000) {
      const st = g.state();
      seen.add(st.phase);
      if (st.phase === 'waiting') g.skipWait();
      else if (st.phase === 'bite') g.press();
      else if (st.phase === 'reeling') g.hold((st.tension ?? 0) < 0.6);
      else if (st.phase === 'result') break;
      else if (st.phase === 'idle' && seen.has('reeling')) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    g.hold(false);
    return [...seen];
  });
  check('pond: cast, bite, reel and land a fish', fishing.includes('reeling') && (fishing.includes('result') || fishing.includes('idle')), fishing.join(' > '));
  if (fishing.includes('result')) {
    // Let the landing animation finish, keep the catch card for visual review, then release it.
    await sleep(1500);
    await page.screenshot({ path: `${SHOTS}/pond-catch.png` });
    await page.evaluate(() => window.__game.press());
  }
  await page.close();
}

// ---------- casino (online, seeded account) ----------

async function casinoChecks(): Promise<void> {
  const ctx = await browser.createBrowserContext();
  const page = await openPage(`http://localhost:${VITE_PORT}/?name=Smoke&room=smoke`, ctx, TOKEN);
  await page.waitForFunction(() => (window.__game.world as any).hall, { timeout: 15000 });
  const back = await page.evaluate(() => ({
    menu: !document.getElementById('menu')!.classList.contains('hidden'),
    banner: document.getElementById('banner')!.textContent ?? '',
  }));
  check('join: a returning player is welcomed back without the inventory', !back.menu && back.banner.includes('Welcome back, Smoke'), back.banner);
  await page.evaluate(() => { window.__game.activate(); window.__game.day(0.1); });
  await sleep(1000);

  const r = await page.evaluate(() => window.__smoke.attachedReport('hall'));
  check('casino: tables, wheel, cards and clickable pieces still in the scene', r.missing.length === 0, r.missing.join(', ') || `${r.checked} checked`);
  const glow = await page.evaluate(() => {
    const used = window.__smoke.materialsInScene();
    return (window.__game.world as any).hall.glow.every((g: any) => used.has(g.m));
  });
  check('casino: neon and bulb materials still drawn (pulse works)', glow);
  const wheel = await page.evaluate(async () => {
    const h = (window.__game.world as any).hall;
    const r0 = h.wheel.rotation.y;
    await new Promise((r) => setTimeout(r, 300));
    return h.wheel.rotation.y !== r0;
  });
  check('casino: roulette wheel idles (rotates)', wheel);
  await page.screenshot({ path: `${SHOTS}/casino.png` });

  // Roulette: hold a fish, aim at RED, click.
  await page.keyboard.press('3');
  await aimAt(page, 'rbet', 'red');
  const roul = await page.evaluate(async () => {
    const g = window.__game;
    const h = (g.world as any).hall;
    g.press();
    g.release();
    const t0 = performance.now();
    let spun = false;
    while (performance.now() - t0 < 3000 && !spun) { spun = !!h.anim; await new Promise((r) => setTimeout(r, 50)); }
    await new Promise((r) => setTimeout(r, 5500));
    return { spun, slot: JSON.stringify((g.s as any).slots[2]) };
  });
  check('casino: roulette bet spins the wheel', roul.spun, `slot after: ${roul.slot}`);

  // Blackjack: deal, see cards and buttons, stand.
  await page.keyboard.press('4');
  await aimAt(page, 'bj', 'deal');
  const bj = await page.evaluate(async () => {
    const g = window.__game;
    const h = (g.world as any).hall;
    g.press();
    g.release();
    const t0 = performance.now();
    while (performance.now() - t0 < 4000 && h.cards.children.length === 0) await new Promise((r) => setTimeout(r, 50));
    const vis = Object.fromEntries(Object.entries(h.bjButtons).map(([k, b]: [string, any]) => [k, b.visible]));
    return { cards: h.cards.children.length, cardsAttached: window.__smoke.attached(h.cards), vis };
  });
  await page.screenshot({ path: `${SHOTS}/casino-blackjack.png` });
  const live = bj.vis.hit && bj.vis.stand;
  check('casino: blackjack deal shows cards on the felt', bj.cards >= 3 && bj.cardsAttached, `${bj.cards} cards`);
  check('casino: blackjack shows hit/stand (or the hand ended at once)', live || bj.vis.deal, JSON.stringify(bj.vis));
  if (live) {
    await aimAt(page, 'bj', 'stand');
    const done = await page.evaluate(async () => {
      const g = window.__game;
      const h = (g.world as any).hall;
      g.press();
      g.release();
      const t0 = performance.now();
      while (performance.now() - t0 < 4000 && !h.bjButtons.deal.visible) await new Promise((r) => setTimeout(r, 50));
      return h.bjButtons.deal.visible;
    });
    check('casino: standing ends the hand (DEAL comes back)', done);
  }

  // Cash a fish in at the chip tray.
  await page.keyboard.press('5');
  await aimAt(page, 'cash', 'cash');
  const chips = await page.evaluate(async () => {
    const g = window.__game;
    const read = () => Number(document.getElementById('chips')?.textContent?.replace(/[^\d.]/g, '') || 0);
    const c0 = read();
    g.press();
    g.release();
    const t0 = performance.now();
    while (performance.now() - t0 < 3000 && read() === c0) await new Promise((r) => setTimeout(r, 50));
    return { before: c0, after: read() };
  });
  check('casino: turning a fish in at the tray gives chips', chips.after > chips.before, `${chips.before} -> ${chips.after}`);

  // Casino-only cosmetics: bought with chips at the prize counter, then worn.
  const casinoMap = MAPS.find((x) => x.id === 'casino')!;
  const prizes = casinoMap.casino!.prizes;
  await page.evaluate((p) => window.__game.teleport(p.x, p.z - 2), { x: prizes.x, z: prizes.z });
  await sleep(700);
  await page.evaluate(() => window.__game.openMenu('casino'));
  await page.click('[data-prize="cosmetics"]');
  await page.click('[data-pick="ccos"][data-id="visor"]');
  await sleep(150);
  const chips0 = await page.evaluate(() => window.__game.s.chips);
  await page.click('#tab .detail [data-act="buycos"]');
  const bought = await page.evaluate(async () => {
    const s = window.__game.s;
    const t0 = performance.now();
    while (performance.now() - t0 < 3000 && !s.owned.includes('visor')) await new Promise((r) => setTimeout(r, 50));
    return { owned: s.owned.includes('visor'), chips: s.chips, coins: s.coins };
  });
  check('casino: High Roller tab sells cosmetics for chips', bought.owned && bought.chips === chips0 - 30 && bought.coins === 5000, JSON.stringify({ chips0, ...bought }));
  await page.click('[data-act="equip"][data-id="visor"]');
  await sleep(800);
  const worn = await page.evaluate(() => window.__game.s.look.hat);
  check('casino: a casino cosmetic can be worn right away', worn === 'visor', `hat ${worn}`);
  await page.screenshot({ path: `${SHOTS}/casino-cosmetics.png` });
  await page.evaluate(() => window.__game.closeMenu());

  // Leave through the front door: real server travel back to the pond.
  const exit = await page.evaluate(async (gate) => {
    window.__game.teleport(gate.x, gate.z + 1.2);
    await new Promise((r) => setTimeout(r, 600));
    const label = window.__game.player().near;
    window.__game.interact();
    const t0 = performance.now();
    while (performance.now() - t0 < 6000 && !(window.__game.world as any).hub) await new Promise((r) => setTimeout(r, 50));
    return { label, atPond: !!(window.__game.world as any).hub };
  }, { x: casinoMap.gate.x, z: casinoMap.gate.z });
  check('travel: casino exit takes you to the pond', exit.atPond, `prompt "${exit.label}"`);
  if (exit.atPond) {
    await sleep(800);
    const hub = await page.evaluate(() => window.__smoke.attachedReport('hub'));
    check('travel: hub intact after arriving', hub.missing.length === 0, hub.missing.join(', '));
    await page.screenshot({ path: `${SHOTS}/pond-after-travel.png` });
  }
  await ctx.close();
}

// Global chat: a line reaches a player in the same room (log + bubble) and one in another room (log only).
async function chatChecks(): Promise<void> {
  const join = async (name: string, room: string) => {
    const ctx = await browser.createBrowserContext();
    const page = await openPage(`http://localhost:${VITE_PORT}/?name=${name}&room=${room}`, ctx, `${name}-token-0123456789abcdef`);
    await page.waitForFunction(() => window.__game.online(), { timeout: 15000 });
    await page.evaluate(() => window.__game.activate());
    return { ctx, page };
  };
  const a = await join('Ann', 'chat');
  const b = await join('Bob', 'chat');
  const c = await join('Cat', 'elsewhere');
  // Stand Ann a few metres in front of Bob so the screenshot shows her bubble.
  await a.page.evaluate(() => window.__game.teleport(0, -2.5));
  await b.page.evaluate(() => { window.__game.teleport(0, 2); window.__game.look(0, -0.05); });
  await sleep(800);
  const chatOpacity = () => a.page.evaluate(() => Number(getComputedStyle(document.getElementById('chat')!).opacity));
  const faded = await chatOpacity();
  await a.page.keyboard.press('Enter');
  const typing = await a.page.evaluate(() => document.activeElement?.classList.contains('chat-input') ?? false);
  await sleep(300);
  const full = await chatOpacity();
  await a.page.keyboard.type('hello from the pier');
  await a.page.keyboard.press('Enter');
  await sleep(600);
  const logOf = (p: Page) => p.evaluate(() => document.querySelector('#chat .chat-log')?.textContent ?? '');
  const [la, lb, lc] = [await logOf(a.page), await logOf(b.page), await logOf(c.page)];
  // Bubbles are the only sprites drawn at renderOrder 11.
  const bubble = await b.page.evaluate(() => {
    let found = false;
    (window.__game.world as any).scene.traverseVisible((o: any) => { if (o.isSprite && o.renderOrder === 11) found = true; });
    return found;
  });
  await b.page.screenshot({ path: `${SHOTS}/chat.png` });
  check('chat: Enter opens the chat input', typing);
  check('chat: window is faded while playing and full while typing', faded < 0.7 && full === 1, JSON.stringify({ faded, full }));
  check('chat: line shows for the sender and others in the room', la.includes('hello from the pier') && lb.includes('Ann: hello from the pier'), `"${lb}"`);
  check('chat: line reaches players in other rooms', lc.includes('hello from the pier'), `"${lc}"`);
  check('chat: speaker gets a bubble for players nearby', bubble);
  check('chat: players already online see who joined', la.includes('Bob has joined') && la.includes('Cat has joined') && lb.includes('Cat has joined') && !lc.includes('Cat has joined'), `"${la}"`);

  // Bubbles fade out far away and when standing right on the speaker; they're clear in between.
  const bubbleShown = async (x: number, z: number) => {
    await b.page.evaluate((x, z) => window.__game.teleport(x, z), x, z);
    await sleep(150);
    return b.page.evaluate(() => {
      let o = -1;
      (window.__game.world as any).scene.traverse((s: any) => { if (s.isSprite && s.renderOrder === 11) o = s.visible ? s.material.opacity : 0; });
      return o;
    });
  };
  const mid = await bubbleShown(0, 2);
  const far = await bubbleShown(0, 25);
  const onTop = await bubbleShown(0.3, -2.5);
  check('chat: bubble hidden when far away or standing on the speaker', mid > 0.9 && far === 0 && onTop === 0, JSON.stringify({ mid, far, onTop }));

  // Jumps are sent to the others on the map: Bob sees Ann's avatar leave the ground and land.
  await b.page.evaluate(() => window.__game.teleport(0, 2));
  await sleep(300);
  const annY = () => b.page.evaluate(() => {
    let y = NaN;
    // Nameplates are the only sprites at renderOrder 10; the avatar is the plate's parent.
    (window.__game.world as any).scene.traverse((s: any) => { if (s.isSprite && s.renderOrder === 10) y = s.parent.position.y; });
    return y;
  });
  const ground = await annY();
  await a.page.keyboard.press('Space');
  const arc = await b.page.evaluate(async () => {
    const ys: number[] = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 1200) {
      (window.__game.world as any).scene.traverse((s: any) => { if (s.isSprite && s.renderOrder === 10) ys.push(s.parent.position.y); });
      await new Promise((r) => requestAnimationFrame(r));
    }
    return { peak: Math.max(...ys), end: ys[ys.length - 1] };
  });
  check('jump: other players see the jump and the landing', arc.peak - ground > 0.6 && Math.abs(arc.end - ground) < 0.05, JSON.stringify({ ground, ...arc }));

  // Esc while typing releases the mouse in a real browser: that cancels the chat without pausing.
  await a.page.evaluate(() => { (window.__game as any).activate(); });
  await a.page.keyboard.press('Enter');
  await a.page.keyboard.type('never sent');
  await a.page.evaluate(() => document.dispatchEvent(new Event('pointerlockchange')));
  await sleep(200);
  const esc = await a.page.evaluate(() => ({
    chat: !document.querySelector('.chat-input')!.classList.contains('hidden'),
    menu: !document.getElementById('menu')!.classList.contains('hidden'),
    resume: !document.getElementById('resume')!.classList.contains('hidden'),
  }));
  check('chat: losing the mouse while typing cancels chat without the pause menu', !esc.chat && !esc.menu && esc.resume, JSON.stringify(esc));
  for (const p of [a, b, c]) await p.ctx.close();
}

// ---------- helpers ----------

async function openPage(url: string, ctx = browser.defaultBrowserContext(), token?: string): Promise<Page> {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    // The offline page can't reach a server on purpose; anything else is a real error.
    if (m.type() === 'error' && !/WebSocket|ERR_CONNECTION_REFUSED|404/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  // tsx keeps function names by wrapping them in __name(); functions sent to the page need it too.
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await page.evaluateOnNewDocument((token) => {
    if (token) localStorage.setItem('fishing-token', token);
    const raf = window.requestAnimationFrame.bind(window);
    (window as any).__rafSeen = new Set();
    window.requestAnimationFrame = (cb) => raf((t) => { (window as any).__rafSeen.add(cb); cb(t); });
  }, token ?? '');
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game);
  await page.evaluate(() => {
    const w = window.__game.world as any;
    const inScene = (o: any) => { for (let p = o; p; p = p.parent) if (p === w.scene) return true; return false; };
    // Every object the game animates or toggles after the scene is built, per owner.
    const parts: Record<string, () => [string, any][]> = {
      hub: () => {
        const h = w.hub;
        return [['npc', h.npc], ['npc head', h.head], ['wheel disc', h.disc], ['gate barrier', h.barrier], ['campfire light', h.fireLight],
          ...h.hanging.map((o: any, i: number) => [`hanging fish ${i}`, o]), ...h.flames.map((o: any, i: number) => [`flame ${i}`, o]),
          ...h.torches.map((o: any, i: number) => [`torch ${i}`, o]), ...h.lampLights.map((o: any, i: number) => [`lamp light ${i}`, o])];
      },
      town: () => {
        const t = w.town;
        return [...t.heads.flatMap((h: any, i: number) => [[`npc ${i} head`, h.head], [`npc ${i} body`, h.body]]),
          ...[...t.bottleMeshes.entries()].map(([id, o]: [string, any]) => [`bottle ${id}`, o]),
          ...t.smoke.map((s: any, i: number) => [`smoke ${i}`, s.m]),
          ...t.fires.flatMap((f: any, i: number) => [[`fire ${i} light`, f.light], ...f.flames.map((o: any, k: number) => [`fire ${i} flame ${k}`, o])]),
          ...t.lights.map((o: any, i: number) => [`lamp light ${i}`, o])];
      },
      hall: () => {
        const h = w.hall;
        return [['roulette wheel', h.wheel], ['cards', h.cards], ['chip board', h.chipBoard?.mesh],
          ...h.picks.map((o: any) => [`clickable ${o.userData.tag.k}:${o.userData.tag.id}`, o])];
      },
    };
    (window as any).__smoke = {
      attached: inScene,
      // Each part must be in the scene and still draw something itself: merging can strip the
      // meshes out of an animated group and leave it empty, which then animates nothing.
      attachedReport: (owner: string) => {
        const list = parts[owner]();
        const draws = (o: any) => { let n = 0; o.traverse((c: any) => { if (c.isMesh || c.isSprite) n++; }); return n > 0; };
        return { checked: list.length, missing: list.filter(([, o]) => !o || !inScene(o) || (!o.isLight && o !== w.hall?.cards && !draws(o))).map(([n]) => n) };
      },
      materialsInScene: () => {
        const s = new Set();
        w.scene.traverse((o: any) => { if (o.material) [].concat(o.material).forEach((m) => s.add(m)); });
        return s;
      },
      // Each item on the ground has a 6 m open light beam (see DropsView); count those.
      dropsShown: () => {
        let n = 0;
        w.scene.traverse((o: any) => { const p = o.geometry?.parameters; if (o.isMesh && o.geometry.type === 'CylinderGeometry' && p.height === 6 && p.openEnded) n++; });
        return n;
      },
    };
  });
  return page;
}

async function loops(page: Page): Promise<number> {
  return page.evaluate(() => new Promise<number>((res) => { (window as any).__rafSeen.clear(); setTimeout(() => res((window as any).__rafSeen.size), 1000); }));
}

async function previewInSlot(page: Page): Promise<boolean> {
  return page.evaluate(() => document.querySelector('canvas.preview')?.parentElement?.id === 'pv-slot');
}

/** Stand in front of a casino table piece and look straight at it, so the game's own aiming picks it. */
async function aimAt(page: Page, k: string, id: string): Promise<void> {
  await page.evaluate(({ k, id }) => {
    const g = window.__game;
    const h = (g.world as any).hall;
    const p = h.picks.find((o: any) => o.userData.tag.k === k && o.userData.tag.id === id);
    h.group.updateMatrixWorld(true);
    const t = p.getWorldPosition(p.position.clone());
    // The piece's table faces along its local +z.
    let table = p.parent;
    while (table.parent !== h.group) table = table.parent;
    const f = table.rotation.y;
    g.teleport(t.x + Math.sin(f) * 2.0, t.z + Math.cos(f) * 2.0);
  }, { k, id });
  await sleep(700); // let the server see the new position
  await page.evaluate(({ k, id }) => {
    const g = window.__game;
    const h = (g.world as any).hall;
    const p = h.picks.find((o: any) => o.userData.tag.k === k && o.userData.tag.id === id);
    const t = p.getWorldPosition(p.position.clone());
    const me = g.player();
    g.look(Math.atan2(me.x - t.x, me.z - t.z), Math.atan2(t.y - me.y, Math.hypot(t.x - me.x, t.z - me.z)));
  }, { k, id });
  await sleep(300);
}

function waitForLine(proc: ChildProcess, re: RegExp): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('game server did not start')), 20000);
    const on = (b: Buffer) => { if (re.test(b.toString())) { clearTimeout(timer); resolve(); } };
    proc.stdout!.on('data', on);
    proc.stderr!.on('data', (b) => process.stderr.write(b));
    proc.on('exit', (c) => reject(new Error(`game server exited (${c})`)));
  });
}

function portInUse(port: number): Promise<boolean> {
  return new Promise((res) => {
    const s = net.createServer().once('error', () => res(true)).once('listening', () => s.close(() => res(false)));
    s.listen(port);
  });
}

declare global {
  interface Window {
    __game: any;
    __smoke: any;
  }
}

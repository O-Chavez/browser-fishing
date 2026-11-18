// Stages the Anglers' Rest props (src/game/camp.ts) headlessly: each prop is stood on flat ground in the real game and
// photographed from eye level (1.7 m), an overview and a close view, by day and at night.
//
//   npx tsx scripts/camp-props.ts <out dir> [prop ...]
//
// Runs the game offline on its own Vite server (port 5293; CAMP_PORT picks another). The props are the keys of PROPS.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';
import { createServer } from 'vite';
import { TIP_IDS } from '../src/game/tips';
import { newSave } from '../src/game/state';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = Number(process.env.CAMP_PORT ?? 5293);
const [outArg, ...only] = process.argv.slice(2);
if (!outArg) {
  console.error('usage: npx tsx scripts/camp-props.ts <out dir> [prop ...]');
  process.exit(2);
}
const OUT = path.resolve(outArg);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Where the props stand: the upper main street, flat cobbles with the village and the lake behind. */
const [SX, SZ] = (process.env.CAMP_STAGE ?? '0,40').split(',').map(Number);
const STAGE = { x: SX, z: SZ };

/**
 * One prop (`lift` stands it that much above the ground, for steps that cut down into it): `make` is code run in the page (`C` is camp.ts, `ga` a ground function for the builders that take one,
 * `fish` the fish builder), returning the builder's result; `ty` the height looked at; `over` and `close` where the
 * camera stands in the prop's own frame ([x, z], looking at `at`, default the prop's middle).
 */
/** `fov` narrows the lens for the far shot: a 36 degree view from 17 m is about what 30 m looks like at the game's 70. */
interface Spec { lift?: number; fov?: number; stage?: [number, number]; make: string; ty: number; over: [number, number]; close: [number, number]; at?: [number, number] }
const PROPS: Record<string, Spec> = {
  hearth: { make: 'C.buildHearth()', ty: 1.0, over: [0, 8], close: [0, 3.8] },
  crownpost: { make: 'C.buildCrownPost()', ty: 1.8, over: [0, 6], close: [0, 2] },
  kettlestall: { make: 'C.buildKettleStall()', ty: 1.3, over: [1, 8], close: [0.6, 3.9], at: [0, 0.4] },
  totem: { make: 'C.buildTotem()', ty: 1.6, over: [0, 9], close: [0, 3.6] },
  totemfar: { make: 'C.buildTotem()', ty: 2.0, stage: [15.5, -2.5], fov: 36, over: [-15.5, -5], close: [-15.5, -5] },
  hedgearc: { make: 'C.buildHedgeArc(3.5, -70, 70, 1.4, 0.7, ga)', ty: 0.7, over: [0, -3.5], close: [0, 0.4], at: [0, 3.5] },
  hedgerun: { make: 'C.buildHedgeRun([[-4, 0], [0, 0], [3, 2], [5, 5]], 1.2, 0.7, ga)', ty: 0.6, over: [-2, 7], close: [-0.5, 3], at: [0, 0.5] },
  picketrun: { make: 'C.buildPicketRun([[-4, 0], [0, 0], [2, 1.5], [2.6, 3.5], [2.5, 5.5]], ga)', ty: 0.5, over: [-1, 7], close: [0, 2.8], at: [0, 0.3] },
  stonearc: { make: 'C.buildStoneArc(4, -60, 60, 1.1, 0.6, ga)', ty: 0.6, over: [0, 11], close: [0, 7.4], at: [0, 4] },
  steps: { lift: 1, make: 'C.buildSteps(2, 0.18, 5)', ty: 0.1, over: [0, 7], close: [0, 3.6], at: [0, 1] },
  stonepile: { make: 'C.buildStonePile()', ty: 0.1, over: [0, 4.5], close: [0, 1.7] },
  skipsign: { make: 'C.buildSkipSign()', ty: 1.2, over: [0, 5], close: [0, 2] },
  rocketrack: { make: 'C.buildRocketRack()', ty: 0.7, over: [0, 5.5], close: [0.3, 2.2], at: [0.3, 0] },
  signpost: { make: "C.buildSignpost(['FIRE', 'STONES', 'ROCKETS'])", ty: 1.8, over: [0, 5.5], close: [0, 2.2] },
  plaque: { lift: 0.9, make: "C.buildPlaque(1.2)", ty: 1.0, over: [0, 3], close: [0, 1.2] },
  fishmount: { make: 'C.buildFishMount()', ty: 0.5, over: [0, 5], close: [0, 2.2] },
  lanternpier: { make: 'C.buildLanternPier()', ty: 0.6, over: [0, 4.5], close: [0, 1.8] },
};
const names = Object.keys(PROPS);
const unknown = only.filter((v) => !PROPS[v]);
if (unknown.length) {
  console.error(`Unknown prop(s): ${unknown.join(', ')}. Choose from: ${names.join(', ')}`);
  process.exit(2);
}
const chosen = names.filter((n) => !only.length || only.includes(n));

const vite = await createServer({ server: { port: VITE_PORT, strictPort: true }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});

/** Opens the game offline at the README's desktop size with the HUD hidden. */
async function open(): Promise<Page> {
  const page = await (await browser.createBrowserContext()).newPage();
  page.on('pageerror', (e) => console.error(`page error: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && console.error(`console: ${m.text()}`));
  await page.setViewport({ width: 1280, height: 720 });
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await page.evaluateOnNewDocument(() => localStorage.setItem('fishing-news', String(Number.MAX_SAFE_INTEGER)));
  await page.evaluateOnNewDocument((save) => localStorage.setItem('fishing-game-save', save), JSON.stringify({ ...newSave(), tips: [...TIP_IDS], held: 4 }));
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game);
  await page.click('#join-offline');
  await page.waitForFunction(() => document.getElementById('join')?.classList.contains('hidden'), { timeout: 20000 });
  await page.evaluate(() => window.__game.activate());
  await page.addStyleTag({ content: '#hud, #crosshair, #toast, #banner, #tip, #guide, #touch, #chat, #fps { display: none !important; }' });
  return page;
}

let failed = false;
try {
  const page = await open();
  await sleep(1500);
  // The camp module, the terrain and the fish builder, loaded into the running game.
  await page.evaluate(`(async () => {
    window.C = await import('/src/game/camp.ts');
    window.ENV = await import('/src/game/env.ts');
    window.FM = await import('/src/game/fishmodel.ts');
    window.CT = await import('/src/data/content.ts');
  })()`);
  let current: { name: string; spec: Spec } | null = null;
  const stage = async (name: string, spec: Spec) => {
    current = { name, spec };
    await page.evaluate(`(() => {
      const G = window.__game, C = window.C, S = { x: ${(spec.stage ?? [STAGE.x, STAGE.z])[0]}, z: ${(spec.stage ?? [STAGE.x, STAGE.z])[1]} };
      const scene = G.world.scene;
      if (window.__prop) { scene.remove(window.__prop); window.__prop = null; }
      const y0 = window.ENV.groundHeight(S.x, S.z);
      const ga = (x, z) => window.ENV.groundHeight(S.x + x, S.z + z) - y0;
      const r = ${spec.make};
      window.__lamps = r.lamps ?? [];
      if (r.ctx && ${JSON.stringify(name)} === 'plaque') {
        C.writePlaque(r.ctx, r.tex, 'Ruby Arowana\\n14.2 kg');
      }
      if (${JSON.stringify(name)} === 'fishmount') {
        const f = window.FM.buildFish(0xd8e0ee, false, false, 5, 'ghostcarp');
        f.group.scale.setScalar(1.1);
        f.group.rotation.y = -Math.PI / 2;
        r.anchor.add(f.group);
      }
      r.group.position.set(S.x, y0 + ${spec.lift ?? 0}, S.z);
      scene.add(r.group);
      window.__prop = r.group;
      // A warm light by the lamps and the fire at night, as the real ones cast.
      if (window.__plight) scene.remove(window.__plight);
      const src = scene.children.find((o) => o.isPointLight) || scene.getObjectByProperty('isPointLight', true);
      if (src) {
        const l = src.clone();
        l.intensity = 0;
        l.position.set(S.x + 0.6, y0 + 2.2, S.z + 1.8);
        window.__plight = l;
        scene.add(l);
      }
    })()`);
  };
  const shoot = async (view: 'over' | 'close', time: 'day' | 'night') => {
    const { name, spec } = current!;
    const [cx, cz] = spec[view];
    const [tx, tz] = spec.at ?? [0, 0];
    const [sx, sz] = spec.stage ?? [STAGE.x, STAGE.z];
    const px = sx + cx;
    const pz = sz + cz;
    const dx = sx + tx - px;
    const dz = sz + tz - pz;
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(spec.ty - 1.7, Math.hypot(dx, dz));
    const f = time === 'day' ? 0.3 : 0.72;
    const n = time === 'day' ? 0 : 1;
    await page.evaluate(`(() => {
      const G = window.__game;
      clearInterval(window.__fovTimer); window.__fovTimer = setInterval(() => { G.world.fovKick = ${(spec.fov ?? 70) - 70}; }, 4);
      G.teleport(${px}, ${pz}); G.look(${yaw}, ${pitch}); G.day(${f});
      for (const m of window.__lamps) m.emissiveIntensity = ${0.25 + 1.6 * n};
      if (window.__plight) window.__plight.intensity = ${n ? 9 : 0};
    })()`);
    await sleep(1100);
    const file = `${name}-${view}-${time}.jpg`;
    await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 84 });
    console.log(`wrote ${path.relative(process.cwd(), path.join(OUT, file))}`);
  };
  for (const name of chosen) {
    await stage(name, PROPS[name]);
    for (const time of ['day', 'night'] as const) for (const view of name.startsWith('totemfar') ? (['over'] as const) : (['over', 'close'] as const)) await shoot(view, time);
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

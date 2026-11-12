// Scratch: stages palette options for Kelp Deep, the Twilight and the Abyss by overriding the sea's colours just before each render.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { TIP_IDS } from '../src/game/tips';
import { newSave } from '../src/game/state';
import { nightDarkAt, nightSkyKeep, seaMood } from '../src/data/sea';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = 5313, SERVER_PORT = 8813;
const OUT = process.argv[2];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fishing-zonepal-'));
const TOKEN = 'shots-token-0123456789abcdef';
fs.writeFileSync(path.join(dataDir, 'accounts.json'), JSON.stringify({ shots: { name: 'Shots', hash: createHash('sha256').update(TOKEN).digest('hex'), save: { ...newSave(), level: 60, coins: 50000, tips: [...TIP_IDS], held: 4 } } }));
const server = spawn('npx', ['tsx', 'server/index.ts'], { env: { ...process.env, DATA_DIR: dataDir, PORT: String(SERVER_PORT), DATABASE_URL: '', DISCORD_FEEDBACK_WEBHOOK: '', DISCORD_JOINS_WEBHOOK: '', DISCORD_TIPS_WEBHOOK: '', DEV_USER: 'shots', DEV_PASS: 'shots-dev-pass', TEST_HOOKS: '1' }, stdio: ['ignore', 'pipe', 'inherit'], detached: true });
process.on('exit', () => { try { process.kill(-server.pid!, 'SIGKILL'); } catch {} });
await new Promise<void>((res) => server.stdout!.on('data', (d) => /fishing server on port/.test(String(d)) && res()));
process.env.VITE_SERVER_URL = `ws://localhost:${SERVER_PORT}`;
const vite = await createServer({ server: { port: VITE_PORT, strictPort: true }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 1120, height: 630 } });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(e.message));
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await page.evaluateOnNewDocument((t) => { localStorage.setItem('fishing-token', t); localStorage.setItem('fishing-news', String(Number.MAX_SAFE_INTEGER)); }, TOKEN);
  await page.goto(`http://localhost:${VITE_PORT}/?name=Shots&room=shots`, { waitUntil: 'load' });
  await page.waitForFunction(() => (window as any).__game?.online() && (window as any).__game.world.hub, { timeout: 20000 });
  await page.evaluate(() => (window as any).__game.activate());
  await sleep(600);
  const say = async (text: string) => { await page.keyboard.press('Enter'); await page.keyboard.type(text); await page.keyboard.press('Enter'); await sleep(300); };
  await say('/login shots shots-dev-pass');
  await say('/sea 1');
  await page.waitForFunction(() => (window as any).__game.world.sea && document.getElementById('castoff')!.classList.contains('hidden'), { timeout: 20000 });
  await page.addStyleTag({ content: '#hud, #crosshair, #toast, #banner, #tip, #guide, #divehud, #chat, #chatbox, #hotbar { display: none !important; }' });
  // Per render: an optional outside camera and an optional palette laid over what the game just set.
  await page.evaluate(() => {
    const w = (window as any).__game.world;
    const orig = w.renderer.render.bind(w.renderer);
    (window as any).__cam = null;
    (window as any).__pal = null;
    (window as any).__flash = false;
    const set = (c: any, hex: number, k = 1) => c.setHex(hex).multiplyScalar(k);
    w.renderer.render = (scene: any, cam: any) => {
      const c = (window as any).__cam;
      if (c && cam === w.camera) { cam.position.set(c[0], c[1], c[2]); cam.lookAt(c[3], c[4], c[5]); cam.updateMatrixWorld(true); }
      const P = (window as any).__pal;
      const flash = (window as any).__flash;
      const L = w.sea.lightning;
      if (flash) L.age = 0.01; else { L.timer = 1e9; L.age = 9; L.flash = 0; if (L.bolt) L.bolt.visible = false; }
      if (P) {
        const k = P.k ?? 1;
        const u = w.waterU, s = w.sea.u, cu = w.sea.cloudU;
        set(u.uSkyH.value, P.skyH, k); set(u.uSkyT.value, P.skyT, k);
        if (flash) { const g = u.uSkyH.value.clone().setHex(0xd9d2f2); u.uSkyH.value.lerp(g, 0.7); u.uSkyT.value.lerp(g, 0.5); }
        u.uFogColor.value.copy(u.uSkyH.value);
        if (scene.fog) scene.fog.color.copy(u.uSkyH.value);
        set(s.uShallow.value, P.shallow, Math.max(k, 0.12)); set(s.uDeep.value, P.deep, Math.max(k, 0.12));
        set(cu.uTop.value, P.cloudTop, k); set(cu.uBot.value, P.cloudBot, k);
        if (k === 1) {
          w.hemi.intensity = P.hemi + (flash ? 2.5 : 0); w.sun.intensity = P.sun;
          w.hemi.color.setHex(P.hemiCol ?? 0xc6c3d0);
          u.uSunCol.value.setScalar(0);
          if (P.foam != null) s.uFoamCol.value.setHex(P.foam);
          if (P.lamps) { w.boat.setNight(P.lamps); s.uBoatGlow.value = P.lamps; }
          if (P.fog) { u.uFogNear.value = P.fog[0]; u.uFogFar.value = P.fog[1]; if (scene.fog) { scene.fog.near = P.fog[0]; scene.fog.far = P.fog[1]; } }
        }
      }
      orig(scene, cam);
    };
  });
  type Pal = { skyH: number; skyT: number; shallow: number; deep: number; cloudTop: number; cloudBot: number; hemi: number; sun: number; hemiCol?: number; foam?: number; lamps?: number; fog?: [number, number] };
  const ZONES: [string, number][] = [['dropoff', 30], ['kelp', 60], ['twilight', 110], ['abyss', 200], ['line41', 46], ['line81', 83], ['line151', 151]];
  const PALS: Record<string, Record<string, Pal> | null> = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const only = process.argv[4]?.split(',');
  const views: { v: string; day: number; tp?: [number, number]; look: [number, number]; flash?: boolean; zones?: string[] }[] = [
    { v: 'day-sea', day: 0.45, look: [0, -0.02] },
    { v: 'dusk-sea', day: 0.62, look: [0, -0.02] },
    { v: 'day-deck', day: 0.45, tp: [-3.5, 0], look: [-Math.PI / 2, 0.05] },
    { v: 'night-sea', day: 0.75, look: [0, -0.02] },
    { v: 'night-deck', day: 0.75, tp: [-3.5, 0], look: [-Math.PI / 2, 0.05] },
    { v: 'night-sea2', day: 0.75, look: [0.5, 0.05] },
    { v: 'flash-sea', day: 0.45, look: [0, -0.02], flash: true, zones: ['abyss'] },
  ];
  for (const [opt, pals] of Object.entries(PALS)) {
    if (only && !only.includes(opt)) continue;
    for (const [zone, depth] of ZONES) for (const view of views) {
      if (process.argv[5] && !process.argv[5].split(',').includes(zone)) continue;
      if (view.zones && !view.zones.includes(zone)) continue;
      const night = view.day > 0.7;
      const k = night ? nightSkyKeep(1, nightDarkAt(seaMood(depth))) : 1;
      await page.evaluate((depth, view, pal, k) => {
        const G = (window as any).__game;
        G.world.setDepth(depth, true);
        G.day(view.day);
        const tp = view.tp ?? [-1.6, 0.3];
        G.teleport(tp[0], tp[1]);
        G.look(view.look[0], view.look[1]);
        (window as any).__pal = pal ? { ...pal, k } : null;
        (window as any).__flash = false;
      }, depth, view, pals?.[zone] ?? null, k);
      await sleep(1300);
      if (view.flash) { await page.evaluate(() => { (window as any).__game.world.sea.lightning.strike(-Math.PI / 2 + 0.25); (window as any).__flash = true; }); await sleep(250); }
      await page.screenshot({ path: `${OUT}/${opt}-${zone}-${view.v}.jpg`, type: 'jpeg', quality: 82 });
      console.log(opt, zone, view.v);
    }
  }
} finally {
  await browser.close();
  await vite.close();
  try { process.kill(-server.pid!, 'SIGTERM'); } catch {}
}
process.exit(0);

// A top-down plan of the lakeside map with every collider drawn on it, staged headlessly: for checking that props
// don't stand in the way where players walk. Red rings are the props' colliders, the faint ring round each is where
// the player's body (0.35 m) stops, and the grid is 2 m with labels every 4 m (lake at the top, +x to the right).
//
//   npx tsx scripts/map-plan.ts <out.jpg> [centre x] [centre z] [metres top to bottom]   default: the quay (0, 10, 26)
//
// Runs the game offline (no server), so nothing is saved. Prints the colliders in view as [x, z, r].
// MAP_PORT picks another port, so two checkouts can stage plans at once.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { TIP_IDS } from '../src/game/tips';
import { newSave } from '../src/game/state';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [out, cxArg, czArg, spanArg] = process.argv.slice(2);
const cx = Number(cxArg ?? 0);
const cz = Number(czArg ?? 10);
const span = Number(spanArg ?? 26);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PORT = Number(process.env.MAP_PORT ?? 5297);
const vite = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(`page error: ${e.message}`));
  await page.setViewport({ width: 1600, height: 900 });
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await page.evaluateOnNewDocument(() => localStorage.setItem('fishing-news', String(Number.MAX_SAFE_INTEGER)));
  await page.evaluateOnNewDocument((save) => localStorage.setItem('fishing-game-save', save), JSON.stringify({ ...newSave(), tips: [...TIP_IDS], held: 4 }));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => (window as any).__game);
  await page.click('#join-offline');
  await page.waitForFunction(() => document.getElementById('join')?.classList.contains('hidden'), { timeout: 20000 });
  await page.evaluate(() => (window as any).__game.activate());
  await sleep(1500);
  await page.evaluate(`window.__game.teleport(0, 30); window.__game.day(0.3);`);
  await sleep(1200);
  const res = (await page.evaluate(`(() => {
    const G = window.__game; const w = G.world;
    const W = w.renderer.domElement.width, H = w.renderer.domElement.height;
    const cam = w.camera.clone();
    const fov = 12; const span = ${span};
    const h = span / 2 / Math.tan((fov / 2) * Math.PI / 180);
    cam.fov = fov; cam.aspect = W / H; cam.near = 1; cam.far = h + 200;
    cam.position.set(${cx}, h, ${cz}); cam.up.set(0, 0, -1); cam.lookAt(${cx}, 0, ${cz}); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const fog = w.scene.fog; w.scene.fog = null;
    w.renderer.render(w.scene, cam);
    w.scene.fog = fog;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.drawImage(w.renderer.domElement, 0, 0);
    const px = (x, z) => { const v = cam.position.clone().set(x, 0.7, z).project(cam); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; };
    const scale = px(1, 0)[0] - px(0, 0)[0];
    const cs = w.colliders.filter((k) => Math.abs(k.x - ${cx}) < span && Math.abs(k.z - ${cz}) < span);
    for (const k of cs) {
      const [x, y] = px(k.x, k.z);
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, (k.r + 0.35) * scale, 0, 7); g.stroke();
      g.strokeStyle = 'red'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, k.r * scale, 0, 7); g.stroke();
    }
    // A 2 m grid with labels every 4 m.
    g.font = '12px sans-serif'; g.fillStyle = 'white';
    for (let x = Math.ceil((${cx} - span) / 2) * 2; x <= ${cx} + span; x += 2) { const [a] = px(x, 0); g.strokeStyle = x % 4 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.22)'; g.beginPath(); g.moveTo(a, 0); g.lineTo(a, H); g.stroke(); if (x % 4 === 0) g.fillText('x' + x, a + 2, 12); }
    for (let z = Math.ceil((${cz} - span) / 2) * 2; z <= ${cz} + span; z += 2) { const [, b] = px(0, z); g.strokeStyle = z % 4 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.22)'; g.beginPath(); g.moveTo(0, b); g.lineTo(W, b); g.stroke(); if (z % 4 === 0) g.fillText('z' + z, 2, b - 2); }
    return { url: c.toDataURL('image/jpeg', 0.9), cs: cs.map((k) => [+k.x.toFixed(2), +k.z.toFixed(2), +k.r.toFixed(2)]) };
  })()`)) as { url: string; cs: number[][] };
  fs.writeFileSync(out, Buffer.from(res.url.split(',')[1], 'base64'));
  console.log(JSON.stringify(res.cs));
} finally {
  await browser.close();
  await vite.close();
}
process.exit(0);

// The stage the skipping stones scripts share (skip-check.ts, skip-views.ts): a game server on a throwaway data
// folder with seeded accounts, a Vite server, and headless players who join it, one browser each.
//
// Ports: SKIP_PORT (the game server, default 4301) and SKIP_VITE_PORT (default 5311).
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { createServer } from 'vite';
import { MAPS } from '../src/data/maps';
import { SKIP, skipDir } from '../src/data/skip';
import { TIP_IDS } from '../src/game/tips';
import { newSave } from '../src/game/state';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = Number(process.env.SKIP_VITE_PORT) || 5311;
const SERVER_PORT = Number(process.env.SKIP_PORT) || 4301;
// Software GL draws a few frames a second, so everything waits on a condition with room to spare.
export const WAIT = 90_000;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const MAP = MAPS[0];
export const CAMP = MAP.camp!;
export const PILE = CAMP.stones;
export const SIGN = CAMP.skipSign;
/** The way the stones fly, and the view's yaw that looks along it. */
export const [DX, DZ] = skipDir(0);
export const AIM = Math.atan2(-DX, -DZ);
/** Camera yaw that looks from (x, z) toward (tx, tz); yaw 0 looks along -z. */
export const yawTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z));
/** A spot `d` m from the pile toward the beach's open sand (south-west of it, where players walk up from), and the yaw that looks at the pile from there. */
export const byPile = (d = 1, deg = 250) => {
  const x = PILE.x + d * Math.sin((deg * Math.PI) / 180);
  const z = PILE.z + d * Math.cos((deg * Math.PI) / 180);
  return { x, z, yaw: yawTo(x, z, PILE.x, PILE.z) };
};
export { SKIP };

export interface SkipState {
  charging: boolean;
  power: number;
  busy: boolean;
  best: { n: number; name: string } | null;
  sign: string | null;
  counter: string | null;
  stones: { id: number; own: boolean; n: number; t: number; skips: number; sunk: boolean; x: number; y: number; z: number; seen: boolean }[];
  rings: number;
}

export interface Stage {
  /** Opens a player's own browser and joins the room; `phone` is a phone-sized touch screen in landscape, `hud` keeps the HUD in the pictures. */
  join(name: string, opts?: { phone?: boolean; hud?: boolean; size?: [number, number] }): Promise<Page>;
  leave(...pages: Page[]): Promise<void>;
  close(): Promise<void>;
  errors: string[];
}

/** Starts the server and Vite. `names` are the accounts seeded (level 22, every tip seen, an empty hand); `extra` adds to a name's save. */
export async function stage(names: string[], extra: Record<string, object> = {}): Promise<Stage> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fishing-skip-'));
  const token = (name: string) => `${name}-skip-token-0123456789abcdef`;
  const colors = [0xe86a5a, 0x4a8fd6, 0x7ac76a, 0xf2c14e, 0xb07ad6, 0x5ac7c0];
  const accounts = Object.fromEntries(names.map((name, i) => [name.toLowerCase(), {
    name,
    hash: createHash('sha256').update(token(name)).digest('hex'),
    save: { ...newSave(), level: 22, coins: 5000, tips: [...TIP_IDS], held: 4, look: { ...newSave().look, color: colors[i % colors.length] }, ...extra[name] },
  }]));
  fs.writeFileSync(path.join(dataDir, 'accounts.json'), JSON.stringify(accounts));

  // The server runs in its own process group (`detached`), as in smoke.ts: stopping only npx would leave it on the port.
  let serverGroup: number | undefined;
  const alive = (): boolean => {
    if (serverGroup === undefined) return false;
    try { process.kill(-serverGroup, 0); return true; } catch { return false; }
  };
  const signal = (sig: NodeJS.Signals): void => {
    if (serverGroup === undefined) return;
    try { process.kill(-serverGroup, sig); } catch { /* already gone */ }
  };
  const stopServer = async (): Promise<void> => {
    signal('SIGTERM');
    for (let i = 0; i < 20 && alive(); i++) await sleep(100);
    if (alive()) signal('SIGKILL');
  };
  process.on('exit', () => { if (alive()) signal('SIGKILL'); });
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(sig, () => void stopServer().then(() => process.exit(128 + os.constants.signals[sig])));
  const waitForLine = (proc: ChildProcess, re: RegExp): Promise<void> => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('game server did not start')), 60_000);
    proc.stdout!.on('data', (b: Buffer) => { if (re.test(b.toString())) { clearTimeout(timer); resolve(); } });
    proc.on('exit', (c) => reject(new Error(`game server exited (${c})`)));
  });
  const server = spawn('npx', ['tsx', 'server/index.ts'], {
    // TEST_HOOKS: the test hook's teleports get past the server's move check.
    env: { ...process.env, DATA_DIR: dataDir, PORT: String(SERVER_PORT), DATABASE_URL: '', DISCORD_FEEDBACK_WEBHOOK: '', DISCORD_JOINS_WEBHOOK: '', DISCORD_TIPS_WEBHOOK: '', TEST_HOOKS: '1' },
    stdio: ['ignore', 'pipe', 'inherit'],
    detached: true,
  });
  serverGroup = server.pid;
  await waitForLine(server, /fishing server on port/);
  process.env.VITE_SERVER_URL = `ws://localhost:${SERVER_PORT}`;
  // No file watching or hot reload: an edit saved elsewhere in the checkout mid-run would reload every player's page.
  const vite = await createServer({ server: { port: VITE_PORT, strictPort: true, hmr: false, watch: null }, logLevel: 'error' });
  await vite.listen();

  // One browser per player: headless Chrome draws only the page in front, and the game moves only frame by frame.
  const browsers = new Set<Browser>();
  const errors: string[] = [];
  const join: Stage['join'] = async (name, opts = {}) => {
    const [w, h] = opts.size ?? [800, 450];
    const browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
      defaultViewport: opts.phone ? { width: 915, height: 412, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: w, height: h },
      protocolTimeout: 300_000,
    });
    browsers.add(browser);
    const page = (await browser.pages())[0] ?? (await browser.newPage());
    page.on('pageerror', (e) => { errors.push(`${name}: ${e.message}`); console.error(`${name}: ${e.message}`); });
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') console.error(`      ${name} console ${m.type()}: ${m.text().slice(0, 300)}`); });
    page.setDefaultTimeout(WAIT);
    await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
    await page.evaluateOnNewDocument((t) => localStorage.setItem('fishing-token', t), token(name));
    await page.evaluateOnNewDocument(() => localStorage.setItem('fishing-news', String(Number.MAX_SAFE_INTEGER)));
    await page.goto(`http://localhost:${VITE_PORT}/?name=${name}&room=skip${opts.phone ? '&touch' : ''}`, { waitUntil: 'load', timeout: 300_000 });
    await page.waitForFunction(() => window.__game?.online(), { timeout: 300_000 }).catch(async (e) => {
      const why = await page.evaluate(() => ({ game: !!window.__game, join: document.getElementById('join')?.innerText.slice(0, 200) })).catch((x) => String(x));
      throw new Error(`${name} never came online: ${JSON.stringify(why)} (${e})`);
    });
    // Daylight on every screen, so the shots compare.
    await page.evaluate(() => { window.__game.activate(); window.__game.day(0.35); });
    if (!opts.hud && !opts.phone) await page.addStyleTag({ content: '#hud, #crosshair, #toast, #banner, #tip, #guide, #chat, #fps { display: none !important; }' });
    else await page.addStyleTag({ content: '#banner, #tip, #guide, #fps { display: none !important; }' });
    return page;
  };
  return {
    join,
    errors,
    leave: async (...pages) => { await Promise.all(pages.map((p) => { browsers.delete(p.browser()); return p.browser().close(); })); },
    close: async () => {
      await Promise.all([...browsers].map((b) => b.close().catch(() => {})));
      await vite.close();
      await stopServer();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** Lets a page draw `n` frames (positions lerp, stones fly and emotes advance only frame by frame). */
export const frames = (p: Page, n: number) => p.evaluate(async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); }, n);
export const skipState = (p: Page) => p.evaluate(() => window.__game.skip.state()) as Promise<SkipState>;
export const near = (p: Page) => p.evaluate(() => window.__game.player().near as string | null);
/** Stands a player at a spot, looking along `yaw`. */
export async function put(p: Page, x: number, z: number, yaw: number, pitch = -0.15): Promise<void> {
  await p.evaluate((x, z, yaw, pitch) => { window.__game.teleport(x, z); window.__game.look(yaw, pitch); }, x, z, yaw, pitch);
  await frames(p, 4);
}
/**
 * Throws a stone as a player would: the action goes down on the prompt (what E does), the gauge is let go at `power`.
 * False when no prompt offered the pile.
 */
export async function throwStone(p: Page, power: number): Promise<boolean> {
  return p.evaluate(async (power) => {
    const g = window.__game;
    if (g.player().near !== 'Skip a stone') return false;
    g.interact();
    // A short wind-up, as a held key gives (a hold under 0.15 s is taken for a slip; the game steps at most 0.05 s a frame).
    const t0 = performance.now();
    for (let i = 0; i < 6 || performance.now() - t0 < 260; i++) await new Promise((r) => requestAnimationFrame(r));
    g.skip.release(power);
    return true;
  }, power);
}
/** How many times the sign's face has been drawn (its texture's version): it goes up only when the sign is rewritten. */
export const signDraws = (p: Page) => p.evaluate(() => (window.__game.world as unknown as { town?: { skipSign?: { tex: { version: number } } } }).town?.skipSign?.tex.version ?? -1);

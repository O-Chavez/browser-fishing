// Home screen stills: every view of the home screen (src/game/home.ts) staged in headless Chrome, for looking at
// after a change to it.
//
//   npx tsx scripts/homeshots.ts [out folder] [shot ...]
//
// Starts its own game server on a throwaway data folder with seeded accounts (your saves are never touched) and
// writes PNGs to the folder given (default .bench/homeshots/). Desktop at 1440x900 for every view, 1920x1080 and
// 1280x720 for two of them, a landscape phone (915x412, touch mode) for six, and two short ones (844x300, 844x260) for three.
import { spawn } from 'node:child_process';
import { createHash, scryptSync } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { type Page, type Viewport } from 'puppeteer-core';
import { createServer } from 'vite';
import { COSMETICS } from '../src/data/cosmetics';
import { FISH } from '../src/data/content';
import { TIP_IDS } from '../src/game/tips';
import { newSave } from '../src/game/state';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = 5312;
const SERVER_PORT = 8812;
const [outArg, ...only] = process.argv.slice(2);
const OUT = path.resolve(outArg ?? '.bench/homeshots');
const want = (name: string) => !only.length || only.some((o) => name.startsWith(o));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const DESKTOP: Viewport = { width: 1440, height: 900 };
const PHONE: Viewport = { width: 915, height: 412, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
// A phone with the browser's bars taking a third of its height: the touch layout comes out 1400x498.
const SHORT: Viewport = { width: 844, height: 300, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
// The least the touch layout is drawn for (1400x432).
const TINY: Viewport = { width: 844, height: 260, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

// ---------- server with seeded accounts ----------

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fishing-homeshots-'));
const token = (name: string) => `${name}-token-0123456789abcdef`;
const pw = (pass: string) => {
  const salt = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
  return { salt: salt.toString('hex'), hash: scryptSync(pass, salt, 32).toString('hex') };
};
const PASS = 'lakeside';
const look = { color: 0xf2c14e, face: 'wink', hat: 'crown', shirt: 'cloak', jewelry: 'diamond' };
const dex = Object.fromEntries(FISH.slice(0, 9).map((f) => [f.id, { count: 3, best: f.maxSize * 0.6, shiny: 0 }]));
const accounts = {
  // Dressed up, with a password: the returning player.
  juniper: { name: 'Juniper', hash: createHash('sha256').update(token('Juniper')).digest('hex'), pw: pw(PASS), save: { ...newSave(), level: 42, coins: 18300, tips: [...TIP_IDS], dex, owned: COSMETICS.map((c) => c.id), look: { ...newSave().look, ...look } } },
  // From before passwords: logging out would delete it.
  rowan: { name: 'Rowan', hash: createHash('sha256').update(token('Rowan')).digest('hex'), save: { ...newSave(), level: 12, coins: 1240, tips: [...TIP_IDS], dex, look: { ...newSave().look, color: 0x4a8fd6, face: 'grin' } } },
};
fs.writeFileSync(path.join(dataDir, 'accounts.json'), JSON.stringify(accounts));

let serverGroup: number | undefined;
const serverGroupAlive = (): boolean => {
  if (serverGroup === undefined) return false;
  try { process.kill(-serverGroup, 0); return true; } catch { return false; }
};
const signalServerGroup = (sig: NodeJS.Signals): void => {
  if (serverGroup === undefined) return;
  try { process.kill(-serverGroup, sig); } catch { /* already gone */ }
};
let serverStopping: Promise<void> | undefined;
/** Stops the game server and everything it started: SIGTERM, then SIGKILL if it's still up after 2 s. */
function stopServer(): Promise<void> {
  serverStopping ??= (async () => {
    signalServerGroup('SIGTERM');
    for (let i = 0; i < 20 && serverGroupAlive(); i++) await sleep(100);
    if (serverGroupAlive()) signalServerGroup('SIGKILL');
  })();
  return serverStopping;
}
process.on('exit', () => { if (serverGroupAlive()) signalServerGroup('SIGKILL'); });
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(sig, () => void stopServer().then(() => process.exit(128 + os.constants.signals[sig])));
}

// The server runs in its own process group (`detached`), as in scripts/screenshots.ts.
const server = spawn('npx', ['tsx', 'server/index.ts'], {
  env: { ...process.env, DATA_DIR: dataDir, PORT: String(SERVER_PORT), DATABASE_URL: '', DISCORD_FEEDBACK_WEBHOOK: '', DISCORD_JOINS_WEBHOOK: '', DISCORD_TIPS_WEBHOOK: '', TEST_HOOKS: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
  detached: true,
});
serverGroup = server.pid;
await new Promise<void>((res) => server.stdout!.on('data', (d) => /fishing server on port/.test(String(d)) && res()));
process.env.VITE_SERVER_URL = `ws://localhost:${SERVER_PORT}`;
const vite = await createServer({ server: { port: VITE_PORT, strictPort: true }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  defaultViewport: DESKTOP,
});

// ---------- staging ----------

interface Stage {
  view?: Viewport;
  /** localStorage before the page loads. `login: 'Juniper'` is a saved login for that seeded account. */
  login?: string;
  store?: Record<string, string>;
  /** The game server answers slowly (ms), or not at all. */
  slow?: number;
  dead?: boolean;
  /** A real phone: `navigator.webdriver` off, so the first-visit Home Screen step is offered. */
  phone?: boolean;
}

async function open(o: Stage = {}): Promise<Page> {
  const page = await (await browser.createBrowserContext()).newPage();
  page.on('pageerror', (e) => console.error(`page error: ${e.message}`));
  await page.setViewport(o.view ?? DESKTOP);
  // tsx keeps function names by wrapping them in __name(); functions sent to the page need it too.
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  const store = { ...(o.login ? { 'fishing-name': o.login, 'fishing-auto': '1', 'fishing-token': token(o.login) } : {}), ...o.store };
  await page.evaluateOnNewDocument(
    (store, port, slow, dead, phone) => {
      // Once per tab: a reload must find what the page itself has saved since.
      if (!sessionStorage.getItem('homeshots')) {
        sessionStorage.setItem('homeshots', '1');
        for (const [k, v] of Object.entries(store)) localStorage.setItem(k, v);
      }
      if (phone) Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
      if (!slow && !dead) return;
      const Real = window.WebSocket;
      // Only the game's socket: Vite's own stays as it is.
      window.WebSocket = class extends Real {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(dead ? String(url).replace(`:${port}`, ':9') : url, protocols);
        }
        send(data: string): void {
          if (slow && this.url.includes(`:${port}`)) setTimeout(() => super.send(data), slow);
          else super.send(data);
        }
      };
    },
    store, SERVER_PORT, o.slow ?? 0, !!o.dead, !!o.phone,
  );
  await page.goto(`http://localhost:${VITE_PORT}/${o.view?.hasTouch ? '?touch' : ''}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => window.__game, { timeout: 60_000 });
  return page;
}

const shoot = async (p: Page, name: string): Promise<void> => {
  // Let the character preview and the fonts settle.
  await sleep(600);
  await p.screenshot({ path: path.join(OUT, `${name}.png`) });
  const fit = await p.evaluate(() => {
    const shown = [...document.querySelectorAll<HTMLElement>('#join > .panel')].find((el) => getComputedStyle(el).display !== 'none');
    if (!shown) return 'no card';
    const r = shown.getBoundingClientRect();
    const out = r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight;
    const scrolls = shown.scrollHeight > shown.clientHeight + 1 || shown.scrollWidth > shown.clientWidth + 1;
    return `${Math.round(r.width)}x${Math.round(r.height)} in ${innerWidth}x${innerHeight}${out ? ' OFF SCREEN' : ''}${scrolls && shown.id !== 'join-board' ? ' SCROLLS' : ''}`;
  });
  console.log(`wrote ${name}.png  (card ${fit})`);
};
const close = (p: Page) => p.browserContext().close();
/** A tap at an element's middle: `page.tap` misses under the touch layout's scaling. */
const tap = async (p: Page, sel: string): Promise<void> => {
  const r = (await (await p.$(sel))!.boundingBox())!;
  await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
};
const press = (p: Page, sel: string, touch: boolean) => (touch ? tap(p, sel) : p.click(sel));
const playReady = (p: Page) => p.waitForFunction(() => document.getElementById('join-play')!.textContent === 'Play' && !(document.getElementById('join-play') as HTMLButtonElement).disabled, { timeout: 60_000 });
// The newest "What's new" entry's id, read from the source: the data file imports its photos, which only Vite can load.
const NEWEST = Number(/export const NEWS[^]*?\bid: (\d+)/.exec(fs.readFileSync('src/data/news.ts', 'utf8'))![1]);
const unread = (n: number) => ({ 'fishing-news': String(NEWEST - n) });
const read = { 'fishing-news': String(NEWEST) };

let failed = false;
try {
  for (const [tag, view] of [['', DESKTOP], ['-1920', { width: 1920, height: 1080 }], ['-1280', { width: 1280, height: 720 }], ['-phone', PHONE], ['-short', SHORT], ['-tiny', TINY]] as const) {
    const touch = !!(view as Viewport).hasTouch;
    const full = tag === '';
    const short = tag === '-short' || tag === '-tiny';

    if (want(`new${tag}`)) {
      const p = await open({ view });
      if (full || (touch && !short)) {
        // The card as index.html has it before the script runs (the stylesheet is linked in the built page's head).
        await p.evaluate(() => (document.getElementById('join')!.className = 'loading'));
        await shoot(p, `loading${tag}`);
        await p.evaluate((focus) => {
          document.getElementById('join')!.className = 'new';
          // Hiding the form took the cursor out of the name field; on a computer it starts there.
          if (focus) document.getElementById('join-name')!.focus();
        }, !touch);
      }
      await shoot(p, `new${tag}`);
      if (full) {
        await p.type('#join-name', 'Wren');
        await p.type('#join-newpass', 'abc');
        await p.click('#join-go');
        await shoot(p, 'new-error');
      }
      if (touch) {
        await tap(p, '[data-join="login"]');
        await shoot(p, `login${tag}`);
      }
      await close(p);
    }

    if (full && want('login')) {
      const p = await open();
      await p.click('[data-join="login"]');
      await p.type('#join-login-name', 'Juniper');
      await p.type('#join-pass', 'not-the-password');
      await p.click('#join-login-go');
      await p.waitForFunction(() => /Wrong/.test(document.getElementById('join-msg')!.textContent ?? ''), { timeout: 15_000 });
      await shoot(p, 'login-wrong');
      await close(p);
    }

    if (full && want('in-connecting')) {
      const p = await open({ login: 'Juniper', store: read, slow: 6000 });
      await shoot(p, 'in-connecting');
      await close(p);
    }

    if (full && want('in-fresh')) {
      const p = await open();
      await p.type('#join-name', 'Wren');
      await p.type('#join-newpass', PASS);
      await p.click('#join-go');
      await playReady(p);
      await shoot(p, 'in-fresh');
      await p.click('#join-other');
      await shoot(p, 'switch-pass');
      await close(p);
    }

    if (want(`in${tag}`)) {
      const p = await open({ view, login: 'Juniper', store: unread(3) });
      await playReady(p);
      await shoot(p, `in${tag}`);
      if (full || (touch && !short)) {
        await press(p, '#join-news', touch);
        await shoot(p, `board${tag}`);
        await press(p, '[data-join="back"]', touch);
      }
      if (full) {
        // Play: frames through the fade, then the game.
        await p.click('#join-play');
        for (const i of [1, 2, 3]) {
          const o = await p.evaluate(() => (document.getElementById('join')!.classList.contains('hidden') ? 'the home screen gone' : `the home screen at opacity ${Number(getComputedStyle(document.getElementById('join')!).opacity).toFixed(2)}`));
          await p.screenshot({ path: path.join(OUT, `play-fade-${i}.png`) });
          console.log(`wrote play-fade-${i}.png  (just before: ${o})`);
        }
        await sleep(1200);
        await p.screenshot({ path: path.join(OUT, 'play-after.png') });
        console.log(`wrote play-after.png  (${await p.evaluate(() => JSON.stringify({ home: !document.getElementById('join')!.classList.contains('hidden'), locked: !!document.pointerLockElement, resume: document.getElementById('resume')!.classList.contains('hidden') ? '' : document.getElementById('resume')!.textContent, banner: document.getElementById('banner')!.classList.contains('hidden') ? '' : document.getElementById('banner')!.textContent }))})`);
      }
      await close(p);
    }

    if (full && want('switch-nopass')) {
      const p = await open({ login: 'Rowan', store: read });
      await playReady(p);
      await p.click('#join-other');
      await shoot(p, 'switch-nopass');
      await close(p);
    }

    if (full && want('unreachable')) {
      const p = await open({ login: 'Juniper', store: read, dead: true });
      await p.waitForFunction(() => document.getElementById('join-play')!.textContent === 'Try again', { timeout: 30_000 });
      await shoot(p, 'unreachable');
      await close(p);
    }

    if (touch && !short && want('homestep')) {
      const p = await open({ view, phone: true });
      await shoot(p, 'homestep-phone');
      await close(p);
    }
  }
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await browser.close();
  await vite.close();
  await stopServer();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);

declare global {
  interface Window {
    __game: any;
  }
}

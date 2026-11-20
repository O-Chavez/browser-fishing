/**
 * Playing from the Home Screen on phones and tablets (GAME_DESIGN.md §39, "Home Screen"). In a browser tab the
 * address bar and tabs take about a third of a landscape phone; added to the Home Screen (or installed), the game
 * opens like an app without them. A one-time card after joining says how, and Settings keeps a way back to it.
 *
 * The page doesn't go full screen itself: Chrome on Android ignores the page's viewport while full screen, so the touch
 * layout (`touchLayoutWidth`) would draw at full size. The rules here are plain functions of what the page reads
 * (`readScreenEnv`), so they can be tested without a browser.
 */

/** What the page knows about this device, read once when touch mode starts. */
export interface ScreenEnv {
  /** Touch mode is on (`enableTouch`). */
  touch: boolean;
  /** A test browser (`navigator.webdriver`): the smoke test and staging scripts never get the card. */
  automated: boolean;
  /** Already opened from the Home Screen or as an installed app, with no browser bars (`runningInstalled`). */
  installed: boolean;
  /** An iPhone, iPod or iPad (`isIos`): Safari's steps, and a Home Screen game with its own storage. */
  ios: boolean;
}

/** How the page was opened, from `display-mode` media queries and iOS's `navigator.standalone`. */
export interface DisplayMode {
  standalone: boolean;
  /** `(display-mode: fullscreen)` matches. It also matches while the Fullscreen API has the page full screen. */
  fullscreen: boolean;
  /** The Fullscreen API has an element full screen right now. */
  inFullscreen: boolean;
  /** iOS's `navigator.standalone`: opened from the Home Screen. */
  iosStandalone: boolean;
}

/** Opened as an installed app (from the Home Screen, or an installed web app): no browser bars to hide. */
export function runningInstalled(m: DisplayMode): boolean {
  return m.standalone || m.iosStandalone || (m.fullscreen && !m.inFullscreen);
}

/** iPhone, iPod or iPad. iPads since iPadOS 13 say they're a Mac, so a Mac with a touch screen counts too. */
export function isIos(ua: string, platform: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

/** The card, and its button in Settings: on a phone or tablet still in a browser tab. */
export const offersHomeScreen = (e: ScreenEnv): boolean => e.touch && !e.automated && !e.installed;

/**
 * Whether the card waits to open after this join: once per browser (`seen`), online (on iPhones it's about logging
 * in), and not on a brand-new player's first join, who has the start tutorial to read.
 */
export function homeTipDue(e: ScreenEnv, online: boolean, fresh: boolean, seen: boolean): boolean {
  return offersHomeScreen(e) && online && !fresh && !seen;
}

/** The browser remembers the card was shown here under this key. */
export const HOME_TIP_KEY = 'fishing-homescreen-tip';

/** Seconds of quiet (no menu, card or banner, nothing on the line, the stick at rest) before the card opens. */
export const HOME_TIP_BEAT_SECS = 1.5;

/** Seconds after joining before the card may open, so the welcome and a stage's banner (4.6 s in) have had their turn (play-test default). */
export const HOME_TIP_DELAY_SECS = 20;

export const HOME_TIP_TITLE = 'Add to Home Screen';

/** The browser remembers the first-visit step at the join was shown here (apart from `HOME_TIP_KEY`). */
export const HOME_JOIN_KEY = 'fishing-homescreen-join';

/** What the join screen knows when touch mode starts, for `homeJoinDue`. */
export interface JoinState {
  /** The join card is up (not the `?name=` link that skips it). */
  shown: boolean;
  /** A returning player's automatic join is already under way (`joinStart`). */
  joining: boolean;
  /** `fishing-name`: saved when this browser first tries to join, kept until a log-out. */
  name: string | null;
  /** `fishing-auto`: saved once a join here has worked. */
  auto: string | null;
  /** The save in this browser has no progress (`isFreshSave`), so nothing was played offline either. */
  freshSave: boolean;
  /** `HOME_JOIN_KEY` is set: the step was shown here before. */
  seen: boolean;
}

/**
 * Whether the join screen opens on the Home Screen step: a phone or tablet in a browser tab that has never joined or
 * played here, on the join card itself, once per browser. A brand-new player who adds the game to the Home Screen now
 * makes their account in the Home Screen game, so on an iPhone nothing has to carry over from Safari.
 */
export function homeJoinDue(e: ScreenEnv, j: JoinState): boolean {
  return offersHomeScreen(e) && j.shown && !j.joining && !j.name && !j.auto && j.freshSave && !j.seen;
}

/**
 * The first-visit step on the join screen, in place of the join form until "Play in the browser". No password talk:
 * there's no account yet. Once installed (or the prompt accepted) it says where to open the game instead.
 */
export function homeJoinHtml(o: { ios: boolean; canPrompt: boolean; installed: boolean }): string {
  const browser = '<button class="btn plain" data-home="browser">Play in the browser</button>';
  const foot = '<p class="home-foot">You can find this again in ⚙️ Settings.</p>';
  // Installed, Settings no longer offers it, so no pointer there.
  if (o.installed) return `<p class="home-done">Installed! Open Lakeside from your Home Screen.</p><div class="btns">${browser}</div>`;
  const action = o.ios
    ? '<p class="steps">Tap <b>Share</b> (in Safari it may be under <b>···</b>), then <b>Add to Home Screen</b>.</p>'
    : o.canPrompt
      ? ''
      : `<p class="steps">Open your browser's menu (<b>⋮</b>), then <b>Add to Home screen</b> or <b>Install app</b>.</p>`;
  const install = !o.ios && o.canPrompt ? '<button class="btn gold" data-home="install">📲 Install</button>' : '';
  return `<h1>📲 Add to Home Screen first?</h1>
    <p>On a phone, the browser's address bar and tabs take about a third of the screen. Add Lakeside to your Home Screen and it opens like an app, with the whole screen for the lake. No download and no app store: it's the same game.</p>
    ${action}<div class="btns">${install}${browser}</div>${foot}`;
}

/**
 * The card. iPhones get Safari's steps; elsewhere the browser's own install prompt as a button when it has offered one
 * (`installReady`), else its menu's steps. A Home Screen game on an iPhone keeps its own storage apart from Safari's, so
 * it doesn't have this browser's login: there a player without a password would find their name taken, and is sent to
 * set one. An installed app on Android shares the browser's storage, so the login carries over.
 */
export function homeTipHtml(o: { ios: boolean; hasPass: boolean; canPrompt: boolean }): string {
  const intro = `<p>Play Lakeside from your Home Screen and it opens like an app, without the browser's address bar and tabs, so more of the screen is the lake. No download and no app store: it's the same game.</p>`;
  if (o.ios) {
    const login = o.hasPass
      ? '<p>Log in there with your name and password.</p>'
      : '<p>Your Home Screen game logs in with your name and a password, so set one first.</p>';
    const pass = o.hasPass ? '' : '<button class="btn gold" data-acct="pass">🔒 Set a password</button>';
    return `<div class="hometip">${intro}<p class="steps">Tap <b>Share</b> (in Safari it may be under <b>···</b>), then <b>Add to Home Screen</b>.</p>${login}
      <div class="btns">${pass}<button class="btn ${o.hasPass ? 'gold' : 'plain'}" data-act="close">Got it</button></div></div>`;
  }
  if (o.canPrompt)
    return `<div class="hometip">${intro}<div class="btns"><button class="btn gold" data-act="install">📲 Install</button><button class="btn plain" data-act="close">Got it</button></div></div>`;
  return `<div class="hometip">${intro}<p class="steps">Open your browser's menu (<b>⋮</b>), then <b>Add to Home screen</b> or <b>Install app</b>.</p>
    <div class="btns"><button class="btn gold" data-act="close">Got it</button></div></div>`;
}

// ---------- the DOM side ----------

/** Chrome's install prompt event (not in TypeScript's DOM types). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installEvent: InstallPromptEvent | null = null;
let installedHere = false;
const installWatchers = new Set<() => void>();
const tellInstallWatchers = () => installWatchers.forEach((f) => f());

// Chrome (and Samsung Internet) offer to install as soon as the page qualifies, often before touch mode starts, so this
// listens from the moment the module loads. The browser's own install bar is held back; the card's Install button
// shows the prompt instead. Installing from the browser's menu fires `appinstalled` too.
if (typeof addEventListener === 'function') {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e as InstallPromptEvent;
    tellInstallWatchers();
  });
  addEventListener('appinstalled', () => {
    installEvent = null;
    installedHere = true;
    tellInstallWatchers();
  });
}

/** The browser has offered its install prompt, so the card can show an Install button. */
export const installReady = (): boolean => !!installEvent;

/** The game was installed from this tab since the page loaded. */
export const installedSinceLoad = (): boolean => installedHere;

/** Calls `f` whenever the install prompt arrives, is used up, or the game is installed. */
export function watchInstall(f: () => void): void {
  installWatchers.add(f);
}

/**
 * Shows the browser's install prompt; must run inside a tap. Resolves true if the player accepted. The prompt can be
 * shown once per offer, so it's dropped either way (Chrome may offer again later).
 */
export async function promptInstall(): Promise<boolean> {
  const e = installEvent;
  if (!e) return false;
  installEvent = null;
  try {
    await e.prompt();
    return (await e.userChoice).outcome === 'accepted';
  } catch {
    return false;
  } finally {
    tellInstallWatchers();
  }
}

type FsDocument = { fullscreenElement?: Element | null; webkitFullscreenElement?: Element | null };

/** Reads `ScreenEnv` from the page. */
export function readScreenEnv(touch: boolean): ScreenEnv {
  const doc = document as unknown as FsDocument;
  const mm = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    touch,
    automated: !!nav.webdriver,
    installed: runningInstalled({
      standalone: mm('(display-mode: standalone)'),
      fullscreen: mm('(display-mode: fullscreen)'),
      inFullscreen: !!(doc.fullscreenElement ?? doc.webkitFullscreenElement),
      iosStandalone: nav.standalone === true,
    }),
    ios: isIos(nav.userAgent, nav.platform ?? '', nav.maxTouchPoints ?? 0),
  };
}

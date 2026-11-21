/**
 * Playing from the Home Screen on phones and tablets (GAME_DESIGN.md §39, "Home Screen"). In a browser tab the
 * address bar and tabs take about a third of a landscape phone; added to the Home Screen (or installed), the game
 * opens like an app without them. A one-time card says how, right after joining, and Settings keeps a way back to it.
 * It never stands between a player and the home screen's card.
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

/** Whether the card opens after this join: once per browser (`seen`), and online (on iPhones it's about logging in). */
export function homeTipDue(e: ScreenEnv, online: boolean, seen: boolean): boolean {
  return offersHomeScreen(e) && online && !seen;
}

/** The browser remembers the card was shown here under this key. */
export const HOME_TIP_KEY = 'fishing-homescreen-tip';

export const HOME_TIP_TITLE = 'Get the whole screen';

/** Safari's Share icon (a square with an arrow out of its top), drawn so players can match it to the button they're looking for. */
const SHARE_ICON =
  '<svg class="share-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M8 10H6v10h12V10h-2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Why: one line, then what the player gets. */
const HOME_WHY = `<p class="home-lead">Add Lakeside to your Home Screen and it opens like an app:</p>`;
const HOME_GAINS = `<ul class="home-gains"><li>No address bar or tabs</li><li>The whole screen for the lake</li><li>Opens straight into the game</li><li>No download, no app store</li></ul>`;

/**
 * How, as numbered steps. iPhones: Safari's Share, which Chrome, Edge and Firefox have too; Brave doesn't (2026), so
 * the last line sends players without it to Safari. Elsewhere the browser's menu, unless it has offered its install
 * prompt, which a button then opens in one tap (the button sits with the card's others).
 */
function homeStepsHtml(o: { ios: boolean; canPrompt: boolean }): string {
  if (o.ios)
    return `<ol class="home-steps"><li>Tap <b>Share</b> ${SHARE_ICON} (on some iPhones it's under <b>···</b>)</li><li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b></li><li>Open <b>Lakeside</b> from your Home Screen</li></ol><p class="home-note">Don't see <b>Add to Home Screen</b>? Open this page in <b>Safari</b> and try there.</p>`;
  if (o.canPrompt) return `<ol class="home-steps"><li>Tap <b>📲 Add to Home Screen</b> below</li><li>Confirm with <b>Install</b></li><li>Open <b>Lakeside</b> from your Home Screen</li></ol>`;
  return `<ol class="home-steps"><li>Tap your browser's menu <b class="kebab">⋮</b></li><li>Tap <b>Add to Home screen</b> or <b>Install app</b></li><li>Open <b>Lakeside</b> from your Home Screen</li></ol>`;
}

/** The two columns both versions share: what the player gets on the left, the steps on the right. */
const homeGrid = (o: { ios: boolean; canPrompt: boolean }): string =>
  `<div class="home-grid"><div>${HOME_GAINS}</div><div class="home-how">${homeStepsHtml(o)}</div></div>`;

/**
 * The card. iPhones get Safari's steps; elsewhere the browser's own install prompt as a button when
 * it has offered one (`installReady`), else its menu's steps. A Home Screen game on an iPhone keeps its own storage
 * apart from Safari's, so it doesn't have this browser's login: there a player without a password would find their
 * name taken, and is sent to set one. An installed app on Android shares the browser's storage, so the login carries over.
 */
export function homeTipHtml(o: { ios: boolean; hasPass: boolean; canPrompt: boolean }): string {
  const grid = homeGrid({ ios: o.ios, canPrompt: !o.ios && o.canPrompt });
  if (o.ios) {
    const login = o.hasPass
      ? '<p class="home-login">Log in there with your name and password.</p>'
      : '<p class="home-login">🔒 Your Home Screen game logs in with a password, so set one first.</p>';
    const pass = o.hasPass ? '' : '<button class="btn gold" data-acct="pass">Set a password</button>';
    // The login line and the buttons share a row, so the card fits a phone with Safari's bars.
    return `<div class="hometip">${HOME_WHY}${grid}<div class="home-row">${login}<div class="btns">${pass}<button class="btn ${o.hasPass ? 'gold' : 'plain'}" data-act="close">Got it</button></div></div></div>`;
  }
  const install = o.canPrompt ? '<button class="btn gold" data-act="install">📲 Add to Home Screen</button>' : '';
  return `<div class="hometip">${HOME_WHY}${grid}<div class="btns">${install}<button class="btn ${o.canPrompt ? 'plain' : 'gold'}" data-act="close">Got it</button></div></div>`;
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

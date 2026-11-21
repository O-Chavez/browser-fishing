import type { NewsEntry } from '../data/news';
import { escapeHtml } from './format';
import { newsHtml } from './news';
import { standingText, welcomeGoal } from './progression';

/**
 * The home screen (GAME_DESIGN.md §15): what the page opens on, before the game. One card over a still of the lake,
 * with three views: "New angler" (create an account), "I have an account" (log in) and, once this browser has a
 * login, "Logged in as … / Play". This file holds what it says and decides; `Game` wires it to the page and the server.
 */

/** The card's views. A browser with a saved login opens on `in` and joins by itself. */
export type HomeView = 'new' | 'login' | 'in';

/** Fewest characters in a new password, here and in Settings. The server checks again (`passProblem`, server/accounts.ts). */
export const PASS_MIN = 6;

/** How long the screen takes to fade to the live scene after Play (ms); `#join.leaving` in style.css runs the same time. */
export const HOME_FADE_MS = 350;

/**
 * sessionStorage: the page is reloading itself to get back in (a dropped connection, a redeploy, "Refresh to
 * reconnect"), so the load that follows enters by itself instead of waiting for Play.
 */
export const RECONNECT_KEY = 'fishing-reconnect';

/** sessionStorage: the page is reloading after a log-out, so it opens on "I have an account". */
export const LOGGED_OUT_KEY = 'fishing-logged-out';

/**
 * The view the card opens on. `name` and `auto` are this browser's `fishing-name` (saved on the first try to create
 * or log in) and `fishing-auto` (saved once a join worked, dropped when the server refuses the login).
 */
export function openingView(o: { name: string | null; auto: string | null; loggedOut?: boolean }): HomeView {
  if (o.loggedOut) return 'login';
  if (!o.name) return 'new';
  return o.auto ? 'in' : 'login';
}

/** Whether this load goes in without Play: it was flagged as a reconnect, and there is a saved login to go in with. */
export const entersByItself = (flag: string | null, view: HomeView): boolean => !!flag && view === 'in';

/** A typed name as the server will take it: letters, numbers, spaces and dashes, at most 16. */
export const cleanName = (raw: string): string => raw.replace(/[^\w \-]/g, '').trim().slice(0, 16);

export const NAME_HELP = 'Pick a name of 2-16 letters, numbers, spaces or dashes.';

/** Why a (cleaned) name can't be sent, or null. */
export const nameProblem = (name: string): string | null => (name.length < 2 ? NAME_HELP : null);

/** Why a new password can't be sent, or null. */
export const newPassProblem = (pass: string): string | null => (pass.length < PASS_MIN ? `Use at least ${PASS_MIN} characters.` : null);

/** "Create account", checked before anything is sent: the message and the field to put right, or null. */
export function createProblem(name: string, pass: string): { msg: string; field: 'name' | 'pass' } | null {
  const bad = nameProblem(name);
  if (bad) return { msg: bad, field: 'name' };
  const weak = newPassProblem(pass);
  return weak ? { msg: weak, field: 'pass' } : null;
}

/**
 * The signed-in view's one button: disabled until the server lets the player in (`connecting`) and the shaders are
 * warm (`loading`), then Play. `unreachable` offers another try; `reconnecting` goes in by itself.
 */
export type PlayState = 'connecting' | 'loading' | 'ready' | 'unreachable' | 'reconnecting';

export const PLAY_LABEL: Record<PlayState, string> = { connecting: 'Connecting…', loading: 'Loading…', ready: 'Play', unreachable: 'Try again', reconnecting: 'Reconnecting…' };

export const playEnabled = (s: PlayState): boolean => s === 'ready' || s === 'unreachable';

export const UNREACHABLE = "Can't reach the game server.";

/** "New angler"'s one line above its button, until a refusal takes its place. */
export const NEW_NOTE = 'Your name and password log you in on any device.';

/** The "What's new" button's count: nothing with none unread, "9+" past nine. */
export const unreadBadge = (n: number): string => (n <= 0 ? '' : n > 9 ? '9+' : String(n));

type Standing = Parameters<typeof welcomeGoal>[0];

/**
 * The signed-in view's text. `save` is the server's save, null until it arrives: the level, coins and goal are
 * never read from the browser's own offline save, which may be someone else's or years old.
 */
export function signedInHtml(name: string, save: Standing | null, charters = false): string {
  const lines = save ? `<p class="join-stats">${escapeHtml(standingText(save))}</p><p class="join-goal">${escapeHtml(welcomeGoal(save, charters))}</p>` : '<p class="join-stats"></p><p class="join-goal"></p>';
  return `<small class="join-as">Logged in as</small><h2 class="join-who">${escapeHtml(name)}</h2>${lines}`;
}

/** "Not NAME? Switch account", under Play. */
export const switchLabel = (name: string): string => `Not ${escapeHtml(name)}? Switch account`;

/** What logging out of an account with no password costs, for Settings and the home screen: nothing could log back in, so the server deletes it. */
export function logoutLossHtml(name: string, supporter: boolean): string {
  const n = escapeHtml(name);
  return `⚠️ ${n} has no password. Logging out deletes ${n} for good: its coins, level, gear, fish${supporter ? ', 💗' : ''} and everything else are lost, and anyone can take the name.`;
}

export const LOGOUT_KEEP = 'To keep it, set a password first. Then you can log back in any time.';

/** "Switch account" asks first, inside the card: a plain log-out with a password, the warning above without one. */
export function switchHtml(name: string, hasPass: boolean, supporter: boolean): string {
  const n = escapeHtml(name);
  const cancel = '<button type="button" class="btn plain" data-join="cancel">Cancel</button>';
  if (hasPass)
    return `<p>Log out of <b>${n}</b> on this browser? You'll need your name and password to come back.</p>
      <div class="join-acts"><button type="button" class="btn bad" data-join="logout">Log out</button>${cancel}</div>`;
  return `<p class="warn">${logoutLossHtml(name, supporter)}</p><p>${LOGOUT_KEEP}</p>
    <div class="join-acts col"><button type="button" class="btn ok" data-join="setpass">Set a password first…</button><button type="button" class="btn bad" data-join="logout">Delete ${n} and log out</button>${cancel}</div>`;
}

/** The "What's new" board as the home screen shows it, in place of the card: the whole board under a bar with the way back. */
export function homeBoardHtml(entries: readonly NewsEntry[], unread: readonly NewsEntry[]): string {
  return `<header class="board-bar"><button type="button" class="btn plain" data-join="back">← Back</button><h2>📰 What's new</h2></header><div class="board-list">${newsHtml(entries, unread)}</div>`;
}

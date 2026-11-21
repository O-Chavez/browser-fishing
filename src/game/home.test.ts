import { describe, expect, it } from 'vitest';
import type { NewsEntry } from '../data/news';
import { FISH } from '../data/content';
import { cleanName, createProblem, entersByItself, homeBoardHtml, logoutLossHtml, nameProblem, newPassProblem, openingView, PASS_MIN, PLAY_LABEL, playEnabled, signedInHtml, switchHtml, switchLabel, unreadBadge, type PlayState } from './home';

const fresh = { level: 1, xp: 0, coins: 20, dex: {} };
const played = { level: 42, xp: 10, coins: 18300, dex: { [FISH[0].id]: {} } };

describe('home screen', () => {
  it('opens on "New angler" in a browser that has never tried to join', () => {
    expect(openingView({ name: null, auto: null })).toBe('new');
    // A stray flag without a name is no login.
    expect(openingView({ name: null, auto: '1' })).toBe('new');
  });

  it('opens on "I have an account" with a saved name but no working login', () => {
    expect(openingView({ name: 'Ana', auto: null })).toBe('login');
    // After a log-out, whether the name was kept (a password) or went with the account.
    expect(openingView({ name: 'Ana', auto: null, loggedOut: true })).toBe('login');
    expect(openingView({ name: null, auto: null, loggedOut: true })).toBe('login');
  });

  it('opens signed in with a saved login', () => {
    expect(openingView({ name: 'Ana', auto: '1' })).toBe('in');
  });

  it('goes in without Play only on a flagged reconnect with a saved login', () => {
    expect(entersByItself('1', 'in')).toBe(true);
    expect(entersByItself(null, 'in')).toBe(false);
    // The login was dropped meanwhile: the form waits like any other visit.
    expect(entersByItself('1', 'login')).toBe(false);
    expect(entersByItself('1', 'new')).toBe(false);
  });

  it('cleans a typed name the way the server will', () => {
    expect(cleanName('  Big Fish  ')).toBe('Big Fish');
    expect(cleanName('<b>Ana</b>!')).toBe('bAnab');
    expect(cleanName('Jo-Ann_2')).toBe('Jo-Ann_2');
    expect(cleanName('x'.repeat(40))).toHaveLength(16);
  });

  it('checks the name, then the password, before "Create account" is sent', () => {
    expect(createProblem('A', 'secret1')).toEqual({ msg: 'Pick a name of 2-16 letters, numbers, spaces or dashes.', field: 'name' });
    expect(createProblem('Ana', 'x'.repeat(PASS_MIN - 1))).toEqual({ msg: 'Use at least 6 characters.', field: 'pass' });
    expect(createProblem('Ana', 'x'.repeat(PASS_MIN))).toBeNull();
    // Both wrong: the name comes first, as it does on the card.
    expect(createProblem('', '')?.field).toBe('name');
    expect(nameProblem('Jo')).toBeNull();
    expect(newPassProblem('')).toBe('Use at least 6 characters.');
  });

  it('keeps Play disabled until the player is in and the scene is ready', () => {
    const states: PlayState[] = ['connecting', 'loading', 'ready', 'unreachable', 'reconnecting'];
    expect(states.filter(playEnabled)).toEqual(['ready', 'unreachable']);
    expect(PLAY_LABEL.ready).toBe('Play');
    expect(PLAY_LABEL.unreachable).toBe('Try again');
  });

  it('counts unread news up to "9+"', () => {
    expect(unreadBadge(0)).toBe('');
    expect(unreadBadge(1)).toBe('1');
    expect(unreadBadge(9)).toBe('9');
    expect(unreadBadge(10)).toBe('9+');
    expect(unreadBadge(42)).toBe('9+');
  });

  it("says who is logged in, and where they stand once the server's save is here", () => {
    const waiting = signedInHtml('Ana', null);
    expect(waiting).toContain('Logged in as');
    expect(waiting).toContain('<h2 class="join-who">Ana</h2>');
    expect(waiting).not.toContain('Lv ');
    const here = signedInHtml('Ana', played);
    expect(here).toContain('Lv 42 · 18,300 coins');
    expect(here).toContain('Next goal: Lv 45 ');
    expect(signedInHtml('Ana', played, true)).toContain('Next goal: a charter with Captain Reed');
    expect(signedInHtml('Ana', fresh)).toContain('First goal: catch a fish, then sell it at the stall');
  });

  it('escapes the name wherever it is shown', () => {
    const name = '<img src=x onerror=1>"';
    for (const html of [signedInHtml(name, null), switchLabel(name), switchHtml(name, true, false), switchHtml(name, false, false), logoutLossHtml(name, false)]) {
      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;img src=x onerror=1&gt;&quot;');
    }
  });

  it('asks before logging out of an account with a password', () => {
    const html = switchHtml('Ana', true, false);
    expect(html).toContain("Log out of <b>Ana</b> on this browser? You'll need your name and password to come back.");
    expect(html).toContain('data-join="logout">Log out<');
    expect(html).toContain('data-join="cancel"');
    expect(html).not.toContain('data-join="setpass"');
  });

  it('warns that logging out of an account with no password deletes it, and offers a password first', () => {
    const html = switchHtml('Ana', false, false);
    expect(html).toContain('Ana has no password. Logging out deletes Ana for good');
    expect(html).not.toContain('💗');
    expect(html.indexOf('data-join="setpass"')).toBeLessThan(html.indexOf('data-join="logout"'));
    expect(html).toContain('>Delete Ana and log out<');
    expect(html).toContain('data-join="cancel"');
    // A supporter's heart goes with the account too.
    expect(switchHtml('Ana', false, true)).toContain('fish, 💗 and everything else');
  });

  it('shows the whole board under a way back, with the unread entries marked', () => {
    const entry = (id: number): NewsEntry => ({ id, date: '2026-11-01', title: `Feature ${id}`, body: ['Something new.'] });
    const list = [entry(3), entry(2), entry(1)];
    const html = homeBoardHtml(list, [list[0]]);
    expect(html.indexOf('data-join="back"')).toBeLessThan(html.indexOf('<article'));
    expect(html.match(/<article/g)).toHaveLength(3);
    expect(html.match(/news-new/g)).toHaveLength(1);
  });
});

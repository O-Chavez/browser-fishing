import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/data/maps';
import type { ServerMsg } from '../src/net/protocol';
import { AccountStore } from './accounts';
import { DevGate, TIMES } from './dev';
import { Room } from './room';

describe('DevGate', () => {
  it('is off without credentials', () => {
    const g = new DevGate();
    expect(g.enabled).toBe(false);
    expect(g.login('Ann', '', '')).toMatch(/off/);
  });

  it('locks an account out after repeated failures, then lets it try again later', () => {
    let now = 0;
    const g = new DevGate({ user: 'admin', pass: 'hunter2' }, () => now);
    for (let i = 0; i < 5; i++) expect(g.login('Ann', 'admin', 'nope')).toMatch(/Wrong/);
    expect(g.login('Ann', 'admin', 'hunter2')).toMatch(/Too many/);
    expect(g.login('Bob', 'admin', 'hunter2')).toBeNull();
    now += 15 * 60_000;
    expect(g.login('Ann', 'admin', 'hunter2')).toBeNull();
  });

  it('locks everyone out after too many failures across accounts', () => {
    const g = new DevGate({ user: 'admin', pass: 'hunter2' }, () => 0);
    for (let i = 0; i < 30; i++) g.login(`acct${i}`, 'x', 'y');
    expect(g.login('Fresh', 'admin', 'hunter2')).toMatch(/Too many/);
  });
});

describe('dev commands in a room', () => {
  const setup = () => {
    const store = new AccountStore();
    const room = new Room('r', MAPS);
    room.devGate = new DevGate({ user: 'admin', pass: 'hunter2' });
    const join = (name: string) => {
      const res = store.auth(name, 'token-token-token-' + name);
      if (!res.ok) throw new Error(res.msg);
      const log: ServerMsg[] = [];
      const id = room.join({ send: (m) => log.push(m) }, res.account);
      return { id, log, save: res.account.save };
    };
    const devLines = (log: ServerMsg[]) => log.flatMap((m) => (m.t === 'dev' ? m.lines : []));
    return { room, join, devLines };
  };

  it('needs a login, and never shows commands to other players', () => {
    const { room, join, devLines } = setup();
    const a = join('Ann');
    const b = join('Bob');
    room.handle(a.id, { t: 'cmd', text: '/coins 9999' });
    expect(a.save.coins).toBe(20);
    expect(devLines(a.log).at(-1)).toMatch(/\/bug/);
    room.handle(a.id, { t: 'cmd', text: '/login admin hunter2' });
    room.handle(a.id, { t: 'cmd', text: '/coins 9999' });
    expect(a.save.coins).toBe(9999);
    expect([...a.log].reverse().find((m) => m.t === 'state')).toMatchObject({ save: { coins: 9999 } });
    expect(b.log.some((m) => m.t === 'dev' || (m.t === 'chat' && m.text.includes('/')))).toBe(false);
    room.handle(a.id, { t: 'cmd', text: '/logout' });
    room.handle(a.id, { t: 'cmd', text: '/coins 1' });
    expect(a.save.coins).toBe(9999);
  });

  it('gives items, sets level, teleports and overrides the time', () => {
    const { room, join, devLines } = setup();
    const a = join('Ann');
    const b = join('Bob');
    room.handle(a.id, { t: 'cmd', text: '/login admin hunter2' });
    room.handle(a.id, { t: 'cmd', text: '/level 20' });
    room.handle(a.id, { t: 'cmd', text: '/bait pearl 10' });
    room.handle(a.id, { t: 'cmd', text: '/fish koi 30 shiny' });
    room.handle(a.id, { t: 'cmd', text: '/rod graphite' });
    expect(a.save.level).toBe(20);
    expect(a.save.slots.some((s) => s?.k === 'bait' && s.id === 'pearl')).toBe(true);
    expect(a.save.slots.some((s) => s?.k === 'fish' && s.fishId === 'koi' && s.shiny)).toBe(true);
    expect(a.save.slots.some((s) => s?.k === 'rod' && s.id === 'graphite')).toBe(true);
    const casino = MAPS.find((m) => m.casino)!;
    room.handle(a.id, { t: 'cmd', text: `/tp ${casino.id}` });
    expect(a.save.location).toBe(casino.id);
    room.handle(a.id, { t: 'cmd', text: '/time night' });
    expect(a.log.at(-1)).toMatchObject({ t: 'dev', time: TIMES.night });
    // Only the player who typed it sees the new time.
    expect(b.log.some((m) => m.t === 'dev')).toBe(false);
    room.handle(a.id, { t: 'cmd', text: '/fish nope' });
    expect(devLines(a.log).at(-1)).toMatch(/Fish ids:/);
  });

  it('starts a dive at any depth, only for them, which waits for them on a quick rejoin', () => {
    const { room, join, devLines } = setup();
    const a = join('Ann');
    const b = join('Bob');
    room.handle(a.id, { t: 'cmd', text: '/login admin hunter2' });
    room.handle(a.id, { t: 'cmd', text: '/sea 20' });
    expect(a.save.location).toBe('sea');
    // The depth reaches the client before the save that moves it, so the sea is built at that depth.
    const dive = a.log.findIndex((m) => m.t === 'divestate' && m.dive.depth === 20);
    const dev = a.log.findIndex((m) => m.t === 'dev' && m.depth === 20);
    const state = a.log.findIndex((m) => m.t === 'state' && m.save.location === 'sea');
    expect(dive).toBeGreaterThanOrEqual(0);
    expect(dev).toBeGreaterThanOrEqual(0);
    expect(state).toBeGreaterThan(Math.max(dive, dev));
    expect(devLines(a.log).at(-1)).toBe('Diving from The Drop-off, depth 20.');
    expect(b.log.some((m) => m.t === 'dev' || m.t === 'divestate')).toBe(false);
    // Again at sea: a fresh dive at the new depth.
    room.handle(a.id, { t: 'cmd', text: '/sea' });
    expect(a.log.filter((m) => m.t === 'divestate').at(-1)).toMatchObject({ dive: { depth: 1, start: 1, line: 300 } });
    room.handle(a.id, { t: 'cmd', text: '/sea deep' });
    expect(devLines(a.log).at(-1)).toMatch(/Usage/);
    room.handle(a.id, { t: 'cmd', text: '/ledge up' });
    expect(devLines(a.log).at(-1)).toBe("You're not at a ledge.");
    // The pond's gate doesn't lead to the sea, and a player who drops out comes back to the dive.
    room.handle(a.id, { t: 'travel', to: 'pond' });
    expect(a.save.location).toBe('sea');
    room.leave(a.id);
    const again = join('Ann');
    expect(again.save.location).toBe('sea');
    expect(again.log.find((m) => m.t === 'welcome')).toMatchObject({ dive: { depth: 1 } });
    // Leaving the sea with /tp leaves the dive too.
    room.handle(again.id, { t: 'cmd', text: '/login admin hunter2' });
    room.handle(again.id, { t: 'cmd', text: '/tp pond' });
    room.leave(again.id);
    expect(join('Ann').save.location).toBe('pond');
  });

  it('places a player with /goto: dev only, or silently on a test server', () => {
    const { room, join, devLines } = setup();
    const a = join('Ann');
    room.handle(a.id, { t: 'cmd', text: '/goto 30 -40' });
    expect(devLines(a.log).at(-1)).toMatch(/Unknown command/);
    room.testHooks = true;
    a.log.length = 0;
    room.handle(a.id, { t: 'cmd', text: '/goto 30 -40' });
    expect(devLines(a.log)).toEqual([]);
    // The server now has them there: a short step from it isn't sent back.
    room.handle(a.id, { t: 'pos', x: 31, z: -40, yaw: 0 });
    expect(a.log.some((m) => m.t === 'pos')).toBe(false);
  });

  it('stocks the Pantry and finishes the smoker', () => {
    const { room, join, devLines } = setup();
    const a = join('Ann');
    room.handle(a.id, { t: 'cmd', text: '/login admin hunter2' });
    room.handle(a.id, { t: 'cmd', text: '/smoke perch 2' });
    expect(a.save.smoke.pantry.perch).toHaveLength(2);
    room.handle(a.id, { t: 'cmd', text: '/smoke' });
    expect(devLines(a.log).at(-1)).toBe('Nothing is on the smoker.');
    a.save.smoke.spots[1] = { fish: { k: 'fish', fishId: 'pike', size: 60 }, doneAt: Date.now() + 3_600_000 };
    room.handle(a.id, { t: 'cmd', text: '/smoke' });
    room.snapshot();
    expect(a.save.smoke.spots[1]).toBeNull();
    expect(a.save.smoke.pantry.pike).toHaveLength(1);
  });

  it('stocks cooked dishes and reports the Smokehouse stats', () => {
    const { room, join, devLines } = setup();
    const a = join('Ann');
    room.handle(a.id, { t: 'cmd', text: '/login admin hunter2' });
    room.handle(a.id, { t: 'cmd', text: '/dish banquet 3' });
    room.handle(a.id, { t: 'cmd', text: '/dish supper' });
    expect(a.save.smoke.cooked).toEqual([{ id: 'banquet', n: 3 }, { id: 'supper', n: 1 }]);
    expect(devLines(a.log).at(-1)).toBe("Added 1 Angler's Supper to your Pantry.");
    room.handle(a.id, { t: 'cmd', text: '/dish stew' });
    expect(devLines(a.log).at(-1)).toMatch(/^Dish ids: fishcakes/);
    room.handle(a.id, { t: 'cmd', text: '/smokestats' });
    expect(devLines(a.log).at(-1)).toBe('No Smokehouse stats on this server.');
  });
});

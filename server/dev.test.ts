import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/data/maps';
import type { ServerMsg } from '../src/net/protocol';
import { AccountStore } from './accounts';
import { DevGate, TIMES } from './dev';
import { lakeReport } from './lakestats';
import { markTip } from '../src/game/tips';
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
    room.handle(a.id, { t: 'cmd', text: '/pearls 300' });
    room.handle(a.id, { t: 'cmd', text: '/rodstep 5' });
    room.handle(a.id, { t: 'cmd', text: '/abysslevel 3' });
    room.handle(a.id, { t: 'cmd', text: '/boat 2' });
    expect(a.save).toMatchObject({ pearls: 300, rodStep: 5, abyssLevels: 3, boatParts: 2 });
    expect(devLines(a.log).at(-1)).toBe('Boat parts set to 2: Kelp Deep and nearer open.');
    room.handle(a.id, { t: 'cmd', text: '/hold 3' });
    expect(a.save.holdLevel).toBe(3);
    expect(devLines(a.log).at(-1)).toBe('Hold set to level 3: 25 fish a charter.');
    room.handle(a.id, { t: 'cmd', text: '/hold' });
    expect(devLines(a.log).at(-1)).toBe('Usage: /hold 0-4');
    // Steps and parts stay in range; the old level commands are gone.
    room.handle(a.id, { t: 'cmd', text: '/rodstep 12' });
    room.handle(a.id, { t: 'cmd', text: '/boat 9' });
    room.handle(a.id, { t: 'cmd', text: '/hold 7' });
    expect(a.save).toMatchObject({ rodStep: 8, boatParts: 4, holdLevel: 4 });
    room.handle(a.id, { t: 'cmd', text: '/rodstep' });
    expect(devLines(a.log).at(-1)).toBe('Usage: /rodstep 0-8');
    room.handle(a.id, { t: 'cmd', text: '/rodlevel 12' });
    expect(devLines(a.log).at(-1)).toMatch(/Unknown command \/rodlevel/);
    room.handle(a.id, { t: 'cmd', text: '/linelevel 7' });
    expect(devLines(a.log).at(-1)).toMatch(/Unknown command \/linelevel/);
    room.handle(a.id, { t: 'cmd', text: '/help' });
    const help = a.log.filter((m) => m.t === 'dev').at(-1)!;
    const lines = (help as { lines: string[] }).lines.join('\n');
    for (const c of ['/rodstep 0-8', '/abysslevel N', '/hold 0-4', '/fill', '/boat 0-4', '/sea <zone 0-4> [marker]']) expect(lines).toContain(c);
    expect(lines).not.toMatch(/rodlevel|linelevel|ledge/);
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

  it('starts a charter in any zone and Abyss marker, with no fee, only for them, which waits for them on a quick rejoin', () => {
    const { room, join, devLines } = setup();
    const a = join('Ann');
    const b = join('Bob');
    room.handle(a.id, { t: 'cmd', text: '/login admin hunter2' });
    a.save.coins = 7;
    // Kelp Deep isn't open to Ann, and its fee isn't paid: the console sails anyway, with her hold.
    room.handle(a.id, { t: 'cmd', text: '/sea 2' });
    expect(a.save.location).toBe('sea');
    expect(a.save.coins).toBe(7);
    expect(a.log.find((m) => m.t === 'divestate')).toMatchObject({ dive: { zone: 2, hold: 10, fee: 14_000, tally: { fee: 0 } } });
    // The charter reaches the client before the save that moves it, so the sea is built for its zone.
    const dive = a.log.findIndex((m) => m.t === 'divestate' && m.dive.zone === 2);
    const dev = a.log.findIndex((m) => m.t === 'dev' && m.depth === 48);
    const state = a.log.findIndex((m) => m.t === 'state' && m.save.location === 'sea');
    expect(dive).toBeGreaterThanOrEqual(0);
    expect(dev).toBeGreaterThanOrEqual(0);
    expect(state).toBeGreaterThan(Math.max(dive, dev));
    expect(devLines(a.log).at(-1)).toBe('Sailing to Kelp Deep.');
    expect(b.log.some((m) => m.t === 'dev' || m.t === 'divestate')).toBe(false);
    // Again at sea: a fresh charter, in the Abyss at marker 12, which counts as reached.
    room.handle(a.id, { t: 'cmd', text: '/sea 4 12' });
    expect(a.log.filter((m) => m.t === 'divestate').at(-1)).toMatchObject({ dive: { zone: 4, marker: 12, hold: 10, state: 'fishing' } });
    expect(a.log.filter((m) => m.t === 'dev').at(-1)).toMatchObject({ depth: 133 });
    expect(devLines(a.log).at(-1)).toBe('Sailing to The Abyss, marker 12.');
    expect(a.save.abyssRecord).toBe(12);
    // /fill leaves the hold one fish short of full, landed count only; nothing else in the tally moves.
    room.handle(a.id, { t: 'cmd', text: '/fill' });
    expect(a.log.filter((m) => m.t === 'divestate').at(-1)).toMatchObject({ dive: { hold: 10, state: 'fishing', tally: { landed: 9, pearls: 0, coins: 0 } } });
    expect(devLines(a.log).at(-1)).toBe('The hold is one fish short of full.');
    // A marker only counts in the Abyss.
    room.handle(a.id, { t: 'cmd', text: '/sea 1 5' });
    expect(a.log.filter((m) => m.t === 'divestate').at(-1)).toMatchObject({ dive: { zone: 1, marker: 0 } });
    for (const bad of ['/sea', '/sea deep', '/sea 4 x']) {
      room.handle(a.id, { t: 'cmd', text: bad });
      expect(devLines(a.log).at(-1), bad).toMatch(/Usage/);
    }
    room.handle(a.id, { t: 'cmd', text: '/sea 0' });
    // The pond's gate doesn't lead to the sea, and a player who drops out comes back to the charter.
    room.handle(a.id, { t: 'travel', to: 'pond' });
    expect(a.save.location).toBe('sea');
    room.leave(a.id);
    const again = join('Ann');
    expect(again.save.location).toBe('sea');
    expect(again.log.find((m) => m.t === 'welcome')).toMatchObject({ dive: { zone: 0, marker: 0 } });
    // Leaving the sea with /tp leaves the charter too.
    room.handle(again.id, { t: 'cmd', text: '/login admin hunter2' });
    room.handle(again.id, { t: 'cmd', text: '/tp pond' });
    room.handle(again.id, { t: 'cmd', text: '/fill' });
    expect(devLines(again.log).at(-1)).toBe('Not on a charter that is fishing.');
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

  it('clears the new-player tips so they show again, and says so when there are none', () => {
    const { room, join, devLines } = setup();
    const a = join('Ann');
    room.handle(a.id, { t: 'cmd', text: '/login admin hunter2' });
    room.handle(a.id, { t: 'cmd', text: '/tips' });
    expect(devLines(a.log).at(-1)).toBe('No new-player tips are marked as seen.');
    markTip(a.save, 'start');
    markTip(a.save, 'reel');
    room.handle(a.id, { t: 'cmd', text: '/tips' });
    expect(a.save.tips).toEqual([]);
    expect(devLines(a.log).at(-1)).toBe('New-player tips reset: they show again.');
    // The client gets the cleared list, so it shows the tips again.
    expect([...a.log].reverse().find((m) => m.t === 'state')).toMatchObject({ save: { tips: [] } });
    expect(markTip(a.save, 'start')).toBe(true);
  });

  it("sets a sea legend's landings with /landed, unlocking its set's pieces up to there and taking back bought ones past it", () => {
    const { room, join, devLines } = setup();
    const a = join('Ann');
    const b = join('Bob');
    room.handle(a.id, { t: 'cmd', text: '/login admin hunter2' });
    room.handle(a.id, { t: 'cmd', text: '/landed kraken 3' });
    expect(a.save.legends).toEqual({ kraken: 3 });
    // Unlocked to buy at Reed's, not given.
    expect(a.save.owned).toEqual([]);
    expect(devLines(a.log).at(-1)).toBe("The Kraken landed 3 times: 3 of 4 pieces of its set unlocked at Reed's.");
    expect([...a.log].reverse().find((m) => m.t === 'state')).toMatchObject({ save: { legends: { kraken: 3 } } });
    a.save.owned.push('krakencrown', 'krakenarmor', 'cap');
    room.handle(a.id, { t: 'equip', slot: 'shirt', id: 'krakenarmor' });
    room.handle(a.id, { t: 'cmd', text: '/landed kraken 1' });
    expect(a.save.owned).toEqual(['krakencrown', 'cap']);
    // The piece taken back comes off, for everyone.
    expect(a.save.look.shirt).toBeNull();
    expect([...b.log].reverse().find((m) => m.t === 'look')).toMatchObject({ look: { shirt: null } });
    room.handle(a.id, { t: 'cmd', text: '/landed kraken 0' });
    expect(a.save.legends).toEqual({});
    expect(a.save.owned).toEqual(['cap']);
    room.handle(a.id, { t: 'cmd', text: '/landed leviathan 2' });
    expect(a.save.legends).toEqual({ leviathan: 2 });
    expect(devLines(a.log).at(-1)).toBe('The Leviathan landed 2 times (it has no set yet).');
    for (const bad of ['/landed minnow 2', '/landed kraken', '/landed']) {
      room.handle(a.id, { t: 'cmd', text: bad });
      expect(devLines(a.log).at(-1)).toMatch(/^Usage: \/landed <legend> N · legends: grouper/);
    }
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

describe('/lakestats', () => {
  const run = (store: AccountStore) => {
    const room = new Room('r', MAPS);
    room.devGate = new DevGate({ user: 'admin', pass: 'hunter2' });
    room.lakeReport = () => lakeReport(store.lakeRows());
    const res = store.auth('Dev', 'token-token-token-Dev');
    if (!res.ok) throw new Error(res.msg);
    const log: ServerMsg[] = [];
    const id = room.join({ send: (m) => log.push(m) }, res.account);
    room.handle(id, { t: 'cmd', text: '/login admin hunter2' });
    log.length = 0;
    room.handle(id, { t: 'cmd', text: '/lakestats' });
    return log.flatMap((m) => (m.t === 'dev' ? m.lines : []));
  };

  it('says so when nobody has anything to report', () => {
    expect(run(new AccountStore())).toEqual(['No lake stats yet: nobody has turned in a fish, bought a lure or gone on a charter.']);
  });

  it('works out the rates for a hand-worked case, with a total', () => {
    // Ann: 2 lake hours, 1,140 chips = 570 an hour. 60 sea casts, 45 lured, 1.5 sea hours, 300 pearls = 200 an hour.
    const ann = { lakeSec: 7200, seaSec: 5400, chips: 1140, bought: 90, lakeLures: 60, seaLures: 45, seaHooks: 60, pearls: 300 };
    // Bob: a quarter hour, 100 chips = 400 an hour, never sailed (no sea rates to divide).
    const bob = { lakeSec: 900, chips: 100 };
    // Cy only watched: no chips, no lures, no charter, so no line.
    const cy = { lakeSec: 3600 };
    const rows = [{ name: 'Ann', lake: ann }, { name: 'Bob', lake: bob as never }, { name: 'Cy', lake: cy as never }, { name: 'Old' }];
    expect(lakeReport(rows)).toEqual([
      '🎣 Lake stats (counted since they shipped):',
      'Ann: lake 2h · 1140 chips (570/h) · lures 90 bought, 60 lake, 45 sea · sea 1.5h · 75% lured · 200 pearls/h',
      'Bob: lake 0.3h · 100 chips (400/h) · lures 0 bought, 0 lake, 0 sea · sea 0h · -% lured · - pearls/h',
      'All 2: lake 2.3h · 1240 chips (551/h) · lures 90 bought, 60 lake, 45 sea · sea 1.5h · 75% lured · 200 pearls/h',
    ]);
  });

  it('guards every division by zero', () => {
    const [, ann, total] = lakeReport([{ name: 'Ann', lake: { lakeSec: 0, seaSec: 0, chips: 0, bought: 3, lakeLures: 0, seaLures: 0, seaHooks: 0, pearls: 0 } }]);
    expect(ann).toBe('Ann: lake 0h · 0 chips (-/h) · lures 3 bought, 0 lake, 0 sea · sea 0h · -% lured · - pearls/h');
    expect(total).toMatch(/^All 1: /);
  });

  it('loads an account saved before the counters, and prints it once it has counted', () => {
    const old = new AccountStore({ ann: { name: 'Ann', tokens: ['x'], save: {} }, bob: { name: 'Bob', tokens: ['y'], lake: { chips: 'lots', lakeSec: -5, bought: 6, bogus: 1 }, save: {} } });
    expect(old.lakeRows()).toEqual([{ name: 'Ann', lake: undefined }, { name: 'Bob', lake: { lakeSec: 0, seaSec: 0, chips: 0, bought: 6, lakeLures: 0, seaLures: 0, seaHooks: 0, pearls: 0 } }]);
    expect(run(old)).toEqual([
      '🎣 Lake stats (counted since they shipped):',
      'Bob: lake 0h · 0 chips (-/h) · lures 6 bought, 0 lake, 0 sea · sea 0h · -% lured · - pearls/h',
      'All 1: lake 0h · 0 chips (-/h) · lures 6 bought, 0 lake, 0 sea · sea 0h · -% lured · - pearls/h',
    ]);
  });

  it('keeps the counters through a save and load, and out of the save data', () => {
    const store = new AccountStore();
    const res = store.auth('Ann', 'token-token-token-Ann');
    if (!res.ok) throw new Error(res.msg);
    res.account.lake = { lakeSec: 10, seaSec: 0, chips: 5, bought: 3, lakeLures: 1, seaLures: 0, seaHooks: 0, pearls: 0 };
    const again = new AccountStore(store.snapshot());
    expect(again.lakeRows()[0].lake).toEqual(res.account.lake);
    expect(res.account.save).not.toHaveProperty('lake');
  });
});

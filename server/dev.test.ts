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
    room.handle(a.id, { t: 'cmd', text: '/fish nope' });
    expect(devLines(a.log).at(-1)).toMatch(/Fish ids:/);
  });
});

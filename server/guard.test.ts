import { describe, expect, it } from 'vitest';
import { CASINO_LEVEL } from '../src/data/casino';
import { FISH } from '../src/data/content';
import { MAPS } from '../src/data/maps';
import type { ServerMsg } from '../src/net/protocol';
import { AccountStore } from './accounts';
import { guarded } from './guard';
import { Room } from './room';

describe('per-message guard', () => {
  it('logs a throwing handler with who and the message type, and keeps going', () => {
    const logs: unknown[][] = [];
    expect(() =>
      guarded('#3 Ann', { t: 'slot' }, () => {
        throw new Error('boom');
      }, (...a) => logs.push(a)),
    ).not.toThrow();
    expect(logs).toHaveLength(1);
    expect(String(logs[0][0])).toContain('#3 Ann');
    expect(String(logs[0][0])).toContain('t=slot');
  });

  it('does not log the payload, and survives a non-string type', () => {
    const logs: unknown[][] = [];
    guarded('#1 Bo', { t: { toString: null }, big: 'x'.repeat(5000) } as never, () => { throw new Error('x'); }, (...a) => logs.push(a));
    expect(String(logs[0][0])).not.toContain('xxxx');
    expect(String(logs[0][0])).toContain('t=object');
  });

  it('runs a fine handler once, silently', () => {
    let n = 0;
    guarded('#1 Bo', { t: 'pos' }, () => n++, () => { throw new Error('should not log'); });
    expect(n).toBe(1);
  });
});

const casinoMap = MAPS.find((m) => m.id === 'casino')!;

describe('hostile ids', () => {
  const hostile = { toString: null } as never;
  const setup = (location = 'pond') => {
    const store = new AccountStore();
    const room = new Room('r', MAPS, () => {}, () => 1_000_000, () => 0.5);
    const res = store.auth('Ann', 'token-token-token-Ann');
    if (!res.ok) throw new Error(res.msg);
    res.account.save.level = CASINO_LEVEL;
    res.account.save.location = location;
    res.account.save.slots[0] = { k: 'fish', fishId: FISH[0].id, size: FISH[0].maxSize };
    const log: ServerMsg[] = [];
    const id = room.join({ send: (m: ServerMsg) => log.push(m) }, res.account);
    return { room, id, save: res.account.save };
  };
  const spots = { sell: MAPS[0].vendor.shop, roulette: casinoMap.casino!.roulette, wheel: casinoMap.casino!.wheel, bj: casinoMap.casino!.blackjack, cashout: casinoMap.casino!.prizes } as Record<string, { x: number; z: number }>;
  const cases = ['slot', 'sell', 'roulette', 'cashout', 'wheel', 'bj', 'color', 'pickup'] as const;
  for (const t of cases) {
    it(`${t} takes an object with no toString without throwing`, () => {
      const { room, id } = setup(t === 'sell' || t === 'slot' || t === 'color' || t === 'pickup' ? 'pond' : 'casino');
      // The money handlers only look at the id once the player stands at the counter.
      const at = spots[t];
      if (at) room.place(id, at.x + (t === 'sell' ? -2 : 0), at.z, 0);
      const msg = { t, i: hostile, id: hostile, color: hostile, bet: 'red', a: 'deal' } as never;
      expect(() => room.handle(id, msg)).not.toThrow();
    });
  }
  it('join takes a hostile body colour', () => {
    const store = new AccountStore();
    const room = new Room('r', MAPS);
    const res = store.auth('Bo', 'token-token-token-Bo');
    if (!res.ok) throw new Error(res.msg);
    expect(() => room.join({ send: () => {} }, res.account, hostile)).not.toThrow();
  });
});

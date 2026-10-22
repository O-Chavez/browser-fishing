import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/data/maps';
import type { ServerMsg } from '../src/net/protocol';
import { AccountStore } from './accounts';
import { DevGate } from './dev';
import { matchTip, parseKofi, tipMessage, type KofiTip } from './kofi';
import { Room } from './room';

const TOKEN = 'kofi-secret-token';
const body = (data: object) => new URLSearchParams({ data: JSON.stringify(data) }).toString();
const sample = {
  verification_token: TOKEN,
  message_id: 'm-1',
  type: 'Donation',
  is_public: true,
  from_name: 'Jo Example',
  message: 'Love it! My name is Ann',
  amount: '3.00',
  currency: 'USD',
  email: 'jo@example.com',
  kofi_transaction_id: 'tx-1',
};
const tip = (over: Partial<KofiTip> = {}): KofiTip => ({ id: 'm', type: 'Donation', fromName: '', message: '', amount: '3.00', currency: 'USD', ...over });

describe('parseKofi', () => {
  it('reads a Ko-fi webhook body, without the email', () => {
    const t = parseKofi(body(sample), TOKEN);
    expect(t).toEqual({ id: 'm-1', type: 'Donation', fromName: 'Jo Example', message: 'Love it! My name is Ann', amount: '3.00', currency: 'USD' });
  });

  it('turns away a wrong or missing token, and anything that is not a webhook', () => {
    expect(parseKofi(body({ ...sample, verification_token: 'guess' }), TOKEN)).toBeNull();
    expect(parseKofi(body({ ...sample, verification_token: undefined }), TOKEN)).toBeNull();
    expect(parseKofi(body(sample), '')).toBeNull();
    expect(parseKofi('data=not-json', TOKEN)).toBeNull();
    expect(parseKofi('', TOKEN)).toBeNull();
    expect(parseKofi(body([1, 2]), TOKEN)).toBeNull();
  });
});

describe('matchTip', () => {
  const names = ['Ann', 'Ann Lee', 'Bob', 'Jo Example', 'Fish'];

  it('finds a name written in the message, as a whole word and in any case', () => {
    expect(matchTip(tip({ message: 'for ann, thanks!' }), names)).toBe('Ann');
    expect(matchTip(tip({ message: 'I play as Ann Lee' }), names)).toBe('Ann Lee');
    expect(matchTip(tip({ message: 'Annabel here' }), names)).toBeNull();
    expect(matchTip(tip({ message: 'Bobby' }), names)).toBeNull();
  });

  it('matches nobody when the message names several players', () => {
    expect(matchTip(tip({ message: 'from Ann and Bob' }), names)).toBeNull();
  });

  it('falls back to the Ko-fi name when the message has no Lakeside name', () => {
    expect(matchTip(tip({ message: 'great game', fromName: 'Jo Example' }), names)).toBe('Jo Example');
    expect(matchTip(tip({ message: 'Bob', fromName: 'Jo Example' }), names)).toBe('Bob');
    expect(matchTip(tip({ message: '', fromName: 'Someone' }), names)).toBeNull();
  });
});

describe('tipMessage', () => {
  it('says who tipped, what they wrote and who got the heart, without pinging anyone', () => {
    const msg = tipMessage(tip({ fromName: 'Jo_Ex', message: 'go @everyone\nline two' }), 'Ann');
    expect(msg).toContain('**3.00 USD** tip from **Jo\\_Ex**');
    expect(msg).toContain('> go @everyone\n> line two');
    expect(msg).toContain('given to **Ann**');
    expect(tipMessage(tip({ type: 'Subscription' }), null)).toMatch(/subscription from \*\*someone\*\*[\s\S]*\/supporter <name>/);
  });
});

describe('supporters', () => {
  const store = () => {
    const s = new AccountStore();
    for (const [n, t] of [['Ann', 'a'], ['Bob', 'b'], ['Oscar', 'o']]) s.auth(n, t.repeat(20));
    return s;
  };

  it('are kept outside the save, newest first, and survive a reload', () => {
    const s = store();
    expect(s.setSupporter('ann', true, 100)?.name).toBe('Ann');
    s.setSupporter('Bob', true, 200);
    s.setSupporter('Ann', true, 300);
    expect(s.supporters()).toEqual(['Bob', 'Ann']);
    expect(s.setSupporter('Nobody', true)).toBeNull();
    const back = new AccountStore(JSON.parse(JSON.stringify(s.snapshot())));
    expect(back.supporters()).toEqual(['Bob', 'Ann']);
    back.setSupporter('Bob', false);
    expect(back.supporters()).toEqual(['Ann']);
  });

  it('reach a new joiner, and the dev console gives or takes the heart', () => {
    const s = store();
    s.setSupporter('Bob', true);
    const room = new Room('r', MAPS);
    room.devGate = new DevGate({ user: 'admin', pass: 'hunter2' });
    room.supporters = () => s.supporters();
    room.setSupporter = (name, on) => {
      const acct = s.setSupporter(name, on);
      if (!acct) return 'none';
      room.supportersChanged(acct, on, s.supporters());
      return 'done';
    };
    const ann = s.auth('Ann', 'a'.repeat(20));
    const dev = s.auth('Oscar', 'o'.repeat(20));
    if (!ann.ok || !dev.ok) throw new Error('auth');
    const annLog: ServerMsg[] = [];
    const devLog: ServerMsg[] = [];
    room.join({ send: (m) => annLog.push(m) }, ann.account);
    expect(annLog).toContainEqual({ t: 'supporters', names: ['Bob'] });
    const id = room.join({ send: (m) => devLog.push(m) }, dev.account);
    room.handle(id, { t: 'cmd', text: '/supporter Ann' });
    expect(devLog.at(-1)).toMatchObject({ t: 'dev', lines: [expect.stringContaining('Unknown')] });
    room.handle(id, { t: 'cmd', text: '/login admin hunter2' });
    room.handle(id, { t: 'cmd', text: '/supporter Ann' });
    expect(s.supporters()).toContain('Ann');
    expect(annLog.at(-1)).toEqual({ t: 'notice', msg: '💗 Thank you for supporting Lakeside!' });
    expect(annLog.at(-2)).toEqual({ t: 'supporters', names: s.supporters() });
    room.handle(id, { t: 'cmd', text: '/supporter Ann off' });
    expect(s.supporters()).toEqual(['Bob']);
    expect(annLog.at(-1)).toEqual({ t: 'supporters', names: ['Bob'] });
    room.handle(id, { t: 'cmd', text: '/supporter' });
    expect(devLog.at(-1)).toMatchObject({ lines: ['Usage: /supporter <name> [off]'] });
  });
});

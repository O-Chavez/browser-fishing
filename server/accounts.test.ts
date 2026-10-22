import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/data/maps';
import type { ServerMsg } from '../src/net/protocol';
import { AccountStore, MAX_DEVICES } from './accounts';
import { DevGate } from './dev';
import { Room } from './room';

const A = 'a'.repeat(20);
const B = 'b'.repeat(20);

const claimed = (name = 'Ann', token = A) => {
  const store = new AccountStore();
  const res = store.auth(name, token);
  if (!res.ok) throw new Error(res.msg);
  return { store, acct: res.account };
};

describe('accounts', () => {
  it('claims names and rejects other tokens', () => {
    const { store } = claimed();
    expect(store.auth('Ann', A)).toMatchObject({ ok: true, created: false });
    expect(store.auth('Cy', B)).toMatchObject({ ok: true, created: true });
    expect(store.auth('ann', B)).toMatchObject({ ok: false, msg: expect.stringContaining('taken') });
    expect(store.auth('Ann', B)).not.toHaveProperty('need');
    expect(store.auth('x', A)).toMatchObject({ ok: false });
    expect(store.auth('Ann', 'short')).toMatchObject({ ok: false, msg: 'Bad token.' });
  });

  it('asks a new browser for the password once one is set, then remembers that browser', async () => {
    const { store, acct } = claimed();
    expect(await store.setPass(acct, A, 'trout-lake')).toBeNull();
    expect(store.auth('Ann', B)).toMatchObject({ ok: false, need: 'password' });
    expect(await store.login('Ann', B, 'wrong-pass')).toMatchObject({ ok: false, need: 'password', msg: 'Wrong password.' });
    expect(await store.login('Ann', B, 'trout-lake')).toMatchObject({ ok: true, account: acct, created: false });
    expect(store.auth('Ann', B).ok).toBe(true);
    expect(store.auth('Ann', A).ok).toBe(true);
  });

  it('signs out other browsers when the password changes', async () => {
    const { store, acct } = claimed();
    await store.setPass(acct, A, 'trout-lake');
    await store.login('Ann', B, 'trout-lake');
    expect(await store.setPass(acct, B, 'pike-river')).toBeNull();
    expect(store.auth('Ann', A)).toMatchObject({ ok: false, need: 'password' });
    expect(store.auth('Ann', B).ok).toBe(true);
    expect((await store.login('Ann', A, 'trout-lake')).ok).toBe(false);
    expect((await store.login('Ann', A, 'pike-river')).ok).toBe(true);
  });

  it('refuses too-short passwords', async () => {
    const { store, acct } = claimed();
    expect(await store.setPass(acct, A, 'abc')).toMatch(/at least/);
    expect(await store.setPass(acct, A, 42)).toMatch(/at least/);
    expect(acct.pw).toBeUndefined();
  });

  it('a password on an account that has none, or on a new name, is ignored', async () => {
    const { store } = claimed();
    expect(await store.login('Ann', B, 'anything')).toMatchObject({ ok: false, msg: expect.stringContaining('taken') });
    expect((await store.login('Bob', B, 'anything')).ok).toBe(true);
  });

  it('locks a name out after repeated wrong passwords', async () => {
    let now = 0;
    const store = new AccountStore({}, () => now);
    const res = store.auth('Ann', A);
    if (!res.ok) throw new Error(res.msg);
    await store.setPass(res.account, A, 'trout-lake');
    for (let i = 0; i < 5; i++) expect(await store.login('Ann', B, 'nope-nope')).toMatchObject({ msg: 'Wrong password.' });
    expect(await store.login('Ann', B, 'trout-lake')).toMatchObject({ ok: false, msg: expect.stringContaining('Too many') });
    // A browser it already knows still logs in.
    expect(store.auth('Ann', A).ok).toBe(true);
    now += 15 * 60_000;
    expect((await store.login('Ann', B, 'trout-lake')).ok).toBe(true);
  });

  it(`remembers at most ${MAX_DEVICES} browsers, forgetting the oldest`, async () => {
    const { store, acct } = claimed();
    await store.setPass(acct, A, 'trout-lake');
    for (let i = 0; i < MAX_DEVICES; i++) await store.login('Ann', `device-${i}-`.padEnd(20, 'x'), 'trout-lake');
    expect(acct.tokens).toHaveLength(MAX_DEVICES);
    expect(store.auth('Ann', A)).toMatchObject({ ok: false, need: 'password' });
  });

  it('logging out forgets this browser, but only with a password', async () => {
    const { store, acct } = claimed();
    expect(store.forget(acct, A)).toBe(false);
    expect(store.auth('Ann', A).ok).toBe(true);
    await store.setPass(acct, A, 'trout-lake');
    expect(store.forget(acct, A)).toBe(true);
    expect(store.auth('Ann', A)).toMatchObject({ ok: false, need: 'password' });
  });

  it('loads saves from before passwords, and keeps passwords and devices across a reload', async () => {
    const old = claimed();
    const legacy = Object.fromEntries(Object.entries(old.store.snapshot()).map(([k, v]) => [k, { name: (v as { name: string }).name, hash: (v as { hash: string }).hash, save: (v as { save: unknown }).save }]));
    expect(new AccountStore(legacy).auth('Ann', A).ok).toBe(true);
    await old.store.setPass(old.acct, A, 'trout-lake');
    await old.store.login('Ann', B, 'trout-lake');
    const back = new AccountStore(JSON.parse(JSON.stringify(old.store.snapshot())));
    expect(back.auth('Ann', B).ok).toBe(true);
    expect((await back.login('Ann', 'c'.repeat(20), 'trout-lake')).ok).toBe(true);
  });

  it('dev /resetpass sets a new password and signs out every browser', async () => {
    const { store } = claimed();
    const room = new Room('r', MAPS);
    room.devGate = new DevGate({ user: 'admin', pass: 'hunter2' });
    room.resetPass = (name, pass) => store.resetPass(name, pass);
    const dev = store.auth('Oscar', B);
    if (!dev.ok) throw new Error(dev.msg);
    const log: ServerMsg[] = [];
    const id = room.join({ send: (m) => log.push(m) }, dev.account);
    room.handle(id, { t: 'cmd', text: '/resetpass Ann pike-river' });
    expect(log.at(-1)).toMatchObject({ t: 'dev', lines: [expect.stringContaining('Unknown')] });
    room.handle(id, { t: 'cmd', text: '/login admin hunter2' });
    room.handle(id, { t: 'cmd', text: '/resetpass Ann pike-river' });
    await expect.poll(() => log.at(-1)).toMatchObject({ t: 'dev', lines: [expect.stringContaining('New password set for Ann')] });
    expect(store.auth('Ann', A)).toMatchObject({ ok: false, need: 'password' });
    expect((await store.login('Ann', A, 'pike-river')).ok).toBe(true);
    room.handle(id, { t: 'cmd', text: '/resetpass Nobody pike-river' });
    await expect.poll(() => log.at(-1)).toMatchObject({ lines: [expect.stringContaining('No account')] });
  });

  it('tells the client whether the account has a password', async () => {
    const { store, acct } = claimed();
    const room = new Room('r', MAPS);
    const log: ServerMsg[] = [];
    room.join({ send: (m) => log.push(m) }, acct);
    expect(log.find((m) => m.t === 'welcome')).toMatchObject({ hasPass: false });
    expect(acct.online).toBe(true);
    await store.setPass(acct, A, 'trout-lake');
    const again: ServerMsg[] = [];
    room.join({ send: (m) => again.push(m) }, acct);
    expect(again.find((m) => m.t === 'welcome')).toMatchObject({ hasPass: true });
  });
});

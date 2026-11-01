import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { MAPS } from '../src/data/maps';
import { newSave } from '../src/game/state';
import type { ServerMsg } from '../src/net/protocol';
import { RENAME_COOLDOWN_MS } from '../src/net/protocol';
import { AccountStore, FURTHEST_ROWS, MAX_DEVICES } from './accounts';
import { DevGate } from './dev';
import { Room } from './room';

const A = 'a'.repeat(20);
const B = 'b'.repeat(20);
const hashOf = (token: string) => createHash('sha256').update(token).digest('hex');

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

  it('refuses to claim a rude name, but an account that already has one keeps logging in', async () => {
    const store = new AccountStore();
    expect(store.auth('BigDickFisher', A)).toEqual({ ok: false, msg: 'The name "BigDickFisher" isn\'t allowed. Please pick another.' });
    expect(await store.login('xx_ass_xx', A, 'anything')).toMatchObject({ ok: false, msg: expect.stringContaining("isn't allowed") });
    // The 16-character cut would leave "Ass" at the end.
    expect(store.auth('xxxxxxxxxxxxxAssociate', A)).toMatchObject({ ok: false, msg: expect.stringContaining('"xxxxxxxxxxxxxAss"') });
    expect(store.names()).toEqual([]);
    expect(store.auth('Cassandra', A)).toMatchObject({ ok: true, created: true });

    const old = new AccountStore({ ass99: { name: 'Ass99', tokens: [hashOf(B)], save: newSave() } });
    expect(old.auth('Ass99', B)).toMatchObject({ ok: true, created: false });
    expect(old.auth('ass99', A)).toMatchObject({ ok: false, msg: expect.stringContaining('taken') });
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

  it('logging out forgets this browser, and the password still logs in', async () => {
    const { store, acct } = claimed();
    await store.setPass(acct, A, 'trout-lake');
    store.forget(acct, A);
    expect(store.auth('Ann', A)).toMatchObject({ ok: false, need: 'password' });
    expect((await store.login('Ann', A, 'trout-lake')).ok).toBe(true);
  });

  it('logging out of an account without a password deletes it and frees the name', () => {
    const { store, acct } = claimed();
    acct.save.best = { fishId: 'trout', size: 40, value: 99 };
    store.setSupporter('Ann', true);
    expect(store.hall()).toHaveLength(1);
    expect(store.supporters()).toEqual(['Ann']);
    store.forget(acct, A);
    expect(store.names()).toEqual([]);
    expect(store.hall()).toEqual([]);
    expect(store.supporters()).toEqual([]);
    expect(store.snapshot()).toEqual({});
    expect(store.auth('Ann', B)).toMatchObject({ ok: true, created: true });
  });

  it('deleting a password-free account takes its casino records with it, and the next biggest moves up', () => {
    const { store, acct } = claimed();
    const bob = store.auth('Bob', B);
    if (!bob.ok) throw new Error(bob.msg);
    const g = { game: 'roulette', fishId: 'trout' } as const;
    expect(store.gambled(bob.account, true, { ...g, amount: 500, at: 1 })).toBe(true);
    expect(store.gambled(acct, true, { ...g, amount: 900, at: 2 })).toBe(true);
    expect(store.gambled(acct, false, { ...g, amount: 300, at: 3 })).toBe(true);
    // Bob's smaller win is still his own best, ready for when Ann's goes.
    expect(store.gambled(bob.account, true, { ...g, amount: 400, at: 4 })).toBe(false);
    expect(store.records()).toMatchObject({ win: { name: 'Ann', amount: 900 }, loss: { name: 'Ann', amount: 300 } });
    store.forget(acct, A);
    expect(store.records()).toEqual({ win: { name: 'Bob', amount: 500, ...g, at: 1 }, loss: null });
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

describe('the Furthest Out board', () => {
  const boardStore = () => {
    const store = new AccountStore();
    const acct = (name: string, record: number, level = 60) => {
      const res = store.auth(name, (name + '-token').padEnd(20, 'x'));
      if (!res.ok) throw new Error(res.msg);
      res.account.save.sea.record = record;
      res.account.save.level = level;
      return res.account;
    };
    return { store, acct };
  };

  it('ranks every account by the furthest marker headed home from, with that charter\'s haul, leaving out anyone who never has', () => {
    const { store, acct } = boardStore();
    acct('Ann', 15, 70).save.sea.haul = { pearls: 21, fish: 15, coins: 20_000 };
    acct('Bob', 0);
    acct('Cy', 40, 90).save.sea.haul = { pearls: 96, fish: 40, coins: 65_000 };
    // A record from before hauls were kept: no pearls or fish on its row.
    acct('Dee', 15, 55);
    expect(store.furthest()).toEqual([
      { name: 'Cy', level: 90, ledge: 40, pearls: 96, fish: 40 },
      { name: 'Ann', level: 70, ledge: 15, pearls: 21, fish: 15 },
      { name: 'Dee', level: 55, ledge: 15 },
    ]);
  });

  it('shows the top FURTHEST_ROWS only', () => {
    const { store, acct } = boardStore();
    for (let i = 1; i <= FURTHEST_ROWS + 2; i++) acct(`P${i}`, i * 5);
    const rows = store.furthest();
    expect(rows).toHaveLength(FURTHEST_ROWS);
    expect(rows[0]).toMatchObject({ name: `P${FURTHEST_ROWS + 2}`, ledge: (FURTHEST_ROWS + 2) * 5 });
  });

  it('is empty with no records', () => {
    const { store, acct } = boardStore();
    acct('Ann', 0);
    expect(store.furthest()).toEqual([]);
  });

  it('keeps its rows cached until told a record changed, and follows renames and deleted accounts', () => {
    const { store, acct } = boardStore();
    const ann = acct('Ann', 10);
    const bob = acct('Bob', 5);
    const rows = store.furthest();
    expect(store.furthest()).toBe(rows);
    bob.save.sea.record = 20;
    expect(store.furthest()).toBe(rows);
    store.furthestStale();
    expect(store.furthest().map((r) => r.name)).toEqual(['Bob', 'Ann']);
    expect(store.rename(bob, 'Bea')).toBeNull();
    expect(store.furthest()[0].name).toBe('Bea');
    store.forget(bob, ('Bob-token').padEnd(20, 'x'));
    expect(store.furthest()).toEqual([{ name: 'Ann', level: 60, ledge: 10 }]);
    expect(ann.save.sea.record).toBe(10);
  });
});

describe('renaming', () => {
  const C = 'c'.repeat(20);
  const DAY = 24 * 60 * 60_000;
  const setup = () => {
    let t = 1_000_000;
    const store = new AccountStore({}, () => t);
    const res = store.auth('Ann', A);
    if (!res.ok) throw new Error(res.msg);
    return { store, acct: res.account, later: (ms: number) => (t += ms) };
  };

  it('moves the account to the new name and frees the old one', async () => {
    const { store, acct } = setup();
    await store.setPass(acct, A, 'trout-lake');
    acct.save.best = { fishId: 'trout', size: 40, value: 99 };
    store.setSupporter('Ann', true);
    store.gambled(acct, true, { amount: 500, game: 'roulette', fishId: 'trout', at: 1 });
    expect(store.records().win?.name).toBe('Ann');
    expect(store.rename(acct, '  Bea!! ')).toBeNull();
    expect(acct.name).toBe('Bea');
    expect(store.names()).toEqual(['Bea']);
    expect(store.hall()[0].name).toBe('Bea');
    expect(store.supporters()).toEqual(['Bea']);
    expect(store.records().win?.name).toBe('Bea');
    expect(store.auth('Bea', A)).toMatchObject({ ok: true, account: acct });
    expect((await store.login('bea', B, 'trout-lake')).ok).toBe(true);
    expect(store.auth('Ann', C)).toMatchObject({ ok: true, created: true });
  });

  it('refuses bad, unchanged and taken names', () => {
    const { store, acct } = setup();
    store.auth('Cy', B);
    expect(store.rename(acct, 'x')).toContain('2-16');
    expect(store.rename(acct, { name: 'Bea' })).toContain('2-16');
    expect(store.rename(acct, 'Ann')).toContain('already');
    expect(store.rename(acct, 'cy')).toBe('The name "cy" is taken.');
    expect(store.rename(acct, 'Ass99')).toContain("isn't allowed");
    expect(acct.name).toBe('Ann');
  });

  it('allows one change every 7 days, including a change of capitals only', () => {
    const { store, acct, later } = setup();
    expect(store.renameWait(acct)).toBe(0);
    expect(store.rename(acct, 'ANN')).toBeNull();
    expect(store.auth('ann', A)).toMatchObject({ ok: true, account: acct });
    expect(store.renameWait(acct)).toBe(RENAME_COOLDOWN_MS);
    later(DAY / 2);
    expect(store.rename(acct, 'Bea')).toBe('You can change your name again in 7 days.');
    later(6 * DAY + 1);
    expect(store.rename(acct, 'Bea')).toBe('You can change your name again in 12 hours.');
    later(DAY / 2);
    expect(store.rename(acct, 'Bea')).toBeNull();
  });

  it("logs browsers that still have the old name saved into the renamed account, even once it's claimed", async () => {
    const { store, acct, later } = setup();
    await store.setPass(acct, A, 'trout-lake');
    await store.login('Ann', B, 'trout-lake');
    store.rename(acct, 'Bea');
    expect(store.auth('Ann', B)).toMatchObject({ ok: true, account: acct, created: false });
    // Someone else takes the old name, with a password, and the remembered browser still follows the account.
    const other = store.auth('Ann', C);
    if (!other.ok) throw new Error(other.msg);
    await store.setPass(other.account, C, 'pike-river');
    expect(store.auth('Ann', B)).toMatchObject({ ok: true, account: acct });
    expect(await store.login('Ann', B, 'whatever')).toMatchObject({ ok: true, account: acct });
    expect(store.auth('Ann', C)).toMatchObject({ ok: true, account: other.account });
    // A browser that never knew the account gets no way in.
    expect(store.auth('Ann', 'd'.repeat(20))).toMatchObject({ ok: false, need: 'password' });
    // Only the last old name is followed: "Ann" is the other account's again.
    later(RENAME_COOLDOWN_MS);
    store.rename(acct, 'Cat');
    expect(store.auth('Bea', B)).toMatchObject({ ok: true, account: acct });
    expect(store.auth('Ann', B)).toMatchObject({ ok: false, need: 'password' });
  });

  it('keeps the new name, cooldown and old name across a reload', () => {
    const { store, acct } = setup();
    store.rename(acct, 'Bea');
    const back = new AccountStore(JSON.parse(JSON.stringify(store.snapshot())), () => 1_000_000 + 1000);
    const res = back.auth('Bea', A);
    if (!res.ok) throw new Error(res.msg);
    expect(back.renameWait(res.account)).toBe(RENAME_COOLDOWN_MS - 1000);
    expect(back.auth('Ann', A)).toMatchObject({ ok: true, account: res.account });
  });

  it('tells the room and the whole server, and the player when they can rename again', () => {
    const { store, acct } = setup();
    const room = new Room('r', MAPS);
    room.renameWait = (a) => store.renameWait(a);
    const log: ServerMsg[] = [];
    const other: ServerMsg[] = [];
    const id = room.join({ send: (m) => log.push(m) }, acct);
    const cy = store.auth('Cy', B);
    if (!cy.ok) throw new Error(cy.msg);
    room.join({ send: (m) => other.push(m) }, cy.account);
    expect(log.find((m) => m.t === 'welcome')).toMatchObject({ name: 'Ann', renameIn: 0 });
    store.rename(acct, 'Bea');
    room.renamed(id, 'Ann');
    for (const l of [log, other]) {
      expect(l).toContainEqual({ t: 'named', id, name: 'Bea' });
      expect(l).toContainEqual({ t: 'sys', text: 'Ann is now Bea' });
    }
    const again: ServerMsg[] = [];
    room.join({ send: (m) => again.push(m) }, acct);
    expect(again.find((m) => m.t === 'welcome')).toMatchObject({ name: 'Bea', renameIn: RENAME_COOLDOWN_MS });
    expect(again.find((m) => m.t === 'welcome')).toMatchObject({ players: expect.arrayContaining([expect.objectContaining({ id, name: 'Bea' })]) });
  });
});

describe('back pay for the old level cap', () => {
  const vet = () => {
    const save: Record<string, unknown> = { ...newSave(), level: 50, xp: 0, dex: { constellation: { count: 3000, best: 250 } } };
    delete save.backPay;
    return save;
  };
  it('previews what each account is owed, then pays it once', () => {
    const store = new AccountStore({ ann: { name: 'Ann', tokens: ['x'], save: vet() }, bob: { name: 'Bob', tokens: ['y'], save: { ...newSave(), level: 12 } } });
    const preview = store.backPay(false);
    expect(preview.paid).toEqual([]);
    expect(preview.lines[0]).toMatch(/^Ann: Lv 50 → \d+ \(\+[\d,]+ XP\) · 3,000 catches ≈ [\d,]+ XP in all$/);
    expect(preview.lines[1]).toContain('Reaching 50 takes');
    expect(preview.lines.at(-1)).toContain('1 account owed');
    const ann = store.all().find((a) => a.name === 'Ann')!;
    expect(ann.save.level).toBe(50);
    const res = store.backPay(true);
    expect(res.paid).toHaveLength(1);
    expect(ann.save.level).toBe(50 + res.paid[0].levels);
    expect(store.backPay(true).lines).toEqual(['No back pay owed.']);
  });
});

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AccountStore } from './accounts';
import { FileStorage } from './storage';

describe('storage', () => {
  it('round-trips accounts and room funds through files', async () => {
    const st = new FileStorage(mkdtempSync(join(tmpdir(), 'fish-')));
    const a = new AccountStore();
    const res = a.auth('Ann', 'token-token-token-1');
    if (!res.ok) throw new Error('auth');
    res.account.save.coins = 123;
    await st.save({ accounts: a.takeDirty()!, rooms: { r: { pond: 5 } } });
    const back = await st.load();
    expect(back.rooms).toEqual({ r: { pond: 5 } });
    const b = new AccountStore(back.accounts);
    const again = b.auth('Ann', 'token-token-token-1');
    expect(again.ok && again.account.save.coins).toBe(123);
    expect(b.auth('Ann', 'wrong-token-wrong-1').ok).toBe(false);
  });
});

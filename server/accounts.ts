import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { migrate, newSave, type SaveData } from '../src/game/state';

export interface Account {
  name: string;
  hash: string;
  save: SaveData;
  online: boolean;
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export type AuthResult = { ok: true; account: Account } | { ok: false; msg: string };

/**
 * Name + secret token accounts. The first join with a name claims it; the token (kept in the
 * player's browser) proves ownership afterwards. Saves live here, not on the client.
 */
export class AccountStore {
  private accounts = new Map<string, Account>();
  private dirty = false;

  constructor(private file?: URL) {
    if (file && existsSync(file)) {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Omit<Account, 'online'>>;
      for (const [k, a] of Object.entries(raw)) this.accounts.set(k, { ...a, save: migrate(a.save), online: false });
    }
  }

  auth(name: string, token: string): AuthResult {
    const clean = String(name ?? '').replace(/[^\w \-]/g, '').trim().slice(0, 16);
    if (clean.length < 2) return { ok: false, msg: 'Name must be 2-16 letters, numbers, spaces or dashes.' };
    if (typeof token !== 'string' || token.length < 16 || token.length > 128) return { ok: false, msg: 'Bad token.' };
    const key = clean.toLowerCase();
    let acct = this.accounts.get(key);
    if (!acct) {
      acct = { name: clean, hash: hash(token), save: newSave(), online: false };
      this.accounts.set(key, acct);
      this.touch();
    } else if (acct.hash !== hash(token)) return { ok: false, msg: `The name "${clean}" is taken.` };
    if (acct.online) return { ok: false, msg: `${acct.name} is already logged in.` };
    acct.online = true;
    return { ok: true, account: acct };
  }

  touch(): void {
    this.dirty = true;
  }

  flush(): void {
    if (!this.dirty || !this.file) return;
    this.dirty = false;
    const out = Object.fromEntries([...this.accounts].map(([k, a]) => [k, { name: a.name, hash: a.hash, save: { ...a.save, fund: {} } }]));
    writeFileSync(this.file, JSON.stringify(out));
  }
}

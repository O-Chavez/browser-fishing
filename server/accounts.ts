import type { HallRow } from '../src/net/protocol';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { migrate, newSave, type SaveData } from '../src/game/state';
import { Lockout } from './lockout';

export interface Account {
  name: string;
  /** Hashes of the device tokens that log in by themselves: browsers that joined or entered the password. */
  tokens: string[];
  /** Optional password, for logging in on a new device. */
  pw?: PassHash;
  save: SaveData;
  online: boolean;
}

interface PassHash {
  salt: string;
  hash: string;
}

/** Remembered browsers per account; logging in on another one forgets the oldest. */
export const MAX_DEVICES = 10;
export const PASS_MIN = 6;
export const PASS_MAX = 128;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

// Async, so a password check runs on the thread pool instead of stalling the game loop.
const scryptAsync = promisify(scrypt) as (pass: string, salt: Buffer, len: number) => Promise<Buffer>;

async function hashPass(pass: string): Promise<PassHash> {
  const salt = randomBytes(16);
  return { salt: salt.toString('hex'), hash: (await scryptAsync(pass, salt, 32)).toString('hex') };
}

async function checkPass(pass: string, pw: PassHash): Promise<boolean> {
  const got = await scryptAsync(pass, Buffer.from(pw.salt, 'hex'), 32);
  const want = Buffer.from(pw.hash, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Why a new password isn't allowed, or null if it is. */
export function passProblem(pass: unknown): string | null {
  if (typeof pass !== 'string' || pass.length < PASS_MIN) return `Use at least ${PASS_MIN} characters.`;
  if (pass.length > PASS_MAX) return `Use at most ${PASS_MAX} characters.`;
  return null;
}

/** `created` is true when this login claimed a new name. */
export type AuthResult = { ok: true; account: Account; created: boolean } | { ok: false; msg: string; need?: 'password' };

/**
 * Name + secret token accounts. The first join with a name claims it; the token (kept in the
 * player's browser) proves ownership afterwards. An account with a password can add another
 * browser's token by entering it. Saves live here, not on the client.
 */
export class AccountStore {
  private accounts = new Map<string, Account>();
  private dirty = false;
  private hallRows: HallRow[] | null = null;
  private lock: Lockout;

  constructor(raw: Record<string, unknown> = {}, now: () => number = Date.now) {
    this.lock = new Lockout(5, 50, 15 * 60_000, now);
    type Stored = { name: string; hash?: string; tokens?: string[]; pw?: PassHash; save: unknown };
    for (const [k, a] of Object.entries(raw) as [string, Stored][]) {
      // Older saves kept a single token `hash`.
      const tokens = Array.isArray(a?.tokens) ? a.tokens : a?.hash ? [a.hash] : null;
      if (a?.name && tokens) this.accounts.set(k, { name: a.name, tokens, ...(a.pw ? { pw: a.pw } : {}), save: migrate(a.save as SaveData), online: false });
    }
  }

  /** Logs in with this browser's token, claiming the name if nobody has it yet. */
  auth(name: string, token: string): AuthResult {
    const p = parse(name, token);
    if ('msg' in p) return { ok: false, msg: p.msg };
    let acct = this.accounts.get(p.key);
    const created = !acct;
    if (!acct) {
      acct = { name: p.clean, tokens: [p.h], save: newSave(), online: false };
      this.accounts.set(p.key, acct);
      this.touch();
    } else if (!acct.tokens.includes(p.h)) {
      if (acct.pw) return { ok: false, need: 'password', msg: `${acct.name} has a password. Enter it to log in on this device.` };
      return { ok: false, msg: `The name "${p.clean}" is taken.` };
    }
    return { ok: true, account: acct, created };
  }

  /** Like `auth`, but a correct password also adds this browser to the account. */
  async login(name: string, token: string, pass: unknown): Promise<AuthResult> {
    const p = parse(name, token);
    const acct = 'key' in p ? this.accounts.get(p.key) : undefined;
    if (!('key' in p) || !acct?.pw || acct.tokens.includes(p.h)) return this.auth(name, token);
    if (this.lock.blocked(p.key)) return { ok: false, need: 'password', msg: 'Too many wrong passwords. Try again later.' };
    if (typeof pass !== 'string' || pass.length > PASS_MAX || !(await checkPass(pass, acct.pw))) {
      this.lock.fail(p.key);
      return { ok: false, need: 'password', msg: 'Wrong password.' };
    }
    this.lock.clear(p.key);
    acct.tokens = [...acct.tokens.filter((t) => t !== p.h), p.h].slice(-MAX_DEVICES);
    this.touch();
    return { ok: true, account: acct, created: false };
  }

  /** Sets or changes the password from a logged-in browser, and signs out every other one. */
  async setPass(acct: Account, token: string, pass: unknown): Promise<string | null> {
    const bad = passProblem(pass);
    if (bad) return bad;
    acct.pw = await hashPass(pass as string);
    acct.tokens = [hash(token)];
    this.touch();
    return null;
  }

  /** This browser stops logging in by itself. Only allowed with a password, or the account would be lost. */
  forget(acct: Account, token: string): boolean {
    if (!acct.pw) return false;
    acct.tokens = acct.tokens.filter((t) => t !== hash(token));
    this.touch();
    return true;
  }

  /** Dev console: give a locked-out player a new password. Every remembered browser is signed out. */
  async resetPass(name: string, pass: unknown): Promise<string> {
    const key = String(name ?? '').replace(/[^\w \-]/g, '').trim().slice(0, 16).toLowerCase();
    const acct = this.accounts.get(key);
    if (!acct) return `No account named "${name}".`;
    const bad = passProblem(pass);
    if (bad) return bad;
    acct.pw = await hashPass(pass as string);
    acct.tokens = [];
    this.lock.clear(key);
    this.touch();
    return `New password set for ${acct.name}. They can log in with it on any device.`;
  }

  /** The most valuable catches across every account, online or not. Cached until `hallStale`. */
  hall(): HallRow[] {
    return (this.hallRows ??= [...this.accounts.values()]
      .filter((a) => a.save.best)
      .map((a) => ({ name: a.name, level: a.save.level, best: a.save.best! }))
      .sort((a, b) => b.best.value - a.best.value || a.name.localeCompare(b.name))
      .slice(0, 8));
  }

  /** Call when a player's level or best catch may have changed, so the next `hall` re-ranks. */
  hallStale(): void {
    this.hallRows = null;
  }

  touch(): void {
    this.dirty = true;
  }

  snapshot(): Record<string, unknown> {
    return Object.fromEntries(
      [...this.accounts].map(([k, a]) => [
        k,
        // `hash` is still written so an older server, after a rollback, keeps the account (it skips ones without).
        { name: a.name, hash: a.tokens[0] ?? '-', tokens: a.tokens, ...(a.pw ? { pw: a.pw } : {}), save: a.save },
      ]),
    );
  }

  /** The data to persist if anything changed since the last call, else null. */
  takeDirty(): Record<string, unknown> | null {
    if (!this.dirty) return null;
    this.dirty = false;
    return this.snapshot();
  }

  markDirty(): void {
    this.dirty = true;
  }
}

function parse(name: string, token: string): { clean: string; key: string; h: string } | { msg: string } {
  const clean = String(name ?? '').replace(/[^\w \-]/g, '').trim().slice(0, 16);
  if (clean.length < 2) return { msg: 'Name must be 2-16 letters, numbers, spaces or dashes.' };
  if (typeof token !== 'string' || token.length < 16 || token.length > 128) return { msg: 'Bad token.' };
  return { clean, key: clean.toLowerCase(), h: hash(token) };
}

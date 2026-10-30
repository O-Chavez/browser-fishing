import { RENAME_COOLDOWN_MS, waitText, type CasinoRecord, type CasinoRecords, type Gamble, type HallRow } from '../src/net/protocol';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { payBack } from '../src/game/economy';
import { XP_TO_FLAT, applyXp, earnedXp } from '../src/game/progression';
import { migrate, newSave, type SaveData } from '../src/game/state';
import { rudeName } from './chat';
import { Lockout } from './lockout';

const num = (n: number) => n.toLocaleString('en-US');
/** Accounts listed by `/backpay` before it says "and N more". */
const BACKPAY_ROWS = 25;

export interface Account {
  name: string;
  /** Hashes of the device tokens that log in by themselves: browsers that joined or entered the password. */
  tokens: string[];
  /** Optional password, for logging in on a new device. */
  pw?: PassHash;
  save: SaveData;
  online: boolean;
  /** When the player first tipped on Ko-fi (or Oscar gave them the heart). Kept outside the save so a reset keeps it. */
  supporter?: number;
  /** The player's biggest single casino win and loss, for the casino record board. Kept outside the save so a reset keeps it. */
  casino?: { win?: Gamble; loss?: Gamble };
  /** When the name last changed, for the rename cooldown. */
  renamed?: number;
  /** The name before the last change, lowercase, so browsers that still have it saved follow the account. */
  prev?: string;
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
  private supporterNames: string[] | null = null;
  private recordRows: CasinoRecords | null = null;
  private lock: Lockout;

  constructor(
    raw: Record<string, unknown> = {},
    private now: () => number = Date.now,
  ) {
    this.lock = new Lockout(5, 50, 15 * 60_000, now);
    type Stored = { name: string; hash?: string; tokens?: string[]; pw?: PassHash; supporter?: number; casino?: Account['casino']; renamed?: number; prev?: string; save: unknown };
    for (const [k, a] of Object.entries(raw) as [string, Stored][]) {
      // Older saves kept a single token `hash`.
      const tokens = Array.isArray(a?.tokens) ? a.tokens : a?.hash ? [a.hash] : null;
      if (a?.name && tokens) this.accounts.set(k, { name: a.name, tokens, ...pick(a), save: migrate(a.save as SaveData), online: false });
    }
  }

  /** Logs in with this browser's token, claiming the name if nobody has it yet. */
  auth(name: string, token: string): AuthResult {
    const p = parse(name, token);
    if ('msg' in p) return { ok: false, msg: p.msg };
    let acct = this.accounts.get(p.key);
    if (!acct?.tokens.includes(p.h)) {
      const moved = this.renamedFrom(p.key, p.h);
      if (moved) return { ok: true, account: moved, created: false };
    }
    const created = !acct;
    if (!acct) {
      // Only new claims: an account that already has such a name keeps logging in. The cut to 16
      // characters can end on a rude word ("…Associate"), so the saved name is checked too.
      if (rudeName(String(name)) || rudeName(p.clean)) return { ok: false, msg: `The name "${p.clean}" isn't allowed. Please pick another.` };
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
    if (!('key' in p) || !acct?.pw || acct.tokens.includes(p.h) || this.renamedFrom(p.key, p.h)) return this.auth(name, token);
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

  /**
   * Log out: this browser stops logging in by itself. Without a password nothing could ever log in
   * again, so the account is deleted instead and its name freed.
   */
  forget(acct: Account, token: string): void {
    if (acct.pw) acct.tokens = acct.tokens.filter((t) => t !== hash(token));
    else {
      this.accounts.delete(nameKey(acct.name));
      this.hallRows = null;
      this.supporterNames = null;
      this.recordRows = null;
    }
    this.touch();
  }

  /** The account this browser knew by the name `key` before it was changed, if any. */
  private renamedFrom(key: string, h: string): Account | undefined {
    for (const a of this.accounts.values()) if (a.prev === key && a.tokens.includes(h)) return a;
  }

  /** Milliseconds until the account may change its name again (0 if it may now). */
  renameWait(acct: Account): number {
    return Math.max(0, (acct.renamed ?? -Infinity) + RENAME_COOLDOWN_MS - this.now());
  }

  /** Changes the account's name and frees the old one. Returns why it was refused, or null. */
  rename(acct: Account, name: unknown): string | null {
    const clean = typeof name === 'string' ? cleanName(name) : '';
    if (clean.length < 2) return 'Name must be 2-16 letters, numbers, spaces or dashes.';
    if (clean === acct.name) return `Your name is already ${clean}.`;
    if (rudeName(name as string) || rudeName(clean)) return `The name "${clean}" isn't allowed. Please pick another.`;
    const wait = this.renameWait(acct);
    if (wait) return `You can change your name again in ${waitText(wait)}.`;
    const key = clean.toLowerCase();
    const old = nameKey(acct.name);
    // Changing only the capitals keeps the same key.
    if (key !== old && this.accounts.has(key)) return `The name "${clean}" is taken.`;
    this.accounts.delete(old);
    if (key !== old) acct.prev = old;
    acct.name = clean;
    acct.renamed = this.now();
    this.accounts.set(key, acct);
    this.hallRows = null;
    this.supporterNames = null;
    this.recordRows = null;
    this.touch();
    return null;
  }

  /** Dev console: give a locked-out player a new password. Every remembered browser is signed out. */
  async resetPass(name: string, pass: unknown): Promise<string> {
    const key = nameKey(name);
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
      .map((a) => ({ name: a.name, level: a.save.level, best: a.save.best!, ...(a.save.title ? { title: a.save.title } : {}) }))
      .sort((a, b) => b.best.value - a.best.value || a.name.localeCompare(b.name))
      .slice(0, 8));
  }

  /** Every account, online or not. */
  all(): Account[] {
    return [...this.accounts.values()];
  }

  /**
   * Dev console `/backpay`: lists every account still owed the XP the old level-50 cap threw away,
   * with the level it would reach; with `apply`, pays them all. Returns the accounts paid and their levels.
   */
  backPay(apply: boolean): { lines: string[]; paid: { acct: Account; levels: number }[] } {
    const due = [...this.accounts.values()].filter((a) => !a.save.backPay.paid).sort((a, b) => b.save.backPay.xp - a.save.backPay.xp);
    if (!due.length) return { lines: ['No back pay owed.'], paid: [] };
    const rows = due.slice(0, BACKPAY_ROWS).map((a) => {
      const to = applyXp(a.save.level, a.save.xp, a.save.backPay.xp).level;
      const catches = Object.values(a.save.dex).reduce((n, e) => n + (e?.count ?? 0), 0);
      return `${a.name}: Lv ${a.save.level} → ${to} (+${num(a.save.backPay.xp)} XP) · ${num(catches)} catches ≈ ${num(earnedXp(a.save.dex))} XP in all`;
    });
    rows.push(`Reaching 50 takes ${num(XP_TO_FLAT)} XP; an account whose catches add up to less got there another way (like /level).`);
    if (due.length > BACKPAY_ROWS) rows.push(`…and ${due.length - BACKPAY_ROWS} more`);
    if (!apply) return { lines: [...rows, `${due.length} account${due.length === 1 ? '' : 's'} owed. /backpay apply pays them all.`], paid: [] };
    const paid = due.map((acct) => ({ acct, levels: payBack(acct.save).levels }));
    this.hallRows = null;
    this.touch();
    return { lines: [...rows, `Paid ${due.length} account${due.length === 1 ? '' : 's'}.`], paid };
  }

  /** Every account name, for matching a Ko-fi tip to a player. */
  names(): string[] {
    return [...this.accounts.values()].map((a) => a.name);
  }

  /** Gives or takes away the supporter 💗. Null if there's no such account. */
  setSupporter(name: string, on: boolean, at = Date.now()): Account | null {
    const acct = this.accounts.get(nameKey(name));
    if (!acct) return null;
    if (on) acct.supporter ??= at;
    else delete acct.supporter;
    this.supporterNames = null;
    this.touch();
    return acct;
  }

  /** Supporters' names, newest first, for the hearts and the thank-you board. */
  supporters(): string[] {
    return (this.supporterNames ??= [...this.accounts.values()]
      .filter((a) => a.supporter)
      .sort((a, b) => b.supporter! - a.supporter! || a.name.localeCompare(b.name))
      .map((a) => a.name));
  }

  /**
   * Keeps a settled hand or spin as the player's biggest win (or loss) if it beats theirs. True when
   * it is also the casino's new all-time record, so every room can be told.
   */
  gambled(acct: Account, win: boolean, g: Gamble): boolean {
    const kind = win ? 'win' : 'loss';
    if (!(g.amount > 0) || g.amount <= (acct.casino?.[kind]?.amount ?? 0)) return false;
    const top = this.records()[kind];
    (acct.casino ??= {})[kind] = g;
    this.recordRows = null;
    this.touch();
    return !top || g.amount > top.amount;
  }

  /** The biggest single win and loss across every account, online or not; the earlier one keeps a tie. Cached until one changes. */
  records(): CasinoRecords {
    const top = (kind: 'win' | 'loss'): CasinoRecord | null => {
      let best: CasinoRecord | null = null;
      for (const a of this.accounts.values()) {
        const g = a.casino?.[kind];
        if (g && (!best || g.amount > best.amount || (g.amount === best.amount && g.at < best.at))) best = { name: a.name, ...g };
      }
      return best;
    };
    return (this.recordRows ??= { win: top('win'), loss: top('loss') });
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
        { name: a.name, hash: a.tokens[0] ?? '-', tokens: a.tokens, ...pick(a), save: a.save },
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

/** The optional account fields, left out when unset so the saved JSON stays small. */
const pick = (a: Pick<Account, 'pw' | 'supporter' | 'casino' | 'renamed' | 'prev'>) => ({
  ...(a.pw ? { pw: a.pw } : {}),
  ...(a.supporter ? { supporter: a.supporter } : {}),
  ...(a.casino ? { casino: a.casino } : {}),
  ...(a.renamed ? { renamed: a.renamed } : {}),
  ...(a.prev ? { prev: a.prev } : {}),
});

const cleanName = (name: string) => String(name ?? '').replace(/[^\w \-]/g, '').trim().slice(0, 16);
const nameKey = (name: string) => cleanName(name).toLowerCase();

function parse(name: string, token: string): { clean: string; key: string; h: string } | { msg: string } {
  const clean = cleanName(name);
  if (clean.length < 2) return { msg: 'Name must be 2-16 letters, numbers, spaces or dashes.' };
  if (typeof token !== 'string' || token.length < 16 || token.length > 128) return { msg: 'Bad token.' };
  return { clean, key: clean.toLowerCase(), h: hash(token) };
}

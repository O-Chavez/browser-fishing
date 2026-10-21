import { createHash, timingSafeEqual } from 'node:crypto';
import { BAITS, FISH, RODS } from '../src/data/content';
import type { MapDef } from '../src/data/maps';
import * as eco from '../src/game/economy';
import { MAX_LEVEL } from '../src/game/progression';
import type { SaveData } from '../src/game/state';

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;
/** Across all accounts, so making new accounts doesn't buy more guesses. */
const MAX_FAILS_GLOBAL = 30;

const digest = (s: string) => createHash('sha256').update(s).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

/**
 * Dev console login. Credentials come from DEV_USER / DEV_PASS; with either unset the console is
 * off. Failed logins lock that account out for a while, and too many overall lock everyone out.
 */
export class DevGate {
  private fails = new Map<string, { n: number; at: number }>();
  private globalFails: number[] = [];

  constructor(
    private creds: { user?: string; pass?: string } = {},
    private now: () => number = Date.now,
  ) {}

  get enabled(): boolean {
    return !!this.creds.user && !!this.creds.pass;
  }

  login(who: string, user: string, pass: string): string | null {
    if (!this.enabled) return 'The dev console is off on this server.';
    const t = this.now();
    this.globalFails = this.globalFails.filter((at) => t - at < LOCK_MS);
    const f = this.fails.get(who);
    if (f && t - f.at >= LOCK_MS) this.fails.delete(who);
    if ((this.fails.get(who)?.n ?? 0) >= MAX_FAILS || this.globalFails.length >= MAX_FAILS_GLOBAL) return 'Too many failed logins. Try again later.';
    if (same(user, this.creds.user!) && same(pass, this.creds.pass!)) {
      this.fails.delete(who);
      return null;
    }
    this.fails.set(who, { n: (this.fails.get(who)?.n ?? 0) + 1, at: t });
    this.globalFails.push(t);
    return 'Wrong username or password.';
  }
}

/** What a dev command can reach on the player who typed it. */
export interface DevTarget {
  save: SaveData;
  maps: Record<string, MapDef>;
  teleport(map: string): void;
  /** A day fraction (see `dayFraction`), or null to follow the clock again. */
  setTime(f: number | null): void;
  clearDig(): void;
}

export const TIMES: Record<string, number> = { day: 0.2, dusk: 0.5, night: 0.7, dawn: 0.93 };

export const HELP = [
  '/coins N · /chips N · /level N',
  '/bait <id> [N] · /rod <id> · /fish <id> [cm] [shiny]',
  '/tp <map> · /time day|dusk|night|dawn|auto',
  '/dig (reset worm cooldown) · /logout',
];

const int = (v: string | undefined, lo: number, hi: number): number | null => {
  const n = Number(v);
  return v !== undefined && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.floor(n))) : null;
};
const ids = (list: { id: string }[]) => list.map((x) => x.id).join(', ');

/** Runs one unlocked dev command. `changed` means the save was modified. */
export function runDev(t: DevTarget, cmd: string, args: string[]): { lines: string[]; changed: boolean } {
  const s = t.save;
  const ok = (line: string) => ({ lines: [line], changed: true });
  const say = (line: string) => ({ lines: [line], changed: false });
  switch (cmd) {
    case 'help':
      return { lines: HELP, changed: false };
    case 'coins':
    case 'chips': {
      const n = int(args[0], 0, 1e9);
      if (n === null) return say(`Usage: /${cmd} N`);
      s[cmd] = n;
      return ok(`${cmd === 'coins' ? 'Coins' : 'Chips'} set to ${n}.`);
    }
    case 'level': {
      const n = int(args[0], 1, MAX_LEVEL);
      if (n === null) return say(`Usage: /level 1-${MAX_LEVEL}`);
      s.level = n;
      s.xp = 0;
      return ok(`Level set to ${n}.`);
    }
    case 'bait': {
      const b = BAITS.find((x) => x.id === args[0]);
      if (!b) return say(`Bait ids: ${ids(BAITS)}`);
      const n = int(args[1] ?? '50', 1, eco.LOCKER_CAP)!;
      s.locker.bait[b.id] = Math.min(eco.LOCKER_CAP, (s.locker.bait[b.id] ?? 0) + n);
      if (!s.slots.some((sl) => sl?.k === 'bait' && sl.id === b.id)) eco.equipBait(s, b.id);
      return ok(`Added ${n} ${b.name}.`);
    }
    case 'rod': {
      const r = RODS.find((x) => x.id === args[0]);
      if (!r) return say(`Rod ids: ${ids(RODS)}`);
      if (eco.ownsRod(s, r.id)) return say(`You already have the ${r.name}.`);
      s.locker.rods.push(r.id);
      eco.equipRod(s, r.id);
      return ok(`Added the ${r.name}.`);
    }
    case 'fish': {
      const f = FISH.find((x) => x.id === args[0]);
      if (!f) return say(`Fish ids: ${ids(FISH)}`);
      const size = int(args[1], f.minSize, f.maxSize) ?? Math.round((f.minSize + f.maxSize) / 2);
      const shiny = args.includes('shiny');
      if (!eco.takeItem(s, { k: 'fish', fishId: f.id, size, ...(shiny ? { shiny } : {}) })) return say('Your hotbar is full.');
      return ok(`Added a ${shiny ? 'shiny ' : ''}${size} cm ${f.name}.`);
    }
    case 'tp': {
      const m = t.maps[args[0]];
      if (!m) return say(`Map ids: ${Object.keys(t.maps).join(', ')}`);
      t.teleport(m.id);
      return ok(`Teleported to ${m.name}.`);
    }
    case 'time': {
      const k = args[0];
      if (k === 'auto') {
        t.setTime(null);
        return say('Time follows the clock again.');
      }
      if (!(k in TIMES)) return say('Usage: /time day|dusk|night|dawn|auto');
      t.setTime(TIMES[k]);
      return say(`Time set to ${k} (only for you).`);
    }
    case 'dig':
      t.clearDig();
      return say('Worm patch cooldown cleared.');
    default:
      return say(`Unknown command /${cmd}. Try /help.`);
  }
}

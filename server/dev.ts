import { createHash, timingSafeEqual } from 'node:crypto';
import { BAITS, FISH, LINES, RODS } from '../src/data/content';
import type { MapDef } from '../src/data/maps';
import { zoneAt } from '../src/data/sea';
import * as eco from '../src/game/economy';
import { DISHES } from '../src/data/smokehouse';
import * as smoke from '../src/game/smoke';
import { grantRanks, sellValue } from '../src/game/progression';
import type { SaveData } from '../src/game/state';
import { Lockout } from './lockout';

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
  private lock: Lockout;

  constructor(
    private creds: { user?: string; pass?: string } = {},
    now: () => number = Date.now,
  ) {
    this.lock = new Lockout(MAX_FAILS, MAX_FAILS_GLOBAL, LOCK_MS, now);
  }

  get enabled(): boolean {
    return !!this.creds.user && !!this.creds.pass;
  }

  login(who: string, user: string, pass: string): string | null {
    if (!this.enabled) return 'The dev console is off on this server.';
    if (this.lock.blocked(who)) return 'Too many failed logins. Try again later.';
    if (same(user, this.creds.user!) && same(pass, this.creds.pass!)) {
      this.lock.clear(who);
      return null;
    }
    this.lock.fail(who);
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
  /** The dive depth the sea's look follows, for this player only. */
  setDepth(depth: number): void;
  /** Starts a dive at this depth (any depth, charted or not), ending one under way without banking it. */
  dive(depth: number): void;
  /** At a ledge: dive on, or surface. True if the save changed. */
  ledge(a: 'on' | 'surface'): boolean | null;
  clearDig(): void;
  /** Puts the player at a spot on their map, past the server's move check. */
  place(x: number, z: number): void;
}

export const TIMES: Record<string, number> = { day: 0.2, dusk: 0.5, night: 0.7, dawn: 0.93 };

export const HELP = [
  '/coins N · /chips N · /pearls N · /level N · /rodlevel N · /linelevel N',
  '/bait <id> [N] · /rod <id> · /line <id> · /fish <id> [cm] [shiny]',
  '/tp <map> · /goto x z · /time day|dusk|night|dawn|auto',
  '/sea [depth] (start a dive there; 0 is the harbour) · /ledge on|up (at a ledge)',
  '/dig (reset worm cooldown) · /smoke (finish the smoker) · /smoke <fish> [N]',
  '/dish <dish> [N] · /smokestats (Smokehouse play test)',
  '/resetpass <name> <new password>',
  '/supporter <name> [off] (Ko-fi 💗) · /backpay [apply] · /logout',
];

/** There is no level cap; this only keeps `/level` typos sane. */
const MAX_DEV_LEVEL = 999;
/** Rod and line levels have no cap; this keeps `/rodlevel` and `/linelevel` typos sane. */
const MAX_DEV_ROD_LEVEL = 999;
/** Dives have no bottom either; this keeps `/sea` typos sane. */
const MAX_DEV_DEPTH = 999;

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
    case 'chips':
    case 'pearls': {
      const n = int(args[0], 0, 1e9);
      if (n === null) return say(`Usage: /${cmd} N`);
      s[cmd] = n;
      return ok(`${{ coins: 'Coins', chips: 'Chips', pearls: 'Black Pearls' }[cmd]} set to ${n}.`);
    }
    case 'rodlevel': {
      const n = int(args[0], 0, MAX_DEV_ROD_LEVEL);
      if (n === null) return say(`Usage: /rodlevel 0-${MAX_DEV_ROD_LEVEL}`);
      s.rodLevel = n;
      return ok(`Aurora Rod level set to +${n}.`);
    }
    case 'linelevel': {
      const n = int(args[0], 0, MAX_DEV_ROD_LEVEL);
      if (n === null) return say(`Usage: /linelevel 0-${MAX_DEV_ROD_LEVEL}`);
      s.seaLine = n;
      return ok(`Deep Sea Line level set to +${n}.`);
    }
    case 'level': {
      const n = int(args[0], 1, MAX_DEV_LEVEL);
      if (n === null) return say(`Usage: /level 1-${MAX_DEV_LEVEL}`);
      s.level = n;
      s.xp = 0;
      // Ranks up to the new level come with it; the gifts for skipped levels don't.
      grantRanks(s);
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
    case 'line': {
      const l = LINES.find((x) => x.id === args[0]);
      if (!l) return say(`Line ids: ${ids(LINES)}`);
      s.line = l.id;
      return ok(`Spooled the ${l.name}.`);
    }
    case 'fish': {
      const f = FISH.find((x) => x.id === args[0]);
      if (!f) return say(`Fish ids: ${ids(FISH)}`);
      const size = int(args[1], f.minSize, f.maxSize) ?? Math.round((f.minSize + f.maxSize) / 2);
      const shiny = args.includes('shiny');
      if (!eco.takeItem(s, { k: 'fish', fishId: f.id, size, ...(shiny ? { shiny } : {}) })) return say('Your fish slots are full.');
      return ok(`Added a ${shiny ? 'shiny ' : ''}${size} cm ${f.name}.`);
    }
    case 'smoke': {
      if (!args[0]) {
        const busy = s.smoke.spots.filter((x) => x);
        for (const x of busy) x!.doneAt = 1;
        return busy.length ? ok(`Finished ${busy.length} fish on the smoker.`) : say('Nothing is on the smoker.');
      }
      const f = FISH.find((x) => x.id === args[0]);
      if (!f) return say(`Fish ids: ${ids(FISH)}`);
      const n = int(args[1] ?? '1', 1, 50)!;
      smoke.stock(s, f.id, sellValue(f, (f.minSize + f.maxSize) / 2), n);
      return ok(`Added ${n} smoked ${f.name} to your Pantry.`);
    }
    case 'dish': {
      const d = DISHES.find((x) => x.id === args[0]);
      if (!d) return say(`Dish ids: ${ids(DISHES)}`);
      const n = int(args[1] ?? '1', 1, 50)!;
      smoke.addCooked(s, d.id, n);
      return ok(`Added ${n} ${d.name} to your Pantry.`);
    }
    case 'tp': {
      const m = t.maps[args[0]];
      if (!m) return say(`Map ids: ${Object.keys(t.maps).join(', ')}`);
      t.teleport(m.id);
      return ok(`Teleported to ${m.name}.`);
    }
    case 'sea': {
      const depth = args[0] === undefined ? 1 : int(args[0], 0, MAX_DEV_DEPTH);
      if (depth === null) return say(`Usage: /sea [depth 0-${MAX_DEV_DEPTH}]`);
      const sea = Object.values(t.maps).find((m) => m.sea);
      if (!sea) return say('There is no sea on this server.');
      t.setDepth(depth);
      t.dive(depth);
      return ok(`Diving from ${zoneAt(depth).name}, depth ${depth}.`);
    }
    case 'ledge': {
      const a = args[0] === 'on' ? 'on' : args[0] === 'up' ? 'surface' : null;
      if (!a) return say('Usage: /ledge on|up');
      const res = t.ledge(a);
      if (res === null) return say("You're not at a ledge.");
      return { lines: [a === 'on' ? 'Diving on.' : 'Surfaced.'], changed: res };
    }
    case 'goto': {
      const x = Number(args[0]);
      const z = Number(args[1]);
      if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 1e4 || Math.abs(z) > 1e4) return say('Usage: /goto x z');
      t.place(x, z);
      // Silent: the test hook's teleports go through here, often many times.
      return { lines: [], changed: false };
    }
    case 'time': {
      const k = args[0];
      if (k === 'auto') {
        t.setTime(null);
        return say('Time follows the clock again.');
      }
      if (!Object.hasOwn(TIMES, k)) return say('Usage: /time day|dusk|night|dawn|auto');
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

import { createHash, timingSafeEqual } from 'node:crypto';
import { BAITS, DEEP_SEA_ROD, FISH, LINES, RODS } from '../src/data/content';
import type { MapDef } from '../src/data/maps';
import { ABYSS, BOAT_PARTS, HOLD, ROD, ZONES } from '../src/data/dive';
import { seaDepthFor } from '../src/data/sea';
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
  /** The depth the sea's look follows (`seaDepthFor`), for this player only. */
  setDepth(depth: number): void;
  /**
   * Starts a charter in this zone and Abyss marker (any, open or not) without paying the fee, ending one under way. Its
   * hold is the save's (`/hold`).
   */
  dive(zone: number, marker: number): void;
  /** The charter under way, one fish short of a full hold (its landed count only), so the next landing fills it. False with no charter fishing. */
  fill(): boolean;
  clearDig(): void;
  /** Puts the player at a spot on their map, past the server's move check. */
  place(x: number, z: number): void;
}

export const TIMES: Record<string, number> = { day: 0.2, dusk: 0.5, night: 0.7, dawn: 0.93 };

export const HELP = [
  '/coins N · /chips N · /pearls N · /level N · /rodstep 0-8 · /abysslevel N · /hold 0-4 · /fill · /boat 0-4',
  '/bait <id> [N] · /rod <id> · /line <id> · /fish <id> [cm] [shiny]',
  '/tp <map> · /goto x z · /time day|dusk|night|dawn|auto',
  '/sea <zone 0-4> [marker] (start a charter there, no fee; 0 is the Shelf, 4 the Abyss)',
  '/dig (reset worm cooldown) · /tips (show the new-player tips again) · /smoke (finish the smoker) · /smoke <fish> [N]',
  '/dish <dish> [N] · /smokestats (Smokehouse play test)',
  '/lakestats (chips per lake hour, Shiny Lures and charters, per player)',
  '/resetpass <name> <new password>',
  '/supporter <name> [off] (Ko-fi 💗) · /backpay [apply] · /logout',
];

/** There is no level cap; this only keeps `/level` typos sane. */
const MAX_DEV_LEVEL = 999;
/** Abyss levels have no cap; this keeps `/abysslevel` typos sane. */
const MAX_DEV_ABYSS_LEVEL = 999;
/** The Abyss has no last marker either; this keeps `/sea 4` typos sane. */
const MAX_DEV_MARKER = 999;

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
    case 'rodstep': {
      const n = int(args[0], 0, ROD.steps);
      if (n === null) return say(`Usage: /rodstep 0-${ROD.steps}`);
      s.rodStep = n;
      return ok(`Deep Sea Rod set to step ${n}.`);
    }
    case 'abysslevel': {
      const n = int(args[0], 0, MAX_DEV_ABYSS_LEVEL);
      if (n === null) return say(`Usage: /abysslevel 0-${MAX_DEV_ABYSS_LEVEL}`);
      s.abyssLevels = n;
      return ok(`Deep Sea Rod set to Abyss level ${n}.`);
    }
    case 'hold': {
      const top = HOLD.fish.length - 1;
      const n = int(args[0], 0, top);
      if (n === null) return say(`Usage: /hold 0-${top}`);
      s.holdLevel = n;
      return ok(`Hold set to level ${n}: ${HOLD.fish[n]} fish a charter.`);
    }
    case 'fill':
      // Silent on the save: the charter's view goes to the player with it.
      return t.fill() ? { lines: ['The hold is one fish short of full.'], changed: false } : say('Not on a charter that is fishing.');
    case 'boat': {
      const n = int(args[0], 0, BOAT_PARTS.length);
      if (n === null) return say(`Usage: /boat 0-${BOAT_PARTS.length}`);
      s.boatParts = n;
      return ok(`Boat parts set to ${n}: ${n ? `${ZONES[n].name} and nearer open` : 'the Shelf only'}.`);
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
      if (args[0] === DEEP_SEA_ROD.id) {
        if (s.seaRod) return say(`You already have the ${DEEP_SEA_ROD.name}.`);
        s.seaRod = true;
        return ok(`Added the ${DEEP_SEA_ROD.name} (on Reed's boat).`);
      }
      const r = RODS.find((x) => x.id === args[0]);
      if (!r) return say(`Rod ids: ${ids(RODS)}, ${DEEP_SEA_ROD.id}`);
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
      const zone = int(args[0], 0, ZONES.length - 1);
      const marker = args[1] === undefined ? 1 : int(args[1], 1, MAX_DEV_MARKER);
      if (zone === null || marker === null) return say(`Usage: /sea <zone 0-${ZONES.length - 1}> [marker 1-${MAX_DEV_MARKER}, the Abyss's]`);
      const sea = Object.values(t.maps).find((m) => m.sea);
      if (!sea) return say('There is no sea on this server.');
      const m = zone === ABYSS ? marker : 0;
      t.setDepth(seaDepthFor(zone, m));
      t.dive(zone, m);
      return ok(`Sailing to ${ZONES[zone].name}${zone === ABYSS ? `, marker ${m}` : ''}.`);
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
    case 'tips': {
      // Empties the list of new-player tips seen, so they show again (see `markTip`, `src/game/tips.ts`). The tip
      // nudge's milestones are kept there too, so it comes back after the next level-up.
      if (!s.tips.length) return say('No new-player tips are marked as seen.');
      s.tips = [];
      return ok('New-player tips reset: they show again.');
    }
    default:
      return say(`Unknown command /${cmd}. Try /help.`);
  }
}

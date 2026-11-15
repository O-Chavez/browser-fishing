import { DEEP_SEA_ROD, FISH, byId } from '../src/data/content';
import { ABYSS, DIVE, DIVES_OPEN, type Behaviour } from '../src/data/dive';
import { arrivalSpot, type MapDef } from '../src/data/maps';
import { Drops, PICKUP_RANGE, dropSpot } from '../src/game/drops';
import * as eco from '../src/game/economy';
import { NIGHT_BITE, isNight, nightness } from '../src/game/daynight';
import { fishingSpot, type FishTag } from '../src/game/progression';
import { afterFight, canStart, charterFee, furthestLine, holdFish, isFurthestRecord, markerGrowth, pearlsFor, type Reach } from '../src/game/dive';
import { replayFight, type Gaps, type LossReason, type ReelTune } from '../src/game/reel';
import { placeOf, type CasinoGame, type CasinoRecords, type ClientMsg, type DiveEnd, type FurthestRow, type Gamble, type HallRow, type PlayerInfo, type ServerMsg } from '../src/net/protocol';
import { CASINO_RANGE, ROULETTE_MS, WHEEL_MS, type RouletteBet } from '../src/data/casino';
import * as cas from '../src/game/casino';
import { SMOKE_RANGE, dishById } from '../src/data/smokehouse';
import * as smoke from '../src/game/smoke';
import { newSave, type SaveData, type Slot } from '../src/game/state';
import { markTip } from '../src/game/tips';
import type { Account } from './accounts';
import { ChatGate } from './chat';
import { DevGate, runDev } from './dev';
import { diveEnd, diveView, expired, newRun, type DiveRun } from './dive';
import { lakeOf } from './lakestats';
import type { SmokeStats } from './smokestats';
import { FEEDBACK_KINDS, FeedbackGate, browserName, type FeedbackKind, type FeedbackReport } from './feedback';

export interface Conn {
  /** `json` is `msg` already serialized, passed by broadcasts so it is built once for everyone. */
  send(msg: ServerMsg, json?: string): void;
  /** The browser's user-agent header, for feedback reports. */
  ua?: string;
}

interface Pending {
  fishId: string;
  size: number;
  shiny: boolean;
  /** The fight's reel seed and gaps over the gear, sent with `castok`. */
  seed: number;
  d: Gaps;
  /** When the fish bites: a catch must come at least a whole fight after this. */
  biteAt: number;
  /** A sea fish's behaviour (not rolled while the foundation leaves variety off). */
  b?: Behaviour;
  /** A Feisty or Brutish fish, pond or sea: worth more when landed. */
  tag?: FishTag;
  /** The fight's levers over `P` (`Roll.tune`), for the replay. */
  tune?: ReelTune;
}

interface Member {
  info: PlayerInfo;
  conn: Conn;
  acct: Account;
  pending: Pending | null;
  /** A wheel or roulette spin in flight; its result is applied once the animation ends. */
  spin: { at: number; run: () => void } | null;
  /** A blackjack hand in progress. */
  bj: cas.Blackjack | null;
  /** Logged in to the dev console (this connection only). */
  dev?: boolean;
  /** Dev console time override, as a day fraction. */
  dayFrac?: number | null;
  /** Position changed since the last snap. */
  moved?: boolean;
  /** When this player last jumped, to rate-limit jump relays. */
  jumpAt?: number;
  /** When their buffs last ticked down: buffs only run while the player is online. */
  smokeAt: number;
  /** Metres the player may still move (`MAX_SPEED`, `MOVE_BUDGET`), as of `posAt`. */
  budget: number;
  posAt: number;
  /** Until then, moves too far to make are a stale `pos` from before a teleport, and are dropped without a correction. */
  settleAt: number;
}

const VENDOR_RANGE = 5;
/** A jump lasts about 0.6 s and can't be repeated mid-air, so faster ones are dropped. */
const JUMP_GAP_MS = 450;
/** Leeway on the fight's length against the real time since the bite (clock steps, frame timing). */
const FIGHT_SLACK_MS = 500;
/** Sprint speed with leeway: a player can't move faster than this. */
const MAX_SPEED = 7 * 1.25;
/** Metres of movement that can build up while `pos` messages are delayed and then arrive bunched together. */
const MOVE_BUDGET = 20;
/** How long `pos` messages sent before a teleport may still arrive. */
const SETTLE_MS = 1500;
/** After the bite, a cast dropped with no fight log was the player missing the strike (about 1.4 s), plus the network. */
const MISS_MS = 3000;
/** Coins change nearly every tick on a busy server, so the leaderboard goes out at most this often. */
export const BOARD_MS = 1000;
/** How often the server's clock goes out again, so day and night stay in step if a device's clock changes. */
export const CLOCK_MS = 60_000;
const NO_HALL: HallRow[] = [];
const NO_FURTHEST: FurthestRow[] = [];
const NO_RECORDS: CasinoRecords = { win: null, loss: null };

/** One lobby: its players and their shared drops. Economy actions are validated here. */
export class Room {
  private members = new Map<number, Member>();
  private nextId = 1;
  /** Whether Reed's seaplane takes players out (`DIVES_OPEN`); tests open it. */
  chartersOpen = DIVES_OPEN;
  readonly drops: Drops;
  private maps: Record<string, MapDef>;
  private lastBoard = '';
  private boardAt = -Infinity;
  private clockAt = -Infinity;
  private lastStats = '';
  private lastHall = '';
  private lastHallRows: HallRow[] | null = null;
  /** Supplies the all-accounts leaderboard (set by the server). */
  hall: () => HallRow[] = () => NO_HALL;
  /** Tells the server's hall cache that an online player's level or best catch changed. */
  hallStale: () => void = () => {};
  private lastSea = '';
  private lastFurthest = '';
  private lastFurthestRows: FurthestRow[] | null = null;
  /** The reach of the board's top row as last seen; undefined until the first look, so a server start announces nothing. */
  private topReach: Reach | null | undefined;
  /** Supplies the all-accounts Furthest Out board (set by the server). */
  furthest: () => FurthestRow[] = () => NO_FURTHEST;
  /** Tells the server's Furthest Out cache that an online player's furthest marker or level changed. */
  furthestStale: () => void = () => {};
  /** Chat rules; the server shares one gate between rooms so limits follow the account. */
  chatGate: ChatGate;
  /** Dev console login; off unless the server sets credentials. */
  devGate = new DevGate();
  /** Last dig per account, for the worm patch cooldown. */
  private dugAt = new Map<Account, number>();
  /** Limits on `/bug`, `/idea` and `/feedback`; the server shares one gate between rooms. */
  feedbackGate: FeedbackGate;
  /** Delivers a player's feedback report (the server posts it to Discord). */
  report: (r: FeedbackReport) => void = () => {};
  /** Supporter names for a new joiner; the server points this at the account store. */
  supporters: () => string[] = () => [];
  /** Dev console `/supporter`; the server gives or takes the 💗 and tells every room. */
  setSupporter: (name: string, on: boolean) => string = () => 'No account store.';
  /** Dev console `/resetpass`; the server points this at the account store. */
  resetPass: (name: string, pass: string) => Promise<string> = async () => 'No account store.';
  /** Milliseconds until an account may change its name again; the server points this at the account store. */
  renameWait: (acct: Account) => number = () => 0;
  /** Keeps a settled hand or spin on the account; true when it beat a casino record. The server points this at the account store. */
  recordGamble: (acct: Account, win: boolean, g: Gamble) => boolean = () => false;
  /** The casino's all-time biggest win and loss; the server points this at the account store. */
  records: () => CasinoRecords = () => NO_RECORDS;
  /** Dev console `/backpay`: lists, or with `apply` pays, the XP the old level-50 cap threw away. The server points this at the account store. */
  backPay: (apply: boolean) => string[] = () => ['No account store.'];
  /** The Smokehouse's play-test counters; the server shares one between rooms and saves it with the accounts. */
  smokeStats: SmokeStats | null = null;
  /** Dev console `/smokestats`; the server reports across every room. */
  smokeReport: () => string[] = () => ['No Smokehouse stats on this server.'];
  /** Dev console `/lakestats`; the server reports from the account store. */
  lakeReport: () => string[] = () => ['No lake stats on this server.'];
  /** Scripted runs (smoke, screenshots, trailer): the test hook's teleports may use `/goto` without the dev login. Never on in production. */
  testHooks = false;
  /** Delivers chat lines, notices and casino record updates; the server points this at every room. */
  say: (msg: ServerMsg) => void = (msg) => this.broadcast(msg);

  constructor(
    readonly name: string,
    maps: MapDef[],
    private onChange: () => void = () => {},
    private now: () => number = Date.now,
    private rng: () => number = Math.random,
  ) {
    this.drops = new Drops(now);
    this.chatGate = new ChatGate(now);
    this.feedbackGate = new FeedbackGate(now);
    // No prototype, so a client-sent id like "constructor" finds nothing instead of an Object method.
    this.maps = Object.assign(Object.create(null), Object.fromEntries(maps.map((m) => [m.id, m])));
  }

  get size(): number {
    return this.members.size;
  }

  /** The saves of everyone here, for `/smokestats`. */
  onlineSaves(): SaveData[] {
    return [...this.members.values()].map((m) => m.acct.save);
  }

  /** The player starts where their save says; only `travel` (behind the level gate) moves them between maps. */
  join(conn: Conn, acct: Account, color?: number): number {
    if (color !== undefined) eco.setBodyColor(acct.save, int(color));
    const id = this.nextId++;
    // A charter waits a while for a player who dropped out; after that it has simply ended.
    let run = acct.dive ?? null;
    let sunk: DiveEnd | null = null;
    if (run && expired(run, this.now())) {
      sunk = diveEnd(run, 'away');
      acct.dive = undefined;
      run = null;
      this.onChange();
    }
    const saved = this.maps[acct.save.location];
    // The sea is only for a dive: without one, come back at the pond.
    const map = (run && this.seaMap()) || (saved && !saved.sea ? saved : null) || Object.values(this.maps)[0];
    acct.save.location = map.id;
    const info: PlayerInfo = { id, name: acct.name, map: map.id, x: map.spawn.x, z: map.spawn.z, yaw: 0, look: acct.save.look, coins: acct.save.coins, level: acct.save.level, best: acct.save.best ?? null, title: acct.save.title };
    if (run) {
      run.heldAt = null;
      info.dive = run.id;
    }
    const m: Member = { info, conn, acct, pending: null, spin: null, bj: null, smokeAt: this.now(), budget: MOVE_BUDGET, posAt: this.now(), settleAt: 0 };
    acct.online = true;
    // The smoker kept going while they were away, stages they reached before the Smokehouse open now,
    // and level gifts banked before the Kitchen opened become dishes.
    const smoked = smoke.collect(acct.save, this.now());
    const stages = smoke.openStages(acct.save);
    const gift = smoke.serveGifts(acct.save);
    if (smoked.length || stages.ids.length || gift) this.onChange();
    const it = acct.save.slots[acct.save.held];
    if (it?.k === 'fish') info.act = { a: 'carry', fish: it.fishId, size: it.size, shiny: it.shiny };
    conn.send({
      t: 'welcome',
      id,
      room: this.name,
      save: acct.save,
      name: acct.name,
      players: [...this.members.values()].map((o) => o.info),
      hasPass: !!acct.pw,
      renameIn: this.renameWait(acct),
      now: this.now(),
      ...(run ? { dive: diveView(run) } : {}),
    });
    conn.send({ t: 'drops', list: this.drops.all() });
    conn.send({ t: 'hall', rows: this.hall() });
    conn.send({ t: 'furthest', rows: this.furthest() });
    conn.send({ t: 'supporters', names: this.supporters() });
    conn.send({ t: 'records', records: this.records() });
    this.broadcast({ t: 'joined', player: info });
    // Before adding the member, so everyone else on the server hears it but not the joiner.
    this.say({ t: 'sys', text: `${acct.name} has joined` });
    this.members.set(id, m);
    if (smoked.length) conn.send({ t: 'notice', msg: `🔥 While you were away, Mags smoked your ${smokedText(smoked)}. It's in your Pantry.` });
    if (stages.ids.length) conn.send({ t: 'stages', ...stages });
    if (gift) conn.send({ t: 'notice', msg: smoke.giftText(gift) });
    if (sunk) conn.send({ t: 'diveend', end: sunk });
    return id;
  }

  leave(id: number): void {
    const m = this.members.get(id);
    if (!m) return;
    if (m.spin) m.spin.at = 0;
    if (m.bj) this.bjAct(m, 'stand');
    this.settle(m);
    this.tickSmoke(m);
    // A fish on the line is lost; the dive itself waits for them to come back.
    this.abandon(m);
    const run = this.runOf(m);
    if (run) run.heldAt = this.now();
    this.onChange();
    m.acct.online = false;
    this.members.delete(id);
    this.broadcast({ t: 'left', id });
  }

  handle(id: number, msg: ClientMsg): void {
    const m = this.members.get(id);
    if (!m) return;
    // Chat works mid-spin and mid-hand, so it is handled before those locks.
    if (msg.t === 'chat') return this.chat(m, msg.text);
    if (msg.t === 'cmd') return this.command(m, msg.text);
    // Jumps show mid-spin and mid-hand too.
    if (msg.t === 'jump') return this.jump(m);
    this.settle(m);
    const s = m.acct.save;
    let changed = false;
    if (m.spin && msg.t !== 'pos') return;
    if (m.bj && msg.t !== 'pos' && msg.t !== 'bj') return;
    switch (msg.t) {
      case 'pos':
        if (finite(msg.x, msg.z, msg.yaw)) this.move(m, msg.x, msg.z, msg.yaw);
        return;
      case 'slot':
        // At sea the Deep Sea Rod is the only thing in hand: the hotbar waits as it was until home.
        changed = !this.maps[m.info.map]?.sea && eco.selectSlot(s, int(msg.i));
        break;
      case 'drop':
        changed = this.drop(m);
        break;
      case 'pickup':
        changed = this.pickup(m, int(msg.id));
        break;
      case 'buyrod':
        changed = this.atVendor(m) && this.stocks(m).rods.includes(str(msg.id)) && eco.buyRod(s, str(msg.id));
        break;
      // Captain Reed sells the Deep Sea Rod, its steps and Abyss levels, the hold's levels, the boat parts, and the sea
      // legends' set pieces their landings have unlocked.
      case 'buysearod':
        changed = this.atReed(m) && eco.buySeaRod(s);
        break;
      case 'rodstep':
        changed = this.atReed(m) && this.ok(m, eco.rodBuyError(s)) && eco.buyRodStep(s);
        break;
      case 'abysslevel':
        changed = this.atReed(m) && this.ok(m, eco.rodBuyError(s)) && eco.buyAbyssLevel(s);
        break;
      case 'holdlevel':
        changed = this.atReed(m) && this.ok(m, eco.holdBuyError(s)) && eco.buyHoldLevel(s);
        break;
      case 'boatpart':
        changed = this.atReed(m) && this.ok(m, eco.boatPartError(s)) && eco.buyBoatPart(s);
        break;
      case 'buylegend':
        changed = this.atReed(m) && this.ok(m, eco.legendBuyError(s, str(msg.id))) && eco.buyLegendPiece(s, str(msg.id));
        break;
      case 'buyline':
        changed = this.atVendor(m) && this.stocks(m).lines.includes(str(msg.id)) && eco.buyLine(s, str(msg.id));
        break;
      case 'buybait':
        changed = this.atVendor(m) && this.stocks(m).bait.includes(str(msg.id)) && eco.buyBait(s, str(msg.id));
        break;
      case 'equiprod':
        changed = eco.equipRod(s, str(msg.id));
        break;
      case 'equipbait':
        changed = eco.equipBait(s, str(msg.id));
        break;
      case 'bottle': {
        const town = this.maps[m.info.map]?.town;
        const b = town?.bottles.find((x) => x.id === msg.id);
        changed = !!b && Math.hypot(m.info.x - b.x, m.info.z - b.z) <= 4 && eco.collectBottle(s, b.id, town!.bottles.map((x) => x.id)) > 0;
        break;
      }
      case 'dig':
        changed = this.dig(m);
        break;
      case 'sell':
        changed = this.atVendor(m) && (msg.i === undefined ? eco.sellHeld(s) : eco.sellSlot(s, int(msg.i)));
        break;
      case 'buycos': {
        // The counter decides the currency: coins at the stall, chips at the casino prize counter.
        const at = this.atVendor(m) ? 'stall' : this.atCasino(m, 'prizes') ? 'casino' : null;
        changed = !!at && eco.buyCosmetic(s, str(msg.id), at);
        break;
      }
      case 'equip':
        changed = eco.equipCosmetic(s, msg.slot, msg.id === null ? null : str(msg.id));
        break;
      case 'color':
        changed = eco.setBodyColor(s, int(msg.color));
        break;
      case 'face':
        changed = eco.setFace(s, msg.id);
        break;
      case 'tip':
        changed = markTip(s, msg.id);
        break;
      case 'smoke': {
        const it = s.slots[int(msg.i)];
        changed = this.atSmoker(m) && this.ok(m, smoke.smokeFish(s, int(msg.i), this.now()));
        if (changed && it?.k === 'fish') this.smokeStats?.fish('smoked', byId(FISH, it.fishId).tier);
        break;
      }
      case 'smokeall': {
        const tiers = smoke.smokeAllSlots(s).map((i) => byId(FISH, (s.slots[i] as { fishId: string }).fishId).tier);
        changed = this.atSmoker(m) && this.ok(m, smoke.smokeAll(s, this.now()));
        if (changed) for (const t of tiers) this.smokeStats?.fish('smoked', t);
        break;
      }
      case 'sellsmoked': {
        const id = str(msg.id);
        const n = msg.all === true ? smoke.pantryCount(s, id) : 1;
        changed = this.atSmoker(m) && this.ok(m, smoke.sellSmoked(s, id, msg.all === true));
        if (changed) this.smokeStats?.fish('sold', byId(FISH, id).tier, n);
        break;
      }
      case 'eat': {
        const id = str(msg.id);
        const n = smoke.pantryCount(s, id);
        changed = !this.maps[m.info.map]?.casino && this.ok(m, smoke.eat(s, id, msg.all === true));
        if (changed) this.smokeStats?.fish('snacks', byId(FISH, id).tier, n - smoke.pantryCount(s, id));
        break;
      }
      case 'cook':
        changed = this.atSmoker(m) && this.ok(m, smoke.cook(s, msg.id));
        if (changed) this.smokeStats?.cooked(dishById(msg.id)!.id);
        break;
      case 'eatdish':
        changed = !this.maps[m.info.map]?.casino && this.ok(m, smoke.eatDish(s, msg.id));
        if (changed) this.smokeStats?.eaten(dishById(msg.id)!.id);
        break;
      case 'lure':
        changed = eco.setLure(s, msg.on);
        break;
      case 'title':
        changed = eco.setTitle(s, msg.id === null ? null : str(msg.id));
        if (changed) {
          m.info.title = s.title;
          this.broadcast({ t: 'title', id, title: s.title });
          this.hallStale();
        }
        break;
      case 'reset':
        m.pending = null;
        if (this.runOf(m)) this.endDive(m, diveEnd(m.acct.dive!, 'quit'));
        this.resetAccount(m);
        changed = true;
        break;
      case 'wheel':
        this.wheel(m, int(msg.i));
        return;
      case 'travel':
        changed = this.travel(m, str(msg.to));
        break;
      case 'roulette':
        this.roulette(m, msg.bet, int(msg.i));
        return;
      case 'bj':
        this.bj(m, msg.a, msg.i);
        return;
      case 'cashout':
        if (this.atCasino(m, 'prizes')) {
          const bad = cas.cashOutError(s, int(msg.i));
          if (bad) m.conn.send({ t: 'notice', msg: bad });
          else {
            const chips = cas.cashOut(s, int(msg.i));
            changed = chips > 0;
            lakeOf(m.acct).chips += chips;
          }
        }
        break;
      case 'cashoutall':
        if (this.atCasino(m, 'prizes')) {
          const chips = cas.cashOutAll(s);
          changed = chips > 0;
          lakeOf(m.acct).chips += chips;
        }
        break;
      case 'buyperk': {
        const lures = s.lure;
        changed = this.atCasino(m, 'prizes') && eco.buyPerk(s, str(msg.id), msg.count === undefined ? 1 : typeof msg.count === 'number' ? msg.count : NaN);
        if (s.lure > lures) lakeOf(m.acct).bought += s.lure - lures;
        break;
      }
      case 'cast':
        changed = this.cast(m, msg.x, msg.z, msg.perfect === true);
        break;
      case 'catch':
        changed = this.land(m, msg.h);
        break;
      case 'lost': {
        const p = m.pending;
        if (p || m.info.act) this.setAct(m, null);
        m.pending = null;
        this.syncCarry(m);
        if (!p) return;
        // On a charter, a fish that got away is counted in the tally. At the pond a fish lost to a gear wall is noted in the Fishdex, but
        // only if the replayed log shows a fight that ended in a snap or a run-off: a cast reeled in early saw nothing.
        if (!this.runOf(m)) {
          const fight = typeof msg.h === 'string' && msg.h ? replayFight(p.d, p.seed, msg.h, p.tune) : null;
          if (!fight || (fight.status !== 'snapped' && fight.status !== 'escaped') || !eco.recordSighting(s, byId(FISH, p.fishId))) return;
          changed = true;
          break;
        }
        if (!this.seaLost(m, p, msg.h)) return;
        changed = true;
        break;
      }
      case 'dive':
        changed = this.startDive(m, msg.zone, msg.marker ?? 0);
        break;
      case 'headhome':
        changed = this.headHome(m);
        break;
    }
    if (changed && (msg.t === 'slot' || msg.t === 'drop' || msg.t === 'pickup' || msg.t === 'sell' || msg.t === 'smoke' || msg.t === 'smokeall')) this.syncCarry(m);
    if (changed && (msg.t === 'equip' || msg.t === 'color' || msg.t === 'face')) this.broadcast({ t: 'look', id, look: s.look });
    if (changed) {
      this.onChange();
    }
    m.conn.send({ t: 'state', save: m.acct.save });
  }

  /** Wipes progress but keeps the name, token, body color and face. Mutates in place: info.look aliases save.look. */
  private resetAccount(m: Member): void {
    const s = m.acct.save;
    const look = s.look;
    const { color, face } = look;
    Object.assign(s, newSave());
    Object.assign(look, newSave().look, { color, face });
    s.look = look;
    this.setAct(m, null);
    this.broadcast({ t: 'look', id: m.info.id, look });
    m.info.title = null;
    this.broadcast({ t: 'title', id: m.info.id, title: null });
  }

  private stocks(m: Member): { rods: string[]; lines: string[]; bait: string[] } {
    return this.maps[m.info.map]?.stock ?? { rods: [], lines: [], bait: [] };
  }

  /** Applies a finished spin. */
  private settle(m: Member): void {
    if (!m.spin || this.now() < m.spin.at) return;
    const { run } = m.spin;
    m.spin = null;
    run();
    this.syncCarry(m);
    this.onChange();
    m.conn.send({ t: 'state', save: m.acct.save });
  }

  private atCasino(m: Member, what: 'roulette' | 'blackjack' | 'wheel' | 'prizes'): boolean {
    const spot = this.maps[m.info.map]?.casino?.[what];
    return !!spot && Math.hypot(m.info.x - spot.x, m.info.z - spot.z) <= CASINO_RANGE;
  }

  /** Gate travel between the pond and the casino. */
  private travel(m: Member, to: string): boolean {
    const from = this.maps[m.info.map];
    const dest = this.maps[to];
    const s = m.acct.save;
    if (!from || !dest || dest.id === from.id) return false;
    if (Math.hypot(m.info.x - from.gate.x, m.info.z - from.gate.z) > CASINO_RANGE + 2) return false;
    const back = !!from.casino && from.next?.id === dest.id;
    const forward = !from.casino && from.next?.id === dest.id;
    if (!forward && !back) return false;
    if (forward && s.level < (dest.minLevel ?? 1)) return this.deny(m, `${dest.name} needs level ${dest.minLevel}.`);
    this.teleport(m, dest.id);
    return true;
  }

  private chat(m: Member, text: unknown): void {
    const res = this.chatGate.check(m.info.name, text);
    if (!res.ok) {
      if (res.msg) m.conn.send({ t: 'notice', msg: res.msg });
      return;
    }
    this.say({ t: 'chat', room: this.name, id: m.info.id, name: m.info.name, map: m.info.map, text: res.text });
  }

  private feedback(m: Member, kind: FeedbackKind, text: string, reply: (lines: string[], extra: { sent: boolean }) => void): void {
    const res = this.feedbackGate.check(m.acct.name, kind, text);
    if (!res.ok) return reply([res.msg], { sent: false });
    const { info } = m;
    const map = this.maps[info.map]?.name ?? info.map;
    this.report({ kind, text: res.text, name: m.acct.name, level: m.acct.save.level, map, x: info.x, z: info.z, room: this.name, browser: browserName(m.conn.ua), at: this.now() });
    reply([kind === 'bug' ? 'Thanks! Your bug report was sent to the developer.' : kind === 'idea' ? 'Thanks! Your idea was sent to the developer.' : 'Thanks! Your feedback was sent to the developer.'], { sent: true });
  }

  /** Slash commands: `/bug`, `/idea` and `/feedback` for everyone; `/login user pass` unlocks the dev console for this connection. */
  private command(m: Member, text: unknown): void {
    if (typeof text !== 'string' || !text.startsWith('/')) return;
    const [cmd = '', ...args] = text.slice(1, 200).trim().split(/\s+/);
    const reply = (lines: string[], extra: { time?: number | null; depth?: number; sent?: boolean } = {}) => m.conn.send({ t: 'dev', lines, ...extra });
    const kind = cmd.toLowerCase() as FeedbackKind;
    if (FEEDBACK_KINDS.includes(kind)) return this.feedback(m, kind, text.replace(/^\/\S*\s*/, ''), reply);
    if (cmd === 'login') {
      const bad = this.devGate.login(m.acct.name, args[0] ?? '', args[1] ?? '');
      console.log(`[dev] ${m.acct.name} login ${bad ? 'failed' : 'ok'}`);
      if (bad) return reply([bad]);
      m.dev = true;
      return reply(['Dev console unlocked. /help lists the commands.']);
    }
    const hook = this.testHooks && cmd === 'goto';
    if (!m.dev && !hook) return reply(['Unknown command. Send feedback with /bug <what went wrong> or /idea <your idea>.']);
    if (cmd === 'logout') {
      m.dev = false;
      return reply(['Logged out of the dev console.']);
    }
    if (cmd === 'supporter') {
      const off = args.length > 1 && /^(off|remove)$/i.test(args[args.length - 1]);
      const who = (off ? args.slice(0, -1) : args).join(' ');
      if (!who) return reply(['Usage: /supporter <name> [off]']);
      console.log(`[dev] ${m.acct.name}: ${text.slice(0, 200)}`);
      return reply([this.setSupporter(who, !off)]);
    }
    if (cmd === 'smokestats') return reply(this.smokeReport());
    if (cmd === 'lakestats') return reply(this.lakeReport());
    if (cmd === 'backpay') {
      console.log(`[dev] ${m.acct.name}: ${text.slice(0, 200)}`);
      return reply(this.backPay(args[0] === 'apply'));
    }
    if (cmd === 'resetpass') {
      // The last word is the password, so names with spaces work; it never reaches the log.
      if (args.length < 2) return reply(['Usage: /resetpass <name> <new password>']);
      const who = args.slice(0, -1).join(' ');
      console.log(`[dev] ${m.acct.name}: /resetpass ${who}`);
      void this.resetPass(who, args[args.length - 1]).then((line) => reply([line]));
      return;
    }
    if (!hook) console.log(`[dev] ${m.acct.name}: ${text.slice(0, 200)}`);
    if (m.spin || m.bj) return reply(['Finish the spin or hand first.']);
    let time: number | null | undefined;
    let depth: number | undefined;
    const wore = JSON.stringify(m.acct.save.look);
    const res = runDev({
      save: m.acct.save,
      maps: this.maps,
      teleport: (map) => this.teleport(m, map),
      setTime: (f) => { m.dayFrac = time = f; },
      setDepth: (d) => { depth = d; },
      dive: (zone, marker) => {
        m.acct.dive = undefined;
        m.pending = null;
        this.launch(m, zone, marker, true);
      },
      fill: () => {
        const run = this.runOf(m);
        if (!run || run.dive.state !== 'fishing') return false;
        run.dive.tally.landed = Math.max(run.dive.tally.landed, run.dive.hold - 1);
        m.conn.send({ t: 'divestate', dive: diveView(run) });
        return true;
      },
      clearDig: () => this.dugAt.delete(m.acct),
      place: (x, z) => this.place(m.info.id, x, z),
    }, cmd.toLowerCase(), args);
    // Before the new save: the client builds the sea for this depth when the save moves it there.
    reply(res.lines, { ...(time === undefined ? {} : { time }), ...(depth === undefined ? {} : { depth }) });
    if (!res.changed) return;
    this.syncCarry(m);
    this.onChange();
    m.conn.send({ t: 'state', save: m.acct.save });
    // `/landed` can take back a piece being worn.
    if (JSON.stringify(m.acct.save.look) !== wore) this.broadcast({ t: 'look', id: m.info.id, look: m.acct.save.look });
  }

  /** After `/backpay apply`: an online player gets their new save and hears what it paid. */
  paidBack(acct: Account, levels: number): void {
    for (const m of this.members.values()) {
      if (m.acct !== acct) continue;
      m.conn.send({ t: 'state', save: acct.save });
      if (levels > 0) m.conn.send({ t: 'notice', msg: `⚓ Back pay: your catches since level 50 earned you ${levels} level${levels === 1 ? '' : 's'}!` });
    }
  }

  /** Moves a player to another map (or a dive's sea, with `info.dive` set first). A dive ends before it leaves the sea. */
  private teleport(m: Member, map: string): void {
    const dest = this.maps[map];
    const at = arrivalSpot(dest, m.info.map);
    m.pending = null;
    m.acct.save.location = dest.id;
    m.info.map = dest.id;
    // Leaving the sea leaves the dive (the dev console's /tp; a dive's own end has already cleared it).
    if (!dest.sea) {
      delete m.info.dive;
      m.acct.dive = undefined;
    }
    m.info.x = at.x;
    m.info.z = at.z;
    m.moved = true;
    m.budget = 0;
    m.posAt = this.now();
    m.settleAt = this.now() + SETTLE_MS;
    this.broadcast({ t: 'moved', id: m.info.id, map: dest.id, ...(m.info.dive ? { dive: m.info.dive } : {}) });
    // Snaps only carry players who moved, so the arrival gets everyone already standing on the new map.
    const place = placeOf(m.info);
    const here = [...this.members.values()].filter((o) => o !== m && placeOf(o.info) === place);
    if (here.length) m.conn.send({ t: 'snap', p: here.map(snapEntry) });
  }

  /**
   * Takes a move on trust only as far as the player could have walked: the distance budget refills at sprint speed
   * (with leeway, and up to `MOVE_BUDGET` for messages that arrive bunched up), and the map's edge bounds it. A move
   * past the budget stops short, and the player is sent back there.
   */
  private move(m: Member, x: number, z: number, yaw: number): void {
    const now = this.now();
    m.budget = Math.min(MOVE_BUDGET, m.budget + ((now - m.posAt) / 1000) * MAX_SPEED);
    m.posAt = now;
    const edge = (this.maps[m.info.map]?.radius ?? Infinity) + 1;
    const r = Math.hypot(x, z);
    let fixed = r > edge;
    if (fixed) {
      x *= edge / r;
      z *= edge / r;
    }
    const dx = x - m.info.x;
    const dz = z - m.info.z;
    const dist = Math.hypot(dx, dz);
    if (dist > m.budget) {
      if (now < m.settleAt) return;
      x = m.info.x + (dx * m.budget) / dist;
      z = m.info.z + (dz * m.budget) / dist;
      fixed = true;
    }
    m.budget = Math.max(0, m.budget - dist);
    Object.assign(m.info, { x, z, yaw });
    m.moved = true;
    if (fixed) m.conn.send({ t: 'pos', x: round(x), z: round(z) });
  }

  /** Moves a player without the speed check, for tests and server-side placement. */
  place(id: number, x: number, z: number, yaw?: number): void {
    const m = this.members.get(id);
    if (!m) return;
    Object.assign(m.info, { x, z, yaw: yaw ?? m.info.yaw });
    m.moved = true;
  }

  private seaMap(): MapDef | undefined {
    return Object.values(this.maps).find((x) => x.sea);
  }

  /** The charter this member is on, if any. */
  private runOf(m: Member): DiveRun | null {
    const run = m.acct.dive;
    return run && m.info.dive === run.id ? run : null;
  }

  /** Close enough to Captain Reed to start a charter or buy from him; says where he is if not. */
  private atReed(m: Member): boolean {
    const h = this.maps[m.info.map]?.harbour;
    return (!!h && Math.hypot(m.info.x - h.stand.x, m.info.z - h.stand.z) <= DIVE.standRange) || this.deny(m, "Captain Reed's seaplane is on the west beach.");
  }

  /**
   * Starts a charter at Captain Reed's seaplane for a player who owns the Deep Sea Rod: in an open zone, and in the
   * Abyss at a marker up to the furthest (`canStart`), paying the zone's fee (`charterFee`).
   */
  private startDive(m: Member, zone: unknown, marker: unknown): boolean {
    const s = m.acct.save;
    if (!this.atReed(m) || m.acct.dive || m.pending) return false;
    if (!this.chartersOpen) return this.deny(m, "Reed's still working on his seaplane. Charters open soon!");
    if (!eco.ownsSeaRod(s)) return this.deny(m, `Charters need the ${DEEP_SEA_ROD.name}.`);
    if (!canStart(s, zone, marker)) return this.deny(m, zone === ABYSS ? 'Reed sails to any Abyss marker up to your furthest.' : "Reed only sails to the zones your boat is fitted for.");
    const z = zone as number;
    const fee = charterFee(z);
    if (s.coins < fee) return this.deny(m, `A charter here costs ${fee.toLocaleString('en-US')} coins.`);
    s.coins -= fee;
    return this.launch(m, z, marker as number);
  }

  /**
   * Puts the player on a new charter's sea, with the hold their save's level takes (`holdFish`), fixed for the charter.
   * `free`: the dev console's, whose tally shows no fee. The charter's state goes first, so the sea is built for its zone.
   */
  private launch(m: Member, zone: number, marker: number, free = false): boolean {
    const sea = this.seaMap();
    if (!sea) return false;
    const run = newRun(zone, marker, m.acct.name, eco.seaRod(m.acct.save), holdFish(m.acct.save.holdLevel));
    if (free) run.dive.tally.fee = 0;
    m.acct.dive = run;
    m.info.dive = run.id;
    this.noteAbyss(m, run);
    this.setAct(m, null);
    m.conn.send({ t: 'divestate', dive: diveView(run) });
    this.teleport(m, sea.id);
    return true;
  }

  /** Keeps the furthest Abyss marker a charter has reached on the save (`abyssRecord`). */
  private noteAbyss(m: Member, run: DiveRun): void {
    const s = m.acct.save;
    if (run.dive.zone === ABYSS && run.dive.marker > s.abyssRecord) s.abyssRecord = run.dive.marker;
  }

  /** Ends the charter and flies home, at any time outside a fight: a cast still waiting for its bite is reeled in. Nothing is lost. */
  private headHome(m: Member): boolean {
    const run = this.runOf(m);
    if (!run || (m.pending && this.now() >= m.pending.biteAt)) return false;
    if (m.pending) {
      m.pending = null;
      this.setAct(m, null);
    }
    this.endDive(m, diveEnd(run, 'home'));
    return true;
  }

  /** Ends the charter and brings the player back to the harbour; the new save follows from the caller. */
  private endDive(m: Member, end: DiveEnd): void {
    m.acct.dive = undefined;
    delete m.info.dive;
    m.conn.send({ t: 'diveend', end });
    const home = Object.values(this.maps).find((x) => x.harbour) ?? Object.values(this.maps)[0];
    this.teleport(m, home.id);
    this.onChange();
  }

  /**
   * Applies a finished fight to the charter: a landed fish's pearls (`pearlsFor`, with its tag and whether it's a
   * legend or shiny) go to the save now, beside the coins it sold for (`coins`), and the fish goes in the tally
   * (`afterFight`): a landed one takes its place in the hold, and a shiny is counted. The pearls are kept as `gain` for the HUD. An Abyss marker
   * reached is kept as the record.
   */
  private fightOver(m: Member, run: DiveRun, p: Pending, landed: boolean, coins = 0, lost?: LossReason | 'gone'): void {
    const d = run.dive;
    const pearls = landed ? pearlsFor(d.zone, d.marker, { tag: p.tag ?? null, legend: !!byId(FISH, p.fishId).legend, shiny: p.shiny }) : 0;
    if (landed) m.acct.save.pearls += pearls;
    if (pearls > 0) lakeOf(m.acct).pearls += pearls;
    const res = afterFight(d, landed ? { pearls, coins, shiny: p.shiny } : null);
    run.gain = landed ? pearls : undefined;
    run.lost = lost;
    if (res.marker) this.noteAbyss(m, run);
    m.conn.send({ t: 'divestate', dive: diveView(run) });
  }

  /**
   * A fish lost on a charter. With no button log, a cast dropped soon after the bite missed the strike and costs
   * nothing; anything else was hooked, and is a fish that got away (it takes no place in the hold). True if the
   * charter changed.
   */
  private seaLost(m: Member, p: Pending, h: unknown): boolean {
    const run = this.runOf(m)!;
    const fight = typeof h === 'string' && h ? replayFight(p.d, p.seed, h, p.tune) : null;
    if (!fight && this.now() < p.biteAt + MISS_MS) return false;
    const ended = fight && (fight.status === 'snapped' || fight.status === 'escaped');
    this.fightOver(m, run, p, false, 0, ended ? fight.reason ?? 'gone' : 'gone');
    // A fish lost over the gear in a fight the log shows is noted in the Fishdex, as at the pond.
    if (ended) eco.recordSeaSighting(m.acct.save, byId(FISH, p.fishId), p.d);
    return true;
  }

  /** Drops the fish on the line: on a charter, one that had bitten is lost (leaving or recasting mid-fight). */
  private abandon(m: Member): void {
    const p = m.pending;
    m.pending = null;
    const run = this.runOf(m);
    if (p && run && this.now() >= p.biteAt + MISS_MS) this.fightOver(m, run, p, false, 0, 'gone');
  }

  private deny(m: Member, msg: string): false {
    m.conn.send({ t: 'notice', msg });
    return false;
  }

  private roulette(m: Member, bet: RouletteBet, i: number): void {
    if (!this.atCasino(m, 'roulette') || !['red', 'black', 'green'].includes(bet)) return;
    const bad = cas.betError(m.acct.save, i);
    if (bad) return m.conn.send({ t: 'notice', msg: bad });
    const r = cas.spinRoulette(bet, this.rng);
    m.spin = {
      at: this.now() + ROULETTE_MS,
      run: () => {
        const fish = m.acct.save.slots[i];
        const { before, after } = cas.settleBet(m.acct.save, i, r.factor);
        if (fish?.k === 'fish') this.gambled(m, 'roulette', fish, cas.netWin(before, after));
        this.syncCarry(m);
      },
    };
    m.conn.send({ t: 'roulette', ...r, ms: ROULETTE_MS });
  }

  private wheel(m: Member, i: number): void {
    if (!this.atCasino(m, 'wheel')) return;
    const bad = cas.betError(m.acct.save, i);
    if (bad) return m.conn.send({ t: 'notice', msg: bad });
    const r = cas.spinWheel(this.rng);
    m.spin = {
      at: this.now() + WHEEL_MS,
      run: () => {
        const fish = m.acct.save.slots[i];
        const { before, after } = cas.settleBet(m.acct.save, i, r.factor);
        if (fish?.k === 'fish') this.gambled(m, 'wheel', fish, cas.netWin(before, after));
        this.syncCarry(m);
      },
    };
    m.conn.send({ t: 'wheel', ...r, ms: WHEEL_MS });
  }

  private bj(m: Member, a: 'deal' | 'hit' | 'stand' | 'double', i?: number): void {
    if (a === 'deal') {
      const slot = int(i);
      if (m.bj || !this.atCasino(m, 'blackjack')) return;
      const bad = cas.betError(m.acct.save, slot);
      if (bad) return m.conn.send({ t: 'notice', msg: bad });
      const g = cas.dealBlackjack(slot, this.rng);
      m.bj = g;
      m.acct.save.held = slot;
      m.conn.send({ t: 'bj', view: cas.blackjackView(g) });
      this.bjDone(m);
      return;
    }
    if (!m.bj || !this.atCasino(m, 'blackjack')) return;
    this.bjAct(m, a);
  }

  private bjAct(m: Member, a: 'hit' | 'stand' | 'double'): void {
    const g = m.bj;
    if (!g) return;
    if (a === 'double') {
      // Doubling down pays its stake in coins, so it can be refused.
      const bad = cas.doubleDown(m.acct.save, g);
      if (bad) return m.conn.send({ t: 'notice', msg: bad });
    } else if (!cas.actBlackjack(g, a)) return;
    m.conn.send({ t: 'bj', view: cas.blackjackView(g) });
    this.bjDone(m);
  }

  /**
   * Pays out a finished hand and frees the table. Callers send the hand first, so the client knows to
   * hold this new save back until it has dealt the last card.
   */
  private bjDone(m: Member): void {
    const g = m.bj;
    if (!g?.done) return;
    m.bj = null;
    const fish = m.acct.save.slots[g.slot];
    const net = cas.settleBlackjack(m.acct.save, g);
    if (fish?.k === 'fish') this.gambled(m, 'blackjack', fish, net);
    this.syncCarry(m);
    this.onChange();
    m.conn.send({ t: 'state', save: m.acct.save });
  }

  /** Hands a settled hand or spin to the casino record board, and tells every room when a record falls. */
  private gambled(m: Member, game: CasinoGame, fish: Extract<Slot, { k: 'fish' }>, net: number): void {
    if (!net) return;
    const g: Gamble = { amount: Math.abs(net), game, fishId: fish.fishId, ...(fish.shiny ? { shiny: true } : {}), at: this.now() };
    if (this.recordGamble(m.acct, net > 0, g)) this.say({ t: 'records', records: this.records() });
  }

  private dig(m: Member): boolean {
    const w = this.maps[m.info.map]?.worms;
    if (!w || Math.hypot(m.info.x - w.x, m.info.z - w.z) > eco.DIG_RANGE + 1) return this.deny(m, 'Get closer to the worm patch to dig.');
    const last = this.dugAt.get(m.acct);
    if (last !== undefined && this.now() - last < eco.DIG_COOLDOWN_MS) return this.deny(m, eco.DIG_WAIT);
    if (eco.digWorms(m.acct.save) <= 0) return this.deny(m, 'Only anglers with no bait and no coins to buy some can dig here.');
    this.dugAt.set(m.acct, this.now());
    return true;
  }

  private atSmoker(m: Member): boolean {
    const c = this.maps[m.info.map]?.smokehouse;
    return (!!c && Math.hypot(m.info.x - c.x, m.info.z - c.z) <= SMOKE_RANGE) || this.deny(m, "Get closer to Mags's counter.");
  }

  /** True when a rule check passed; otherwise tells the player why not. */
  private ok(m: Member, why: string | null): boolean {
    if (why) m.conn.send({ t: 'notice', msg: why });
    return !why;
  }

  /** Runs the snack down by the online time since the last tick and moves finished fish to the Pantry. */
  private tickSmoke(m: Member): void {
    const now = this.now();
    const s = m.acct.save;
    const worn = smoke.tickBuffs(s, now - m.smokeAt);
    // Online time for `/lakestats`, by where they spent it: on a charter or at the lake side.
    lakeOf(m.acct)[this.runOf(m) ? 'seaSec' : 'lakeSec'] += (now - m.smokeAt) / 1000;
    m.smokeAt = now;
    const done = smoke.collect(s, now);
    if (done.length) m.conn.send({ t: 'notice', msg: `🔥 Smoked ${smokedText(done)}: it's in your Pantry.` });
    if (worn.snack) m.conn.send({ t: 'notice', msg: 'Your snack wore off. Mags has more at the Smokehouse.' });
    if (worn.dish) m.conn.send({ t: 'notice', msg: 'Your dish wore off. Mags cooks more in her Kitchen.' });
    // Buffs running down only reach the save file when one runs out, or with the next real change.
    if (!worn.snack && !worn.dish && !done.length) return;
    this.onChange();
    m.conn.send({ t: 'state', save: s });
  }

  private atVendor(m: Member): boolean {
    const v = this.maps[m.info.map]?.vendor.shop;
    return !!v && Math.hypot(m.info.x - v.x, m.info.z - v.z) <= VENDOR_RANGE;
  }

  private cast(m: Member, x: number, z: number, perfect = false): boolean {
    const map = this.maps[m.info.map];
    if (map.casino) {
      m.conn.send({ t: 'castfail', msg: 'No fishing in the casino.' });
      return false;
    }
    if (map.sea) return this.seaCast(m, x, z);
    const can = finite(x, z) ? eco.canCast(m.acct.save) : 'nobait';
    if (can !== 'ok' || !eco.spendBait(m.acct.save)) {
      m.conn.send({ t: 'castfail', msg: eco.CAST_MESSAGES[can === 'ok' ? 'nobait' : can] });
      return false;
    }
    const lures = m.acct.save.lure;
    const roll = eco.rollCast(m.acct.save, map.locationId, this.rng, perfect, fishingSpot(m.info.x, m.info.z), m.dayFrac != null ? nightness(m.dayFrac) >= NIGHT_BITE : isNight(this.now() / 1000));
    if (m.acct.save.lure < lures) lakeOf(m.acct).lakeLures += lures - m.acct.save.lure;
    m.pending = roll.fishId ? { fishId: roll.fishId, size: roll.size, shiny: !!roll.shiny, seed: roll.seed!, d: roll.d!, biteAt: this.now() + roll.wait * 1000, ...(roll.tag ? { tag: roll.tag } : {}), ...(roll.tune ? { tune: roll.tune } : {}) } : null;
    m.conn.send({ t: 'castok', ...roll });
    this.setAct(m, { a: 'cast', x, z });
    return true;
  }

  /** A cast on a charter: no bait, and the fish and its fight come from the charter's zone, marker and rod. */
  private seaCast(m: Member, x: number, z: number): boolean {
    const s = m.acct.save;
    const fail = (msg: string) => {
      m.conn.send({ t: 'castfail', msg });
      return false;
    };
    const run = this.runOf(m);
    if (!run) return fail("You're not on a charter. Book one at Captain Reed's stand.");
    if (run.dive.state !== 'fishing') return fail('Your hold is full: head home.');
    const can = finite(x, z) ? eco.canCastAt(s, true) : 'hands';
    if (can !== 'ok') return fail(eco.CAST_MESSAGES[can]);
    this.abandon(m);
    if (!this.runOf(m)) return true;
    const lures = s.lure;
    const roll = eco.rollSeaCast(s, run.dive.zone, run.dive.marker, run.dive.rod, this.rng);
    const lake = lakeOf(m.acct);
    lake.seaLures += lures - s.lure;
    if (roll.fishId) lake.seaHooks++;
    m.pending = { fishId: roll.fishId!, size: roll.size, shiny: !!roll.shiny, seed: roll.seed!, d: roll.d!, biteAt: this.now() + roll.wait * 1000, ...(roll.b ? { b: roll.b } : {}), ...(roll.tag ? { tag: roll.tag } : {}), ...(roll.tune ? { tune: roll.tune } : {}) };
    m.conn.send({ t: 'castok', ...roll });
    this.setAct(m, { a: 'cast', x, z });
    return true;
  }

  /**
   * Completes the pending catch if replaying the fight from its seed and the button log `h` lands the fish, and the
   * fight fits in the time since the bite. On a charter the fish is sold as it lands and pays its pearls.
   */
  private land(m: Member, h: unknown): boolean {
    const p = m.pending;
    m.pending = null;
    if (!p) {
      this.setAct(m, null);
      return false;
    }
    const run = this.runOf(m);
    const fight = typeof h === 'string' ? replayFight(p.d, p.seed, h, p.tune) : null;
    const why = !fight ? 'bad log' : fight.status !== 'caught' ? `replay ${fight.status}`
      : this.now() < p.biteAt + fight.elapsed * 1000 - FIGHT_SLACK_MS ? 'too fast' : null;
    if (!fight || why) {
      console.warn(`catch refused (${why}): ${m.acct.name}, ${p.fishId} at gaps ${JSON.stringify(p.d)}`);
      this.setAct(m, null);
      // On a charter, a fish that wasn't really landed was still hooked: it counts as one that got away.
      if (run) this.fightOver(m, run, p, false, 0, fight?.reason ?? 'gone');
      return !!run;
    }
    // On a charter the fish is sold as it's landed (the hotbar couldn't hold a charter's catch), worth more each Abyss marker.
    const grow = run ? markerGrowth(run.dive.zone, run.dive.marker) : 1;
    const res = eco.applyCatch(m.acct.save, byId(FISH, p.fishId), p.size, p.shiny, fight.clean, !!run, p.tag ?? null, grow);
    if (!res.stored) {
      this.setAct(m, null);
      return false;
    }
    for (const r of res.ranks) this.say({ t: 'sys', text: `⚓ ${m.acct.name} made ${r.title}!` });
    this.setAct(m, { a: 'hold', fish: p.fishId, size: p.size, shiny: p.shiny, ...(res.record ? { rec: true as const } : {}), ...(res.mult > 1 ? { mult: res.mult } : {}) });
    if (run) this.fightOver(m, run, p, true, res.sold ?? 0);
    return true;
  }

  private drop(m: Member): boolean {
    // Anything dropped at sea would go over the side (and into other dives' sea).
    if (m.pending || (m.info.act && m.info.act.a !== 'carry') || this.maps[m.info.map]?.sea) return false;
    const item = eco.dropHeld(m.acct.save);
    if (!item) return false;
    const at = dropSpot(m.info.x, m.info.z, m.info.yaw);
    this.drops.add(m.info.map, at.x, at.z, item);
    this.broadcast({ t: 'drops', list: this.drops.all() });
    return true;
  }

  private pickup(m: Member, id: number): boolean {
    const d = this.drops.get(id);
    if (!d || d.map !== m.info.map || Math.hypot(d.x - m.info.x, d.z - m.info.z) > PICKUP_RANGE + 1) return false;
    if (!eco.takeItem(m.acct.save, d.item)) return false;
    this.drops.remove(id);
    this.broadcast({ t: 'drops', list: this.drops.all() });
    return true;
  }

  /** Shows the fish in hand on this player's avatar, unless they are mid-cast. */
  private syncCarry(m: Member): void {
    const a = m.info.act;
    if (a && a.a !== 'carry') return;
    const it = m.acct.save.slots[m.acct.save.held];
    if (it?.k === 'fish') this.setAct(m, { a: 'carry', fish: it.fishId, size: it.size, shiny: it.shiny });
    else if (a) this.setAct(m, null);
  }

  private setAct(m: Member, act: PlayerInfo['act'] | null): void {
    if (act) m.info.act = act;
    else delete m.info.act;
    this.broadcast({ t: 'act', id: m.info.id, act: act ?? null });
  }

  snapshot(): void {
    if (this.drops.expire()) this.broadcast({ t: 'drops', list: this.drops.all() });
    for (const m of this.members.values()) {
      this.settle(m);
      this.tickSmoke(m);
    }
    if (this.now() - this.boardAt >= BOARD_MS) this.board();
    if (this.now() - this.clockAt >= CLOCK_MS) {
      this.clockAt = this.now();
      this.broadcast({ t: 'clock', now: this.clockAt });
    }
    this.positions();
  }

  /** Leaderboard and hall of fame updates, throttled to BOARD_MS. */
  private board(): void {
    this.boardAt = this.now();
    const coins = Object.fromEntries([...this.members.values()].map((m) => [m.info.id, m.acct.save.coins]));
    const stats = Object.fromEntries([...this.members.values()].map((m) => [m.info.id, { level: m.acct.save.level, best: m.acct.save.best ?? null }]));
    const sk = JSON.stringify(stats);
    // Offline accounts can't change, so the hall of fame only moves when an online player's stats do.
    if (sk !== this.lastStats) {
      this.lastStats = sk;
      this.hallStale();
    }
    const key = JSON.stringify(coins) + sk;
    if (key !== this.lastBoard) {
      this.lastBoard = key;
      // Kept on the player info too, so the list sent to a new joiner isn't stale.
      for (const m of this.members.values()) Object.assign(m.info, { coins: m.acct.save.coins }, stats[m.info.id]);
      this.broadcast({ t: 'board', coins, stats });
    }
    this.furthestBoard();
    const rows = this.hall();
    // The server hands back the same cached array until something changed.
    if (rows === this.lastHallRows) return;
    this.lastHallRows = rows;
    const hk = JSON.stringify(rows);
    if (hk !== this.lastHall) {
      this.lastHall = hk;
      this.broadcast({ t: 'hall', rows });
    }
  }

  /** The Furthest Out board, kept like the hall of fame: re-ranked when an online player's boat parts, Abyss record, first sea fish or level moves. */
  private furthestBoard(): void {
    const sk = [...this.members.values()].map((m) => `${m.acct.save.boatParts}:${m.acct.save.abyssRecord}:${eco.hasSailed(m.acct.save)}:${m.acct.save.level}`).join();
    if (sk !== this.lastSea) {
      this.lastSea = sk;
      this.furthestStale();
    }
    const rows = this.furthest();
    if (rows === this.lastFurthestRows) return;
    this.lastFurthestRows = rows;
    // Whoever now leads by moving strictly past the old leader gets a line for the whole server (a tie or a rename doesn't).
    const top = rows[0] ? { zone: rows[0].zone, ...(rows[0].marker ? { marker: rows[0].marker } : {}) } : null;
    if (this.topReach !== undefined && top && isFurthestRecord(this.topReach, top)) this.say({ t: 'sys', text: furthestLine(rows[0].name, top) });
    this.topReach = top;
    const fk = JSON.stringify(rows);
    if (fk !== this.lastFurthest) {
      this.lastFurthest = fk;
      this.broadcast({ t: 'furthest', rows });
    }
  }

  /** Player `id` changed their name (already set on the account): everyone in the room sees the new one, and the whole server hears it. */
  renamed(id: number, old: string): void {
    const m = this.members.get(id);
    if (!m) return;
    m.info.name = m.acct.name;
    this.broadcast({ t: 'named', id, name: m.acct.name });
    this.say({ t: 'sys', text: `${old} is now ${m.acct.name}` });
  }

  /** A player gained or lost the supporter 💗: everyone gets the new list, and the player a thank-you. */
  supportersChanged(acct: Account, on: boolean, names: string[]): void {
    this.broadcast({ t: 'supporters', names });
    if (!on) return;
    for (const m of this.members.values()) if (m.acct === acct) m.conn.send({ t: 'notice', msg: '💗 Thank you for supporting Lakeside!' });
  }

  /** Tells everyone else on the player's map that they jumped. */
  private jump(m: Member): void {
    const now = this.now();
    if (m.jumpAt !== undefined && now - m.jumpAt < JUMP_GAP_MS) return;
    m.jumpAt = now;
    const place = placeOf(m.info);
    const here = [...this.members.values()].filter((o) => o !== m && placeOf(o.info) === place);
    if (here.length) this.sendAll(here, { t: 'jump', id: m.info.id });
  }

  /** Sends the players who moved since the last tick to everyone on their map (or dive). */
  private positions(): void {
    const byMap = new Map<string, Member[]>();
    for (const m of this.members.values()) {
      const place = placeOf(m.info);
      const list = byMap.get(place);
      if (list) list.push(m);
      else byMap.set(place, [m]);
    }
    for (const list of byMap.values()) {
      const moved = list.filter((m) => m.moved);
      if (list.length > 1 && moved.length) this.sendAll(list, { t: 'snap', p: moved.map(snapEntry) });
    }
    for (const m of this.members.values()) m.moved = false;
  }

  /** Sends a message to everyone in this room. */
  broadcast(msg: ServerMsg): void {
    this.sendAll(this.members.values(), msg);
  }

  private sendAll(to: Iterable<Member>, msg: ServerMsg): void {
    const json = JSON.stringify(msg);
    for (const m of to) m.conn.send(msg, json);
  }
}

/** "Yellow Perch ×2 and Northern Pike". */
const smokedText = (list: { fishId: string; n: number }[]): string => {
  const parts = list.map((d) => `${byId(FISH, d.fishId).name}${d.n > 1 ? ` ×${d.n}` : ''}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
};

const finite = (...n: number[]) => n.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e4);
const round = (v: number) => Math.round(v * 100) / 100;
const snapEntry = (m: Member): [number, number, number, number] => [m.info.id, round(m.info.x), round(m.info.z), round(m.info.yaw)];
/** Untrusted ids: only strings and numbers count, since `String()` throws on objects like `{ toString: null }`. */
/** A client-sent index; anything but a number (an object with no `toString` would make `Number()` throw) is NaN. */
const int = (v: unknown) => (typeof v === 'number' ? Math.floor(v) : NaN);
const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 32) : typeof v === 'number' ? String(v) : '');

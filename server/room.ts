import { FISH, byId } from '../src/data/content';
import type { MapDef } from '../src/data/maps';
import { Drops, PICKUP_RANGE, dropSpot } from '../src/game/drops';
import * as eco from '../src/game/economy';
import { NIGHT_BITE, isNight, nightness } from '../src/game/daynight';
import { fishingSpot } from '../src/game/progression';
import type { ClientMsg, HallRow, PlayerInfo, ServerMsg } from '../src/net/protocol';
import { CASINO_RANGE, ROULETTE_MS, type RouletteBet } from '../src/data/casino';
import * as cas from '../src/game/casino';
import { newSave } from '../src/game/state';
import { markTip } from '../src/game/tips';
import type { Account } from './accounts';
import { ChatGate } from './chat';
import { DevGate, runDev } from './dev';

export interface Conn {
  /** `json` is `msg` already serialized, passed by broadcasts so it is built once for everyone. */
  send(msg: ServerMsg, json?: string): void;
}

interface Pending {
  fishId: string;
  size: number;
  shiny: boolean;
  /** Earliest time a catch is believable: the bite plus a minimum fight. */
  readyAt: number;
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
}

const VENDOR_RANGE = 5;
const MIN_FIGHT_MS = 1500;
export const SPIN_MS = 3800;
/** Coins change nearly every tick on a busy server, so the leaderboard goes out at most this often. */
export const BOARD_MS = 1000;
const NO_HALL: HallRow[] = [];

/** One lobby: its players and their shared drops. Economy actions are validated here. */
export class Room {
  private members = new Map<number, Member>();
  private nextId = 1;
  readonly drops: Drops;
  private maps: Record<string, MapDef>;
  private lastBoard = '';
  private boardAt = -Infinity;
  private lastStats = '';
  private lastHall = '';
  private lastHallRows: HallRow[] | null = null;
  /** Supplies the all-accounts leaderboard (set by the server). */
  hall: () => HallRow[] = () => NO_HALL;
  /** Tells the server's hall cache that an online player's level or best catch changed. */
  hallStale: () => void = () => {};
  /** Chat rules; the server shares one gate between rooms so limits follow the account. */
  chatGate: ChatGate;
  /** Dev console login; off unless the server sets credentials. */
  devGate = new DevGate();
  /** Last dig per account, for the worm patch cooldown. */
  private dugAt = new Map<Account, number>();
  /** Delivers chat lines and notices; the server points this at every room. */
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
    // No prototype, so a client-sent id like "constructor" finds nothing instead of an Object method.
    this.maps = Object.assign(Object.create(null), Object.fromEntries(maps.map((m) => [m.id, m])));
  }

  get size(): number {
    return this.members.size;
  }

  /** The player starts where their save says; only `travel` (behind the level gate) moves them between maps. */
  join(conn: Conn, acct: Account, color?: number): number {
    if (color !== undefined) eco.setBodyColor(acct.save, Math.floor(Number(color)));
    const id = this.nextId++;
    const map = this.maps[acct.save.location] ?? Object.values(this.maps)[0];
    acct.save.location = map.id;
    const info: PlayerInfo = { id, name: acct.name, map: map.id, x: map.spawn.x, z: map.spawn.z, yaw: 0, look: acct.save.look, coins: acct.save.coins, level: acct.save.level, best: acct.save.best ?? null };
    const m: Member = { info, conn, acct, pending: null, spin: null, bj: null };
    const it = acct.save.slots[acct.save.held];
    if (it?.k === 'fish') info.act = { a: 'carry', fish: it.fishId, size: it.size, shiny: it.shiny };
    conn.send({
      t: 'welcome',
      id,
      room: this.name,
      save: acct.save,
      players: [...this.members.values()].map((o) => o.info),
    });
    conn.send({ t: 'drops', list: this.drops.all() });
    conn.send({ t: 'hall', rows: this.hall() });
    this.broadcast({ t: 'joined', player: info });
    // Before adding the member, so everyone else on the server hears it but not the joiner.
    this.say({ t: 'sys', text: `${acct.name} has joined` });
    this.members.set(id, m);
    return id;
  }

  leave(id: number): void {
    const m = this.members.get(id);
    if (!m) return;
    if (m.spin) m.spin.at = 0;
    if (m.bj) this.bjAct(m, 'stand');
    this.settle(m);
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
    this.settle(m);
    const s = m.acct.save;
    let changed = false;
    if (m.spin && msg.t !== 'pos') return;
    if (m.bj && msg.t !== 'pos' && msg.t !== 'bj') return;
    switch (msg.t) {
      case 'pos':
        if (finite(msg.x, msg.z, msg.yaw)) {
          Object.assign(m.info, { x: msg.x, z: msg.z, yaw: msg.yaw });
          m.moved = true;
        }
        return;
      case 'slot':
        changed = eco.selectSlot(s, Math.floor(Number(msg.i)));
        break;
      case 'drop':
        changed = this.drop(m);
        break;
      case 'pickup':
        changed = this.pickup(m, Number(msg.id));
        break;
      case 'buyrod':
        changed = this.atVendor(m) && this.stocks(m).rods.includes(str(msg.id)) && eco.buyRod(s, str(msg.id));
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
      case 'stow':
        changed = eco.stowSlot(s, Math.floor(Number(msg.i)));
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
        changed = this.atVendor(m) && (msg.i === undefined ? eco.sellHeld(s) : eco.sellSlot(s, Math.floor(Number(msg.i))));
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
        changed = eco.setBodyColor(s, Math.floor(Number(msg.color)));
        break;
      case 'face':
        changed = eco.setFace(s, msg.id);
        break;
      case 'tip':
        changed = markTip(s, msg.id);
        break;
      case 'reset':
        m.pending = null;
        this.resetAccount(m);
        changed = true;
        break;
      case 'gamble':
        this.gamble(m);
        return;
      case 'travel':
        changed = this.travel(m, str(msg.to));
        break;
      case 'roulette':
        this.roulette(m, msg.bet, Math.floor(Number(msg.i)));
        return;
      case 'bj':
        this.bj(m, msg.a, msg.i);
        return;
      case 'cashout':
        if (this.atCasino(m, 'prizes')) {
          const bad = cas.cashOutError(s, Math.floor(Number(msg.i)));
          if (bad) m.conn.send({ t: 'notice', msg: bad });
          else changed = cas.cashOut(s, Math.floor(Number(msg.i))) > 0;
        }
        break;
      case 'buyperk':
        changed = this.atCasino(m, 'prizes') && eco.buyPerk(s, str(msg.id));
        break;
      case 'cast':
        changed = this.cast(m, msg.x, msg.z, msg.perfect === true);
        break;
      case 'catch':
        changed = this.land(m);
        break;
      case 'lost':
        if (m.pending || m.info.act) this.setAct(m, null);
        m.pending = null;
        this.syncCarry(m);
        return;
    }
    if (changed && (msg.t === 'slot' || msg.t === 'drop' || msg.t === 'pickup' || msg.t === 'sell')) this.syncCarry(m);
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
  }

  private stocks(m: Member): { rods: string[]; bait: string[] } {
    return this.maps[m.info.map]?.stock ?? { rods: [], bait: [] };
  }

  private gamble(m: Member): void {
    const w = this.maps[m.info.map]?.wheel;
    const held = m.acct.save.slots[m.acct.save.held];
    if (!w || held?.k !== 'fish' || Math.hypot(m.info.x - w.x, m.info.z - w.z) > eco.WHEEL_RANGE) return;
    const win = this.rng() < eco.WHEEL_WIN;
    m.spin = { at: this.now() + SPIN_MS, run: () => eco.applyWheel(m.acct.save, win) };
    m.conn.send({ t: 'wheel', win, ms: SPIN_MS });
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

  private atCasino(m: Member, what: 'roulette' | 'blackjack' | 'prizes'): boolean {
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

  /** Dev console: `/login user pass` unlocks the other commands for this connection. */
  private command(m: Member, text: unknown): void {
    if (typeof text !== 'string' || !text.startsWith('/')) return;
    const [cmd = '', ...args] = text.slice(1, 200).trim().split(/\s+/);
    const reply = (lines: string[], extra: { time?: number | null } = {}) => m.conn.send({ t: 'dev', lines, ...extra });
    if (cmd === 'login') {
      const bad = this.devGate.login(m.acct.name, args[0] ?? '', args[1] ?? '');
      console.log(`[dev] ${m.acct.name} login ${bad ? 'failed' : 'ok'}`);
      if (bad) return reply([bad]);
      m.dev = true;
      return reply(['Dev console unlocked. /help lists the commands.']);
    }
    if (!m.dev) return reply(['Unknown command. (Dev console: /login <user> <password>)']);
    if (cmd === 'logout') {
      m.dev = false;
      return reply(['Logged out of the dev console.']);
    }
    console.log(`[dev] ${m.acct.name}: ${text.slice(0, 200)}`);
    if (m.spin || m.bj) return reply(['Finish the spin or hand first.']);
    let time: number | null | undefined;
    const res = runDev({
      save: m.acct.save,
      maps: this.maps,
      teleport: (map) => this.teleport(m, map),
      setTime: (f) => { m.dayFrac = time = f; },
      clearDig: () => this.dugAt.delete(m.acct),
    }, cmd.toLowerCase(), args);
    reply(res.lines, time === undefined ? {} : { time });
    if (!res.changed) return;
    this.syncCarry(m);
    this.onChange();
    m.conn.send({ t: 'state', save: m.acct.save });
  }

  private teleport(m: Member, map: string): void {
    const dest = this.maps[map];
    m.pending = null;
    m.acct.save.location = dest.id;
    m.info.map = dest.id;
    m.info.x = dest.spawn.x;
    m.info.z = dest.spawn.z;
    m.moved = true;
    this.broadcast({ t: 'moved', id: m.info.id, map: dest.id });
    // Snaps only carry players who moved, so the arrival gets everyone already standing on the new map.
    const here = [...this.members.values()].filter((o) => o !== m && o.info.map === dest.id);
    if (here.length) m.conn.send({ t: 'snap', p: here.map(snapEntry) });
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
    m.spin = { at: this.now() + ROULETTE_MS, run: () => { cas.settleBet(m.acct.save, i, r.factor); this.syncCarry(m); } };
    m.conn.send({ t: 'roulette', ...r, ms: ROULETTE_MS });
  }

  private bj(m: Member, a: 'deal' | 'hit' | 'stand' | 'double', i?: number): void {
    if (a === 'deal') {
      const slot = Math.floor(Number(i));
      if (m.bj || !this.atCasino(m, 'blackjack')) return;
      const bad = cas.betError(m.acct.save, slot);
      if (bad) return m.conn.send({ t: 'notice', msg: bad });
      const g = cas.dealBlackjack(slot, this.rng);
      m.bj = g;
      m.acct.save.held = slot;
      this.bjDone(m);
      m.conn.send({ t: 'bj', view: cas.blackjackView(g) });
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
    this.bjDone(m);
    m.conn.send({ t: 'bj', view: cas.blackjackView(g) });
  }

  /** Pays out a finished hand and frees the table. */
  private bjDone(m: Member): void {
    const g = m.bj;
    if (!g?.done) return;
    m.bj = null;
    cas.settleBlackjack(m.acct.save, g);
    this.syncCarry(m);
    this.onChange();
    m.conn.send({ t: 'state', save: m.acct.save });
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
    const can = finite(x, z) ? eco.canCast(m.acct.save) : 'nobait';
    if (can !== 'ok' || !eco.spendBait(m.acct.save)) {
      m.conn.send({ t: 'castfail', msg: eco.CAST_MESSAGES[can === 'ok' ? 'nobait' : can] });
      return false;
    }
    const roll = eco.rollCast(m.acct.save, map.locationId, this.rng, perfect, fishingSpot(m.info.x, m.info.z), m.dayFrac != null ? nightness(m.dayFrac) >= NIGHT_BITE : isNight(this.now() / 1000));
    m.pending = roll.fishId ? { fishId: roll.fishId, size: roll.size, shiny: !!roll.shiny, readyAt: this.now() + roll.wait * 1000 + MIN_FIGHT_MS } : null;
    m.conn.send({ t: 'castok', ...roll });
    this.setAct(m, { a: 'cast', x, z });
    return true;
  }

  /** Completes the pending catch, if the client waited long enough for the bite and the fight. */
  private land(m: Member): boolean {
    const p = m.pending;
    m.pending = null;
    if (!p || this.now() < p.readyAt) {
      this.setAct(m, null);
      return false;
    }
    if (!eco.applyCatch(m.acct.save, byId(FISH, p.fishId), p.size, p.shiny).stored) {
      this.setAct(m, null);
      return false;
    }
    this.setAct(m, { a: 'hold', fish: p.fishId, size: p.size, shiny: p.shiny });
    return true;
  }

  private drop(m: Member): boolean {
    if (m.pending || (m.info.act && m.info.act.a !== 'carry')) return false;
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
    for (const m of this.members.values()) this.settle(m);
    if (this.now() - this.boardAt >= BOARD_MS) this.board();
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

  /** Sends the players who moved since the last tick to everyone on their map. */
  private positions(): void {
    const byMap = new Map<string, Member[]>();
    for (const m of this.members.values()) {
      const list = byMap.get(m.info.map);
      if (list) list.push(m);
      else byMap.set(m.info.map, [m]);
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

const finite = (...n: number[]) => n.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e4);
const round = (v: number) => Math.round(v * 100) / 100;
const snapEntry = (m: Member): [number, number, number, number] => [m.info.id, round(m.info.x), round(m.info.z), round(m.info.yaw)];
const str = (v: unknown) => String(v ?? '').slice(0, 32);

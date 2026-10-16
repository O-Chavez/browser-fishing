import { FISH, byId } from '../src/data/content';
import type { MapDef } from '../src/data/maps';
import { Drops, PICKUP_RANGE, dropSpot } from '../src/game/drops';
import * as eco from '../src/game/economy';
import { fishingSpot } from '../src/game/progression';
import { fundGoal, openKey } from '../src/game/fund';
import type { ClientMsg, PlayerInfo, ServerMsg } from '../src/net/protocol';
import { newSave } from '../src/game/state';
import type { Account } from './accounts';

export interface Conn {
  send(msg: ServerMsg): void;
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
  /** A wheel spin in flight; its result is applied once the animation ends. */
  spin: { win: boolean; at: number } | null;
}

const VENDOR_RANGE = 5;
const MIN_FIGHT_MS = 1500;
export const SPIN_MS = 3800;

/** One lobby: its players and the pooled fund per map. Economy actions are validated here. */
export class Room {
  private members = new Map<number, Member>();
  private nextId = 1;
  readonly drops: Drops;
  private maps: Record<string, MapDef>;
  private lastBoard = '';

  constructor(
    readonly name: string,
    readonly funds: Record<string, number>,
    maps: MapDef[],
    private onChange: () => void = () => {},
    private now: () => number = Date.now,
    private rng: () => number = Math.random,
  ) {
    this.drops = new Drops(now);
    this.maps = Object.fromEntries(maps.map((m) => [m.id, m]));
  }

  get size(): number {
    return this.members.size;
  }

  join(conn: Conn, acct: Account, map: string, color?: number): number {
    if (color !== undefined) eco.setBodyColor(acct.save, Math.floor(Number(color)));
    const id = this.nextId++;
    const info: PlayerInfo = { id, name: acct.name, map: this.maps[map] ? map : Object.keys(this.maps)[0], x: 0, z: 0, yaw: 0, look: acct.save.look, coins: acct.save.coins, level: acct.save.level, best: acct.save.best ?? null };
    const m: Member = { info, conn, acct, pending: null, spin: null };
    const it = acct.save.slots[acct.save.held];
    if (it?.k === 'fish') info.act = { a: 'carry', fish: it.fishId, size: it.size, shiny: it.shiny };
    conn.send({
      t: 'welcome',
      id,
      room: this.name,
      save: this.view(acct),
      players: [...this.members.values()].map((o) => o.info),
    });
    conn.send({ t: 'drops', list: this.drops.all() });
    this.broadcast({ t: 'joined', player: info });
    this.members.set(id, m);
    return id;
  }

  leave(id: number): void {
    const m = this.members.get(id);
    if (!m) return;
    if (m.spin) m.spin.at = 0;
    this.settle(m);
    m.acct.online = false;
    this.members.delete(id);
    this.broadcast({ t: 'left', id });
  }

  handle(id: number, msg: ClientMsg): void {
    const m = this.members.get(id);
    if (!m) return;
    this.settle(m);
    const s = m.acct.save;
    let changed = false;
    if (m.spin && msg.t !== 'pos') return;
    switch (msg.t) {
      case 'pos':
        if (finite(msg.x, msg.z, msg.yaw)) Object.assign(m.info, { x: msg.x, z: msg.z, yaw: msg.yaw });
        return;
      case 'map':
        if (this.maps[msg.map]) {
          m.info.map = msg.map;
          this.broadcast({ t: 'moved', id, map: msg.map });
        }
        return;
      case 'give':
        changed = this.give(m, msg.map, msg.coins);
        break;
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
      case 'sell':
        changed = this.atVendor(m) && (msg.i === undefined ? eco.sellHeld(s) : eco.sellSlot(s, Math.floor(Number(msg.i))));
        break;
      case 'buycos':
        changed = this.atVendor(m) && eco.buyCosmetic(s, str(msg.id));
        break;
      case 'equip':
        changed = eco.equipCosmetic(s, msg.slot, msg.id === null ? null : str(msg.id));
        break;
      case 'color':
        changed = eco.setBodyColor(s, Math.floor(Number(msg.color)));
        break;
      case 'reset':
        if (m.spin) return;
        m.pending = null;
        this.resetAccount(m);
        changed = true;
        break;
      case 'gamble':
        this.gamble(m);
        return;
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
    if (changed && (msg.t === 'equip' || msg.t === 'color')) this.broadcast({ t: 'look', id, look: s.look });
    if (changed) {
      this.onChange();
    }
    m.conn.send({ t: 'state', save: this.view(m.acct) });
  }

  /** Wipes progress but keeps the name, token and body color. Mutates in place: info.look aliases save.look. */
  private resetAccount(m: Member): void {
    const s = m.acct.save;
    const look = s.look;
    const color = look.color;
    Object.assign(s, newSave());
    Object.assign(look, newSave().look, { color });
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
    m.spin = { win, at: this.now() + SPIN_MS };
    m.conn.send({ t: 'wheel', win, ms: SPIN_MS });
  }

  /** Applies a finished spin. */
  private settle(m: Member): void {
    if (!m.spin || this.now() < m.spin.at) return;
    const { win } = m.spin;
    m.spin = null;
    eco.applyWheel(m.acct.save, win);
    this.syncCarry(m);
    this.onChange();
    m.conn.send({ t: 'state', save: this.view(m.acct) });
  }

  private atVendor(m: Member): boolean {
    const v = this.maps[m.info.map]?.vendor.shop;
    return !!v && Math.hypot(m.info.x - v.x, m.info.z - v.z) <= VENDOR_RANGE;
  }

  private cast(m: Member, x: number, z: number, perfect = false): boolean {
    const map = this.maps[m.info.map];
    const can = finite(x, z) ? eco.canCast(m.acct.save) : 'nobait';
    if (can !== 'ok' || !eco.spendBait(m.acct.save)) {
      m.conn.send({ t: 'castfail', msg: eco.CAST_MESSAGES[can === 'ok' ? 'nobait' : can] });
      return false;
    }
    const roll = eco.rollCast(m.acct.save, map.locationId, this.rng, perfect, fishingSpot(m.info.x, m.info.z));
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

  private give(m: Member, map: string, coins: number): boolean {
    const def = this.maps[map];
    if (!def || !Number.isFinite(coins) || !this.atVendor(m)) return false;
    const total = this.funds[map] ?? 0;
    const goal = fundGoal(def, this.members.size);
    if (this.funds[openKey(map)]) return false;
    const accepted = Math.max(0, Math.min(Math.floor(coins), goal - total, m.acct.save.coins));
    if (accepted <= 0) return false;
    m.acct.save.coins -= accepted;
    m.acct.save.contributed[map] = (m.acct.save.contributed[map] ?? 0) + accepted;
    this.funds[map] = total + accepted;
    // Once the gate opens it stays open, even if the lobby later grows.
    const open = total + accepted >= goal;
    if (open) this.funds[openKey(map)] = 1;
    this.broadcast({ t: 'fund', map, total: total + accepted, by: m.info.name, coins: accepted, open });
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
    this.broadcast({ t: 'act', id: m.info.id, act });
  }

  /** The account save with this room's fund filled in. */
  private view(acct: Account) {
    return { ...acct.save, fund: { ...this.funds } };
  }

  snapshot(): void {
    if (this.drops.expire()) this.broadcast({ t: 'drops', list: this.drops.all() });
    for (const m of this.members.values()) this.settle(m);
    const coins = Object.fromEntries([...this.members.values()].map((m) => [m.info.id, m.acct.save.coins]));
    const stats = Object.fromEntries([...this.members.values()].map((m) => [m.info.id, { level: m.acct.save.level, best: m.acct.save.best ?? null }]));
    const key = JSON.stringify([coins, stats]);
    if (key !== this.lastBoard) {
      this.lastBoard = key;
      for (const m of this.members.values()) m.info.coins = m.acct.save.coins;
      this.broadcast({ t: 'board', coins, stats });
    }
    if (this.members.size < 2) return;
    const p = [...this.members.values()].map(
      (m) => [m.info.id, round(m.info.x), round(m.info.z), round(m.info.yaw)] as [number, number, number, number],
    );
    this.broadcast({ t: 'snap', p });
  }

  private broadcast(msg: ServerMsg): void {
    for (const m of this.members.values()) m.conn.send(msg);
  }
}

const finite = (...n: number[]) => n.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e4);
const round = (v: number) => Math.round(v * 100) / 100;
const str = (v: unknown) => String(v ?? '').slice(0, 32);

import type { Activity, CasinoRecords, ClientMsg, DiveEnd, DiveView, FurthestRow, HallRow, PlayerInfo, ServerMsg } from '../net/protocol';
import { RENAME_COOLDOWN_MS, SERVER_PORT } from '../net/protocol';
import type { BlackjackView } from './casino';
import type { Roll } from './economy';
import type { Drop } from './drops';
import { isRestartClose } from './restart';
import type { StageId } from '../data/smokehouse';
import { SKIP, type SkipBest } from '../data/skip';
import type { SaveData } from './state';

export interface NetEvents {
  onState(save: SaveData): void;
  onWheel(r: { wedge: number; factor: number; ms: number }): void;
  onRoulette(r: { pocket: number; color: string; factor: number; ms: number }): void;
  onBlackjack(view: BlackjackView | null): void;
  onDrops(list: Drop[]): void;
  onPlayers(): void;
  onBoard(): void;
  /** The list of Ko-fi supporters changed. */
  onSupporters(): void;
  /** The casino's biggest win or loss changed. */
  onRecords(): void;
  /** The Furthest Out board at the harbour changed. */
  onFurthest(): void;
  onAct(p: PlayerInfo, act: Activity | null): void;
  onJump(id: number): void;
  /** Another player started an emote, or with `null` ended theirs early. */
  onEmote(p: PlayerInfo, emote: string | null): void;
  /** A stone was thrown at the pile on this map (by this player too): `at` is where its thrower stood. */
  onSkip(id: number, n: number, a: number, at: { x: number; z: number }): void;
  /** The day's best skip changed; `by` is its thrower here, whose stone may still be flying. */
  onSkipBest(best: SkipBest | null, by?: number): void;
  onCast(roll: Roll): void;
  onCastFail(msg: string): void;
  /** The player's dive changed (or resumed on joining); comes before the save that takes them to sea. */
  onDive(dive: DiveView): void;
  onDiveEnd(end: DiveEnd): void;
  /** The server refused a move and put the player back here. */
  onCorrect(x: number, z: number): void;
  /** `need: 'password'`: the name has a password and this browser isn't one of its devices yet. */
  onError(msg: string, need?: 'password'): void;
  /** The server answered a password change; `msg` is set if it was refused. */
  onAccount(msg?: string): void;
  /** This account's name changed: renamed here (`now`), or elsewhere before this join. */
  onName(now: boolean): void;
  onNotice(msg: string): void;
  /** Smokehouse stages opened on joining. */
  onStages(ids: StageId[], intro: boolean): void;
  onChat(msg: Extract<ServerMsg, { t: 'chat' }>): void;
  onSys(text: string): void;
  /** Slash command replies; `time` is set when a command changed the day/night override, `sent` on a feedback answer. */
  onDev(lines: string[], time: number | null | undefined, sent: boolean | undefined, depth: number | undefined): void;
  onClose(): void;
  /** The server is restarting (a redeploy): progress is saved, so don't show the offline banner. Fires once. */
  onRestart(): void;
  /** The socket closed before the server accepted the join. */
  onFailed(): void;
}

/** Nothing from the server this long (it sends the clock every minute) means the socket is dead. */
const SILENT_MS = 150_000;

/** Connection to the room server. The game stays fully playable offline if it can't connect. */
export class NetClient {
  connected = false;
  id = 0;
  room = '';
  /** This player's dive instance, or 0: other players show only on the same map and dive (`placeOf`). */
  dive = 0;
  players = new Map<number, PlayerInfo>();
  private ws: WebSocket | null = null;
  private sendTimer = 0;
  private lastSent = '';
  /** Everyone's coins by player id (self included), for the leaderboard. */
  coins = new Map<number, number>();
  hall: HallRow[] = [];
  /** The same for charter catches: the Deep Sea board. */
  hallSea: HallRow[] = [];
  /** The Furthest Out board: everyone's furthest marker headed home from. */
  furthest: FurthestRow[] = [];
  /** Supporter names, newest first; `isSupporter` checks a name. */
  supporters: string[] = [];
  private supporterKeys = new Set<string>();
  /** The casino's all-time biggest single win and loss. */
  records: CasinoRecords = { win: null, loss: null };
  color: number | undefined;
  /** Sent with the next join only, to log in on a browser the account doesn't know yet. */
  pass: string | undefined;
  /** The account has a password (so it can log in on other devices). */
  hasPass = false;
  /** `Date.now()` when the name may change again. */
  renameAt = 0;
  /** Server clock minus this device's clock (ms); 0 offline, where the device's clock is all there is. */
  private clockOffset = 0;

  constructor(
    public name: string,
    private token: string,
    private roomName: string,
    private events: NetEvents,
  ) {}

  /** The game server's address as a ws(s):// base, for the socket and (as http) for `/health`. */
  static serverBase(): string {
    // Deployed builds point at the hosted game server via VITE_SERVER_URL (e.g. wss://fishing.onrender.com).
    const configured = (import.meta.env.VITE_SERVER_URL as string | undefined)?.replace(/\/$/, '');
    const host = location.hostname || 'localhost';
    const secure = location.protocol === 'https:';
    // In production the page is served by the game server itself, so the socket shares its origin.
    return configured || (import.meta.env.PROD ? `${secure ? 'wss' : 'ws'}://${location.host}` : `${secure ? 'wss' : 'ws'}://${host}:${SERVER_PORT}`);
  }

  /** True once the game socket is closed (or was never opened). */
  get socketClosed(): boolean {
    return !this.ws || this.ws.readyState === WebSocket.CLOSED;
  }

  private restarted = false;
  private restarting(): void {
    if (this.restarted) return;
    this.restarted = true;
    this.events.onRestart();
  }

  connect(): void {
    const url = `${NetClient.serverBase()}/?room=${encodeURIComponent(this.roomName)}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'join', name: this.name, token: this.token, color: this.color, pass: this.pass }));
      this.pass = undefined;
    };
    ws.onmessage = (e) => {
      this.heardAt = performance.now();
      this.onMessage(JSON.parse(e.data));
    };
    ws.onclose = (e) => this.closed(e.code);
    this.heardAt = performance.now();
    if (!this.watchdog) this.watchdog = setInterval(() => this.checkAlive(), 10_000);
  }

  private closed(code: number): void {
    const was = this.connected;
    this.connected = false;
    this.players.clear();
    this.events.onPlayers();
    if (this.restarted || isRestartClose(code)) this.restarting();
    else if (was) this.events.onClose();
    else this.events.onFailed();
  }

  /** `performance.now()` when the server last sent anything; it sends the clock at least once a minute (`CLOCK_MS`). */
  private heardAt = 0;
  private watchdog: ReturnType<typeof setInterval> | 0 = 0;
  /**
   * A phone that slept can come back to a socket that still reads as open but is dead (the network dropped it), and
   * a dead socket can take minutes to report its close. Hearing nothing for well over the clock's minute, while the
   * page is in view, counts as closed now.
   */
  private checkAlive(): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || document.hidden) return;
    if (performance.now() - this.heardAt < SILENT_MS) return;
    ws.onclose = null;
    ws.onmessage = null;
    try {
      ws.close();
    } catch {}
    this.ws = null;
    this.closed(1006);
  }

  /** The server's time (ms), which the day/night cycle follows so every player sees the same sky. */
  now(): number {
    return Date.now() + this.clockOffset;
  }

  /** Message delay is ignored: it's well under a second, and a day lasts minutes. */
  private setClock(serverNow: number | undefined): void {
    if (typeof serverNow === 'number' && Number.isFinite(serverNow)) this.clockOffset = serverNow - Date.now();
  }

  send(msg: ClientMsg): void {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Throttled position updates (10 Hz). */
  sendPos(dt: number, x: number, z: number, yaw: number): void {
    this.sendTimer += dt;
    if (!this.connected || this.sendTimer < 0.1) return;
    this.sendTimer = 0;
    const key = `${x.toFixed(2)},${z.toFixed(2)},${yaw.toFixed(2)}`;
    if (key === this.lastSent) return;
    this.lastSent = key;
    this.send({ t: 'pos', x, z, yaw });
  }

  private onMessage(m: ServerMsg): void {
    switch (m.t) {
      case 'restart':
        return this.restarting();
      case 'welcome':
        this.connected = true;
        this.id = m.id;
        this.room = m.room;
        this.hasPass = m.hasPass;
        this.renameAt = Date.now() + m.renameIn;
        this.setClock(m.now);
        m.players.forEach((p) => this.players.set(p.id, p));
        this.dive = m.dive?.id ?? 0;
        if (m.dive) this.events.onDive(m.dive);
        if (m.name !== this.name) {
          this.name = m.name;
          this.events.onName(false);
        }
        this.setSave(m.save);
        this.events.onPlayers();
        break;
      case 'state':
        this.setSave(m.save);
        break;
      case 'clock':
        this.setClock(m.now);
        break;
      case 'drops':
        this.events.onDrops(m.list);
        break;
      case 'notice':
        this.events.onNotice(m.msg);
        break;
      case 'stages':
        this.events.onStages(m.ids, m.intro);
        break;
      case 'chat':
        this.events.onChat(m);
        break;
      case 'sys':
        this.events.onSys(m.text);
        break;
      case 'dev':
        this.events.onDev(m.lines, m.time, m.sent, m.depth);
        break;
      case 'error':
        this.events.onError(m.msg, m.need);
        break;
      case 'account':
        this.hasPass = m.hasPass;
        this.events.onAccount(m.msg);
        break;
      case 'castok':
        this.events.onCast(m);
        break;
      case 'divestate':
        this.dive = m.dive.id;
        this.events.onDive(m.dive);
        break;
      case 'diveend':
        this.events.onDiveEnd(m.end);
        break;
      case 'pos':
        this.events.onCorrect(m.x, m.z);
        break;
      case 'wheel':
        this.events.onWheel(m);
        break;
      case 'roulette':
        this.events.onRoulette(m);
        break;
      case 'bj':
        this.events.onBlackjack(m.view);
        break;
      case 'castfail':
        this.events.onCastFail(m.msg);
        break;
      case 'joined':
        this.players.set(m.player.id, m.player);
        this.events.onPlayers();
        break;
      case 'left':
        this.players.delete(m.id);
        this.events.onPlayers();
        break;
      case 'moved': {
        const p = this.players.get(m.id);
        if (p) Object.assign(p, { map: m.map, dive: m.dive });
        if (m.id === this.id) this.dive = m.dive ?? 0;
        this.events.onPlayers();
        break;
      }
      case 'act': {
        const p = this.players.get(m.id);
        if (!p) break;
        if (m.act) p.act = m.act;
        else delete p.act;
        if (m.id !== this.id) this.events.onAct(p, m.act);
        break;
      }
      case 'jump':
        if (m.id !== this.id) this.events.onJump(m.id);
        break;
      case 'emote': {
        const p = this.players.get(m.id);
        if (!p || m.id === this.id) break;
        // Where they stood as it began, which the next snap may not have brought yet.
        if (typeof m.x === 'number' && typeof m.z === 'number') Object.assign(p, { x: m.x, z: m.z });
        this.events.onEmote(p, m.emote);
        break;
      }
      case 'skip': {
        // Where the thrower stood, which the next snap may not have brought yet.
        if (!Number.isInteger(m.n) || m.n < 0 || m.n > SKIP.max || ![m.a, m.x, m.z].every(Number.isFinite)) break;
        const p = this.players.get(m.id);
        if (p && m.id !== this.id) Object.assign(p, { x: m.x, z: m.z });
        this.events.onSkip(m.id, m.n, m.a, m);
        break;
      }
      case 'skipbest':
        this.events.onSkipBest(m.best, m.by);
        break;
      case 'snap':
        for (const [id, x, z, yaw] of m.p) {
          const p = this.players.get(id);
          if (p && id !== this.id) Object.assign(p, { x, z, yaw });
        }
        break;
      case 'look': {
        const p = this.players.get(m.id);
        if (p) p.look = m.look;
        this.events.onPlayers();
        break;
      }
      case 'named': {
        const p = this.players.get(m.id);
        if (p) p.name = m.name;
        if (m.id === this.id) {
          this.name = m.name;
          this.renameAt = Date.now() + RENAME_COOLDOWN_MS;
          this.events.onName(true);
        }
        this.events.onPlayers();
        break;
      }
      case 'title': {
        const p = this.players.get(m.id);
        if (p) p.title = m.title;
        this.events.onPlayers();
        break;
      }
      case 'hall':
        this.hall = m.rows;
        this.hallSea = m.sea ?? [];
        this.events.onBoard();
        break;
      case 'supporters':
        this.supporters = m.names;
        this.supporterKeys = new Set(m.names.map((n) => n.toLowerCase()));
        this.events.onSupporters();
        break;
      case 'records':
        this.records = m.records;
        this.events.onRecords();
        break;
      case 'furthest':
        this.furthest = m.rows;
        this.events.onFurthest();
        break;
      case 'board':
        this.coins = new Map(Object.entries(m.coins).map(([k, v]) => [Number(k), v]));
        for (const [id, c] of this.coins) {
          const p = this.players.get(id);
          if (p) p.coins = c;
        }
        for (const [id, st] of Object.entries(m.stats ?? {})) {
          const p = this.players.get(Number(id));
          if (p) Object.assign(p, st);
        }
        this.events.onBoard();
        break;
    }
  }

  /** Names are unique regardless of case, so this tells whose name gets the 💗. */
  isSupporter(name: string): boolean {
    return this.supporterKeys.has(name.toLowerCase());
  }

  private setSave(save: SaveData): void {
    this.events.onState(save);
  }
}

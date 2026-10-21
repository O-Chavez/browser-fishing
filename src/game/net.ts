import type { Activity, ClientMsg, HallRow, PlayerInfo, ServerMsg } from '../net/protocol';
import { SERVER_PORT } from '../net/protocol';
import type { BlackjackView } from './casino';
import type { Drop } from './drops';
import type { SaveData } from './state';

export interface NetEvents {
  onState(save: SaveData): void;
  onWheel(win: boolean, ms: number): void;
  onRoulette(r: { pocket: number; color: string; factor: number; ms: number }): void;
  onBlackjack(view: BlackjackView | null): void;
  onDrops(list: Drop[]): void;
  onPlayers(): void;
  onBoard(): void;
  onAct(p: PlayerInfo, act: Activity | null): void;
  onCast(roll: { fishId: string | null; size: number; wait: number; shiny?: boolean; perfect?: boolean; spot?: string }): void;
  onCastFail(msg: string): void;
  onError(msg: string): void;
  onNotice(msg: string): void;
  onChat(msg: Extract<ServerMsg, { t: 'chat' }>): void;
  onSys(text: string): void;
  /** Dev console replies; `time` is set when a command changed the day/night override. */
  onDev(lines: string[], time: number | null | undefined): void;
  onClose(): void;
  /** The socket closed before the server accepted the join. */
  onFailed(): void;
}

/** Connection to the room server. The game stays fully playable offline if it can't connect. */
export class NetClient {
  connected = false;
  id = 0;
  room = '';
  players = new Map<number, PlayerInfo>();
  private ws: WebSocket | null = null;
  private sendTimer = 0;
  private lastSent = '';
  /** Everyone's coins by player id (self included), for the leaderboard. */
  coins = new Map<number, number>();
  hall: HallRow[] = [];
  color: number | undefined;

  constructor(
    public name: string,
    private token: string,
    private roomName: string,
    private events: NetEvents,
  ) {}

  connect(): void {
    // Deployed builds point at the hosted game server via VITE_SERVER_URL (e.g. wss://fishing.onrender.com).
    const configured = (import.meta.env.VITE_SERVER_URL as string | undefined)?.replace(/\/$/, '');
    const host = location.hostname || 'localhost';
    const secure = location.protocol === 'https:';
    // In production the page is served by the game server itself, so the socket shares its origin.
    const base = configured || (import.meta.env.PROD ? `${secure ? 'wss' : 'ws'}://${location.host}` : `${secure ? 'wss' : 'ws'}://${host}:${SERVER_PORT}`);
    const url = `${base}/?room=${encodeURIComponent(this.roomName)}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      return;
    }
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name: this.name, token: this.token, color: this.color }));
    ws.onmessage = (e) => this.onMessage(JSON.parse(e.data));
    ws.onclose = () => {
      const was = this.connected;
      this.connected = false;
      this.players.clear();
      this.events.onPlayers();
      if (was) this.events.onClose();
      else this.events.onFailed();
    };
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
      case 'welcome':
        this.connected = true;
        this.id = m.id;
        this.room = m.room;
        m.players.forEach((p) => this.players.set(p.id, p));
        this.setSave(m.save);
        this.events.onPlayers();
        break;
      case 'state':
        this.setSave(m.save);
        break;
      case 'drops':
        this.events.onDrops(m.list);
        break;
      case 'notice':
        this.events.onNotice(m.msg);
        break;
      case 'chat':
        this.events.onChat(m);
        break;
      case 'sys':
        this.events.onSys(m.text);
        break;
      case 'dev':
        this.events.onDev(m.lines, m.time);
        break;
      case 'error':
        this.events.onError(m.msg);
        break;
      case 'castok':
        this.events.onCast(m);
        break;
      case 'wheel':
        this.events.onWheel(m.win, m.ms);
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
        if (p) p.map = m.map;
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
      case 'hall':
        this.hall = m.rows;
        this.events.onBoard();
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

  private setSave(save: SaveData): void {
    this.events.onState(save);
  }
}

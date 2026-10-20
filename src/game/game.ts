import * as THREE from 'three';
import {
  BAITS,
  FISH,
  LOCATIONS,
  RARITY_COLOR,
  RODS,
  TIERS,
  byId,
  tierName,
  type Fish,
} from '../data/content';
import { audio } from './audio';
import { MAPS, mapById, type MapDef } from '../data/maps';
import { isWater } from './env';
import { Avatars } from './avatars';
import { Drops, PICKUP_RANGE, dropSpot, type Drop } from './drops';
import { DropsView, itemName } from './dropsview';
import * as eco from './economy';
import { NetClient } from './net';
import { WheelStepper } from './wheelstep';
import { ChatBox } from './chatbox';
import { fishIcon } from './fishicon';
import { rodIcon } from './rodicon';
import { FISH_BLURB, TIER_THEME } from '../data/fishlook';
import { shortCoins } from './format';
import { Player } from './player';
import {
  animateFish,
  buildFish,
  fishScale,
  faceDirection,
  setFishOpacity,
  type FishModel,
} from './fishmodel';
import type { LeaderRow } from './hub';
import { buildTin } from './itemmodels';
import {
  MAX_LEVEL,
  fishWeight,
  formatWeight,
  nextGoal,
  sellValue,
  difficultyLabel,
  reelDifficulty,
  xpForNextLevel,
  PERFECT_MIN,
  fishingSpot,
  SPOTS,
  type SpotId,
  PERFECT_MAX,
} from './progression';
import { NIGHT_BITE } from './daynight';
import { GOOD_MAX, GOOD_MIN, Reel, SWEET_MAX, SWEET_MIN } from './reel';
import { CASINO_LEVEL, CASINO_RANGE, CHIP_COINS, MULT_CAP, PERKS, ROULETTE_PAY, type RouletteBet } from '../data/casino';
import { chipsFor, type BlackjackView, type Card } from './casino';
import { load, newSave, save, type SaveData } from './state';
import { BODY_COLORS, COSMETICS, COS_SLOTS, FACES, cosById, isFace, type CosSlot, type FaceId, type Look } from '../data/cosmetics';
import { faceIcon } from './faces';
import { CharacterPreview } from './character';
import { World } from './world';

type Phase =
  | 'idle'
  | 'charging'
  | 'swing'
  | 'flying'
  | 'waiting'
  | 'bite'
  | 'reeling'
  | 'landing'
  | 'result';

const defaultLookWith = (color: number, face: string): Look => ({ color, face, hat: null, shirt: null, jewelry: null });

/** Item icons shared by the hotbar and the menus. */
const BAIT_ICON: Record<string, string> = { worm: '🪱', fly: '🪰', minnow: '🐟', lure: '💡', pearl: '🦪' };
/** "Graphite Rod" -> "Graphite": the hotbar already shows it's a rod. */
const shortRod = (name: string) => name.replace(/ Rod$/, '');
/** Fish in the water (hooked, shadow) are shown a bit smaller than when held up as a catch. */
const WATER_SCALE = 0.7;
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const CAMP_TIPS = [
  'Tip: hold the cast longer for a farther throw.',
  'Tip: release the reel when the fish surges, or the line may snap.',
  'Tip: shiny fish fight harder but sell for 5×.',
  'Tip: the Lucky Wheel can double a fish... or take it.',
  'Tip: bigger rods and better bait attract rarer fish.',
  `Tip: the gate to Casino Cove opens at level ${CASINO_LEVEL}.`,
];

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const GRAVITY = 9.8;
const HANG_LEN = 1.0;
const FISH_NOSE = new THREE.Vector3(0, 0, -1);
const HANG_PITCH = 0.85;

export class Game {
  private s: SaveData = load();
  private world: World;
  private phase: Phase = 'idle';
  private holding = false;
  private forceActive = false;
  private power = 0;
  private powerDir = 1;
  private perfect = false;
  private castSpot: SpotId = 'prime';
  private spotShown = '';
  private nightShown = false;
  private timer = 0;

  private origin = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private target = new THREE.Vector3();
  private flightT = 1;
  private flightDur = 1;

  private hooked: Fish | null = null;
  private hookedSize = 0;
  private hookedShiny = false;
  private waitTotal = 0;
  private elapsed = 0;
  private nibbleCd = 1.5;
  private nibbleT = 0;
  private approachAngle = 0;
  private shadow: FishModel | null = null;
  private fish: FishModel | null = null;
  private held: FishModel | null = null;
  private carry: { key: string; obj: THREE.Object3D; model: FishModel | null } | null = null;
  private reel: Reel | null = null;
  private lastSurges = 0;
  private leapT = -1;
  private splashCd = 0;
  private tickCd = 0;
  private dbgLock = false;
  private landT = 0;
  private landFrom = new THREE.Vector3();
  private hang = new THREE.Vector3();
  private bob = new THREE.Vector3();
  private bobVel = new THREE.Vector3();
  private tipPos = new THREE.Vector3();
  private swingDir = new THREE.Vector3();
  private baseDist = 1;
  private map: MapDef = MAPS[0];
  private player!: Player;
  private net!: NetClient;
  private roll: eco.Roll | null = null;
  private avatars!: Avatars;
  private dropsView!: DropsView;
  private localDrops = new Drops();
  private serverDrops: Drop[] = [];
  private keys = new Set<string>();
  private menuOpen = true;
  private keepTab = false;
  private atVendor = false;
  private near: { label: string; act: () => void } | null = null;

  private tab = 'inventory';
  private shopTab: 'cosmetics' | 'gear' = 'gear';
  /** The item selected in each menu's tile grid, shown in its details panel. */
  private pick: Partial<Record<'bag' | 'gear' | 'cos' | 'perk', string>> = {};
  private rigLook = '';
  private preview: CharacterPreview | null = null;
  private joining = false;
  private joinColor = BODY_COLORS[4];
  private toastTimer = 0;
  private confirmReset = false;
  private bannerTimer = 0;
  private spin = false;
  private casinoMode: 'roulette' | 'blackjack' | 'prizes' = 'roulette';
  private betSlot = -1;
  private chat!: ChatBox;
  private hotbarHeld = -1;
  private ctxShown: boolean | null = null;
  private bj: BlackjackView | null = null;
  private casinoMsg = '';
  private table: 'roulette' | 'blackjack' | 'prizes' | null = null;
  private aim: { k: string; id: string } | null = null;
  private tableHtml = '';
  private last = performance.now();
  private gauge = $('gauge') as HTMLCanvasElement;
  private gctx = this.gauge.getContext('2d')!;

  constructor() {
    this.world = new World($('game') as HTMLCanvasElement);
    this.avatars = new Avatars(this.world.scene, (x, z) => this.world.surface(x, z));
    this.dropsView = new DropsView(this.world.scene, (x, z) => this.world.surface(x, z));
    const q = new URLSearchParams(location.search);
    const urlName = q.get('name');
    const name = urlName || localStorage.getItem('fishing-name') || '';
    let token = localStorage.getItem('fishing-token');
    if (!token) localStorage.setItem('fishing-token', (token = crypto.randomUUID() + crypto.randomUUID()));
    this.net = new NetClient(name, token, q.get('room') || 'lobby', {
      onState: (save) => {
        const moved = !!save.location && save.location !== this.s.location;
        Object.assign(this.s, save);
        if (this.joining) this.finishJoin();
        if (moved) this.applyLocation();
        this.setGateSign();
        this.refreshHud();
        if (this.menuOpen) this.renderMenu();
      },
      onWheel: (win, ms) => this.startSpin(win, ms),
      onRoulette: (r) => this.startRoulette(r),
      onBlackjack: (v) => {
        const wasDone = !this.bj || this.bj.done;
        this.bj = v;
        if (v?.done && !wasDone) {
          const r = v.result ?? 'lose';
          const label: Record<string, string> = { win: 'YOU WIN!', blackjack: 'BLACKJACK!', push: 'PUSH', lose: 'DEALER WINS', bust: 'BUST!' };
          this.showResult(r === 'win' || r === 'blackjack' ? 'win' : r === 'push' ? 'push' : 'lose', label[r] ?? r.toUpperCase(), r === 'push' ? 'Your fish is safe' : r === 'win' || r === 'blackjack' ? 'Your fish is worth more' : 'The fish is gone');
        }
        this.world.hall?.setBlackjack(v);
        if (this.menuOpen && this.tab === 'casino') this.renderMenu();
      },
      onNotice: (msg) => this.toast(msg),
      onChat: (m) => {
        const self = m.room === this.net.room && m.id === this.net.id;
        this.chat.add({ name: m.name, map: m.map, text: m.text, self });
        if (!self && m.room === this.net.room && m.map === this.map.id) this.avatars.say(m.id, m.text);
      },
      onSys: (text) => this.chat.add({ name: '', map: '', text, self: false, system: true }),
      onDrops: (list) => {
        this.serverDrops = list;
        this.dropsView.sync(list, this.map.id);
      },
      onBoard: () => {
        this.world.hub?.setLeaders(this.anglers());
        if (this.menuOpen && this.tab === 'players') this.renderMenu();
      },
      onFailed: () => {
        if (this.joining) this.joinMessage("Can't reach the game server. Try again, or play offline.");
      },
      onPlayers: () => {
        this.world.hub?.setLeaders(this.anglers());
        if (this.menuOpen && (this.tab === 'players' || this.tab === 'inventory')) this.renderMenu();
        this.avatars.sync(this.net.players, this.net.id, this.map.id);
        this.refreshHud();
      },
      onAct: (p, act) => {
        const f = act?.a === 'hold' ? FISH.find((x) => x.id === act.fish) : null;
        if (f && act?.a === 'hold' && (act.shiny || (f.rarity !== 'common' && f.rarity !== 'uncommon')) && p.map === this.map.id)
          this.toast(`${p.name} caught a ${act.shiny ? '✨ SHINY ' : ''}${f.name} (${sellValue(f, act.size, act.shiny)} 🪙)!`);
      },
      onCast: (roll) => {
        this.roll = roll;
      },
      onCastFail: (msg) => {
        if (this.phase === 'flying' || this.phase === 'swing') this.reset(msg);
      },
      onError: (msg) => (this.joining ? this.joinMessage(msg) : this.toast(`Offline mode: ${msg}`)),
      onClose: () => {
        this.serverDrops = [];
        this.dropsView.sync(this.localDrops.all(), this.map.id);
        this.toast('Disconnected - playing offline.');
      },
    });
    this.applyLocation();
    this.chat = new ChatBox($('chat'), {
      send: (text) => this.net.send({ t: 'chat', text }),
      map: () => this.map.id,
      mapName: (id) => MAPS.find((m) => m.id === id)?.name ?? id,
    });
    $('resume').addEventListener('click', () => {
      // Chrome refuses a re-lock for a moment after Esc; the overlay stays up until a later click works.
      const req = this.world.renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined;
      req?.catch?.(() => {});
    });
    this.bind();
    this.bindJoin(name, !!urlName);
    this.refreshHud();
    this.renderMenu();
    this.setIdlePose();
    requestAnimationFrame(this.loop);
  }

  // ---------- join screen ----------

  private bindJoin(urlName: string | null, direct: boolean): void {
    const input = $('join-name') as HTMLInputElement;
    const swatches = $('join-colors');
    const saved = Number(localStorage.getItem('fishing-color'));
    if (Number.isInteger(saved) && localStorage.getItem('fishing-color')) this.joinColor = saved;
    else this.joinColor = BODY_COLORS[Math.floor(Math.random() * BODY_COLORS.length)];
    input.value = urlName ?? localStorage.getItem('fishing-name') ?? '';
    const paint = () => {
      swatches.innerHTML =
        BODY_COLORS.map((c) => `<button type="button" class="swatch${c === this.joinColor ? ' on' : ''}" data-color="${c}" style="background:#${c.toString(16).padStart(6, '0')}"></button>`).join('') +
        `<input type="color" id="join-custom" value="#${this.joinColor.toString(16).padStart(6, '0')}" title="Custom color">`;
      this.joinPreview();
    };
    swatches.addEventListener('click', (e) => {
      const c = (e.target as HTMLElement).dataset.color;
      if (c) {
        this.joinColor = Number(c);
        paint();
      }
    });
    swatches.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.id === 'join-custom') {
        this.joinColor = parseInt(el.value.slice(1), 16);
        this.joinPreview();
      }
    });
    $('join-go').addEventListener('click', () => this.submitJoin());
    input.addEventListener('keydown', (e) => e.key === 'Enter' && this.submitJoin());
    $('join-offline').addEventListener('click', () => {
      this.joining = false;
      this.s.look.color = this.joinColor;
      this.persist();
      $('join').classList.add('hidden');
      this.preview?.stop();
      this.refreshHud();
    });
    if (direct) {
      // ?name= links (and tests) skip the screen and keep the account's saved look.
      this.net.name = urlName!;
      this.net.connect(this.map.id);
      return;
    }
    $('join').classList.remove('hidden');
    paint();
    input.focus();
    $('join-switch').addEventListener('click', () => {
      localStorage.removeItem('fishing-auto');
      location.reload();
    });
    // Returning players (this browser joined successfully before) reconnect with their saved token.
    if (urlName && localStorage.getItem('fishing-auto')) {
      $('join-switch').classList.remove('hidden');
      this.joinStart(urlName);
    }
  }

  private joinPreview(): void {
    this.getPreview().set({ ...defaultLookWith(this.joinColor, this.s.look.face) });
    const slot = $('join-preview');
    if (!slot.contains(this.getPreview().canvas)) slot.appendChild(this.getPreview().canvas);
    this.getPreview().start();
  }

  private getPreview(): CharacterPreview {
    return (this.preview ??= new CharacterPreview(this.s.look));
  }

  private submitJoin(): void {
    if (this.joining) return;
    const name = ($('join-name') as HTMLInputElement).value.replace(/[^\w \-]/g, '').trim().slice(0, 16);
    if (name.length < 2) return this.joinMessage('Pick a name of 2-16 letters, numbers, spaces or dashes.');
    localStorage.setItem('fishing-name', name);
    localStorage.setItem('fishing-color', String(this.joinColor));
    this.joinStart(name);
  }

  private joinStart(name: string): void {
    this.joining = true;
    this.net.name = name;
    this.net.color = this.joinColor;
    this.joinMessage('Connecting…', false);
    $('join-go').toggleAttribute('disabled', true);
    this.net.connect(this.map.id);
  }

  private joinMessage(msg: string, failed = true): void {
    $('join-msg').textContent = msg;
    if (!failed) return;
    this.joining = false;
    $('join-go').toggleAttribute('disabled', false);
    localStorage.removeItem('fishing-auto');
    $('join-switch').classList.add('hidden');
    $('join').classList.remove('hidden');
    this.joinPreview();
  }

  private finishJoin(): void {
    this.joining = false;
    localStorage.setItem('fishing-auto', '1');
    $('join-switch').classList.add('hidden');
    $('join').classList.add('hidden');
    this.preview?.stop();
    this.world.hub?.setLeaders(this.anglers());
  }

  private get rod() {
    return byId(RODS, this.s.rod);
  }
  private get bait() {
    return byId(BAITS, this.s.bait);
  }
  private get locked() {
    return document.pointerLockElement === this.world.renderer.domElement;
  }
  private get active() {
    return (this.locked || this.forceActive) && !this.menuOpen;
  }

  /** Test hook: drive the game without pointer lock. */
  debug() {
    return {
      banner: (tier: number, verb: string) => this.topTierBanner({ tier }, verb, false),
      activate: () => {
        this.forceActive = true;
        this.setMenu(false);
        audio.start();
      },
      key: (code: string, down: boolean) => {
        if (down) this.keys.add(code);
        else this.keys.delete(code);
      },
      teleport: (x: number, z: number) => this.player.teleport(x, z),
      online: () => this.net.connected,
      preview: () => this.preview,
      perf: () => {
        const w = this.world;
        let lights = 0, meshes = 0, casters = 0, tris = 0;
        this.world.scene.traverse((o) => {
          if ((o as THREE.Light).isLight && o.visible) lights++;
          const m = o as THREE.Mesh;
          if (m.isMesh) { meshes++; if (m.castShadow) casters++; }
        });
        const i = w.renderer.info.render;
        tris = i.triangles;
        return { lights, meshes, casters, calls: i.calls, tris, programs: w.renderer.info.programs?.length ?? 0 };
      },
      renderMs: () => {
        const w = this.world;
        const gl = w.renderer.getContext();
        const px = new Uint8Array(4);
        const run = (): number => {
          const t0 = performance.now();
          for (let k = 0; k < 20; k++) { w.renderer.render(w.scene, w.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
          return +((performance.now() - t0) / 20).toFixed(2);
        };
        run();
        return run();
      },
      day: (f: number | null) => { this.world.dayOverride = f; },
      interact: () => this.interact(),
      openMenu: (tab: string) => this.openMenu(tab),
      closeMenu: () => this.setMenu(false),
      player: () => ({ x: this.player.x, z: this.player.z, y: this.player.eyeY, near: this.near?.label ?? null }),
      s: this.s,
      press: () => {
        this.holding = true;
        this.onPress();
      },
      release: () => {
        this.holding = false;
        if (this.phase === 'charging') this.releaseCast();
      },
      hold: (v: boolean) => {
        this.holding = v;
      },
      look: (yaw: number, pitch: number) => {
        this.world.yaw = yaw;
        this.world.pitch = pitch;
      },
      setPower: (p: number) => {
        this.power = p;
      },
      state: () => ({
        phase: this.phase,
        tension: this.reel?.tension,
        progress: this.reel?.progress,
        status: this.reel?.status,
        pull: this.reel?.pull,
        hooked: this.hooked?.id,
        power: this.power,
      }),
      lock: (v: boolean) => {
        this.dbgLock = v;
      },
      skipWait: () => {
        this.elapsed = this.waitTotal - 0.01;
      },
      world: this.world,
    };
  }

  private bind(): void {
    $('menu').addEventListener('click', (e) =>
      this.onMenuClick(e.target as HTMLElement),
    );
    $('hotbar').addEventListener('click', (e) => {
      const i = Number((e.target as HTMLElement).closest<HTMLElement>('.slot.sellable')?.dataset.i);
      if (!Number.isInteger(i)) return;
      if (this.tab === 'casino') this.pickBet(i);
      else this.sellSlot(i);
    });
    $('menu').addEventListener('mouseover', (e) => {
      this.tryOn(e.target as HTMLElement, true);
      this.showTip(e.target as HTMLElement, e as MouseEvent);
    });
    $('menu').addEventListener('mousemove', (e) => this.moveTip(e as MouseEvent));
    $('menu').addEventListener('mouseout', (e) => {
      this.tryOn(e.target as HTMLElement, false);
      if (!(e.relatedTarget as HTMLElement | null)?.closest?.('[data-tip]')) $('tip').classList.add('hidden');
    });
    document.addEventListener('pointerlockchange', () => {
      $('resume').classList.add('hidden');
      // Esc while typing: the browser always releases the mouse, but that should only cancel the
      // chat, not pause the game. A click picks the mouse back up.
      if (!this.locked && this.chat.active) {
        this.chat.close();
        this.holding = false;
        this.keys.clear();
        this.showResume('Chat closed · ');
        return;
      }
      this.setMenu(!this.locked);
      if (!this.locked) {
        this.holding = false;
        this.keys.clear();
        if (!this.keepTab) this.tab = 'inventory';
        this.keepTab = false;
        this.renderMenu();
      }
    });
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.active || this.dbgLock) return;
      this.world.yaw -= e.movementX * 0.0022;
      this.world.pitch = Math.max(
        -1.2,
        Math.min(0.6, this.world.pitch - e.movementY * 0.0022),
      );
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.active || e.button !== 0 || this.dbgLock || this.chat.isOpen) return;
      this.holding = true;
      this.onPress();
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      this.holding = false;
      if (this.phase === 'charging') this.releaseCast();
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    const wheel = new WheelStepper();
    document.addEventListener('wheel', (e) => {
      if (!this.active || this.menuOpen || this.phase !== 'idle') return;
      const step = wheel.step(e.deltaY, e.deltaMode, e.timeStamp);
      if (!step) return;
      const n = this.s.slots.length;
      this.takeSlot((this.s.held + step + n) % n);
    }, { passive: true });
    document.addEventListener('keydown', (e) => {
      if (this.active && (e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat) {
        if (!this.net.connected) return this.toast('Chat needs a server connection.');
        this.keys.clear();
        return this.chat.open();
      }
      if (this.active && e.code.startsWith('Key')) {
        this.keys.add(e.code);
        if (e.code === 'KeyE' && !e.repeat && this.phase === 'idle') this.interact();
      } else if (e.code.startsWith('Shift') && this.active) this.keys.add(e.code);
      if (e.code === 'Tab') {
        e.preventDefault();
        if (e.repeat || !$('join').classList.contains('hidden')) return;
        if (this.menuOpen) this.closeMenu();
        else if (this.active || !$('resume').classList.contains('hidden')) this.openMenu('inventory');
        return;
      }
      if (e.code === 'Escape' && !e.repeat && !$('resume').classList.contains('hidden')) {
        $('resume').classList.add('hidden');
        this.setMenu(true);
        return this.renderMenu();
      }
      if (e.code === 'Escape' && this.menuOpen && !e.repeat) return this.closeMenu();
      if (e.repeat || this.menuOpen || !this.active) return;
      // By key position, not e.key: holding Shift to sprint turns "1" into "!".
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      const i = digit ? Number(digit[1]) - 1 : -1;
      if (i >= 0 && i < this.s.slots.length && this.phase === 'idle') this.takeSlot(i);
      else if (e.code === 'KeyG' && this.phase === 'idle') this.dropHeld();
      else if (e.code === 'Space' && this.active && this.phase === 'idle') { e.preventDefault(); this.player.jump(); }
      else if (e.code === 'KeyM' && !e.repeat) this.toast(audio.toggleMusic() ? '🎵 Music on' : '🔇 Music off');
    });
  }

  private onMenuClick(el: HTMLElement): void {
    const btn = el.closest('button') as HTMLButtonElement | null;
    if (!btn || btn.disabled) return;
    const { tab, shop, pick, act, id } = btn.dataset;
    if (act === 'close') return this.closeMenu();
    if (tab) this.tab = tab;
    else if (shop) this.shopTab = shop as 'cosmetics' | 'gear';
    else if (pick) this.pick[pick as keyof typeof this.pick] = id;
    else if (act === 'perk') this.casinoSend({ t: 'buyperk', id: id! });
    else if (act === 'music') audio.toggleMusic();
    else if (act === 'sellall') return this.sellAll();
    else if (act === 'equiprod') this.equipRod(id!);
    else if (act === 'equipbait') this.equipBait(id!);
    else if (act === 'stow') this.stow(Number(id));
    else if (act === 'buycos') this.buyCosmetic(id!);
    else if (act === 'equip') this.equip(btn.dataset.slot as CosSlot, id || null);
    else if (act === 'color') this.recolor(Number(id));
    else if (act === 'face') this.reface(id!);
    else if (act === 'reset') this.confirmReset = true;
    else if (act === 'resetno') this.confirmReset = false;
    else if (act === 'resetyes') this.resetAccount();
    else if (act === 'buyrod' || act === 'buybait') this.buy(act === 'buyrod' ? 'rod' : 'bait', id!);
    this.persist();
    this.refreshHud();
    this.renderMenu();
  }

  /** Number keys: take that hotbar slot in hand. */
  private takeSlot(i: number): void {
    if (this.spin || (this.bj && !this.bj.done)) return;
    if (!eco.selectSlot(this.s, i)) return this.toast('Bait locked');
    this.net.send({ t: 'slot', i });
    this.refreshHud();
    this.persist();
  }

  private dropHeld(): void {
    if (this.spin) return;
    const held = this.s.slots[this.s.held];
    if (!held) return;
    const item = eco.dropHeld(this.s);
    if (!item) return this.toast("You can't drop your only rod.");
    if (this.net.connected) this.net.send({ t: 'drop' });
    else {
      const at = dropSpot(this.player.x, this.player.z, this.world.yaw);
      this.localDrops.add(this.map.id, at.x, at.z, item);
      this.dropsView.sync(this.localDrops.all(), this.map.id);
    }
    this.toast(`Dropped ${itemName(item)} - it disappears in 30 s`);
    this.persist();
    this.refreshHud();
  }

  private pickUp(d: Drop): void {
    if (this.spin) return;
    if (!eco.takeItem(this.s, d.item)) return this.toast('Your hotbar is full.');
    if (this.net.connected) this.net.send({ t: 'pickup', id: d.id });
    else {
      this.localDrops.remove(d.id);
      this.dropsView.sync(this.localDrops.all(), this.map.id);
    }
    this.toast(`Picked up ${itemName(d.item)}`);
    this.persist();
    this.refreshHud();
  }

  private buy(kind: 'rod' | 'bait', id: string): void {
    if (this.spin) return;
    const s = this.s;
    if (kind === 'rod') {
      const r = byId(RODS, id);
      if (eco.ownsRod(s, id)) return this.toast(`You already have the ${r.name}.`);
      if (s.level < r.unlockLevel) return this.toast(`${r.name} unlocks at level ${r.unlockLevel}.`);
      if (s.coins < r.price) return this.toast(`Not enough coins (${r.price} 🪙).`);
      eco.buyRod(s, id);
      this.net.send({ t: 'buyrod', id });
      this.toast(eco.hasRod(s, id) ? `Bought the ${r.name} - equipped!` : `Bought the ${r.name} - equip it in your Inventory (Tab)`);
    } else {
      const b = byId(BAITS, id);
      const cost = b.price * eco.BAIT_PACK;
      if (s.level < b.unlockLevel) return this.toast(`${b.name} unlocks at level ${b.unlockLevel}.`);
      if (s.coins < cost) return this.toast(`Not enough coins (${cost} 🪙).`);
      if (!eco.buyBait(s, id)) return this.toast('Your locker is full of that bait.');
      this.net.send({ t: 'buybait', id });
      const inHand = s.slots.reduce((a, x) => a + (x?.k === 'bait' && x.id === id ? x.n : 0), 0);
      if (eco.baitCount(s, id) > inHand) this.toast(`Bought ${eco.BAIT_PACK} ${b.name}. Your hotbar stack holds ${inHand}, so the rest (${eco.baitCount(s, id) - inHand}) is in your tackle locker 🧰`);
      else this.toast(s.bait === id ? `Bought ${eco.BAIT_PACK} ${b.name} - equipped!` : `Bought ${eco.BAIT_PACK} ${b.name} - equip it in your Inventory (Tab)`);
    }
    this.persist();
    this.refreshHud();
  }

  private equipRod(id: string): void {
    if (!eco.equipRod(this.s, id)) return this.toast('Free a hotbar slot first (stow or drop something).');
    this.net.send({ t: 'equiprod', id });
    this.toast(`Equipped the ${byId(RODS, id).name}`);
  }

  private equipBait(id: string): void {
    if (!eco.equipBait(this.s, id)) return this.toast('Free a hotbar slot first (stow or drop something).');
    this.net.send({ t: 'equipbait', id });
    this.toast(`Equipped ${byId(BAITS, id).name}`);
  }

  private stow(i: number): void {
    if (!eco.stowSlot(this.s, i)) return;
    this.net.send({ t: 'stow', i });
    this.toast('Stored in your tackle locker');
  }

  /** Wheel: online the server rolls; offline we roll locally. */
  private gamble(): void {
    if (this.spin || this.s.slots[this.s.held]?.k !== 'fish') return;
    if (this.net.connected) this.net.send({ t: 'gamble' });
    else this.startSpin(Math.random() < eco.WHEEL_WIN, 3800);
  }

  private startSpin(win: boolean, ms: number): void {
    const it = this.s.slots[this.s.held];
    if (it?.k !== 'fish' || this.spin) return;
    const value = eco.fishValue(it);
    const name = byId(FISH, it.fishId).name;
    this.spin = true;
    this.world.hub?.spinWheel(win, ms);
    setTimeout(() => {
      this.spin = false;
      if (!this.net.connected) {
        eco.applyWheel(this.s, win);
        this.persist();
        this.refreshHud();
      }
      this.showWheelResult(win, name, value);
    }, ms);
  }

  private showWheelResult(win: boolean, name: string, value: number): void {
    const el = $('wheelres');
    el.className = `show ${win ? 'win' : 'lose'}`;
    el.innerHTML = win
      ? `<b>DOUBLED!</b><span>${name} is now worth ${value * 2} 🪙 <small>(+${value})</small></span>`
      : `<b>LOST!</b><span>${name} (${value} 🪙) is gone</span>`;
    if (win) audio.jingle('epic');
    else audio.snap();
    setTimeout(() => el.classList.remove('show'), 2600);
  }

  private sellHeld(): void {
    if (this.spin) return;
    const it = this.s.slots[this.s.held];
    if (it?.k !== 'fish') return;
    const value = eco.sellPrice(this.s, it);
    eco.sellHeld(this.s);
    this.net.send({ t: 'sell' });
    this.toast(`Sold ${byId(FISH, it.fishId).name} for ${value} 🪙`);
    this.persist();
    this.refreshHud();
  }

  /** Shop "Sell all": every fish in the hotbar, last slot first so indexes stay valid. */
  private sellAll(): void {
    for (let i = this.s.slots.length - 1; i >= 0; i--) if (this.s.slots[i]?.k === 'fish') this.sellSlot(i);
  }

  /** Shop open: clicking a fish in the hotbar sells it. */
  private sellSlot(i: number): void {
    if (this.spin || !this.atVendor) return;
    const it = this.s.slots[i];
    if (it?.k !== 'fish') return;
    const value = eco.sellPrice(this.s, it);
    eco.sellSlot(this.s, i);
    this.net.send({ t: 'sell', i });
    this.toast(`Sold ${byId(FISH, it.fishId).name} for ${value} 🪙`);
    audio.jingle('common');
    this.persist();
    this.refreshHud();
    this.renderMenu();
  }

  private buyCosmetic(id: string): void {
    const c = cosById(id);
    if (!c) return;
    if (!this.atVendor) return this.toast(`Walk to ${this.map.vendor.name}'s stall to buy.`);
    if (this.s.owned.includes(id)) return;
    if (this.s.coins < c.price) return this.toast(`Not enough coins (${c.price} 🪙).`);
    eco.buyCosmetic(this.s, id);
    this.net.send({ t: 'buycos', id });
    this.toast(`Bought ${c.name} - wear it from your Inventory (Tab)`);
    this.persist();
    this.refreshHud();
  }

  private equip(slot: CosSlot, id: string | null): void {
    if (!eco.equipCosmetic(this.s, slot, id)) return;
    this.net.send({ t: 'equip', slot, id });
    this.persist();
  }

  private resetAccount(): void {
    this.confirmReset = false;
    const { color, face } = this.s.look;
    this.roll = null;
    if (this.net.connected) this.net.send({ t: 'reset' });
    else {
      Object.assign(this.s, newSave());
      Object.assign(this.s.look, { color, face });
    }
    this.toast('Account reset. Fresh start!');
  }

  private reface(face: string): void {
    if (!eco.setFace(this.s, face)) return;
    this.net.send({ t: 'face', id: face });
    this.persist();
  }

  private recolor(color: number): void {
    if (!eco.setBodyColor(this.s, color)) return;
    this.net.send({ t: 'color', color });
    localStorage.setItem('fishing-color', String(color));
    this.persist();
  }

  private showTip(el: HTMLElement, e: MouseEvent): void {
    const t = el.closest<HTMLElement>('[data-tip]');
    const tip = $('tip');
    if (!t) return tip.classList.add('hidden');
    tip.innerHTML = t.dataset.tip!;
    tip.classList.remove('hidden');
    this.moveTip(e);
  }

  private moveTip(e: MouseEvent): void {
    const tip = $('tip');
    if (tip.classList.contains('hidden')) return;
    const x = Math.min(e.clientX + 16, window.innerWidth - tip.offsetWidth - 8);
    const y = Math.min(e.clientY + 16, window.innerHeight - tip.offsetHeight - 8);
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }

  /** Hovering an item in the shop or wardrobe previews it on the spinning character. */
  private tryOn(el: HTMLElement, on: boolean): void {
    const card = el.closest<HTMLElement>('[data-try]');
    if (!card || !this.preview) return;
    const [slot, id] = card.dataset.try!.split(':');
    this.preview.set(on ? { ...this.previewLook(), [slot]: id } : this.previewLook());
  }

  /** Everyone online with their level, highest first. */
  private leaders(): { name: string; level: number; color: number; face: FaceId; me: boolean }[] {
    const face = (f: string) => (isFace(f) ? f : 'smile');
    const rows = [{ name: this.net.name, level: this.s.level, color: this.s.look.color, face: face(this.s.look.face), me: true }];
    for (const p of this.net.players.values()) rows.push({ name: p.name, level: p.level ?? 1, color: p.look.color, face: face(p.look.face), me: false });
    return rows.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  }

  /** Online players ranked by their most valuable catch, for the physical board. */
  private anglers(): LeaderRow[] {
    type Row = { name: string; level: number; best: SaveData['best']; coins: number };
    let all: Row[];
    if (this.net.connected) {
      all = this.net.hall.map((h) => ({ name: h.name, level: h.level, best: h.best, coins: 0 }));
    } else {
      all = [{ name: this.net.name, level: this.s.level, best: this.s.best, coins: this.s.coins }];
    }
    return all
      .sort((a, b) => (b.best?.value ?? 0) - (a.best?.value ?? 0) || b.coins - a.coins)
      .map((p) => {
        const f = p.best ? FISH.find((x) => x.id === p.best!.fishId) : undefined;
        return {
          name: p.name,
          level: p.level,
          value: f ? p.best!.value : 0,
          fish: f?.name ?? '',
          tier: f?.tier ?? 0,
          color: this.tierColor(f?.tier ?? 0),
          shiny: p.best?.shiny,
        };
      });
  }

  /**
   * Closes the menu right away. Browsers won't re-capture the mouse from an Esc press, so if the
   * capture fails a "click to keep playing" overlay waits for the click that can.
   */
  private closeMenu(): void {
    this.tab = 'inventory';
    this.setMenu(false);
    if (this.forceActive) return;
    this.showResume();
    const req = this.world.renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined;
    req?.catch?.(() => {});
  }

  /** The overlay shown while the game is running but the mouse isn't captured; hidden on capture. */
  private showResume(prefix = ''): void {
    const el = $('resume');
    el.innerHTML = `${prefix}<b>Click</b> to keep playing`;
    el.classList.remove('hidden');
  }

  /** Offline play saves locally; online, the server owns the save. */
  private persist(): void {
    if (!this.net.connected) save(this.s);
  }

  /** The pond gate opens at the casino level; the casino's gate always leads back to the pond. */
  private get gateOpen(): boolean {
    return !!this.map.casino || this.s.level >= CASINO_LEVEL;
  }

  private setGateSign(): void {
    this.world.hub?.setGate(this.gateOpen);
  }

  private applyLocation(): void {
    this.map = MAPS.find((m) => m.id === this.s.location) ?? MAPS[0];
    this.s.location = this.map.id;
    this.world.setLocation(byId(LOCATIONS, this.map.locationId), this.map);
    this.setGateSign();
    this.bj = null;
    this.player = new Player(this.map.radius);
    this.player.teleport(this.map.spawn.x, this.map.spawn.z);
    this.world.yaw = this.map.spawn.yaw;
    this.net.send({ t: 'map', map: this.map.id });
    this.avatars.sync(this.net.players, this.net.id, this.map.id);
  }

  // ---------- walking & interaction ----------

  private setMenu(open: boolean): void {
    this.menuOpen = open;
    $('menu').classList.toggle('hidden', !open);
    if (open) $('resume').classList.add('hidden');
    // The wardrobe preview has its own render loop; renderMenu restarts it when the tab is shown again.
    if (!open && $('join').classList.contains('hidden')) this.preview?.stop();
  }

  private openMenu(tab: string): void {
    this.tab = tab;
    this.keepTab = true;
    this.holding = false;
    this.keys.clear();
    if (this.locked) document.exitPointerLock();
    else {
      this.setMenu(true);
      this.keepTab = false;
    }
    this.renderMenu();
  }

  // ---------- casino ----------

  private useGate(): void {
    const dest = this.map.next;
    if (!dest) return this.toast('The road ends here.');
    if (!this.gateOpen) return this.toast(`${dest.name} needs level ${CASINO_LEVEL}.`);
    if (!this.net.connected) return this.toast('The casino needs a server connection.');
    this.net.send({ t: 'travel', to: dest.id });
  }

  private openCasino(mode: 'roulette' | 'blackjack' | 'prizes'): void {
    if (!this.net.connected) return this.toast('The tables need a server connection.');
    this.casinoMode = mode;
    this.casinoMsg = '';
    if (this.bj?.done) this.bj = null;
    if (this.s.slots[this.betSlot]?.k !== 'fish') this.betSlot = this.s.slots.findIndex((x) => x?.k === 'fish');
    this.openMenu('casino');
  }

  private casinoSend(msg: Parameters<NetClient['send']>[0]): void {
    if (!this.net.connected) return this.toast('The casino needs a server connection.');
    this.net.send(msg);
  }

  private pickBet(i: number): void {
    if (this.spin || (this.bj && !this.bj.done)) return;
    if (this.casinoMode === 'prizes') {
      this.casinoSend({ t: 'cashout', i });
      return;
    }
    this.betSlot = i;
    this.casinoMsg = '';
    this.renderMenu();
  }

  private rouletteBet(bet: RouletteBet): void {
    if (this.spin) return;
    this.casinoMsg = '';
    this.casinoSend({ t: 'roulette', bet, i: this.betSlot });
  }

  private startRoulette(r: { pocket: number; color: string; factor: number; ms: number }): void {
    const it = this.s.slots[this.betSlot];
    if (it?.k !== 'fish') return;
    const name = byId(FISH, it.fishId).name;
    const before = eco.fishValue(it);
    const after = Math.min(MULT_CAP, (it.mult ?? 1) * r.factor) * (before / (it.mult ?? 1));
    this.spin = true;
    this.casinoMsg = '<span class="muted">The wheel is spinning…</span>';
    this.world.hall?.spin(r.pocket, r.ms);
    if (this.menuOpen) this.renderMenu();
    setTimeout(() => {
      this.spin = false;
      const win = r.factor > 0;
      this.casinoMsg = win
        ? `<b class="win">${r.color.toUpperCase()}! You win</b> ${name} is now worth ${Math.round(after)} 🪙`
        : `<b class="lose">${r.color.toUpperCase()}.</b> ${name} (${before} 🪙) is gone`;
      this.showResult(win ? 'win' : 'lose', win ? `${r.color.toUpperCase()}! YOU WIN` : `${r.color.toUpperCase()}. YOU LOSE`, win ? `${name} is now worth ${Math.round(after)} 🪙` : `${name} is gone`);
      if (win) audio.jingle('epic');
      else audio.snap();
      if (this.menuOpen) this.renderMenu();
    }, r.ms);
  }

  private resultTimer = 0;
  private showResult(kind: 'win' | 'lose' | 'push', title: string, sub: string): void {
    const el = $('tableresult');
    el.className = kind;
    el.innerHTML = `${title}<small>${sub}</small>`;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(this.resultTimer);
    this.resultTimer = window.setTimeout(() => el.classList.add('hidden'), 2600);
  }

  private blackjackAct(a: 'deal' | 'hit' | 'stand' | 'double'): void {
    if (this.spin) return;
    if (a === 'deal') {
      if (this.bj && !this.bj.done) return;
      this.bj = null;
      this.casinoMsg = '';
      this.casinoSend({ t: 'bj', a, i: this.betSlot });
    } else this.casinoSend({ t: 'bj', a });
  }

  private cardHtml(c: Card | null): string {
    if (!c) return '<span class="pc back">?</span>';
    const rank = c.r === 1 ? 'A' : c.r === 11 ? 'J' : c.r === 12 ? 'Q' : c.r === 13 ? 'K' : String(c.r);
    const suit = ['♠', '♥', '♦', '♣'][c.s];
    return `<span class="pc${c.s === 1 || c.s === 2 ? ' red' : ''}">${rank}${suit}</span>`;
  }

  private chipsText(n: number): string {
    return String(Math.round(n * 10) / 10);
  }

  private casinoHtml(): string {
    const s = this.s;
    // Perks have no tier; colour them by price so the rarer unlocks stand out.
    const tierOf = (chips: number) => (chips <= 20 ? 2 : chips <= 50 ? 3 : chips <= 100 ? 4 : 5);
    const p = PERKS.find((x) => x.id === this.pick.perk) ?? PERKS.find((x) => !s.perks.includes(x.id)) ?? PERKS[0];
    this.pick.perk = p.id;
    const tiles = PERKS.map((p) => {
      const owned = !p.consumable && s.perks.includes(p.id);
      const locked = !!p.requires && !s.perks.includes(p.requires);
      const sub = owned ? 'Owned' : locked ? '🔒 Locked' : `${p.chips} chips`;
      return this.itemTile({ icon: p.icon, name: p.name, sub, tier: tierOf(p.chips), on: this.pick.perk === p.id, check: owned, ghost: !owned && (locked || s.chips < p.chips), attrs: `data-pick="perk" data-id="${p.id}"` });
    }).join('');
    const owned = !p.consumable && s.perks.includes(p.id);
    const locked = !!p.requires && !s.perks.includes(p.requires);
    const action = owned
      ? this.btn('Owned ✓', '', 'ok', true)
      : locked
        ? this.btn(`Buy ${PERKS.find((x) => x.id === p.requires)!.name} first`, '', 'plain', true)
        : s.chips < p.chips
          ? this.btn(`Need ${p.chips} chips`, '', 'plain', true)
          : this.btn(`Buy for ${p.chips} chips`, `data-act="perk" data-id="${p.id}"`);
    const detail = this.detail({
      icon: p.icon,
      name: p.name,
      tier: tierOf(p.chips),
      badge: `<span class="badge" style="--c:var(--t${tierOf(p.chips)})">${p.consumable ? 'Consumable' : 'Permanent'} · ${p.chips} chips</span>`,
      body: p.id === 'lure' ? `<div class="have">Charges left: <b>${s.lure}</b></div>` : '',
      note: p.desc,
      actions: action,
    });
    return `<div class="cols"><div class="main"><h4>Casino unlocks</h4><div class="tiles">${tiles}</div><p class="casino-msg">${this.casinoMsg}</p></div>${detail}</div>${this.sellStrip()}`;
  }

  /** Which table (if any) the player is standing at; while there, clicks hit the 3D bet patches and buttons. */
  private updateTable(walking: boolean): void {
    const c = this.map.casino;
    const hall = this.world.hall;
    const hud = $('tablehud');
    let t: 'roulette' | 'blackjack' | 'prizes' | null = null;
    if (c && hall && walking) {
      const d = (sp: { x: number; z: number }) => Math.hypot(sp.x - this.player.x, sp.z - this.player.z);
      if (d(c.roulette) <= 3.4) t = 'roulette';
      else if (d(c.blackjack) <= 3.4) t = 'blackjack';
      else if (d(c.prizes) <= 3.6) t = 'prizes';
    }
    this.table = t;
    hall?.setChips(this.s.chips);
    if (!t || !hall) {
      hall?.clearHover();
      this.aim = null;
      hud.classList.add('hidden');
      return;
    }
    const busy = this.spin || (!!this.bj && !this.bj.done);
    if (!busy) this.betSlot = this.s.slots[this.s.held]?.k === 'fish' ? this.s.held : -1;
    this.aim = hall.pick(this.world.camera);
    const it = this.s.slots[this.betSlot];
    const fish = it?.k === 'fish' ? it : null;
    const rich = !!fish && (fish.mult ?? 1) >= MULT_CAP;
    const lines: string[] = [];
    if (t === 'prizes') {
      const held = this.s.slots[this.s.held];
      const onTray = this.aim?.k === 'cash';
      if (held?.k === 'fish') {
        const name = byId(FISH, held.fishId).name;
        const chips = chipsFor(eco.fishValue(held));
        // The trade prompt: exactly what a click on the chip tray will do.
        if (chips >= 1) lines.push(`<span class="trade${onTray ? ' ready' : ''}"><kbd>Click</kbd> ${onTray ? '' : 'the chip tray '}to trade <b>${name}</b> for <b>${chips}</b> chips</span>`);
        else lines.push(`<b>${name}</b> is worth ${chips} chips. Win it bigger at a table first.`);
      } else lines.push('Hold a fish (<kbd>1</kbd>-<kbd>5</kbd>) to trade it for chips.');
      if (this.aim?.k !== 'cash') lines.push('<span class="muted">Prize case: click it, or press <kbd>E</kbd></span>');
      const html = lines.join('<br>');
      if (html !== this.tableHtml) {
        this.tableHtml = html;
        hud.innerHTML = html;
      }
      hud.classList.remove('hidden');
      return;
    }
    lines.push(
      fish
        ? `Betting <b>${byId(FISH, fish.fishId).name}</b> · ${eco.fishValue(fish)} 🪙${rich ? ' <span class="lose">(too rich for the table, turn it in)</span>' : ''}`
        : 'Hold a fish (1-5) to bet it.',
    );
    const g = this.bj;
    if (t === 'blackjack' && g) {
      lines.push(`Dealer <b>${g.dealerTotal ?? '?'}</b> · You <b>${g.playerTotal}</b>`);
      if (g.done) {
        const verdict: Record<string, string> = { win: 'You win!', blackjack: 'Blackjack!', push: 'Push. Your fish is safe.', lose: 'Dealer wins. The fish is gone.', bust: 'Bust. The fish is gone.' };
        lines.push(`<b class="${g.result === 'win' || g.result === 'blackjack' ? 'win' : g.result === 'push' ? '' : 'lose'}">${verdict[g.result ?? 'lose']}</b>`);
      }
    }
    if (this.casinoMsg) lines.push(this.casinoMsg);
    if (this.aim && !this.spin) lines.push(`<span class="muted">Click: ${this.aimLabel(this.aim)}</span>`);
    else if (!busy && t === 'roulette') lines.push('<span class="muted">Aim at red, black or green and click to bet.</span>');
    else if (!busy && t === 'blackjack' && !g) lines.push('<span class="muted">Click DEAL on the table to play.</span>');
    const html = lines.join('<br>');
    if (html !== this.tableHtml) {
      this.tableHtml = html;
      hud.innerHTML = html;
    }
    hud.classList.remove('hidden');
  }

  private aimLabel(a: { k: string; id: string }): string {
    if (a.k === 'rbet') return `bet on ${a.id} · ×${ROULETTE_PAY[a.id as RouletteBet]}`;
    return { deal: 'deal a hand', hit: 'hit', stand: 'stand', double: 'double down' }[a.id] ?? a.id;
  }

  private tableClick(): void {
    if (!this.table) return this.toast('No fishing in the casino. Head out the front door.');
    const a = this.aim;
    if (this.table === 'prizes') {
      if (a?.k === 'shop') this.openCasino('prizes');
      else if (a?.k === 'cash') {
        if (this.s.slots[this.s.held]?.k !== 'fish') return this.toast('Hold a fish (1-5) to turn it in.');
        this.casinoSend({ t: 'cashout', i: this.s.held });
      }
      return;
    }
    if (!a || this.spin) return;
    const it = this.s.slots[this.betSlot];
    const needsFish = a.k === 'rbet' || a.id === 'deal';
    if (needsFish && it?.k !== 'fish') return this.toast('Hold a fish (1-5) to bet it.');
    if (needsFish && (it as { mult?: number }).mult !== undefined && ((it as { mult?: number }).mult ?? 1) >= MULT_CAP) return this.toast('That fish is too rich for the table. Turn it in at the prize counter.');
    if (a.k === 'rbet') this.rouletteBet(a.id as RouletteBet);
    else this.blackjackAct(a.id as 'deal' | 'hit' | 'stand' | 'double');
  }

  private openBottle(id: string, note: string): void {
    const all = this.map.town.bottles.map((b) => b.id);
    const gain = eco.collectBottle(this.s, id, all);
    if (gain <= 0) return;
    this.net.send({ t: 'bottle', id });
    const left = all.length - this.s.bottles.length;
    this.toast(`📜 "${note}" · +${gain} 🪙 · ${left ? `${left} bottle${left > 1 ? 's' : ''} left to find` : 'You found them all!'}`, 7);
    audio.jingle('rare');
    this.persist();
    this.refreshHud();
  }

  private interact(): void {
    this.near?.act();
  }

  private updateWalking(dt: number): void {
    const w = this.world;
    const walking = this.active && this.phase === 'idle';
    const k = this.keys;
    const fwd = walking ? Number(k.has('KeyW')) - Number(k.has('KeyS')) : 0;
    const strafe = walking ? Number(k.has('KeyD')) - Number(k.has('KeyA')) : 0;
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    this.player.update(dt, fwd, strafe, sprint, w.yaw, w.colliders);
    w.eye.set(this.player.x, this.player.eyeY, this.player.z);
    w.walkBob = this.player.bob;

    const hub = w.hub;
    const { x, z } = this.player;
    // Lower d wins: aimed stall goods, then selling, then picking up, then everything else by distance.
    const spots: { d: number; label: string; act: () => void }[] = [];

    for (const d of this.curDrops()) {
      const dist = d.map === this.map.id ? Math.hypot(d.x - x, d.z - z) : Infinity;
      if (dist <= PICKUP_RANGE) spots.push({ d: dist - 10, label: `Pick up ${itemName(d.item)}`, act: () => this.pickUp(d) });
    }

    const town = w.town;
    if (town) {
      town.setFound(this.s.bottles);
      for (const npc of town.npcs) {
        spots.push({ d: Math.hypot(npc.pos.x - x, npc.pos.z - z) - 0.5, label: `Talk to ${npc.def.name}`, act: () => this.toast(town.talk(npc, w.night > 0.5), 6) });
      }
      for (const b of town.bottles) {
        if (this.s.bottles.includes(b.id)) continue;
        const db = Math.hypot(b.pos.x - x, b.pos.z - z);
        if (db < 2.6) spots.push({ d: db - 20, label: 'Open the message in a bottle', act: () => this.openBottle(b.id, b.note) });
      }
    }

    const c = this.map.casino;
    this.updateTable(walking);
    if (c) {
      const at = (sp: { x: number; z: number }) => Math.hypot(sp.x - x, sp.z - z);
      const table = (sp: { x: number; z: number }, mode: 'roulette' | 'blackjack' | 'prizes', label: string) => {
        if (at(sp) <= CASINO_RANGE - 0.4) spots.push({ d: at(sp) - 25, label, act: () => this.openCasino(mode) });
      };
      table(c.prizes, 'prizes', 'Prize counter · turn fish in for chips, buy perks');
      spots.push(
        { d: at(c.mirror), label: 'Dressing mirror · change your look', act: () => this.openMenu('wardrobe') },
        { d: at(this.map.gate) - 0.5, label: `Exit to ${this.map.next?.name ?? 'the pond'}`, act: () => this.useGate() },
      );
    }
    if (hub) {
      const dv = Math.hypot(hub.vendorSpot.x - x, hub.vendorSpot.z - z);
      this.atVendor = dv < 3.2;
      if (this.atVendor) {
        const held = this.s.slots[this.s.held];
        if (held?.k === 'fish') {
          const f = byId(FISH, held.fishId);
          spots.push({ d: -30, label: `Sell ${f.name} · ${eco.sellPrice(this.s, held)} 🪙`, act: () => this.sellHeld() });
        }
        spots.push({
          d: dv,
          label: `Talk to ${this.map.vendor.name} · open shop`,
          act: () => this.openMenu('shop'),
        });
      }
      const dw = Math.hypot(hub.wheelSpot.x - x, hub.wheelSpot.z - z);
      if (dw <= eco.WHEEL_RANGE - 0.5) {
        const wh = this.s.slots[this.s.held];
        spots.push(
          wh?.k === 'fish'
            ? { d: -40, label: `Spin the wheel with ${byId(FISH, wh.fishId).name} · 2× or nothing (${eco.fishValue(wh)} 🪙)`, act: () => this.gamble() }
            : { d: dw, label: 'Lucky Wheel · hold a fish and press E to gamble it', act: () => this.toast('Hold a fish (1-5), then press E to spin.') },
        );
      }
      const near = (v: THREE.Vector3) => Math.hypot(v.x - x, v.z - z);
      spots.push(
        { d: near(hub.leaderSpot), label: 'Top Anglers · see everyone online', act: () => this.openMenu('players') },
        { d: near(hub.mirrorSpot), label: 'Dressing mirror · change your look', act: () => this.openMenu('wardrobe') },
        { d: near(hub.campSpot), label: 'Warm up by the campfire', act: () => this.toast(CAMP_TIPS[Math.floor(Math.random() * CAMP_TIPS.length)]) },
        {
          d: Math.hypot(hub.gateSpot.x - x, hub.gateSpot.z - z),
          label: this.gateOpen
            ? `Travel to ${this.map.next?.name ?? 'the next area'}`
            : `Gate sealed · ${this.map.next?.name ?? 'next area'} needs level ${CASINO_LEVEL}`,
          act: () => this.useGate(),
        },
      );
    }
    const best = walking ? spots.filter((sp) => sp.d < 3).sort((a, b) => a.d - b.d)[0] : undefined;
    this.near = best ?? null;
    const prompt = $('prompt');
    prompt.classList.toggle('hidden', !best);
    if (best) prompt.innerHTML = `<b>E</b> ${best.label}`;
  }

  private curDrops(): Drop[] {
    return this.net.connected ? this.serverDrops : this.localDrops.all();
  }

  // ---------- fishing flow ----------

  private setIdlePose(): void {
    this.world.rig.pose({
      pitch: 0.55,
      yaw: 0,
      bendP: 0.08,
      bendY: 0,
      k: 50,
      c: 9,
    });
  }

  private onPress(): void {
    switch (this.phase) {
      case 'result':
        if (!this.dbgLock) this.dismissCatch();
        break;
      case 'idle':
      {
        if (this.spin) return;
        if (this.map.casino) return this.tableClick();
        const can = eco.canCast(this.s);
        if (can !== 'ok') return this.toast(eco.CAST_MESSAGES[can]);
      }
        this.phase = 'charging';
        this.power = 0;
        this.powerDir = 1;
        break;
      case 'waiting':
        this.reset('You pulled in too early.');
        break;
      case 'bite':
        this.startReel();
        break;
    }
  }

  private releaseCast(): void {
    const w = this.world;
    let dist = 4 + Math.max(0.12, this.power) * (this.rod.castDistance - 4);
    let t = w.castTarget(dist);
    while (!isWater(t.x, t.z) && dist > 3) t = w.castTarget((dist -= 1));
    if (!isWater(t.x, t.z)) {
      this.phase = 'idle';
      this.setIdlePose();
      return this.toast("You can't cast there - face the water.");
    }
    this.target.copy(t);
    eco.spendBait(this.s);
    this.roll = null;
    this.castSpot = fishingSpot(this.player.x, this.player.z);
    this.perfect = this.power >= PERFECT_MIN && this.power <= PERFECT_MAX;
    this.net.send({ t: 'cast', x: t.x, z: t.z, perfect: this.perfect });
    this.baseDist = Math.hypot(t.x - w.eye.x, t.z - w.eye.z);
    this.phase = 'swing';
    this.timer = 0;
    w.rig.pose({ pitch: 0.1, bendP: 0, k: 420, c: 26 });
    w.fovKick = 7;
    w.pitchKick = -0.03;
    audio.whoosh();
    this.refreshHud();
  }

  private launch(): void {
    const w = this.world;
    w.rig.tip.getWorldPosition(this.origin);
    this.flightDur = 0.7 + this.baseDist * 0.03;
    const T = this.flightDur;
    this.vel.set(
      (this.target.x - this.origin.x) / T,
      (this.target.y - this.origin.y + 0.5 * GRAVITY * T * T) / T,
      (this.target.z - this.origin.z) / T,
    );
    this.flightT = 0;
    this.phase = 'flying';
    w.bobberVisible = true;
    w.line.line.visible = true;
    w.bobber.position.copy(this.origin);
    w.rig.pose({ pitch: 0.35, bendP: 0.1, k: 60, c: 9 });
  }

  private land(): void {
    const w = this.world;
    const b = w.bobber.position;
    b.set(
      this.target.x,
      w.surface(this.target.x, this.target.z),
      this.target.z,
    );
    w.fx.splash(b, 30, 1);
    w.fx.ripple(b, 2.2);
    w.fx.ripple(b, 3.4, 0.18);
    w.fx.ripple(b, 4.6, 0.38);
    audio.splash(0.8);
    if (this.perfect) {
      w.fx.splash(b, 30, 1.4);
      w.fx.ripple(b, 6, 0.5);
    }

    const roll = this.roll ?? eco.rollCast(this.s, this.map.locationId, Math.random, this.perfect, this.castSpot, w.night >= NIGHT_BITE);
    this.roll = null;
    this.hooked = roll.fishId ? byId(FISH, roll.fishId) : null;
    this.hookedSize = roll.size;
    this.hookedShiny = !!roll.shiny && !!roll.fishId;
    this.waitTotal = roll.wait;
    this.elapsed = 0;
    this.nibbleCd = 1.2 + Math.random() * 1.5;
    this.approachAngle = Math.random() * Math.PI * 2;
    if (this.hooked) {
      this.shadow = buildFish(this.hooked.color, true, this.hookedShiny, this.hooked.tier, this.hooked.id);
      this.shadow.group.scale.setScalar(fishScale(this.hookedSize) * WATER_SCALE);
      this.shadow.group.visible = false;
      w.scene.add(this.shadow.group);
    }
    this.phase = 'waiting';
    this.toast(this.perfect ? '🎯 Perfect cast! Better fish are drawn to your bait...' : this.castSpot !== 'prime' ? `${SPOTS[this.castSpot].label} - waiting for a bite...` : 'Waiting for a bite...');
    w.rig.pose({ pitch: 0.4, bendP: 0.14, k: 40, c: 8 });
  }

  private onBite(): void {
    const w = this.world;
    if (!this.hooked) return this.reset('Nothing is biting that bait here.');
    this.phase = 'bite';
    this.timer = 0.95 + eco.reelControl(this.s, this.rod.control) * 0.2;
    this.removeShadow();
    const b = w.bobber.position;
    w.fx.splash(b, 22, 0.9);
    w.fx.ripple(b, 2.5);
    w.fx.ripple(b, 3.8, 0.15);
    w.rig.kick('bendP', 9);
    w.rig.kick('pitch', -1.5);
    w.addShake(0.6);
    audio.bite();
    $('alert').classList.remove('hidden');
    this.toast(this.hookedShiny ? '✨ Bite! Something is glimmering...' : 'Bite!');
  }

  /** Celebrates landing or hooking the best tier of fish the current bait can attract. */
  private topTierBanner(fish: { tier: number }, verb: string, shiny: boolean): void {
    if (fish.tier !== this.bait.tier) return;
    const el = $('banner');
    const name = tierName(fish.tier);
    el.style.color = this.tierColor(fish.tier);
    el.innerHTML = `${shiny ? '✨ Shiny ' : ''}${name} fish ${verb}!${verb === 'hooked' ? '<small>Stay focused...</small>' : ''}`;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => el.classList.add('hidden'), 3200);
  }

  private startReel(): void {
    const w = this.world;
    this.phase = 'reeling';
    $('alert').classList.add('hidden');
    const hard = reelDifficulty(this.hooked!, { ...this.rod, control: eco.reelControl(this.s, this.rod.control) }, this.hookedShiny);
    this.reel = new Reel(hard, eco.reelControl(this.s, this.rod.control));
    this.topTierBanner(this.hooked!, 'hooked', this.hookedShiny);
    this.lastSurges = 0;
    this.leapT = -1;
    this.fish = buildFish(this.hooked!.color, false, this.hookedShiny, this.hooked!.tier, this.hooked!.id);
    this.fish.group.scale.setScalar(fishScale(this.hookedSize) * WATER_SCALE);
    w.scene.add(this.fish.group);
    w.rig.kick('pitch', 7);
    w.fovKick = 4;
    w.addShake(0.8);
    w.fx.splash(w.bobber.position, 36, 1.4);
    audio.splash(1);
    this.toast(`Hooked! ${difficultyLabel(hard)} fight - reel when calm, ease off when it surges.`);
  }

  private startLanding(): void {
    const w = this.world;
    this.phase = 'landing';
    this.landT = 0;
    this.landFrom.copy(this.fish!.group.position);
    w.fx.splash(this.landFrom.clone().setY(0), 40, 1.5);
    w.fx.ripple(this.landFrom, 3.5);
    audio.splash(1);
    w.rig.pose({
      pitch: HANG_PITCH,
      yaw: 0,
      bendP: 0.5,
      bendY: 0,
      k: 40,
      c: 8,
    });
    w.rig.kick('pitch', 2);
    w.bobberVisible = false;
    $('alert').classList.add('hidden');
  }

  /** Pendulum: the fish's mouth hangs from the rod tip on an inextensible line. */
  private stepBob(dt: number): void {
    const tip = this.world.rig.tip.getWorldPosition(this.tipPos);
    const n = 4;
    const h = Math.min(dt, 0.05) / n;
    for (let i = 0; i < n; i++) {
      this.bobVel.y -= 9.8 * h;
      this.bobVel.multiplyScalar(1 - 0.35 * h);
      this.bob.addScaledVector(this.bobVel, h);
      const d = this.swingDir.subVectors(this.bob, tip);
      const len = d.length();
      if (len > HANG_LEN) {
        d.multiplyScalar(1 / len);
        this.bob.copy(tip).addScaledVector(d, HANG_LEN);
        const radial = this.bobVel.dot(d);
        if (radial > 0) this.bobVel.addScaledVector(d, -radial);
      }
    }
  }

  private finishCatch(): void {
    const fish = this.hooked!;
    const size = this.hookedSize;
    const { stored, first, record, gained, leveledUp, level } = eco.applyCatch(this.s, fish, size, this.hookedShiny);
    if (!stored) return this.reset('No free slot - the fish got away!');
    this.net.send({ t: 'catch' });
    this.world.hub?.setLeaders(this.anglers());
    this.hangPoint(this.bob, 0, 0);
    this.bobVel.set(0.5, 0, -0.2);

    const el = $('catch');
    el.style.borderColor = RARITY_COLOR[fish.rarity];
    el.style.boxShadow = fish.tier >= 3 ? `0 0 ${12 + fish.tier * 10}px ${RARITY_COLOR[fish.rarity]}` : '';
    el.dataset.tier = String(fish.tier);
    const shiny = this.hookedShiny;
    el.innerHTML = `<div class="muted">${shiny ? '<b style="color:#ffd23a">✨ SHINY! ✨</b> ' : ''}${first ? 'NEW! ' : ''}${record ? 'PERSONAL BEST ' : ''}</div>
      <div class="catch-ico">${fishIcon(fish.id, { shiny })}</div>
      <h2 style="color:${RARITY_COLOR[fish.rarity]}">${shiny ? '✨ ' : ''}${fish.name}</h2>
      <p class="blurb">${FISH_BLURB[fish.id] ?? ''}</p>
      <div class="weight"><span class="coin"></span>${Math.round(sellValue(fish, size, shiny) * (1 + eco.charmBonus(this.s))).toLocaleString()}</div>
      <div>${this.tierBadge(fish.tier)} ${TIER_THEME[fish.tier - 1]} · ${size} cm · ${formatWeight(fishWeight(fish, size))}${fish.night ? ' · 🌙' : ''}</div>
      <div>+${gained} XP${leveledUp ? ` · <b>LEVEL UP! Lv ${level}</b>` : ''}</div>
      <div class="muted">Click to release your hold</div>`;
    el.classList.remove('hidden');
    audio.jingle(shiny ? 'legendary' : fish.rarity);
    this.topTierBanner(fish, 'caught', shiny);

    this.held = this.fish;
    this.fish = null;
    this.endCast('result');
    this.world.rig.pose({
      pitch: HANG_PITCH,
      yaw: 0,
      bendP: 0.45,
      bendY: 0,
      k: 40,
      c: 8,
    });
    this.world.line.line.visible = true;
  }

  /** Shows the held item in place of the rod: a fish model or a bait jar. The rod only shows while rod in hand or fishing. */
  private updateCarry(): void {
    const it = this.s.slots[this.s.held];
    const key = it?.k === 'fish' ? `f:${it.fishId}:${it.size}:${it.shiny ? 1 : 0}` : it?.k === 'bait' ? `b:${it.id}` : '';
    const w = this.world;
    w.rig.root.visible = this.phase !== 'idle' || it?.k === 'rod';
    if (this.rigLook !== this.s.rod) {
      this.rigLook = this.s.rod;
      w.rig.setLook(this.rod.color, this.rod.tier);
    }
    if (this.carry && this.carry.key !== key) {
      w.camera.remove(this.carry.obj);
      this.carry = null;
    }
    // At a casino table or the counter the fish is your bet, shown in the hotbar; keep the view clear.
    if (this.carry) this.carry.obj.visible = !this.table;
    if (!key || this.carry || !it || it.k === 'rod') return;
    let model: FishModel | null = null;
    let obj: THREE.Object3D;
    if (it.k === 'fish') {
      model = buildFish(byId(FISH, it.fishId).color, false, it.shiny, byId(FISH, it.fishId).tier, it.fishId);
      // Carried while walking: still grows by tier, but capped so a legend doesn't block the view.
      model.group.scale.setScalar(Math.min(0.24, fishScale(it.size) * 0.13));
      model.group.rotation.set(0.3, 1.1, 0.35);
      obj = new THREE.Group();
      obj.add(model.group);
      obj.position.set(0.17, -0.2, -0.42);
    } else {
      obj = buildTin(it.id);
      obj.scale.setScalar(0.2);
      obj.rotation.x = 0.35;
      obj.position.set(0.2, -0.21, -0.4);
    }
    w.camera.add(obj);
    this.carry = { key, obj, model };
  }

  private tickCarry(t: number): void {
    if (!this.carry) return;
    if (this.carry.model) animateFish(this.carry.model, t, 5, 0.12);
    this.carry.obj.position.y += Math.sin(t * 1.6) * 0.0006;
  }

  private heldScale(): number {
    return Math.min(2.8, fishScale(this.hookedSize));
  }

  /** Mouth position of a fish dangling from the rod tip, with a gentle pendulum swing. */
  private hangPoint(
    out: THREE.Vector3,
    t: number,
    swing: number,
  ): THREE.Vector3 {
    this.world.rig.tip.getWorldPosition(out);
    out.x += Math.sin(t * 1.7) * 0.07 * swing;
    out.z += Math.cos(t * 1.3) * 0.04 * swing;
    out.y -= HANG_LEN;
    return out;
  }

  private dismissCatch(): void {
    $('catch').classList.add('hidden');
    this.net.send({ t: 'lost' });
    if (this.held) {
      this.world.scene.remove(this.held.group);
      this.held = null;
    }
    this.world.line.line.visible = false;
    this.phase = 'idle';
    this.setIdlePose();
  }

  private removeShadow(): void {
    if (this.shadow) {
      this.world.scene.remove(this.shadow.group);
      this.shadow = null;
    }
  }

  private reset(msg: string): void {
    this.toast(msg);
    this.roll = null;
    this.net.send({ t: 'lost' });
    this.endCast('idle');
  }

  private endCast(next: Phase): void {
    const w = this.world;
    this.phase = next;
    this.reel = null;
    this.hooked = null;
    this.removeShadow();
    if (this.fish) {
      w.scene.remove(this.fish.group);
      this.fish = null;
    }
    w.bobberVisible = false;
    w.line.line.visible = false;
    w.fovKick = Math.max(w.fovKick, 0);
    audio.setCreak(0);
    $('alert').classList.add('hidden');
    if (next === 'idle') this.setIdlePose();
    else
      w.rig.pose({ pitch: 0.55, yaw: 0, bendP: 0.08, bendY: 0, k: 40, c: 8 });
    this.persist();
    this.refreshHud();
  }

  // ---------- frame loop ----------

  private loop = (now: number): void => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.tick(dt);
    this.world.update(dt);
    this.drawGauge(now / 1000);
    requestAnimationFrame(this.loop);
  };

  private updateLine(sag: number, sway = 0): void {
    const w = this.world;
    const tip = new THREE.Vector3();
    w.rig.tip.getWorldPosition(tip);
    w.line.update(
      tip,
      w.bobber.position.clone().setY(w.bobber.position.y + 0.12),
      sag,
      sway,
      w.time,
    );
  }

  /** Shows how good the water is where the player stands (not while a line is out). */
  private updateNight(): void {
    const on = this.world.night >= NIGHT_BITE;
    if (on === this.nightShown) return;
    this.nightShown = on;
    const el = $('nightchip');
    el.textContent = on ? '🌙 Night - rare & night-only fish are biting!' : '';
  }

  private updateSpot(): void {
    if (this.phase !== 'idle' && this.phase !== 'charging') return;
    if (this.map.casino) {
      if (this.spotShown) {
        $('spot').className = 'hidden';
        this.spotShown = '';
      }
      return;
    }
    const id = fishingSpot(this.player.x, this.player.z);
    if (id === this.spotShown) return;
    this.spotShown = id;
    const el = $('spot');
    el.textContent = id === 'prime' ? `🎣 ${SPOTS[id].label}` : `⚠ ${SPOTS[id].label}`;
    el.className = id;
  }

  /** Spot and night hints only matter with a rod in hand, outside the casino. */
  private updateContext(): void {
    const fishing = !this.map.casino && this.s.slots[this.s.held]?.k === 'rod';
    if (fishing === this.ctxShown) return;
    this.ctxShown = fishing;
    $('ctx').classList.toggle('hidden', !fishing);
  }

  private tick(dt: number): void {
    this.updateWalking(dt);
    this.updateContext();
    this.updateSpot();
    this.updateNight();
    this.net.sendPos(dt, this.player.x, this.player.z, this.world.yaw);
    this.avatars.update(dt, this.world.time, this.net.players, this.player.x, this.player.z);
    if (!this.net.connected && this.localDrops.expire()) this.dropsView.sync(this.localDrops.all(), this.map.id);
    this.dropsView.update(this.world.time);
    this.updateCarry();
    this.tickCarry(this.world.time);
    const w = this.world;
    const t = w.time;
    const b = w.bobber.position;

    switch (this.phase) {
      case 'charging': {
        this.power += this.powerDir * dt * 1.1;
        if (this.power >= 1) {
          this.power = 1;
          this.powerDir = -1;
        }
        if (this.power <= 0) {
          this.power = 0;
          this.powerDir = 1;
        }
        w.rig.pose({
          pitch: 0.6 + 0.95 * this.power,
          bendP: 0.1 + 0.55 * this.power,
          k: 90,
          c: 12,
        });
        break;
      }
      case 'swing':
        this.timer += dt;
        if (this.timer >= 0.12) this.launch();
        break;
      case 'flying': {
        this.flightT += dt;
        const u = Math.min(this.flightT, this.flightDur);
        b.set(
          this.origin.x + this.vel.x * u,
          this.origin.y + this.vel.y * u - 0.5 * GRAVITY * u * u,
          this.origin.z + this.vel.z * u,
        );
        this.updateLine(0.08 * this.baseDist * (1 - u / this.flightDur), 0.2);
        if (this.flightT >= this.flightDur) {
          if (this.roll || !this.net.connected) this.land();
          else if (this.flightT > this.flightDur + 3) this.reset('Connection lost.');
        }
        break;
      }
      case 'waiting': {
        this.elapsed += dt;
        this.nibbleCd -= dt;
        if (this.nibbleCd <= 0) {
          this.nibbleCd = 1.4 + Math.random() * 2.4;
          this.nibbleT = 0.3;
          w.fx.ripple(b, 1.2, 0, 1.1);
          w.rig.kick('bendP', 2.5);
          audio.tick(0.05);
        }
        this.nibbleT = Math.max(0, this.nibbleT - dt);
        const dip =
          this.nibbleT > 0
            ? Math.sin((this.nibbleT / 0.3) * Math.PI) * 0.08
            : 0;
        b.y = w.surface(b.x, b.z) + 0.02 + Math.sin(t * 2.1) * 0.012 - dip;
        w.bobber.rotation.z = Math.sin(t * 1.3) * 0.12;
        this.updateLine(0.05 * this.baseDist, 0.05);
        this.updateShadow();
        if (this.elapsed >= this.waitTotal) this.onBite();
        break;
      }
      case 'bite': {
        this.timer -= dt;
        b.y = w.surface(b.x, b.z) - 0.2 + Math.sin(t * 55) * 0.04;
        b.x += Math.sin(t * 40) * 0.003;
        w.bobber.rotation.z = Math.sin(t * 30) * 0.3;
        this.updateLine(0.03 * this.baseDist, 0.1);
        if (this.timer <= 0) this.reset('It got away...');
        break;
      }
      case 'reeling':
        this.tickReel(dt);
        break;
      case 'landing':
        this.tickLanding(dt);
        break;
      case 'result':
        if (this.held) {
          const g = this.held.group;
          this.stepBob(dt);
          const tip = this.tipPos;
          const up = this.swingDir.subVectors(tip, this.bob).normalize();
          g.quaternion.setFromUnitVectors(FISH_NOSE, up);
          g.position.copy(this.bob).addScaledVector(up, -0.5 * g.scale.x);
          animateFish(this.held, t, 6, 0.25);
          this.world.line.update(tip, this.bob, 0.01, 0, t);
        }
        break;
    }
    if (this.toastTimer > 0 && (this.toastTimer -= dt) <= 0)
      $('toast').classList.remove('show');
  }

  private updateShadow(): void {
    if (!this.shadow || !this.hooked) return;
    const w = this.world;
    const remain = this.waitTotal - this.elapsed;
    const span = Math.min(this.waitTotal, 5);
    if (remain > span) return;
    const u = 1 - remain / span;
    const pos = (uu: number) => {
      const a = this.approachAngle + uu * 3.4;
      const r = 8 * (1 - uu) + 0.5;
      return new THREE.Vector2(
        w.bobber.position.x + Math.cos(a) * r,
        w.bobber.position.z + Math.sin(a) * r,
      );
    };
    const p = pos(u);
    const q = pos(Math.min(1, u + 0.02));
    const g = this.shadow.group;
    g.visible = true;
    g.position.set(p.x, -0.45, p.y);
    faceDirection(g, q.x - p.x, q.y - p.y);
    animateFish(this.shadow, w.time, 9, 0.5);
    setFishOpacity(this.shadow, Math.min(1, u * 6));
  }

  private tickReel(dt: number): void {
    const w = this.world;
    const r = this.reel!;
    const t = w.time;
    const b = w.bobber.position;
    const fish = this.fish!;

    r.update(dt, this.holding);

    if (r.surgeCount !== this.lastSurges) {
      this.lastSurges = r.surgeCount;
      w.fx.ripple(b, 3, 0, 1.2);
      audio.tick(0.5);
      if (r.surgePower > 0.75 && Math.random() < 0.6) this.leapT = 0;
    }

    const forward = new THREE.Vector3(-Math.sin(w.yaw), 0, -Math.cos(w.yaw));
    const right = new THREE.Vector3(Math.cos(w.yaw), 0, -Math.sin(w.yaw));
    const base = new THREE.Vector3(w.eye.x, 0, w.eye.z);
    const toTarget = this.target.clone().sub(base);
    const dist =
      toTarget.length() * (1 - 0.9 * r.progress) * (1 + 0.25 * r.pull);
    const fp = base
      .clone()
      .addScaledVector(toTarget.normalize(), dist)
      .addScaledVector(right, r.lateral * dist * 0.4);
    void forward;
    b.set(
      fp.x,
      w.surface(fp.x, fp.z) + 0.01 + Math.sin(t * 9) * 0.02 * r.pull,
      fp.z,
    );
    w.bobber.rotation.z = Math.sin(t * 20) * 0.2 * r.pull;

    const g = fish.group;
    g.position.set(fp.x, -0.4 + Math.sin(t * 7) * 0.05, fp.z);
    const lead = Math.atan2(-(fp.x - base.x), -(fp.z - base.z));
    g.rotation.y =
      lead + Math.PI + r.lateral * 0.9 + Math.sin(t * 11) * 0.5 * r.pull;
    animateFish(fish, t, 16 + r.pull * 14, 0.5 + r.pull * 0.3);
    g.rotation.z = Math.sin(t * 6) * 0.2 * r.pull;

    if (this.leapT >= 0) {
      this.leapT += dt / 0.75;
      const u = Math.min(1, this.leapT);
      g.position.y = -0.4 + Math.sin(u * Math.PI) * 1.4;
      g.rotation.x = -0.8 + u * 1.6;
      if (this.leapT >= 1) {
        this.leapT = -1;
        g.rotation.x = 0;
        w.fx.splash(new THREE.Vector3(fp.x, 0, fp.z), 34, 1.4);
        w.fx.ripple(fp, 3.5);
        audio.splash(0.9);
        w.addShake(0.5);
      }
    }

    this.splashCd -= dt;
    if (this.splashCd <= 0 && r.pull > 0.25) {
      this.splashCd = 0.35 - r.pull * 0.15;
      w.fx.splash(new THREE.Vector3(fp.x, 0, fp.z), 8, 0.7);
      w.fx.ripple(fp, 1.8, 0, 1);
    }

    const load = r.tension;
    this.updateLine(Math.max(0.02, dist * 0.07 * (1 - load) * (1 - load)), 0);
    w.rig.pose({
      pitch: 0.7 + load * 0.5,
      yaw: -r.lateral * 0.15,
      bendP: 0.25 + load * 0.95,
      bendY: -r.lateral * (0.2 + 0.6 * load),
      k: 70,
      c: 9,
    });
    w.addShake(Math.max(0, load - 0.55) * 1.2 + r.pull * 0.3);
    if (this.holding) {
      w.rig.spin(14);
      this.tickCd -= dt;
      if (this.tickCd <= 0) {
        this.tickCd = 0.09;
        audio.tick(0.05 + load * 0.05);
      }
    }
    audio.setCreak(load);

    if (r.status === 'caught') this.startLanding();
    else if (r.status === 'snapped') {
      audio.snap();
      w.rig.kick('pitch', -4);
      w.addShake(1.2);
      this.reset('The line snapped!');
    } else if (r.status === 'escaped') this.reset('The fish slipped off.');
  }

  private tickLanding(dt: number): void {
    const w = this.world;
    this.landT += dt / 0.95;
    const u = Math.min(1, this.landT);
    const e = u * u * (3 - 2 * u);
    const g = this.fish!.group;
    const sc = this.heldScale();
    const m = this.hangPoint(this.hang, w.time, 0);
    const target = m.clone().setY(m.y - 0.5 * sc);
    g.position.lerpVectors(this.landFrom, target, e);
    g.position.y += Math.sin(u * Math.PI) * 1.2;
    g.scale.setScalar(
      THREE.MathUtils.lerp(fishScale(this.hookedSize) * WATER_SCALE, sc, e),
    );
    g.rotation.order = 'YXZ';
    g.rotation.set(
      (Math.PI / 2) * e,
      (1 - e) * 2,
      Math.sin(u * Math.PI * 3) * 0.5 * (1 - e),
    );
    animateFish(this.fish!, w.time, 22, 0.6);
    w.line.update(
      w.rig.tip.getWorldPosition(new THREE.Vector3()),
      m,
      0.05,
      0,
      w.time,
    );
    w.rig.spin(10);
    if (u >= 1) {
      w.line.line.visible = false;
      this.finishCatch();
    }
  }

  // ---------- UI ----------

  private toast(msg: string, secs = 2): void {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    this.toastTimer = secs;
  }

  private drawGauge(time: number): void {
    const ctx = this.gctx;
    const W = this.gauge.width;
    const cx = W / 2;
    const cy = W / 2;
    ctx.clearRect(0, 0, W, W);
    const a0 = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;
    const arc = (
      r: number,
      from: number,
      to: number,
      color: string,
      lw: number,
    ) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, a0 + from * sweep, a0 + to * sweep);
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.stroke();
    };

    if (this.phase === 'charging') {
      arc(66, 0, 1, 'rgba(0,0,0,0.4)', 9);
      const hue = 120 - this.power * 120;
      arc(66, 0, Math.max(0.01, this.power), `hsl(${hue},85%,55%)`, 7);
      const inZone = this.power >= PERFECT_MIN && this.power <= PERFECT_MAX;
      arc(76, PERFECT_MIN, PERFECT_MAX, inZone ? '#ffffff' : '#ffd23f', inZone ? 8 : 5);
      return;
    }
    if (this.phase !== 'reeling' || !this.reel) {
      if (this.gauge.classList.contains('surge')) {
        this.gauge.classList.remove('surge');
        $('vignette').classList.remove('surge');
      }
      return;
    }

    const r = this.reel;
    const surge = r.surging || r.tension > GOOD_MAX;
    const warn = !surge && r.warning;
    const pulse = 0.5 + 0.5 * Math.sin(time * (surge ? 18 : 8));
    const accent = surge ? '#ff3b30' : warn ? '#ffb020' : '#58e07a';
    $('vignette').classList.toggle('surge', surge);
    this.gauge.classList.toggle('surge', surge);

    if (surge || warn) {
      ctx.beginPath();
      ctx.arc(cx, cy, 112, 0, Math.PI * 2);
      ctx.strokeStyle = surge
        ? `rgba(255,59,48,${0.25 + 0.55 * pulse})`
        : `rgba(255,176,32,${0.2 + 0.3 * pulse})`;
      ctx.lineWidth = surge ? 10 + 8 * pulse : 6;
      ctx.stroke();
    }

    arc(96, 0, 1, 'rgba(0,0,0,0.5)', 14);
    arc(96, GOOD_MIN, GOOD_MAX, 'rgba(255,255,255,0.18)', 14);
    arc(96, SWEET_MIN, SWEET_MAX, 'rgba(88,224,122,0.55)', 14);
    arc(96, Math.max(0, GOOD_MAX), 1, 'rgba(255,59,48,0.45)', 14);
    const hot = r.tension > GOOD_MAX;
    arc(
      96,
      0,
      Math.max(0.01, r.tension),
      hot ? '#ff3b30' : r.tension < GOOD_MIN ? '#ffd23a' : '#7dff8a',
      7,
    );
    const na = a0 + r.tension * sweep;
    ctx.beginPath();
    ctx.arc(
      cx + Math.cos(na) * 96,
      cy + Math.sin(na) * 96,
      8 + (surge ? 3 * pulse : 0),
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = surge ? '#ff7a70' : '#fff';
    ctx.fill();

    arc(76, 0, 1, 'rgba(0,0,0,0.45)', 9);
    arc(76, 0, Math.max(0.01, r.progress), '#58b6ff', 7);

    ctx.textAlign = 'center';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 6;
    ctx.fillStyle = accent;
    ctx.font = `800 ${surge ? 34 + 4 * pulse : 28}px system-ui`;
    const big = surge
      ? 'LET GO!'
      : warn
        ? 'GET READY'
        : this.holding
          ? 'REELING'
          : 'HOLD TO REEL';
    ctx.fillText(big, cx, cy + 150);
    ctx.font = '600 14px system-ui';
    ctx.fillStyle = '#fff';
    const small = surge
      ? 'Release click until it calms'
      : warn
        ? 'Fish is about to surge'
        : r.inSweetSpot
          ? 'Sweet spot — reeling fast!'
          : '';
    if (small) ctx.fillText(small, cx, cy + 172);
    ctx.shadowBlur = 0;
  }

  private refreshHud(): void {
    const s = this.s;
    $('level').textContent = String(s.level);
    const coinsEl = $('coins');
    const text = s.coins.toLocaleString();
    if (coinsEl.textContent !== text) {
      coinsEl.textContent = text;
      const purse = $('purse');
      purse.classList.remove('bump');
      void purse.offsetWidth;
      purse.classList.add('bump');
    }
    // XP fills the ring around the level badge (circumference 2π·25).
    const xp = s.level >= MAX_LEVEL ? 1 : Math.min(1, s.xp / xpForNextLevel(s.level));
    $('xpring').style.strokeDasharray = `${(xp * 157.08).toFixed(1)} 157.08`;
    $('lvl').title = s.level >= MAX_LEVEL ? `Level ${s.level} (max)` : `Level ${s.level} · ${s.xp} / ${xpForNextLevel(s.level)} XP`;
    // Chips only matter inside the casino.
    $('chips').textContent = this.chipsText(s.chips);
    $('chipbox').classList.toggle('hidden', !this.map.casino);
    this.setGateSign();
    this.renderHotbar();
  }

  private renderMenu(): void {
    if (this.tab === 'play') this.tab = 'inventory';
    const vendor = this.tab === 'shop' || this.tab === 'casino';
    document.body.classList.toggle('shopping', this.menuOpen && vendor);
    $('menu').classList.toggle('casino', this.tab === 'casino');
    $('menu-who').innerHTML = this.menuWhoHtml();
    $('menu-tabs').innerHTML = this.menuTabsHtml();
    const el = $('tab');
    el.className = `sheet tab-${this.tab}`;
    switch (this.tab) {
      case 'players':
        el.innerHTML = this.playersHtml();
        break;
      case 'inventory':
        el.innerHTML = this.bagHtml();
        break;
      case 'wardrobe':
        el.innerHTML = this.wardrobeHtml();
        break;
      case 'settings':
        el.innerHTML = this.settingsHtml();
        break;
      case 'shop':
        el.innerHTML = this.shopHtml();
        break;
      case 'casino':
        el.innerHTML = this.casinoHtml();
        break;
      case 'dex':
        el.innerHTML = this.dexHtml();
        break;
    }
    const slot = document.getElementById('pv-slot');
    if (slot) {
      const pv = this.getPreview();
      pv.set(this.previewLook());
      slot.appendChild(pv.canvas);
      pv.start();
    } else if ($('join').classList.contains('hidden')) this.preview?.stop();
    this.renderHotbar();
  }

  private renderHotbar(): void {
    const s = this.s;
    // The newly held slot gets a one-off pop; later re-renders leave it still.
    const moved = this.hotbarHeld !== s.held;
    this.hotbarHeld = s.held;
    const activeBait = eco.activeSlot(s);
    let html = '';
    s.slots.forEach((sl, i) => {
      // Icon, a short label underneath, and an optional corner badge (stack size or win multiplier).
      let body = '';
      let cls = 'slot';
      let ring = '';
      if (sl?.k === 'bait') {
        body = `<span class="q">×${sl.n}</span><span class="ic">${BAIT_ICON[sl.id] ?? '🪱'}</span><span class="nm">${byId(BAITS, sl.id).name}</span>`;
        if (i === activeBait) cls += ' use';
      } else if (sl?.k === 'rod') {
        body = `<span class="ic">${rodIcon(byId(RODS, sl.id).tier)}</span><span class="nm">${shortRod(byId(RODS, sl.id).name)}</span>`;
        if (sl.id === s.rod) cls += ' use';
      } else if (sl?.k === 'fish') {
        const f = byId(FISH, sl.fishId);
        ring = sl.shiny ? '#ffd23a' : RARITY_COLOR[f.rarity];
        const mult = sl.mult && sl.mult > 1 ? `<span class="q">×${sl.mult}</span>` : '';
        body = `${mult}<span class="ic">${fishIcon(f.id, { shiny: sl.shiny })}</span><span class="nm val"><span class="coin xs"></span>${shortCoins(eco.fishValue(sl))}</span>`;
        cls += ' fish';
      } else cls += ' empty';
      if (i === s.held) cls += moved ? ' held pick' : ' held';
      const sellable = sl?.k === 'fish' && this.menuOpen && ((this.tab === 'shop' && this.atVendor) || this.tab === 'casino');
      if (this.tab === 'casino' && this.menuOpen && i === this.betSlot && sl?.k === 'fish') cls += ' bet';
      if (sellable) cls += ' sellable';
      const tip = sellable ? ` data-sell="Sell · ${eco.sellPrice(this.s, sl)} 🪙"` : '';
      const name = sl?.k === 'fish' ? ` title="${byId(FISH, sl.fishId).name}"` : '';
      html += `<div class="${cls}" data-i="${i}"${tip}${name}${ring ? ` style="--ring:${ring}"` : ''}><i>${i + 1}</i>${body}</div>`;
    });
    const el = $('hotbar');
    if (el.dataset.h !== html) {
      el.dataset.h = html;
      el.innerHTML = html;
    }
    if (moved) this.showHeldName();
  }

  /** Names the item in hand above the hotbar for a moment after switching slots. */
  private showHeldName(): void {
    const sl = this.s.slots[this.s.held];
    const el = $('heldname');
    if (!sl) return el.classList.remove('show');
    el.textContent =
      sl.k === 'fish' ? `${sl.shiny ? '✨ ' : ''}${byId(FISH, sl.fishId).name} · ${eco.fishValue(sl)} 🪙`
      : sl.k === 'rod' ? byId(RODS, sl.id).name
      : `${byId(BAITS, sl.id).name} ×${sl.n}`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  private tierColor(tier: number): string {
    return ['#ffffff', '#8fe08f', '#6cc4ff', '#c58bff', '#ff9b3d', '#ffd23a'][Math.min(5, tier)];
  }

  private esc(h: string): string {
    return h.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  private tierBadge(tier: number): string {
    return `<span class="tier" style="color:${RARITY_COLOR[TIERS[tier - 1]]};border-color:${RARITY_COLOR[TIERS[tier - 1]]}">T${tier} ${tierName(tier)}</span>`;
  }

  // ---------- menu frame ----------

  /** Header left: who the window belongs to (you, or the vendor whose counter it is). */
  private menuWhoHtml(): string {
    if (this.tab === 'shop') {
      const v = this.map.vendor;
      return `<img src="${faceIcon(v.face ?? 'smile')}" alt=""><div><b>${v.name}'s Stall</b><span><span class="coin sm"></span> ${this.s.coins.toLocaleString()} to spend</span></div>`;
    }
    if (this.tab === 'casino') return `<span class="who-ic">🎰</span><div><b>Prize Counter</b><span>${this.chipsText(this.s.chips)} chips to spend</span></div>`;
    return `<img src="${this.faceSrc(this.s.look.face as FaceId)}" alt=""><div><b>${escapeHtml(this.net.name || 'You')}</b><span>Level ${this.s.level} · ${this.s.coins.toLocaleString()} coins</span></div>`;
  }

  private menuTabsHtml(): string {
    const tab = (id: string, icon: string, label: string, on: boolean, attr = 'data-tab') =>
      `<button class="tab${on ? ' on' : ''}" ${attr}="${id}"${label ? '' : ' title="Settings"'}><span>${icon}</span>${label}</button>`;
    if (this.tab === 'shop')
      return tab('gear', '🎣', 'Gear', this.shopTab === 'gear', 'data-shop') + tab('cosmetics', '👕', 'Cosmetics', this.shopTab === 'cosmetics', 'data-shop');
    if (this.tab === 'casino') return '';
    return [
      tab('inventory', '🎒', 'Bag', this.tab === 'inventory'),
      tab('wardrobe', '👕', 'Wardrobe', this.tab === 'wardrobe'),
      tab('dex', '📖', 'Fishdex', this.tab === 'dex'),
      tab('players', '👥', 'Anglers', this.tab === 'players'),
      tab('settings', '⚙️', '', this.tab === 'settings'),
    ].join('');
  }

  private faceSrc(id: FaceId): string {
    return (this.faceIcons[id] ??= faceIcon(id));
  }

  /** What the wardrobe/shop preview wears: your look, plus the cosmetic picked in the shop. */
  private previewLook(): Look {
    const c = this.tab === 'shop' && this.shopTab === 'cosmetics' ? cosById(this.pick.cos) : undefined;
    return c ? { ...this.s.look, [c.slot]: c.id } : this.s.look;
  }

  // ---------- shared pieces ----------

  /** A square item tile; clicking it selects the item (`data-pick`) unless `attrs` says otherwise. */
  private itemTile(o: { icon: string; name: string; sub: string; tier: number; on?: boolean; check?: boolean; ghost?: boolean; attrs: string; tip?: string }): string {
    const t = Math.max(1, Math.min(5, o.tier));
    return `<button class="tile${o.on ? ' sel' : ''}${o.ghost ? ' ghost' : ''}" style="--c:var(--t${t})" ${o.attrs}${o.tip ? ` data-tip="${this.esc(o.tip)}"` : ''}>${o.check ? '<span class="eq">✓</span>' : ''}<span class="ic">${o.icon}</span><span class="nm">${o.name}</span><span class="st">${o.sub}</span></button>`;
  }

  private badge(tier: number): string {
    const t = Math.max(1, Math.min(5, tier));
    return `<span class="badge" style="--c:var(--t${t})">Tier ${t} · ${tierName(t)}</span>`;
  }

  private meter(label: string, value: string, frac: number, tier = 3): string {
    return `<div class="stat"><div class="srow"><span>${label}</span><span>${value}</span></div><div class="meter"><i style="width:${Math.round(Math.max(0.06, Math.min(1, frac)) * 100)}%;--c:var(--t${tier})"></i></div></div>`;
  }

  /** The details panel on the right: big icon, name, stats, one plain sentence, and the main action. */
  private detail(o: { icon: string; name: string; tier: number; badge?: string; body: string; note: string; actions: string; top?: string }): string {
    const t = Math.max(1, Math.min(5, o.tier));
    return `<aside class="detail">${o.top ?? ''}<div class="hero"><span class="ic" style="--c:var(--t${t})">${o.icon}</span><div><b>${o.name}</b>${o.badge ?? this.badge(o.tier)}</div></div>${o.body}<p>${o.note}</p><div class="actions">${o.actions}</div></aside>`;
  }

  private btn(label: string, attrs: string, kind: 'gold' | 'ok' | 'plain' | 'bad' = 'gold', disabled = false): string {
    return `<button class="btn ${kind}" ${attrs}${disabled ? ' disabled' : ''}>${label}</button>`;
  }

  // ---------- Bag ----------

  private bagHtml(): string {
    const s = this.s;
    const rod = this.rod;
    const bait = this.bait;
    const have = eco.baitCount(s, s.bait);
    const reach = bait.tier;
    let hint: string;
    if (have <= 0) hint = 'No bait in your hotbar - equip some below.';
    else if (rod.tier < bait.tier) hint = `Your rod is lower tier than your bait, so those fish fight hard. Upgrade your rod.`;
    else if (bait.tier < rod.tier) hint = `Your bait is holding you back - better bait reaches rarer fish.`;
    else if (reach < 5) hint = `${BAITS.find((b) => b.tier === reach + 1)!.name} bait unlocks ${tierName(reach + 1)} fish.`;
    else hint = 'Maxed out - every fish in the lake can bite.';
    const pips = TIERS.map((_, i) => `<span class="pip${i < reach ? ' on' : ''}" style="--c:var(--t${i + 1})">${i + 1}</span>`).join('');
    const vendor = this.map.vendor.name;
    // Until the player picks something, show the rod in use (recomputed, since the save can change underneath).
    const sel = this.pick.bag ?? `rod:${s.rod}`;

    const rods = RODS.map((r) => {
      const equipped = eco.hasRod(s, r.id) && s.rod === r.id;
      const owned = eco.ownsRod(s, r.id);
      const sub = equipped ? 'Equipped' : owned ? 'Owned' : s.level < r.unlockLevel ? `🔒 Lv ${r.unlockLevel}` : `At ${vendor}'s`;
      return this.itemTile({ icon: rodIcon(r.tier), name: shortRod(r.name), sub, tier: r.tier, on: sel === `rod:${r.id}`, check: equipped, ghost: !owned, attrs: `data-pick="bag" data-id="rod:${r.id}"` });
    }).join('');
    const baits = BAITS.map((b) => {
      const n = eco.baitCount(s, b.id);
      const equipped = s.bait === b.id && s.slots.some((x) => x?.k === 'bait' && x.id === b.id);
      const sub = n > 0 ? `×${n}` : s.level < b.unlockLevel ? `🔒 Lv ${b.unlockLevel}` : `At ${vendor}'s`;
      return this.itemTile({ icon: BAIT_ICON[b.id] ?? '🪱', name: b.name, sub, tier: b.tier, on: sel === `bait:${b.id}`, check: equipped, ghost: n <= 0, attrs: `data-pick="bag" data-id="bait:${b.id}"` });
    }).join('');

    return `<div class="cols"><div class="main">
        <p class="goal">🎯 Next: ${nextGoal(s.level, s.dex)}</p>
        <h4>Your setup</h4>
        <div class="setup"><span class="big">${rodIcon(rod.tier)}</span><span class="plus">+</span><span class="big">${BAIT_ICON[bait.id] ?? '🪱'}</span>
          <div class="txt"><b>Catches up to ${tierName(reach)} fish</b><div>${hint}</div></div><div class="pips">${pips}</div></div>
        <h4>Rods</h4><div class="tiles">${rods}</div>
        <h4>Bait</h4><div class="tiles">${baits}</div>
        <p class="foot">Your hotbar holds the rod and bait you fish with; everything else waits in your tackle locker.</p>
      </div>${this.bagDetail(sel)}</div>`;
  }

  private bagDetail(sel: string): string {
    const s = this.s;
    const [kind, id] = sel.split(':');
    const vendor = this.map.vendor.name;
    if (kind === 'bait') {
      const b = byId(BAITS, id);
      const n = eco.baitCount(s, b.id);
      const slot = s.slots.findIndex((x) => x?.k === 'bait' && x.id === b.id);
      const equipped = s.bait === b.id && slot >= 0;
      const lvl = s.level < b.unlockLevel;
      const actions = equipped
        ? this.btn('In your hotbar ✓', '', 'ok', true) + this.btn('Put away in locker', `data-act="stow" data-id="${slot}"`, 'plain')
        : n > 0 && !lvl
          ? this.btn('Equip', `data-act="equipbait" data-id="${b.id}"`)
          : this.btn(lvl ? `Unlocks at level ${b.unlockLevel}` : `Sold at ${vendor}'s · ${b.price * eco.BAIT_PACK} 🪙 / ${eco.BAIT_PACK}`, '', 'plain', true);
      return this.detail({
        icon: BAIT_ICON[b.id] ?? '🪱',
        name: b.name,
        tier: b.tier,
        body: this.meter('Luck', `×${b.luck}`, b.luck / 2, b.tier) + this.meter('Reaches', `Tier ${b.tier}`, b.tier / 5, b.tier) + `<div class="have">You have <b>${n}</b></div>`,
        note: `Bait decides which fish can bite: this one hooks fish up to ${tierName(b.tier)}.`,
        actions,
      });
    }
    const r = byId(RODS, id);
    const owned = eco.ownsRod(s, r.id);
    const equipped = eco.hasRod(s, r.id) && s.rod === r.id;
    const hotRod = s.slots.findIndex((x) => x?.k === 'rod' && x.id === r.id);
    const actions = equipped
      ? this.btn('Equipped ✓', '', 'ok', true) + this.btn('Put away in locker', `data-act="stow" data-id="${hotRod}"`, 'plain')
      : owned
        ? this.btn('Equip', `data-act="equiprod" data-id="${r.id}"`)
        : this.btn(s.level < r.unlockLevel ? `Unlocks at level ${r.unlockLevel}` : `Sold at ${vendor}'s · ${r.price.toLocaleString()} 🪙`, '', 'plain', true);
    return this.detail({
      icon: rodIcon(r.tier),
      name: r.name,
      tier: r.tier,
      body: this.meter('Cast reach', `${r.castDistance} m`, r.castDistance / 34, r.tier) + this.meter('Luck', `×${r.luck}`, r.luck / 2.5, r.tier) + this.meter('Easier fights', `×${r.control}`, r.control / 2.2, r.tier),
      note: `Fights with fish up to ${tierName(r.tier)} feel easy. Rarer fish still bite, they just pull harder.`,
      actions,
    });
  }

  // ---------- Wardrobe ----------

  private faceIcons: Partial<Record<FaceId, string>> = {};

  private facesHtml(): string {
    return FACES.map((f) => {
      const on = this.s.look.face === f.id;
      return `<button class="face${on ? ' on' : ''}" data-act="face" data-id="${f.id}" data-try="face:${f.id}" data-tip="${f.name}${on ? ' · wearing' : ''}"><img src="${this.faceSrc(f.id)}" alt="${f.name}"></button>`;
    }).join('');
  }

  private swatchHtml(): string {
    return BODY_COLORS.map(
      (c) => `<button class="swatch${c === this.s.look.color ? ' on' : ''}" data-act="color" data-id="${c}" style="background:#${c.toString(16).padStart(6, '0')}"></button>`,
    ).join('');
  }

  private wardrobeHtml(): string {
    const icon = { hat: '🎩', shirt: '👕', jewelry: '📿' } as const;
    const sections = COS_SLOTS.map((slot) => {
      const worn = this.s.look[slot];
      const cards = COSMETICS.filter((c) => c.slot === slot && this.s.owned.includes(c.id))
        .map((c) => {
          const on = worn === c.id;
          return this.itemTile({ icon: icon[slot], name: c.name, sub: on ? 'Wearing' : 'Wear', tier: c.tier + 1, on, check: on, attrs: `data-act="equip" data-slot="${slot}" data-id="${on ? '' : c.id}" data-try="${slot}:${c.id}"`, tip: on ? 'Click to take off' : 'Click to wear' });
        })
        .join('');
      const title = slot === 'jewelry' ? 'Jewelry' : `${slot[0].toUpperCase()}${slot.slice(1)}s`;
      return `<h4>${title}</h4><div class="tiles">${cards || `<p class="empty">Nothing yet - ${this.map.vendor.name}'s stall sells ${title.toLowerCase()}.</p>`}</div>`;
    }).join('');
    return `<div class="cols wardrobe"><div class="side"><div id="pv-slot"></div><p class="drag-hint">Drag to turn</p><h4>Colour</h4><div class="swatches">${this.swatchHtml()}</div></div>
      <div class="main"><h4>Face</h4><div class="faces">${this.facesHtml()}</div>${sections}</div></div>`;
  }

  // ---------- Fishdex ----------

  private dexHtml(): string {
    const found = FISH.filter((f) => this.s.dex[f.id]).length;
    const card = (f: (typeof FISH)[number]) => {
      const e = this.s.dex[f.id];
      const moon = f.night ? '<span class="moon" title="Only bites at night">🌙</span>' : '';
      const size = `${f.minSize}-${f.maxSize} cm`;
      if (e) return `<div class="fish" style="--c:var(--t${f.tier})">${moon}${fishIcon(f.id)}<b>${f.name}</b><p>${FISH_BLURB[f.id] ?? ''}</p><span>Caught ${e.count} · best ${e.best} cm</span></div>`;
      const rodName = shortRod(RODS.find((r) => r.tier === f.tier)!.name);
      const baitName = BAITS.find((b) => b.tier === f.tier)!.name;
      return `<div class="fish unknown" style="--c:var(--t${f.tier})">${moon}${fishIcon(f.id, { hidden: true })}<b>???</b><p>${size}${f.night ? ' · bites at night' : ''}</p><span>Try a ${rodName} rod with ${baitName}</span></div>`;
    };
    // One section per tier, under its theme name, so the ladder from Shallows to Spirit fish reads at a glance.
    const sections = TIER_THEME.map((theme, i) => {
      const fish = FISH.filter((f) => f.tier === i + 1);
      const got = fish.filter((f) => this.s.dex[f.id]).length;
      return `<h4 class="dex-tier"><span class="badge" style="--c:var(--t${i + 1})">Tier ${i + 1} · ${tierName(i + 1)}</span> ${theme}<small>${got} / ${fish.length}</small></h4><div class="dex">${fish.map(card).join('')}</div>`;
    }).join('');
    return `<div class="dex-head"><b>${found} / ${FISH.length}</b> species discovered<div class="meter big"><i style="width:${(found / FISH.length) * 100}%;--c:var(--gold)"></i></div></div>${sections}`;
  }

  // ---------- Anglers ----------

  private playersHtml(): string {
    const rows = this.leaders()
      .map(
        (p, i) =>
          `<div class="angler${p.me ? ' me' : ''}"><span class="rank">${i === 0 ? '👑' : i + 1}</span><img src="${this.faceSrc(p.face)}" alt="" style="box-shadow:0 0 0 3px #${p.color.toString(16).padStart(6, '0')}"><b>${escapeHtml(p.name)}</b>${p.me ? '<span class="you">you</span>' : ''}<span class="lv">Lv ${p.level}</span></div>`,
      )
      .join('');
    const head = this.net.connected ? `<b>${this.net.players.size + 1}</b> online now` : 'Playing offline - join a server to fish with others.';
    // All-time ranking by most valuable single catch, the same list as the Top Anglers board in the plaza.
    const top = this.anglers()
      .filter((a) => a.value > 0)
      .slice(0, 10)
      .map((a, i) => {
        const f = FISH.find((x) => x.name === a.fish);
        const me = a.name === this.net.name;
        return `<div class="angler top${me ? ' me' : ''}"><span class="rank">${i === 0 ? '🏆' : i + 1}</span><span class="tfish" style="--c:var(--t${Math.max(1, a.tier)})">${f ? fishIcon(f.id, { shiny: a.shiny }) : ''}</span><div class="who2"><b>${escapeHtml(a.name)}</b><span>${a.shiny ? '✨ ' : ''}${a.fish} · Lv ${a.level}</span></div><span class="lv val"><span class="coin xs"></span>${a.value.toLocaleString()}</span></div>`;
      })
      .join('');
    return `<div class="cols anglers-cols">
      <div><h4>Online now</h4><p class="list-head">${head}</p><div class="anglers">${rows}</div></div>
      <div><h4>Top anglers · best single catch</h4><div class="anglers">${top || '<p class="empty">No catches yet - be the first on the board.</p>'}</div></div>
    </div>`;
  }

  // ---------- Settings ----------

  private settingsHtml(): string {
    const keys: [string, string][] = [
      ['W A S D', 'Walk'], ['Shift', 'Run'], ['Space', 'Jump'], ['E', 'Talk / interact'],
      ['Hold click', 'Charge a cast - let go in the gold zone for a perfect cast'], ['Click', 'Hook when the ! appears'],
      ['Hold click', 'Reel - let go when the fish surges'], ['1-5 / Scroll', 'Take an item in hand'], ['G', 'Drop the item in hand'],
      ['Tab', 'Open your bag'], ['Enter', 'Chat'], ['M', 'Music on / off'], ['Esc', 'Menu / close'],
    ];
    const controls = keys.map(([k, v]) => `<div class="key">${k.split(' / ').map((x) => `<kbd>${x}</kbd>`).join(' ')}</div><div>${v}</div>`).join('');
    const reset = this.confirmReset
      ? `<p>Erase coins, level, gear, fish, Fishdex and cosmetics? Your name, colour and face stay. This can't be undone.</p>${this.btn('Yes, reset my account', 'data-act="resetyes"', 'bad')}${this.btn('Cancel', 'data-act="resetno"', 'plain')}`
      : `<p>Start over from level 1. Your name, colour and face stay.</p>${this.btn('Reset account…', 'data-act="reset"', 'plain')}`;
    return `<div class="cols settings"><div class="main"><h4>Controls</h4><div class="controls">${controls}</div></div>
      <aside class="detail"><h4>Sound</h4>${this.btn(audio.music ? '🎵 Music on' : '🔇 Music off', 'data-act="music"', 'plain')}<h4 class="danger-h">Danger zone</h4>${reset}</aside></div>`;
  }

  // ---------- Shop ----------

  private shopHtml(): string {
    const body = this.shopTab === 'cosmetics' ? this.cosmeticsShopHtml() : this.gearShopHtml();
    return `${body}${this.sellStrip()}`;
  }

  private gearShopHtml(): string {
    const s = this.s;
    this.pick.gear ??= `rod:${this.map.stock.rods.find((id) => !eco.ownsRod(s, id)) ?? this.map.stock.rods[0]}`;
    const rods = this.map.stock.rods.map((id) => {
      const r = byId(RODS, id);
      const has = eco.ownsRod(s, id);
      const lvl = s.level < r.unlockLevel;
      const sub = has ? 'Owned' : lvl ? `🔒 Lv ${r.unlockLevel}` : r.price ? `${r.price.toLocaleString()} 🪙` : 'Free';
      return this.itemTile({ icon: rodIcon(r.tier), name: shortRod(r.name), sub, tier: r.tier, on: this.pick.gear === `rod:${id}`, check: has, ghost: !has && (lvl || s.coins < r.price), attrs: `data-pick="gear" data-id="rod:${id}"` });
    }).join('');
    const baits = this.map.stock.bait.map((id) => {
      const b = byId(BAITS, id);
      const cost = b.price * eco.BAIT_PACK;
      const lvl = s.level < b.unlockLevel;
      return this.itemTile({ icon: BAIT_ICON[id] ?? '🪱', name: `${b.name} ×${eco.BAIT_PACK}`, sub: lvl ? `🔒 Lv ${b.unlockLevel}` : `${cost.toLocaleString()} 🪙`, tier: b.tier, on: this.pick.gear === `bait:${id}`, ghost: lvl || s.coins < cost, attrs: `data-pick="gear" data-id="bait:${id}"` });
    }).join('');
    return `<div class="cols"><div class="main"><h4>Rods</h4><div class="tiles">${rods}</div><h4>Bait · packs of ${eco.BAIT_PACK}</h4><div class="tiles">${baits}</div>
      <p class="foot">New gear goes to your tackle locker. Equip it from your Bag (<kbd>Tab</kbd>).</p></div>${this.gearDetail()}</div>`;
  }

  private gearDetail(): string {
    const s = this.s;
    const [kind, id] = this.pick.gear!.split(':');
    if (kind === 'bait') {
      const b = byId(BAITS, id);
      const cost = b.price * eco.BAIT_PACK;
      const lvl = s.level < b.unlockLevel;
      const action = lvl
        ? this.btn(`Unlocks at level ${b.unlockLevel}`, '', 'plain', true)
        : s.coins < cost
          ? this.btn(`Need ${cost.toLocaleString()} 🪙`, '', 'plain', true)
          : this.btn(`Buy ${eco.BAIT_PACK} for ${cost.toLocaleString()} 🪙`, `data-act="buybait" data-id="${b.id}"`);
      return this.detail({
        icon: BAIT_ICON[b.id] ?? '🪱',
        name: b.name,
        tier: b.tier,
        body: this.meter('Luck', `×${b.luck}`, b.luck / 2, b.tier) + this.meter('Reaches', `Tier ${b.tier}`, b.tier / 5, b.tier) + `<div class="have">You have <b>${eco.baitCount(s, b.id)}</b></div>`,
        note: `Hooks fish up to ${tierName(b.tier)}. Each cast uses one.`,
        actions: action,
      });
    }
    const r = byId(RODS, id);
    const has = eco.ownsRod(s, r.id);
    const lvl = s.level < r.unlockLevel;
    const action = has
      ? this.btn('Owned ✓', '', 'ok', true)
      : lvl
        ? this.btn(`Unlocks at level ${r.unlockLevel}`, '', 'plain', true)
        : s.coins < r.price
          ? this.btn(`Need ${r.price.toLocaleString()} 🪙`, '', 'plain', true)
          : this.btn(r.price ? `Buy for ${r.price.toLocaleString()} 🪙` : 'Take it (free)', `data-act="buyrod" data-id="${r.id}"`);
    return this.detail({
      icon: rodIcon(r.tier),
      name: r.name,
      tier: r.tier,
      body: this.meter('Cast reach', `${r.castDistance} m`, r.castDistance / 34, r.tier) + this.meter('Luck', `×${r.luck}`, r.luck / 2.5, r.tier) + this.meter('Easier fights', `×${r.control}`, r.control / 2.2, r.tier),
      note: `Fights with fish up to ${tierName(r.tier)} feel easy.`,
      actions: action,
    });
  }

  private cosmeticsShopHtml(): string {
    const s = this.s;
    const icon = { hat: '🎩', shirt: '👕', jewelry: '📿' } as const;
    const chosen = cosById(this.pick.cos) ?? COSMETICS.find((x) => !s.owned.includes(x.id)) ?? COSMETICS[0];
    this.pick.cos = chosen.id;
    const sections = COS_SLOTS.map((slot) => {
      const cards = COSMETICS.filter((c) => c.slot === slot)
        .sort((a, b) => a.price - b.price)
        .map((c) => {
          const has = s.owned.includes(c.id);
          const wearing = s.look[slot] === c.id;
          const sub = has ? (wearing ? 'Wearing' : 'Owned') : `${c.price.toLocaleString()} 🪙`;
          return this.itemTile({ icon: icon[slot], name: c.name, sub, tier: c.tier + 1, on: this.pick.cos === c.id, check: has, ghost: !has && s.coins < c.price, attrs: `data-pick="cos" data-id="${c.id}" data-try="${slot}:${c.id}"` });
        })
        .join('');
      return `<h4>${slot === 'jewelry' ? 'Jewelry' : `${slot[0].toUpperCase()}${slot.slice(1)}s`}</h4><div class="tiles">${cards}</div>`;
    }).join('');
    const has = s.owned.includes(chosen.id);
    const wearing = s.look[chosen.slot] === chosen.id;
    const action = wearing
      ? this.btn('Take it off', `data-act="equip" data-slot="${chosen.slot}" data-id=""`, 'plain')
      : has
        ? this.btn('Wear it', `data-act="equip" data-slot="${chosen.slot}" data-id="${chosen.id}"`, 'ok')
        : s.coins < chosen.price
          ? this.btn(`Need ${chosen.price.toLocaleString()} 🪙`, '', 'plain', true)
          : this.btn(`Buy for ${chosen.price.toLocaleString()} 🪙`, `data-act="buycos" data-id="${chosen.id}"`);
    const detail = this.detail({
      top: '<div id="pv-slot"></div>',
      icon: icon[chosen.slot],
      name: chosen.name,
      tier: chosen.tier + 1,
      badge: `<span class="badge" style="--c:var(--t${Math.min(5, chosen.tier + 1)})">${chosen.slot === 'jewelry' ? 'Jewelry' : chosen.slot[0].toUpperCase() + chosen.slot.slice(1)} · style ${chosen.tier + 1}</span>`,
      body: '',
      note: has ? (wearing ? 'You are wearing this.' : 'Yours to wear any time from the Wardrobe.') : 'Hover any item to try it on.',
      actions: action,
    });
    return `<div class="cols"><div class="main">${sections}</div>${detail}</div>`;
  }

  /** Bottom strip in the shop and at the prize counter: how to sell or turn in fish. */
  private sellStrip(): string {
    const fish = this.s.slots.filter((x): x is Extract<SaveData['slots'][number], { k: 'fish' }> => x?.k === 'fish');
    if (this.tab === 'casino')
      return `<div class="strip"><span>🐟 <b>Turn in fish:</b> click one in your hotbar below. 1 chip for every ${CHIP_COINS.toLocaleString()} 🪙 of fish value.</span></div>`;
    const total = fish.reduce((a, f) => a + eco.sellPrice(this.s, f), 0);
    const all = fish.length ? this.btn(`Sell all ${fish.length} · ${total.toLocaleString()} 🪙`, 'data-act="sellall"', 'ok') : '';
    return `<div class="strip"><span>🐟 <b>Sell fish:</b> click one in your hotbar below${fish.length ? '' : ' (you have none right now)'}.</span>${all}</div>`;
  }
}

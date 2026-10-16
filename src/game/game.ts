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
import { LocalFund, type Fund } from './fund';
import { Avatars } from './avatars';
import { Drops, PICKUP_RANGE, dropSpot, type Drop } from './drops';
import { DropsView, itemName } from './dropsview';
import * as eco from './economy';
import { NetClient, NetFund } from './net';
import { Player } from './player';
import {
  animateFish,
  buildFish,
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
import { SLOT_COUNT, load, newSave, save, type SaveData } from './state';
import { BODY_COLORS, COSMETICS, COS_SLOTS, cosById, type CosSlot, type Look } from '../data/cosmetics';
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

const defaultLookWith = (color: number): Look => ({ color, hat: null, shirt: null, jewelry: null });

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const CAMP_TIPS = [
  'Tip: hold the cast longer for a farther throw.',
  'Tip: release the reel when the fish surges, or the line may snap.',
  'Tip: shiny fish fight harder but sell for 5×.',
  'Tip: the Lucky Wheel can double a fish... or take it.',
  'Tip: bigger rods and better bait attract rarer fish.',
  'Tip: the Town Fund goal grows with every angler in the room.',
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
  private fund!: Fund;
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

  private tab = 'players';
  private shopTab: 'cosmetics' | 'gear' = 'cosmetics';
  private rigLook = '';
  private invTab: 'tackle' | 'wardrobe' = 'tackle';
  private preview: CharacterPreview | null = null;
  private joining = false;
  private joinColor = BODY_COLORS[4];
  private toastTimer = 0;
  private confirmReset = false;
  private bannerTimer = 0;
  private spin = false;
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
        Object.assign(this.s, save);
        if (this.joining) this.finishJoin();
        this.world.hub?.setFund(this.fund.state(this.map));
        this.refreshHud();
        if (this.menuOpen) this.renderMenu();
      },
      onWheel: (win, ms) => this.startSpin(win, ms),
      onDrops: (list) => {
        this.serverDrops = list;
        this.dropsView.sync(list, this.map.id);
      },
      onFund: (map, total, by, coins) => {
        if (map !== this.map.id) return;
        this.world.hub?.setFund(this.fund.state(this.map));
        if (by && by !== this.net.name) this.toast(`${by} gave ${coins} 🪙 to the Town Fund (${total} / ${this.fund.state(this.map).goal})`);
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
        this.world.hub?.setFund(this.fund.state(this.map));
        this.refreshHud();
      },
      onAct: (p, act) => {
        const f = act?.a === 'hold' ? FISH.find((x) => x.id === act.fish) : null;
        if (f && act?.a === 'hold' && (act.shiny || (f.rarity !== 'common' && f.rarity !== 'uncommon')) && p.map === this.map.id)
          this.toast(`${p.name} caught a ${act.shiny ? '✨ SHINY ' : ''}${f.name} (${formatWeight(fishWeight(f, act.size))})!`);
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
    this.fund = new NetFund(this.net, new LocalFund(this.s), this.s);
    this.applyLocation();
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
    this.getPreview().set({ ...defaultLookWith(this.joinColor) });
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
      day: (f: number | null) => { this.world.dayOverride = f; },
      interact: () => this.interact(),
      openMenu: (tab: string) => this.openMenu(tab),
      closeMenu: () => this.setMenu(false),
      player: () => ({ x: this.player.x, z: this.player.z, y: this.player.eyeY, near: this.near?.label ?? null }),
      give: (n: number) => this.give(n),
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
      if (Number.isInteger(i)) this.sellSlot(i);
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
      this.setMenu(!this.locked);
      if (!this.locked) {
        this.holding = false;
        this.keys.clear();
        if (!this.keepTab) this.tab = 'players';
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
      if (!this.active || e.button !== 0 || this.dbgLock) return;
      this.holding = true;
      this.onPress();
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      this.holding = false;
      if (this.phase === 'charging') this.releaseCast();
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    document.addEventListener('keydown', (e) => {
      if (this.active && e.code.startsWith('Key')) {
        this.keys.add(e.code);
        if (e.code === 'KeyE' && !e.repeat && this.phase === 'idle') this.interact();
      } else if (e.code.startsWith('Shift') && this.active) this.keys.add(e.code);
      if (e.code === 'Tab') {
        e.preventDefault();
        if (e.repeat || !$('join').classList.contains('hidden')) return;
        if (this.menuOpen) this.closeMenu();
        else if (this.active) this.openMenu('inventory');
        return;
      }
      if (e.code === 'Escape' && this.menuOpen && !e.repeat) return this.closeMenu();
      if (e.repeat || this.menuOpen || !this.active) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < SLOT_COUNT && this.phase === 'idle') this.takeSlot(i);
      else if (e.code === 'KeyG' && this.phase === 'idle') this.dropHeld();
      else if (e.code === 'Space' && this.active && this.phase === 'idle') { e.preventDefault(); this.player.jump(); }
      else if (e.code === 'KeyM' && !e.repeat) this.toast(audio.toggleMusic() ? '🎵 Music on' : '🔇 Music off');
    });
  }

  private onMenuClick(el: HTMLElement): void {
    const btn = el.closest('button') as HTMLButtonElement | null;
    if (!btn || btn.disabled) return;
    const { tab, act, id } = btn.dataset;
    if (tab) {
      if (tab === 'play') {
        audio.start();
        if (this.forceActive) this.setMenu(false);
        else this.world.renderer.domElement.requestPointerLock();
        return;
      }
      this.tab = tab;
    } else if (act === 'give' && this.atVendor) this.give(id === 'all' ? this.s.coins : Number(id));
    else if (act === 'shoptab') this.shopTab = id as 'cosmetics' | 'gear';
    else if (act === 'invtab') this.invTab = id as 'tackle' | 'wardrobe';
    else if (act === 'equiprod') this.equipRod(id!);
    else if (act === 'equipbait') this.equipBait(id!);
    else if (act === 'stow') this.stow(Number(id));
    else if (act === 'buycos') this.buyCosmetic(id!);
    else if (act === 'equip') this.equip(btn.dataset.slot as CosSlot, id || null);
    else if (act === 'color') this.recolor(Number(id));
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
    if (this.spin) return;
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
      this.toast(s.bait === id ? `Bought ${eco.BAIT_PACK} ${b.name} - equipped!` : `Bought ${eco.BAIT_PACK} ${b.name} - equip it in your Inventory (Tab)`);
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
    const value = eco.fishValue(it);
    eco.sellHeld(this.s);
    this.net.send({ t: 'sell' });
    this.toast(`Sold ${byId(FISH, it.fishId).name} for ${value} 🪙`);
    this.persist();
    this.refreshHud();
  }

  /** Shop open: clicking a fish in the hotbar sells it. */
  private sellSlot(i: number): void {
    if (this.spin || !this.atVendor) return;
    const it = this.s.slots[i];
    if (it?.k !== 'fish') return;
    const value = eco.fishValue(it);
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
    const color = this.s.look.color;
    this.roll = null;
    if (this.net.connected) this.net.send({ t: 'reset' });
    else {
      Object.assign(this.s, newSave());
      this.s.look.color = color;
    }
    this.toast('Account reset. Fresh start!');
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
    this.preview.set(on ? { ...this.s.look, [slot]: id } : this.s.look);
  }

  /** Everyone online with their coins, richest first. */
  private leaders(): { name: string; coins: number; color: number; me: boolean }[] {
    const rows = [{ name: this.net.name, coins: this.s.coins, color: this.s.look.color, me: true }];
    for (const p of this.net.players.values()) rows.push({ name: p.name, coins: this.net.coins.get(p.id) ?? p.coins, color: p.look.color, me: false });
    return rows.sort((a, b) => b.coins - a.coins);
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

  private closeMenu(): void {
    this.tab = 'players';
    if (this.forceActive) this.setMenu(false);
    else this.world.renderer.domElement.requestPointerLock();
  }

  /** Offline play saves locally; online, the server owns the save. */
  private persist(): void {
    if (!this.net.connected) save(this.s);
  }

  private give(coins: number): void {
    const accepted = this.fund.contribute(this.map, Math.min(coins, this.s.coins));
    if (accepted <= 0) return;
    this.s.coins -= accepted;
    const st = this.fund.state(this.map);
    this.world.hub?.setFund(st);
    this.toast(
      st.unlocked
        ? `The gate to ${this.map.next?.name ?? 'the next area'} is open!`
        : `Thanks! The Town Fund is at ${st.total} / ${st.goal}`,
    );
    this.persist();
    this.refreshHud();
  }

  private applyLocation(): void {
    this.map = MAPS.find((m) => m.id === this.s.location) ?? MAPS[0];
    this.s.location = this.map.id;
    this.world.setLocation(byId(LOCATIONS, this.map.locationId), this.map);
    this.world.hub?.setFund(this.fund.state(this.map));
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

    if (hub) {
      const dv = Math.hypot(hub.vendorSpot.x - x, hub.vendorSpot.z - z);
      this.atVendor = dv < 3.2;
      const st = this.fund.state(this.map);
      if (this.atVendor) {
        const held = this.s.slots[this.s.held];
        if (held?.k === 'fish') {
          const f = byId(FISH, held.fishId);
          spots.push({ d: -30, label: `Sell ${f.name} · ${eco.fishValue(held)} 🪙`, act: () => this.sellHeld() });
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
      const near = (v: THREE.Vector3) => Math.hypot(v.x - x, v.z - z);
      spots.push(
        { d: near(hub.leaderSpot), label: 'Top Anglers · see who is richest', act: () => this.openMenu('players') },
        { d: near(hub.mirrorSpot), label: 'Dressing mirror · change your look', act: () => { this.invTab = 'wardrobe'; this.openMenu('inventory'); } },
        { d: near(hub.campSpot), label: 'Warm up by the campfire', act: () => this.toast(CAMP_TIPS[Math.floor(Math.random() * CAMP_TIPS.length)]) },
        {
          d: Math.hypot(hub.boardSpot.x - x, hub.boardSpot.z - z),
          label: `Town fund board · ${st.total} / ${st.goal} 🪙`,
          act: () => this.openMenu('fund'),
        },
        {
          d: Math.hypot(hub.gateSpot.x - x, hub.gateSpot.z - z),
          label: st.unlocked ? `Travel to ${this.map.next?.name ?? 'the next area'}` : `Gate sealed · fund ${st.total} / ${st.goal} 🪙`,
          act: () =>
            this.toast(
              st.unlocked
                ? `${this.map.next?.name ?? 'The next area'} is still being built — coming soon!`
                : `The gate opens when the Town Fund reaches ${st.goal} coins.`,
            ),
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
      this.shadow = buildFish(this.hooked.color, true, this.hookedShiny);
      const len = Math.max(0.3, this.hookedSize / 100);
      this.shadow.group.scale.setScalar(len);
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
    this.timer = 0.95 + this.rod.control * 0.2;
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
    const hard = reelDifficulty(this.hooked!, this.rod, this.hookedShiny);
    this.reel = new Reel(hard, this.rod.control);
    this.topTierBanner(this.hooked!, 'hooked', this.hookedShiny);
    this.lastSurges = 0;
    this.leapT = -1;
    this.fish = buildFish(this.hooked!.color, false, this.hookedShiny, this.hooked!.tier);
    this.fish.group.scale.setScalar(Math.max(0.3, this.hookedSize / 100));
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
      <h2 style="color:${RARITY_COLOR[fish.rarity]}">${shiny ? '✨ ' : ''}${fish.name}</h2>
      <div class="weight">${formatWeight(fishWeight(fish, size))}</div>
      <div>${this.tierBadge(fish.tier)} · ${size} cm · ${sellValue(fish, size, shiny)} 🪙</div>
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
    if (!key || this.carry || !it || it.k === 'rod') return;
    let model: FishModel | null = null;
    let obj: THREE.Object3D;
    if (it.k === 'fish') {
      model = buildFish(byId(FISH, it.fishId).color, false, it.shiny, byId(FISH, it.fishId).tier);
      model.group.scale.setScalar(Math.max(0.14, Math.min(0.28, it.size / 220)));
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
    return Math.max(0.7, Math.min(1.7, this.hookedSize / 32));
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
    const id = fishingSpot(this.player.x, this.player.z);
    if (id === this.spotShown) return;
    this.spotShown = id;
    const el = $('spot');
    el.textContent = id === 'prime' ? `🎣 ${SPOTS[id].label}` : `⚠ ${SPOTS[id].label}`;
    el.className = id;
  }

  private tick(dt: number): void {
    this.updateWalking(dt);
    this.updateSpot();
    this.updateNight();
    this.net.sendPos(dt, this.player.x, this.player.z, this.world.yaw);
    this.avatars.update(dt, this.world.time, this.net.players);
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
      THREE.MathUtils.lerp(Math.max(0.3, this.hookedSize / 100), sc, e),
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
    $('xpbar').style.width =
      s.level >= MAX_LEVEL
        ? '100%'
        : `${(s.xp / xpForNextLevel(s.level)) * 100}%`;
    $('loc').textContent = this.map.name;
    const st = this.fund.state(this.map);
    $('fundline').textContent = st.unlocked
      ? `Town Fund complete — ${this.map.next?.name ?? 'next area'} gate open`
      : `Town Fund: ${st.total} / ${st.goal} 🪙 · hand coins to ${this.map.vendor.name}`;
    if (this.net.connected) $('fundline').textContent += ` · ${this.net.players.size + 1} online (${this.net.room})`;
    $('baitinfo').textContent = `${this.bait.name} ×${eco.baitCount(s, s.bait)} · ${this.rod.name}`;
    this.renderHotbar();
    $('goal').textContent = `Next: ${nextGoal(s.level)}`;
  }

  private renderMenu(): void {
    document.querySelectorAll<HTMLButtonElement>('nav button').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === this.tab);
    });
    const el = $('tab');
    if (this.tab === 'play') this.tab = 'players';
    document.body.classList.toggle('shopping', this.menuOpen && this.tab === 'shop');
    switch (this.tab) {
      case 'players':
        el.innerHTML = this.playersHtml();
        break;
      case 'inventory':
        el.innerHTML = this.inventoryHtml();
        break;
      case 'shop':
        el.innerHTML = this.shopHtml();
        break;
      case 'dex':
        el.innerHTML = this.dexHtml();
        break;
      case 'fund':
        el.innerHTML = this.fundHtml();
        break;
    }
    const slot = document.getElementById('pv-slot');
    if (slot) {
      const pv = this.getPreview();
      pv.set(this.s.look);
      slot.appendChild(pv.canvas);
      pv.start();
    } else if ($('join').classList.contains('hidden')) this.preview?.stop();
    this.renderHotbar();
  }

  private renderHotbar(): void {
    const s = this.s;
    const activeBait = eco.activeSlot(s);
    let html = '';
    s.slots.forEach((sl, i) => {
      let body = '';
      let cls = 'slot';
      if (sl?.k === 'bait') {
        body = `<span>${byId(BAITS, sl.id).name}</span><em>×${sl.n}</em>`;
        if (i === activeBait) cls += ' use';
      } else if (sl?.k === 'rod') {
        body = `<span>${byId(RODS, sl.id).name}</span><em>Rod</em>`;
        if (sl.id === s.rod) cls += ' use';
      } else if (sl?.k === 'fish') {
        const f = byId(FISH, sl.fishId);
        body = `<span style="color:${sl.shiny ? '#ffd23a' : RARITY_COLOR[f.rarity]}">${sl.shiny ? '✨' : ''}${f.name}</span><em>${formatWeight(fishWeight(f, sl.size))}${sl.mult ? ` · ×${sl.mult}` : ''}</em>`;
      } else cls += ' empty';
      if (i === s.held) cls += ' held';
      const sellable = sl?.k === 'fish' && this.menuOpen && this.tab === 'shop' && this.atVendor;
      if (sellable) cls += ' sellable';
      const tip = sellable ? ` data-sell="Sell · ${eco.fishValue(sl)} 🪙"` : '';
      html += `<div class="${cls}" data-i="${i}"${tip}><i>${i + 1}</i>${body}</div>`;
    });
    const el = $('hotbar');
    if (el.dataset.h !== html) {
      el.dataset.h = html;
      el.innerHTML = html;
    }
  }

  private playersHtml(): string {
    const rows = this.leaders()
      .map(
        (p, i) =>
          `<div class="row${p.me ? ' me' : ''}"><div><span class="rank">${i + 1}</span><span class="dot" style="background:#${p.color.toString(16).padStart(6, '0')}"></span>${i === 0 ? '👑 ' : ''}${escapeHtml(p.name)}${p.me ? ' <span class="muted">(you)</span>' : ''}</div><div><b>${p.coins}</b> 🪙</div></div>`,
      )
      .join('');
    const reset = this.confirmReset
      ? `<div class="danger">Erase all progress (coins, gear, fish, cosmetics)? This cannot be undone.<br><button data-act="resetyes" class="bad">Yes, reset</button> <button data-act="resetno">Cancel</button></div>`
      : `<div class="danger"><button data-act="reset">Reset account</button></div>`;
    return `<h3>Players ${this.net.connected ? `· ${this.net.room}` : '· offline'}</h3>${rows}${reset}`;
  }

  private swatchHtml(): string {
    return BODY_COLORS.map(
      (c) => `<button class="swatch${c === this.s.look.color ? ' on' : ''}" data-act="color" data-id="${c}" style="background:#${c.toString(16).padStart(6, '0')}"></button>`,
    ).join('');
  }

  private tierColor(tier: number): string {
    return ['#ffffff', '#8fe08f', '#6cc4ff', '#c58bff', '#ff9b3d', '#ffd23a'][Math.min(5, tier)];
  }

  private esc(h: string): string {
    return h.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  private tile(icon: string, name: string, price: string, tier: number, tip: string, act: string, id: string, off: boolean, own = false, raw = ''): string {
    const attrs = raw || `data-act="${act}" data-id="${id}"`;
    return `<button class="tile${off ? ' off' : ''}${own ? ' own' : ''}" style="--c:${this.tierColor(tier)}" data-tip="${this.esc(tip)}" ${attrs}><span class="ic">${icon}</span><span class="nm">${name}</span><span class="pr">${price}</span></button>`;
  }


  private tierBadge(tier: number): string {
    return `<span class="tier" style="color:${RARITY_COLOR[TIERS[tier - 1]]};border-color:${RARITY_COLOR[TIERS[tier - 1]]}">T${tier} ${tierName(tier)}</span>`;
  }

  private rodStats(r: (typeof RODS)[number]): string {
    return `Reach ${r.castDistance} m · luck ×${r.luck} · easier reeling ×${r.control} · easy fights up to tier ${r.tier}`;
  }

  private baitStats(b: (typeof BAITS)[number]): string {
    return `Luck ×${b.luck} · faster bites · hooks fish up to tier ${b.tier}`;
  }

  private inventoryHtml(): string {
    const tabs = (['tackle', 'wardrobe'] as const)
      .map((k) => `<button data-act="invtab" data-id="${k}" class="${this.invTab === k ? 'active' : ''}">${k === 'tackle' ? 'Tackle' : 'Wardrobe'}</button>`)
      .join('');
    return `<h3>Inventory</h3><nav class="sub">${tabs}</nav>${this.invTab === 'tackle' ? this.tackleHtml() : this.wardrobeHtml()}`;
  }

  private tackleHtml(): string {
    const s = this.s;
    const rod = this.rod;
    const bait = this.bait;
    const have = eco.baitCount(s, s.bait);
    const reach = bait.tier;
    const chips = TIERS.map((_, i) => {
      const t = i + 1;
      const on = t <= reach;
      const names = FISH.filter((f) => f.tier === t)
        .map((f) => (s.dex[f.id] ? f.name : '???') + (f.night ? ' 🌙' : ''))
        .join(', ');
      return `<div class="chip${on ? ' on' : ''}" style="--c:${RARITY_COLOR[TIERS[i]]}"><b>T${t} ${tierName(t)}</b><span>${on ? names : '🔒 need T' + t + ' bait'}</span></div>`;
    }).join('');
    let hint = '';
    if (have <= 0) hint = 'You have no bait equipped - buy or equip some below.';
    else if (rod.tier < bait.tier) hint = `Your rod (T${rod.tier}) is under-tier for ${bait.name} (T${bait.tier}) - you can hook those fish, but they will fight much harder. Upgrade your rod!`;
    else if (bait.tier < rod.tier) hint = `Your bait (T${bait.tier}) is holding you back - equip higher-tier bait.`;
    else if (reach < 5) hint = `Use tier ${reach + 1} bait to reach ${tierName(reach + 1)} fish - and a matching rod to land them easily.`;
    else hint = 'Maxed out - nothing can stop you now.';

    const hotRod = s.slots.findIndex((x) => x?.k === 'rod' && x.id === s.rod);
    const rods = RODS.map((r) => {
      const equipped = eco.hasRod(s, r.id) && s.rod === r.id;
      const owned = eco.ownsRod(s, r.id);
      const tip = `<b style="color:${this.tierColor(r.tier)}">${r.name}</b><br>${this.tierBadge(r.tier)}<br>${this.rodStats(r)}<br>${equipped ? 'Equipped - click to stow' : owned ? 'Click to equip' : s.level < r.unlockLevel ? `Unlocks at level ${r.unlockLevel}` : `Buy at the shop · ${r.price} 🪙`}`;
      const label = equipped ? 'Equipped ✓' : owned ? 'Owned' : s.level < r.unlockLevel ? `🔒 Lv ${r.unlockLevel}` : 'In shop';
      const act = equipped ? `data-act="stow" data-id="${hotRod}"` : owned ? `data-act="equiprod" data-id="${r.id}"` : '';
      return this.tile('🎣', r.name, label, r.tier, tip, '', '', !owned, equipped, act);
    }).join('');
    const baitIcon: Record<string, string> = { worm: '🪱', fly: '🪰', minnow: '🐟', lure: '💡', pearl: '🦪' };
    const baitRows = BAITS.map((b) => {
      const n = eco.baitCount(s, b.id);
      const equipped = s.bait === b.id && s.slots.some((x) => x?.k === 'bait' && x.id === b.id);
      const slot = s.slots.findIndex((x) => x?.k === 'bait' && x.id === b.id);
      const lvl = s.level < b.unlockLevel;
      const usable = n > 0 && !lvl;
      const note = equipped ? 'Equipped - click to stow' : !usable ? (lvl ? `Unlocks at level ${b.unlockLevel}` : `Buy at the shop · ${b.price * eco.BAIT_PACK} 🪙 / ${eco.BAIT_PACK}`) : 'Click to equip';
      const tip = `<b style="color:${this.tierColor(b.tier)}">${b.name}</b><br>${this.tierBadge(b.tier)}<br>${this.baitStats(b)}<br>You have ${n}<br>${note}`;
      const label = equipped ? `×${n} ✓` : lvl ? `🔒 Lv ${b.unlockLevel}` : n > 0 ? `×${n}` : 'In shop';
      const act = equipped ? `data-act="stow" data-id="${slot}"` : usable ? `data-act="equipbait" data-id="${b.id}"` : '';
      return this.tile(baitIcon[b.id] ?? '🪱', b.name, label, b.tier, tip, '', '', !usable, equipped, act);
    }).join('');
    return `<div class="setup"><div><b>${rod.name}</b> + <b>${bait.name}</b> → reach <b style="color:${RARITY_COLOR[TIERS[reach - 1]]}">tier ${reach} · ${tierName(reach)}</b></div><div class="muted">${hint}</div></div>
      <div class="chips">${chips}</div>
      <p class="muted">Your hotbar holds the rod and bait you use; the rest of your tackle waits in the locker.</p>
      <h4>Rods</h4><div class="tiles">${rods}</div><h4>Bait</h4><div class="tiles">${baitRows}</div>`;
  }

  private wardrobeHtml(): string {
    const sections = COS_SLOTS.map((slot) => {
      const owned = COSMETICS.filter((c) => c.slot === slot && this.s.owned.includes(c.id));
      const worn = this.s.look[slot];
      const icon = { hat: '🎩', shirt: '👕', jewelry: '📿' } as const;
      const cards = owned
        .map((c) => {
          const on = worn === c.id;
          const tip = `<b style="color:${this.tierColor(c.tier)}">${c.name}</b><br>${c.slot} · style tier ${c.tier}<br>${on ? 'Wearing - click to remove' : 'Click to wear'}`;
          return `<button class="tile${on ? ' own' : ''}" style="--c:${this.tierColor(c.tier)}" data-act="equip" data-slot="${slot}" data-id="${on ? '' : c.id}" data-try="${slot}:${c.id}" data-tip="${this.esc(tip)}"><span class="ic">${icon[c.slot]}</span><span class="nm">${c.name}</span><span class="pr">${on ? 'Wearing ✓' : 'Owned'}</span></button>`;
        })
        .join('');
      return `<h4>${slot === 'jewelry' ? 'Jewelry' : slot[0].toUpperCase() + slot.slice(1) + 's'}</h4><div class="tiles">${cards || '<span class="muted">Nothing owned yet - visit the shop.</span>'}</div>`;
    }).join('');
    return `<div class="split"><div><div id="pv-slot"></div><div class="swatches">${this.swatchHtml()}</div></div><div class="grow">${sections}</div></div>`;
  }

  private shopHtml(): string {
    const here = this.atVendor;
    const tabs = (['cosmetics', 'gear'] as const)
      .map((k) => `<button data-act="shoptab" data-id="${k}" class="${this.shopTab === k ? 'active' : ''}">${k === 'cosmetics' ? 'Cosmetics' : 'Gear'}</button>`)
      .join('');
    let body: string;
    if (this.shopTab === 'cosmetics') {
      const icon = { hat: '🎩', shirt: '👕', jewelry: '📿' } as const;
      const cards = COSMETICS.slice()
        .sort((a, b) => a.price - b.price)
        .map((c) => {
          const has = this.s.owned.includes(c.id);
          const wearing = this.s.look[c.slot] === c.id;
          const tip = `<b style="color:${this.tierColor(c.tier)}">${c.name}</b><br>${c.slot} · style tier ${c.tier}<br>${has ? (wearing ? 'Wearing - click to remove' : 'Owned - click to wear') : `Click to buy · ${c.price} 🪙`}`;
          const act = has ? `data-act="equip" data-slot="${c.slot}" data-id="${wearing ? '' : c.id}"` : `data-act="buycos" data-id="${c.id}"`;
          return `<button class="tile${has ? ' own' : ''}${!has && this.s.coins < c.price ? ' off' : ''}" style="--c:${this.tierColor(c.tier)}" data-try="${c.slot}:${c.id}" data-tip="${this.esc(tip)}" ${act}><span class="ic">${icon[c.slot]}</span><span class="nm">${c.name}</span><span class="pr">${has ? (wearing ? 'Wearing ✓' : 'Owned') : `${c.price} 🪙`}</span></button>`;
        })
        .join('');
      body = `<div class="split"><div><div id="pv-slot"></div><p class="muted">Hover an item to try it on.</p></div><div class="tiles grow">${cards}</div></div>`;
    } else {
      const rods = this.map.stock.rods.map((id) => {
        const r = byId(RODS, id);
        const has = eco.ownsRod(this.s, id);
        const lvl = this.s.level < r.unlockLevel;
        const price = has ? 'Owned ✓' : lvl ? `🔒 Lv ${r.unlockLevel}` : r.price ? `${r.price} 🪙` : 'Free';
        const tip = `<b style="color:${this.tierColor(r.tier)}">${r.name}</b><br>${this.tierBadge(r.tier)}<br>${this.rodStats(r)}<br>${has ? 'You own this - equip it in Inventory' : lvl ? `Unlocks at level ${r.unlockLevel}` : r.price ? `Click to buy · ${r.price} 🪙` : 'Free'}`;
        return this.tile('🎣', r.name, price, r.tier, tip, `buyrod`, id, has || lvl || this.s.coins < r.price);
      });
      const baitIcon: Record<string, string> = { worm: '🪱', fly: '🪰', minnow: '🐟', lure: '💡', pearl: '🦪' };
      const bait = this.map.stock.bait.map((id) => {
        const b = byId(BAITS, id);
        const cost = b.price * eco.BAIT_PACK;
        const lvl = this.s.level < b.unlockLevel;
        const tip = `<b style="color:${this.tierColor(b.tier)}">${b.name} ×${eco.BAIT_PACK}</b><br>${this.tierBadge(b.tier)}<br>${this.baitStats(b)}<br>You have ${eco.baitCount(this.s, id)}<br>${lvl ? `Unlocks at level ${b.unlockLevel}` : `Click to buy · ${cost} 🪙`}`;
        return this.tile(baitIcon[id] ?? '🪱', `${b.name} ×${eco.BAIT_PACK}`, lvl ? `🔒 Lv ${b.unlockLevel}` : `${cost} 🪙`, b.tier, tip, 'buybait', id, lvl || this.s.coins < cost);
      });
      body = `<p class="muted">Hover for stats. Border color = tier. Gear goes to your tackle locker - equip it in Inventory (<b>Tab</b>). Bait decides which fish bite; a rod of the fish's tier makes the fight easier.</p><h4>Rods</h4><div class="tiles">${rods.join('')}</div><h4>Bait</h4><div class="tiles">${bait.join('')}</div>`;
    }
    return this.shopFrame(tabs, body, here);
  }

  private shopFrame(tabs: string, body: string, here: boolean): string {
    return `<h3>${this.map.vendor.name}'s Shop · you have <b>${this.s.coins}</b> 🪙</h3>
      <nav class="sub">${tabs}</nav>
      <p class="muted">Click a fish in your hotbar (below) to sell it.</p>
      ${body}
      <p><button data-tab="play">Leave shop</button></p>`;
  }

  private dexHtml(): string {
    const found = Object.keys(this.s.dex).length;
    const cards = FISH.map((f) => {
      const e = this.s.dex[f.id];
      if (e) {
        return `<div class="card"><b style="color:${RARITY_COLOR[f.rarity]}">${f.name}</b><div class="muted">${f.night ? '🌙 Night only · ' : ''}Caught ${e.count} · best ${e.best} cm</div></div>`;
      }
      const rodName = RODS.find((r) => r.tier === f.tier)!.name;
      const baitName = BAITS.find((b) => b.tier === f.tier)!.name;
      const where = f.locations.map((l) => byId(LOCATIONS, l).name).join(', ');
      return `<div class="card unknown"><b>???</b><div class="muted">${this.tierBadge(f.tier)} · ${where}${f.night ? ' · 🌙 Night only' : ''}<br>Needs: ${rodName}+ and ${baitName}+</div></div>`;
    }).join('');
    return `<p>${found} / ${FISH.length} discovered</p><div class="grid">${cards}</div>`;
  }

  private fundHtml(): string {
    const st = this.fund.state(this.map);
    const pct = Math.round((st.total / st.goal) * 100);
    const next = this.map.next?.name ?? 'the next area';
    const buttons = [10, 50, 100]
      .map((n) => `<button data-act="give" data-id="${n}" ${this.atVendor && !st.unlocked && this.s.coins >= n ? '' : 'disabled'}>${n} 🪙</button>`)
      .join(' ');
    const all = `<button data-act="give" data-id="all" ${this.atVendor && !st.unlocked && this.s.coins > 0 ? '' : 'disabled'}>All (${this.s.coins} 🪙)</button>`;
    return `<h3>Town Fund</h3>
      <p>The whole lobby pools coins toward one goal. When it is full, the gate to <b>${next}</b> opens for the room.</p>
      <div class="fundbar"><div style="width:${pct}%"></div></div>
      <p class="big"><b>${st.total}</b> / ${st.goal} 🪙 ${st.unlocked ? '— gate open!' : ''}</p>
      <p class="muted">You have given ${st.mine} 🪙 · you carry ${this.s.coins} 🪙</p>
      ${this.atVendor ? `<div class="row"><div>Hand in to ${this.map.vendor.name}</div><div>${buttons} ${all}</div></div>` : `<p class="muted">Walk to ${this.map.vendor.name}'s stall to hand in coins.</p>`}`;
  }
}

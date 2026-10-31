import * as THREE from 'three';
import {
  BAITS,
  FISH,
  POND_FISH,
  SEA_FISH,
  LOCATIONS,
  RARITY_COLOR,
  RODS,
  TIERS,
  byId,
  tierName,
  type Bait,
  type Fish,
  type Rod,
} from '../data/content';
import { audio } from './audio';
import { MAPS, arrivalSpot, type MapDef } from '../data/maps';
import { isWater, mulberry, standHeight } from './env';
import { Avatars } from './avatars';
import { Drops, PICKUP_RANGE, dropSpot, type Drop } from './drops';
import { DropsView, itemName } from './dropsview';
import * as eco from './economy';
import { NetClient } from './net';
import { WheelStepper } from './wheelstep';
import { FpsMeter, TouchControls, touchOnly } from './touch';
import { ChatBox } from './chatbox';
import { FEEDBACK_MAX, FEEDBACK_WAIT_MS, FeedbackForm, OFFLINE_MSG, type FeedbackKind } from './feedback';
import { fishIcon } from './fishicon';
import { rodIcon } from './rodicon';
import { cosIcon } from './cosicon';
import { FISH_BLURB, FISH_LOOK, SEA_THEME, TIER_THEME } from '../data/fishlook';
import { RANKS, TITLES, pillTier, rankAt, titleName } from '../data/ranks';
import casinoPreview from '../assets/images/casino-preview.jpg';
import { markTip, rodHintText, rodUpgrade, tipText, TOUGH_FIGHT_SECS, type FightEnd, type TipId } from './tips';
import { COIN, clock, coinText, escapeHtml, shortCoins, withCoins } from './format';
import { waitText } from '../net/protocol';
import { Player } from './player';
import {
  animateFish,
  buildFish,
  faceDirection,
  hangFacing,
  setFishOpacity,
  type FishModel,
} from './fishmodel';
import { carryScale, hangLen, hangPitch, heldScale, waterScale } from './fishscale';
import type { LeaderRow } from './hub';
import { buildTin } from './itemmodels';
import { rankUp, type RankUp } from './rankup';
import {
  fishWeight,
  formatWeight,
  nextGoal,
  welcomeText,
  isFreshSave,
  sellValue,
  difficultyLabel,
  xpForNextLevel,
  PERFECT_MIN,
  fishingSpot,
  SPOTS,
  type SpotId,
  PERFECT_MAX,
} from './progression';
import { NIGHT_BITE } from './daynight';
import * as smoke from './smoke';
import {
  BUFF_ICON, DISHES, DISH_MAX_MINUTES, FREE_FISH, SELL_TIER, SMOKED_SELL, SMOKER_SPOTS, SMOKE_LEVEL, SNACKS, SNACK_MAX_MINUTES, SNACK_MINUTES, STAGES,
  dishById, smokeSeconds, stageById, type BuffKind, type Dish, type DishId, type StageId,
} from '../data/smokehouse';
import { FIGHT_DT, GOOD_MAX, GOOD_MIN, HoldLog, MAX_FIGHT_STEPS, Reel } from './reel';
import { CASINO_LEVEL, CASINO_RANGE, CHIP_COINS, PERKS, ROULETTE_PAY, type RouletteBet } from '../data/casino';
import { blackjackVerdict, chipsFor, doubleCost, type BlackjackView } from './casino';
import { RESULT_BEAT_MS, dealSteps, landedView } from './tablepace';
import { BAIT_SLOT, FISH_SLOT, ROD_SLOT, load, newSave, save, slotCount, type SaveData } from './state';
import { BODY_COLORS, COSMETICS, COS_RARITY, COS_RARITY_COLOR, COS_SLOTS, FACES, cosById, isFace, type CosShop, type CosSlot, type Cosmetic, type FaceId, type Look } from '../data/cosmetics';
import { faceIcon } from './faces';
import { CharacterPreview } from './character';
import { KOFI_URL } from '../data/support';
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

const CAMP_TIPS = [
  'Tip: hold the cast longer for a farther throw.',
  'Tip: when a fish surges, keep the gauge green: ease off before the red, tighten before it takes your line.',
  `Tip: a fish landed without fraying the line is a clean catch, worth ${Math.round(eco.CLEAN_BONUS * 100)}% more.`,
  'Tip: shiny fish fight harder but sell for 5×.',
  'Tip: the Lucky Wheel can double a fish... or take it.',
  'Tip: bigger rods and better bait attract rarer fish.',
  `Tip: the gate to Casino Cove opens at level ${CASINO_LEVEL}.`,
];

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const GRAVITY = 9.8;
/** 'full' or 'lite', remembered per browser; unset means the device's default. */
const GRAPHICS_KEY = 'fishing-graphics';
/** Highest the rod tilts back (relative to the view) while a catch dangles, so it never swings into the camera. */
const MAX_HOLD_PITCH = 1.5;

export class Game {
  private s: SaveData = load();
  private world: World;
  private phase: Phase = 'idle';
  private holding = false;
  private forceActive = false;
  private touch: TouchControls | null = null;
  private touchMove = { x: 0, y: 0, sprint: false };
  private touchWoke = false;
  private fps: FpsMeter | null = null;
  private shownPhase: Phase | '' = '';
  private power = 0;
  private powerDir = 1;
  private perfect = false;
  private castSpot: SpotId = 'prime';
  private spotShown = '';
  private nightShown = '';
  private lureShown = '';
  /** The dev console's /time froze this player's sky (the screenshot scripts' own override doesn't count). */
  private devTime = false;
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
  /** The hooked fish's fight, from the cast roll: the reel seed and difficulty the server replays the catch with. */
  private fightSeed = 0;
  private fightD = 1;
  /** The button at each fixed reel step, sent with the catch. */
  private holds = new HoldLog();
  /** Frame time not yet stepped into the reel. */
  private reelAcc = 0;
  private lastSurges = 0;
  private lastFrays = 0;
  /** Seconds left on the strain arc's flash after a fray. */
  private frayFlash = 0;
  /** The fish being landed was a clean catch (no frays). */
  private landedClean = false;
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
  private menuOpen = false;
  private keepTab = false;
  /** When Esc last closed a menu; see the pointerlockchange handler. */
  private escClosedAt = -Infinity;
  private atVendor = false;
  private near: { label: string; act: () => void } | null = null;

  private tab = 'inventory';
  private shopTab: 'cosmetics' | 'gear' = 'gear';
  /** The item selected in each menu's tile grid, shown in its details panel. */
  private pick: Partial<Record<'bag' | 'gear' | 'cos' | 'ccos' | 'perk' | 'smoke' | 'dish', string>> = {};
  /** Smokehouse tab. */
  private smokeTab: 'smoker' | 'kitchen' | 'pantry' = 'smoker';
  /** Eating this would replace a snack with time left: the menu asks first. */
  private confirmEat: { id: string; all: boolean } | null = null;
  /** Eating this dish would replace one with time left: the menu asks first. */
  private confirmDish: string | null = null;
  /** What the smoker and snack looked like at the last redraw, to redraw when a fish finishes. */
  private smokeKey = '';
  /** Stages opened by a catch, announced once its card is put away. */
  private stagesWaiting: StageId[] = [];
  /** The second the countdowns were last redrawn. */
  private clockSec = -1;
  private buffsShown = '';
  /** Prize counter tab: perks or the casino-only cosmetics. */
  private prizeTab: 'perks' | 'cosmetics' = 'perks';
  private rigLook = '';
  private preview: CharacterPreview | null = null;
  private joining = false;
  /** A ?name= link joins without the card; the welcome banner waits for the first save (or the failure). */
  private pendingWelcome = false;
  private joinColor = BODY_COLORS[4];
  private toastTimer = 0;
  private guideTimer = 0;
  /** Tier of the fish on the catch card, for the tip shown when it's put away. */
  private caughtTier = 0;
  /** The rod upgrade hint shows at most once a session. */
  private rodHinted = false;
  private toughCatch = false;
  private confirmReset = false;
  /** Settings > Account: the open password or name form or logout confirmation, and its last message. */
  private acctForm: 'pass' | 'name' | 'logout' | null = null;
  private acctMsg = '';
  /** Focus the form's text box on the next render. */
  private focusAcct = false;
  private loggingOut = false;
  /** Settings > Send feedback, also opened from the pause screen. */
  private fb = new FeedbackForm();
  private fbTimer = 0;
  private focusFb = false;
  /** Why the server dropped us, shown with the "playing offline" toast. */
  private offlineWhy: string | undefined;
  private bannerTimer = 0;
  /** The rank the latest catch reached, for the catch card's [Wear title] / [Wear it] buttons. */
  private rankCard: RankUp | null = null;
  /** A wheel is spinning or cards are being dealt: other actions wait until the result has landed. */
  private spin = false;
  /** Timers of the reveal in progress; the exit gate waits for them. */
  private revealTimers: number[] = [];
  /** The server's newest save, held back while a reveal is running so the hotbar and menus can't spoil it. */
  private heldSave: SaveData | null = null;
  private betSlot = -1;
  private chat!: ChatBox;
  private hotbarHeld = -1;
  private ctxShown: boolean | null = null;
  private bj: BlackjackView | null = null;
  /** The hand as far as it has been dealt onto the felt, for the table readout. */
  private bjShown: BlackjackView | null = null;
  private casinoMsg = '';
  private table: 'roulette' | 'blackjack' | 'prizes' | null = null;
  private aim: { k: string; id: string } | null = null;
  private tableHtml = '';
  private last = performance.now();
  private gauge = $('gauge') as HTMLCanvasElement;
  private gctx = this.gauge.getContext('2d')!;

  constructor() {
    this.world = new World($('game') as HTMLCanvasElement);
    this.applyGraphics();
    // A GPU crash or reset. Chromium won't make a new context until the page reloads (it draws a blank
    // "sad canvas" meanwhile), so offer a reload, which starts in lite graphics to ease the load.
    const canvas = this.world.renderer.domElement;
    canvas.addEventListener('webglcontextlost', () => {
      localStorage.setItem(GRAPHICS_KEY, 'lite');
      this.showOffline('Graphics stopped working', 'Reload to keep playing. Lite graphics will be on, which is easier on your device.', 'gpu');
    });
    canvas.addEventListener('webglcontextrestored', () => $('offline').classList.add('hidden'));
    this.avatars = new Avatars(this.world.scene, (x, z) => this.world.surface(x, z), (name) => this.net.isSupporter(name));
    this.dropsView = new DropsView(this.world.scene, (x, z) => this.world.surface(x, z));
    const q = new URLSearchParams(location.search);
    const urlName = q.get('name');
    const name = urlName || localStorage.getItem('fishing-name') || '';
    let token = localStorage.getItem('fishing-token');
    // getRandomValues, not randomUUID: randomUUID only exists on HTTPS/localhost, and phones testing
    // over the LAN load the game from a plain http:// IP address.
    if (!token) localStorage.setItem('fishing-token', (token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('')));
    this.net = new NetClient(name, token, q.get('room') || 'lobby', {
      onState: (save) => {
        // The server settles a bet as the wheel stops or the hand ends; its save waits for the reveal.
        if (this.revealTimers.length && !this.joining) this.heldSave = save;
        else this.applyState(save);
      },
      onWheel: (win, ms) => this.startSpin(win, ms),
      onRoulette: (r) => this.startRoulette(r),
      onBlackjack: (v) => this.dealt(v),
      onNotice: (msg) => this.toast(msg),
      // On joining, after the welcome banner has had its moment.
      onStages: (ids, intro) => window.setTimeout(() => this.stageBanner(ids, intro), 4600),
      onChat: (m) => {
        const self = m.room === this.net.room && m.id === this.net.id;
        this.chat.add({ name: m.name, map: m.map, text: m.text, self, sup: this.net.isSupporter(m.name) });
        if (!self && m.room === this.net.room && m.map === this.map.id) this.avatars.say(m.id, m.text);
      },
      onSys: (text) => this.chat.add({ name: '', map: '', text, self: false, system: true }),
      onDev: (lines, time, sent) => {
        // The answer to a report from the feedback form goes to the form; /bug typed in chat answers in chat.
        if (sent !== undefined && this.fb.answer(sent, lines[0] ?? '')) {
          clearTimeout(this.fbTimer);
          return this.renderFeedback();
        }
        for (const text of lines) this.chat.add({ name: '', map: '', text, self: false, system: true });
        if (time !== undefined) {
          this.world.dayOverride = time;
          this.devTime = time !== null;
        }
      },
      onDrops: (list) => {
        this.serverDrops = list;
        this.dropsView.sync(list, this.map.id);
      },
      onBoard: () => {
        this.world.hub?.setLeaders(this.anglers());
        if (this.menuOpen && this.tab === 'players') this.renderMenu();
      },
      onSupporters: () => {
        this.world.hub?.setSupporters(this.net.supporters);
        this.avatars.sync(this.net.players, this.net.id, this.map.id);
        if (this.menuOpen && (this.tab === 'players' || this.tab === 'settings')) this.renderMenu();
      },
      onRecords: () => {
        // A record from your own bet arrives as it settles; the board waits for the reveal like the hotbar.
        if (!this.revealTimers.length) this.world.hall?.records.set(this.net.records);
      },
      onFailed: () => {
        if (this.joining) this.joinMessage("Can't reach the game server. Try again, or play offline.");
        else if (this.pendingWelcome) {
          this.showOffline("Can't reach the game server");
          this.welcome();
        }
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
          this.toast(`${p.name} caught a ${act.shiny ? '✨ SHINY ' : ''}${f.name} (${Math.round(sellValue(f, act.size, act.shiny) * (act.mult ?? 1))} 🪙)!`);
      },
      onJump: (id) => this.avatars.jump(id),
      onCast: (roll) => {
        this.roll = roll;
      },
      onCastFail: (msg) => {
        if (this.phase === 'flying' || this.phase === 'swing') this.reset(msg);
      },
      onError: (msg, need) => {
        if (this.joining) {
          if (need === 'password') this.askPassword();
          return this.joinMessage(msg);
        }
        if (!this.pendingWelcome) return void (this.offlineWhy = msg.replace(/\.$/, ''));
        this.showOffline(msg.replace(/\.$/, ''));
        this.welcome();
      },
      onAccount: (msg) => {
        this.acctMsg = msg ?? '';
        if (!msg) {
          this.acctForm = null;
          this.toast('🔒 Password saved. Log in anywhere with your name and password.');
        }
        if (this.menuOpen && this.tab === 'settings') this.renderMenu();
      },
      onName: (now) => {
        // Saved, so this browser's next automatic login uses the new name.
        localStorage.setItem('fishing-name', this.net.name);
        if (now) {
          this.acctForm = null;
          this.acctMsg = '';
          this.toast(`✏️ Your name is now ${this.net.name}.`, 3);
        }
        this.refreshHud();
        if (this.menuOpen) this.renderMenu();
      },
      onClose: () => {
        if (this.loggingOut) {
          // A fresh token, so the next account made in this browser isn't tied to the old one.
          for (const k of ['fishing-auto', 'fishing-token', 'fishing-name']) localStorage.removeItem(k);
          return location.reload();
        }
        this.serverDrops = [];
        this.dropsView.sync(this.localDrops.all(), this.map.id);
        this.fb.giveUp(OFFLINE_MSG);
        this.renderFeedback();
        this.showOffline(this.offlineWhy ?? 'Disconnected');
        this.offlineWhy = undefined;
      },
    });
    this.world.clock = () => this.net.now();
    this.applyLocation();
    this.chat = new ChatBox($('chat'), {
      send: (text) => {
        if (!text.startsWith('/')) return this.net.send({ t: 'chat', text });
        // Slash commands (feedback and the dev console) go to the server, never to chat; only you see them, password hidden.
        const shown = text.replace(/^(\/login\s+\S+\s+).*/, '$1••••').replace(/^(\/resetpass\s+.+\s)\S+$/, '$1••••');
        this.chat.add({ name: '', map: '', text: `> ${shown}`, self: true, system: true });
        this.net.send({ t: 'cmd', text });
      },
      map: () => this.map.id,
      mapName: (id) => MAPS.find((m) => m.id === id)?.name ?? id,
    });
    $('resume').addEventListener('click', (e) => {
      const acct = (e.target as HTMLElement).closest<HTMLElement>('#resume-fb, [data-acct]');
      if (acct) {
        // The welcome banner would otherwise stay over the menu until it fades.
        this.dismissWelcome();
        return acct.dataset.acct ? this.openAccount(acct.dataset.acct as 'pass' | 'logout') : this.openFeedback();
      }
      // Audio has to start inside a click (Safari); this overlay is the desktop way into the game.
      audio.start();
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
    $('offline-go').addEventListener('click', () => location.reload());
    input.addEventListener('keydown', (e) => e.key === 'Enter' && this.submitJoin());
    $('join-pass').addEventListener('keydown', (e) => e.key === 'Enter' && this.submitJoin());
    // The password prompt belongs to the name the server asked about.
    input.addEventListener('input', () => $('join-pass-row').classList.add('hidden'));
    $('join-offline').addEventListener('click', () => {
      this.joining = false;
      this.s.look.color = this.joinColor;
      this.persist();
      $('join').classList.add('hidden');
      this.preview?.stop();
      this.refreshHud();
      this.welcome(($('join-name') as HTMLInputElement).value.trim().slice(0, 16));
    });
    if (direct) {
      // ?name= links (and tests) skip the screen and keep the account's saved look.
      this.net.name = urlName!;
      this.pendingWelcome = true;
      this.showResume('', 'to start fishing');
      this.net.connect();
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
    const asked = !$('join-pass-row').classList.contains('hidden');
    const pass = ($('join-pass') as HTMLInputElement).value;
    if (asked && !pass) return this.joinMessage('Enter your password.');
    localStorage.setItem('fishing-name', name);
    localStorage.setItem('fishing-color', String(this.joinColor));
    this.net.pass = asked ? pass : undefined;
    this.joinStart(name);
  }

  /** The name has a password and this browser isn't one of its devices yet. */
  private askPassword(): void {
    $('join-pass-row').classList.remove('hidden');
    const el = $('join-pass') as HTMLInputElement;
    el.value = '';
    // After joinMessage has re-enabled the form.
    requestAnimationFrame(() => el.focus());
  }

  private joinStart(name: string): void {
    this.joining = true;
    this.net.name = name;
    this.net.color = this.joinColor;
    this.joinMessage('Connecting…', false);
    $('join-go').toggleAttribute('disabled', true);
    this.net.connect();
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
    ($('join-pass') as HTMLInputElement).value = '';
    $('join-pass-row').classList.add('hidden');
    $('join-switch').classList.add('hidden');
    $('join').classList.add('hidden');
    this.preview?.stop();
    this.world.hub?.setLeaders(this.anglers());
    this.welcome();
  }

  /**
   * After joining: no window, just the scene with a welcome banner and a "click to start" overlay.
   * The click that captures the mouse dismisses the banner; otherwise it fades by itself.
   */
  private welcome(name = this.net.name): void {
    this.pendingWelcome = false;
    this.setMenu(false);
    const { title, line } = welcomeText(name, this.s);
    const el = $('banner');
    el.classList.remove('rank');
    el.classList.add('welcome');
    el.style.color = '';
    // Returning players learn where to switch accounts, and those who could lose theirs with this
    // browser get a nudge to protect it: buttons under the Click prompt, or a line here on phones,
    // which have no Click prompt.
    const returning = this.net.connected && !isFreshSave(this.s);
    const needPass = this.net.connected && !this.net.hasPass && this.s.level >= 3;
    const hint = this.touch && (returning || needPass) ? `<small>⚙️ Settings: ${needPass ? 'set a password or switch account' : 'switch account'}</small>` : '';
    el.innerHTML = `${escapeHtml(title)}<small>${escapeHtml(line)}</small>${hint}`;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.dismissWelcome(), 4200);
    const pass = needPass ? '<button class="btn plain" data-acct="pass" title="Play on other devices with your name and password">🔒 Set a password</button>' : '';
    const other = returning ? `<button class="switch" data-acct="logout">Not ${escapeHtml(this.net.name)}? Switch account</button>` : '';
    if (!this.locked && !this.forceActive) this.showResume('', 'to start fishing', pass, other);
  }

  private dismissWelcome(): void {
    const el = $('banner');
    if (!el.classList.contains('welcome')) return;
    clearTimeout(this.bannerTimer);
    el.classList.add('hidden');
    el.classList.remove('welcome');
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
        // Stands in for the click that captures the mouse.
        $('resume').classList.add('hidden');
        this.dismissWelcome();
        this.guide('start');
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
        surging: this.reel?.surging,
        warning: this.reel?.warning,
        strain: this.reel?.strain,
        frays: this.reel?.wear.frays,
        reason: this.reel?.reason,
        hooked: this.hooked?.id,
        power: this.power,
      }),
      lock: (v: boolean) => {
        this.dbgLock = v;
      },
      skipWait: () => {
        this.elapsed = this.waitTotal - 0.01;
      },
      /** Lands a given fish straight away (dev only), to check how each tier looks when caught. */
      land: (id: string, size: number, shiny = false, clean = false) => {
        if (this.phase !== 'idle' && this.phase !== 'result') return;
        if (this.phase === 'result') this.dismissCatch();
        this.landedClean = clean;
        this.hooked = byId(FISH, id);
        this.hookedSize = size;
        this.hookedShiny = shiny;
        this.fish = buildFish(this.hooked.color, false, shiny, this.hooked.tier, id);
        this.fish.group.scale.setScalar(waterScale(size, this.hooked.tier));
        const f = this.world.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
        this.fish.group.position.copy(this.world.camera.position).addScaledVector(f, 6).setY(-0.3);
        this.world.scene.add(this.fish.group);
        this.startLanding();
      },
      world: this.world,
    };
  }

  private bind(): void {
    $('menu').addEventListener('click', (e) =>
      this.onMenuClick(e.target as HTMLElement),
    );
    $('menu').addEventListener('keydown', (e) => {
      const id = (e.target as HTMLElement).id;
      if (id === 'acct-pass' && e.key === 'Enter') this.savePass();
      else if (id === 'acct-name' && e.key === 'Enter') this.saveName();
      // Enter sends, Shift+Enter is a new line (the server turns line breaks into spaces anyway).
      if (id === 'fb-text' && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendFeedback();
      }
    });
    $('menu').addEventListener('input', (e) => {
      const el = e.target as HTMLTextAreaElement;
      if (el.id === 'fb-text') this.fb.text = el.value;
    });
    $('hotbar').addEventListener('click', (e) => {
      const slot = (e.target as HTMLElement).closest<HTMLElement>('.slot');
      const i = Number(slot?.dataset.i);
      if (!slot || !Number.isInteger(i)) return;
      if (slot.classList.contains('sellable')) {
        if (this.tab === 'casino') this.cashOut(i);
        else if (this.tab === 'smoke') this.smokeSlot(i);
        else this.sellSlot(i);
      } else if (this.touch && this.active && this.phase === 'idle') this.takeSlot(i);
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
      if (this.locked) {
        audio.start();
        this.dismissWelcome();
        this.guide('start');
      }
      // Esc while typing: the browser always releases the mouse, but that should only cancel the
      // chat, not pause the game. A click picks the mouse back up.
      if (!this.locked && this.chat.active) {
        this.chat.close();
        this.holding = false;
        this.keys.clear();
        this.showResume('Chat closed · ');
        return;
      }
      // The Esc that closed a menu can also take back the mouse closeMenu just re-captured (Chrome
      // grants the lock without a click after exitPointerLock, then Esc releases it). That isn't a
      // pause: stay closed and wait for a click instead of opening the inventory.
      if (!this.locked && performance.now() - this.escClosedAt < 1000) {
        this.holding = false;
        this.keys.clear();
        if (!this.forceActive) this.showResume();
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
    // Touch devices also send emulated mouse events; in touch mode only the on-screen controls count.
    document.addEventListener('mousemove', (e) => {
      if (!this.touch) this.turn(e.movementX * 0.0022, e.movementY * 0.0022);
    });
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0 && !this.touch) this.pointerDown();
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0 && !this.touch) this.pointerUp();
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    const wheel = new WheelStepper();
    document.addEventListener('wheel', (e) => {
      if (!this.active || this.menuOpen || this.phase !== 'idle') return;
      const step = wheel.step(e.deltaY, e.deltaMode, e.timeStamp, (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY);
      if (!step) return;
      const n = this.s.slots.length;
      this.takeSlot((this.s.held + step + n) % n);
    }, { passive: true });
    document.addEventListener('keydown', (e) => {
      if (this.active && (e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat) return this.openChat();
      if (this.active && e.code.startsWith('Key')) {
        this.keys.add(e.code);
        if (e.code === 'KeyE' && !e.repeat && this.phase === 'idle') this.interact();
      } else if (e.code.startsWith('Shift') && this.active) this.keys.add(e.code);
      if (e.code === 'Tab') {
        e.preventDefault();
        // Not while typing in a menu text box: that would close the menu mid-sentence.
        const typing = (e.target as HTMLElement).matches?.('#menu input, #menu textarea');
        if (e.repeat || typing || !$('join').classList.contains('hidden')) return;
        if (this.menuOpen) this.closeMenu();
        else if (this.active || !$('resume').classList.contains('hidden')) this.openMenu('inventory');
        return;
      }
      if (e.code === 'Escape' && !e.repeat && !$('resume').classList.contains('hidden')) {
        $('resume').classList.add('hidden');
        this.setMenu(true);
        return this.renderMenu();
      }
      if (e.code === 'Escape' && this.menuOpen && !e.repeat) {
        this.escClosedAt = performance.now();
        return this.closeMenu();
      }
      if (e.repeat || this.menuOpen || !this.active) return;
      // By key position, not e.key: holding Shift to sprint turns "1" into "!".
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      const i = digit ? Number(digit[1]) - 1 : -1;
      if (i >= 0 && i < this.s.slots.length && this.phase === 'idle') this.takeSlot(i);
      else if (e.code === 'KeyG' && this.phase === 'idle') this.dropHeld();
      else if (e.code === 'Space' && this.active && this.phase === 'idle') { e.preventDefault(); this.jump(); }
      else if ((e.code === 'KeyT' || e.code === 'KeyO') && this.phase === 'result') this.useRankButton(e.code === 'KeyT' ? 'title' : 'outfit');
      else if (e.code === 'KeyM' && !e.repeat) this.toast(audio.toggleMusic() ? '🎵 Music on' : '🔇 Music off');
    });
  }

  /** Jumps, and lets the other players on the map see it. */
  private jump(): void {
    if (this.player.jump()) this.net.send({ t: 'jump' });
  }

  /** Mouse look and touch drags both turn the camera; pitch stops short of straight up or down. */
  private turn(dYaw: number, dPitch: number): void {
    if (!this.active || this.dbgLock) return;
    this.world.yaw -= dYaw;
    this.world.pitch = Math.max(-1.2, Math.min(0.6, this.world.pitch - dPitch));
  }

  /** Left mouse button or the touch action button going down: cast, hook, reel, bet. */
  private pointerDown(): void {
    if (!this.active || this.dbgLock || this.chat.isOpen) return;
    this.holding = true;
    this.onPress();
  }

  private pointerUp(): void {
    this.holding = false;
    if (this.phase === 'charging') this.releaseCast();
  }

  private openChat(): void {
    if (!this.net.connected) return this.toast('Chat needs a server connection.');
    this.keys.clear();
    this.chat.open();
  }

  /**
   * Turns on the on-screen controls for touch-only devices. The game then runs without pointer
   * lock (phones don't have it): it is active whenever no menu is open.
   */
  enableTouch(): void {
    if (this.touch) return;
    document.body.classList.add('touch');
    // Lay the page out 1400px wide and let the browser scale it to the screen, so the desktop HUD and
    // menus fit a phone in landscape at about 0.6x without a separate layout.
    document.querySelector('meta[name=viewport]')?.setAttribute('content', 'width=1400, user-scalable=no');
    this.world.setPixelCap(1);
    this.forceActive = true;
    $('resume').classList.add('hidden');
    const wake = () => {
      if (this.touchWoke) return;
      this.touchWoke = true;
      audio.start();
      this.dismissWelcome();
      this.guide('start');
    };
    this.touch = new TouchControls({
      move: (x, y, sprint) => {
        if (x || y) wake();
        this.touchMove = { x, y, sprint };
      },
      look: (dx, dy) => {
        wake();
        this.turn(dx * 0.005, dy * 0.005);
      },
      tap: (x, y) => {
        wake();
        this.tapView(x, y);
      },
      press: () => {
        wake();
        this.pointerDown();
      },
      release: () => this.pointerUp(),
      jump: () => {
        if (this.active && this.phase === 'idle') this.jump();
      },
      bag: () => this.openMenu('inventory'),
      chat: () => this.openChat(),
    });
    // Phones start in lite graphics unless the player picked otherwise.
    this.applyGraphics();
    $('prompt').addEventListener('click', () => {
      if (this.active && this.phase === 'idle') this.interact();
    });
    $('catch').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-rank]');
      if (btn) return this.useRankButton(btn.dataset.rank as 'title' | 'outfit');
      if (this.phase === 'result' && !this.dbgLock) this.dismissCatch();
    });
    // iOS Safari ignores touch-action for pinch zoom; this stops it zooming the page mid-game.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    if (import.meta.env.DEV) this.fps = new FpsMeter(() => this.world.isLite, () => this.toggleGraphics());
  }

  /** A tap on the open view: at a casino table it plays the piece under the finger. */
  private tapView(x: number, y: number): void {
    const hall = this.world.hall;
    if (!this.active || this.phase !== 'idle' || !this.table || !hall) return;
    this.aim = hall.pick(this.world.camera, 4.2, new THREE.Vector2((x / innerWidth) * 2 - 1, 1 - (y / innerHeight) * 2));
    if (this.aim) this.tableClick();
  }

  /** Shows or hides the touch controls and labels the action button for the current phase. */
  private updateTouch(): void {
    const t = this.touch!;
    t.setVisible(this.active && $('join').classList.contains('hidden'));
    switch (this.phase) {
      case 'idle':
        if (this.map.casino) t.setAction('🎰', 'PLAY', this.table ? 'gold' : 'quiet');
        else t.setAction('🎣', 'CAST', eco.canCast(this.s) === 'ok' ? 'gold' : 'quiet');
        break;
      case 'charging':
        t.setAction('🎣', 'RELEASE', 'gold');
        break;
      case 'bite':
        t.setAction('❗', 'HOOK!', 'hook');
        break;
      case 'reeling':
        if (this.reel && this.reel.tension > GOOD_MAX) t.setAction('✋', 'EASE OFF', 'danger');
        else if (this.reel?.surging && this.reel.losingLine) t.setAction('🎣', 'TIGHTEN', 'gold');
        else if (this.reel?.warning) t.setAction('⚠️', 'SURGE', 'danger');
        else t.setAction('🎣', this.holding ? 'REELING' : 'HOLD', 'gold');
        break;
      case 'result':
        t.setAction('👍', 'OK', 'gold');
        break;
      default:
        t.setAction('⏳', 'WAIT', 'quiet');
    }
  }

  private onMenuClick(el: HTMLElement): void {
    const btn = el.closest('button') as HTMLButtonElement | null;
    if (!btn || btn.disabled) return;
    const { tab, shop, prize, smoke: smokeTab, pick, act, id } = btn.dataset;
    if (act === 'close') return this.closeMenu();
    if (act === 'locked') return;
    if (tab) this.tab = tab;
    else if (shop) this.shopTab = shop as 'cosmetics' | 'gear';
    else if (prize) this.prizeTab = prize as 'perks' | 'cosmetics';
    else if (smokeTab) {
      this.smokeTab = smokeTab as 'smoker' | 'kitchen' | 'pantry';
      this.confirmEat = null;
      this.confirmDish = null;
    }
    else if (pick) this.pick[pick as keyof typeof this.pick] = id;
    else if (act === 'perk') this.casinoSend({ t: 'buyperk', id: id! });
    else if (act === 'smokeall') return this.smokeAll();
    else if (act === 'sellsmoked' || act === 'sellsmokedall') return this.sellSmoked(id!, act === 'sellsmokedall');
    else if (act === 'eat' || act === 'eatall') return this.eat(id!, act === 'eatall');
    else if (act === 'eatsure') return this.eat(id!, !!this.confirmEat?.all, true);
    else if (act === 'eatkeep') this.confirmEat = null;
    else if (act === 'cook') return this.cook(id as DishId);
    else if (act === 'eatdish' || act === 'eatdishsure') return this.eatDish(id!, act === 'eatdishsure');
    else if (act === 'eatdishkeep') this.confirmDish = null;
    else if (act === 'music') audio.toggleMusic();
    else if (act === 'graphics') this.toggleGraphics();
    else if (act === 'sellall') return this.sellAll();
    else if (act === 'equiprod') this.equipRod(id!);
    else if (act === 'equipbait') this.equipBait(id!);
    else if (act === 'buycos') this.buyCosmetic(id!);
    else if (act === 'equip') this.equip(btn.dataset.slot as CosSlot, id || null);
    else if (act === 'color') this.recolor(Number(id));
    else if (act === 'face') this.reface(id!);
    else if (act === 'title') this.wearTitle(id || null);
    else if (act === 'lure') this.switchLure();
    else if (act === 'reset') this.confirmReset = true;
    else if (act === 'resetno') this.confirmReset = false;
    else if (act === 'resetyes') this.resetAccount();
    else if (act === 'pass' || act === 'name' || act === 'logout') {
      this.acctForm = act;
      this.acctMsg = '';
      this.focusAcct = act !== 'logout';
    } else if (act === 'acctno') this.acctForm = null;
    else if (act === 'fbopen' || act === 'fbkind') {
      this.fb.show(id as FeedbackKind | undefined);
      this.focusFb = true;
    } else if (act === 'fbno') this.fb.hide();
    else if (act === 'fbsend') return this.sendFeedback();
    else if (act === 'passsave') return this.savePass();
    else if (act === 'namesave') return this.saveName();
    else if (act === 'logoutyes') {
      this.loggingOut = true;
      this.net.send({ t: 'forget' });
    }
    else if (act === 'buyrod' || act === 'buybait') this.buy(act === 'buyrod' ? 'rod' : 'bait', id!);
    this.persist();
    this.refreshHud();
    this.renderMenu();
  }

  /** The number keys for fish slots, for hints: "3-5", or more with the Tackle Vest. */
  private get fishKeys(): string {
    return `${FISH_SLOT + 1}-${Math.min(9, this.s.slots.length)}`;
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
    if (!eco.takeItem(this.s, d.item)) {
      const it = d.item;
      return this.toast(it.k === 'fish' ? 'Your fish slots are full.' : it.k === 'rod' ? `You already have the ${byId(RODS, it.id).name}.` : 'Your locker is full of that bait.');
    }
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
      this.toast(`Bought the ${r.name}${eco.hasRod(s, id) ? ' · equipped' : ''}`);
    } else {
      const b = byId(BAITS, id);
      const cost = b.price * eco.BAIT_PACK;
      if (s.level < b.unlockLevel) return this.toast(`${b.name} unlocks at level ${b.unlockLevel}.`);
      if (s.coins < cost) return this.toast(`Not enough coins (${cost} 🪙).`);
      if (!eco.buyBait(s, id)) return this.toast('Your locker is full of that bait.');
      this.net.send({ t: 'buybait', id });
      this.toast(`Bought ${eco.BAIT_PACK} ${b.name}`);
      if (b.tier > 1) this.guide('bait');
    }
    this.persist();
    this.refreshHud();
  }

  private equipRod(id: string): void {
    if (!eco.equipRod(this.s, id)) return;
    this.net.send({ t: 'equiprod', id });
    this.toast(`Equipped the ${byId(RODS, id).name}`);
  }

  private equipBait(id: string): void {
    if (!eco.equipBait(this.s, id)) return;
    this.net.send({ t: 'equipbait', id });
    this.toast(`Equipped ${byId(BAITS, id).name}`);
  }

  private applyState(save: SaveData): void {
    const from = this.s.location;
    const moved = !!save.location && save.location !== from;
    Object.assign(this.s, save);
    if (this.joining) this.finishJoin();
    else if (this.pendingWelcome) this.welcome();
    if (moved) this.applyLocation(from);
    this.setGateSign();
    this.refreshHud();
    if (this.menuOpen) this.renderMenu();
  }

  /** Runs part of a casino reveal after `ms`, unless a newer one cuts it short. */
  private later(ms: number, fn: () => void): void {
    this.revealTimers.push(window.setTimeout(fn, ms));
  }

  /** Ends the reveal: actions are free again, and the save the server sent meanwhile lands with the result. */
  private endReveal(): void {
    for (const t of this.revealTimers) clearTimeout(t);
    this.revealTimers = [];
    this.spin = false;
    const save = this.heldSave;
    this.heldSave = null;
    if (save) this.applyState(save);
    this.world.hall?.records.set(this.net.records);
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
    const value = Math.round(eco.fishValue(it));
    const name = byId(FISH, it.fishId).name;
    this.spin = true;
    this.world.hub?.spinWheel(win, ms);
    // A beat of quiet after the wheel stops, then the result
    this.later(ms + RESULT_BEAT_MS, () => {
      this.endReveal();
      if (!this.net.connected) {
        eco.applyWheel(this.s, win);
        this.persist();
        this.refreshHud();
      }
      this.showWheelResult(win, name, value);
    });
  }

  private showWheelResult(win: boolean, name: string, value: number): void {
    const el = $('wheelres');
    el.className = `show ${win ? 'win' : 'lose'}`;
    el.innerHTML = win
      ? `<b>DOUBLED!</b><span>${name} is now worth ${value * 2} ${COIN} <small>(+${value})</small></span>`
      : `<b>LOST!</b><span>${name} (${value} ${COIN}) is gone</span>`;
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
    this.guide('sold');
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
    this.guide('sold');
    audio.jingle('common');
    this.persist();
    this.refreshHud();
    this.renderMenu();
  }

  private buyCosmetic(id: string): void {
    const c = cosById(id);
    if (!c || this.s.owned.includes(id)) return;
    if (c.shop === 'casino') {
      // Chips live on the server: ask it, and the state reply updates the counter.
      if (this.tab !== 'casino') return this.toast('Sold only at the casino Prize Counter.');
      if (this.s.chips < c.price) return this.toast(`Not enough chips (${c.price}).`);
      if (!this.net.connected) return this.toast('The casino needs a server connection.');
      this.net.send({ t: 'buycos', id });
      this.toast(`Bought ${c.name} - wear it from the Wardrobe (Tab)`);
      return;
    }
    if (!this.atVendor) return this.toast(`Walk to ${this.map.vendor.name}'s stall to buy.`);
    if (this.s.coins < c.price) return this.toast(`Not enough coins (${c.price} 🪙).`);
    eco.buyCosmetic(this.s, id, 'stall');
    this.net.send({ t: 'buycos', id });
    this.toast(`Bought ${c.name} - wear it from the Wardrobe (Tab)`);
    this.persist();
    this.refreshHud();
  }

  private equip(slot: CosSlot, id: string | null): void {
    if (!eco.equipCosmetic(this.s, slot, id)) return;
    this.net.send({ t: 'equip', slot, id });
    this.persist();
  }

  private savePass(): void {
    const pass = ($('acct-pass') as HTMLInputElement | null)?.value ?? '';
    if (pass.length < 6) this.acctMsg = 'Use at least 6 characters.';
    else {
      this.acctMsg = '';
      this.net.send({ t: 'setpass', pass });
    }
    this.renderMenu();
  }

  private saveName(): void {
    const name = (($('acct-name') as HTMLInputElement | null)?.value ?? '').replace(/[^\w \-]/g, '').trim();
    if (name.length < 2) this.acctMsg = 'Pick a name of 2-16 letters, numbers, spaces or dashes.';
    else if (name === this.net.name) this.acctForm = null;
    else {
      this.acctMsg = '';
      this.net.send({ t: 'rename', name });
    }
    this.renderMenu();
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

  private wearTitle(id: string | null): void {
    if (!eco.setTitle(this.s, id)) return;
    this.net.send({ t: 'title', id });
    this.persist();
  }

  private switchLure(): void {
    const on = !eco.lureOn(this.s);
    if (!eco.setLure(this.s, on)) return;
    this.net.send({ t: 'lure', on });
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
  private leaders(): { name: string; level: number; color: number; face: FaceId; me: boolean; title: string | null }[] {
    const face = (f: string) => (isFace(f) ? f : 'smile');
    const rows = [{ name: this.net.name, level: this.s.level, color: this.s.look.color, face: face(this.s.look.face), me: true, title: titleName(this.s.title) }];
    for (const p of this.net.players.values()) rows.push({ name: p.name, level: p.level ?? 1, color: p.look.color, face: face(p.look.face), me: false, title: titleName(p.title) });
    return rows.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  }

  /** Online players ranked by their most valuable catch, for the physical board. */
  private anglers(): LeaderRow[] {
    type Row = { name: string; level: number; best: SaveData['best']; coins: number; title: string | null };
    let all: Row[];
    if (this.net.connected) {
      all = this.net.hall.map((h) => ({ name: h.name, level: h.level, best: h.best, coins: 0, title: titleName(h.title) }));
    } else {
      all = [{ name: this.net.name, level: this.s.level, best: this.s.best, coins: this.s.coins, title: titleName(this.s.title) }];
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
          title: p.title,
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
  /** `buttons` sit beside Send feedback, `below` on a line under them (the welcome's account links). */
  private showResume(prefix = '', action = 'to keep playing', buttons = '', below = ''): void {
    const el = $('resume');
    el.innerHTML = `${prefix}<b>Click</b> ${action}<div class="acts"><div><button id="resume-fb" class="btn plain">💬 Send feedback</button>${buttons}</div>${below}</div>`;
    el.classList.remove('hidden');
  }

  /** The player went offline without choosing to: say so until they reload, which reconnects. */
  private showOffline(why: string, what = "Playing offline: progress here isn't saved to your account.", kind = ''): void {
    $('offline-why').textContent = why;
    $('offline-what').textContent = what;
    $('offline-go').textContent = kind === 'gpu' ? 'Reload' : 'Refresh to reconnect';
    $('offline').className = kind;
  }

  /** Full or lite graphics: the player's choice in Settings, otherwise lite on touch devices (phones). */
  private applyGraphics(): void {
    const saved = localStorage.getItem(GRAPHICS_KEY);
    this.world.setLite(saved ? saved === 'lite' : touchOnly || !!this.touch);
  }

  /** While a full-screen notice hides the view, skip drawing it so the GPU stays idle. */
  setCovered(on: boolean): void {
    this.world.paused = on;
  }

  private toggleGraphics(): void {
    localStorage.setItem(GRAPHICS_KEY, this.world.isLite ? 'full' : 'lite');
    this.applyGraphics();
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

  /** Builds the current map and places the player: at the gate when coming back from `from`, else at the spawn. */
  private applyLocation(from?: string): void {
    this.map = MAPS.find((m) => m.id === this.s.location) ?? MAPS[0];
    this.s.location = this.map.id;
    this.world.setLocation(byId(LOCATIONS, this.map.locationId), this.map);
    this.setGateSign();
    this.bj = null;
    this.bjShown = null;
    this.player = new Player(this.map.radius);
    const at = arrivalSpot(this.map, from);
    this.player.teleport(at.x, at.z);
    this.world.yaw = at.yaw;
    this.avatars.sync(this.net.players, this.net.id, this.map.id);
    // A new hub starts with an empty board, and the server only resends it when someone's stats change.
    this.world.hub?.setLeaders(this.anglers());
    this.world.hub?.setSupporters(this.net.supporters);
    this.world.hall?.records.set(this.net.records);
  }

  // ---------- walking & interaction ----------

  private setMenu(open: boolean): void {
    this.menuOpen = open;
    $('menu').classList.toggle('hidden', !open);
    // Shop mode hides parts of the HUD; it must end with the menu, not wait for the next redraw.
    if (!open) document.body.classList.remove('shopping');
    if (open) $('resume').classList.add('hidden');
    // The wardrobe preview has its own render loop; renderMenu restarts it when the tab is shown again.
    if (!open && $('join').classList.contains('hidden')) this.preview?.stop();
  }

  private openMenu(tab: string): void {
    this.tab = tab;
    // A shop opens on your own look; nothing is tried on until you pick an item.
    if (tab === 'shop' || tab === 'casino') {
      delete this.pick.cos;
      delete this.pick.ccos;
    }
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
    if (this.spin) return this.toast('Wait for the result first.');
    const dest = this.map.next;
    if (!dest) return this.toast('The road ends here.');
    if (!this.gateOpen) return this.toast(`${dest.name} needs level ${CASINO_LEVEL}.`);
    if (!this.net.connected) return this.toast('The casino needs a server connection.');
    this.net.send({ t: 'travel', to: dest.id });
  }

  /** The prize counter menu: perks and casino cosmetics. The tables are played in the 3D hall. */
  private openPrizes(): void {
    if (!this.net.connected) return this.toast('The casino needs a server connection.');
    this.openMenu('casino');
  }

  private casinoSend(msg: Parameters<NetClient['send']>[0]): void {
    if (!this.net.connected) return this.toast('The casino needs a server connection.');
    this.net.send(msg);
  }

  /** Prize counter open: clicking a fish in the hotbar turns it in for chips. */
  private cashOut(i: number): void {
    if (this.spin || (this.bj && !this.bj.done)) return;
    this.casinoSend({ t: 'cashout', i });
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
    const after = before * r.factor;
    this.spin = true;
    this.casinoMsg = '<span class="muted">The wheel is spinning…</span>';
    this.world.hall?.spin(r.pocket, r.ms);
    if (this.menuOpen) this.renderMenu();
    this.later(r.ms + RESULT_BEAT_MS, () => {
      this.endReveal();
      const win = r.factor > 0;
      this.casinoMsg = win
        ? `<b class="win">${r.color.toUpperCase()}! You win</b> ${name} is now worth ${Math.round(after)} ${COIN}`
        : `<b class="lose">${r.color.toUpperCase()}.</b> ${name} (${Math.round(before)} ${COIN}) is gone`;
      this.showResult(win ? 'win' : 'lose', win ? `${r.color.toUpperCase()}! YOU WIN` : `${r.color.toUpperCase()}. YOU LOSE`, win ? `${name} is now worth ${Math.round(after)} ${COIN}` : `${name} is gone`);
      if (win) audio.jingle('epic');
      else audio.snap();
      if (this.menuOpen) this.renderMenu();
    });
  }

  /**
   * A blackjack view from the server, one per deal or action. Its new cards are dealt onto the felt one
   * at a time; the readout, the buttons, the result and the server's new save wait for the last one.
   */
  private dealt(v: BlackjackView | null): void {
    const shown = this.bj;
    this.endReveal();
    this.bj = v;
    const hall = this.world.hall;
    if (!v) {
      this.bjShown = null;
      hall?.setBlackjack(null);
      return;
    }
    const { steps, end } = dealSteps(shown, v);
    this.spin = true;
    this.bjShown = landedView(shown, v, steps, 0);
    hall?.setBlackjack(v, steps);
    steps.forEach((st, i) => this.later(st.at + st.ms, () => (this.bjShown = landedView(shown, v, steps, i + 1))));
    // A finished hand (even one that ends on the deal with a natural 21) gets a beat after its last card
    this.later(v.done ? end + RESULT_BEAT_MS : end, () => {
      this.endReveal();
      this.bjShown = v;
      this.world.hall?.setButtons(v);
      if (v.done) {
        const { kind, title, sub } = blackjackVerdict(v);
        this.showResult(kind, title, sub);
        // Same sounds as the roulette table; a push keeps the fish, so it gets the short sale jingle.
        if (kind === 'win') audio.jingle('epic');
        else if (kind === 'lose') audio.snap();
        else audio.jingle('common');
      }
      if (this.menuOpen && this.tab === 'casino') this.renderMenu();
    });
  }

  private resultTimer = 0;
  private showResult(kind: 'win' | 'lose' | 'push', title: string, sub: string): void {
    const el = $('tableresult');
    el.className = kind;
    el.innerHTML = `${title}<small>${withCoins(sub)}</small>`;
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
      this.bjShown = null;
      this.casinoMsg = '';
      this.casinoSend({ t: 'bj', a, i: this.betSlot });
    } else this.casinoSend({ t: 'bj', a });
  }

  private chipsText(n: number): string {
    return String(Math.round(n * 10) / 10);
  }

  private casinoHtml(): string {
    if (this.prizeTab === 'cosmetics') return `${this.cosShopHtml('casino')}${this.sellStrip()}`;
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
    return `<div class="cols"><div class="main"><h4>Casino unlocks</h4><div class="tiles">${tiles}</div></div>${detail}</div>${this.sellStrip()}`;
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
        ? `Betting <b>${byId(FISH, fish.fishId).name}</b> · ${Math.round(eco.fishValue(fish))} ${COIN}`
        : `Hold a fish (${this.fishKeys}) to bet it.`,
    );
    const g = this.bjShown;
    if (t === 'blackjack' && g) {
      lines.push(`Dealer <b>${g.dealerTotal ?? '?'}</b> · You <b>${g.playerTotal}</b>`);
      if (g.done) {
        const { kind, line } = blackjackVerdict(g);
        lines.push(`<b class="${kind === 'push' ? '' : kind}">${line}</b>`);
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
    if (a.id === 'double') return `double down · ${doubleCost(this.s, this.betSlot)} ${COIN}`;
    return { deal: 'deal a hand', hit: 'hit', stand: 'stand' }[a.id] ?? a.id;
  }

  private tableClick(): void {
    if (!this.table) return this.toast('No fishing in the casino. Head out the front door.');
    const a = this.aim;
    if (this.table === 'prizes') {
      if (a?.k === 'shop') this.openPrizes();
      else if (a?.k === 'cash') {
        if (this.s.slots[this.s.held]?.k !== 'fish') return this.toast(`Hold a fish (${this.fishKeys}) to turn it in.`);
        this.casinoSend({ t: 'cashout', i: this.s.held });
      }
      return;
    }
    if (!a || this.spin) return;
    const it = this.s.slots[this.betSlot];
    const needsFish = a.k === 'rbet' || a.id === 'deal';
    if (needsFish && it?.k !== 'fish') return this.toast(`Hold a fish (${this.fishKeys}) to bet it.`);
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

  private dugAt = -Infinity;

  private digWorms(): void {
    // Online, the server owns the cooldown and explains any refusal; this only covers offline play.
    if (!this.net.connected && performance.now() - this.dugAt < eco.DIG_COOLDOWN_MS) return this.toast(eco.DIG_WAIT);
    const n = eco.digWorms(this.s);
    if (n <= 0) return;
    this.dugAt = performance.now();
    this.net.send({ t: 'dig' });
    this.toast(`🪱 You dig up ${n} worms. Hold your rod and cast!`, 4);
    audio.splash(0.3);
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
    const tm = this.touchMove;
    const fwd = walking ? Number(k.has('KeyW')) - Number(k.has('KeyS')) + tm.y : 0;
    const strafe = walking ? Number(k.has('KeyD')) - Number(k.has('KeyA')) + tm.x : 0;
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight') || tm.sprint;
    this.player.update(dt, fwd, strafe, sprint, w.yaw, w.colliders);
    w.eye.set(this.player.x, this.player.eyeY, this.player.z);
    w.walkBob = this.player.bob;

    const hub = w.hub;
    const { x, z } = this.player;
    // Lower d wins: the wheel, then selling, then picking up, then everything else by distance.
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
      const ws = town.wormSpot;
      const diggable = !!ws && eco.canDig(this.s);
      town.setDiggable(diggable);
      if (ws && diggable) {
        const dw = Math.hypot(ws.x - x, ws.z - z);
        if (dw < eco.DIG_RANGE) spots.push({ d: dw - 20, label: 'Dig for worms · free bait', act: () => this.digWorms() });
      }
    }

    const sh = this.map.smokehouse;
    if (sh) {
      const dc = Math.hypot(sh.x - x, sh.z - z);
      if (dc < 2.8) spots.push({ d: dc - 2, label: smoke.smokerOpen(this.s) ? `Mags Cinder's Smokehouse · smoke fish to sell or snack on${smoke.kitchenOpen(this.s) ? ', cook dishes' : ''}` : `Mags Cinder's Smokehouse · opens at level ${SMOKE_LEVEL}`, act: () => this.openSmokehouse() });
    }

    const c = this.map.casino;
    this.updateTable(walking);
    if (c) {
      const at = (sp: { x: number; z: number }) => Math.hypot(sp.x - x, sp.z - z);
      if (at(c.prizes) <= CASINO_RANGE - 0.4) spots.push({ d: at(c.prizes) - 25, label: 'Prize counter · turn fish in for chips, buy perks', act: () => this.openPrizes() });
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
          spots.push({ d: -30, label: `Sell ${f.name} · ${eco.sellPrice(this.s, held)} ${COIN}`, act: () => this.sellHeld() });
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
        // The Smokehouse stands right beside the wheel: a fish in hand only spins it from the wheel's
        // side, so walking up to Mags's counter can't gamble the fish by accident.
        const shack = sh && Math.hypot(sh.x - x, sh.z - z) < dw;
        spots.push(
          wh?.k === 'fish'
            ? { d: shack ? dw : -40, label: `Spin the wheel with ${byId(FISH, wh.fishId).name} · 2× or nothing (${Math.round(eco.fishValue(wh))} ${COIN})`, act: () => this.gamble() }
            : { d: dw, label: 'Lucky Wheel · hold a fish and press E to gamble it', act: () => this.toast(`Hold a fish (${this.fishKeys}), then press E to spin.`) },
        );
      }
      const near = (v: THREE.Vector3) => Math.hypot(v.x - x, v.z - z);
      spots.push(
        { d: near(hub.leaderSpot), label: 'Top Anglers · see everyone online', act: () => this.openMenu('players') },
        { d: near(hub.mirrorSpot), label: 'Dressing mirror · change your look', act: () => this.openMenu('wardrobe') },
        { d: near(hub.campSpot), label: 'Warm up by the campfire', act: () => this.toast(CAMP_TIPS[Math.floor(Math.random() * CAMP_TIPS.length)]) },
        ...(hub.peekSpot ? [{ d: near(hub.peekSpot), label: 'Casino Cove poster · take a look inside', act: () => this.openMenu('peek') }] : []),
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
        if (can === 'nobait' && eco.canDig(this.s)) return this.toast(eco.DIG_HINT, 5);
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
    this.fightSeed = roll.seed ?? 0;
    this.fightD = roll.d ?? 1;
    this.elapsed = 0;
    this.nibbleCd = 1.2 + Math.random() * 1.5;
    this.approachAngle = Math.random() * Math.PI * 2;
    if (this.hooked) {
      this.shadow = buildFish(this.hooked.color, true, this.hookedShiny, this.hooked.tier, this.hooked.id);
      this.shadow.group.scale.setScalar(waterScale(this.hookedSize, this.hooked.tier));
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
    el.classList.remove('welcome', 'rank');
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

  /** The big gold "⚓ BOSUN ⚓" over what the rank gave. */
  private rankBanner(r: RankUp): void {
    const el = $('banner');
    el.classList.remove('welcome');
    el.classList.add('rank');
    el.style.color = '';
    el.innerHTML = `${escapeHtml(r.title)}<small>${escapeHtml(r.line)}</small>`;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => el.classList.add('hidden'), 4600);
    window.setTimeout(() => audio.jingle('legendary'), 450);
  }

  /** [Wear title] and [Wear it] under the LEVEL UP line. The mouse is locked to the game on desktop, so they also have keys. */
  private rankButtons(): string {
    const r = this.rankCard;
    if (!r) return '';
    const key = (k: string) => (this.touch ? '' : `<kbd>${k}</kbd> `);
    const title = `<button class="btn mini" data-rank="title"${this.s.title === r.titleId ? ' disabled' : ''}>${key('T')}Wear title</button>`;
    const outfit = r.outfit ? `<button class="btn mini" data-rank="outfit"${this.wearing(r.outfit) ? ' disabled' : ''}>${key('O')}Wear it</button>` : '';
    return `<div class="rank-acts">${title}${outfit}</div>`;
  }

  private wearing(outfit: string): boolean {
    const c = cosById(outfit);
    return !!c && this.s.look[c.slot] === outfit;
  }

  /** Same code paths as the Wardrobe; the button turns into a check once used. */
  private useRankButton(which: 'title' | 'outfit'): void {
    const r = this.rankCard;
    if (!r || this.phase !== 'result') return;
    if (which === 'title') this.wearTitle(r.titleId);
    else {
      const c = r.outfit ? cosById(r.outfit) : undefined;
      if (c && this.s.owned.includes(c.id)) this.equip(c.slot, c.id);
    }
    const btn = $('catch').querySelector<HTMLButtonElement>(`[data-rank="${which}"]`);
    if (btn && (which === 'title' ? this.s.title === r.titleId : !!r.outfit && this.wearing(r.outfit))) {
      btn.disabled = true;
      btn.textContent = which === 'title' ? '✓ Title worn' : '✓ Wearing it';
    }
  }

  private startReel(): void {
    const w = this.world;
    this.phase = 'reeling';
    $('alert').classList.add('hidden');
    const hard = this.fightD;
    this.reel = new Reel(hard, mulberry(this.fightSeed));
    this.holds = new HoldLog();
    this.reelAcc = 0;
    this.topTierBanner(this.hooked!, 'hooked', this.hookedShiny);
    this.guide('reel');
    this.lastSurges = 0;
    this.lastFrays = 0;
    this.frayFlash = 0;
    this.landedClean = false;
    this.leapT = -1;
    this.fish = buildFish(this.hooked!.color, false, this.hookedShiny, this.hooked!.tier, this.hooked!.id);
    this.fish.group.scale.setScalar(waterScale(this.hookedSize, this.hooked!.tier));
    w.scene.add(this.fish.group);
    w.rig.kick('pitch', 7);
    w.fovKick = 4;
    w.addShake(0.8);
    w.fx.splash(w.bobber.position, 36, 1.4);
    audio.splash(1);
    this.toast(`Hooked! ${difficultyLabel(hard)} fight.`);
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
      pitch: this.holdPitch(this.heldScale()),
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

  /**
   * Pendulum: the fish hangs by its mouth from the rod tip on an inextensible line. `bob` is the
   * fish's middle, so the line and the fish swing together as one stiff pendulum (a long fish on a
   * short line would otherwise whip its body around).
   */
  private stepBob(dt: number): void {
    const tip = this.world.rig.tip.getWorldPosition(this.tipPos);
    const n = 4;
    const h = Math.min(dt, 0.05) / n;
    const sc = this.held ? this.held.group.scale.x : 1;
    const reach = hangLen(sc) + 0.5 * sc;
    // Heavier fish settle sooner.
    const damp = 0.35 + 0.15 * Math.max(0, sc - 1.5);
    for (let i = 0; i < n; i++) {
      this.bobVel.y -= 9.8 * h;
      this.bobVel.multiplyScalar(1 - damp * h);
      this.bob.addScaledVector(this.bobVel, h);
      const d = this.swingDir.subVectors(this.bob, tip);
      const len = d.length();
      if (len > reach) {
        d.multiplyScalar(1 / len);
        this.bob.copy(tip).addScaledVector(d, reach);
        const radial = this.bobVel.dot(d);
        if (radial > 0) this.bobVel.addScaledVector(d, -radial);
      }
      const floor = this.hangFloor(this.bob.x, this.bob.z, sc);
      if (this.bob.y < floor) {
        this.bob.y = floor;
        this.bobVel.y = Math.max(0, this.bobVel.y);
      }
    }
  }

  private finishCatch(): void {
    const fish = this.hooked!;
    const size = this.hookedSize;
    const { stored, first, record, gained, leveledUp, level, ranks, stages, mult, xpFrom, coinFrom, shinyFrom, gift } = eco.applyCatch(this.s, fish, size, this.hookedShiny, this.landedClean);
    if (!stored) return this.reset('No free slot - the fish got away!');
    this.net.send({ t: 'catch', h: this.holds.encode() });
    this.stagesWaiting.push(...stages);
    if (gift) this.toast(smoke.giftText(gift), 3.5);
    this.caughtTier = fish.tier;
    this.world.hub?.setLeaders(this.anglers());
    const sc = this.heldScale();
    this.hangPoint(this.bob, 0, 0).y -= 0.5 * sc;
    this.bobVel.set(0.5, 0, -0.2).multiplyScalar(Math.min(1, 1.6 / sc));

    const el = $('catch');
    el.style.borderColor = RARITY_COLOR[fish.rarity];
    el.style.boxShadow = fish.tier >= 3 ? `0 0 ${12 + fish.tier * 10}px ${RARITY_COLOR[fish.rarity]}` : '';
    el.style.setProperty('--glow', RARITY_COLOR[fish.rarity]);
    el.dataset.tier = String(fish.tier);
    const shiny = this.hookedShiny;
    this.rankCard = rankUp(ranks);
    el.innerHTML = `<div class="muted">${shiny ? `<b style="color:#ffd23a">✨ SHINY! ✨</b>${shinyFrom ? ` <span class="credit">✨ ${shinyFrom}</span>` : ''} ` : ''}${first ? 'NEW! ' : ''}${record ? 'PERSONAL BEST ' : ''}</div>
      <div class="catch-ico">${fishIcon(fish.id, { shiny })}</div>
      <h2 style="color:${RARITY_COLOR[fish.rarity]}">${shiny ? '✨ ' : ''}${fish.name}</h2>
      <p class="blurb">${FISH_BLURB[fish.id] ?? ''}</p>
      <div class="weight"><span class="coin"></span>${Math.round(sellValue(fish, size, shiny) * mult).toLocaleString()}${coinFrom ? `<small class="credit">💰 ${coinFrom}</small>` : ''}</div>${this.landedClean ? `<div class="clean">🧵 Clean catch! +${Math.round(eco.CLEAN_BONUS * 100)}%</div>` : ''}
      <div>${this.tierBadge(fish.tier)} ${TIER_THEME[fish.tier - 1]} · ${size} cm · ${formatWeight(fishWeight(fish, size))}${fish.night ? ' · 🌙' : ''}</div>
      <div>+${gained} XP${xpFrom ? ` <span class="credit">⭐ ${xpFrom}</span>` : ''}${leveledUp ? ` · <b>LEVEL UP! Lv ${level}</b>` : ''}</div>${this.rankButtons()}
      <div class="muted">Click to release your hold</div>`;
    el.classList.remove('hidden');
    // Replay the card's entry animation (it scales up harder for jewel and spirit fish).
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    audio.jingle(shiny ? 'legendary' : fish.rarity);
    // A new rank takes the banner from the tier banner, and its jingle follows the catch's.
    if (this.rankCard) this.rankBanner(this.rankCard);
    else this.topTierBanner(fish, 'caught', shiny);
    this.catchMoment(fish, shiny);

    this.held = this.fish;
    this.fish = null;
    this.endCast('result');
    this.world.rig.pose({
      pitch: this.holdPitch(this.held!.group.scale.x),
      yaw: 0,
      bendP: 0.45,
      bendY: 0,
      k: 40,
      c: 8,
    });
    this.world.line.line.visible = true;
  }

  /** Jewel and spirit fish (and shinies) land with a burst of sparkles and a little camera kick. */
  private catchMoment(fish: Fish, shiny: boolean): void {
    if (fish.tier < 4 && !shiny) return;
    const w = this.world;
    const g = this.fish?.group;
    if (!g) return;
    const top = fish.tier >= 5;
    const center = g.getWorldPosition(new THREE.Vector3());
    const color = new THREE.Color(shiny ? 0xffd23a : FISH_LOOK[fish.id]?.accent ?? fish.color);
    w.fx.burst(center, color, top ? 140 : 70, top ? 1.3 : 1, 0.25 * g.scale.x);
    if (top) w.fx.burst(center, new THREE.Color(0xffffff), 40, 0.7, 0.4 * g.scale.x);
    w.addShake(top ? 0.9 : 0.5);
    w.fovKick = top ? -7 : -4;
    w.rig.kick('pitch', top ? 3 : 1.5);
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
      const f = byId(FISH, it.fishId);
      model = buildFish(f.color, false, it.shiny, f.tier, it.fishId);
      // Carried while walking: grows by size and tier, but eased toward a cap and pushed further
      // out and down as it grows, so a legend reads as huge without blocking the view.
      const sc = carryScale(it.size, f.tier);
      const out = Math.max(0, sc - 0.2);
      model.group.scale.setScalar(sc);
      model.group.rotation.set(0.3, 1.1, 0.35);
      obj = new THREE.Group();
      obj.add(model.group);
      obj.position.set(0.17 + out * 0.6, -0.2 - out * 0.7, -0.42 - out * 1.2);
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
    return heldScale(this.hookedSize, this.hooked?.tier ?? 1);
  }

  /**
   * Rod pitch while a catch dangles. The rod turns with the view, so it's raised by however far the
   * player looks down; otherwise looking down would dip the fish into the water.
   */
  private holdPitch(sc: number): number {
    return Math.min(MAX_HOLD_PITCH, hangPitch(sc) - Math.min(0, this.world.pitch));
  }

  /** Lowest a dangling fish's middle may go, so its tail stays clear of the water, dock and ground. */
  private hangFloor(x: number, z: number, sc: number): number {
    return Math.max(this.world.surface(x, z), standHeight(x, z)) + 0.08 + 0.5 * sc;
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
    const sc = this.heldScale();
    out.y = Math.max(out.y - hangLen(sc), this.hangFloor(out.x, out.z, sc) + 0.5 * sc);
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
    // Tips wait for the catch card to be put away, so they don't land on top of it.
    let tipped = false;
    if (this.stagesWaiting.length) this.stageBanner(this.stagesWaiting.splice(0), false);
    if (this.caughtTier >= 3 && smoke.kitchenOpen(this.s)) tipped = this.guide('dish');
    if (tipped) {
      // The Kitchen opening says enough for one catch.
    } else if (this.caughtTier >= 2) tipped = this.guide('tier');
    else if (this.caughtTier && !this.s.tips.includes('sold') && this.s.slots.some((sl) => sl?.k === 'fish')) tipped = this.guide('catch');
    else if (this.caughtTier === 1 && smoke.smokerOpen(this.s)) tipped = this.guide('smoker');
    if (this.toughCatch && !tipped) this.rodHint('tough');
    this.caughtTier = 0;
    this.toughCatch = false;
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
    // Behind the join screen, wait for the background shader compile instead of stalling on it.
    this.world.holdForShaders = !$('join').classList.contains('hidden');
    this.world.update(dt);
    this.drawGauge(now / 1000);
    if (this.phase !== this.shownPhase) {
      // CSS hides parts of the touch HUD by phase (e.g. the hotbar during a fight).
      document.body.dataset.phase = this.phase;
      if (this.touch && this.phase === 'bite') navigator.vibrate?.(120);
      this.shownPhase = this.phase;
    }
    if (this.touch) this.updateTouch();
    this.fps?.frame(now);
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

  /** Night bites, and a reminder while the dev console's /time freezes this player's sky. */
  private updateNight(): void {
    const night = this.world.night >= NIGHT_BITE ? '🌙 Night - rare & night-only fish are biting!' : '';
    const text = !this.devTime ? night : [night, '🕒 /time is on (only you) · /time auto to undo'].filter(Boolean).join(' · ');
    if (text === this.nightShown) return;
    this.nightShown = text;
    $('nightchip').textContent = text;
  }

  /** A reminder while the Shiny Lure is on, since every fish hooked spends a charge. */
  private updateLure(): void {
    const n = this.s.lure;
    const text = eco.lureOn(this.s) ? `✨ Shiny Lure on · ${n} cast${n === 1 ? '' : 's'} left` : '';
    if (text === this.lureShown) return;
    this.lureShown = text;
    $('lurechip').textContent = text;
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

  /** Tells the townsfolk who's around and who's fishing, so they don't walk into anyone or wander off mid-cast. */
  private syncBystanders(): void {
    this.world.fishing = this.phase !== 'idle';
    const others = this.world.others;
    others.length = 0;
    for (const p of this.net.players.values()) {
      if (p.id === this.net.id || p.map !== this.map.id) continue;
      others.push({ x: p.x, z: p.z, fishing: p.act?.a === 'cast' || p.act?.a === 'hold' });
    }
  }

  private tick(dt: number): void {
    this.updateWalking(dt);
    this.updateContext();
    this.updateSpot();
    this.updateNight();
    this.updateLure();
    this.tickSmoke(dt);
    this.net.sendPos(dt, this.player.x, this.player.z, this.world.yaw);
    this.avatars.update(dt, this.world.time, this.net.players, this.player.x, this.player.z);
    this.syncBystanders();
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
          this.world.rig.pose({ pitch: this.holdPitch(g.scale.x) });
          this.stepBob(dt);
          const tip = this.tipPos;
          const up = this.swingDir.subVectors(tip, this.bob).normalize();
          hangFacing(g, up, this.world.camera.getWorldPosition(this.hang).sub(this.bob));
          g.position.copy(this.bob);
          const mouth = this.hang.copy(this.bob).addScaledVector(up, 0.5 * g.scale.x);
          animateFish(this.held, t, 6, 0.25);
          this.world.line.update(tip, mouth, 0.01, 0, t);
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

    // Fixed steps, so the server can replay the fight from the button log.
    this.reelAcc += dt;
    while (this.reelAcc >= FIGHT_DT && r.status === 'reeling' && this.holds.steps < MAX_FIGHT_STEPS) {
      this.reelAcc -= FIGHT_DT;
      this.holds.push(this.holding);
      r.update(FIGHT_DT, this.holding);
    }

    if (r.wear.frays !== this.lastFrays) {
      this.lastFrays = r.wear.frays;
      this.frayFlash = 0.6;
      audio.tick(0.6);
      w.addShake(0.6);
      if (r.status === 'reeling') this.guide('fray');
    }
    this.frayFlash = Math.max(0, this.frayFlash - dt);

    if (r.surgeCount !== this.lastSurges) {
      this.lastSurges = r.surgeCount;
      w.fx.ripple(b, 3, 0, 1.2);
      audio.tick(0.5);
      if (r.surgePower > 0.75 && Math.random() < 0.6) this.leapT = 0;
    }

    const right = new THREE.Vector3(Math.cos(w.yaw), 0, -Math.sin(w.yaw));
    const base = new THREE.Vector3(w.eye.x, 0, w.eye.z);
    const toTarget = this.target.clone().sub(base);
    const dist =
      toTarget.length() * (1 - 0.9 * r.progress) * (1 + 0.25 * r.pull);
    const fp = base
      .clone()
      .addScaledVector(toTarget.normalize(), dist)
      .addScaledVector(right, r.lateral * dist * 0.4);
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

    if (r.status === 'caught') {
      this.toughCatch = r.elapsed > TOUGH_FIGHT_SECS;
      this.landedClean = r.clean;
      this.startLanding();
    } else if (r.status === 'snapped') {
      audio.snap();
      w.rig.kick('pitch', -4);
      w.addShake(1.2);
      // Only the short line here: the fray tip already explained snapping.
      this.reset('The line snapped!');
      this.rodHint('snapped');
    } else if (r.status === 'escaped') {
      this.reset('The fish took all your line!');
      // The first time, say why; after that the rod hint (once a session) can show.
      if (!this.guide('slack')) this.rodHint('escaped');
    } else if (this.holds.steps >= MAX_FIGHT_STEPS) {
      this.reset('The fish wore you out and got away...');
    }
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
      THREE.MathUtils.lerp(waterScale(this.hookedSize, this.hooked!.tier), sc, e),
    );
    g.rotation.order = 'YXZ';
    // Ends nose-up with a flank toward the camera, where the result view takes over.
    const face = w.yaw - Math.PI / 2 - 2;
    g.rotation.set(
      (Math.PI / 2) * e,
      2 + Math.atan2(Math.sin(face), Math.cos(face)) * e,
      Math.sin(u * Math.PI * 3) * 0.5 * (1 - e),
    );
    animateFish(this.fish!, w.time, 22, 0.6);
    w.rig.pose({ pitch: this.holdPitch(sc) });
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

  /** Shows a new-player tip once per account; the server keeps the list so it follows the account. */
  private guide(id: TipId): boolean {
    if (!markTip(this.s, id)) return false;
    this.net.send({ t: 'tip', id });
    this.persist();
    this.showGuide(tipText(id, this.s, this.map.vendor.name, !!this.touch));
    return true;
  }

  /** After a lost fish or a tough fight, points at the next rod up. Only once a session, so it doesn't nag. */
  private rodHint(end: FightEnd): void {
    const rod = this.rodHinted ? null : rodUpgrade(this.s);
    if (!rod) return;
    this.rodHinted = true;
    this.showGuide(rodHintText(end, rod, this.map.vendor.name));
  }

  private showGuide(html: string): void {
    const el = $('guide');
    el.innerHTML = `<span>${html}</span>`;
    el.classList.add('show');
    clearTimeout(this.guideTimer);
    this.guideTimer = window.setTimeout(() => el.classList.remove('show'), 9000);
  }

  private toast(msg: string, secs = 2): void {
    const t = $('toast');
    t.innerHTML = coinText(msg);
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
    // Keep the gauge green: red frays the line, and below the fish's pull (the white marker in a surge) it takes line.
    const red = r.tension > GOOD_MAX;
    const surge = r.surging;
    const taking = surge && r.losingLine;
    const warn = !surge && r.warning;
    const danger = red || r.outmatched;
    const pulse = 0.5 + 0.5 * Math.sin(time * (danger ? 18 : 8));
    const accent = red ? '#ff3b30' : taking || warn ? '#ffb020' : '#58e07a';
    $('vignette').classList.toggle('surge', danger);
    this.gauge.classList.toggle('surge', danger);

    if (danger || surge || warn) {
      ctx.beginPath();
      ctx.arc(cx, cy, 112, 0, Math.PI * 2);
      ctx.strokeStyle = danger
        ? `rgba(255,59,48,${0.25 + 0.55 * pulse})`
        : `rgba(255,176,32,${0.2 + 0.3 * pulse})`;
      ctx.lineWidth = danger ? 10 + 8 * pulse : 6;
      ctx.stroke();
    }

    arc(96, 0, 1, 'rgba(0,0,0,0.5)', 14);
    arc(96, GOOD_MIN, GOOD_MAX, 'rgba(255,255,255,0.18)', 14);
    arc(96, r.sweetMin, r.sweetMax, 'rgba(88,224,122,0.55)', 14);
    arc(96, Math.max(0, GOOD_MAX), 1, 'rgba(255,59,48,0.45)', 14);
    arc(
      96,
      0,
      Math.max(0.01, r.tension),
      red ? '#ff3b30' : r.tension < GOOD_MIN || taking ? '#ffd23a' : '#7dff8a',
      7,
    );
    // The fish's pull in a surge: below this marker it takes line; past the red, the rod can't hold it.
    if (surge && r.need > 0.02) {
      const ma = a0 + Math.min(1, r.need) * sweep;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ma) * 84, cy + Math.sin(ma) * 84);
      ctx.lineTo(cx + Math.cos(ma) * 108, cy + Math.sin(ma) * 108);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    const na = a0 + r.tension * sweep;
    ctx.beginPath();
    ctx.arc(
      cx + Math.cos(na) * 96,
      cy + Math.sin(na) * 96,
      8 + (red ? 3 * pulse : 0),
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = red ? '#ff7a70' : '#fff';
    ctx.fill();

    arc(76, 0, 1, 'rgba(0,0,0,0.45)', 9);
    arc(76, 0, Math.max(0.01, r.progress), '#58b6ff', 7);

    // Fray marks: one half per fray (two snap the line). Holding in the red fills the next one up, blinking; a full
    // one flashes white as it frays.
    const halves: [number, number][] = [[0, 0.48], [0.52, 1]];
    halves.forEach(([from, to], i) => {
      const fill = Math.min(1, Math.max(0, r.strain * 2 - i));
      const done = i < r.wear.frays;
      const blink = 0.5 + 0.5 * Math.sin(time * 24);
      const fresh = done && i === r.wear.frays - 1 && this.frayFlash > 0;
      arc(62, from, to, 'rgba(0,0,0,0.4)', 5);
      if (done) arc(62, from, to, fresh && blink > 0.5 ? '#ffffff' : '#ff3b30', 4);
      else if (fill > 0) arc(62, from, from + (to - from) * fill, r.fraying ? `rgba(255,59,48,${0.55 + 0.45 * blink})` : 'rgba(255,59,48,0.7)', 4);
    });

    ctx.textAlign = 'center';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 6;
    ctx.fillStyle = accent;
    ctx.font = `800 ${danger ? 34 + 4 * pulse : 28}px system-ui`;
    const big = red
      ? 'EASE OFF!'
      : taking
        ? 'TIGHTEN!'
        : surge
          ? 'KEEP IT GREEN'
          : warn
            ? 'SURGE!'
            : this.holding
              ? 'REELING'
              : 'HOLD TO REEL';
    ctx.fillText(big, cx, cy + 150);
    ctx.font = '600 14px system-ui';
    ctx.fillStyle = '#fff';
    const small = r.outmatched
      ? 'Too strong for your rod!'
      : red
        ? 'The line is fraying'
        : taking
          ? 'The fish is taking line'
          : r.dragging
            ? 'Strong fish! Ride high in the green to give less line'
            : surge
              ? 'Stay between the marker and the red'
            : warn
              ? 'Get ready to ease off'
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
    const xp = Math.min(1, s.xp / xpForNextLevel(s.level));
    $('xpring').style.strokeDasharray = `${(xp * 157.08).toFixed(1)} 157.08`;
    const rank = rankAt(s.level);
    $('lvl').title = `Level ${s.level} · ${rank ? `${rank.title} · ` : ''}${s.xp.toLocaleString()} / ${xpForNextLevel(s.level).toLocaleString()} XP`;
    const tier = pillTier(s.level);
    if (tier) $('lvl').dataset.pill = tier;
    else delete $('lvl').dataset.pill;
    // Chips only matter inside the casino.
    $('chips').textContent = this.chipsText(s.chips);
    $('chipbox').classList.toggle('hidden', !this.map.casino);
    this.setGateSign();
    this.renderHotbar();
  }

  private renderMenu(): void {
    const vendor = this.tab === 'shop' || this.tab === 'casino' || this.tab === 'smoke';
    document.body.classList.toggle('shopping', this.menuOpen && vendor);
    $('menu').classList.toggle('casino', this.tab === 'casino' || this.tab === 'peek');
    $('menu').classList.toggle('fit', this.tab === 'peek');
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
      case 'settings': {
        // Menu re-renders (a state update arriving) must not wipe a half-typed password or name, or move
        // the caret in the feedback box (its text is kept in `fb`).
        const old = document.querySelector<HTMLInputElement>('#acct-pass, #acct-name');
        const focused = !!old && document.activeElement === old;
        const fbOld = document.getElementById('fb-text') as HTMLTextAreaElement | null;
        const caret = fbOld && document.activeElement === fbOld ? fbOld.selectionStart : null;
        el.innerHTML = this.settingsHtml();
        const box = document.querySelector<HTMLInputElement>('#acct-pass, #acct-name');
        if (box) {
          if (old?.id === box.id) box.value = old.value;
          if (focused || this.focusAcct) box.focus();
        }
        this.focusAcct = false;
        const fb = document.getElementById('fb-text') as HTMLTextAreaElement | null;
        if (fb && (caret !== null || this.focusFb)) {
          fb.focus();
          const at = caret ?? fb.value.length;
          fb.setSelectionRange(at, at);
          if (this.focusFb) fb.closest('.fb')?.scrollIntoView({ block: 'nearest' });
        }
        this.focusFb = false;
        break;
      }
      case 'shop':
        el.innerHTML = this.shopHtml();
        break;
      case 'casino':
        el.innerHTML = this.casinoHtml();
        break;
      case 'smoke':
        el.innerHTML = this.smokeHtml();
        break;
      case 'dex':
        el.innerHTML = this.dexHtml();
        break;
      case 'peek':
        el.innerHTML = this.peekHtml();
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
    const size = slotCount(s);
    // Slots are updated in place rather than rebuilt, so switching slots doesn't replace them:
    // the old slot glides back down while the new one bounces up.
    const el = $('hotbar');
    if (el.children.length !== s.slots.length) el.innerHTML = s.slots.map(() => '<div></div>').join('');
    s.slots.forEach((sl, i) => {
      // Icon, a short label underneath, and a corner badge for bait stack size. The rod and bait
      // slots get a tinted frame and a tag naming what goes there, so an empty one still reads.
      let body = '';
      let cls = 'slot';
      let ring = '';
      if (i === ROD_SLOT || i === BAIT_SLOT) cls += ` gear ${i === ROD_SLOT ? 'rodslot' : 'baitslot'}`;
      const tag = i === ROD_SLOT ? '<span class="tag">Rod</span>' : i === BAIT_SLOT ? '<span class="tag">Bait</span>' : '';
      if (sl?.k === 'bait') {
        body = `<span class="q">×${sl.n}</span><span class="ic">${BAIT_ICON[sl.id] ?? '🪱'}</span><span class="nm">${byId(BAITS, sl.id).name}</span>`;
      } else if (sl?.k === 'rod') {
        body = `<span class="ic">${rodIcon(byId(RODS, sl.id).tier)}</span><span class="nm">${shortRod(byId(RODS, sl.id).name)}</span>`;
      } else if (sl?.k === 'fish') {
        const f = byId(FISH, sl.fishId);
        ring = sl.shiny ? '#ffd23a' : RARITY_COLOR[f.rarity];
        // Just the total value: a wheel or table multiplier is already folded into it.
        body = `<span class="ic">${fishIcon(f.id, { shiny: sl.shiny })}</span><span class="nm val"><span class="coin xs"></span>${shortCoins(eco.fishValue(sl))}</span>`;
        cls += ' fish';
        // Past the hotbar size: a fish left over from before the rod and bait slots, until it's sold.
        if (i >= size) cls += ' extra';
      } else {
        cls += ' empty';
        if (i === ROD_SLOT) body = `<span class="ic ghost">${rodIcon(1)}</span>`;
        else if (i === BAIT_SLOT) body = '<span class="ic ghost">🪱</span>';
      }
      body += tag;
      if (i === BAIT_SLOT && eco.lureOn(s)) body += `<b class="lure">✨${s.lure}</b>`;
      const smokable = sl?.k === 'fish' && !byId(FISH, sl.fishId).sea && this.menuOpen && this.tab === 'smoke' && this.smokeTab === 'smoker' && smoke.freeSpot(this.s) >= 0;
      const sellable = smokable || (sl?.k === 'fish' && this.menuOpen && ((this.tab === 'shop' && this.atVendor) || this.tab === 'casino'));
      if (sellable) cls += ' sellable';
      const sell = smokable ? `🔥 Smoke · ${smokeSeconds(byId(FISH, sl.fishId).tier)} s` : sellable ? `Sell · ${eco.sellPrice(this.s, sl)} ${COIN}` : '';
      const name = sl?.k === 'fish' ? byId(FISH, sl.fishId).name + (i >= size ? ' · extra slot until it is sold' : '')
        : i === ROD_SLOT ? 'Rod slot: swap rods in your Bag (Tab)'
        : i === BAIT_SLOT ? `Bait slot: swap bait in your Bag (Tab)${eco.lureOn(s) ? ` · Shiny Lure on: the next ${s.lure} fish hooked will be shiny` : ''}` : '';
      const c = el.children[i] as HTMLElement;
      const key = [cls, body, sell, name, ring].join('|');
      if (c.dataset.h === key) return;
      c.dataset.h = key;
      c.dataset.i = String(i);
      c.className = cls + (c.classList.contains('pick') ? ' pick' : '');
      c.innerHTML = `<i>${i + 1}</i>${body}`;
      if (sell) c.dataset.sell = sell;
      else delete c.dataset.sell;
      if (name) c.title = name;
      else c.removeAttribute('title');
      if (ring) c.style.setProperty('--ring', ring);
      else c.style.removeProperty('--ring');
    });
    [...el.children].forEach((c, i) => c.classList.toggle('held', i === s.held));
    if (moved) {
      el.querySelector('.pick')?.classList.remove('pick');
      const held = el.children[s.held] as HTMLElement | undefined;
      if (held) {
        void held.offsetWidth;
        held.classList.add('pick');
      }
      this.showHeldName();
    }
  }

  /** Names the item in hand above the hotbar for a moment after switching slots. */
  private showHeldName(): void {
    const sl = this.s.slots[this.s.held];
    const el = $('heldname');
    if (!sl) return el.classList.remove('show');
    el.innerHTML =
      sl.k === 'fish' ? `${sl.shiny ? '✨ ' : ''}${byId(FISH, sl.fishId).name} · ${Math.round(eco.fishValue(sl))} ${COIN}`
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
    if (this.tab === 'smoke') {
      const busy = this.s.smoke.spots.filter(Boolean).length;
      return `<img src="${faceIcon('grin')}" alt=""><div><b>Mags's Smokehouse</b><span>${busy ? `${busy} fish smoking` : 'Smoker ready for fish'}</span></div>`;
    }
    if (this.tab === 'peek') return `<span class="who-ic">🎰</span><div><b>Casino Cove</b><span>Through the gate · level ${CASINO_LEVEL}+</span></div>`;
    if (this.tab === 'casino') return `<span class="who-ic">🎰</span><div><b>Prize Counter</b><span>${this.chipsText(this.s.chips)} chips to spend</span></div>`;
    return `<img src="${this.faceSrc(this.s.look.face as FaceId)}" alt=""><div><b>${escapeHtml(this.net.name || 'You')}</b><span>Level ${this.s.level} · ${this.s.coins.toLocaleString()} coins</span></div>`;
  }

  private menuTabsHtml(): string {
    const tab = (id: string, icon: string, label: string, on: boolean, attr = 'data-tab') =>
      `<button class="tab${on ? ' on' : ''}" ${attr}="${id}"${label ? '' : ' title="Settings"'}><span>${icon}</span>${label}</button>`;
    if (this.tab === 'shop')
      return tab('gear', '🎣', 'Gear', this.shopTab === 'gear', 'data-shop') + tab('cosmetics', '👕', 'Cosmetics', this.shopTab === 'cosmetics', 'data-shop');
    if (this.tab === 'casino')
      return tab('perks', '🍀', 'Unlocks', this.prizeTab === 'perks', 'data-prize') + tab('cosmetics', '🎩', 'High Roller', this.prizeTab === 'cosmetics', 'data-prize');
    if (this.tab === 'smoke') {
      const n = smoke.pantryTotal(this.s) + smoke.cookedTotal(this.s);
      return (
        tab('smoker', '🔥', 'Smoker', this.smokeTab === 'smoker', 'data-smoke') +
        tab('kitchen', smoke.kitchenOpen(this.s) ? '🍲' : '🔒', 'Kitchen', this.smokeTab === 'kitchen', 'data-smoke') +
        tab('pantry', '🧺', `Pantry${n ? ` (${n})` : ''}`, this.smokeTab === 'pantry', 'data-smoke')
      );
    }
    if (this.tab === 'peek') return '';
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
    const c =
      this.tab === 'shop' && this.shopTab === 'cosmetics'
        ? cosById(this.pick.cos)
        : this.tab === 'casino' && this.prizeTab === 'cosmetics'
          ? cosById(this.pick.ccos)
          : undefined;
    return c ? { ...this.s.look, [c.slot]: c.id } : this.s.look;
  }

  // ---------- shared pieces ----------

  /** A square item tile; clicking it selects the item (`data-pick`) unless `attrs` says otherwise. */
  private itemTile(o: { icon: string; name: string; sub: string; price?: string; tier: number; on?: boolean; check?: boolean; ghost?: boolean; attrs: string; tip?: string; color?: string; cls?: string }): string {
    const t = Math.max(1, Math.min(5, o.tier));
    return `<button class="tile${o.on ? ' sel' : ''}${o.ghost ? ' ghost' : ''}${o.cls ?? ''}" style="--c:${o.color ?? `var(--t${t})`}" ${o.attrs}${o.tip ? ` data-tip="${this.esc(o.tip)}"` : ''}>${o.check ? '<span class="eq">✓</span>' : ''}<span class="ic">${o.icon}</span><span class="nm">${o.name}</span>${o.price ? `<span class="pr">${o.price}</span>` : ''}${o.sub ? `<span class="st">${o.sub}</span>` : ''}</button>`;
  }

  private badge(tier: number): string {
    const t = Math.max(1, Math.min(5, tier));
    return `<span class="badge" style="--c:var(--t${t})">Tier ${t} · ${tierName(t)}</span>`;
  }

  private meter(label: string, value: string, frac: number, tier = 3): string {
    return `<div class="stat"><div class="srow"><span>${label}</span><span>${value}</span></div><div class="meter"><i style="width:${Math.round(Math.max(0.06, Math.min(1, frac)) * 100)}%;--c:var(--t${tier})"></i></div></div>`;
  }

  /** The details panel on the right: big icon, name, stats, one plain sentence, and the main action. */
  private detail(o: { icon: string; name: string; tier: number; badge?: string; body: string; note: string; actions: string; top?: string; color?: string; cls?: string }): string {
    const t = Math.max(1, Math.min(5, o.tier));
    return `<aside class="detail${o.cls ?? ''}">${o.top ?? ''}<div class="hero"><span class="ic" style="--c:${o.color ?? `var(--t${t})`}">${o.icon}</span><div><b>${o.name}</b>${o.badge ?? this.badge(o.tier)}</div></div>${o.body}<p>${o.note}</p><div class="actions">${o.actions}</div></aside>`;
  }

  private btn(label: string, attrs: string, kind: 'gold' | 'ok' | 'plain' | 'bad' = 'gold', disabled = false): string {
    return `<button class="btn ${kind}" ${attrs}${disabled ? ' disabled' : ''}>${label}</button>`;
  }

  // ---------- Smokehouse ----------

  private openSmokehouse(): void {
    if (!this.net.connected) return this.toast('The Smokehouse needs a server connection.');
    if (!smoke.smokerOpen(this.s)) return this.toast(`Mags: "Come back at level ${SMOKE_LEVEL} and I'll show you what to do with your small fry."`, 3.5);
    this.smokeTab = 'smoker';
    this.confirmEat = null;
    this.openMenu('smoke');
  }

  private smokeSend(msg: Parameters<NetClient['send']>[0]): boolean {
    if (!this.net.connected) {
      this.toast('The Smokehouse needs a server connection.');
      return false;
    }
    this.net.send(msg);
    return true;
  }

  /** After a local Smokehouse change: save, HUD and menu. */
  private smokeChanged(): void {
    this.persist();
    this.refreshHud();
    this.updateBuffs();
    this.renderMenu();
  }

  /** Puts the fish in hotbar slot i on the smoker. */
  private smokeSlot(i: number): void {
    if (!this.net.connected) return this.toast('The Smokehouse needs a server connection.');
    const it = this.s.slots[i];
    const why = smoke.smokeFish(this.s, i, this.net.now());
    if (why) return this.toast(why);
    this.smokeSend({ t: 'smoke', i });
    if (it?.k === 'fish') this.toast(`🔥 ${byId(FISH, it.fishId).name} on the smoker · ${smokeSeconds(byId(FISH, it.fishId).tier)} s`);
    this.smokeChanged();
  }

  private smokeAll(): void {
    if (!this.net.connected) return this.toast('The Smokehouse needs a server connection.');
    const n = smoke.smokeAllSlots(this.s).length;
    const why = smoke.smokeAll(this.s, this.net.now());
    if (why) return this.toast(why);
    this.smokeSend({ t: 'smokeall' });
    this.toast(`🔥 ${n} fish on the smoker`);
    this.smokeChanged();
  }

  private sellSmoked(id: string, all: boolean): void {
    if (!this.net.connected) return this.toast('The Smokehouse needs a server connection.');
    const n = all ? smoke.pantryCount(this.s, id) : 1;
    const value = smoke.smokedPrice(this.s, id, !all);
    const why = smoke.sellSmoked(this.s, id, all);
    if (why) return this.toast(why);
    this.smokeSend({ t: 'sellsmoked', id, ...(all ? { all } : {}) });
    this.toast(`Sold ${n} smoked ${byId(FISH, id).name} for ${value.toLocaleString()} 🪙`);
    audio.jingle('common');
    this.smokeChanged();
  }

  /** Minutes, rounded, for snack lengths. */
  private mins(ms: number): string {
    return `${Math.round(ms / 60_000)} min`;
  }

  /**
   * Eat buttons that say what they'll do: one fish adds 5 minutes, Eat all says how many it eats
   * and how long that lasts. A snack never gets stronger, only longer.
   */
  private eatBtns(id: string): string {
    const one = smoke.eatPlan(this.s, id);
    if (typeof one === 'string') return this.btn(`${SNACK_MAX_MINUTES} min max`, 'data-act="locked"', 'plain', true);
    const all = smoke.eatPlan(this.s, id, true);
    const fx = this.snackEffect(id);
    const oneLabel = `Eat · ${one.from ? '+' : ''}${SNACK_MINUTES} min`;
    const oneTip = `${fx} for ${one.from ? `${clock(one.from)} → ${clock(one.ms)}` : this.mins(one.ms)}`;
    let out = this.btn(oneLabel, `data-act="eat" data-id="${id}" data-tip="${this.esc(oneTip)}"`);
    if (typeof all !== 'string' && all.n > 1)
      out += this.btn(`Eat ${all.n} → ${this.mins(all.ms)}`, `data-act="eatall" data-id="${id}" data-tip="${this.esc(`Eats ${all.n}: still ${fx}, for ${this.mins(all.ms)} (the most is ${SNACK_MAX_MINUTES})`)}"`, 'ok');
    return out;
  }

  /** Sell 1 (the most valuable) and, with more than one, Sell all. */
  private sellBtns(id: string): string {
    if (!smoke.sellable(id)) return '';
    const n = smoke.pantryCount(this.s, id);
    return (
      this.btn(`Sell 1 · ${smoke.smokedPrice(this.s, id, true).toLocaleString()} ${COIN}`, `data-act="sellsmoked" data-id="${id}"`, 'plain') +
      (n > 1 ? this.btn(`Sell all · ${smoke.smokedPrice(this.s, id).toLocaleString()} ${COIN}`, `data-act="sellsmokedall" data-id="${id}"`, 'plain') : '')
    );
  }

  /** Eats a smoked fish (or as many as fit, with `all`). Replacing a different snack with over a minute left asks first. */
  private eat(id: string, all: boolean, sure = false): void {
    if (this.map.casino) return this.toast('Save it for the pond.');
    if (!this.net.connected) return this.toast('The Smokehouse needs a server connection.');
    if (!sure && smoke.wouldReplace(this.s, id)) {
      this.confirmEat = { id, all };
      this.pick.smoke = id;
      return this.renderMenu();
    }
    this.confirmEat = null;
    const why = smoke.eat(this.s, id, all);
    if (why) return this.toast(why);
    this.smokeSend({ t: 'eat', id, ...(all ? { all } : {}) });
    const sn = smoke.snack(this.s)!;
    this.toast(`${BUFF_ICON[sn.kind]} ${this.snackEffect(id)} · ${clock(sn.ms)} left (Smoked ${byId(FISH, id).name})`);
    this.smokeChanged();
  }

  /** "+25% XP" or "+15% coins", or how a tier 4-5 fish is used. */
  private snackEffect(fishId: string): string {
    const d = smoke.snackFor(fishId);
    return d ? `+${Math.round(d.bonus * 100)}% ${d.kind === 'xp' ? 'XP' : 'coins'}` : 'For dishes';
  }

  /** Runs the snack down between server updates, and redraws the countdowns once a second. */
  private tickSmoke(dt: number): void {
    smoke.tickBuffs(this.s, dt * 1000);
    const now = this.net.now();
    const sec = Math.floor(now / 1000);
    if (sec === this.clockSec) return;
    this.clockSec = sec;
    this.updateBuffs();
    // The first smoked fish to eat: point at the Bag, once the catch card and menus are out of the way.
    if (!this.menuOpen && this.phase === 'idle' && !this.s.tips.includes('snack') && smoke.smokerOpen(this.s) && Object.keys(this.s.smoke.pantry).some((id) => smoke.snackFor(id))) this.guide('snack');
    if (!this.menuOpen) return;
    // A fish finishing (or a snack or dish running out) changes the layout, not just a number.
    const key = `${this.s.smoke.spots.map((x) => (x && x.doneAt <= now ? 'd' : x ? 's' : '-')).join('')}${this.s.smoke.snack ? 1 : 0}${this.s.smoke.dish ? 1 : 0}`;
    if (key !== this.smokeKey) {
      this.smokeKey = key;
      if (this.tab === 'smoke' || this.tab === 'inventory') return this.renderMenu();
    }
    for (const el of document.querySelectorAll<HTMLElement>('#tab [data-until]')) el.textContent = clock(Number(el.dataset.until) - now);
    for (const el of document.querySelectorAll<HTMLElement>('#tab [data-to]')) {
      const from = Number(el.dataset.from);
      el.style.width = `${Math.round(Math.min(1, Math.max(0.06, (now - from) / (Number(el.dataset.to) - from))) * 100)}%`;
    }
  }

  /** The HUD chips for the snack and the dish being eaten, with their time left. */
  private updateBuffs(): void {
    const sn = smoke.snack(this.s);
    const d = smoke.dish(this.s);
    const html =
      (sn ? `<span data-tip="${this.esc(`Smoked ${byId(FISH, sn.fishId).name}`)}">${BUFF_ICON[sn.kind]} ${this.snackEffect(sn.fishId)} · ${clock(sn.ms)}</span>` : '') +
      (d ? `<span data-tip="${this.esc(this.buffsText(d))}">${dishById(d.id)!.icon} ${d.name} · ${clock(d.ms)}</span>` : '');
    if (html === this.buffsShown) return;
    this.buffsShown = html;
    $('buffs').innerHTML = html;
  }

  /** A stage's opening: one "New in town" banner for an existing player's first visit, else the newest stage. */
  private stageBanner(ids: StageId[], intro: boolean): void {
    const st = stageById(ids.at(-1));
    if (!st) return;
    const el = $('banner');
    el.classList.remove('welcome');
    el.classList.add('rank');
    el.style.color = '';
    el.innerHTML = intro
      ? `🔥 New in town: Mags's Smokehouse<small>Smoke your spare fish beside the Lucky Wheel: sell them or snack on them</small>`
      : `🔥 Smokehouse: ${st.name}<small>${st.id === 'smallfry' ? `Mags left you ${FREE_FISH} smoked fish to try. ` : st.id === 'giants' ? 'Mags cooked you a Fish Cakes to try. ' : ''}${st.line}</small>`;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => el.classList.add('hidden'), 5200);
    audio.jingle('rare');
  }

  /** What the Smokehouse is for, at the top of every tab. */
  private smokeIntroHtml(): string {
    return `<div class="smoke-intro"><b>🔥 Smoke fish to sell or snack on, cook them into dishes.</b> A snack gives ${SNACK_MINUTES} minutes of ⭐ more XP or 💰 more coins on every catch; a dish gives several at once, stronger and longer.<span><i class="soon">Coming soon</i> Spices for Captain Reed's deep-sea dives.</span></div>`;
  }

  private smokeHtml(): string {
    const intro = this.smokeIntroHtml();
    if (this.smokeTab === 'pantry') return `<div class="cols"><div class="main">${intro}${this.pantryHtml(true)}</div>${this.pantryDetail()}</div>`;
    if (this.smokeTab === 'kitchen') return `<div class="cols"><div class="main">${intro}${this.kitchenHtml()}</div>${this.kitchenDetail()}</div>`;
    const s = this.s;
    const now = this.net.now();
    const busy = s.smoke.spots.filter(Boolean).length;
    const n = smoke.smokeAllSlots(s).length;
    const all = this.btn(n ? `🔥 Smoke all · ${n} fish` : 'Smoke all', 'data-act="smokeall"', n ? 'gold' : 'plain', !n);
    return `<div class="cols"><div class="main">
        ${intro}
        <div class="smoker-h"><h4>Smoker · ${busy} of ${SMOKER_SPOTS} in use</h4>${all}</div>
        <div class="spots">${s.smoke.spots.map((sp) => this.spotCard(sp, now)).join('')}</div>
        <p class="foot">Click a fish in your hotbar to put it on the smoker, or Smoke all (it skips shinies). Smoked fish go to your Pantry, even while you're away.</p>
      </div>${this.smokerDetail()}</div>`;
  }

  private spotCard(sp: SaveData['smoke']['spots'][number], now: number): string {
    if (!sp) return `<div class="spot"><span class="ic">🪵</span><b>Empty</b><span>Click a hotbar fish</span></div>`;
    const f = byId(FISH, sp.fish.fishId);
    const from = sp.doneAt - smokeSeconds(f.tier) * 1000;
    const done = sp.doneAt <= now;
    const left = done ? 'Done!' : `<span data-until="${sp.doneAt}">${clock(sp.doneAt - now)}</span>`;
    const bar = `<div class="meter"><i ${done ? '' : `data-from="${from}" data-to="${sp.doneAt}" `}style="width:${Math.round(Math.min(1, Math.max(0.06, (now - from) / (sp.doneAt - from))) * 100)}%"></i></div>`;
    return `<div class="spot on" style="--c:var(--t${f.tier})"><span class="ic">${fishIcon(f.id, { shiny: sp.fish.shiny })}</span><b>${sp.fish.shiny ? '✨ ' : ''}${f.name}</b><span>${left}</span>${bar}</div>`;
  }

  /** The smoker's detail pane: times and what each tier's smoked fish does, with locked stages showing their goal. */
  private smokerDetail(): string {
    const s = this.s;
    const rows = [1, 2, 3, 4, 5].map((t) => {
      const st = STAGES.find((x) => x.tiers.includes(t))!;
      // Jewels & Spirits opens with tier 4; a tier 5 row still waits for a tier 5 catch.
      const caught = t < 5 || smoke.reachedTier(s, 5);
      const open = smoke.stageOpen(s, st) && caught;
      const d = SNACKS[t];
      const does = !open ? `🔒 ${caught ? st.goal : 'Catch a tier 5 fish'}` : d ? `${BUFF_ICON[d.kind]} +${Math.round(d.bonus * 100)}% ${d.kind === 'xp' ? 'XP' : 'coins'}${t <= SELL_TIER ? ` · sells ${SMOKED_SELL}×` : ''}` : '✨ For dishes';
      return `<div class="trow${open ? '' : ' locked'}"><span class="tierico" style="--c:var(--t${t})">T${t}</span><span class="tm">${smokeSeconds(t) < 60 ? `${smokeSeconds(t)} s` : `${smokeSeconds(t) / 60} min`}</span><span class="dz">${does}</span></div>`;
    }).join('');
    const n = smoke.smokeAllSlots(s).length;
    return this.detail({
      icon: '🔥',
      name: "Mags's smoker",
      tier: 3,
      color: '#c96a2b',
      badge: `<span class="badge" style="--c:#c96a2b">${SMOKER_SPOTS} spots · one fish each</span>`,
      body: `<div class="lbl">Smoking time and snack, by tier</div><div class="trows">${rows}</div>`,
      note: `Each snack lasts ${SNACK_MINUTES} min of play; more of the same adds time, up to ${SNACK_MAX_MINUTES}. Smoke all skips shinies: they sell for 5×.`,
      actions: this.btn(n ? `🔥 Smoke all · ${n} fish` : 'No fish to smoke', 'data-act="smokeall"', n ? 'gold' : 'plain', !n),
    });
  }

  /** "⭐ +50% XP · 💰 +30% coins · ✨ ×1.5 shinies" */
  private buffsText(b: Record<BuffKind, number>): string {
    const pct = (x: number) => `+${Math.round(x * 100)}%`;
    return [b.xp > 0 && `⭐ ${pct(b.xp)} XP`, b.coins > 0 && `💰 ${pct(b.coins)} coins`, b.shiny > 0 && `✨ ×${+(1 + b.shiny).toFixed(2)} shinies`].filter(Boolean).join(' · ');
  }


  /** "2× T1, 1× T3" */
  private needText(short: number[]): string {
    return short.flatMap((n, i) => (n ? [`${n}× T${i + 1}`] : [])).join(', ');
  }

  /** The Kitchen pick: the dish picked, else the first one unlocked. */
  private kitchenPick(): Dish {
    return dishById(this.pick.dish) ?? DISHES.find((d) => smoke.dishOpen(this.s, d)) ?? DISHES[0];
  }

  private kitchenHtml(): string {
    const s = this.s;
    if (!smoke.kitchenOpen(s)) return `<div class="spot-note">🔒 <b>The Kitchen opens when you catch a tier 3 fish.</b> Mags cooks smoked fish into dishes that give several buffs at once.</div>`;
    const pick = this.kitchenPick();
    const rows = DISHES.map((d) => {
      const open = smoke.dishOpen(s, d);
      const short = smoke.shortfall(s, d);
      const b = smoke.dishBuffs(d);
      const n = s.smoke.cooked.filter((c) => c.id === d.id).reduce((a, c) => a + c.n, 0);
      const status = !open ? '' : short.some(Boolean) ? `<span class="need">Needs ${this.needText(short)}</span>` : '<span class="ready">Ready to cook</span>';
      const tag = `<button class="pk" data-pick="dish" data-id="${d.id}"><span class="ico dico">${d.icon}</span><span class="txt"><b>${d.name}${n ? ` · ${n} in your Pantry` : ''}</b><small>${open ? `${this.buffsText(b)} · ${this.mins(b.ms)}` : `🔒 ${smoke.dishGoal(s, d)}`}</small></span></button>`;
      return `<div class="prow${pick.id === d.id ? ' sel' : ''}${open ? '' : ' locked'}" style="--c:var(--t${smoke.topTier(d)})">${tag}<span class="pbtns">${status}</span></div>`;
    }).join('');
    return `<h4 class="perks-h">Dishes</h4><div class="prows">${rows}</div><p class="foot">Any smoked fish of the right tier goes in, the cheapest first. A dish runs beside your snack: if both give the same buff, the stronger counts.</p>`;
  }

  private kitchenDetail(): string {
    const s = this.s;
    if (!smoke.kitchenOpen(s))
      return this.detail({
        icon: '🔒',
        name: 'Kitchen',
        tier: 3,
        badge: `<span class="badge" style="--c:var(--t3)">Catch a tier 3 fish</span>`,
        body: '<div class="have">A dish combines its fish\'s buffs, stronger and longer than a snack.</div>',
        note: 'Dishes cook instantly from smoked fish in your Pantry.',
        actions: '',
      });
    const d = this.kitchenPick();
    const open = smoke.dishOpen(s, d);
    const b = smoke.dishBuffs(d);
    const short = smoke.shortfall(s, d);
    const ing = d.needs.map((n, i) => {
      if (!n) return '';
      const have = smoke.tierCount(s, i + 1);
      return `<span class="${have >= n ? 'ok' : 'miss'}" style="--c:var(--t${i + 1})" data-tip="Smoked tier ${i + 1} fish">T${i + 1} · ${Math.min(have, n)}/${n}${have >= n ? ' ✓' : ''}</span>`;
    }).join('');
    const snacks = d.needs.flatMap((n, i) => {
      const sn = SNACKS[i + 1];
      return n && sn ? [`${BUFF_ICON[sn.kind]} +${Math.round(sn.bonus * 100)}% · ${n * SNACK_MINUTES} min`] : [];
    });
    const compare = `<div class="rule">As snacks, one at a time: ${snacks.join(', ')}${d.needs[3] || d.needs[4] ? '. ✨ only in dishes' : ''}.</div>`;
    const can = open && !short.some(Boolean);
    const label = !open ? `🔒 ${smoke.dishGoal(s, d)}` : short.some(Boolean) ? `Needs ${this.needText(short)}` : `${d.icon} Cook`;
    const n = smoke.cookedCount(s, d.id);
    return this.detail({
      icon: d.icon,
      name: d.name,
      tier: smoke.topTier(d),
      badge: `<span class="badge" style="--c:var(--t${smoke.topTier(d)})">${smoke.fishIn(d)} smoked fish · ${this.mins(b.ms)}</span>`,
      body: `<div class="have">${this.buffsText(b)}</div>${compare}<div class="lbl">Smoked fish · any species</div><div class="ingr">${ing}</div>`,
      note: `${n ? `You have ${n}. ` : ''}Cooking is instant: eat it from the Pantry or your Bag. The same dish again adds its time, up to ${DISH_MAX_MINUTES} min.`,
      actions: this.btn(label, `data-act="cook" data-id="${d.id}"`, can ? 'gold' : 'plain', !can),
    });
  }

  private cook(id: DishId): void {
    if (!this.net.connected) return this.toast('The Smokehouse needs a server connection.');
    const why = smoke.cook(this.s, id);
    if (why) return this.toast(why);
    this.smokeSend({ t: 'cook', id });
    this.toast(`${dishById(id)!.icon} ${dishById(id)!.name} cooked: it's in your Pantry.`);
    audio.jingle('rare');
    this.smokeChanged();
  }

  /** Eats a cooked dish. Replacing a different dish with over a minute left asks first. */
  private eatDish(key: string, sure = false): void {
    if (this.map.casino) return this.toast('Save it for the pond.');
    if (!this.net.connected) return this.toast('The Smokehouse needs a server connection.');
    const d = dishById(key);
    if (!d) return;
    if (!sure && smoke.wouldReplaceDish(this.s, d.id)) {
      this.confirmDish = key;
      this.pick.smoke = key;
      return this.renderMenu();
    }
    this.confirmDish = null;
    const why = smoke.eatDish(this.s, d.id);
    if (why) return this.toast(why);
    this.smokeSend({ t: 'eatdish', id: d.id });
    const cur = smoke.dish(this.s)!;
    this.toast(`${d.icon} ${this.buffsText(cur)} · ${clock(cur.ms)} left (${d.name})`);
    this.smokeChanged();
  }

  /** Eat, saying how much time it adds. */
  private eatDishBtn(id: DishId): string {
    const plan = smoke.dishPlan(this.s, id);
    if (typeof plan === 'string') return this.btn(`${DISH_MAX_MINUTES} min max`, 'data-act="locked"', 'plain', true);
    const tip = plan.from ? `${clock(plan.from)} → ${clock(plan.ms)}` : `${this.mins(plan.ms)} of play`;
    return this.btn(`Eat · ${plan.from ? '+' : ''}${this.mins(plan.ms - plan.from)}`, `data-act="eatdish" data-id="${id}" data-tip="${this.esc(tip)}"`);
  }

  /** The dish rule in plain words, with what eating one now would do to the clock. */
  private dishRule(id: DishId): string {
    const plan = smoke.dishPlan(this.s, id);
    const now = typeof plan === 'string' ? plan
      : plan.from ? `Now: <b>${clock(plan.from)}</b> left → <b>${clock(plan.ms)}</b> after eating one.`
      : smoke.dish(this.s) ? 'Eating one replaces your current dish.' : '';
    return `<div class="rule">The same dish again adds its time, up to <b>${DISH_MAX_MINUTES} min</b>. ${now}</div>`;
  }

  private dishDetail(id: DishId): string {
    const d = dishById(id)!;
    const b = smoke.dishBuffs(d);
    const key = id;
    const c = this.confirmDish === key ? smoke.dish(this.s) : null;
    return this.detail({
      icon: d.icon,
      name: d.name,
      tier: smoke.topTier(d),
      badge: `<span class="badge" style="--c:var(--t${smoke.topTier(d)})">${smoke.cookedCount(this.s, id)} in your Pantry</span>`,
      body: `<div class="have">${this.buffsText(b)} on every catch for ${this.mins(b.ms)} of play</div>${this.dishRule(id)}${c ? `<div class="confirm">Replace your ${c.name} (<b data-until="${this.net.now() + c.ms}">${clock(c.ms)}</b> left)?</div>` : ''}`,
      note: 'One dish at a time, beside your snack: if both give the same buff, the stronger counts.',
      actions: c
        ? this.btn('Replace', `data-act="eatdishsure" data-id="${key}"`, 'bad') + this.btn('Keep', 'data-act="eatdishkeep"', 'plain')
        : `<div class="btnrow">${this.eatDishBtn(id)}</div>`,
    });
  }

  /** The Pantry pick: the dish or fish picked, else the first one in the Pantry. */
  private pantryPick(): string | null {
    const ids = [...this.s.smoke.cooked.map((c) => c.id), ...this.pantryIds()];
    return ids.includes(this.pick.smoke ?? '') ? this.pick.smoke! : ids[0] ?? null;
  }

  /** Species in the Pantry, lowest tier first. */
  private pantryIds(): string[] {
    return Object.keys(this.s.smoke.pantry).filter((id) => smoke.pantryCount(this.s, id) > 0).sort((a, b) => byId(FISH, a).tier - byId(FISH, b).tier);
  }

  /** The snack rule in plain words, with what eating one now would do to the clock. */
  private snackRule(id: string): string {
    const fx = this.snackEffect(id);
    const plan = smoke.eatPlan(this.s, id);
    const now = typeof plan === 'string' ? plan
      : plan.from ? `Now: <b>${clock(plan.from)}</b> left → <b>${clock(plan.ms)}</b> after eating one.`
      : smoke.snack(this.s) ? `Eating one replaces your current snack.` : '';
    return `<div class="rule">Eating more doesn't make it stronger: each one adds <b>${SNACK_MINUTES} min</b> of ${fx}, up to <b>${SNACK_MAX_MINUTES} min</b>. ${now}</div>`;
  }

  private pantryDetail(): string {
    const s = this.s;
    const id = this.pantryPick();
    if (!id) return this.detail({ icon: '🧺', name: 'Your Pantry', tier: 3, badge: `<span class="badge" style="--c:var(--t3)">Kept in your save</span>`, body: '', note: 'Smoked fish and cooked dishes wait here. Put fish on the smoker from your hotbar.', actions: '' });
    const dsh = dishById(id);
    if (dsh) return this.dishDetail(dsh.id);
    const f = byId(FISH, id);
    const n = smoke.pantryCount(s, id);
    const snackable = !!smoke.snackFor(id);
    const c = this.confirmEat?.id === id ? smoke.snack(s) : null;
    const confirm = c
      ? `<div class="confirm">Replace your Smoked ${byId(FISH, c.fishId).name} (<b data-until="${this.net.now() + c.ms}">${clock(c.ms)}</b> left)?</div>`
      : '';
    const actions = c
      ? this.btn('Replace', `data-act="eatsure" data-id="${id}"`, 'bad') + this.btn('Keep', 'data-act="eatkeep"', 'plain')
      : (snackable ? `<div class="btnrow">${this.eatBtns(id)}</div>` : '') + (smoke.sellable(id) ? `<div class="btnrow">${this.sellBtns(id)}</div>` : '');
    return this.detail({
      icon: fishIcon(id),
      name: `Smoked ${f.name}`,
      tier: f.tier,
      body: `<div class="have">You have <b>${n}</b> · eaten: <b>${this.snackEffect(id)}</b>${snackable ? ` on every catch for ${SNACK_MINUTES} min of play` : ''}</div>${snackable ? this.snackRule(id) : ''}${confirm}`,
      note: snackable
        ? `One snack at a time: a different one replaces it.${smoke.sellable(id) ? ` Mags pays ${SMOKED_SELL}× the raw price; Sell 1 sells your best one.` : ''}`
        : 'Smoked jewels and spirits are too good for a snack. Keep them for the Kitchen.',
      actions,
    });
  }

  /** The snack being eaten and the Pantry's smoked fish. Shown at the Smokehouse (`counter`, which can sell) and in the Bag. */
  private pantryHtml(counter = false): string {
    const s = this.s;
    const sn = smoke.snack(s);
    const now = this.net.now();
    const eating = sn
      ? `<div class="perks"><div class="perk"><span class="ic">${BUFF_ICON[sn.kind]}</span><b>Smoked ${byId(FISH, sn.fishId).name} · ${this.snackEffect(sn.fishId)}</b><span class="left" data-until="${now + sn.ms}">${clock(sn.ms)}</span></div></div>`
      : '';
    const pick = counter ? this.pantryPick() : null;
    const d = smoke.dish(s);
    const eatingDish = d
      ? `<div class="perks"><div class="perk"><span class="ic">${dishById(d.id)!.icon}</span><b>${d.name} · ${this.buffsText(d)}</b><span class="left" data-until="${now + d.ms}">${clock(d.ms)}</span></div></div>`
      : '';
    const dishRows = s.smoke.cooked.map((c) => {
      const dd = dishById(c.id)!;
      const b = smoke.dishBuffs(dd);
      const key = c.id;
      const btns = !counter && this.confirmDish === key && d
        ? `<span class="ask">Replace ${d.name}?</span>${this.btn('Replace', `data-act="eatdishsure" data-id="${key}"`, 'bad')}${this.btn('Keep', 'data-act="eatdishkeep"', 'plain')}`
        : this.eatDishBtn(c.id);
      const tag = `<button class="pk" ${counter ? `data-pick="smoke" data-id="${key}"` : 'data-act="locked"'}><span class="ico dico">${dd.icon}</span><span class="txt"><b>${dd.name} ×${c.n}</b><small>${this.buffsText(b)} · ${this.mins(b.ms)}</small></span></button>`;
      return `<div class="prow${pick === key ? ' sel' : ''}" style="--c:var(--t${smoke.topTier(dd)})">${tag}<span class="pbtns">${btns}</span></div>`;
    }).join('');
    const rows = dishRows + this.pantryIds().map((id) => {
      const f = byId(FISH, id);
      const n = smoke.pantryCount(s, id);
      const snackable = !!smoke.snackFor(id);
      const ask = !counter && this.confirmEat?.id === id && sn;
      const btns = ask
        ? `<span class="ask">Replace ${byId(FISH, sn.fishId).name}?</span>${this.btn('Replace', `data-act="eatsure" data-id="${id}"`, 'bad')}${this.btn('Keep', 'data-act="eatkeep"', 'plain')}`
        : (snackable ? this.eatBtns(id) : '') + (counter ? this.sellBtns(id) : '');
      const tag = `<button class="pk" ${counter ? `data-pick="smoke" data-id="${id}"` : 'data-act="locked"'}><span class="ico">${fishIcon(id)}</span><span class="txt"><b>Smoked ${f.name} ×${n}</b><small>${snackable ? `${this.snackEffect(id)} · each adds ${SNACK_MINUTES} min, up to ${SNACK_MAX_MINUTES}` : '✨ For dishes in the Kitchen'}</small></span></button>`;
      return `<div class="prow${pick === id ? ' sel' : ''}" style="--c:var(--t${f.tier})">${tag}<span class="pbtns">${btns}</span></div>`;
    }).join('');
    const none = `<p class="empty">Nothing smoked yet. Mags Cinder smokes fish at the Smokehouse, beside the Lucky Wheel${smoke.smokerOpen(s) ? '' : ` (from level ${SMOKE_LEVEL})`}.</p>`;
    const dishH = smoke.kitchenOpen(s) || d ? `<h4 class="perks-h">Dish · ${d ? 'eating one' : 'none right now'}</h4>${eatingDish}` : '';
    return `<h4 class="perks-h">Snack · ${sn ? 'eating one' : 'none right now'}</h4>${eating}${dishH}<h4 class="perks-h">Pantry${counter ? '' : ' · smoked fish and dishes'}</h4>${rows ? `<div class="prows">${rows}</div>` : none}`;
  }

  // ---------- Bag ----------

  private bagHtml(): string {
    const s = this.s;
    const rod = this.rod;
    const bait = this.bait;
    const have = eco.baitCount(s, s.bait);
    const reach = bait.tier;
    let hint: string;
    if (eco.canDig(s)) hint = eco.DIG_HINT;
    else if (have <= 0) hint = 'Your bait slot is empty - equip some below.';
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
      return this.itemTile({ icon: rodIcon(r.tier), name: shortRod(r.name), sub, price: this.rodPrice(r), tier: r.tier, on: sel === `rod:${r.id}`, check: equipped, ghost: !owned, attrs: `data-pick="bag" data-id="rod:${r.id}"` });
    }).join('');
    const baits = BAITS.map((b) => {
      const n = eco.baitCount(s, b.id);
      const equipped = s.bait === b.id && eco.activeSlot(s) >= 0;
      const sub = n > 0 ? `×${n}` : s.level < b.unlockLevel ? `🔒 Lv ${b.unlockLevel}` : `At ${vendor}'s`;
      return this.itemTile({ icon: BAIT_ICON[b.id] ?? '🪱', name: b.name, sub, price: `${this.baitPackPrice(b)} / ${eco.BAIT_PACK}`, tier: b.tier, on: sel === `bait:${b.id}`, check: equipped, ghost: n <= 0, attrs: `data-pick="bag" data-id="bait:${b.id}"` });
    }).join('');

    return `<div class="cols"><div class="main">
        <p class="goal">🎯 Next: ${nextGoal(s.level, s.dex)}</p>
        <h4>Your setup</h4>
        <div class="setup"><span class="big">${rodIcon(rod.tier)}</span><span class="plus">+</span><span class="big">${BAIT_ICON[bait.id] ?? '🪱'}</span>
          <div class="txt"><b>Catches up to ${tierName(reach)} fish</b><div>${hint}</div></div><div class="pips">${pips}</div></div>
        <h4>Rods</h4><div class="tiles">${rods}</div>
        <h4>Bait</h4><div class="tiles">${baits}</div>
        ${this.perksHtml()}
        ${this.pantryHtml()}
        <p class="foot">Hotbar slot 1 holds the rod you fish with and slot 2 your bait; the rest are for fish. Everything else waits in your tackle locker: pick it here to swap it in.</p>
      </div>${this.bagDetail(sel)}</div>`;
  }

  /** Charms and casino perks that are working for you, and what they add up to. */
  private perksHtml(): string {
    const perks = eco.activePerks(this.s);
    const body = perks.length
      ? `<div class="perks">${perks.map((p) => {
        const inner = `<span class="ic">${p.icon}</span><b>${p.effect}</b>`;
        if (p.id !== 'lure') return `<div class="perk" data-tip="${this.esc(p.name)}">${inner}</div>`;
        // The Shiny Lure switches off to save its charges for a better fish.
        const on = eco.lureOn(this.s);
        return `<button class="perk lure${on ? '' : ' off'}" data-act="lure" data-tip="${p.name} · click to turn ${on ? 'off' : 'on'}">${inner}<span class="sw"></span></button>`;
      }).join('')}</div>`
      : `<p class="empty">None yet. Win chips at Casino Cove and trade them for charms at the Prize Counter.</p>`;
    return `<h4 class="perks-h">Charms &amp; perks · active bonuses</h4>${body}`;
  }

  private bagDetail(sel: string): string {
    const s = this.s;
    const [kind, id] = sel.split(':');
    const vendor = this.map.vendor.name;
    if (kind === 'bait') {
      const b = byId(BAITS, id);
      const n = eco.baitCount(s, b.id);
      const equipped = s.bait === b.id && eco.activeSlot(s) >= 0;
      const lvl = s.level < b.unlockLevel;
      const actions = equipped
        ? this.btn('In your bait slot ✓', '', 'ok', true)
        : n > 0 && !lvl
          ? this.btn('Equip', `data-act="equipbait" data-id="${b.id}"`)
          : this.btn(`${lvl ? `Unlocks at level ${b.unlockLevel}` : `Sold at ${vendor}'s`} · ${this.baitPackPrice(b)} / ${eco.BAIT_PACK}`, '', 'plain', true);
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
    const actions = equipped
      ? this.btn('Equipped ✓', '', 'ok', true)
      : owned
        ? this.btn('Equip', `data-act="equiprod" data-id="${r.id}"`)
        : this.btn(`${s.level < r.unlockLevel ? `Unlocks at level ${r.unlockLevel}` : `Sold at ${vendor}'s`} · ${this.rodPrice(r)}`, '', 'plain', true);
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

  /** The title picker: None, the titles earned, and the ranks still ahead greyed with their level. */
  private titlesHtml(): string {
    const worn = this.s.title;
    const chip = (label: string, on: boolean, attrs: string, extra = '') => `<button class="ttl-chip${on ? ' on' : ''}${extra}" ${attrs}>${label}</button>`;
    const chips = TITLES.map((t) => {
      if (this.s.titles.includes(t.id)) return chip(t.name, worn === t.id, `data-act="title" data-id="${worn === t.id ? '' : t.id}" data-tip="${worn === t.id ? 'Click to take off' : 'Click to wear'}"`);
      const lv = RANKS.find((r) => r.id === t.id)?.level;
      return chip(`${t.name} <small>🔒 Level ${lv}</small>`, false, 'data-act="locked"', ' locked');
    });
    return `<div class="titles">${chip('None', !worn, `data-act="title" data-id=""`)}${chips.join('')}</div>`;
  }

  private wardrobeHtml(): string {
    const sections = COS_SLOTS.map((slot) => {
      const worn = this.s.look[slot];
      const cards = COSMETICS.filter((c) => c.slot === slot && this.s.owned.includes(c.id))
        .sort((a, b) => a.tier - b.tier)
        .map((c) => {
          const on = worn === c.id;
          return this.itemTile({ ...this.cosLook(c), name: c.name, sub: on ? 'Wearing' : COS_RARITY[c.tier], tier: c.tier + 1, on, check: on, attrs: `data-act="equip" data-slot="${slot}" data-id="${on ? '' : c.id}" data-try="${slot}:${c.id}"`, tip: on ? 'Click to take off' : 'Click to wear' });
        })
        .join('');
      // Rank rewards not earned yet, greyed with their level; hovering still tries them on.
      const locked = COSMETICS.filter((c) => c.slot === slot && c.shop === 'earned' && !this.s.owned.includes(c.id))
        .sort((a, b) => a.level! - b.level!)
        .map((c) => this.itemTile({ ...this.cosLook(c), name: c.name, sub: `🔒 Level ${c.level}`, tier: c.tier + 1, ghost: true, attrs: `data-act="locked" data-try="${slot}:${c.id}"` }))
        .join('');
      const title = this.slotTitle(slot);
      return `<h4>${title}</h4><div class="tiles">${cards + locked || `<p class="empty">Nothing yet - ${this.map.vendor.name}'s stall sells ${title.toLowerCase()}.</p>`}</div>`;
    }).join('');
    return `<div class="cols wardrobe"><div class="side"><div id="pv-slot"></div><p class="drag-hint">Drag to turn</p><h4>Colour</h4><div class="swatches">${this.swatchHtml()}</div></div>
      <div class="main"><h4>Face</h4><div class="faces">${this.facesHtml()}</div><h4>Title</h4>${this.titlesHtml()}${sections}</div></div>`;
  }

  // ---------- Casino poster ----------

  private peekHtml(): string {
    const left = CASINO_LEVEL - this.s.level;
    const status = left > 0
      ? `<p class="peek-lock">🔒 Opens at level ${CASINO_LEVEL} · <b>${left}</b> level${left === 1 ? '' : 's'} to go</p>`
      : `<p class="peek-open">✔ You're in! Walk through the gate.</p>`;
    return `<div class="peek"><img src="${casinoPreview}" alt="Inside Casino Cove">
      <div class="peek-text"><h3>Bet your best fish, win big</h3>
        <p>Inside the Gilded Perch Casino you can put a fish on the roulette wheel or a hand of blackjack to multiply its value, then trade your winners for chips at the Prize Counter.</p>
        <p>Chips buy unlocks you can't get anywhere else: Lucky Charms, Quick-Reel Gloves, the Night Owl Lantern, a Tackle Vest, Shiny Lures and a rack of high-roller outfits.</p>
        ${status}</div></div>`;
  }

  // ---------- Fishdex ----------

  private dexHtml(): string {
    // Completion counts the pond and lake species only: the Sea page below is extra, so no one is suddenly incomplete.
    const found = POND_FISH.filter((f) => this.s.dex[f.id]).length;
    const card = (f: (typeof FISH)[number]) => {
      const e = this.s.dex[f.id];
      const moon = f.night ? '<span class="moon" title="Only bites at night">🌙</span>' : '';
      const size = `${f.minSize}-${f.maxSize} cm`;
      if (e) return `<div class="fish" style="--c:var(--t${f.sea ? 3 : f.tier})">${moon}${fishIcon(f.id)}<b>${f.name}</b><p>${FISH_BLURB[f.id] ?? ''}</p><span>Caught ${e.count} · best ${e.best} cm</span></div>`;
      if (f.sea) return `<div class="fish unknown" style="--c:var(--t3)">${fishIcon(f.id, { hidden: true })}<b>???</b><p>${size}</p><span>Out at sea, off the ${f.locations[0] === 'shelf' ? 'Shelf' : 'Drop-off'}</span></div>`;
      const rodName = shortRod(RODS.find((r) => r.tier === f.tier)!.name);
      const baitName = BAITS.find((b) => b.tier === f.tier)!.name;
      return `<div class="fish unknown" style="--c:var(--t${f.tier})">${moon}${fishIcon(f.id, { hidden: true })}<b>???</b><p>${size}${f.night ? ' · bites at night' : ''}</p><span>Try a ${rodName} rod with ${baitName}</span></div>`;
    };
    // One section per tier, under its theme name, so the ladder from Shallows to Spirit fish reads at a glance.
    const sections = TIER_THEME.map((theme, i) => {
      const fish = POND_FISH.filter((f) => f.tier === i + 1);
      const got = fish.filter((f) => this.s.dex[f.id]).length;
      return `<h4 class="dex-tier"><span class="badge" style="--c:var(--t${i + 1})">Tier ${i + 1} · ${tierName(i + 1)}</span> ${theme}<small>${got} / ${fish.length}</small></h4><div class="dex">${fish.map(card).join('')}</div>`;
    }).join('');
    const sea = SEA_FISH.filter((f) => this.s.dex[f.id]).length;
    const seaPage = `<h4 class="dex-tier"><span class="badge" style="--c:var(--t3)">Sea</span> ${SEA_THEME}<small>${sea} / ${SEA_FISH.length}</small></h4><div class="dex">${SEA_FISH.map(card).join('')}</div>`;
    return `<div class="dex-head"><b>${found} / ${POND_FISH.length}</b> species discovered<div class="meter big"><i style="width:${(found / POND_FISH.length) * 100}%;--c:var(--gold)"></i></div></div>${sections}${seaPage}`;
  }

  // ---------- Anglers ----------

  private heart(name: string): string {
    return this.net.isSupporter(name) ? '<span class="sup" title="Lakeside supporter">💗</span>' : '';
  }

  private playersHtml(): string {
    const rows = this.leaders()
      .map(
        (p, i) =>
          `<div class="angler${p.me ? ' me' : ''}"><span class="rank">${i === 0 ? '👑' : i + 1}</span><img src="${this.faceSrc(p.face)}" alt="" style="box-shadow:0 0 0 3px #${p.color.toString(16).padStart(6, '0')}"><div class="who2"><b>${escapeHtml(p.name)}${this.heart(p.name)}${p.me ? ' <span class="you">you</span>' : ''}</b>${p.title ? `<span class="ttl">${p.title}</span>` : ''}</div><span class="lv">Lv ${p.level}</span></div>`,
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
        return `<div class="angler top${me ? ' me' : ''}"><span class="rank">${i === 0 ? '🏆' : i + 1}</span><span class="tfish" style="--c:var(--t${Math.max(1, a.tier)})">${f ? fishIcon(f.id, { shiny: a.shiny }) : ''}</span><div class="who2"><b>${escapeHtml(a.name)}${this.heart(a.name)}</b><span>${a.shiny ? '✨ ' : ''}${a.fish} · Lv ${a.level}</span>${a.title ? `<span class="ttl">${a.title}</span>` : ''}</div><span class="lv val"><span class="coin xs"></span>${a.value.toLocaleString()}</span></div>`;
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
      ['Hold click', 'Reel - when the fish surges, keep the gauge green'], ['1-5 / Scroll', 'Take an item in hand: 1 is your rod, 2 your bait, 3 and up fish'], ['G', 'Drop the item in hand'],
      ['Tab', 'Open your bag'], ['Enter', 'Chat'], ['M', 'Music on / off'], ['Esc', 'Menu / close'],
    ];
    const controls = keys.map(([k, v]) => `<div class="key">${k.split(' / ').map((x) => `<kbd>${x}</kbd>`).join(' ')}</div><div>${v}</div>`).join('');
    const reset = this.confirmReset
      ? `<p>Erase coins, level, gear, fish, Fishdex and cosmetics? Your name, colour and face stay. This can't be undone.</p>${this.btn('Yes, reset my account', 'data-act="resetyes"', 'bad')}${this.btn('Cancel', 'data-act="resetno"', 'plain')}`
      : `<p>Start over from level 1. Your name, colour and face stay.</p>${this.btn('Reset account…', 'data-act="reset"', 'plain')}`;
    return `<div class="cols settings"><div class="main"><h4>Controls</h4><div class="controls">${controls}</div></div>
      <aside class="detail"><h4>Account</h4>${this.accountHtml()}<h4>Sound</h4>${this.btn(audio.music ? '🎵 Music on' : '🔇 Music off', 'data-act="music"', 'plain')}
      <h4>Graphics</h4><p>Lite turns off shadows, grass and flowers and draws fewer pixels. Smoother on phones and older computers.</p>${this.btn(this.world.isLite ? '🍃 Lite graphics' : '🌲 Full graphics', 'data-act="graphics"', 'plain')}${this.feedbackHtml()}${this.supportHtml()}<h4 class="danger-h">Danger zone</h4>${reset}</aside></div>`;
  }

  /** Bug / Idea reports, sent like `/bug` and `/idea` in chat. Collapsed to a button until opened. */
  private feedbackHtml(): string {
    const f = this.fb;
    const head = '<h4>Send feedback</h4>';
    if (!this.net.connected) return `${head}<p>${OFFLINE_MSG}</p>`;
    if (!f.open) return `${head}<p>Found a bug or have an idea? It goes straight to the developer.</p>${this.btn('✉️ Send feedback…', 'data-act="fbopen"', 'plain')}`;
    const kind = (k: FeedbackKind, label: string) => this.btn(label, `data-act="fbkind" data-id="${k}"`, f.kind === k ? 'gold' : 'plain', f.sending);
    const hint = f.kind === 'bug' ? 'What went wrong, and what were you doing?' : 'What would make Lakeside better?';
    const msg = f.msg ? `<p class="fb-msg ${f.state}">${escapeHtml(f.msg)}</p>` : '';
    return `${head}<div class="fb"><div class="fb-kind">${kind('bug', '🐞 Bug')}${kind('idea', '💡 Idea')}</div>
      <textarea id="fb-text" rows="4" maxlength="${FEEDBACK_MAX}" placeholder="${hint}"${f.sending ? ' readonly' : ''}>${escapeHtml(f.text)}</textarea>${msg}
      ${this.btn(f.sending ? 'Sending…' : 'Send', 'data-act="fbsend"', 'ok', f.sending)}${this.btn(f.state === 'sent' ? 'Close' : 'Cancel', 'data-act="fbno"', 'plain')}</div>`;
  }

  /** The pause screen's button: Settings with the feedback form open. */
  /** The welcome's account buttons: Settings with the password or log-out form open. */
  private openAccount(form: 'pass' | 'logout'): void {
    this.acctForm = form;
    this.acctMsg = '';
    this.focusAcct = form === 'pass';
    this.openMenu('settings');
  }

  private openFeedback(): void {
    this.fb.show();
    this.focusFb = true;
    this.openMenu('settings');
  }

  private sendFeedback(): void {
    const cmd = this.fb.submit(this.net.connected);
    if (cmd) {
      this.net.send({ t: 'cmd', text: cmd });
      clearTimeout(this.fbTimer);
      this.fbTimer = window.setTimeout(() => {
        this.fb.giveUp();
        this.renderFeedback();
      }, FEEDBACK_WAIT_MS);
    } else this.focusFb = true;
    this.renderFeedback();
  }

  private renderFeedback(): void {
    if (this.menuOpen && this.tab === 'settings') this.renderMenu();
  }

  /** The tip jar. A tip gives nothing in game, only the 💗 by the player's name. */
  private supportHtml(): string {
    const name = escapeHtml(this.net.name);
    const how = !this.net.connected || !name ? 'Tips never give anything in game.'
      : this.net.isSupporter(this.net.name) ? `💗 ${name} is a supporter. Thank you!`
      : `Write your name (<b>${name}</b>) in the Ko-fi message to get a 💗 by it. Tips never give anything in game.`;
    return `<h4>Support Lakeside</h4><p>Lakeside is free, with no ads, and made by one person. If you enjoy it, you can leave a tip.</p>
      <a class="btn plain" href="${KOFI_URL}" target="_blank" rel="noopener">☕ Tip on Ko-fi</a><p class="foot">${how}</p>`;
  }

  private accountHtml(): string {
    if (!this.net.connected) return '<p>Join the server to set a password for your account.</p>';
    const msg = this.acctMsg ? `<p class="acct-msg">${escapeHtml(this.acctMsg)}</p>` : '';
    if (this.acctForm === 'pass') {
      // The hidden username lets password managers save the pair.
      return `<input type="text" autocomplete="username" value="${escapeHtml(this.net.name)}" hidden>
        <input id="acct-pass" type="password" maxlength="128" autocomplete="new-password" placeholder="New password (6+ characters)">${msg}
        <p>${this.net.hasPass ? 'Every other device is logged out and needs the new password.' : 'Log in on any device with your name and this password.'}</p>
        ${this.btn('Save password', 'data-act="passsave"', 'ok')}${this.btn('Cancel', 'data-act="acctno"', 'plain')}`;
    }
    const name = escapeHtml(this.net.name);
    const cancel = this.btn('Cancel', 'data-act="acctno"', 'plain');
    if (this.acctForm === 'name')
      return `<input id="acct-name" type="text" maxlength="16" autocomplete="off" spellcheck="false" value="${name}" placeholder="New name">${msg}
        <p>Your coins, catches${this.net.hasPass ? ', password' : ''} and everything else stay with you. You can change your name once every 7 days.${this.net.isSupporter(this.net.name) ? '' : ' Ko-fi tips need the new name.'}</p>
        ${this.btn('Save name', 'data-act="namesave"', 'ok')}${cancel}`;
    if (this.acctForm === 'logout' && this.net.hasPass)
      return `<p>Log out on this browser? You'll need your name and password to come back here.</p>${this.btn('Yes, log out', 'data-act="logoutyes"', 'bad')}${cancel}`;
    // Nothing could log back in to an account without a password, so the server deletes it.
    if (this.acctForm === 'logout')
      return `<p class="acct-msg">⚠️ ${name} has no password. Logging out deletes ${name} for good: its coins, level, gear, fish${this.net.isSupporter(this.net.name) ? ', 💗' : ''} and everything else are lost, and anyone can take the name.</p>
        <p>To keep it, set a password first. Then you can log back in any time.</p>
        ${this.btn('Set a password first…', 'data-act="pass"', 'ok')}${this.btn(`Delete ${name} and log out`, 'data-act="logoutyes"', 'bad')}${cancel}`;
    const wait = this.net.renameAt - Date.now();
    const rename = wait > 0 ? `<p class="foot">You can change your name again in ${waitText(wait)}.</p>` : this.btn('Change name…', 'data-act="name"', 'plain');
    const logout = this.btn('Log in as a different account…', 'data-act="logout"', 'plain');
    if (!this.net.hasPass) return `<p>Set a password to play as ${name} on other devices and browsers.</p>${msg}${this.btn('Set a password…', 'data-act="pass"', 'plain')}${rename}${logout}`;
    return `<p>🔒 Password set. Log in on another device with your name and password.</p>${msg}${this.btn('Change password…', 'data-act="pass"', 'plain')}${rename}${logout}`;
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
      const sub = has ? 'Owned' : lvl ? `🔒 Lv ${r.unlockLevel}` : '';
      return this.itemTile({ icon: rodIcon(r.tier), name: shortRod(r.name), sub, price: this.rodPrice(r), tier: r.tier, on: this.pick.gear === `rod:${id}`, check: has, ghost: !has && (lvl || s.coins < r.price), attrs: `data-pick="gear" data-id="rod:${id}"` });
    }).join('');
    const baits = this.map.stock.bait.map((id) => {
      const b = byId(BAITS, id);
      const cost = b.price * eco.BAIT_PACK;
      const lvl = s.level < b.unlockLevel;
      return this.itemTile({ icon: BAIT_ICON[id] ?? '🪱', name: `${b.name} ×${eco.BAIT_PACK}`, sub: lvl ? `🔒 Lv ${b.unlockLevel}` : '', price: this.baitPackPrice(b), tier: b.tier, on: this.pick.gear === `bait:${id}`, ghost: lvl || s.coins < cost, attrs: `data-pick="gear" data-id="bait:${id}"` });
    }).join('');
    return `<div class="cols"><div class="main"><h4>Rods</h4><div class="tiles">${rods}</div><h4>Bait · packs of ${eco.BAIT_PACK}</h4><div class="tiles">${baits}</div>
      <p class="foot">New gear goes to your tackle locker. Equip it from your Bag (<kbd>Tab</kbd>).</p>${eco.canDig(s) ? `<p class="foot">🪱 ${eco.DIG_HINT}</p>` : ''}</div>${this.gearDetail()}</div>`;
  }

  private gearDetail(): string {
    const s = this.s;
    const [kind, id] = this.pick.gear!.split(':');
    if (kind === 'bait') {
      const b = byId(BAITS, id);
      const cost = b.price * eco.BAIT_PACK;
      const lvl = s.level < b.unlockLevel;
      const action = lvl
        ? this.btn(`Unlocks at level ${b.unlockLevel} · ${this.baitPackPrice(b)}`, '', 'plain', true)
        : s.coins < cost
          ? this.btn(`Need ${cost.toLocaleString()} ${COIN}`, '', 'plain', true)
          : this.btn(`Buy ${eco.BAIT_PACK} for ${cost.toLocaleString()} ${COIN}`, `data-act="buybait" data-id="${b.id}"`);
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
        ? this.btn(`Unlocks at level ${r.unlockLevel} · ${this.rodPrice(r)}`, '', 'plain', true)
        : s.coins < r.price
          ? this.btn(`Need ${r.price.toLocaleString()} ${COIN}`, '', 'plain', true)
          : this.btn(r.price ? `Buy for ${r.price.toLocaleString()} ${COIN}` : 'Take it (free)', `data-act="buyrod" data-id="${r.id}"`);
    return this.detail({
      icon: rodIcon(r.tier),
      name: r.name,
      tier: r.tier,
      body: this.meter('Cast reach', `${r.castDistance} m`, r.castDistance / 34, r.tier) + this.meter('Luck', `×${r.luck}`, r.luck / 2.5, r.tier) + this.meter('Easier fights', `×${r.control}`, r.control / 2.2, r.tier),
      note: `Fights with fish up to ${tierName(r.tier)} feel easy.`,
      actions: action,
    });
  }

  private rodPrice(r: Rod): string {
    return r.price ? `${r.price.toLocaleString()} ${COIN}` : 'Free';
  }

  /** What one pack of this bait costs at the stall. */
  private baitPackPrice(b: Bait): string {
    return `${(b.price * eco.BAIT_PACK).toLocaleString()} ${COIN}`;
  }

  private cosmeticsShopHtml(): string {
    return this.cosShopHtml('stall');
  }

  private slotTitle(slot: CosSlot): string {
    return slot === 'jewelry' ? 'Jewelry' : `${slot[0].toUpperCase()}${slot.slice(1)}s`;
  }

  /** Icon, rarity colour and tile classes shared by every cosmetic tile and detail panel. */
  private cosLook(c: Cosmetic): { icon: string; color: string; cls: string } {
    const cls = `${c.tier >= 5 ? ' legend' : c.tier === 4 ? ' mythic' : ''}${c.shop === 'casino' ? ' casino-item' : ''}`;
    return { icon: cosIcon(c.id), color: COS_RARITY_COLOR[c.tier], cls };
  }

  private cosPrice(c: Cosmetic): string {
    return c.shop === 'casino' ? `${c.price.toLocaleString()} chips` : `${c.price.toLocaleString()} ${COIN}`;
  }

  /** The cosmetics for sale at one counter: Marlow's stall (coins) or the casino prize counter (chips). */
  private cosShopHtml(shop: CosShop): string {
    const s = this.s;
    const key = shop === 'casino' ? 'ccos' : 'cos';
    const items = COSMETICS.filter((c) => c.shop === shop);
    const money = shop === 'casino' ? s.chips : s.coins;
    const picked = cosById(this.pick[key]);
    const chosen = picked?.shop === shop ? picked : undefined;
    const sections = COS_SLOTS.map((slot) => {
      const cards = items
        .filter((c) => c.slot === slot)
        .sort((a, b) => a.price - b.price)
        .map((c) => {
          const has = s.owned.includes(c.id);
          const wearing = s.look[slot] === c.id;
          const sub = has ? (wearing ? 'Wearing' : 'Owned') : this.cosPrice(c);
          return this.itemTile({ ...this.cosLook(c), name: c.name, sub, tier: c.tier + 1, on: chosen?.id === c.id, check: has, ghost: !has && money < c.price, attrs: `data-pick="${key}" data-id="${c.id}" data-try="${slot}:${c.id}"` });
        })
        .join('');
      return cards ? `<h4>${this.slotTitle(slot)}</h4><div class="tiles">${cards}</div>` : '';
    }).join('');
    const intro = shop === 'casino' ? '<p class="cos-intro">High-roller outfits sold only here, for chips. Nobody at the pond can sell you these.</p>' : '';
    // Until an item is picked, the preview shows what you're wearing now.
    if (!chosen) {
      const yours = this.detail({
        top: '<div id="pv-slot"></div>',
        icon: '🪞',
        name: 'Your look',
        tier: 1,
        badge: '<span class="badge" style="--c:var(--t1)">Wearing now</span>',
        body: '',
        note: 'Hover any item to try it on. Click one to see its price and buy it.',
        actions: '',
      });
      return `<div class="cols"><div class="main">${intro}${sections}</div>${yours}</div>`;
    }
    const has = s.owned.includes(chosen.id);
    const wearing = s.look[chosen.slot] === chosen.id;
    const action = wearing
      ? this.btn('Take it off', `data-act="equip" data-slot="${chosen.slot}" data-id=""`, 'plain')
      : has
        ? this.btn('Wear it', `data-act="equip" data-slot="${chosen.slot}" data-id="${chosen.id}"`, 'ok')
        : money < chosen.price
          ? this.btn(`Need ${this.cosPrice(chosen)}`, '', 'plain', true)
          : this.btn(`Buy for ${this.cosPrice(chosen)}`, `data-act="buycos" data-id="${chosen.id}"`);
    const look = this.cosLook(chosen);
    const slotName = chosen.slot === 'jewelry' ? 'Jewelry' : chosen.slot[0].toUpperCase() + chosen.slot.slice(1);
    const where = shop === 'casino' ? ' · Casino exclusive' : '';
    const detail = this.detail({
      top: '<div id="pv-slot"></div>',
      icon: look.icon,
      name: chosen.name,
      tier: chosen.tier + 1,
      color: look.color,
      cls: look.cls,
      badge: `<span class="badge" style="--c:${look.color}">${slotName} · ${COS_RARITY[chosen.tier]}${where}</span>`,
      body: '',
      note: `${chosen.blurb} ${has ? (wearing ? 'You are wearing it.' : 'Yours to wear any time from the Wardrobe.') : 'Hover any item to try it on.'}`,
      actions: action,
    });
    return `<div class="cols"><div class="main">${intro}${sections}</div>${detail}</div>`;
  }

  /** Bottom strip in the shop and at the prize counter: how to sell or turn in fish. */
  private sellStrip(): string {
    const fish = this.s.slots.filter((x): x is Extract<SaveData['slots'][number], { k: 'fish' }> => x?.k === 'fish');
    if (this.tab === 'casino')
      return `<div class="strip"><span>🐟 <b>Turn in fish:</b> click one in your hotbar below. 1 chip for every ${CHIP_COINS.toLocaleString()} ${COIN} of fish value.</span></div>`;
    const total = fish.reduce((a, f) => a + eco.sellPrice(this.s, f), 0);
    const all = fish.length ? this.btn(`Sell all ${fish.length} · ${total.toLocaleString()} ${COIN}`, 'data-act="sellall"', 'ok') : '';
    return `<div class="strip"><span>🐟 <b>Sell fish:</b> click one in your hotbar below${fish.length ? '' : ' (you have none right now)'}.</span>${all}</div>`;
  }
}

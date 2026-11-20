import * as THREE from 'three';
import { FISH } from '../data/content';
import { COSMETICS, defaultLook } from '../data/cosmetics';
import { atMaxRank, titleName } from '../data/ranks';
import { placeOf, type Activity, type PlayerInfo } from '../net/protocol';
import { drawAnchor } from './anchor';
import { bubbleMs, wrapBubble } from './bubbletext';
import { Character } from './character';
import { SIT, SKIP_THROW, type EmoteDef } from '../data/emotes';
import { EmotePlayer } from './emotes/player';
import type { SeatCtx } from './emotes/types';
import { standHeight } from './env';
import { Gait, gaitLift, gaitSway } from './gait';
import { animateFish, buildFish, hangFacing, type FishModel } from './fishmodel';
import { remoteHang, remoteScale } from './fishscale';
import { JUMP_TIME, jumpLift } from './player';
import { SHOWN, type WarmShow } from './prewarm';

const UP = new THREE.Vector3(0, 1, 0);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Chat bubbles: how long they take to fade (`bubbleMs` says how long they stay). */
const BUBBLE_FADE_MS = 1000;
/** A bubble's text in canvas pixels: the font, the widest a line gets before the message wraps, a line's height and the padding round the text. */
const BUBBLE_FONT = '600 30px system-ui, sans-serif';
const BUBBLE_TEXT_W = 440;
const BUBBLE_LINE_H = 36;
const BUBBLE_PAD_X = 20;
/** The rounded box round one line of text, and the tail under it. */
const BUBBLE_BOX_H = 52;
const BUBBLE_TAIL_H = 14;
/** Metres per canvas pixel: a little smaller than the name tag's 256 px = 1.4 m. */
const BUBBLE_PX = (1.4 / 256) * 0.8;
/** Bubbles show only to players nearby, fading out between these distances (metres). */
const BUBBLE_NEAR = 15;
const BUBBLE_FAR = 20;
/** ...and fade away when you stand on top of the speaker, so they don't cover your view. */
const BUBBLE_HIDE_IN = 1.2;
const BUBBLE_FULL_AT = 2.5;
/** Heights of the name tag (lower with a title under the name) and of a chat bubble's foot just above it, in metres over the feet. */
const PLATE_Y = 2.25;
const PLATE_TITLED_Y = 2.1625;
const BUBBLE_Y = 2.4625;
/** Room left between the name tag's lower edge and an emote's hands held up over the head, in metres. */
const PLATE_GAP = 0.03;
/** An avatar that walks this far from where its emote began has moved on: the emote ends, even if the word that it ended was lost. */
const EMOTE_DRIFT = 0.3;

class Avatar {
  group = new THREE.Group();
  private tip = new THREE.Object3D();
  private view = new THREE.Vector3();
  private target = new THREE.Vector3();
  private yaw = 0;
  /** Smoothed ground height under the avatar; a jump's lift goes on top. */
  private groundY = 0;
  /** Seconds into a jump, or -1 on the ground. */
  private jumpT = -1;
  private fresh = true;
  private act: Activity | null = null;
  private bobber: THREE.Mesh;
  private line: THREE.Line;
  private held: FishModel | null = null;
  private tipPos = new THREE.Vector3();
  private rod: THREE.Mesh;
  /** The rod and its tip, which bounce and sway with the body's steps. */
  private hand = new THREE.Group();
  /** The walk cycle, from how fast the avatar is drawn moving. */
  private gait = new Gait();
  private char: Character;
  private plate: THREE.Sprite;
  private name: string;
  private sup = false;
  /** At the last rank: the aurora anchor left of the name (and of the 💗). */
  private top = false;
  /** The worn title's display name, or null. */
  private titled: string | null = null;
  private bubble: { sprite: THREE.Sprite; until: number } | null = null;
  private emotes: EmotePlayer;
  /** Where the avatar's player stood when its emote began. */
  private emoteAt = { x: 0, z: 0 };
  /**
   * An emote that came while the avatar was hidden, started when it shows: on arriving on a new map the server
   * tells of the emotes playing there (someone seated) before the save that moves this player there.
   */
  private waiting: { def: EmoteDef; at: { x: number; z: number }; dark: number } | null = null;

  constructor(
    info: PlayerInfo,
    private scene: THREE.Scene,
    private surface: (x: number, z: number) => number,
    /** The seat a player sitting at a spot is on: its height, and its instrument at one of the Great Fire's logs (`Game.seatAt`). */
    private seatAt: (x: number, z: number) => SeatCtx | undefined = () => undefined,
    /** Keeps the fish on the line hidden until its shaders are ready (`World.warmups`). */
    private warm: WarmShow = SHOWN,
  ) {
    const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true });
    this.char = new Character(info.look);
    this.emotes = new EmotePlayer(this.char);
    // The model faces +z; the rod points forward and up from the right hand.
    this.rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.035, 1.6, 6), mat(0x4a3320));
    this.rod.position.set(-0.3, 1.2, 0.55);
    this.rod.rotation.x = 0.9;
    this.tip.position.set(-0.3, 1.2 + 0.8 * Math.cos(0.9), 0.55 + 0.8 * Math.sin(0.9));
    this.name = info.name;
    this.plate = this.nameplate(info.name);
    this.setPlate(info.name, false, atMaxRank(info.level), info.title);
    this.hand.add(this.rod, this.tip);
    this.group.add(this.char.group, this.hand, this.plate);
    this.group.visible = false;

    this.bobber = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(0xe8442f));
    this.bobber.visible = false;
    this.line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }),
    );
    this.line.frustumCulled = false;
    this.line.visible = false;
    scene.add(this.group, this.bobber, this.line);
  }

  private nameplate(name: string): THREE.Sprite {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.plateTexture(name, false, false, null), depthTest: false, transparent: true }));
    s.scale.set(1.4, 0.35, 1);
    s.position.y = PLATE_Y;
    s.renderOrder = 10;
    return s;
  }

  /**
   * The name, with a 💗 in front for a Ko-fi supporter, the aurora anchor in front of that at the last rank, and the
   * worn title in smaller type under it.
   */
  private plateTexture(name: string, sup: boolean, top: boolean, title: string | null): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = title ? 96 : 64;
    const g = c.getContext('2d')!;
    g.font = 'bold 32px system-ui, sans-serif';
    g.textAlign = 'center';
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.strokeText(name, 128, 42);
    g.fillStyle = '#fff';
    g.fillText(name, 128, 42);
    // The marks sit just left of the centred name, so the name doesn't move: the 💗 nearest it, the anchor before that.
    let right = 128 - g.measureText(name).width / 2 - 4;
    if (sup) {
      g.font = '24px system-ui, sans-serif';
      g.textAlign = 'right';
      const x = Math.max(top ? 58 : 30, right);
      g.fillText('💗', x, 40);
      right = x - g.measureText('💗').width - 2;
    }
    if (top) drawAnchor(g, Math.max(2, right - 26), 17, 26);
    if (title) {
      g.font = '600 24px system-ui, sans-serif';
      g.textAlign = 'center';
      g.lineWidth = 5;
      g.strokeText(title, 128, 76);
      g.fillStyle = '#ffd98a';
      g.fillText(title, 128, 76);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Redraws the name tag after a rename, or when the 💗, the anchor or the title changed. The name stays put; the title hangs below it. */
  setPlate(name: string, sup: boolean, top: boolean, titleId: string | null | undefined): void {
    const title = titleName(titleId);
    if (name === this.name && sup === this.sup && top === this.top && title === this.titled) return;
    this.name = name;
    this.sup = sup;
    this.top = top;
    this.titled = title;
    this.plate.material.map?.dispose();
    this.plate.material.map = this.plateTexture(name, sup, top, title);
    this.plate.material.needsUpdate = true;
    this.plate.scale.set(1.4, title ? 0.525 : 0.35, 1);
    this.plate.position.y = title ? PLATE_TITLED_Y : PLATE_Y;
  }

  /**
   * Shows the whole message in a speech bubble above the head, wrapped onto as many lines as it needs; the bubble
   * grows upwards from the name tag. A new line replaces the old one.
   */
  say(text: string): void {
    this.clearBubble();
    const c = document.createElement('canvas');
    const g = c.getContext('2d')!;
    g.font = BUBBLE_FONT;
    const lines = wrapBubble(text, BUBBLE_TEXT_W, (s) => g.measureText(s).width);
    if (!lines.length) return;
    const w = Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width))) + BUBBLE_PAD_X * 2;
    const boxH = BUBBLE_BOX_H + (lines.length - 1) * BUBBLE_LINE_H;
    const h = boxH + BUBBLE_TAIL_H + 6;
    c.width = w;
    c.height = h;
    // Sizing the canvas resets its state.
    g.font = BUBBLE_FONT;
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.beginPath();
    g.roundRect(2, 2, w - 4, boxH, 18);
    g.moveTo(w / 2 - 10, boxH + 2);
    g.lineTo(w / 2, boxH + 2 + BUBBLE_TAIL_H);
    g.lineTo(w / 2 + 10, boxH + 2);
    g.fill();
    g.fillStyle = '#1b2433';
    g.textAlign = 'center';
    lines.forEach((l, i) => g.fillText(l, w / 2, 39 + i * BUBBLE_LINE_H));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    // Hung by its foot, so a taller bubble still sits just above the name tag.
    sprite.center.set(0.5, 0);
    sprite.scale.set(w * BUBBLE_PX, h * BUBBLE_PX, 1);
    sprite.position.y = BUBBLE_Y;
    sprite.renderOrder = 11;
    this.group.add(sprite);
    this.bubble = { sprite, until: performance.now() + bubbleMs(text) };
  }

  private clearBubble(): void {
    if (!this.bubble) return;
    const m = this.bubble.sprite.material;
    m.map?.dispose();
    m.dispose();
    this.group.remove(this.bubble.sprite);
    this.bubble = null;
  }

  jump(): void {
    this.jumpT = 0;
    this.emotes.stop();
  }

  /**
   * Plays an emote on the avatar from its start, or with `null` ends the one playing. `at` is where its player stood
   * as it began, `dark` the night (0 to 1).
   */
  emote(def: EmoteDef | null, at: { x: number; z: number }, dark = 0): void {
    this.waiting = null;
    if (!def) return this.emotes.stop();
    if (!this.group.visible) {
      // A stone's throw isn't kept for later: its stone would be long gone.
      if (def.id !== SKIP_THROW.id) this.waiting = { def, at: { x: at.x, z: at.z }, dark };
      return;
    }
    this.emoteAt = { x: at.x, z: at.z };
    // All that is known of a seated player is that they sit and where, which is enough to tell the seat: how high
    // it is, and at one of the Great Fire's logs the instrument they hold.
    this.emotes.start(def, dark, false, def.id === SIT.id ? this.seatAt(at.x, at.z) : undefined);
  }

  /** Test hook: how much the avatar is walking (0 to 1), and how far its steps lift and lean the body now. */
  stepping(): { moving: number; lift: number; sway: number } {
    return { moving: this.gait.moving, lift: gaitLift(this.gait.phase, this.gait.moving), sway: gaitSway(this.gait.phase, this.gait.moving) };
  }

  /** Test hook: how high the body's lowest point is drawn. */
  footY(): number {
    return this.char.footY();
  }

  /** The id of the emote playing on the avatar, or null. */
  get emoting(): string | null {
    return this.emotes.playing?.id ?? null;
  }

  setLook(look: PlayerInfo['look']): void {
    this.char.set(look);
  }

  setVisible(v: boolean): void {
    const shown = v && !this.group.visible;
    this.group.visible = v;
    if (!v) {
      this.setAct(null);
      this.emotes.clear();
      this.gait.reset();
    } else if (shown) {
      // It appears where its player is now, not gliding (and stepping) over from where it was last drawn.
      this.fresh = true;
      if (this.waiting) {
        const w = this.waiting;
        this.emote(w.def, w.at, w.dark);
      }
    }
  }

  private setAct(act: Activity | null): void {
    if (this.act === act) return;
    this.act = act;
    if (this.held) {
      this.scene.remove(this.held.group);
      this.held = null;
    }
    const cast = act?.a === 'cast';
    // A cast ends an emote, like on the player's own screen.
    if (cast) this.emotes.stop();
    const dangle = act?.a === 'hold' || act?.a === 'carry';
    this.bobber.visible = this.line.visible = cast || dangle;
    if (act?.a === 'cast') this.bobber.position.set(act.x, this.surface(act.x, act.z), act.z);
    if (act?.a === 'hold' || act?.a === 'carry') {
      const f = FISH.find((x) => x.id === act.fish);
      if (f) {
        this.held = buildFish(f.color, false, act.shiny, f.tier, f.id);
        this.held.group.scale.setScalar(remoteScale(act.size, f.tier));
        this.scene.add(this.held.group);
        // Someone else's catch can be a kind of fish not seen yet this visit: no frame waits on its shaders.
        this.warm.show(this.held.group);
      }
      this.bobber.visible = false;
    }
  }

  update(dt: number, t: number, p: PlayerInfo, viewX: number, viewZ: number): void {
    this.target.set(p.x, standHeight(p.x, p.z), p.z);
    if (this.fresh) {
      this.group.position.copy(this.target);
      this.groundY = this.target.y;
      this.yaw = p.yaw;
      this.fresh = false;
    }
    const k = 1 - Math.exp(-dt * 10);
    const { x: fromX, z: fromZ } = this.group.position;
    this.group.position.lerp(this.target, k);
    const speed = dt > 0 ? Math.hypot(this.group.position.x - fromX, this.group.position.z - fromZ) / dt : 0;
    // The jump plays at full height on top of the smoothed ground, not through the lerp, which would flatten it.
    this.groundY += (this.target.y - this.groundY) * k;
    if (this.jumpT >= 0) this.jumpT = this.jumpT + dt >= JUMP_TIME ? -1 : this.jumpT + dt;
    const lift = jumpLift(this.jumpT);
    this.group.position.y = this.groundY + lift;
    const d = Math.atan2(Math.sin(p.yaw - this.yaw), Math.cos(p.yaw - this.yaw));
    this.yaw += d * k;
    // Camera yaw 0 looks along -z, the model's front is +z.
    this.group.rotation.y = this.yaw + Math.PI;
    // The ground is `lift` below the character mid-jump, so a puddle stays on it.
    this.char.tick(t, -lift);
    this.setAct(p.act ?? null);
    // An emote ends when its player walks off. The rod and anything on it are put away while one plays: the looks
    // are whole-body motion, and a stiff rod beside a leaning body would spoil them.
    if (this.emotes.playing && Math.hypot(p.x - this.emoteAt.x, p.z - this.emoteAt.z) > EMOTE_DRIFT) this.emotes.stop();
    const busy = this.emotes.update(dt);
    // Walking bounces and sways the body like the townsfolk's, and the rod with it; the name tag stays level. Not
    // mid-jump or under an emote's own motion.
    this.gait.update(dt, speed, busy || this.jumpT >= 0);
    const stepLift = gaitLift(this.gait.phase, this.gait.moving);
    const stepSway = gaitSway(this.gait.phase, this.gait.moving);
    this.char.step(stepLift, stepSway);
    this.hand.position.y = stepLift;
    this.hand.rotation.z = stepSway;
    // The name tag and a chat bubble rise with a body an emote lifts, so they stay as far over the head as at rest;
    // and over hands an emote holds up over the head, which they'd hide, as they're drawn over everything.
    const plateY = this.titled ? PLATE_TITLED_Y : PLATE_Y;
    const over = this.emotes.over;
    const up = Math.max(this.emotes.lift, over > 0 ? over + PLATE_GAP + this.plate.scale.y / 2 - plateY : 0);
    this.plate.position.y = plateY + up;
    if (this.bubble) this.bubble.sprite.position.y = BUBBLE_Y + up;
    this.rod.visible = !busy;
    if (this.held) this.held.group.visible = !busy && this.warm.isWarm(this.held.group);
    if (busy) this.line.visible = false;
    else if (this.act) this.line.visible = true;
    if (this.bubble) {
      const left = this.bubble.until - performance.now();
      if (left <= 0) this.clearBubble();
      else {
        const d = Math.hypot(this.group.position.x - viewX, this.group.position.z - viewZ);
        const near = clamp01((d - BUBBLE_HIDE_IN) / (BUBBLE_FULL_AT - BUBBLE_HIDE_IN));
        const far = clamp01((BUBBLE_FAR - d) / (BUBBLE_FAR - BUBBLE_NEAR));
        const o = Math.min(left / BUBBLE_FADE_MS, near, far, 1);
        this.bubble.sprite.material.opacity = o;
        this.bubble.sprite.visible = o > 0.01;
      }
    }

    this.group.updateMatrixWorld(true);
    this.tip.getWorldPosition(this.tipPos);
    const a = this.act;
    if (a?.a === 'cast') {
      this.bobber.position.y = this.surface(a.x, a.z) + Math.sin(t * 2 + p.id) * 0.02;
      this.setLine(this.tipPos, this.bobber.position, 0.15);
    } else if ((a?.a === 'hold' || a?.a === 'carry') && this.held) {
      const g = this.held.group;
      const sway = Math.sin(t * 1.7 + p.id) * 0.18;
      const end = new THREE.Vector3(this.tipPos.x + sway, this.tipPos.y - remoteHang(g.scale.x), this.tipPos.z + sway * 0.5);
      hangFacing(g, UP, this.view.set(viewX - end.x, 0, viewZ - end.z));
      g.position.copy(end).addScaledVector(UP, -0.5 * g.scale.x);
      animateFish(this.held, t, 6, 0.25);
      this.setLine(this.tipPos, end, 0);
    }
  }

  private setLine(a: THREE.Vector3, b: THREE.Vector3, sag: number): void {
    const pos = this.line.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, a.x, a.y, a.z);
    pos.setXYZ(1, b.x, b.y - sag, b.z);
    pos.needsUpdate = true;
  }

  dispose(): void {
    this.setAct(null);
    this.emotes.clear();
    this.clearBubble();
    this.scene.remove(this.group, this.bobber, this.line);
    // Free what this avatar owns; the face texture and outfit pieces are shared, so they stay.
    this.plate.material.map?.dispose();
    this.plate.material.dispose();
    for (const o of [this.rod, this.bobber, this.line]) o.geometry.dispose();
    this.char.dispose();
  }
}

/**
 * Runs `f` when the page is idle, with the idle milliseconds left (Safari has no `requestIdleCallback`: soon after,
 * with none to spare).
 */
export const whenIdle = (f: (left: () => number) => void): void => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback((d) => f(() => d.timeRemaining()), { timeout: 3000 });
  else setTimeout(() => f(() => 0), 50);
};

/** Other players in the same map, interpolated between server snapshots. */
export class Avatars {
  private list = new Map<number, Avatar>();
  /** Hidden characters wearing the legend and zone set pieces (`warmLegends`); never drawn and never ticked. */
  private wearers = new THREE.Group();
  /** True while `warmLegends` is still building the stand-ins, before it hands them to `warm`. */
  buildingLegends = false;

  constructor(
    private scene: THREE.Scene,
    private surface: (x: number, z: number) => number,
    /** Whether a player's name gets the supporter 💗. */
    private supporter: (name: string) => boolean = () => false,
    /** The seat a player sitting at a spot is on (`Avatar`). */
    private seatAt: (x: number, z: number) => SeatCtx | undefined = () => undefined,
    /** Keeps each player's fish hidden until its shaders are ready (`Avatar`). */
    private warm: WarmShow = SHOWN,
  ) {
    // A hidden stand-in that never leaves the scene, so `World.prewarm` compiles the avatar shaders
    // before other players show up, and they stay compiled while nobody else is around.
    new Avatar({ id: -1, name: '', map: '', x: 0, z: 0, yaw: 0, look: defaultLook(), coins: 0 }, scene, surface);
    this.wearers.visible = false;
    scene.add(this.wearers);
  }

  /**
   * The sea sets' pieces, the legends' and the zones', are the biggest models (an armor is tens of meshes, with
   * programs no other item uses, like the Twilight jellies' glows), and building one and compiling its shaders the
   * first time someone nearby wore it stalled the game for a few frames. So hidden stand-ins wear every one of them,
   * built in idle moments while the page loads (on the join screen; the biggest piece takes about 13 ms, 35 ms on a
   * slow phone), and then `warm` compiles their shaders and draws them once. They stay in the scene, so each later
   * `World.prewarm` covers them too. Every `legend` and `zone` item is covered, so a new set needs nothing here.
   */
  warmLegends(warm: (o: THREE.Object3D) => void): void {
    const todo = COSMETICS.filter((c) => c.shop === 'legend' || c.shop === 'zone');
    const next = (left: () => number): void => {
      // At least one piece each time, and more while the idle moment lasts or for up to a frame's time (the game
      // draws every frame, so on a slow device idle moments are short and far apart).
      const t0 = performance.now();
      do {
        const c = todo.shift()!;
        try {
          this.wearers.add(new Character({ ...defaultLook(), [c.slot]: c.id }).group);
        } catch (e) {
          // A broken model shouldn't stop the page: it throws again when someone wears it.
          console.warn(`Couldn't build ${c.id}:`, e);
        }
      } while (todo.length && (left() > 15 || performance.now() - t0 < 16));
      if (todo.length) whenIdle(next);
      else {
        this.buildingLegends = false;
        warm(this.wearers);
      }
    };
    this.buildingLegends = todo.length > 0;
    if (todo.length) whenIdle(next);
  }

  /** `place` is where the viewer is (`placeOf`): only players on the same map and dive show. */
  sync(players: Map<number, PlayerInfo>, selfId: number, place: string): void {
    for (const [id, a] of this.list) {
      if (!players.has(id)) {
        a.dispose();
        this.list.delete(id);
      }
    }
    for (const p of players.values()) {
      if (p.id === selfId) continue;
      let a = this.list.get(p.id);
      if (!a) {
        a = new Avatar(p, this.scene, this.surface, this.seatAt, this.warm);
        this.list.set(p.id, a);
      }
      a.setLook(p.look);
      a.setPlate(p.name, this.supporter(p.name), atMaxRank(p.level), p.title);
      a.setVisible(placeOf(p) === place);
    }
  }

  jump(id: number): void {
    const a = this.list.get(id);
    if (a?.group.visible) a.jump();
  }

  say(id: number, text: string): void {
    const a = this.list.get(id);
    if (a?.group.visible) a.say(text);
  }

  /**
   * Player `p` started an emote where they stand (or with `null` ended theirs early); `dark` is the night, 0 to 1.
   * A hidden avatar keeps it until it shows.
   */
  emote(p: PlayerInfo, def: EmoteDef | null, dark: number): void {
    this.list.get(p.id)?.emote(def, p, dark);
  }

  /** The id of the emote playing on player `id`'s avatar, or null. */
  emoting(id: number): string | null {
    return this.list.get(id)?.emoting ?? null;
  }

  /** Test hook: where player `id`'s avatar is drawn, or null while it's hidden. */
  drawnAt(id: number): { x: number; y: number; z: number } | null {
    const a = this.list.get(id);
    if (!a?.group.visible) return null;
    const { x, y, z } = a.group.position;
    return { x, y, z };
  }

  /** Test hook: player `id`'s avatar's walk (`Avatar.stepping`), or null while it's hidden. */
  stepping(id: number): { moving: number; lift: number; sway: number } | null {
    const a = this.list.get(id);
    return a?.group.visible ? a.stepping() : null;
  }

  /** Test hook: how high the lowest point of player `id`'s body is drawn, or null while it's hidden. */
  footY(id: number): number | null {
    const a = this.list.get(id);
    return a?.group.visible ? a.footY() : null;
  }

  /** `viewX`/`viewZ` is the local player, for fading chat bubbles by distance. */
  update(dt: number, t: number, players: Map<number, PlayerInfo>, viewX: number, viewZ: number): void {
    for (const [id, a] of this.list) {
      const p = players.get(id);
      if (p && a.group.visible) a.update(dt, t, p, viewX, viewZ);
    }
  }
}

import * as THREE from 'three';
import { FISH } from '../data/content';
import type { Activity, PlayerInfo } from '../net/protocol';
import { Character } from './character';
import { standHeight } from './env';
import { animateFish, buildFish, hangFacing, type FishModel } from './fishmodel';
import { remoteHang, remoteScale } from './fishscale';

const UP = new THREE.Vector3(0, 1, 0);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Chat bubbles: how long they stay, how long they take to fade, and how much text they show. */
const BUBBLE_MS = 6000;
const BUBBLE_FADE_MS = 1000;
const BUBBLE_CHARS = 40;
/** Bubbles show only to players nearby, fading out between these distances (metres). */
const BUBBLE_NEAR = 15;
const BUBBLE_FAR = 20;
/** ...and fade away when you stand on top of the speaker, so they don't cover your view. */
const BUBBLE_HIDE_IN = 1.2;
const BUBBLE_FULL_AT = 2.5;

class Avatar {
  group = new THREE.Group();
  private tip = new THREE.Object3D();
  private view = new THREE.Vector3();
  private target = new THREE.Vector3();
  private yaw = 0;
  private fresh = true;
  private act: Activity | null = null;
  private bobber: THREE.Mesh;
  private line: THREE.Line;
  private held: FishModel | null = null;
  private tipPos = new THREE.Vector3();
  private rod: THREE.Mesh;
  private char: Character;
  private bubble: { sprite: THREE.Sprite; until: number } | null = null;

  constructor(
    info: PlayerInfo,
    private scene: THREE.Scene,
    private surface: (x: number, z: number) => number,
  ) {
    const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true });
    this.char = new Character(info.look);
    // The model faces +z; the rod points forward and up from the right hand.
    this.rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.035, 1.6, 6), mat(0x4a3320));
    this.rod.position.set(-0.3, 1.2, 0.55);
    this.rod.rotation.x = 0.9;
    this.tip.position.set(-0.3, 1.2 + 0.8 * Math.cos(0.9), 0.55 + 0.8 * Math.sin(0.9));
    this.group.add(this.char.group, this.rod, this.tip, this.nameplate(info.name));
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
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d')!;
    g.font = 'bold 32px system-ui, sans-serif';
    g.textAlign = 'center';
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.strokeText(name, 128, 42);
    g.fillStyle = '#fff';
    g.fillText(name, 128, 42);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(1.4, 0.35, 1);
    s.position.y = 2.25;
    s.renderOrder = 10;
    return s;
  }

  /** Shows a short speech bubble above the head; a new line replaces the old one. */
  say(text: string): void {
    this.clearBubble();
    const shown = text.length > BUBBLE_CHARS ? `${text.slice(0, BUBBLE_CHARS - 1).trimEnd()}…` : text;
    const c = document.createElement('canvas');
    const g = c.getContext('2d')!;
    const font = '600 30px system-ui, sans-serif';
    g.font = font;
    const w = Math.ceil(g.measureText(shown).width) + 40;
    c.width = w;
    c.height = 72;
    g.font = font;
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.beginPath();
    g.roundRect(2, 2, w - 4, 52, 18);
    g.moveTo(w / 2 - 10, 54);
    g.lineTo(w / 2, 68);
    g.lineTo(w / 2 + 10, 54);
    g.fill();
    g.fillStyle = '#1b2433';
    g.textAlign = 'center';
    g.fillText(shown, w / 2, 39);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    // A little smaller than the nameplate's 256 px = 1.4 m, sitting just above it.
    const px = (1.4 / 256) * 0.8;
    sprite.scale.set(w * px, 72 * px, 1);
    sprite.position.y = 2.62;
    sprite.renderOrder = 11;
    this.group.add(sprite);
    this.bubble = { sprite, until: performance.now() + BUBBLE_MS };
  }

  private clearBubble(): void {
    if (!this.bubble) return;
    const m = this.bubble.sprite.material;
    m.map?.dispose();
    m.dispose();
    this.group.remove(this.bubble.sprite);
    this.bubble = null;
  }

  setLook(look: PlayerInfo['look']): void {
    this.char.set(look);
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
    if (!v) this.setAct(null);
  }

  private setAct(act: Activity | null): void {
    if (this.act === act) return;
    this.act = act;
    if (this.held) {
      this.scene.remove(this.held.group);
      this.held = null;
    }
    const cast = act?.a === 'cast';
    const dangle = act?.a === 'hold' || act?.a === 'carry';
    this.bobber.visible = this.line.visible = cast || dangle;
    if (act?.a === 'cast') this.bobber.position.set(act.x, this.surface(act.x, act.z), act.z);
    if (act?.a === 'hold' || act?.a === 'carry') {
      const f = FISH.find((x) => x.id === act.fish);
      if (f) {
        this.held = buildFish(f.color, false, act.shiny, f.tier, f.id);
        this.held.group.scale.setScalar(remoteScale(act.size, f.tier));
        this.scene.add(this.held.group);
      }
      this.bobber.visible = false;
    }
  }

  update(dt: number, t: number, p: PlayerInfo, viewX: number, viewZ: number): void {
    this.target.set(p.x, standHeight(p.x, p.z), p.z);
    if (this.fresh) {
      this.group.position.copy(this.target);
      this.yaw = p.yaw;
      this.fresh = false;
    }
    const k = 1 - Math.exp(-dt * 10);
    this.group.position.lerp(this.target, k);
    const d = Math.atan2(Math.sin(p.yaw - this.yaw), Math.cos(p.yaw - this.yaw));
    this.yaw += d * k;
    // Camera yaw 0 looks along -z, the model's front is +z.
    this.group.rotation.y = this.yaw + Math.PI;
    this.setAct(p.act ?? null);
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
    this.clearBubble();
    this.scene.remove(this.group, this.bobber, this.line);
  }
}

/** Other players in the same map, interpolated between server snapshots. */
export class Avatars {
  private list = new Map<number, Avatar>();

  constructor(
    private scene: THREE.Scene,
    private surface: (x: number, z: number) => number,
  ) {}

  sync(players: Map<number, PlayerInfo>, selfId: number, map: string): void {
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
        a = new Avatar(p, this.scene, this.surface);
        this.list.set(p.id, a);
      }
      a.setLook(p.look);
      a.setVisible(p.map === map);
    }
  }

  say(id: number, text: string): void {
    const a = this.list.get(id);
    if (a?.group.visible) a.say(text);
  }

  /** `viewX`/`viewZ` is the local player, for fading chat bubbles by distance. */
  update(dt: number, t: number, players: Map<number, PlayerInfo>, viewX: number, viewZ: number): void {
    for (const [id, a] of this.list) {
      const p = players.get(id);
      if (p && a.group.visible) a.update(dt, t, p, viewX, viewZ);
    }
  }
}

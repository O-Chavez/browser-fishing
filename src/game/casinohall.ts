import * as THREE from 'three';
import { ROULETTE_POCKETS } from '../data/casino';
import type { MapDef, Spot } from '../data/maps';
import { pocketColor } from './casino';
import { groundHeight } from './env';
import { DARK, WOOD, cyl, mat, rbox, textPlane } from './hub';
import type { Circle } from './player';
import { buildRoom, neonSign } from './casinoroom';

const POCKETS = ROULETTE_POCKETS.red + ROULETTE_POCKETS.black + ROULETTE_POCKETS.green;
const FELT = 0x1f6b43;
const GOLD = 0xe0b441;
const PINK = 0xff4f9a;

function wheelTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const cols = { red: '#c4262e', black: '#1b1b1f', green: '#1f9a4f' };
  for (let i = 0; i < POCKETS; i++) {
    g.beginPath();
    g.moveTo(128, 128);
    g.arc(128, 128, 126, (i / POCKETS) * Math.PI * 2 - Math.PI / 2, ((i + 1) / POCKETS) * Math.PI * 2 - Math.PI / 2);
    g.closePath();
    g.fillStyle = cols[pocketColor(i)];
    g.fill();
  }
  g.beginPath();
  g.arc(128, 128, 38, 0, Math.PI * 2);
  g.fillStyle = '#d9b64a';
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The casino floor: a roulette table with a spinning wheel, a blackjack table and the prize counter. */
export class CasinoHall {
  readonly group = new THREE.Group();
  readonly colliders: Circle[] = [];
  private wheel = new THREE.Group();
  private anim: { from: number; to: number; t0: number; ms: number } | null = null;
  private glow: { m: THREE.MeshBasicMaterial; c: THREE.Color }[] = [];
  private neon = 0;

  constructor(def: NonNullable<MapDef['casino']>) {
    buildRoom(
      {
        group: this.group,
        solid: (c) => this.colliders.push(c),
        glow: (color) => {
          const m = new THREE.MeshBasicMaterial({ color });
          this.glow.push({ m, c: new THREE.Color(color) });
          return m;
        },
      },
      def.hall,
      def.mirror,
    );
    this.buildRoulette(def.roulette);
    this.buildBlackjack(def.blackjack);
    this.buildPrizes(def.prizes);
  }

  private place(obj: THREE.Object3D, s: Spot, r: number): void {
    obj.position.set(s.x, groundHeight(s.x, s.z), s.z);
    obj.rotation.y = s.facing;
    this.group.add(obj);
    this.colliders.push({ x: s.x, z: s.z, r });
  }

  private table(w: number, d: number): THREE.Group {
    const t = new THREE.Group();
    const top = rbox(w, 0.14, d, FELT, 0.05);
    top.position.y = 1.0;
    const rim = rbox(w + 0.3, 0.1, d + 0.3, 0x5a2f1c, 0.04);
    rim.position.y = 0.92;
    const body = rbox(w - 0.3, 0.9, d - 0.3, DARK, 0.04);
    body.position.y = 0.45;
    t.add(rim, top, body);
    return t;
  }

  private neonRing(r: number, y: number, color: number): THREE.Mesh {
    const m = new THREE.MeshBasicMaterial({ color });
    this.glow.push({ m, c: new THREE.Color(color) });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.04, 6, 32).rotateX(Math.PI / 2), m);
    ring.position.y = y;
    return ring;
  }

  private buildRoulette(s: Spot): void {
    const t = this.table(2.8, 2.8);
    const base = cyl(0.95, 1.05, 0.12, 0x5a2f1c, 28);
    base.position.y = 1.12;
    this.wheel.position.y = 1.2;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.88, 38).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: wheelTexture() }));
    const hub = cyl(0.12, 0.16, 0.14, GOLD, 12);
    hub.position.y = 0.06;
    this.wheel.add(disc, hub);
    const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 6), mat(0xffffff, { emissive: new THREE.Color(0xffffff) }));
    pointer.position.set(0, 1.4, -1.0);
    pointer.rotation.x = Math.PI;
    const sign = neonSign('ROULETTE', 3, '#ff4f9a');
    sign.position.set(0, 3.5, 0);
    t.add(base, this.wheel, pointer, this.neonRing(1.4, 0.2, PINK), sign);
    // Betting layout: three coloured patches along the front edge.
    [0xc4262e, 0x1b1b1f, 0x1f9a4f].forEach((c, i) => {
      const p = rbox(0.7, 0.03, 0.5, c, 0.01);
      p.position.set((i - 1) * 0.85, 1.09, 1.0);
      t.add(p);
    });
    this.place(t, s, 1.7);
  }

  private buildBlackjack(s: Spot): void {
    const t = this.table(3.0, 1.9);
    for (let i = 0; i < 3; i++) {
      const spot = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: GOLD }));
      spot.position.set((i - 1) * 0.8, 1.085, 0.35);
      t.add(spot);
    }
    for (let i = 0; i < 2; i++) {
      const card = rbox(0.28, 0.01, 0.4, 0xffffff, 0.005);
      card.position.set(-0.2 + i * 0.35, 1.085, -0.5);
      card.rotation.y = 0.15 * (i ? -1 : 1);
      t.add(card);
    }
    const sign = neonSign('BLACKJACK', 3, '#4fd2ff');
    sign.position.set(0, 3.5, 0);
    t.add(this.neonRing(1.2, 0.2, 0x4fd2ff), sign);
    this.place(t, s, 1.7);
  }

  private buildPrizes(s: Spot): void {
    const g = new THREE.Group();
    const counter = rbox(4.2, 1.05, 1.0, 0x6b2a3a, 0.06);
    counter.position.y = 0.52;
    const top = rbox(4.4, 0.1, 1.2, GOLD, 0.04);
    top.position.y = 1.08;
    g.add(counter, top);
    for (const sx of [-2, 2]) {
      const post = cyl(0.08, 0.08, 3.2, DARK, 8);
      post.position.set(sx, 1.6, -0.45);
      g.add(post);
    }
    const bar = rbox(4.5, 0.12, 0.2, DARK, 0.03);
    bar.position.set(0, 3.2, -0.45);
    g.add(bar);
    const { mesh, ctx, tex } = textPlane(3.8, 0.9, 512);
    ctx.fillStyle = '#2a0f1c';
    ctx.fillRect(0, 0, 512, 121);
    ctx.strokeStyle = '#ffd35a';
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, 500, 109);
    ctx.fillStyle = '#ffd35a';
    ctx.font = '800 58px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎰 PRIZE COUNTER', 256, 64);
    tex.needsUpdate = true;
    mesh.position.set(0, 2.55, -0.3);
    g.add(mesh);
    // Chips on the counter.
    [0xc4262e, 0x2a6fc4, 0x1f9a4f, 0xffffff].forEach((c, i) => {
      for (let k = 0; k < 3 + i; k++) {
        const chip = cyl(0.14, 0.14, 0.04, c, 14);
        chip.position.set(-1.5 + i * 0.35, 1.16 + k * 0.045, 0.1);
        g.add(chip);
      }
    });
    g.add(this.neonRing(2.3, 3.0, 0xffd35a).translateZ(-0.45).translateY(0));
    this.place(g, s, 2.3);
    // The counter is long; block its ends so nobody walks through.
    this.colliders.push({ x: s.x - 1.5, z: s.z, r: 0.9 }, { x: s.x + 1.5, z: s.z, r: 0.9 });
  }

  /** Spins the wheel and lands pocket `i` under the pointer. */
  spin(i: number, ms: number): void {
    const cur = this.wheel.rotation.y;
    const final = ((i + 0.5) / POCKETS) * Math.PI * 2;
    const turns = Math.ceil((cur + Math.PI * 2 * 5 - final) / (Math.PI * 2));
    this.anim = { from: cur, to: final + turns * Math.PI * 2, t0: performance.now(), ms };
  }

  update(t: number, night: number): void {
    if (this.anim) {
      const k = Math.min(1, (performance.now() - this.anim.t0) / this.anim.ms);
      const e = 1 - Math.pow(1 - k, 3);
      this.wheel.rotation.y = this.anim.from + (this.anim.to - this.anim.from) * e;
      if (k >= 1) this.anim = null;
    } else this.wheel.rotation.y += 0.002;
    const pulse = 0.65 + 0.35 * Math.sin(t * 3);
    const n = Math.round(night * pulse * 10) / 10;
    if (n !== this.neon) {
      this.neon = n;
      for (const { m, c } of this.glow) m.color.copy(c).multiplyScalar(0.55 + 0.45 * n);
    }
  }
}

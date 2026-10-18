import * as THREE from 'three';
import { ROULETTE_PAY, ROULETTE_POCKETS, type RouletteBet } from '../data/casino';
import type { MapDef, Spot } from '../data/maps';
import { pocketColor, type BlackjackView, type Card } from './casino';
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
  private chipBoard: ReturnType<typeof textPlane> | null = null;
  private chipShown = -1;
  private cards = new THREE.Group();
  private bjButtons: Record<string, THREE.Object3D> = {};
  private picks: THREE.Object3D[] = [];
  private hover: THREE.Object3D | null = null;
  private ray = new THREE.Raycaster();
  private texCache = new Map<string, THREE.CanvasTexture>();

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
    // Betting patches along the front edge: aim and click one to bet the fish in hand.
    const bets = [
      { bet: 'red', color: 0xc4262e, label: 'RED' },
      { bet: 'black', color: 0x1b1b1f, label: 'BLACK' },
      { bet: 'green', color: 0x1f9a4f, label: 'GREEN' },
    ];
    bets.forEach((b, i) => {
      const p = rbox(0.8, 0.05, 0.7, b.color, 0.015);
      p.position.set((i - 1) * 0.92, 1.1, 0.98);
      const { mesh, ctx, tex } = textPlane(0.7, 0.4, 256);
      ctx.fillStyle = '#fff';
      ctx.font = '800 64px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, 128, 64);
      ctx.font = '700 44px system-ui, sans-serif';
      ctx.fillStyle = '#ffd35a';
      ctx.fillText(`×${ROULETTE_PAY[b.bet as RouletteBet]}`, 128, 108);
      tex.needsUpdate = true;
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0.03, 0);
      p.add(mesh);
      this.addPick(p, { k: 'rbet', id: b.bet });
      t.add(p);
    });
    this.place(t, s, 1.7);
  }

  private buildBlackjack(s: Spot): void {
    const t = this.table(3.0, 1.9);
    const spot = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: GOLD }));
    spot.position.set(0, 1.085, 0.25);
    t.add(spot, this.cards);
    this.cards.position.y = 1.09;
    const labels: [string, string][] = [['deal', 'DEAL'], ['hit', 'HIT'], ['stand', 'STAND'], ['double', 'DOUBLE']];
    for (const [id, text] of labels) {
      const b = rbox(0.62, 0.06, 0.3, 0x2a0f1c, 0.02);
      b.position.set(0, 1.1, 0.72);
      const { mesh, ctx, tex } = textPlane(0.56, 0.24, 256);
      ctx.fillStyle = '#ffd35a';
      ctx.font = '800 76px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 128, 56);
      tex.needsUpdate = true;
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.035;
      b.add(mesh);
      this.addPick(b, { k: 'bj', id });
      this.bjButtons[id] = b;
      t.add(b);
    }
    const sign = neonSign('BLACKJACK', 3, '#4fd2ff');
    sign.position.set(0, 3.5, 0);
    t.add(this.neonRing(1.2, 0.2, 0x4fd2ff), sign);
    this.place(t, s, 1.7);
    this.setBlackjack(null);
  }

  private addPick(o: THREE.Object3D, tag: { k: string; id: string }): void {
    o.userData.tag = tag;
    this.picks.push(o);
  }

  private cardTex(c: Card | null): THREE.CanvasTexture {
    const key = c ? `${c.r}-${c.s}` : 'back';
    let t = this.texCache.get(key);
    if (t) return t;
    const cv = document.createElement('canvas');
    cv.width = 96;
    cv.height = 134;
    const g = cv.getContext('2d')!;
    g.fillStyle = c ? '#fbf8ef' : '#7a1d3a';
    g.fillRect(0, 0, 96, 134);
    g.strokeStyle = c ? '#999' : '#ffd35a';
    g.lineWidth = 4;
    g.strokeRect(2, 2, 92, 130);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (c) {
      const rank = c.r === 1 ? 'A' : c.r === 11 ? 'J' : c.r === 12 ? 'Q' : c.r === 13 ? 'K' : String(c.r);
      g.fillStyle = c.s === 1 || c.s === 2 ? '#c4262e' : '#1b1b1f';
      g.font = '800 54px system-ui, sans-serif';
      g.fillText(rank, 48, 44);
      g.font = '56px system-ui, sans-serif';
      g.fillText(['♠', '♥', '♦', '♣'][c.s], 48, 96);
    } else {
      g.fillStyle = '#ffd35a';
      g.font = '800 54px system-ui, sans-serif';
      g.fillText('?', 48, 67);
    }
    t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    this.texCache.set(key, t);
    return t;
  }

  /** Lays the current hand out on the felt and shows only the buttons that make sense. */
  setBlackjack(v: BlackjackView | null): void {
    for (const ch of [...this.cards.children]) {
      this.cards.remove(ch);
      (ch as THREE.Mesh).geometry.dispose();
    }
    const row = (list: (Card | null)[], z: number) =>
      list.forEach((c, i) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.56).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.cardTex(c), toneMapped: false }));
        m.position.set((i - (list.length - 1) / 2) * 0.46, 0.002 * i, z);
        m.rotation.y = (i % 2 ? -1 : 1) * 0.06;
        this.cards.add(m);
      });
    if (v) {
      row(v.dealer, -0.55);
      row(v.player, 0.15);
    }
    const live = !!v && !v.done;
    const show = live ? (v!.canDouble ? ['hit', 'stand', 'double'] : ['hit', 'stand']) : ['deal'];
    for (const [id, b] of Object.entries(this.bjButtons)) {
      const i = show.indexOf(id);
      b.visible = i >= 0;
      b.userData.tag.off = i < 0;
      if (i >= 0) b.position.x = (i - (show.length - 1) / 2) * 0.75;
    }
  }

  /** The bet patch or button under the crosshair, if any. */
  pick(camera: THREE.Camera, maxDist = 4.2): { k: string; id: string } | null {
    this.ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    this.ray.far = maxDist;
    const live = this.picks.filter((o) => o.visible);
    const hit = this.ray.intersectObjects(live, true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && !o.userData.tag) o = o.parent;
    const picked = o && !o.userData.tag.off ? o : null;
    if (picked !== this.hover) {
      if (this.hover) this.hover.position.y -= 0.05;
      this.hover = picked;
      if (picked) picked.position.y += 0.05;
    }
    return picked ? picked.userData.tag : null;
  }

  clearHover(): void {
    if (this.hover) this.hover.position.y -= 0.05;
    this.hover = null;
  }

  private buildPrizes(s: Spot): void {
    const g = new THREE.Group();
    const counter = rbox(5.0, 1.05, 1.1, 0x4a1a2c, 0.06);
    counter.position.y = 0.52;
    const top = rbox(5.2, 0.1, 1.3, GOLD, 0.04);
    top.position.y = 1.08;
    g.add(counter, top);

    // Brass cage behind the counter, like a cashier's window.
    for (let i = -6; i <= 6; i++) {
      const bar = cyl(0.03, 0.03, 2.1, GOLD, 6);
      bar.position.set(i * 0.4, 2.15, -0.5);
      g.add(bar);
    }
    for (const sx of [-2.5, 2.5]) {
      const post = cyl(0.1, 0.1, 3.4, GOLD, 8);
      post.position.set(sx, 1.7, -0.5);
      g.add(post);
    }
    const bar = rbox(5.3, 0.14, 0.24, GOLD, 0.03);
    bar.position.set(0, 3.4, -0.5);
    g.add(bar);
    const { mesh, ctx, tex } = textPlane(3.6, 0.8, 512);
    ctx.fillStyle = '#2a0f1c';
    ctx.fillRect(0, 0, 512, 114);
    ctx.strokeStyle = '#ffd35a';
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, 500, 102);
    ctx.fillStyle = '#ffd35a';
    ctx.font = '800 56px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎰 CASHIER', 256, 60);
    tex.needsUpdate = true;
    mesh.position.set(0, 3.0, -0.35);
    g.add(mesh);

    // Chip tray (left): hold a fish and click it to cash in.
    const tray = new THREE.Group();
    const trayBase = rbox(1.7, 0.08, 0.8, 0x5a2f1c, 0.03);
    tray.add(trayBase);
    [0xc4262e, 0x2a6fc4, 0x1f9a4f, 0xffffff, 0x1b1b1f].forEach((c, i) => {
      const rows = 4 + ((i * 3) % 4);
      for (let k = 0; k < rows; k++) {
        const chip = cyl(0.15, 0.15, 0.045, c, 14);
        chip.position.set(-0.64 + i * 0.32, 0.08 + k * 0.05, i % 2 ? 0.12 : -0.12);
        tray.add(chip);
      }
    });
    const tag = textPlane(1.5, 0.34, 256);
    tag.ctx.fillStyle = '#2a0f1c';
    tag.ctx.fillRect(0, 0, 256, 57);
    tag.ctx.strokeStyle = '#ffd35a';
    tag.ctx.lineWidth = 4;
    tag.ctx.strokeRect(2, 2, 252, 53);
    tag.ctx.fillStyle = '#ffd35a';
    tag.ctx.font = '800 30px system-ui, sans-serif';
    tag.ctx.textAlign = 'center';
    tag.ctx.textBaseline = 'middle';
    tag.ctx.fillText('TURN IN FISH', 128, 30);
    tag.tex.needsUpdate = true;
    tag.mesh.rotation.x = -Math.PI / 2;
    tag.mesh.position.set(0, 0.06, 0.52);
    tray.add(tag.mesh);
    tray.position.set(-1.4, 1.17, 0.05);
    this.addPick(tray, { k: 'cash', id: 'cash' });
    g.add(tray);

    // Chip balance board (above the tray).
    const board = textPlane(1.8, 0.7, 256);
    board.mesh.position.set(-1.4, 2.1, -0.38);
    this.chipBoard = board;
    g.add(board.mesh);
    this.setChips(0);

    // Prize case (right): one glass box of perk plaques; click it to browse.
    const caseG = new THREE.Group();
    const frame = rbox(1.9, 0.08, 0.8, GOLD, 0.03);
    caseG.add(frame);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.6, 0.7),
      new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.18, depthWrite: false }),
    );
    glass.position.y = 0.34;
    caseG.add(glass);
    const icons = ['🦺', '🍀', '🧤', '🏮', '✨'];
    icons.forEach((ic, i) => {
      const pl = textPlane(0.3, 0.3, 64);
      pl.ctx.font = '48px system-ui, sans-serif';
      pl.ctx.textAlign = 'center';
      pl.ctx.textBaseline = 'middle';
      pl.ctx.fillText(ic, 32, 34);
      pl.tex.needsUpdate = true;
      pl.mesh.material = new THREE.MeshBasicMaterial({ map: pl.tex, transparent: true, toneMapped: false, depthWrite: false });
      pl.mesh.position.set(-0.7 + i * 0.35, 0.3, 0.1);
      pl.mesh.rotation.x = -0.5;
      caseG.add(pl.mesh);
    });
    const tag2 = textPlane(1.5, 0.34, 256);
    tag2.ctx.fillStyle = '#2a0f1c';
    tag2.ctx.fillRect(0, 0, 256, 57);
    tag2.ctx.strokeStyle = '#ffd35a';
    tag2.ctx.lineWidth = 4;
    tag2.ctx.strokeRect(2, 2, 252, 53);
    tag2.ctx.fillStyle = '#ffd35a';
    tag2.ctx.font = '800 30px system-ui, sans-serif';
    tag2.ctx.textAlign = 'center';
    tag2.ctx.textBaseline = 'middle';
    tag2.ctx.fillText('PRIZES', 128, 30);
    tag2.tex.needsUpdate = true;
    tag2.mesh.rotation.x = -Math.PI / 2;
    tag2.mesh.position.set(0, 0.06, 0.52);
    caseG.add(tag2.mesh);
    caseG.position.set(1.4, 1.17, 0.05);
    this.addPick(caseG, { k: 'shop', id: 'shop' });
    g.add(caseG);

    g.add(this.neonRing(2.4, 3.55, 0xffd35a).translateZ(-0.5));
    this.place(g, s, 2.3);
    // The counter is long; block its ends so nobody walks through.
    this.colliders.push({ x: s.x - 1.7, z: s.z, r: 0.9 }, { x: s.x + 1.7, z: s.z, r: 0.9 });
  }

  /** Redraws the chip balance board above the tray. */
  setChips(n: number): void {
    if (!this.chipBoard || n === this.chipShown) return;
    this.chipShown = n;
    const { ctx, tex } = this.chipBoard;
    ctx.fillStyle = '#12060c';
    ctx.fillRect(0, 0, 256, 100);
    ctx.strokeStyle = '#ffd35a';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 250, 94);
    ctx.fillStyle = '#ffd35a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 24px system-ui, sans-serif';
    ctx.fillText('YOUR CHIPS', 128, 24);
    ctx.font = '800 50px system-ui, sans-serif';
    ctx.fillText(String(Math.round(n * 10) / 10), 128, 66);
    tex.needsUpdate = true;
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

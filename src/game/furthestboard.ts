import * as THREE from 'three';
import { DIVES_OPEN } from '../data/dive';
import { zoneAt } from '../data/sea';
import type { FurthestRow } from '../net/protocol';
import { DARK, ball, cyl, mat, rbox, textPlane } from './hub';
import { glowTag } from './nightglow';

/**
 * The Furthest Out board's look and words, all in one place for play-testing. Where it stands is `HARBOUR.board`
 * in src/data/maps.ts. The board ranks the furthest marker each player headed home from (in code: the deepest
 * ledge surfaced from, `SaveData.sea.record`).
 */
export const FURTHEST_BOARD = {
  title: 'FURTHEST OUT',
  subtitle: 'furthest marker headed home from',
  /** The empty board, and its second line while charters are closed (`DIVES_OPEN`) or open. */
  empty: ['No one has headed home', 'from a marker yet'],
  closed: 'Charters open soon',
  open: 'Sail out with Captain Reed',
  /**
   * Under each marker, what the record's charter banked (the numbers on its "Home safe!" card): a Black Pearl, then
   * this. Records from before the haul was kept leave it out.
   */
  haul: (pearls: number, fish: number) => `${pearls.toLocaleString()} · ${fish.toLocaleString()} fish`,
  /** Painted like Reed's seaplane: a sea-green roof and a cream face edged in its red band. */
  roof: 0x6f9e96,
  frame: 0xf3ead8,
  face: '#25505b',
  edge: '#c0453a',
  ink: '#fff3d6',
  soft: '#a9d6cc',
  gold: '#ffd23a',
  /** The lantern on the roof, lit at night like the CHARTERS signpost's (`glowTag` radius). */
  lantern: 0xffd27a,
  lanternGlow: 0.7,
};

const B = FURTHEST_BOARD;
/** Board size in metres, and the height of the face's middle. */
const W = 2.1;
const H = 1.65;
const MID = 1.75;
/** The posts, across the board's own frame: the town gives each a collider. */
export const BOARD_POSTS = [-W / 2 + 0.12, W / 2 - 0.12];

/** The game's Black Pearl (`.bpearl` in style.css) on a canvas: `d` px across, centred on (x, y). */
function drawPearl(ctx: CanvasRenderingContext2D, x: number, y: number, d: number): void {
  const r = d / 2;
  const g = ctx.createRadialGradient(x - r * 0.32, y - r * 0.4, 0, x - r * 0.32, y - r * 0.4, r * 1.6);
  g.addColorStop(0, '#f6f2ff');
  g.addColorStop(0.16, '#9d8fc4');
  g.addColorStop(0.45, '#3a3450');
  g.addColorStop(0.8, '#14111c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // A faint sea-green rim, like the icon's inset shadow, so it shows on the dark face.
  ctx.strokeStyle = '#3fe6c899';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** The Furthest Out board at the harbour: posts, a framed face redrawn from the server's rows, a roof and a lantern. */
export class FurthestBoard {
  readonly group = new THREE.Group();
  /** The redrawn face; keep it out of the town's merge. */
  readonly face = textPlane(W - 0.2, H - 0.2, 512);
  /** The lantern's material, for the town's night lamps. */
  readonly lamp: THREE.MeshLambertMaterial;
  private shown = '';

  constructor() {
    for (const lx of BOARD_POSTS) {
      const post = cyl(0.08, 0.1, MID + H / 2 + 0.3, DARK, 8);
      post.position.set(lx, (MID + H / 2 + 0.3) / 2, -0.02);
      this.group.add(post);
    }
    const frame = rbox(W, H, 0.12, B.frame, 0.05);
    frame.position.set(0, MID, 0);
    this.face.mesh.position.set(0, MID, 0.07);
    const roof = rbox(W + 0.4, 0.12, 0.66, B.roof, 0.05);
    roof.position.set(0, MID + H / 2 + 0.2, 0);
    roof.rotation.x = 0.15;
    const lamp = ball(0.1, B.lantern);
    this.lamp = lamp.material as THREE.MeshLambertMaterial;
    this.lamp.emissive.set(0xffb84a);
    lamp.position.set(0, MID + H / 2 + 0.42, 0);
    glowTag(lamp, B.lanternGlow);
    const cap = cyl(0.13, 0.09, 0.05, DARK, 8);
    cap.position.set(0, MID + H / 2 + 0.55, 0);
    this.group.add(frame, this.face.mesh, roof, lamp, cap);
    // The back of the face, so the board doesn't look hollow from the water.
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, H - 0.2), mat(B.frame));
    back.position.set(0, MID, -0.07);
    back.rotation.y = Math.PI;
    this.group.add(back);
    this.set([]);
  }

  /** Redraws the board; nothing happens if the rows haven't changed. */
  set(rows: FurthestRow[]): void {
    const key = JSON.stringify(rows);
    if (key === this.shown) return;
    this.shown = key;
    const { ctx, tex } = this.face;
    const { width: w, height: h } = ctx.canvas;
    ctx.fillStyle = B.face;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = B.edge;
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.strokeStyle = B.ink;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 16, w - 32, h - 32);
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.fillStyle = B.ink;
    ctx.font = '800 42px system-ui, sans-serif';
    ctx.fillText(B.title, w / 2, 62);
    ctx.font = '600 21px system-ui, sans-serif';
    ctx.fillStyle = B.soft;
    ctx.fillText(B.subtitle, w / 2, 90);
    if (!rows.length) this.empty(w, h);
    rows.slice(0, 5).forEach((r, i) => this.row(r, i, w));
    tex.needsUpdate = true;
  }

  /** One row: rank and name, with level and the zone under them, and the marker on the right. */
  private row(r: FurthestRow, i: number, w: number): void {
    const ctx = this.face.ctx;
    const L = 34;
    const R = w - 34;
    const y = 130 + i * 52;
    const marker = `Marker ${r.ledge}`;
    ctx.textAlign = 'right';
    ctx.font = '800 28px system-ui, sans-serif';
    ctx.fillStyle = i === 0 ? B.gold : B.ink;
    ctx.fillText(marker, R, y);
    const markerW = ctx.measureText(marker).width;
    // Long names shrink to fit beside the marker.
    const name = `${i + 1}. ${r.name}`;
    const room = R - L - markerW - 16;
    let px = 28;
    ctx.font = `700 ${px}px system-ui, sans-serif`;
    while (ctx.measureText(name).width > room && px > 16) ctx.font = `700 ${--px}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillStyle = i === 0 ? B.gold : B.ink;
    ctx.fillText(name, L, y);
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.fillStyle = B.soft;
    ctx.fillText(`Lv ${r.level} · ${zoneAt(r.ledge).name}`, L + 30, y + 21);
    if (r.pearls === undefined || r.fish === undefined) return;
    ctx.textAlign = 'right';
    ctx.fillStyle = B.ink;
    const haul = B.haul(r.pearls, r.fish);
    ctx.fillText(haul, R, y + 21);
    drawPearl(ctx, R - ctx.measureText(haul).width - 12, y + 15, 16);
  }

  /** No one on the board yet: a dotted route of marker buoys out to sea, and what to do about it. */
  private empty(w: number, h: number): void {
    const ctx = this.face.ctx;
    const y = 170;
    ctx.strokeStyle = B.soft;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.moveTo(70, y);
    ctx.lineTo(w - 70, y);
    ctx.stroke();
    ctx.setLineDash([]);
    // Home on the left, then a marker buoy every so often, fading out to sea.
    ctx.fillStyle = B.ink;
    ctx.font = '700 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('home', 70, y + 34);
    ctx.beginPath();
    ctx.arc(70, y, 9, 0, Math.PI * 2);
    ctx.fill();
    [0, 1, 2, 3].forEach((k) => {
      const x = 170 + k * 92;
      ctx.globalAlpha = 1 - k * 0.22;
      ctx.fillStyle = B.edge;
      ctx.beginPath();
      ctx.arc(x, y, 11, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = B.ink;
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = B.soft;
      ctx.fillText(String((k + 1) * 5), x, y + 34);
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = B.ink;
    ctx.font = '700 26px system-ui, sans-serif';
    B.empty.forEach((line, k) => ctx.fillText(line, w / 2, h - 128 + k * 32));
    ctx.fillStyle = B.gold;
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.fillText(DIVES_OPEN ? B.open : B.closed, w / 2, h - 42);
  }
}

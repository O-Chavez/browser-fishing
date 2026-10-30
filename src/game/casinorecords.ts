import * as THREE from 'three';
import { FISH } from '../data/content';
import type { Spot } from '../data/maps';
import type { CasinoGame, CasinoRecord, CasinoRecords } from '../net/protocol';
import { rbox, textPlane } from './hub';
import { mergeStatic } from './merge';

const GOLD = 0xe0b441;
const GAMES: Record<CasinoGame, string> = { blackjack: 'Blackjack', roulette: 'Roulette', wheel: 'Lucky Wheel' };
/** Fish tier colours, as on the Top Anglers board. */
const TIER_COLORS = ['#ffffff', '#8fe08f', '#6cc4ff', '#c58bff', '#ff9b3d', '#ffd23a'];

/** The casino's record board: the all-time biggest single win and loss, on the back wall. */
export class RecordsBoard {
  readonly group = new THREE.Group();
  private face = textPlane(2.3, 1.8, 512);
  private shown = '';

  constructor(spot: Spot) {
    // Gold frame on a dark wood backing, like the paintings; baked into one mesh, with the redrawn face kept apart.
    const back = rbox(2.75, 2.25, 0.08, 0x4a2c1c, 0.03);
    const frame = rbox(2.5, 2.0, 0.1, GOLD, 0.04);
    frame.position.z = 0.04;
    const cap = rbox(2.95, 0.14, 0.18, GOLD, 0.04);
    cap.position.set(0, 1.18, 0.05);
    this.face.mesh.position.z = 0.1;
    this.group.add(back, frame, cap, this.face.mesh);
    this.group.position.set(spot.x, 2.9, spot.z);
    this.group.rotation.y = spot.facing;
    mergeStatic(this.group, [this.face.mesh]);
    this.set({ win: null, loss: null });
  }

  /** Redraws the board; nothing happens if the records haven't changed. */
  set(r: CasinoRecords): void {
    const key = JSON.stringify(r);
    if (key === this.shown) return;
    this.shown = key;
    const { ctx, tex } = this.face;
    const { width: w, height: h } = ctx.canvas;
    ctx.fillStyle = '#2a0f1c';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffd35a';
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 16, w - 32, h - 32);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd35a';
    ctx.font = '800 40px system-ui, sans-serif';
    ctx.fillText('CASINO RECORDS', w / 2, 62);
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.fillStyle = '#d9a6bb';
    ctx.fillText('biggest single hand or spin', w / 2, 88);
    this.section(r.win, 'win', 104);
    ctx.strokeStyle = 'rgba(255, 211, 90, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 250);
    ctx.lineTo(w - 40, 250);
    ctx.stroke();
    this.section(r.loss, 'loss', 252);
    tex.needsUpdate = true;
  }

  /** One record: label and date, then name and amount, then the fish and the game. */
  private section(rec: CasinoRecord | null, kind: 'win' | 'loss', y: number): void {
    const ctx = this.face.ctx;
    const w = ctx.canvas.width;
    const L = 36;
    const R = w - 36;
    ctx.textAlign = 'left';
    ctx.font = '800 24px system-ui, sans-serif';
    ctx.fillStyle = kind === 'win' ? '#7dffb0' : '#ff7a8a';
    ctx.fillText(kind === 'win' ? '▲ BIGGEST WIN' : '▼ BIGGEST LOSS', L, y + 30);
    if (!rec) {
      ctx.textAlign = 'center';
      ctx.font = '700 30px system-ui, sans-serif';
      ctx.fillStyle = '#9a7486';
      ctx.fillText('No record yet', w / 2, y + 92);
      return;
    }
    ctx.textAlign = 'right';
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.fillStyle = '#b58aa0';
    ctx.fillText(new Date(rec.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }), R, y + 30);
    const amount = `${kind === 'win' ? '+' : '−'}${rec.amount.toLocaleString()} 🪙`;
    ctx.font = '800 38px system-ui, sans-serif';
    ctx.fillStyle = kind === 'win' ? '#ffd23a' : '#ff9a9a';
    ctx.fillText(amount, R, y + 80);
    // Long names shrink to fit beside the amount.
    const room = R - L - ctx.measureText(amount).width - 16;
    let px = 34;
    ctx.font = `700 ${px}px system-ui, sans-serif`;
    while (ctx.measureText(rec.name).width > room && px > 16) ctx.font = `700 ${--px}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(rec.name, L, y + 80);
    const f = FISH.find((x) => x.id === rec.fishId);
    const fish = `${rec.shiny ? '✨ ' : ''}${f ? `T${f.tier} ${f.name}` : 'a fish'}`;
    ctx.font = '600 24px system-ui, sans-serif';
    ctx.fillStyle = TIER_COLORS[Math.min(5, f?.tier ?? 0)];
    ctx.fillText(fish, L, y + 120);
    const fw = ctx.measureText(fish).width;
    ctx.fillStyle = '#d9a6bb';
    ctx.fillText(` · ${GAMES[rec.game] ?? rec.game}`, L + fw, y + 120);
  }
}

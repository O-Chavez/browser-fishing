// Draws the three community zone plans (round 3) over top-down renders of main's map and screenshots each to a JPG.
//   node docs/community-zone/plans.mjs     (writes plan-a.jpg, plan-b.jpg, plan-c.jpg and plans.json beside this file)
// The bases are from `npx tsx scripts/map-plan.ts <out> 25 0 30` (base-east.jpg) and `... 18 13 31` (base-town2.jpg), run on main.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const rad = (d) => (d * Math.PI) / 180;
/** A point `r` m from `c`, `deg` round from +z (down the page) toward +x (right): 90 is east, 180 north, 270 west. */
const at = (c, r, deg) => [c[0] + r * Math.sin(rad(deg)), c[1] + r * Math.cos(rad(deg))];
const f = (n) => n.toFixed(2);
const pt = (p) => `${f(p[0])} ${f(p[1])}`;

// ---------- symbols ----------
const disc = (c, r, cls = 'cob') => `<circle class="${cls}" cx="${f(c[0])}" cy="${f(c[1])}" r="${r}"/>`;
const poly = (pts, cls) => `<polygon class="${cls}" points="${pts.map((p) => `${f(p[0])},${f(p[1])}`).join(' ')}"/>`;
const line = (pts, cls) => `<polyline class="${cls}" points="${pts.map((p) => `${f(p[0])},${f(p[1])}`).join(' ')}"/>`;
/** An arc round `c` from bearing a to b (a < b). */
const arc = (c, r, a, b, cls) => `<path class="${cls}" d="M${pt(at(c, r, a))} A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 0 ${pt(at(c, r, b))}"/>`;
const lane = (pts, w = 1.8) => `<polyline class="lane-e" style="stroke-width:${w + 0.22}" points="${pts.map((p) => `${f(p[0])},${f(p[1])}`).join(' ')}"/><polyline class="lane" style="stroke-width:${w}" points="${pts.map((p) => `${f(p[0])},${f(p[1])}`).join(' ')}"/>`;
/** A rectangle w (across) by d (deep) centred on p, turned so its front faces bearing `face`. */
const box = (p, w, d, face, cls, extra = '') => `<g transform="translate(${f(p[0])} ${f(p[1])}) rotate(${f(-face)})"><rect class="${cls}" x="${f(-w / 2)}" y="${f(-d / 2)}" width="${w}" height="${d}" rx="0.08"/>${extra}</g>`;
const fire = (c, r = 1) => `<circle class="hearth" cx="${f(c[0])}" cy="${f(c[1])}" r="${r}"/><circle class="flame" cx="${f(c[0])}" cy="${f(c[1])}" r="${f(r * 0.62)}"/>`;
/** Log seats on a ring, each lying along the ring. */
const logs = (c, r, degs) => degs.map((d) => box(at(c, r, d), 1.5, 0.46, d, 'log')).join('');
/** A board on two posts at p facing bearing `face`. */
const board = (p, face, cls = 'lake', w = 2.5) => box(p, w, 0.34, face, `board ${cls}`);
const boardAt = (c, r, deg, cls, w) => board(at(c, r, deg), deg + 180, cls, w);
/** The host's stall: a small shack with a striped awning over its counter on the side it faces. */
const stall = (p, face, w = 3.2, d = 2.2) => box(p, w, d, face, 'stall', `<rect class="awning" x="${f(-w / 2 - 0.15)}" y="${f(d / 2 - 0.1)}" width="${w + 0.3}" height="0.75" rx="0.08"/>`);
const bench = (p, face) => box(p, 1.7, 0.5, face, 'bench', `<rect class="benchback" x="-0.85" y="-0.3" width="1.7" height="0.13"/>`);
/** A timber arch across a path at p; the path runs along bearing `along`. */
const arch = (p, along) => box(p, 2.6, 0.34, along, 'arch', `<circle class="post" cx="-1.2" cy="0" r="0.2"/><circle class="post" cx="1.2" cy="0" r="0.2"/>`);
const lamp = (p, lit = false) => `${lit ? `<circle class="glow" cx="${f(p[0])}" cy="${f(p[1])}" r="1.5"/>` : ''}<circle class="lamp" cx="${f(p[0])}" cy="${f(p[1])}" r="0.24"/>`;
const tree = (p, r = 1.7, pine = false) => `<circle class="${pine ? 'pine' : 'leafy'}" cx="${f(p[0])}" cy="${f(p[1])}" r="${r}"/><circle class="trunk" cx="${f(p[0])}" cy="${f(p[1])}" r="0.22"/>`;
const totem = (p) => `<path class="totem" d="M${f(p[0])} ${f(p[1] - 0.5)} l0.43 0.25 v0.5 l-0.43 0.25 l-0.43 -0.25 v-0.5 z"/>`;
const stones = (p) => [[-0.25, 0.1], [0.2, -0.15], [0.05, 0.25], [-0.05, -0.2]].map(([dx, dz]) => `<ellipse class="stone" cx="${f(p[0] + dx)}" cy="${f(p[1] + dz)}" rx="0.24" ry="0.17"/>`).join('');
const sign = (p) => `<rect class="sign" x="${f(p[0] - 0.3)}" y="${f(p[1] - 0.12)}" width="0.6" height="0.24"/>`;
const rack = (p) => `<rect class="rocket" x="${f(p[0] - 0.45)}" y="${f(p[1] - 0.25)}" width="0.9" height="0.5" rx="0.06"/>`;
const jetty = (x0, x1, z0, z1) => `<rect class="jetty" x="${x0}" y="${z0}" width="${f(x1 - x0)}" height="${f(z1 - z0)}"/>`;
const boat = (p, face) => box(p, 0.9, 2.2, face, 'boat');
const blanket = (p, face) => box(p, 1.9, 1.5, face, 'blanket');
const label = (p, text, cls = '') => `<text class="lbl ${cls}" x="${f(p[0])}" y="${f(p[1])}">${text}</text>`;
const lead = (a, b) => `<line class="lead" x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}"/>`;
/** A label with a thin leader to the thing it names. */
let V = [0, 0, 100, 100];
const note = (target, p0, text, anchor = 'start') => {
  // Keeps the text inside the picture: its width is estimated from its length.
  const w = text.length * 0.5 * 0.57;
  const p = [...p0];
  if (anchor === 'start') p[0] = Math.min(p[0], V[0] + V[2] - 0.3 - w);
  else p[0] = Math.max(p[0], V[0] + 0.3 + w);
  return `${lead(target, [p[0] + (anchor === 'end' ? 0.15 : -0.15), p[1] - 0.2])}<text class="lbl" text-anchor="${anchor}" x="${f(p[0])}" y="${f(p[1])}">${text}</text>`;
};
/** The crown: a ring of bulbs strung between tall posts round the fire. */
const crown = (c, r, degs) => `<circle class="string" cx="${f(c[0])}" cy="${f(c[1])}" r="${r}"/>${degs.map((d) => { const p = at(c, r, d); return `<circle class="post" cx="${f(p[0])}" cy="${f(p[1])}" r="0.17"/>`; }).join('')}`;

// ---------- more symbols (round 2) ----------
const steps = (c, r, deg) => box(at(c, r, deg), 2.0, 0.75, deg, 'steps');
const trophy = (p) => `<ellipse class="trophy" cx="${f(p[0])}" cy="${f(p[1])}" rx="0.5" ry="0.2"/>`;
const woodpile = (p, face) => box(p, 1.3, 0.5, face, 'wood');
const archW = (p, along, w) => box(p, w, 0.36, along, 'arch', `<circle class="post" cx="${f(-w / 2 + 0.1)}" cy="0" r="0.22"/><circle class="post" cx="${f(w / 2 - 0.1)}" cy="0" r="0.22"/>`);
const walk = (c, r, a, b, w = 1.8) => `<path class="lane-e" style="stroke-width:${w + 0.22};stroke-linecap:butt" d="M${pt(at(c, r, a))} A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 0 ${pt(at(c, r, b))}"/><path class="lane" style="stroke-width:${w};stroke-linecap:butt" d="M${pt(at(c, r, a))} A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 0 ${pt(at(c, r, b))}"/>`;

// ---------- Design A: Ember Point ----------
function designA() {
  V = [2, -13, 36, 25];
  const F = [20.5, 2.7];
  const R = 5.5;
  const s = [];
  s.push(poly([[17.7, -5.2], [18.0, -2.9], [24.4, -2.8], [25.3, -6.8], [22.6, -8.4], [19.6, -7.5]], 'beach'));
  s.push(jetty(17.4, 19.6, -12.4, -6.9));
  s.push(lane([[17.4, 9.4], at(F, R - 0.3, 345)], 2.2));
  s.push(arc(F, R + 0.25, 196, 337, 'plinth'));
  s.push(disc(F, R));
  // The back: retaining wall, hedge and picket fence; the fence runs on to the gate and down to the beach.
  s.push(arc(F, 8.55, 14, 166, 'retain'), arc(F, 9.1, 14, 166, 'hedge'), arc(F, 9.6, 12, 168, 'fence'));
  s.push(line([at(F, 9.6, 168), [26.0, -7.4]], 'fence'));
  s.push(line([at(F, 9.6, 12), [20.6, 10.4]], 'fence'));
  s.push(line([[17.3, 8.2], [15.8, 7.2]], 'fence'));
  // The wall of panels on the rim, at floor level: Thank You, Lake Legends, the stall, Deep Sea, the Derby stand.
  s.push(poly([at(F, R - 0.1, 74), at(F, R - 0.1, 106), at(F, 5.95, 105), at(F, 5.95, 75)], 'cob'));
  s.push(boardAt(F, 5.6, 21, 'thanks', 1.7), boardAt(F, 5.6, 52, 'lake'), stall(at(F, 7.05, 90), 270), boardAt(F, 5.6, 128, 'sea'), boardAt(F, 5.6, 159, 'derby', 1.7));
  s.push(trophy(at(F, 6.2, 52)), trophy(at(F, 6.2, 128)));
  // The cove side: a low stone seat wall along the rim, a lantern in its one gap.
  s.push(arc(F, R, 200, 331, 'wall'));
  s.push(steps(F, R + 0.3, 180));
  s.push(crown(F, R, [9, 36, 69, 111, 144, 170, 191, 229, 267, 301]));
  s.push(logs(F, 2.9, [20, 65, 110, 150, 215, 310]));
  s.push(fire(F, 1.05));
  s.push(arch([18.3, 8.55], 314));
  s.push(tree([28.9, -3.6], 1.4, true), tree([26.9, -6.1], 1.5, true));
  s.push(arc(F, 6.9, 14, 30, 'beds'));
  s.push(totem([17.95, -4.6]), stones([24.7, -6.4]), sign([24.9, -5.0]), box([21.7, -5.0], 1.5, 0.46, 150, 'log'), box([21.7, -7.1], 1.5, 0.46, 190, 'log'), bench([22.6, -3.7], 180));
  s.push(line([[20.4, -3.7], [18.7, -6.7]], 'way'));
  s.push(rack([18.5, -11.7]), lamp([18.5, -12.15]), lamp(at(F, R, 267)), lamp(at(F, 6.5, 71), true), sign([16.5, 10.3]));
  s.push(label([20.5, 0.4], 'THE GREAT FIRE', 'mid big'));
  s.push(note(at(F, 7.05, 90), [29.6, 1.6], "Bram's Kettle, set back: its counter has its own apron"));
  s.push(note(at(F, 5.6, 52), [28.4, 9.6], 'Lake Legends, its record fish and holder above'));
  s.push(note(at(F, 5.6, 128), [28.4, -3.6], 'Deep Sea, its record fish and holder above'));
  s.push(note(at(F, 5.6, 21), [24.4, 11.4], 'Thank You'));
  s.push(note(at(F, 5.6, 159), [28.8, -5.6], 'Derby stand'));
  s.push(note([18.3, 8.55], [11.2, 8.8], "gate arch: ANGLERS' REST", 'end'));
  s.push(note(at(F, 4.3, 240), [12.4, 5.4], 'clear ring 1.8 m wide behind the logs', 'end'));
  s.push(note(at(F, R, 300), [12.4, 3.6], 'cove side: stone-faced rim with a seat wall (11)', 'end'));
  s.push(note(at(F, R, 267), [12.4, 1.8], 'crown of lights on 11 posts; lantern on a stone pier', 'end'));
  s.push(note(at(F, 2.9, 215), [12.4, 0.0], '6 log seats (12), each with its instrument', 'end'));
  s.push(note(at(F, R + 0.3, 180), [15.0, -2.2], 'beach steps, 2 m', 'end'));
  s.push(note([17.95, -4.6], [14.4, -4.6], "Legends' Totem on the tip", 'end'));
  s.push(note([19.5, -5.3], [14.4, -6.6], 'clear 2 m way, steps to jetty', 'end'));
  s.push(note([18.5, -11.7], [14.4, -10.6], 'rocket jetty 2.2 m wide: rack at its end', 'end'));
  s.push(note([24.7, -6.4], [27.2, -8.6], "Skipper's Beach: stone pile + skip sign at the east end"));
  s.push(note([21.7, -7.1], [22.6, -10.2], '2 logs + a bench, 3 m from the stones'));
  s.push(note(at(F, 9.1, 100), [31.0, 5.2], 'retaining wall, hedge, picket fence'));
  s.push(note([28.9, -3.6], [30.4, -7.6], 'both headland pines, moved behind the fence'));
  s.push(note(at(F, 3.9, 265), [12.4, 7.2], 'open floor on the cove side, kept clear', 'end'));
  s.push(note([16.5, 10.3], [11.2, 10.5], 'signpost: Fire · Stones · Rockets', 'end'));
  return { id: 'a', title: 'A · Ember Point', base: 'base-east.jpg', bpm: 30, bx0: -1.667, bz0: -15, view: V, ppm: 39, svg: s.join('') };
}

// ---------- Design B: Tarn Camp ----------
function designB() {
  V = [5, -10, 41, 25];
  const L = [18.4, 2.6];
  const H = [28.6, 2.4];
  const R = 5.5;
  const P = [37.2, 3.0];
  const s = [];
  s.push(`<ellipse class="pond" cx="${P[0]}" cy="${P[1]}" rx="3.1" ry="5.2"/>`);
  s.push(line(Array.from({ length: 13 }, (_, i) => { const a = rad(-80 + i * 13.5); return [P[0] + 3.6 * Math.cos(a), P[1] + 5.7 * Math.sin(a)]; }), 'rocks'));
  s.push(line(Array.from({ length: 12 }, (_, i) => { const a = rad(-72 + i * 13.5); return [P[0] + 4.3 * Math.cos(a), P[1] + 6.4 * Math.sin(a)]; }), 'rocks'));
  s.push(poly([[18.9, 8.5], [21.5, 9.9], [23.4, 8.9], [22.0, 6.9], [19.6, 6.2]], 'lawn'));
  s.push(poly([[25.4, 9.0], [32.6, 8.7], [34.8, 9.1], [34.8, 11.8], [31.6, 11.2], [25.6, 12.8], [24.4, 10.7]], 'lawn'));
  s.push(arc(L, 3.3, 185, 300, 'beacharc'));
  s.push(lane([[17.4, 9.4], [17.8, 5.3]], 2.2));
  s.push(lane([[17.4, 9.4], [21.6, 11.4], [26.6, 10.9], at(H, R - 0.3, 0)], 2));
  s.push(lane([at(L, 2.2, 90), [23.4, 2.45]], 3.5));
  s.push(disc(L, 2.6), disc(H, R));
  // The rampart on the cove side, the retaining wall round the north, the hedge on top running on to the tarn.
  s.push(arc(H, R + 0.55, 130, 252, 'retain'), arc(H, R + 0.55, 288, 346, 'retain'));
  s.push(arc(H, R + 1.05, 229, 253, 'rampart'), arc(H, R + 1.05, 287, 311, 'rampart'));
  s.push(arc(H, R + 1.4, 132, 252, 'hedge'), arc(H, R + 1.4, 288, 343, 'hedge'));
  s.push(line([at(H, R + 1.4, 132), [37.5, -3.0]], 'hedge'));
  s.push(archW([22.25, 2.45], 270, 3.9));
  s.push(trophy([21.75, 0.45]), trophy([21.75, 4.45]));
  s.push(line([[21.4, 12.8], [25.6, 13.7], [31.8, 12.2], [35.4, 12.5], [36.4, 9.3]], 'fence'));
  s.push(line([[16.5, 8.9], [15.8, 6.1]], 'fence'));
  // On the rim at floor level: the two catch boards in their own gaps; seat wall on the north and the south-east; a stone kerb at the tarn.
  s.push(boardAt(H, 5.6, 218, 'sea'), boardAt(H, 5.6, 322, 'lake'), trophy(at(H, 6.2, 218)), trophy(at(H, 6.2, 322)));
  s.push(arc(H, R, 132, 203, 'wall'));
  s.push(arc(H, R, 56, 126, 'kerbwall'));
  s.push(crown(H, R, [13, 52, 128, 205, 232, 252, 288, 308, 336]));
  s.push(logs(H, 2.9, [40, 135, 180, 225, 315]));
  s.push(fire(H, 1.05));
  // The Landing: stones on the cove, two log seats, the totem.
  s.push(logs(L, 1.6, [160, 215]), totem(at(L, 3.3, 190)), stones(at(L, 3.3, 280)), sign(at(L, 3.3, 252)), sign([16.5, 10.3]));
  s.push(lamp([22.25, 0.25], true), lamp([22.25, 4.65]), lamp([16.7, 7.0]));
  s.push(stall([31.5, 10.1], 200), lamp([29.7, 9.3], true));
  s.push(board([25.9, 9.4], 100, 'thanks', 1.7), board([23.6, 10.2], 150, 'derby', 1.7));
  s.push(rack([37.7, 2.2]), sign(at(H, 5.2, 90)));
  s.push(tree([24.2, -6.6], 1.4, true), tree([27.9, -7.8], 1.4, true), tree([31.8, -7.1], 1.4, true), tree([21.6, -4.9], 1.3, true));
  s.push(label([28.6, 0.75], 'THE GREAT FIRE', 'mid big'));
  s.push(label([37.2, 5.8], 'the tarn', 'mid'));
  s.push(note(at(L, 3.3, 280), [13.4, 2.8], 'the Landing: stone pile + skip sign, throwing north-west', 'end'));
  s.push(note(at(L, 1.6, 215), [13.4, 0.6], '2 log seats in its north half, off the path', 'end'));
  s.push(note(at(L, 3.3, 190), [13.4, -1.6], "Legends' Totem at the tip", 'end'));
  s.push(note([22.25, 2.45], [19.6, -3.6], "the gateway, 3.6 m, under the ANGLERS' REST arch, sighted on the pier", 'end'));
  s.push(note([21.75, 4.45], [15.4, 5.4], "record fish, named, on the arch's posts above head height", 'end'));
  s.push(note([20.8, 8.0], [15.4, 7.4], 'planted bed between the lanes', 'end'));
  s.push(note([21.6, -4.9], [19.6, -5.6], 'headland pine, moved up the ridge', 'end'));
  s.push(note(at(H, R + 1.05, 300), [14.6, 11.6], 'the rampart: stone both faces, head-high hedge', 'end'));
  s.push(note(at(H, 5.6, 218), [20.6, -7.6], 'Deep Sea at floor level, in its own gap', 'end'));
  s.push(note(at(H, 5.6, 322), [20.0, 13.2], 'Lake Legends at floor level, in its own gap', 'end'));
  s.push(note(at(H, R, 165), [37.4, -9.2], 'seat wall (7) + 5 log seats (10); clear ring 1.8 m', 'end'));
  s.push(note([35.6, -3.1], [36.4, -6.8], 'hedge to the tarn; 3 pines behind it'));
  s.push(note(at(H, 5.2, 90), [41.2, -4.6], 'fuse post at the kerb'));
  s.push(note(at(H, R, 112), [40.4, 10.6], 'low kerb wall at the water'));
  s.push(note(at(H, R, 22), [36.6, 14.5], '4 m of open rim in front of the counter'));
  s.push(note([37.7, 2.2], [41.8, -2.8], 'rocket raft, moored'));
  s.push(note([41.2, 1.4], [42.0, -0.9], 'rock bank, 2 m, stacked'));
  s.push(note([31.5, 10.1], [35.8, 13.2], "Bram's Kettle under the oak, counter to the fire"));
  s.push(note([25.9, 9.4], [26.8, 14.5], 'Thank You'));
  s.push(note([23.6, 10.2], [23.4, 14.5], 'Derby stand', 'end'));
  return { id: 'b', title: 'B · Tarn Camp', base: 'base-east.jpg', bpm: 30, bx0: -1.667, bz0: -15, view: V, ppm: 34, svg: s.join('') };
}

// ---------- Design C: Fireside Yard ----------
function designC() {
  V = [-3, -1.6, 36, 29.4];
  const F = [18.0, 16.6];
  const R = 5.8;
  const O = [18.7, 3.3];
  const s = [];
  s.push(lane([[8.5, 15.6], at(F, R - 0.3, 262)], 2.2));
  s.push(lane([at(F, R - 0.3, 190), [17.4, 9.4], [18.1, 5.8]], 2));
  s.push(lane([at(F, R - 0.3, 5), [18.5, 24.5], [15.5, 31]], 2));
  s.push(disc(F, R));
  // The cordon: white picket all round; head-high hedge on the bank side only; waist-high hedge beside the arch;
  // the cove side is open down to a seat wall, so the fire shows from the pier.
  s.push(arc(F, 7.05, 16, 177, 'fence'), arc(F, 6.5, 202, 250, 'fence'));
  s.push(line([at(F, 6.85, 274), at(F, 6.85, 298), at(F, 10.0, 305), at(F, 10.1, 335), at(F, 6.85, 342), at(F, 6.85, 354)], 'fence'));
  s.push(arc(F, 6.45, 20, 172, 'hedge'), arc(F, 6.3, 276, 299, 'lowhedge'), arc(F, 6.3, 341, 352, 'lowhedge'));
  s.push(arc(F, 5.95, 74, 110, 'beds'), arc(F, 5.85, 278, 284, 'beds'), arc(F, 5.85, 342, 350, 'beds'));
  // East rim at floor level: the Derby stand, Lake Legends, the forest pine, Deep Sea, then seat wall.
  s.push(arc(F, R, 137, 176, 'wall'), arc(F, R + 0.5, 20, 136, 'retain'));
  s.push(boardAt(F, 5.9, 28, 'derby', 1.7), boardAt(F, 5.9, 58, 'lake'), boardAt(F, 5.9, 122, 'sea'), trophy(at(F, 6.5, 58)), trophy(at(F, 6.5, 122)));
  // Cove side: a low seat wall on the rim, and the inner seat wall in front of the walk.
  s.push(arc(F, R, 204, 248, 'wall'));
  s.push(arc(F, 3.4, 205, 245, 'wall'), arc(F, 3.4, 279, 345, 'wall'));
  s.push(boardAt(F, 5.7, 291, 'thanks', 1.7));
  s.push(poly([at(F, R - 0.1, 305), at(F, R - 0.1, 335), at(F, 7.45, 332), at(F, 7.45, 308)], 'cob'));
  s.push(stall(at(F, 8.55, 320), 140), woodpile(at(F, 10.05, 320), 140));
  s.push(crown(F, R, [16, 43, 76, 104, 137, 178, 202, 226, 250, 274, 304, 336, 354]));
  s.push(logs(F, 2.9, [33, 73, 113, 153]));
  s.push(fire(F, 1.05));
  s.push(arch(at(F, 6.4, 262), 262));
  s.push(tree([24.0, 23.2], 1.4));
  s.push(lamp(at(F, 7.6, 303), true), lamp([20.6, 23.9]), lamp([15.1, 10.7]), sign([18.6, 10.3]));
  // The Point, drawn whole: the old ring as the stones and rockets room, the totem where its fire was.
  s.push(line([[15.9, 9.4], [16.0, 7.8], [16.5, 6.4]], 'hedge'), line([[19.3, 9.2], [19.7, 7.4], [20.3, 6.2]], 'hedge'));
  s.push(arc(O, 3.55, 14, 122, 'hedge'));
  s.push(disc(O, 2.75), arc(O, 2.75, 11, 117, 'wall'), arc(O, 3.3, 11, 117, 'retain'));
  s.push(arc(O, 2.9, 125, 172, 'rope'), arc(O, 2.9, 198, 258, 'rope'), arc(O, 2.9, 278, 334, 'rope'));
  s.push(totem(O), lamp(at(O, 1.0, 40), true), rack(at(O, 2.3, 185)), stones(at(O, 2.3, 268)), sign(at(O, 2.4, 240)));
  s.push(box([16.9, 6.9], 1.5, 0.46, 250, 'log'), box([19.5, 6.6], 1.5, 0.46, 110, 'log'));
  s.push(lamp([19.9, 8.4]), lamp([15.4, 8.3]));
  s.push(label([18.0, 14.0], 'THE GREAT FIRE', 'mid big'));
  s.push(label([10.2, 19.4], "Pip's racks", 'mid'), label([5.6, 18.1], 'Smokehouse', 'mid'), label([9.4, 26.0], 'Net Mender', 'mid'));
  s.push(note(at(F, 6.4, 262), [8.2, 13.2], "gate arch: ANGLERS' REST", 'end'));
  s.push(note(at(F, R, 226), [9.4, 11.6], 'cove side open: a low seat wall (4), the fire seen from the pier', 'end'));
  s.push(note(at(F, 4.6, 232), [9.4, 10.0], 'the walk: 2 m behind the inner seat wall', 'end'));
  s.push(note(at(F, 3.4, 315), [12.6, 23.0], 'inner seat wall (6): sitters in front, walkers behind', 'end'));
  s.push(note(at(F, 8.55, 320), [12.6, 27.2], "Bram's Kettle, set back: its counter has its own apron", 'end'));
  s.push(note(at(F, 5.7, 291), [9.6, 21.4], 'Thank You', 'end'));
  s.push(note(at(F, 6.3, 288), [9.6, 24.8], 'waist-high hedge beside the arch', 'end'));
  s.push(note(at(F, 5.9, 58), [25.6, 22.6], 'Lake Legends + record fish'));
  s.push(note(at(F, 5.9, 28), [25.6, 24.4], 'Derby stand'));
  s.push(note(at(F, 5.9, 122), [25.6, 11.4], 'Deep Sea + record fish'));
  s.push(note(at(F, R, 150), [25.6, 13.2], 'seat wall (4)'));
  s.push(note(at(F, 5.8, 92), [25.6, 16.4], 'forest pine in the wall'));
  s.push(note(at(F, 2.9, 113), [25.6, 15.0], '4 log seats (8)'));
  s.push(note(at(F, 7.05, 40), [25.6, 20.4], 'picket fence + tall hedge'));
  s.push(note(at(F, 6.2, 5), [20.8, 26.6], 'south gateway, 2 m: lane up to the square'));
  s.push(note(at(F, 6.2, 190), [22.6, 9.6], 'north gateway, 2 m + signpost'));
  s.push(label([18.7, -0.6], 'THE POINT', 'mid big'));
  s.push(note(at(O, 2.3, 185), [11.6, 0.5], 'rocket rack on a stone plinth, lake side', 'end'));
  s.push(note(O, [11.6, 2.0], "Legends' Totem where the old fire was, lit by a lantern", 'end'));
  s.push(note(at(O, 2.3, 268), [11.6, 3.5], 'stone pile + skip sign, throwing north-west', 'end'));
  s.push(note(at(O, 2.9, 300), [11.6, 5.0], 'rope rail round the water side', 'end'));
  s.push(note([16.9, 6.9], [11.6, 6.5], '2 log seats at the lane end', 'end'));
  s.push(note(at(O, 2.75, 70), [23.4, 2.6], 'seat wall stays (5), hedge behind'));
  s.push(note([20.3, 6.2], [23.4, 6.6], 'hedged, lantern-lit lane'));
  return { id: 'c', title: 'C · Fireside Yard', base: 'base-town2.jpg', bpm: 29.032, bx0: -9.556, bz0: -2.5, view: V, ppm: 34, svg: s.join('') };
}

const CSS = `
*{box-sizing:border-box} body{margin:0;background:#222;font-family:"Helvetica Neue",Arial,sans-serif}
.plan{position:relative;overflow:hidden;background-repeat:no-repeat}
.plan svg{position:absolute;inset:0;width:100%;height:100%}
.wash{fill:#f6f1e3;fill-opacity:.32}
.cob{fill:#d8c5a3;fill-opacity:.96;stroke:#6f5b40;stroke-width:.12}
.lawn{fill:#bfe58a;fill-opacity:.7;stroke:#3a7a2a;stroke-width:.1;stroke-dasharray:.4 .25}
.beach{fill:#e9dfc2;fill-opacity:.95;stroke:#a8956a;stroke-width:.1;stroke-dasharray:.18 .22}
.pond{fill:#8fd2e4;fill-opacity:.95;stroke:#efe3b8;stroke-width:.45}
.lane{fill:none;stroke:#d8c5a3;stroke-linecap:round;stroke-linejoin:round}
.lane-e{fill:none;stroke:#6f5b40;stroke-linecap:round;stroke-linejoin:round}
.wall{fill:none;stroke:#8d8f94;stroke-width:.55;stroke-linecap:butt}
.plinth{fill:none;stroke:#7b7e85;stroke-width:.4;stroke-linecap:butt}
.kerbwall{fill:none;stroke:#63666c;stroke-width:.5;stroke-linecap:butt}
.way{fill:none;stroke:#fff;stroke-width:.08;stroke-dasharray:.3 .25;stroke-opacity:.9}
.rampart{fill:none;stroke:#6d7076;stroke-width:1.5;stroke-linecap:butt}
.rocks{fill:none;stroke:#7c7f84;stroke-width:.7;stroke-linecap:round;stroke-dasharray:.05 .95}
.beacharc{fill:none;stroke:#e9dfc2;stroke-width:1.4;stroke-opacity:.96;stroke-linecap:round}
.steps{fill:#bfb7a6;stroke:#5c574c;stroke-width:.08}
.trophy{fill:#ffcf4a;stroke:#5a3a1e;stroke-width:.06}
.wood{fill:#7a5232;stroke:#3a2414;stroke-width:.06}
.retain{fill:none;stroke:#4a4d54;stroke-width:.34;stroke-linecap:round}
.hedge{fill:none;stroke:#2f7d33;stroke-width:.75;stroke-linecap:round;stroke-linejoin:round;stroke-opacity:.95}
.lowhedge{fill:none;stroke:#6fb86a;stroke-width:.5;stroke-linecap:round;stroke-opacity:.95}
.beds{fill:none;stroke:#f08fb2;stroke-width:.6;stroke-linecap:round;stroke-dasharray:.05 .7}
.fence{fill:none;stroke:#ffffff;stroke-width:.17;stroke-dasharray:.5 .2;stroke-linejoin:round}
.rope{fill:none;stroke:#7a4b24;stroke-width:.13;stroke-dasharray:.12 .5;stroke-linecap:round}
.string{fill:none;stroke:#ffd44d;stroke-width:.13;stroke-dasharray:.02 .42;stroke-linecap:round}
.post{fill:#3a2414;stroke:#fff;stroke-width:.05}
.log{fill:#8a5a32;stroke:#40260f;stroke-width:.07}
.hearth{fill:#77746e;stroke:#3d3b38;stroke-width:.1}
.flame{fill:#ff8a1f}
.board{stroke-width:.09}
.board.lake{fill:#1f3d5a;stroke:#e2bb3c}.board.sea{fill:#14243f;stroke:#8fd8e6}.board.thanks{fill:#7a2452;stroke:#f2a7c3}
.board.derby{fill:none;stroke:#14243f;stroke-dasharray:.25 .2;stroke-width:.14}
.stall{fill:#a9cfe0;stroke:#4a6272;stroke-width:.1}.awning{fill:#e2684f;fill-opacity:.9;stroke:#fff;stroke-width:.06;stroke-dasharray:.3 .3}
.bench{fill:#9a6a3c;stroke:#3a2414;stroke-width:.06}.benchback{fill:#3a2414}
.arch{fill:#5a3a1e;stroke:#fff;stroke-width:.06}.gate{fill:#ffffff;stroke:#6b4a2b;stroke-width:.06}
.lamp{fill:#ffd44d;stroke:#3a2414;stroke-width:.07}.glow{fill:#ffd44d;fill-opacity:.25}
.leafy{fill:#63b54b;fill-opacity:.8;stroke:#2c6a26;stroke-width:.1}.pine{fill:#2f7d46;fill-opacity:.85;stroke:#164a26;stroke-width:.1}.trunk{fill:#5a3a1e}
.totem{fill:#b5653a;stroke:#fff;stroke-width:.07}
.stone{fill:#9a9a98;stroke:#55554f;stroke-width:.04}
.sign{fill:#f6ecd0;stroke:#5a3a1e;stroke-width:.06}
.rocket{fill:#d64545;stroke:#fff;stroke-width:.06}
.jetty{fill:#a9763f;stroke:#5a3a1e;stroke-width:.1}
.boat{fill:#5f8fb5;stroke:#fff;stroke-width:.06}.blanket{fill:#c0504d;stroke:#fff;stroke-width:.06}
.lead{stroke:#fff;stroke-width:.045;stroke-opacity:.9}
.lbl{fill:#fff;font-size:.5px;font-weight:700;paint-order:stroke;stroke:#10202a;stroke-width:.2px;stroke-linejoin:round}
.lbl.mid{text-anchor:middle}.lbl.big{font-size:.5px;letter-spacing:.06px;fill:#ffe9b8}
.title{fill:#fff;font-size:1.05px;font-weight:800;paint-order:stroke;stroke:#10202a;stroke-width:.28px}
.scale{stroke:#fff;stroke-width:.12}.scalet{fill:#fff;font-size:.55px;font-weight:700;paint-order:stroke;stroke:#10202a;stroke-width:.18px}
`;

const designs = [designA(), designB(), designC()];
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const meta = [];
for (const d of designs) {
  const [x0, z0, w, h] = d.view;
  const W = Math.round(w * d.ppm);
  const Hh = Math.round(h * d.ppm);
  const k = d.ppm / d.bpm;
  const img = fs.readFileSync(path.join(here, d.base)).toString('base64');
  const html = `<!doctype html><meta charset="utf-8"><style>${CSS}</style><div class="plan" id="p" style="width:${W}px;height:${Hh}px;background-image:url(data:image/jpeg;base64,${img});background-size:${1600 * k}px ${900 * k}px;background-position:${-(x0 - d.bx0) * d.ppm}px ${-(z0 - d.bz0) * d.ppm}px">
<svg viewBox="${x0} ${z0} ${w} ${h}" preserveAspectRatio="none"><rect class="wash" x="${x0}" y="${z0}" width="${w}" height="${h}"/>${d.svg}
<text class="title" x="${x0 + 0.5}" y="${z0 + 1.3}">${d.title}</text>
<line class="scale" x1="${x0 + w - 5.6}" y1="${z0 + 1.5}" x2="${x0 + w - 0.6}" y2="${z0 + 1.5}"/><text class="scalet" text-anchor="end" x="${x0 + w - 0.6}" y="${z0 + 1.1}">5 m · lake at the top · grid 4 m</text></svg></div>`;
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: Hh });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: path.join(here, `plan-${d.id}.jpg`), type: 'jpeg', quality: 86 });
  await page.close();
  meta.push({ id: d.id, W, H: Hh, view: d.view, svg: d.svg });
  console.log(`plan-${d.id}.jpg ${W}x${Hh}`);
}
await browser.close();
fs.writeFileSync(path.join(here, 'plans.json'), JSON.stringify(meta));

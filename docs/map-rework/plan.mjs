// Top-down plan renderer for lakeside layouts. Usage: node plan.mjs layout.json out.svg [--metrics]
// Replicates the game's terrain rules (src/game/env.ts) so sand/grass/water bands are true to the engine.
import fs from 'node:fs';

const [,, inFile, outFile, ...flags] = process.argv;
const L = JSON.parse(fs.readFileSync(inFile, 'utf8'));

// ---------- terrain (mirrors env.ts) ----------
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function makeInner(shore) {
  if (shore.kind === 'formula') { const f = new Function('t', `return ${shore.js};`); return (t) => f(t); }
  // samples: [[thetaDeg, r], ...] over -180..180, periodic, cosine-interpolated
  const pts = shore.points.map(([d, r]) => [(d * Math.PI) / 180, r]).sort((a, b) => a[0] - b[0]);
  return (t) => {
    while (t < -Math.PI) t += 2 * Math.PI; while (t > Math.PI) t -= 2 * Math.PI;
    let i = pts.findIndex((p) => p[0] > t); if (i === -1) i = pts.length;
    const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i % pts.length];
    let ta = a[0], tb = b[0]; if (i === 0) ta -= 2 * Math.PI; if (i === pts.length) tb += 2 * Math.PI;
    const u = (t - ta) / (tb - ta); const k = (1 - Math.cos(u * Math.PI)) / 2;
    return a[1] * (1 - k) + b[1] * k;
  };
}
const inner = makeInner(L.shore);
const pad = L.pad;
const PAD_BLEND = 10, BANK_SLOPE = 0.3;
const padWeight = (x, z) => 1 - smooth(pad.r, pad.r + PAD_BLEND, Math.hypot(x - pad.x, z - pad.z));
function raw(x, z) {
  const r = Math.hypot(x, z); const d = r - inner(Math.atan2(x, z));
  let base = -0.7 + 1.3 * smooth(-6, 1, d); if (d < -6) base += (d + 6) * 0.8;
  const dd = Math.max(0, d);
  const hills = Math.pow(dd, 1.2) * 0.1 * (0.6 + 0.4 * Math.sin(x * 0.05) * Math.cos(z * 0.06));
  const noise = Math.sin(x * 0.13) * Math.cos(z * 0.11) + 0.5 * Math.sin(x * 0.31 + z * 0.27);
  return base + hills + noise * Math.min(1, dd / 10) * 2.5;
}
function ground(x, z) {
  const g = raw(x, z); const w = padWeight(x, z); const blended = g + (pad.h - g) * w;
  const bank = pad.h - Math.max(0, Math.hypot(x - pad.x, z - pad.z) - pad.r) * BANK_SLOPE;
  return Math.max(blended, bank);
}
const onDock = (x, z, p = 0) => (L.docks || []).some((r) => x > r.x0 - p && x < r.x1 + p && z > r.z0 - p && z < r.z1 + p);
const isWater = (x, z) => ground(x, z) < -0.25 && !onDock(x, z, 0.3);

// ---------- frame ----------
const F = L.frame || { x0: -34, x1: 34, z0: -14, z1: 64 }; // metres
const S = 9; // px per metre
const W = (F.x1 - F.x0) * S, H = (F.z1 - F.z0) * S;
const px = (x) => (x - F.x0) * S, pz = (z) => (z - F.z0) * S;
const out = [];
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + 60}" viewBox="0 0 ${W} ${H + 60}" font-family="Helvetica, Arial, sans-serif">`);
out.push(`<rect width="${W}" height="${H + 60}" fill="#f6f1e6"/>`);

// terrain raster: one cell per 0.5 m, coloured like buildTerrain
const C = 0.5;
const grass = [0x6b, 0xb0, 0x4f], sand = [0xd8, 0xc5, 0x8f], dirt = [0xa5, 0x8b, 0x62], water = [0x3a, 0xa6, 0xb9], deep = [0x0d, 0x45, 0x60], rock = [0x7d, 0x7a, 0x74];
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const hex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const cells = new Map();
for (let z = F.z0; z < F.z1; z += C) for (let x = F.x0; x < F.x1; x += C) {
  const y = ground(x + C / 2, z + C / 2);
  let c;
  if (y < -0.25) { c = lerp(water, deep, smooth(-0.25, -4, y)); }
  else {
    const n = 0.88 + 0.24 * (Math.sin(x * 0.4) * Math.cos(z * 0.37) * 0.5 + 0.5);
    c = sand.map((v) => v * (0.65 + 0.35 * smooth(-1.2, 0.4, y)));
    c = lerp(c, grass.map((v) => v * n), smooth(0.3, 1.6, y));
    if (y > 12) c = lerp(c, rock, Math.min(1, (y - 12) / 14));
    const pw = padWeight(x, z); if (pw > 0) c = lerp(c, dirt, pw * 0.85);
    // hill shading: darker as it climbs
    if (y > 2) c = c.map((v) => v * Math.max(0.55, 1 - (y - 2) * 0.04));
  }
  const k = hex(c); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(`M${px(x)} ${pz(z)}h${C * S}v${C * S}h-${C * S}z`);
}
for (const [k, d] of cells) out.push(`<path fill="${k}" d="${d.join('')}"/>`);
// contour at the water line and the 2 m line
function contour(level, stroke, dash) {
  const segs = [];
  const CC = 0.5;
  for (let z = F.z0; z < F.z1; z += CC) for (let x = F.x0; x < F.x1; x += CC) {
    const a = ground(x, z) > level, b = ground(x + CC, z) > level, c = ground(x, z + CC) > level;
    if (a !== b) segs.push(`M${px(x + CC)} ${pz(z)}v${CC * S}`);
    if (a !== c) segs.push(`M${px(x)} ${pz(z + CC)}h${CC * S}`);
  }
  out.push(`<path d="${segs.join('')}" stroke="${stroke}" stroke-width="1" fill="none" ${dash ? 'stroke-dasharray="3 3"' : ''}/>`);
}
contour(-0.25, '#1d5f70', false);
contour(2.5, '#4a6a30', true);

// square, paths
const paths = L.paths || [];
for (const p of paths) out.push(`<line x1="${px(p.from[0])}" y1="${pz(p.from[1])}" x2="${px(p.to[0])}" y2="${pz(p.to[1])}" stroke="#c9b58f" stroke-width="${(p.w || 1.6) * S}" stroke-linecap="round" opacity="0.9"/>`);
if (L.square && L.square.r > 0) out.push(`<circle cx="${px(L.square.x)}" cy="${pz(L.square.z)}" r="${L.square.r * S}" fill="#b9a99a" stroke="#8d7f72" stroke-width="1.5"/><circle cx="${px(L.square.x)}" cy="${pz(L.square.z)}" r="${1.1 * S}" fill="#8f8a80" stroke="#5a5048"/>`);
// docks
for (const r of L.docks || []) out.push(`<rect x="${px(r.x0)}" y="${pz(r.z0)}" width="${(r.x1 - r.x0) * S}" height="${(r.z1 - r.z0) * S}" fill="#b07a46" stroke="#6b4a2b" stroke-width="1.5"/>`);
// houses
const arrow = (x, z, f, len = 1.6) => `<line x1="${px(x)}" y1="${pz(z)}" x2="${px(x + Math.sin(f) * len)}" y2="${pz(z + Math.cos(f) * len)}" stroke="#222" stroke-width="1.2" marker-end="url(#ah)"/>`;
out.push(`<defs><marker id="ah" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6z" fill="#222"/></marker></defs>`);
for (const h of L.houses || []) {
  const w = (h.w || 5) * S, d = (h.d || 4.2) * S;
  const deg = (-h.facing * 180) / Math.PI;
  out.push(`<g transform="translate(${px(h.x)} ${pz(h.z)}) rotate(${deg})"><rect x="${-w / 2}" y="${-d / 2}" width="${w}" height="${d}" fill="${h.roof || '#b5473a'}" stroke="#4a2a1a" stroke-width="1.5" rx="2"/><line x1="${-w / 2}" y1="0" x2="${w / 2}" y2="0" stroke="#4a2a1a" stroke-width="1"/></g>`);
  out.push(arrow(h.x, h.z, h.facing, 2.6));
  if (h.sign) out.push(`<text x="${px(h.x)}" y="${pz(h.z) + 3}" font-size="8" text-anchor="middle" fill="#fff" stroke="#000" stroke-width="2" paint-order="stroke">${esc(h.sign)}</text>`);
}
// props
const propIcon = {
  lamp: (x, z) => `<circle cx="${px(x)}" cy="${pz(z)}" r="2.5" fill="#ffd27a" stroke="#333" stroke-width="1"/>`,
  'lit-lamp': (x, z) => `<circle cx="${px(x)}" cy="${pz(z)}" r="7" fill="#ffd27a" opacity="0.35"/><circle cx="${px(x)}" cy="${pz(z)}" r="2.8" fill="#ffb84a" stroke="#333" stroke-width="1.2"/>`,
  tree: (x, z, p) => `<circle cx="${px(x)}" cy="${pz(z)}" r="${(p.r || 1.6) * S}" fill="#3f8f43" stroke="#2a5c2c" stroke-width="1"/>`,
  bench: (x, z, p) => `<rect x="${px(x) - 7}" y="${pz(z) - 2}" width="14" height="4" fill="#8a5a30" stroke="#333" stroke-width="0.8" transform="rotate(${(-(p.facing || 0) * 180) / Math.PI} ${px(x)} ${pz(z)})"/>`,
  rack: (x, z, p) => `<rect x="${px(x) - 9}" y="${pz(z) - 3}" width="18" height="6" fill="none" stroke="#6b4a2b" stroke-width="1.5" transform="rotate(${(-(p.facing || 0) * 180) / Math.PI} ${px(x)} ${pz(z)})"/>`,
  boat: (x, z, p) => `<ellipse cx="${px(x)}" cy="${pz(z)}" rx="11" ry="4.5" fill="#c9a06b" stroke="#6b4a2b" stroke-width="1.2" transform="rotate(${(-(p.facing || 0) * 180) / Math.PI} ${px(x)} ${pz(z)})"/>`,
  flowers: (x, z, p) => `<rect x="${px(x) - ((p.w || 2) * S) / 2}" y="${pz(z) - ((p.d || 0.8) * S) / 2}" width="${(p.w || 2) * S}" height="${(p.d || 0.8) * S}" fill="#e76f9a" stroke="#8a3b5a" stroke-width="0.8"/>`,
  rock: (x, z, p) => `<circle cx="${px(x)}" cy="${pz(z)}" r="${(p.r || 0.6) * S}" fill="#7d7a74" stroke="#444"/>`,
  firepit: (x, z) => `<circle cx="${px(x)}" cy="${pz(z)}" r="5" fill="#e06a2a" stroke="#333" stroke-width="1"/>`,
  'string-lights': (x, z, p) => `<line x1="${px(p.x0)}" y1="${pz(z)}" x2="${px(p.x1)}" y2="${pz(z)}" stroke="#ffd27a" stroke-width="1.5" stroke-dasharray="2 3"/>`,
  fence: (x, z, p) => `<line x1="${px(p.x0)}" y1="${pz(p.z0)}" x2="${px(p.x1)}" y2="${pz(p.z1)}" stroke="#f3ead2" stroke-width="2.5" stroke-dasharray="3 2"/>`,
  blanket: (x, z) => `<rect x="${px(x) - 7}" y="${pz(z) - 7}" width="14" height="14" fill="#e8d7b0" stroke="#8a6a4a" stroke-width="0.8" transform="rotate(20 ${px(x)} ${pz(z)})"/>`,
  pot: (x, z) => `<circle cx="${px(x)}" cy="${pz(z)}" r="3" fill="#4a9a4a" stroke="#8a3b32" stroke-width="1.2"/>`,
  logs: (x, z) => `<rect x="${px(x) - 5}" y="${pz(z) - 3}" width="10" height="6" fill="#7a5230" stroke="#333" stroke-width="0.8"/>`,
  bridge: (x, z, p) => `<rect x="${px(p.x0)}" y="${pz(p.z0)}" width="${(p.x1 - p.x0) * S}" height="${(p.z1 - p.z0) * S}" fill="#b07a46" stroke="#6b4a2b" stroke-width="1.5"/>`,
  'lily-pads': (x, z, p) => `<circle cx="${px(x)}" cy="${pz(z)}" r="${(p.r || 2) * S}" fill="#5fae5a" opacity="0.5" stroke="#2a5c2c" stroke-dasharray="2 2"/>`,
  reeds: (x, z, p) => `<circle cx="${px(x)}" cy="${pz(z)}" r="${(p.r || 1.5) * S}" fill="#9cb36a" opacity="0.6" stroke="#5a7a30" stroke-dasharray="1 2"/>`,
  custom: (x, z, p) => `<rect x="${px(x) - ((p.w || 2) * S) / 2}" y="${pz(z) - ((p.d || 2) * S) / 2}" width="${(p.w || 2) * S}" height="${(p.d || 2) * S}" fill="#d9c3e0" stroke="#5a3a6a" stroke-width="1.2" transform="rotate(${(-(p.facing || 0) * 180) / Math.PI} ${px(x)} ${pz(z)})"/>`,
};
for (const p of L.props || []) { const f = propIcon[p.kind] || propIcon.custom; out.push(f(p.x ?? 0, p.z ?? 0, p)); if (p.label) out.push(`<text x="${px(p.x)}" y="${pz(p.z) - 6}" font-size="7" text-anchor="middle" fill="#333">${esc(p.label)}</text>`); }
// spots (interactables), NPCs, bottles
const spotStyle = { spawn: '#ffffff', dock_end: '#ffe9a8', shop: '#d9534f', smokehouse: '#5a3e2b', gate: '#b53a3a', leaderboard: '#2a6fc4', thanks: '#b5476e', mirror: '#f2c14e', campfire: '#ff7a2a', worms: '#c9a06b', reed: '#2f4f4f', plane: '#8fb8c8', charters_sign: '#6f9e96', furthest: '#9fe8ff', well: '#8f8a80' };
for (const s of L.spots || []) {
  const c = spotStyle[s.id] || '#d9c3e0';
  out.push(`<circle cx="${px(s.x)}" cy="${pz(s.z)}" r="6" fill="${c}" stroke="#111" stroke-width="1.5"/>`);
  if (s.facing !== undefined) out.push(arrow(s.x, s.z, s.facing, 2.2));
  out.push(`<text x="${px(s.x)}" y="${pz(s.z) - 8}" font-size="9" font-weight="bold" text-anchor="middle" fill="#111" stroke="#fff" stroke-width="2.5" paint-order="stroke">${esc(s.label || s.id)}</text>`);
}
for (const n of L.npcs || []) {
  out.push(`<circle cx="${px(n.x)}" cy="${pz(n.z)}" r="4" fill="#ffffff" stroke="#111" stroke-width="1.5"/>`);
  out.push(`<text x="${px(n.x)}" y="${pz(n.z) + 12}" font-size="7.5" font-style="italic" text-anchor="middle" fill="#111" stroke="#fff" stroke-width="2" paint-order="stroke">${esc(n.name)}</text>`);
  if (n.walk) { const pts = [[n.x, n.z], ...n.walk.map((s) => [s[0], s[1]]), [n.x, n.z]]; out.push(`<polyline points="${pts.map(([x, z]) => `${px(x)},${pz(z)}`).join(' ')}" fill="none" stroke="#fff" stroke-width="1" stroke-dasharray="2 2" opacity="0.8"/>`); }
}
for (const b of L.bottles || []) out.push(`<text x="${px(b.x)}" y="${pz(b.z) + 4}" font-size="10" text-anchor="middle">🍾</text>`);
// sightlines
for (const sl of L.sightlines || []) out.push(`<line x1="${px(sl.from[0])}" y1="${pz(sl.from[1])}" x2="${px(sl.to[0])}" y2="${pz(sl.to[1])}" stroke="#ff2d8a" stroke-width="1.2" stroke-dasharray="6 3" opacity="0.8"/>`);
// grid every 10 m + axes labels
for (let x = Math.ceil(F.x0 / 10) * 10; x <= F.x1; x += 10) { out.push(`<line x1="${px(x)}" y1="0" x2="${px(x)}" y2="${H}" stroke="#000" stroke-width="0.4" opacity="0.25"/><text x="${px(x) + 2}" y="${H - 3}" font-size="8" fill="#222">x=${x}</text>`); }
for (let z = Math.ceil(F.z0 / 10) * 10; z <= F.z1; z += 10) { out.push(`<line x1="0" y1="${pz(z)}" x2="${W}" y2="${pz(z)}" stroke="#000" stroke-width="0.4" opacity="0.25"/><text x="2" y="${pz(z) - 2}" font-size="8" fill="#222">z=${z}</text>`); }
// title + legend
out.push(`<rect x="0" y="${H}" width="${W}" height="60" fill="#fff8ea"/>`);
out.push(`<text x="8" y="${H + 18}" font-size="14" font-weight="bold" fill="#222">${esc(L.name || inFile)}</text>`);
out.push(`<text x="8" y="${H + 34}" font-size="9" fill="#333">Top = toward the lake (-z); camera yaw 0 looks up this page. 1 grid square = 10 m. Dashed green = 2.5 m contour (hills). Pink dashes = sightlines.</text>`);
out.push(`<text x="8" y="${H + 48}" font-size="9" fill="#333">${esc((L.notes || '').slice(0, 180))}</text>`);
out.push('</svg>');
fs.writeFileSync(outFile, out.join('\n'));

// ---------- metrics ----------
if (flags.includes('--metrics')) {
  const WALK = 4.2;
  const spots = Object.fromEntries((L.spots || []).map((s) => [s.id, s]));
  const d = (a, b) => (spots[a] && spots[b] ? Math.hypot(spots[a].x - spots[b].x, spots[a].z - spots[b].z) : NaN);
  const pairs = [['spawn', 'dock_end'], ['dock_end', 'shop'], ['shop', 'smokehouse'], ['shop', 'gate'], ['dock_end', 'gate'], ['dock_end', 'reed'], ['shop', 'reed'], ['shop', 'leaderboard'], ['shop', 'mirror'], ['shop', 'campfire']];
  console.log('Straight-line walks (m, s at 4.2 m/s):');
  for (const [a, b] of pairs) { const m = d(a, b); if (!isNaN(m)) console.log(`  ${a} -> ${b}: ${m.toFixed(1)} m, ${(m / WALK).toFixed(1)} s`); }
  const props = L.props || [];
  const count = (k) => props.filter((p) => p.kind === k).length;
  console.log(`Props: lamps ${count('lamp')} (+${count('lit-lamp')} with point lights), trees ${count('tree')}, benches ${count('bench')}, houses ${(L.houses || []).length}, docks ${(L.docks || []).length} rects, total props ${props.length}`);
  // validity: every spot on land (or dock), every dock rect touching water
  for (const s of L.spots || []) { if (s.id === 'plane') continue; const y = ground(s.x, s.z); const ok = !isWater(s.x, s.z); console.log(`  ${ok ? 'ok ' : 'WATER'} ${s.id} y=${y.toFixed(2)} ${y > 2.5 ? '(on a hill)' : ''}`); }
  for (const n of L.npcs || []) { if (isWater(n.x, n.z)) console.log(`  WATER npc ${n.name}`); for (const st of n.walk || []) if (isWater(st[0], st[1])) console.log(`  WATER walk stop of ${n.name} at ${st}`); }
  for (const h of L.houses || []) { const y = ground(h.x, h.z); if (isWater(h.x, h.z) || y > 2.5) console.log(`  house at ${h.x},${h.z} y=${y.toFixed(2)} ${isWater(h.x, h.z) ? 'IN WATER' : 'on a hill'}`); }
  for (const r of L.docks || []) { const wet = [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1], [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2]].filter(([x, z]) => ground(x, z) < -0.25).length; console.log(`  dock ${JSON.stringify(r)}: ${wet}/5 corners over water`); }
  // footprint
  const xs = [...(L.spots || []), ...(L.houses || []), ...(L.npcs || [])]; const bx = [Math.min(...xs.map((s) => s.x)), Math.max(...xs.map((s) => s.x))], bz = [Math.min(...xs.map((s) => s.z)), Math.max(...xs.map((s) => s.z))];
  console.log(`Footprint of placed things: x ${bx[0].toFixed(0)}..${bx[1].toFixed(0)} (${(bx[1] - bx[0]).toFixed(0)} m), z ${bz[0].toFixed(0)}..${bz[1].toFixed(0)} (${(bz[1] - bz[0]).toFixed(0)} m)`);
}

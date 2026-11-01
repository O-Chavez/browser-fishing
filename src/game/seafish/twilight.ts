import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SHAPES, envelope } from '../../data/fishlook';
import type { TwilightParts } from '../../data/seaparts/twilight';
import type { SeaIconCtx, SeaIconLayers, SeaModelCtx } from './types';

// The Twilight, "lit from within": dark or silvery bodies that make their own light. Every fish gets a soft accent
// glow around its edge, then its own parts: rows of glowing lights, a chin lure, a chandelier of lures, tube eyes,
// fangs, a glass body, the oarfish's crest and plume. Geometry is merged per fish (one mesh for a whole row of
// lights) and cached by species, so a fish costs a handful of draw calls.

// ---------- 3D ----------

const geos = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geos.get(key);
  if (!g) geos.set(key, (g = make()));
  return g;
}
const sph = (r: number, w = 5, h = 3) => cached(`s${r}|${w}|${h}`, () => new THREE.SphereGeometry(r, w, h));
const merge = (list: THREE.BufferGeometry[]) => mergeGeometries(list)!;
const moved = (g: THREE.BufferGeometry, p: THREE.Vector3) => g.clone().translate(p.x, p.y, p.z);

const WHITE = new THREE.Color(0xffffff);
const toothMat = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.4, emissive: 0x3a3228 });
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const sparkGeo = () => cached('spark', () => new THREE.OctahedronGeometry(0.014));
const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xf6f6f0 });
const eyePupil = new THREE.MeshBasicMaterial({ color: 0x111111 });
const mouthMat = new THREE.MeshBasicMaterial({ color: 0x120a1c });

export function twilightModel(ctx: SeaModelCtx): void {
  const tp = ctx.look.twilight;
  if (!tp) return;
  const { group, id, pulse, twinkle, body } = ctx;
  const sh = SHAPES[ctx.look.shape];
  const gold = new THREE.Color(0xffe27a);
  /** A part's colour; shinies take on gold. */
  const tint = (c: number) => {
    const col = new THREE.Color(c);
    return ctx.shiny ? col.lerp(gold, 0.55) : col;
  };
  const acc = ctx.accent;
  const glowMat = (color: THREE.Color, opacity: number, side: THREE.Side = THREE.FrontSide) => {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side });
    pulse.push(m);
    return m;
  };
  const coreMat = (color: THREE.Color, white = 0.6) => new THREE.MeshBasicMaterial({ color: color.clone().lerp(WHITE, white) });
  const sprite = (color: THREE.Color, size: number, opacity: number) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.setScalar(size);
    pulse.push(s.material);
    return s;
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  /** How far the wave lifts the body's centre line at t (a point along the body). */
  const wave = tp.wave;
  const yo = (t: number) => (wave ? -wave[0] * Math.sin(Math.PI * 2 * wave[1] * t) * (0.25 + 0.75 * t) : 0);
  /** A point on the skin at t, `a` radians below the side line (negative: above), on one side. */
  const surf = (t: number, a: number, side: number, lift = 1.03) => {
    const e = ctx.extents(t);
    const s = Math.sin(a);
    return V(side * Math.cos(a) * e.x * lift, -s * e.y * (s > 0 ? 1 + sh.sag / sh.h : 1) * lift + yo(t), -0.5 + t);
  };
  const top = (t: number) => ctx.extents(t).y + yo(t);

  // The finish: a glow in the accent colour, a faint light of its own in the skin and fins.
  const bodyMat = ctx.bodyMat;
  bodyMat.emissive.set(ctx.L.belly).multiplyScalar(tp.glass ? 0.3 : 0.17);
  ctx.finMat.emissive.copy(acc).multiplyScalar(0.2);
  if (id === 'lanternshark') {
    // Velvet: a soft sheen, no gloss.
    bodyMat.roughness = 0.9;
    bodyMat.clearcoat = 0;
    bodyMat.sheen = 1;
    bodyMat.sheenRoughness = 0.45;
    bodyMat.sheenColor.copy(tint(0x9a8aff));
  }
  if (tp.glass) {
    bodyMat.transparent = true;
    bodyMat.opacity = 0.62;
    bodyMat.roughness = 0.15;
  }

  // A wavy body: a bent copy of the shared shape, and everything already on it follows the wave.
  if (wave) {
    for (const c of group.children) if (c !== body) c.position.y += yo(c.position.z + 0.5);
    body.geometry = cached(`${id}:bent`, () => {
      const g = body.geometry.clone();
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + yo(p.getZ(i) + 0.5));
      g.computeVertexNormals();
      return g;
    });
  }
  if (tp.tailH) ctx.tail.scale.y = tp.tailH;

  // The soft edge glow, like the jewel fish's: a shell just outside the body, and a halo behind it.
  const rim = new THREE.Mesh(
    cached(`${id}:rim`, () => {
      // A coarse copy of the body's shape (the same stretch as the body, a quarter of the triangles), a little fatter.
      const g = new THREE.SphereGeometry(0.5, 20, 12).rotateX(Math.PI / 2);
      const p = g.attributes.position;
      const sx = Math.min(1.9, 1 + 0.016 / sh.w);
      const sy = Math.min(1.7, 1 + 0.02 / sh.h);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const y = p.getY(i);
        const z = p.getZ(i);
        const rho = Math.hypot(x, y);
        const nx = rho > 1e-6 ? x / rho : 0;
        const ny = rho > 1e-6 ? y / rho : 0;
        const env = envelope(ctx.look.shape, z + 0.5);
        const sag = ny < 0 ? sh.sag * env * -ny : 0;
        p.setXYZ(i, nx * sh.w * env * sx, (ny * sh.h * env - sag) * sy + yo(z + 0.5), z * 1.03);
      }
      return g;
    }),
    glowMat(acc.clone(), 0.3, THREE.BackSide),
  );
  group.add(rim);
  const halo0 = sprite(acc.clone(), ctx.look.shape === 'ribbon' ? 1.1 : ctx.look.shape === 'bulb' ? 1.9 : 1.45, 0.2);
  halo0.position.set(0, 0, -0.02);
  group.add(halo0);

  // Glowing eyes: a cartoon eye with a lit iris and a halo.
  if (tp.eye) {
    const { t, r, color } = tp.eye;
    const e = ctx.extents(t);
    const iris = new THREE.MeshBasicMaterial({ color: tint(color).lerp(WHITE, 0.15) });
    const halo = glowMat(tint(color), 0.32);
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(sph(r, 12, 8), eyeWhite);
      w.position.set(s * e.x * 0.78, e.y * 0.28 + yo(t), -0.5 + t);
      const ir = new THREE.Mesh(sph(r * 0.74, 10, 6), iris);
      ir.position.set(s * r * 0.4, r * 0.06, -r * 0.3);
      w.add(ir);
      const p = new THREE.Mesh(sph(r * 0.4, 8, 5), eyePupil);
      p.position.set(s * r * 0.75, r * 0.08, -r * 0.45);
      w.add(p);
      w.add(new THREE.Mesh(sph(r * 1.5, 8, 5), halo));
      group.add(w);
    }
  }

  // A row of lights, a core and a halo each: two merged meshes for the whole row.
  if (tp.lights) {
    const l = tp.lights;
    const col = tint(l.color);
    const key = `${id}:lights`;
    if (!geos.has(key)) {
      const cores: THREE.BufferGeometry[] = [];
      const halos: THREE.BufferGeometry[] = [];
      const a = l.row === 'flank' ? 0.3 : 1.15;
      for (let i = 0; i < l.n; i++) {
        const t = l.from + ((l.to - l.from) * i) / Math.max(1, l.n - 1);
        const r = (l.r ?? 0.011) * (0.7 + 0.3 * Math.sin(Math.PI * t));
        for (const s of [-1, 1]) {
          const p = surf(t, a, s, 1.02);
          cores.push(moved(sph(r), p));
          halos.push(moved(sph(r * 2.4), p));
        }
      }
      geos.set(key, merge(cores));
      geos.set(`${key}:halo`, merge(halos));
    }
    group.add(new THREE.Mesh(geos.get(key)!, coreMat(col)));
    group.add(new THREE.Mesh(geos.get(`${key}:halo`)!, glowMat(col, 0.3)));
  }

  // Glass: a faint spine and ribs inside the see-through body.
  if (tp.glass) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xcfe2f2, roughness: 0.5, emissive: 0x2a3a4a });
    group.add(
      new THREE.Mesh(
        cached(`${id}:spine`, () => {
          const parts = [new THREE.CylinderGeometry(0.003, 0.008, 0.72, 5).rotateX(Math.PI / 2).translate(0, 0, 0.02)];
          for (let i = 0; i < 9; i++) {
            const t = 0.2 + i * 0.065;
            const e = ctx.extents(t);
            const len = e.y * 0.75;
            parts.push(new THREE.CylinderGeometry(0.0024, 0.0016, len, 3).rotateX(0.35).translate(0, -len * 0.5 - e.y * 0.05, -0.5 + t));
          }
          return merge(parts);
        }),
        mat,
      ),
    );
  }

  // Tube eyes: pale tubes pointing straight up, tipped with a glowing cyan lens.
  if (tp.tubeEye) {
    const t = 0.17;
    const e = ctx.extents(t);
    const tube = new THREE.MeshStandardMaterial({ color: 0xa8d8f4, roughness: 0.35, emissive: 0x1a3c5c });
    const lens = new THREE.MeshBasicMaterial({ color: tint(0x3ac8ff).lerp(WHITE, 0.1) });
    const halo = glowMat(tint(0x6fd8ff), 0.14);
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(s * e.x * 0.55, e.y * 0.8, -0.5 + t);
      g.rotation.set(-0.5, 0, -s * 0.1);
      g.add(new THREE.Mesh(cached('tube', () => new THREE.CylinderGeometry(0.036, 0.04, 0.13, 8).translate(0, 0.065, 0)), tube));
      const cap = new THREE.Mesh(sph(0.04, 8, 5), lens);
      cap.position.y = 0.135;
      cap.scale.y = 0.75;
      g.add(cap);
      const pupil = new THREE.Mesh(sph(0.026, 6, 4), eyePupil);
      pupil.position.set(0, 0.15, -0.016);
      pupil.scale.y = 0.5;
      g.add(pupil);
      const h = new THREE.Mesh(sph(0.07, 8, 5), halo);
      h.position.y = 0.135;
      g.add(h);
      group.add(g);
    }
  }

  /** Cones for teeth: tip down (or up) from each base point. */
  type Tooth = { p: THREE.Vector3; len: number; r: number; up?: boolean };
  const teeth = (items: Tooth[], key: string) => {
    const g = cached(key, () =>
      merge(items.map(({ p, len, r, up }) => {
        const c = new THREE.ConeGeometry(r, len, 4);
        if (!up) c.rotateX(Math.PI);
        return c.translate(0, up ? len / 2 : -len / 2, 0).translate(p.x, p.y, p.z);
      })),
    );
    group.add(new THREE.Mesh(g, toothMat));
  };
  const f = tp.fangs;
  if (f && !f.grin) {
    // Fangs too big for the mouth: long ones hanging past the jaw, short ones pushing up from below.
    const items: Tooth[] = [];
    for (let i = 0; i < f.n; i++) {
      for (const s of [-1, 1]) {
        items.push({ p: surf(0.03 + i * 0.032, 0.32, s, 1.0), len: f.len * (i % 2 ? 0.65 : 1), r: 0.009 });
        if (i % 2 === 0) items.push({ p: surf(0.04 + i * 0.032, 0.62, s, 1.0), len: f.len * 0.5, r: 0.007, up: true });
      }
    }
    teeth(items, `${id}:fangs`);
  }
  if (f?.grin) {
    // A big toothy grin curving around the bulb's head: a dark mouth line with teeth top and bottom.
    const items: Tooth[] = [];
    const grin = (t: number) => 0.55 - 2.2 * t;
    for (let i = 0; i < f.n; i++) {
      const t = 0.02 + i * 0.038;
      for (const s of [-1, 1]) {
        items.push({ p: surf(t, grin(t), s, 1.0), len: f.len * (0.8 + 0.2 * Math.sin((i / f.n) * Math.PI)), r: 0.012 });
        items.push({ p: surf(t + 0.016, grin(t) + 0.2, s, 1.0), len: f.len * 0.7, r: 0.011, up: true });
      }
    }
    teeth(items, `${id}:grin`);
    const lines = cached(`${id}:mouth`, () =>
      merge([-1, 1].map((s) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 8 }, (_, i) => surf(0.01 + i * 0.04, grin(0.01 + i * 0.04) + 0.1, s, 1.0))), 12, 0.007, 3))),
    );
    group.add(new THREE.Mesh(lines, mouthMat));
  }

  // The dragonfish's chin lure: a barbel curving down and forward, a red lamp on the end.
  if (tp.chinLure) {
    const col = tint(tp.chinLure);
    const b = surf(0.045, Math.PI / 2, 1, 1.0).setX(0);
    const tip = b.clone().add(V(0, -0.17, -0.015));
    const stalk = new THREE.Mesh(
      cached(`${id}:barbel`, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([b, b.clone().add(V(0, -0.045, 0.055)), b.clone().add(V(0, -0.11, 0.04)), tip]), 10, 0.0034, 4)),
      new THREE.MeshStandardMaterial({ color: ctx.L.fin, roughness: 0.6 }),
    );
    group.add(stalk);
    const lamp = new THREE.Mesh(sph(0.02, 8, 6), coreMat(col));
    lamp.position.copy(tip);
    group.add(lamp);
    const h = sprite(col, 0.2, 0.7);
    h.position.copy(tip);
    group.add(h);
  }

  // The angler's chandelier: curved stalks fanning forward and up, a golden lamp on each.
  if (tp.lures) {
    const col = tint(tp.lures.color);
    const n = tp.lures.n;
    const stalks: THREE.BufferGeometry[] = [];
    const tips: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const u = n > 1 ? i / (n - 1) - 0.5 : 0;
      const t = 0.1 + i * 0.03;
      const b = V(u * 0.05, top(t) * 0.98, -0.5 + t);
      const rise = 0.17 + (i % 2) * 0.12 + (1 - Math.abs(u * 2)) * 0.06;
      const tip = V(u * 0.3, b.y + rise, -0.46 - (u + 0.5) * 0.2);
      tips.push(tip);
      stalks.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([b, V(u * 0.12, b.y + rise * 0.7, b.z + 0.035), tip]), 8, 0.0045, 4));
    }
    group.add(new THREE.Mesh(cached(`${id}:stalks`, () => merge(stalks)), new THREE.MeshStandardMaterial({ color: new THREE.Color(ctx.L.fin).lerp(col, 0.4), roughness: 0.5, emissive: col.clone().multiplyScalar(0.25) })));
    const core = coreMat(col, 0.3);
    for (const p of tips) {
      const lamp = new THREE.Mesh(sph(0.034, 8, 6), core);
      lamp.position.copy(p);
      group.add(lamp);
      const h = sprite(col, 0.28, 0.5);
      h.position.copy(p);
      group.add(h);
      const star = new THREE.Mesh(sparkGeo(), sparkMat);
      star.position.copy(p).add(V(0, 0.06, 0));
      group.add(star);
      twinkle.push(star);
    }
  }

  // The oarfish: a red crest the whole length of the back, and a plume of long rays with glowing tips.
  if (tp.crest) {
    const start = 0.04;
    const end = 0.97;
    const pts: [number, number][] = [];
    const steps = 46;
    for (let i = 0; i <= steps; i++) {
      const t = start + ((end - start) * i) / steps;
      pts.push([t - start, top(t) * 0.92 + (i % 2 ? 0.026 : 0.05) * (0.5 + 0.5 * Math.min(1, (1 - t) * 4))]);
    }
    for (let i = steps; i >= 0; i--) {
      const t = start + ((end - start) * i) / steps;
      pts.push([t - start, top(t) * 0.5]);
    }
    const crest = new THREE.Mesh(ctx.finGeo(pts), ctx.finMat);
    crest.position.z = -0.5 + start;
    group.add(crest);

    const col = tint(ctx.look.fin);
    const rays: THREE.BufferGeometry[] = [];
    const cores: THREE.BufferGeometry[] = [];
    const halos: THREE.BufferGeometry[] = [];
    const tips: THREE.Vector3[] = [];
    for (let i = 0; i < 6; i++) {
      const t = 0.03 + i * 0.012;
      const u = i - 2.5;
      const b = V(0, top(t) * 0.9, -0.5 + t);
      const tip = b.clone().add(V(u * 0.016, 0.24 - i * 0.014, 0.05 + i * 0.04));
      const mid = b.clone().add(V(u * 0.008, 0.24, 0.012 + i * 0.006));
      tips.push(tip);
      rays.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(b, mid, tip), 8, 0.0036, 3));
      cores.push(moved(sph(0.011, 6, 4), tip));
      halos.push(moved(sph(0.03, 6, 4), tip));
    }
    group.add(new THREE.Mesh(cached(`${id}:rays`, () => merge(rays)), ctx.finMat));
    group.add(new THREE.Mesh(cached(`${id}:raycores`, () => merge(cores)), coreMat(col)));
    group.add(new THREE.Mesh(cached(`${id}:rayhalos`, () => merge(halos)), glowMat(col, 0.38)));
    for (const p of [tips[1], tips[4]]) {
      const star = new THREE.Mesh(sparkGeo(), sparkMat);
      star.position.copy(p).add(V(0, 0.03, 0));
      group.add(star);
      twinkle.push(star);
    }
  }
}

// ---------- icon ----------

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
function mixHex(c: number, to: number, t: number): number {
  const out = [16, 8, 0].map((s) => Math.round(((c >> s) & 255) + (((to >> s) & 255) - ((c >> s) & 255)) * t) << s);
  return out[0] | out[1] | out[2];
}
const f1 = (n: number) => Math.round(n * 10) / 10;

export function twilightIcon(ctx: SeaIconCtx): SeaIconLayers | null {
  const tp: TwilightParts | undefined = ctx.look.twilight;
  if (!tp) return null;
  const { k, hidden, HEAD, MID, topAt, botAt, xAt, ink, accent } = ctx;
  const col = (c: number) => (hidden ? ink : hex(ctx.shiny ? mixHex(c, 0xffe27a, 0.55) : c));
  /** A lit dot: a blurred halo, a white core and a coloured centre. Nothing but ink when hidden. */
  const dot = (x: number, y: number, r: number, c: number) =>
    hidden
      ? `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${ink}"/>`
      : `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 2.3)}" fill="${col(c)}" opacity=".55" filter="url(#tg${k})"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="#fff"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 0.65)}" fill="${col(c)}" opacity=".85"/>`;
  /** A round eye with a lit iris. */
  const eye = (x: number, y: number, r: number, c: number) =>
    hidden
      ? ''
      : `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 1.7)}" fill="${col(c)}" opacity=".5" filter="url(#tg${k})"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="#fff"/><circle cx="${f1(x + r * 0.2)}" cy="${f1(y)}" r="${f1(r * 0.72)}" fill="${col(c)}"/><circle cx="${f1(x + r * 0.3)}" cy="${f1(y)}" r="${f1(r * 0.36)}" fill="${ink}"/>`;
  const defs = `<filter id="tg${k}" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1"/></filter><filter id="tb${k}" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="2"/></filter>`;
  const layers: SeaIconLayers = { defs };
  // The soft edge glow in the accent colour.
  if (!hidden) layers.under = `<g filter="url(#tb${k})" opacity=".7"><path d="${ctx.body}" fill="${accent}" stroke="${accent}" stroke-width="2.4"/></g>`;
  let behind = '';
  let clipped = '';
  let over = '';
  let top = '';
  const row = (l: NonNullable<TwilightParts['lights']>) => {
    let s = '';
    for (let i = 0; i < l.n; i++) {
      const t = l.from + ((l.to - l.from) * i) / Math.max(1, l.n - 1);
      const y = l.row === 'flank' ? (topAt(t) + botAt(t)) / 2 + (botAt(t) - topAt(t)) * 0.12 : botAt(t) - Math.max(1.6, (botAt(t) - topAt(t)) * 0.14);
      s += dot(xAt(t), y, 0.95, l.color);
    }
    return s;
  };
  const ray = (d: string, c: string, w: number) => `<path d="${d}" stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;

  if (tp.glass && !hidden) {
    // See-through: a pale sheen across the body and a faint spine with ribs.
    const x0 = xAt(0.15);
    const x1 = xAt(0.85);
    const my = (topAt(0.5) + botAt(0.5)) / 2;
    clipped += `<ellipse cx="${f1(xAt(0.45))}" cy="${f1(topAt(0.45) + 3)}" rx="${f1(Math.abs(x0 - x1) * 0.4)}" ry="2.6" fill="#fff" opacity=".35"/>`;
    clipped += `<path d="M${f1(x0)} ${f1(my)} L${f1(x1)} ${f1(my)}" stroke="#5a7088" stroke-width=".9" stroke-dasharray="1.6 1" opacity=".8"/>`;
    for (let i = 0; i < 5; i++) clipped += `<path d="M${f1(xAt(0.25 + i * 0.11))} ${f1(my)} l-1.2 4.4" stroke="#5a7088" stroke-width=".6" opacity=".6"/>`;
  }
  if (tp.tubeEye) {
    const x = xAt(0.17);
    const y = topAt(0.17) + 1.5;
    top += `<rect x="${f1(x - 2.3)}" y="${f1(y - 7)}" width="4.6" height="8.5" rx="2.3" fill="${hidden ? ink : '#e8f4ff'}" stroke="${ink}" stroke-opacity="${hidden ? 0 : 0.35}" stroke-width=".6"/>`;
    top += eye(x, y - 5, 1.9, 0x6fd8ff);
  }
  if (tp.lights && !hidden) over += row(tp.lights);
  if (tp.fangs && !tp.fangs.grin) {
    const my = MID + 2.2;
    for (let i = 0; i < 4; i++) {
      const x = HEAD - 2 - i * 3.4;
      const len = i % 2 ? 4.2 : 6.4;
      top += `<path d="M${f1(x - 1.3)} ${f1(my)} L${f1(x)} ${f1(my + len)} L${f1(x + 1.3)} ${f1(my)} Z" fill="${hidden ? ink : '#fffaf0'}" stroke="${ink}" stroke-opacity="${hidden ? 0 : 0.35}" stroke-width=".5"/>`;
    }
  }
  if (tp.chinLure) {
    const bx = HEAD - 6;
    const by = botAt(0.07);
    behind += ray(`M${f1(bx)} ${f1(by - 1)} Q${f1(bx - 8)} ${f1(by + 6)} ${f1(bx + 1)} ${f1(by + 12)}`, hidden ? ink : ctx.fin, 0.9);
    top += dot(bx + 1, by + 13, 1.7, tp.chinLure);
  }
  if (tp.lures) {
    for (let i = 0; i < tp.lures.n; i++) {
      const u = i / (tp.lures.n - 1);
      const bx = xAt(0.14 + i * 0.03);
      const by = topAt(0.14 + i * 0.03) + 1;
      const tx = HEAD + 3 - u * 11 + (i % 2 ? 1 : 0);
      const ty = 7.5 - (i % 2) * 2.5 - Math.sin(u * Math.PI) * 3;
      behind += ray(`M${f1(bx)} ${f1(by)} Q${f1(bx + 1)} ${f1(ty - 2)} ${f1(tx)} ${f1(ty + 1)}`, hidden ? ink : ctx.fin, 0.8);
      top += dot(tx, ty, 1.5, tp.lures.color);
    }
  }
  if (tp.fangs?.grin) {
    // A toothy grin: a dark smile with little teeth above and below it.
    const x0 = HEAD - 1;
    const y0 = MID + 2;
    over += `<path d="M${x0} ${y0} Q${f1(x0 - 9)} ${y0 + 8} ${f1(x0 - 20)} ${y0 + 2}" stroke="${ink}" stroke-width="1.2" fill="none" opacity=".8" stroke-linecap="round"/>`;
    if (!hidden) {
      for (let i = 0; i < 6; i++) {
        const u = (i + 0.5) / 6;
        const x = x0 - u * 20;
        const y = y0 + Math.sin(u * Math.PI) * 4.4 - u * 0.3;
        over += `<path d="M${f1(x - 1.2)} ${f1(y - 0.5)} L${f1(x)} ${f1(y + 2.6)} L${f1(x + 1.2)} ${f1(y - 0.5)} Z" fill="#fffaf0"/><path d="M${f1(x + 1)} ${f1(y + 2.4)} L${f1(x + 2.1)} ${f1(y - 0.8)} L${f1(x + 3.2)} ${f1(y + 2.4)} Z" fill="#fffaf0"/>`;
      }
    }
  }
  if (tp.crest) {
    // The crest along the whole back, and the plume of rays with glowing tips.
    let p = `M${f1(xAt(0.04))} ${f1(topAt(0.04) + 1)}`;
    for (let i = 0; i <= 40; i++) {
      const t = 0.04 + i * 0.0233;
      p += ` L${f1(xAt(t))} ${f1(topAt(t) - (i % 2 ? 1.6 : 2.8))}`;
    }
    behind += `<path d="${p} L${f1(xAt(0.97))} ${f1(topAt(0.97) + 1)} Z" fill="${col(ctx.look.fin)}"/>`;
    for (let i = 0; i < 5; i++) {
      const bx = xAt(0.035 + i * 0.012);
      const by = topAt(0.035 + i * 0.012);
      const tx = bx - 4 - i * 4.6;
      const ty = by - 12 + i * 1.3;
      behind += ray(`M${f1(bx)} ${f1(by + 1)} Q${f1(bx + 1 - i)} ${f1(by - 12)} ${f1(tx)} ${f1(ty)}`, col(ctx.look.fin), 1.1);
      if (!hidden) top += dot(tx, ty, 1, ctx.look.fin);
    }
  }
  if (tp.eye) {
    const e = tp.eye;
    const sc = ctx.look.shape === 'ribbon' ? 2.1 : ctx.look.shape === 'bulb' ? 3.3 : ctx.look.shape === 'torpedo' ? 2.5 : 2.3;
    top += eye(xAt(e.t), topAt(e.t) + (botAt(e.t) - topAt(e.t)) * 0.36, sc, e.color);
  }
  if (ctx.id === 'lanternshark' && !hidden) {
    // Gill slits.
    for (let i = 0; i < 3; i++) clipped += `<path d="M${f1(xAt(0.22 + i * 0.03))} ${f1(topAt(0.25) + 3)} q-1.4 3 0 6" stroke="${ink}" stroke-width=".7" fill="none" opacity=".4"/>`;
  }
  if (behind) layers.behind = behind;
  if (clipped) layers.clipped = clipped;
  if (over) layers.over = over;
  if (top) layers.top = top;
  return layers;
}

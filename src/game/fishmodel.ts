import * as THREE from 'three';
import { FISH_LOOK, SHAPES, envelope, type DorsalKind, type FishLook, type Shape, type TailKind } from '../data/fishlook';

export interface FishModel {
  group: THREE.Group;
  tail: THREE.Object3D;
  materials: THREE.Material[];
  /** Sparkles that circle jewel, spirit and shiny fish. */
  orbit?: THREE.Group;
  /** Additive glow materials that breathe. */
  pulse?: THREE.Material[];
  body?: THREE.Object3D;
  flames?: THREE.Object3D[];
  hue?: { m: THREE.MeshBasicMaterial; off: number }[];
  twinkle?: THREE.Object3D[];
}

/** Top and side extents of the body at t, for placing fins, eyes and extras. */
function extents(shape: Shape, t: number): { y: number; x: number } {
  const env = envelope(shape, t);
  return { y: SHAPES[shape].h * env, x: SHAPES[shape].w * env };
}

/** Body mesh geometry: a sphere stretched along Z (nose at -Z) and reshaped by the silhouette. */
function bodyGeometry(shape: Shape): THREE.BufferGeometry {
  const s = SHAPES[shape];
  const g = new THREE.SphereGeometry(0.5, 40, 24).rotateX(Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const rho = Math.hypot(x, y);
    const nx = rho > 1e-6 ? x / rho : 0;
    const ny = rho > 1e-6 ? y / rho : 0;
    const t = z + 0.5;
    const env = envelope(shape, t);
    const sag = ny < 0 ? s.sag * env * -ny : 0;
    p.setXYZ(i, nx * s.w * env, ny * s.h * env - sag, z);
  }
  g.computeVertexNormals();
  return g;
}

// ---------- skin texture ----------

const TEX_W = 512;
const TEX_H = 256;
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Small seeded RNG so a species' spots land in the same places every time. */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * Texture space: `u` runs around the body (0.25 belly, 0.75 back, 0 and 0.5 the two flanks),
 * `v` runs from nose (0) to tail (1). Marks on the flanks are drawn on both sides.
 */
function paintSkin(look: FishLook, id: string, glow: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  const g = c.getContext('2d')!;
  const X = (u: number) => (((u % 1) + 1) % 1) * TEX_W;
  const Y = (v: number) => (1 - v) * TEX_H;
  const rng = seeded(id);
  // Glow layer (emissive map): black, with only the glowing marks painted in.
  if (glow) {
    g.fillStyle = '#000';
    g.fillRect(0, 0, TEX_W, TEX_H);
  } else {
    // Countershading: dark back fading to a light belly.
    const grad = g.createLinearGradient(0, 0, TEX_W, 0);
    const stops: [number, number][] = [[0, 0.5], [0.25, 0], [0.5, 0.5], [0.75, 1], [1, 0.5]];
    const back = new THREE.Color(look.back);
    const belly = new THREE.Color(look.belly);
    for (const [u, k] of stops) grad.addColorStop(u, `#${belly.clone().lerp(back, THREE.MathUtils.smoothstep(k, 0.15, 0.85)).getHexString()}`);
    g.fillStyle = grad;
    g.fillRect(0, 0, TEX_W, TEX_H);
  }
  const dot = (u: number, v: number, r: number, color: string) => {
    g.fillStyle = color;
    for (const du of [0, 1, -1]) {
      g.beginPath();
      g.ellipse(X(u) + du * TEX_W, Y(v), r * TEX_W, r * TEX_W * 0.9, 0, 0, Math.PI * 2);
      g.fill();
    }
  };
  /** A mark on the upper body or flanks: u in [0.4, 1.1] keeps it off the pale belly. */
  const upper = () => 0.4 + rng() * 0.7;
  // A long mouth line for the big-mouthed predators (bass, pike); an upturned one for the arowana.
  const ex = look.extras ?? [];
  if (!glow && (ex.includes('bigmouth') || ex.includes('upmouth'))) {
    g.strokeStyle = hex(new THREE.Color(look.back).multiplyScalar(0.35).getHex());
    g.lineWidth = 4;
    g.lineCap = 'round';
    for (const u of [0.13, 0.37]) {
      g.beginPath();
      g.moveTo(X(u), Y(0.005));
      g.lineTo(X(ex.includes('upmouth') ? u - 0.03 * Math.sign(0.25 - u) : u), Y(ex.includes('upmouth') ? 0.05 : 0.09));
      g.stroke();
    }
  }
  for (const m of look.marks ?? []) {
    const color = hex(m.color);
    const glowing = m.k === 'glowdots' || m.k === 'stars';
    if (glow !== glowing && !(glow && m.k === 'stars')) continue;
    switch (m.k) {
      case 'stripe': {
        const w = (m.width ?? 0.08) * TEX_W * 0.5;
        g.fillStyle = color;
        for (const u of [0, 0.5, 1]) g.fillRect(X(u) - w / 2 + (u === 1 ? TEX_W : 0) - (u === 1 ? TEX_W : 0), Y(0.92), w, Y(0.12) - Y(0.92));
        break;
      }
      case 'bars':
        g.fillStyle = color;
        g.globalAlpha = 0.85;
        for (let i = 0; i < m.n; i++) {
          const v = 0.22 + (i / m.n) * 0.62;
          g.fillRect(X(0.42), Y(v + 0.035), X(0.58) - X(0.42) + TEX_W * 0.5, Y(v) - Y(v + 0.035));
          g.fillRect(0, Y(v + 0.035), X(0.08), Y(v) - Y(v + 0.035));
        }
        g.globalAlpha = 1;
        break;
      case 'spots':
        for (let i = 0; i < m.n; i++) dot(upper(), 0.15 + rng() * 0.75, (m.size ?? 0.03) * (0.7 + rng() * 0.6) * 0.5, color);
        break;
      case 'speckle':
        for (let i = 0; i < 160; i++) dot(upper(), 0.1 + rng() * 0.85, 0.004 + rng() * 0.004, color);
        break;
      case 'patches':
        g.globalAlpha = 0.95;
        for (let i = 0; i < 6; i++) {
          const u = 0.45 + rng() * 0.6;
          const v = 0.12 + rng() * 0.7;
          g.fillStyle = color;
          for (let k = 0; k < 4; k++) dot(u + (rng() - 0.5) * 0.08, v + (rng() - 0.5) * 0.08, 0.035 + rng() * 0.03, color);
        }
        g.globalAlpha = 1;
        break;
      case 'earspot':
        for (const u of [0.02, 0.48]) dot(u, 0.16, 0.022, color);
        break;
      case 'scales':
        g.strokeStyle = color;
        g.globalAlpha = 0.28;
        g.lineWidth = 2;
        for (let y = 0; y < TEX_H; y += 14) {
          for (let x = (y / 14) % 2 ? 0 : 9; x < TEX_W; x += 18) {
            g.beginPath();
            g.arc(x, y, 8, 0.15 * Math.PI, 0.85 * Math.PI);
            g.stroke();
          }
        }
        g.globalAlpha = 1;
        break;
      case 'glowdots':
        for (let i = 0; i < 9; i++) for (const u of [0.1, 0.4]) dot(u, 0.18 + i * 0.08, 0.009, color);
        break;
      case 'stars':
        for (let i = 0; i < 70; i++) dot(rng(), rng(), 0.002 + rng() * 0.004, color);
        break;
    }
  }
  return c;
}

const skinCache = new Map<string, THREE.CanvasTexture>();
function skin(look: FishLook, id: string, glow: boolean, shiny: boolean): THREE.CanvasTexture {
  const key = `${id}|${glow}|${shiny}`;
  let t = skinCache.get(key);
  if (!t) {
    const l = shiny ? goldify(look) : look;
    t = new THREE.CanvasTexture(paintSkin(l, id, glow));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    skinCache.set(key, t);
  }
  return t;
}

/** Shinies keep their pattern but take on a gold finish. */
function goldify(look: FishLook): FishLook {
  const gold = (c: number, k = 0.55) => new THREE.Color(c).lerp(new THREE.Color(0xffd23a), k).getHex();
  return { ...look, back: gold(look.back), belly: gold(look.belly, 0.35), fin: gold(look.fin), accent: 0xffe27a };
}

// ---------- fins ----------

/** A flat fin from 2D points (x along the body toward the tail, y up), standing in the YZ plane. */
function finGeo(pts: [number, number][]): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  return new THREE.ShapeGeometry(s).rotateY(-Math.PI / 2);
}

function curve(n: number, f: (k: number) => [number, number]): [number, number][] {
  return Array.from({ length: n + 1 }, (_, i) => f(i / n));
}

const DORSAL: Record<Exclude<DorsalKind, 'none'>, { at: number; pts: [number, number][] }> = {
  small: { at: 0.42, pts: [[0, 0], [0.04, 0.07], [0.1, 0.05], [0.13, 0]] },
  soft: { at: 0.38, pts: [[0, 0], [0.03, 0.1], [0.1, 0.09], [0.18, 0]] },
  spiny: { at: 0.3, pts: [[0, 0], [0.02, 0.11], [0.05, 0.06], [0.08, 0.12], [0.11, 0.06], [0.14, 0.11], [0.17, 0.05], [0.24, 0.07], [0.3, 0]] },
  long: { at: 0.25, pts: [[0, 0], [0.04, 0.06], [0.2, 0.07], [0.42, 0.05], [0.55, 0]] },
  sail: { at: 0.22, pts: [[0, 0], [0.04, 0.22], [0.2, 0.2], [0.42, 0.1], [0.5, 0]] },
};

/** Caudal fins, drawn from the tail root (x = 0) backwards, sized for a body half-height of 0.15. */
const TAILS: Record<TailKind, [number, number][]> = {
  fork: [[0, 0.03], [0.17, 0.15], [0.12, 0.02], [0.08, 0], [0.12, -0.02], [0.17, -0.15], [0, -0.03]],
  round: [[0, 0.03], ...curve(8, (k) => [0.05 + Math.sin(k * Math.PI) * 0.12, 0.13 - k * 0.26] as [number, number]), [0, -0.03]],
  lunate: [[0, 0.025], [0.1, 0.2], [0.07, 0.03], [0.05, 0], [0.07, -0.03], [0.1, -0.2], [0, -0.025]],
  shark: [[0, 0.03], [0.22, 0.16], [0.1, 0.0], [0.13, -0.08], [0, -0.03]],
  eel: [[0, 0.04], [0.12, 0.02], [0.14, 0], [0.12, -0.02], [0, -0.04]],
};

// ---------- builder ----------

/** Model for a species, nose toward -Z, length 1 unit. `shadow` makes a dark underwater silhouette. */
export function buildFish(baseColor: number, shadow = false, shiny = false, tier = 1, id = ''): FishModel {
  const look: FishLook = FISH_LOOK[id] ?? { shape: 'torpedo', tail: 'fork', dorsal: 'soft', back: baseColor, belly: new THREE.Color(baseColor).lerp(new THREE.Color(0xffffff), 0.5).getHex(), fin: baseColor };
  const L = shiny ? goldify(look) : look;
  const sh = SHAPES[look.shape];
  const group = new THREE.Group();
  const materials: THREE.Material[] = [];
  const pulse: THREE.Material[] = [];
  const flames: THREE.Object3D[] = [];
  const twinkle: THREE.Object3D[] = [];
  const hue: { m: THREE.MeshBasicMaterial; off: number }[] = [];
  const accent = new THREE.Color(L.accent ?? new THREE.Color(L.fin).lerp(new THREE.Color(0xffffff), 0.4).getHex());
  const spirit = tier >= 5 && !shadow ? look.spirit : undefined;

  // Tier finish: matte → satin → bold → jewel sheen → spirit glow.
  const rough = [0.85, 0.6, 0.48, 0.28, 0.3][Math.min(4, tier - 1)];
  const metal = tier === 4 ? 0.35 : tier >= 5 ? 0.15 : 0;
  const shadowMat = () => new THREE.MeshBasicMaterial({ color: shiny ? 0x9a7410 : 0x06141a, transparent: true, opacity: shiny ? 0.9 : 0.75, side: THREE.DoubleSide });
  const ghost = spirit === 'ghost';
  const hasGlowSkin = !shadow && (look.marks ?? []).some((m) => m.k === 'glowdots' || m.k === 'stars');

  const bodyMat: THREE.Material = shadow
    ? shadowMat()
    : new THREE.MeshPhysicalMaterial({
        map: skin(look, id || 'fish', false, shiny),
        // A clear-coat gloss that builds with tier: none on shallows fish, full on jewels and spirits.
        clearcoat: [0, 0.3, 0.8, 1, 1][Math.min(4, tier - 1)],
        clearcoatRoughness: 0.25,
        roughness: shiny ? 0.25 : rough,
        metalness: shiny ? 0.4 : metal,
        emissive: hasGlowSkin ? 0xffffff : spirit ? accent.clone().multiplyScalar(0.22) : 0x000000,
        emissiveMap: hasGlowSkin ? skin(look, id, true, shiny) : null,
        emissiveIntensity: hasGlowSkin ? 1.2 : 1,
        transparent: ghost,
        opacity: ghost ? 0.7 : 1,
      });
  materials.push(bodyMat);
  const finMat: THREE.Material = shadow
    ? shadowMat()
    : new THREE.MeshStandardMaterial({ color: L.fin, roughness: rough, metalness: metal * 0.5, side: THREE.DoubleSide, transparent: true, opacity: ghost ? 0.55 : 0.92, emissive: spirit ? accent.clone().multiplyScalar(0.35) : 0x000000 });
  materials.push(finMat);

  const bodyGeo = bodyGeometry(look.shape);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = !shadow;
  group.add(body);

  // Fins scale with the body so a round bluegill gets big fins and an eel a low ribbon.
  // Lake giants and up carry bigger, showier fins.
  const finScale = Math.max(0.6, sh.h / 0.15) * (tier >= 3 ? 1.2 : 1);
  if (look.dorsal !== 'none') {
    const d = DORSAL[look.dorsal];
    const len = look.shape === 'eel' ? 1.3 : 1;
    const pts = d.pts.map(([x, y]) => [x * len, y * Math.min(1.4, finScale)] as [number, number]);
    // Trace the fin along the curve of the back, then close it just under the skin.
    const top = (x: number) => extents(look.shape, Math.min(0.97, d.at + x)).y;
    const outline: [number, number][] = pts.map(([x, y]) => [x, top(x) * 0.96 + y]);
    const end = pts[pts.length - 1][0];
    for (let i = 8; i >= 0; i--) {
      const x = (end * i) / 8;
      outline.push([x, top(x) * 0.8 - 0.01]);
    }
    const fin = new THREE.Mesh(finGeo(outline), finMat);
    fin.position.set(0, 0, -0.5 + d.at);
    group.add(fin);
  }
  // Pectoral fins behind the gills, and a small anal fin underneath.
  for (const sx of [-1, 1]) {
    const pec = new THREE.Mesh(finGeo([[0, 0], [0.03, 0.035], [0.09, 0.02], [0.1, -0.01]].map(([x, y]) => [x * finScale ** 0.5, y * finScale ** 0.5])), finMat);
    const e = extents(look.shape, 0.22);
    pec.position.set(sx * e.x * 0.95, -e.y * 0.35, -0.28);
    pec.rotation.set(0, sx * 0.5, sx * 0.4);
    group.add(pec);
  }
  if (look.shape !== 'eel') {
    const anal = new THREE.Mesh(finGeo([[0, 0], [0.03, -0.05 * finScale], [0.1, -0.035 * finScale], [0.12, 0]]), finMat);
    anal.position.set(0, -extents(look.shape, 0.68).y * 0.95 - sh.sag * 0.3, 0.16);
    group.add(anal);
  }

  // Tail on a pivot at the tail root so it can wag.
  const tail = new THREE.Group();
  tail.position.z = 0.47;
  const tailScale = look.shape === 'eel' ? 0.8 : Math.max(0.75, Math.min(1.7, sh.h / 0.15));
  const tailFin = new THREE.Mesh(finGeo(TAILS[look.tail].map(([x, y]) => [x * Math.min(1.3, tailScale), y * tailScale])), finMat);
  tail.add(tailFin);
  group.add(tail);

  if (!shadow) {
    addFace(group, look, L);
    addExtras(group, look, L, finMat, pulse, accent);
  }

  // Jewel (T4): a coloured rim glow that keeps the body colour readable; spirits (T5) a stronger aura.
  let orbit: THREE.Group | undefined;
  if (!shadow && (tier >= 4 || shiny)) {
    const glowMat = (op: number, c = accent, cycle = false) => {
      const m = new THREE.MeshBasicMaterial({ color: c.clone(), transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide });
      pulse.push(m);
      if (cycle) hue.push({ m, off: hue.length * 0.21 });
      return m;
    };
    if (tier >= 4) {
      const rim = new THREE.Mesh(bodyGeo, glowMat(tier >= 5 ? 0.5 : 0.38));
      rim.scale.set(1.18, 1.14, 1.04);
      group.add(rim);
    }
    if (spirit) {
      const aura = new THREE.Mesh(bodyGeo, glowMat(0.14, accent, spirit === 'aurora'));
      aura.scale.set(1.45, 1.4, 1.1);
      group.add(aura);
      addSpirit(group, spirit, look, accent, tail, flames, twinkle, hue, pulse);
    }
    orbit = new THREE.Group();
    const n = shiny ? 10 : tier >= 5 ? 12 : 6;
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(0.012 + (i % 3) * 0.004, 6, 5), new THREE.MeshBasicMaterial({ color: shiny ? 0xfff2a0 : accent, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      const a = (i / n) * Math.PI * 2;
      sp.position.set(Math.cos(a) * (sh.w + 0.12), Math.sin(a * 2) * (sh.h + 0.04), Math.sin(a) * 0.55);
      orbit.add(sp);
      twinkle.push(sp);
    }
    group.add(orbit);
  }

  const outer = new THREE.Group();
  outer.add(group);
  return { group: outer, body, tail, materials, orbit, pulse, flames, hue, twinkle };
}

/** Cartoon eyes (matching the players' painted faces) and a mouth line. */
function addFace(group: THREE.Group, look: FishLook, L: FishLook): void {
  const t = look.shape === 'eel' ? 0.07 : look.shape === 'long' || look.shape === 'armored' ? 0.12 : 0.1;
  const e = extents(look.shape, t);
  const r = THREE.MathUtils.clamp(0.034 + SHAPES[look.shape].h * 0.07, 0.03, 0.05);
  const white = new THREE.MeshBasicMaterial({ color: look.spirit ? 0xfff6c8 : 0xf6f6f0 });
  const pupil = new THREE.MeshBasicMaterial({ color: look.spirit === 'ghost' ? 0x3a6aa8 : 0x111111 });
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), white);
    w.position.set(s * e.x * 0.78, e.y * 0.28, -0.5 + t);
    const p = new THREE.Mesh(new THREE.SphereGeometry(r * 0.58, 10, 6), pupil);
    p.position.set(s * r * 0.55, r * 0.08, -r * 0.35);
    w.add(p);
    group.add(w);
  }
  void L;
}

function addExtras(group: THREE.Group, look: FishLook, L: FishLook, finMat: THREE.Material, pulse: THREE.Material[], accent: THREE.Color): void {
  const ex = look.extras ?? [];
  const nose = extents(look.shape, 0.04);
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(L.back).multiplyScalar(0.55), roughness: 0.7 });
  const whisker = (len: number, y: number, spread: number, thick: number) => {
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(thick * 0.4, thick, len, 5).translate(0, -len / 2, 0), dark);
      w.position.set(s * nose.x * 0.6, y, -0.47);
      w.rotation.set(-1.1, 0, s * spread);
      group.add(w);
    }
  };
  if (ex.includes('whiskers')) {
    whisker(0.28, -0.01, 0.9, 0.009);
    whisker(0.14, -0.04, 0.5, 0.007);
  }
  if (ex.includes('barbels')) whisker(0.07, -nose.y * 0.4, 0.6, 0.007);
  if (ex.includes('snout')) {
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.26, 8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: L.back, roughness: 0.6 }));
    beak.position.set(0, -0.005, -0.6);
    beak.scale.set(1, 0.6, 1);
    group.add(beak);
  }
  if (ex.includes('scutes')) {
    const plate = new THREE.MeshStandardMaterial({ color: new THREE.Color(L.back).lerp(new THREE.Color(0xffffff), 0.45), roughness: 0.3, metalness: 0.4 });
    for (let i = 0; i < 9; i++) {
      const t = 0.18 + i * 0.075;
      const e = extents(look.shape, t);
      for (const [x, y] of [[0, e.y], [e.x * 0.9, e.y * 0.2], [-e.x * 0.9, e.y * 0.2]]) {
        const s = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.03, 4), plate);
        s.position.set(x, y + 0.008, -0.5 + t);
        if (x) s.rotation.z = -Math.sign(x) * 1.3;
        group.add(s);
      }
    }
  }
  if (ex.includes('lantern')) {
    // An angler-style lure bobbing above the eel's head.
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.14, 5).translate(0, 0.07, 0), finMat);
    stalk.position.set(0, extents(look.shape, 0.1).y * 0.9, -0.42);
    stalk.rotation.x = -0.55;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshBasicMaterial({ color: accent }));
    bulb.position.set(0, 0.145, 0);
    stalk.add(bulb);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    pulse.push(halo.material);
    bulb.add(halo);
    group.add(stalk);
  }
}

/** Tier-5 flourishes that make each spirit unmistakable without hiding the fish underneath. */
function addSpirit(
  group: THREE.Group, kind: NonNullable<FishLook['spirit']>, look: FishLook, accent: THREE.Color, tail: THREE.Object3D,
  flames: THREE.Object3D[], twinkle: THREE.Object3D[], hue: { m: THREE.MeshBasicMaterial; off: number }[], pulse: THREE.Material[],
): void {
  const add = (op: number, c = accent, cycle = false) => {
    const m = new THREE.MeshBasicMaterial({ color: c.clone(), transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    pulse.push(m);
    if (cycle) hue.push({ m, off: hue.length * 0.19 });
    return m;
  };
  const top = (t: number) => extents(look.shape, t).y;
  if (kind === 'flame') {
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14 + (i % 2) * 0.05, 6), add(0.75, new THREE.Color(i % 2 ? 0xffd040 : 0xff5a10)));
      f.position.set(0, top(0.25 + i * 0.08) + 0.1, -0.25 + i * 0.08);
      f.rotation.x = 0.35;
      group.add(f);
      flames.push(f);
    }
  }
  if (kind === 'aurora' || kind === 'ghost') {
    // Long flowing streamers trailing from the tail.
    for (const s of [-1, 0, 1]) {
      const len = kind === 'ghost' ? 0.5 : 0.65;
      const ribbon = new THREE.Mesh(finGeo([[0, 0.02], [len * 0.5, 0.05 + s * 0.04], [len, s * 0.08], [len * 0.5, -0.01 + s * 0.04], [0, -0.02]]), add(kind === 'ghost' ? 0.3 : 0.45, accent, kind === 'aurora'));
      ribbon.position.set(s * 0.02, s * 0.02, 0.06);
      tail.add(ribbon);
    }
  }
  if (kind === 'stars') {
    for (let i = 0; i < 16; i++) {
      const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.012 + (i % 3) * 0.006), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      const t = 0.05 + (i / 16) * 0.9;
      const e = extents(look.shape, t);
      st.position.set(Math.cos(i * 2.4) * e.x * 1.05, Math.sin(i * 2.4) * e.y * 1.05, -0.5 + t);
      group.add(st);
      twinkle.push(st);
    }
  }
}

/**
 * World scale for a fish of `cm` length when held up as a catch. It keeps growing across the whole
 * size range (15 cm ≈ 0.5, 90 cm ≈ 1.5, 230 cm ≈ 2.5) so every tier lands visibly bigger than the last,
 * but slower than real life so a legend still fits on screen. Other views use a fraction of this.
 */
export function fishScale(cm: number): number {
  return 0.0984 * Math.pow(Math.max(1, cm), 0.6);
}

export function setFishOpacity(m: FishModel, a: number): void {
  for (const mat of m.materials) (mat as THREE.MeshBasicMaterial).opacity = a * 0.75;
}

export function animateFish(m: FishModel, t: number, speed: number, amp: number): void {
  m.tail.rotation.y = Math.sin(t * speed) * amp;
  (m.body ?? m.group.children[0]).rotation.y = Math.sin(t * speed + 0.6) * amp * 0.12;
  m.flames?.forEach((f, i) => f.scale.set(1, 0.75 + 0.45 * Math.abs(Math.sin(t * 9 + i * 1.7)), 1));
  m.twinkle?.forEach((o, i) => o.scale.setScalar(0.6 + 0.6 * Math.abs(Math.sin(t * 3 + i * 1.3))));
  m.hue?.forEach((h) => h.m.color.setHSL((t * 0.12 + h.off) % 1, 0.85, 0.62));
  if (m.orbit) m.orbit.rotation.z = t * 0.9;
  if (m.pulse) {
    const k = 0.8 + Math.sin(t * 3) * 0.2;
    m.pulse.forEach((p, i) => ((p as THREE.MeshBasicMaterial).opacity = Math.min(1, ((p as THREE.MeshBasicMaterial).userData.o ??= (p as THREE.MeshBasicMaterial).opacity) * k * (i % 2 ? 1.1 : 1))));
  }
}

/** Rotate so the nose (-Z) points along (vx, vz). */
export function faceDirection(g: THREE.Object3D, vx: number, vz: number): void {
  if (vx * vx + vz * vz > 1e-8) g.rotation.y = Math.atan2(-vx, -vz);
}

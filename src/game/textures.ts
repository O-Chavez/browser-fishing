// Small hand-painted textures drawn in code (nothing to download). Most are near-white and
// multiply over a material's own colour, so one texture serves every tint.
import * as THREE from 'three';
import { mulberry } from './env';

/** Wraps a texture painter so the canvas is drawn once and the texture shared by every map build. */
const once = (draw: () => THREE.CanvasTexture) => {
  let t: THREE.CanvasTexture | null = null;
  return (): THREE.CanvasTexture => (t ??= draw());
};

const canvas = (w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
};

const toTex = (c: HTMLCanvasElement): THREE.CanvasTexture => {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

/** Draws `fn` at x, then again shifted by ±size so marks wrap around the tile edges. */
const wrap = (size: number, x: number, y: number, fn: (x: number, y: number) => void): void => {
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) fn(x + dx, y + dy);
};

const grey = (v: number, a = 1) => `rgba(${v},${v},${v},${a})`;

/** Near-white painterly dabs; multiplied over the terrain's vertex colours. */
function drawGroundTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S);
  g.fillStyle = grey(236);
  g.fillRect(0, 0, S, S);
  const r = mulberry(91);
  for (let i = 0; i < 420; i++) {
    const x = r() * S;
    const y = r() * S;
    const dark = r() < 0.6;
    const rw = 3 + r() * 6;
    const rh = rw * (0.4 + r() * 0.3);
    const rot = (r() - 0.5) * 0.8;
    g.fillStyle = dark ? grey(200 + r() * 20, 0.55) : grey(255, 0.6);
    wrap(S, x, y, (px, py) => {
      g.beginPath();
      g.ellipse(px, py, rw, rh, rot, 0, Math.PI * 2);
      g.fill();
    });
  }
  // Short blade ticks
  g.lineWidth = 1.6;
  g.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const x = r() * S;
    const y = r() * S;
    const l = 4 + r() * 5;
    const lean = (r() - 0.5) * 3;
    g.strokeStyle = grey(190 + r() * 25, 0.7);
    wrap(S, x, y, (px, py) => {
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + lean, py - l);
      g.stroke();
    });
  }
  return toTex(c);
}

/** Plank grain running along u, with nail dots near both ends. */
function drawPlankTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 64);
  g.fillStyle = grey(240);
  g.fillRect(0, 0, 256, 64);
  const r = mulberry(17);
  g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const y = 6 + r() * 52;
    g.strokeStyle = grey(185 + r() * 35, 0.8);
    g.lineWidth = 1 + r() * 1.5;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 2.5);
    g.stroke();
  }
  // darker edges and nails
  g.fillStyle = grey(200);
  g.fillRect(0, 0, 256, 3);
  g.fillRect(0, 61, 256, 3);
  g.fillStyle = grey(110);
  for (const x of [10, 246]) for (const y of [18, 46]) {
    g.beginPath();
    g.arc(x, y, 2.4, 0, Math.PI * 2);
    g.fill();
  }
  const t = toTex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Horizontal clapboard siding for cottage walls (one board per 0.32 m at 1 repeat per metre). */
function drawSidingTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, g] = canvas(S);
  g.fillStyle = grey(244);
  g.fillRect(0, 0, S, S);
  const r = mulberry(5);
  const rows = 3;
  const bh = S / rows;
  for (let i = 0; i < rows; i++) {
    const y = i * bh;
    g.fillStyle = grey(232 + r() * 16);
    g.fillRect(0, y, S, bh);
    const grd = g.createLinearGradient(0, y + bh - 9, 0, y + bh);
    grd.addColorStop(0, grey(0, 0));
    grd.addColorStop(1, grey(0, 0.2));
    g.fillStyle = grd;
    g.fillRect(0, y + bh - 9, S, 9);
    g.fillStyle = grey(255, 0.5);
    g.fillRect(0, y, S, 2);
  }
  return toTex(c);
}

/** Staggered scalloped roof tiles. */
function drawShingleTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, g] = canvas(S);
  g.fillStyle = grey(150);
  g.fillRect(0, 0, S, S);
  const r = mulberry(12);
  const rows = 4;
  const cols = 4;
  const w = S / cols;
  const h = S / rows;
  for (let j = -1; j <= rows; j++) {
    for (let i = -1; i <= cols; i++) {
      const x = i * w + (j % 2 ? w / 2 : 0);
      const y = j * h;
      g.fillStyle = grey(222 + r() * 30);
      g.beginPath();
      g.moveTo(x + 2, y);
      g.lineTo(x + w - 2, y);
      g.lineTo(x + w - 2, y + h * 0.7);
      g.quadraticCurveTo(x + w - 2, y + h + 2, x + w / 2, y + h + 2);
      g.quadraticCurveTo(x + 2, y + h + 2, x + 2, y + h * 0.7);
      g.closePath();
      g.fill();
    }
  }
  return toTex(c);
}

/** Rounded stones in mortar, for the well and chimneys. */
function drawStoneTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, g] = canvas(S);
  g.fillStyle = grey(150);
  g.fillRect(0, 0, S, S);
  const r = mulberry(33);
  const rows = 4;
  const h = S / rows;
  for (let j = 0; j < rows; j++) {
    let x = j % 2 ? -h * 0.6 : 0;
    while (x < S) {
      const w = h * (0.9 + r() * 0.8);
      g.fillStyle = grey(215 + r() * 40);
      g.beginPath();
      g.roundRect(x + 2, j * h + 2, w - 4, h - 4, 8);
      g.fill();
      if (x + w > S) {
        g.beginPath();
        g.roundRect(x - S + 2, j * h + 2, w - 4, h - 4, 8);
        g.fill();
      }
      x += w;
    }
  }
  return toTex(c);
}

/** Soft speckle for rocks. */
function drawSpeckleTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, g] = canvas(S);
  g.fillStyle = grey(232);
  g.fillRect(0, 0, S, S);
  const r = mulberry(8);
  for (let i = 0; i < 160; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = 1 + r() * 4;
    g.fillStyle = r() < 0.65 ? grey(180 + r() * 30, 0.7) : grey(255, 0.7);
    wrap(S, x, y, (px, py) => {
      g.beginPath();
      g.arc(px, py, rad, 0, Math.PI * 2);
      g.fill();
    });
  }
  return toTex(c);
}

/** Tone-on-tone damask for the casino's upper walls: one motif per 1 m wide, 2 m tall tile. */
function drawDamaskTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 256);
  g.fillStyle = grey(226);
  g.fillRect(0, 0, 128, 256);
  const motif = (x: number, y: number, s: number) => {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.fillStyle = grey(250, 0.85);
    for (const a of [0, Math.PI]) {
      g.save();
      g.rotate(a);
      // A teardrop leaf curling out to each side, and a centre stem
      for (const side of [-1, 1]) {
        g.beginPath();
        g.moveTo(0, -4);
        g.bezierCurveTo(side * 26, -10, side * 30, -42, side * 6, -50);
        g.bezierCurveTo(side * 14, -36, side * 12, -20, 0, -14);
        g.fill();
      }
      g.beginPath();
      g.ellipse(0, -40, 5, 16, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.beginPath();
    g.arc(0, 0, 7, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  motif(64, 128, 1);
  for (const [x, y] of [[0, 0], [128, 0], [0, 256], [128, 256]]) motif(x, y, 0.55);
  return toTex(c);
}

/** One raised wooden panel with grain, 1.3 m square, for the casino's lower walls. */
function drawPanelTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S);
  g.fillStyle = grey(225);
  g.fillRect(0, 0, S, S);
  const r = mulberry(29);
  g.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const y = r() * S;
    g.strokeStyle = grey(190 + r() * 30, 0.7);
    g.lineWidth = 1 + r() * 1.5;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= S; x += 32) g.lineTo(x, y + Math.sin(x * 0.025 + i) * 3);
    g.stroke();
  }
  // Raised panel: light top-left bevel, dark bottom-right bevel
  const m = 26;
  g.lineWidth = 6;
  g.strokeStyle = grey(255, 0.55);
  g.beginPath();
  g.moveTo(m, S - m);
  g.lineTo(m, m);
  g.lineTo(S - m, m);
  g.stroke();
  g.strokeStyle = grey(120, 0.6);
  g.beginPath();
  g.moveTo(S - m, m);
  g.lineTo(S - m, S - m);
  g.lineTo(m, S - m);
  g.stroke();
  g.fillStyle = grey(110, 0.7);
  g.fillRect(0, 0, 4, S);
  return toTex(c);
}

/** Fine fibre speckle for table felt. */
function drawFeltTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, g] = canvas(S);
  g.fillStyle = grey(238);
  g.fillRect(0, 0, S, S);
  const r = mulberry(61);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = r() < 0.5 ? grey(205, 0.6) : grey(255, 0.6);
    g.fillRect(Math.floor(r() * S), Math.floor(r() * S), 1, 1);
  }
  return toTex(c);
}

/** Repeating wood grain running along u, no nails: table rims, pillars, trim. */
function drawGrainTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, g] = canvas(S);
  g.fillStyle = grey(236);
  g.fillRect(0, 0, S, S);
  const r = mulberry(47);
  for (let i = 0; i < 12; i++) {
    const y = r() * S;
    g.strokeStyle = grey(185 + r() * 35, 0.75);
    g.lineWidth = 1 + r() * 1.4;
    wrap(S, 0, y, (_, py) => {
      g.beginPath();
      g.moveTo(0, py);
      for (let x = 0; x <= S; x += 16) g.lineTo(x, py + Math.sin((x / S) * Math.PI * 2 + i) * 2.5);
      g.stroke();
    });
  }
  return toTex(c);
}

/** Diamond lattice with small rosettes for the casino ceiling, 2 m per tile. */
function drawLatticeTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, g] = canvas(S);
  g.fillStyle = grey(215);
  g.fillRect(0, 0, S, S);
  g.strokeStyle = grey(255, 0.7);
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(64, 0);
  g.lineTo(128, 64);
  g.lineTo(64, 128);
  g.lineTo(0, 64);
  g.closePath();
  g.stroke();
  g.fillStyle = grey(255, 0.8);
  for (const [x, y] of [[64, 64], [0, 0], [128, 0], [0, 128], [128, 128]]) {
    g.beginPath();
    g.arc(x, y, 6, 0, Math.PI * 2);
    g.fill();
  }
  return toTex(c);
}

/** Vertical flutes for pillar shafts: 16 around the cylinder. */
function drawFluteTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 16);
  g.fillStyle = grey(235);
  g.fillRect(0, 0, 256, 16);
  for (let i = 0; i < 16; i++) {
    const x = i * 16;
    const grd = g.createLinearGradient(x, 0, x + 16, 0);
    grd.addColorStop(0, grey(150, 0.7));
    grd.addColorStop(0.35, grey(255, 0.1));
    grd.addColorStop(0.8, grey(255, 0.5));
    grd.addColorStop(1, grey(150, 0.7));
    g.fillStyle = grd;
    g.fillRect(x, 0, 16, 16);
  }
  return toTex(c);
}

export const groundTexture = once(drawGroundTexture);
export const damaskTexture = once(drawDamaskTexture);
export const panelTexture = once(drawPanelTexture);
export const feltTexture = once(drawFeltTexture);
export const grainTexture = once(drawGrainTexture);
export const latticeTexture = once(drawLatticeTexture);
export const fluteTexture = once(drawFluteTexture);
export const plankTexture = once(drawPlankTexture);
export const sidingTexture = once(drawSidingTexture);
export const shingleTexture = once(drawShingleTexture);
export const stoneTexture = once(drawStoneTexture);
export const speckleTexture = once(drawSpeckleTexture);

/**
 * Replaces a geometry's UVs with box-projected ones in its local units, so a repeating texture keeps
 * the same scale on every face no matter the mesh's size. `scale` = texture repeats per metre
 * (`vScale` for the second axis when the tile isn't square).
 */
export function boxUV(geo: THREE.BufferGeometry, scale: number, ox = 0, oy = 0, vScale = scale): THREE.BufferGeometry {
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const p = geo.getAttribute('position');
  const n = geo.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) [u, v] = [p.getX(i), p.getZ(i)];
    else if (ax >= az) [u, v] = [p.getZ(i), p.getY(i)];
    else [u, v] = [p.getX(i), p.getY(i)];
    uv[i * 2] = (u + ox) * scale;
    uv[i * 2 + 1] = (v + oy) * vScale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

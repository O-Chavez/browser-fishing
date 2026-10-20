import * as THREE from 'three';
import { isFace, type FaceId } from '../data/cosmetics';

export const SKIN = 0xf1c7a0;

/** Head texture size: an equirectangular map, so `W / 360` pixels per degree around the head. */
const W = 1024;
const H = 512;
/** Pixels per degree of head, times how large the features are drawn. */
const K = (W / 360) * 1.5;
const INK = '#2a1d17';
// The head faces +z, which sits at u = 0.25 of a three.js sphere texture.
const fx = (deg: number) => W * 0.25 + deg * K;
const fy = (deg: number) => H / 2 - deg * K;
const EYE_X = 17;
const EYE_Y = 7;
const MOUTH_Y = -10;

type Eye = 'open' | 'happy' | 'sleepy';

function eye(g: CanvasRenderingContext2D, side: -1 | 1, kind: Eye): void {
  const x = fx(side * EYE_X);
  const y = fy(EYE_Y);
  g.strokeStyle = g.fillStyle = INK;
  g.lineWidth = 2.6 * K;
  g.beginPath();
  if (kind === 'happy') g.arc(x, y + 2 * K, 5 * K, Math.PI * 1.15, Math.PI * 1.85);
  else if (kind === 'sleepy') g.arc(x, y - 3 * K, 5 * K, Math.PI * 0.2, Math.PI * 0.8);
  else {
    g.ellipse(x, y, 4.2 * K, 6 * K, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(x + 1.4 * K, y - 2.2 * K, 1.6 * K, 0, Math.PI * 2);
    g.fill();
    return;
  }
  g.stroke();
}

function smile(g: CanvasRenderingContext2D, width = 8.5): void {
  g.beginPath();
  g.arc(fx(0), fy(MOUTH_Y) - 5 * K, width * K, Math.PI * 0.2, Math.PI * 0.8);
  g.stroke();
}

/** An open "D" mouth; `teeth` adds a white band along the top. */
function openMouth(g: CanvasRenderingContext2D, w: number, depth: number, teeth: boolean): void {
  const mx = fx(0);
  const my = fy(MOUTH_Y) - 2 * K;
  const shape = () => {
    g.beginPath();
    g.moveTo(mx - w * K, my);
    g.quadraticCurveTo(mx, my + depth * K, mx + w * K, my);
    g.closePath();
  };
  shape();
  g.fillStyle = '#7a2a2a';
  g.fill();
  g.save();
  shape();
  g.clip();
  if (teeth) {
    g.fillStyle = '#fff';
    g.fillRect(mx - w * K, my, 2 * w * K, 3.2 * K);
  } else {
    g.fillStyle = '#ff8a8a';
    g.beginPath();
    g.ellipse(mx, my + depth * 0.45 * K, w * 0.45 * K, depth * 0.25 * K, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  shape();
  g.stroke();
}

const DRAW: Record<FaceId, (g: CanvasRenderingContext2D) => void> = {
  smile: (g) => (eye(g, -1, 'open'), eye(g, 1, 'open'), smile(g)),
  grin: (g) => (eye(g, -1, 'open'), eye(g, 1, 'open'), openMouth(g, 9, 13, false)),
  wink: (g) => (eye(g, -1, 'open'), eye(g, 1, 'happy'), smile(g)),
  cat: (g) => {
    eye(g, -1, 'open');
    eye(g, 1, 'open');
    const mx = fx(0);
    const my = fy(MOUTH_Y);
    g.beginPath();
    g.arc(mx - 3.5 * K, my, 3.5 * K, 0, Math.PI);
    g.moveTo(mx + 7 * K, my);
    g.arc(mx + 3.5 * K, my, 3.5 * K, 0, Math.PI);
    g.stroke();
  },
  joy: (g) => (eye(g, -1, 'happy'), eye(g, 1, 'happy'), openMouth(g, 8, 11, false)),
  tongue: (g) => {
    eye(g, -1, 'open');
    eye(g, 1, 'open');
    // Tongue poking out below the middle of the smile, drawn over it.
    const mx = fx(0) + 1.5 * K;
    const my = fy(MOUTH_Y) + 7 * K;
    g.fillStyle = '#ff6f84';
    g.lineWidth = 1.8 * K;
    g.beginPath();
    g.moveTo(mx - 4 * K, my - 3.5 * K);
    g.lineTo(mx - 4 * K, my);
    g.arc(mx, my, 4 * K, Math.PI, 0, true);
    g.lineTo(mx + 4 * K, my - 3.5 * K);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(mx, my - 2.5 * K);
    g.lineTo(mx, my + 1.5 * K);
    g.stroke();
    g.lineWidth = 2.6 * K;
    smile(g, 9);
  },
  toothy: (g) => (eye(g, -1, 'open'), eye(g, 1, 'open'), openMouth(g, 11, 12, true)),
  sleepy: (g) => (eye(g, -1, 'sleepy'), eye(g, 1, 'sleepy'), smile(g, 6)),
};

/** Paints a face onto a skin-colored head texture (also used for the wardrobe icons). */
export function paintFace(g: CanvasRenderingContext2D, id: FaceId): void {
  g.fillStyle = `#${SKIN.toString(16).padStart(6, '0')}`;
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(240,110,110,.5)';
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.ellipse(fx(sx * 22), fy(-4), 5.5 * K, 3.4 * K, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 2.6 * K;
  DRAW[id](g);
}

const cache = new Map<FaceId, THREE.CanvasTexture>();

/** The shared head texture for a face; every player with that face uses the same one. */
export function faceTexture(id: string): THREE.CanvasTexture {
  const face: FaceId = isFace(id) ? id : 'smile';
  let tex = cache.get(face);
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    paintFace(c.getContext('2d')!, face);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    cache.set(face, tex);
  }
  return tex;
}

/** A head sphere wearing a painted face (front toward +z), for NPCs. */
export function faceHead(radius: number, face: string = 'smile'): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), new THREE.MeshLambertMaterial({ map: faceTexture(face) }));
  m.castShadow = true;
  return m;
}

/** A small square icon of just the face, for the wardrobe picker. */
export function faceIcon(id: FaceId, size = 72): string {
  const src = faceTexture(id).image as HTMLCanvasElement;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const span = 72 * K;
  c.getContext('2d')!.drawImage(src, fx(0) - span / 2, fy(-2) - span / 2, span, span, 0, 0, size, size);
  return c.toDataURL();
}

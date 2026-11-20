// Page-side renderer for the Abyss legends' portraits (loaded through Vite by giant-portraits.ts).
import * as THREE from 'three';
import { FISH } from '../src/data/content';
import { animateFish, buildFish, type FishModel } from '../src/game/fishmodel';

const W = 1600, H = 900;
/** Mid listed length (m), for the boat comparison. */
const LENGTH: Record<string, number> = { leviathan: 11.5, dreamer: 9, kraken: 12.5 };
/** Where the head and eye are, in model units: [x, y, z, radius]. */
const HEADS: Record<string, number[]> = {
  leviathan: [-0.04, 0.14, -0.4, 0.2],
  dreamer: [-0.14, 0.13, -0.42, 0.3],
  kraken: [-0.1, 0.03, -0.36, 0.26],
};

let renderer: THREE.WebGLRenderer;

function backdrop(horizon: number | null, flat?: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 512;
  const g = c.getContext('2d')!;
  if (flat) {
    g.fillStyle = flat;
    g.fillRect(0, 0, 16, 512);
  } else {
    // The Abyss: a black sky over black water, with a dim violet band of storm-light on the horizon.
    const grad = g.createLinearGradient(0, 0, 0, 512);
    if (horizon === null) {
      grad.addColorStop(0, '#0b0a16');
      grad.addColorStop(1, '#05060b');
    } else {
      grad.addColorStop(0, '#050409');
      grad.addColorStop(Math.max(0, horizon - 0.22), '#0c0916');
      grad.addColorStop(Math.max(0.01, horizon - 0.035), '#2c2348');
      grad.addColorStop(horizon, '#4a3d70');
      grad.addColorStop(Math.min(0.99, horizon + 0.012), '#0b0c16');
      grad.addColorStop(1, '#04050a');
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 512);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Sample points of everything that draws, in world space. */
function points(o: THREE.Object3D): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  o.updateMatrixWorld(true);
  o.traverseVisible((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 400));
    for (let i = 0; i < pos.count; i += step) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
  });
  return out;
}

/** Places `cam` looking along `dir` (from the camera toward the subject) so every point is in frame with a margin. */
function frame(cam: THREE.PerspectiveCamera, pts: THREE.Vector3[], dir: THREE.Vector3, up: THREE.Vector3, margin: number): void {
  const f = dir.clone().normalize();
  const r = new THREE.Vector3().crossVectors(f, up).normalize();
  const u = new THREE.Vector3().crossVectors(r, f).normalize();
  const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const th = tv * cam.aspect;
  const c = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3());
  let d = 1;
  for (let it = 0; it < 6; it++) {
    d = 0;
    for (const p of pts) {
      const q = p.clone().sub(c);
      const s = q.dot(f);
      d = Math.max(d, Math.abs(q.dot(r)) / th - s, Math.abs(q.dot(u)) / tv - s);
    }
    // Recentre on the middle of what is seen.
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      const q = p.clone().sub(c);
      const z = d + q.dot(f);
      x0 = Math.min(x0, q.dot(r) / z);
      x1 = Math.max(x1, q.dot(r) / z);
      y0 = Math.min(y0, q.dot(u) / z);
      y1 = Math.max(y1, q.dot(u) / z);
    }
    c.addScaledVector(r, ((x0 + x1) / 2) * d).addScaledVector(u, ((y0 + y1) / 2) * d);
  }
  d *= 1 + margin;
  cam.position.copy(c).addScaledVector(f, -d);
  cam.up.copy(up);
  cam.near = d / 50;
  cam.far = d * 20;
  cam.lookAt(c);
  cam.updateProjectionMatrix();
}

/** A plain hull, 9 m long and 3 m wide, bow toward -z, its deck at y = 0.9. */
function hull(): THREE.Mesh {
  const s = new THREE.Shape();
  s.moveTo(-1.5, 4.5);
  s.lineTo(1.5, 4.5);
  s.lineTo(1.5, -2);
  s.quadraticCurveTo(1.3, -3.6, 0, -4.5);
  s.quadraticCurveTo(-1.3, -3.6, -1.5, -2);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1.2, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.9, 0);
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.9 }));
}

export function setup(): void {
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const canvas = renderer.domElement;
  Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', zIndex: '99999' });
  document.body.appendChild(canvas);
}

export type View = 'side' | 'hero' | 'above' | 'head' | 'shadow' | 'shiny' | 'back';

/** Renders one portrait and returns the model's own draw calls and triangles. */
export function shoot(id: string, view: View, time = 0.52): { calls: number; triangles: number } {
  const f = FISH.find((x) => x.id === id)!;
  const m: FishModel = buildFish(f.color, view === 'shadow', view === 'shiny', f.tier, id);
  animateFish(m, time, 6, 0);
  const scene = new THREE.Scene();
  scene.add(m.group);
  const cam = new THREE.PerspectiveCamera(22, W / H, 0.01, 100);
  const UP = new THREE.Vector3(0, 1, 0);
  const pts = points(m.group);
  // The lamp: warm, from the camera's side, a little above it.
  const lamp = new THREE.DirectionalLight(0xffc890, 2.4);
  scene.add(lamp);
  scene.add(new THREE.HemisphereLight(0x4a3d70, 0x06050c, 0.55));
  let dir: THREE.Vector3;
  if (view === 'side' || view === 'shiny') {
    dir = new THREE.Vector3(1, 0, 0);
    frame(cam, pts, dir, UP, 0.1);
    scene.background = backdrop(0.56);
  } else if (view === 'back') {
    dir = new THREE.Vector3(-1, 0, 0);
    frame(cam, pts, dir, UP, 0.1);
    scene.background = backdrop(0.56);
  } else if (view === 'hero') {
    cam.fov = 30;
    dir = new THREE.Vector3(0.72, 0.2, 1).normalize();
    frame(cam, pts, dir, UP, 0.08);
    scene.background = backdrop(0.72);
  } else if (view === 'above') {
    // From a boat's deck: 35 degrees down, from the side and a little ahead; the creature at its mid length in metres.
    const L = LENGTH[id];
    m.group.scale.setScalar(L);
    const box = new THREE.Box3().setFromPoints(points(m.group));
    const boat = hull();
    boat.position.set(box.min.x - 2.2, box.min.y + (box.max.y - box.min.y) * 0.35 - 0.9, (box.min.z + box.max.z) / 2);
    scene.add(boat);
    const el = THREE.MathUtils.degToRad(35), az = THREE.MathUtils.degToRad(14);
    dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), -Math.sin(el), Math.cos(el) * Math.sin(az));
    cam.fov = 26;
    frame(cam, [...points(m.group), ...points(boat)], dir, UP, 0.06);
    scene.background = backdrop(null);
  } else if (view === 'head') {
    const [x, y, z, r] = HEADS[id];
    const el = THREE.MathUtils.degToRad(35), az = THREE.MathUtils.degToRad(28);
    dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), -Math.sin(el), Math.cos(el) * Math.sin(az));
    cam.fov = 30;
    const c = new THREE.Vector3(x, y, z);
    const d = (r / Math.tan(THREE.MathUtils.degToRad(15))) * 1.05;
    cam.position.copy(c).addScaledVector(dir, -d);
    cam.near = d / 50;
    cam.far = d * 20;
    cam.lookAt(c);
    cam.updateProjectionMatrix();
    scene.background = backdrop(null);
  } else {
    // The underwater silhouette from straight above, head to the left, over lit water so it reads.
    dir = new THREE.Vector3(0, -1, 0);
    frame(cam, pts, dir, new THREE.Vector3(1, 0, 0), 0.1);
    scene.background = backdrop(null, '#2f7896');
  }
  // The lamp sits up and to the right of the camera.
  const right = new THREE.Vector3().crossVectors(dir, cam.up).normalize();
  lamp.position.copy(dir).multiplyScalar(-1).addScaledVector(right, 0.45).addScaledVector(cam.up, 0.5);
  renderer.info.autoReset = false;
  // The creature's own cost: without the backdrop or the boat.
  const bg = scene.background;
  scene.background = null;
  const extra = scene.children.filter((c) => c !== m.group && (c as THREE.Mesh).isMesh);
  extra.forEach((c) => (c.visible = false));
  renderer.info.reset();
  renderer.render(scene, cam);
  const stats = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  extra.forEach((c) => (c.visible = true));
  scene.background = bg;
  renderer.render(scene, cam);
  return stats;
}

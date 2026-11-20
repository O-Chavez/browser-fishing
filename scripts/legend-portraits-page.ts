// Page-side renderer for the legend portraits (loaded through Vite by legend-portraits.ts).
import * as THREE from 'three';
import { FISH } from '../src/data/content';
import { animateFish, buildFish } from '../src/game/fishmodel';

export type View = 'side' | 'hero' | 'hang' | 'shadow' | 'shiny';

/** Each legend's zone mood: a backdrop for the portraits and the water it is seen in as a shadow. */
const MOOD: Record<string, { bg: string; water: string }> = {
  shelf: { bg: 'radial-gradient(120% 90% at 30% 0%, #bfeeff 0%, #6cc4ee 30%, #2f8fcf 62%, #1b5f9c 100%)', water: 'radial-gradient(90% 90% at 50% 40%, #58b8e0 0%, #2f8fc4 60%, #216fa4 100%)' },
  dropoff: { bg: 'linear-gradient(180deg, #8696a8 0%, #5a6d84 30%, #33465e 68%, #1c2a3e 100%)', water: 'radial-gradient(90% 90% at 50% 40%, #54748e 0%, #3a566e 60%, #2a4058 100%)' },
  kelp: { bg: 'radial-gradient(120% 100% at 50% 0%, #4f8f62 0%, #2a6247 35%, #123c30 70%, #08241e 100%)', water: 'radial-gradient(90% 90% at 50% 40%, #3f8a6a 0%, #2a6a52 60%, #1c4c3c 100%)' },
  twilight: { bg: 'linear-gradient(180deg, #171033 0%, #2c1f58 38%, #55387c 72%, #8a5488 100%)', water: 'radial-gradient(90% 90% at 50% 40%, #4a3c7c 0%, #352a62 60%, #241c48 100%)' },
  abyss: { bg: 'linear-gradient(180deg, #05050c 0%, #120c24 60%, #2a1a48 100%)', water: 'radial-gradient(90% 90% at 50% 40%, #1c1830 0%, #100e20 100%)' },
};

/** Bounding box of the meshes that draw (sprites, the soft halos, are left out). */
function visBox(o: THREE.Object3D): THREE.Box3 {
  const b = new THREE.Box3();
  o.updateMatrixWorld(true);
  o.traverseVisible((c) => { if ((c as THREE.Mesh).isMesh) b.union(new THREE.Box3().setFromObject(c)); });
  return b;
}

let renderer: THREE.WebGLRenderer | null = null;
let backdrop: HTMLDivElement | null = null;

export interface Stats { calls: number; triangles: number }

/**
 * Draws one portrait at W x H over the page and returns the fish's own draw calls and triangles.
 * `t` >= 0 poses the model with `animateFish` at that time (the rest pose otherwise).
 */
export function renderPortrait(id: string, view: View, W: number, H: number, t = -1, fill = 0.7): Stats {
  const f = FISH.find((x) => x.id === id)!;
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    Object.assign(renderer.domElement.style, { position: 'fixed', left: '0', top: '0', zIndex: '99999' });
    backdrop = document.createElement('div');
    Object.assign(backdrop.style, { position: 'fixed', left: '0', top: '0', zIndex: '99998' });
    document.body.appendChild(backdrop);
    document.body.appendChild(renderer.domElement);
  }
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  const mood = MOOD[f.locations[0]] ?? MOOD.shelf;
  Object.assign(backdrop!.style, { width: `${W}px`, height: `${H}px`, background: view === 'shadow' ? mood.water : mood.bg });

  // The species sheet's lighting.
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdff0ff, 0x16384a, 2.2));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
  sun.position.set(300, 700, 800);
  scene.add(sun);

  const m = buildFish(f.color, view === 'shadow', view === 'shiny', f.tier, f.id);
  if (t >= 0) animateFish(m, t, 6, 0.25);
  const pivot = new THREE.Group();
  pivot.add(m.group);
  scene.add(pivot);
  const fish = m.group;
  if (view === 'side' || view === 'shiny') fish.rotation.y = Math.PI / 2;
  else if (view === 'hero') {
    // Three-quarter, head toward the camera, seen from slightly below.
    fish.rotation.y = Math.PI / 2 + 0.72;
    pivot.rotation.x = -0.2;
  } else if (view === 'hang') {
    // As `hangFacing` leaves a landed fish: nose up the line, a flank to the viewer.
    fish.rotation.order = 'YXZ';
    fish.rotation.set(Math.PI / 2, -Math.PI / 2, 0);
  } else {
    // The underwater silhouette, from above and a little behind the rail.
    fish.rotation.y = Math.PI / 2 + 0.25;
    pivot.rotation.x = 1.08;
  }

  const box = visBox(pivot);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  let cam: THREE.Camera;
  if (view === 'hero') {
    const p = new THREE.PerspectiveCamera(30, W / H, 0.05, 100);
    p.position.set(c.x, c.y, c.z + 4);
    p.lookAt(c);
    // Pull back or push in until the box's corners fill the frame.
    const pts: THREE.Vector3[] = [];
    pivot.traverseVisible((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const pa = mesh.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pa.count / 400));
      for (let i = 0; i < pa.count; i += step) pts.push(new THREE.Vector3().fromBufferAttribute(pa, i).applyMatrix4(mesh.matrixWorld));
    });
    const mid = new THREE.Vector3();
    for (let k = 0; k < 8; k++) {
      p.updateMatrixWorld(true);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const q of pts) {
        const v = q.clone().project(p);
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
      // Centre what is seen, then pull back or push in until it fills the frame.
      const d = p.position.z - c.z;
      const hh = Math.tan((p.fov * Math.PI) / 360) * d;
      p.position.x += ((x0 + x1) / 2) * hh * p.aspect;
      p.position.y += ((y0 + y1) / 2) * hh;
      const k2 = Math.max((x1 - x0) / 2, (y1 - y0) / 2) / fill;
      p.position.z = c.z + d * (1 + (k2 - 1) * 0.9);
      void mid;
    }
    cam = p;
  } else {
    const s = Math.max(size.x / W, size.y / H) / fill;
    const o = new THREE.OrthographicCamera((-W * s) / 2, (W * s) / 2, (H * s) / 2, (-H * s) / 2, -50, 50);
    o.position.set(c.x, c.y, 10);
    cam = o;
    if (view === 'hang') {
      // The line it hangs from.
      const nose = new THREE.Vector3(0, 0, -0.5).applyMatrix4(fish.matrixWorld);
      const line = new THREE.Mesh(new THREE.CylinderGeometry(s * 1.2, s * 1.2, 4, 4).translate(0, 2, 0), new THREE.MeshBasicMaterial({ color: 0xf4f4f0 }));
      line.position.copy(nose);
      scene.add(line);
    }
  }
  renderer.info.reset();
  renderer.render(scene, cam);
  const info = renderer.info.render;
  return { calls: info.calls - (view === 'hang' ? 1 : 0), triangles: info.triangles - (view === 'hang' ? 8 : 0) };
}

// Renders a labelled lineup of fish, one per tier, over the game page for `npm run screenshots`.
// Loaded in the browser through Vite, so it shares the game's copy of three.js.
import * as THREE from 'three';
import { FISH, TIERS } from '../src/data/content';
import { buildFish } from '../src/game/fishmodel';

const TIER_NAMES = ['Shallows', 'Sport fish', 'Lake giants', 'Jewel fish', 'Spirit fish'];
const TIER_COLORS = ['#c8c8c8', '#6ee07f', '#6fb0f2', '#c98af0', '#ffd65c'];
const GAP = 4.15;
/** Longest side of the first fish, in world units; each later fish is GROW longer. */
const BASE = 2.4;
const GROW = 0.45;

export function renderLineup(W: number, H: number, picks: string[]): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e3a52);
  scene.add(new THREE.HemisphereLight(0xdff0ff, 0x16384a, 2.2));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
  sun.position.set(3, 7, 8);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(28, W / H, 0.1, 200);
  cam.position.set(0, 0.8, 17);
  cam.lookAt(0, 0, 0);

  const slotX = (i: number) => (i - (picks.length - 1) / 2) * GAP;
  picks.forEach((id, i) => {
    const f = FISH.find((x) => x.id === id)!;
    const m = buildFish(f.color, false, false, f.tier, f.id);
    const size = new THREE.Box3().setFromObject(m.group).getSize(new THREE.Vector3());
    m.group.scale.setScalar((BASE + i * GROW) / Math.max(size.x, size.y, size.z));
    // Side on, head to the left.
    m.group.rotation.y = Math.PI / 2;
    m.group.position.x = slotX(i);
    // Centre each fish on its slot.
    const c = new THREE.Box3().setFromObject(m.group).getCenter(new THREE.Vector3());
    m.group.position.x += slotX(i) - c.x;
    m.group.position.y -= c.y;
    scene.add(m.group);
  });
  renderer.render(scene, cam);
  const canvas = renderer.domElement;
  Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', zIndex: '99999' });
  document.body.appendChild(canvas);

  const labels = document.createElement('div');
  Object.assign(labels.style, { position: 'fixed', left: '0', top: `${H - 210}px`, width: `${W}px`, zIndex: '100000', fontFamily: 'Nunito, sans-serif', color: '#fff', textAlign: 'center' });
  picks.forEach((id, i) => {
    const f = FISH.find((x) => x.id === id)!;
    const t = TIERS.indexOf(f.rarity);
    const x = ((new THREE.Vector3(slotX(i), 0, 0).project(cam).x + 1) / 2) * W;
    const d = document.createElement('div');
    Object.assign(d.style, { position: 'absolute', left: `${x - 150}px`, width: '300px' });
    d.innerHTML = `<div style="font-size:15px;letter-spacing:2px;text-transform:uppercase;font-weight:800;color:${TIER_COLORS[t]}">Tier ${t + 1} · ${TIER_NAMES[t]}</div>`
      + `<div style="font-size:24px;font-weight:700;margin-top:4px">${f.name}</div>`;
    labels.appendChild(d);
  });
  document.body.appendChild(labels);
}

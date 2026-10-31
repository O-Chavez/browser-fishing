// Renders every fish, one row per tier, over the game page for `npm run screenshots`.
// Loaded in the browser through Vite, so it shares the game's copy of three.js.
import * as THREE from 'three';
import { POND_FISH, SEA_FISH, type Fish } from '../src/data/content';
import { buildFish } from '../src/game/fishmodel';

const TIER_NAMES = ['Shallows', 'Sport fish', 'Lake giants', 'Jewel fish', 'Spirit fish'];
const TIER_COLORS = ['#c8c8c8', '#6ee07f', '#6fb0f2', '#c98af0', '#ffd65c'];
const TOP = 130;
const ROW = 250;
const LEFT = 290;
const COL = 320;
/** Longest side of every fish, in pixels. */
const FISH_LEN = 230;

interface Row { kicker: string; name: string; color: string; fish: Fish[] }

/** The pond Fishdex: one row per tier. Draws the chart at width W and returns its height. */
export function renderGrid(W: number): number {
  const rows: Row[] = TIER_NAMES.map((name, i) => ({ kicker: `TIER ${i + 1}`, name, color: TIER_COLORS[i], fish: POND_FISH.filter((f) => f.tier === i + 1) }));
  return renderRows(W, 'The Fishdex', `${POND_FISH.length} fish across 5 tiers · 🌙 bites only at night`, rows);
}

/** The Sea page: the Shelf and Drop-off species, for reviewing their looks. */
export function renderSea(W: number): number {
  const rows: Row[] = [
    { kicker: 'SHELF', name: 'Depths 1-15', color: '#6fb0f2', fish: SEA_FISH.filter((f) => f.locations.includes('shelf')) },
    { kicker: 'DROP-OFF', name: 'Depths 16-40', color: '#6fb0f2', fish: SEA_FISH.filter((f) => f.locations.includes('dropoff')) },
  ];
  return renderRows(W, 'The Fishdex · Sea', `${SEA_FISH.length} sea fish`, rows);
}

function renderRows(W: number, title: string, subtitle: string, rows: Row[]): number {
  const H = TOP + ROW * rows.length + 30;
  // Transparent canvas over the label layer, so the row bands sit behind the fish.
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdff0ff, 0x16384a, 2.2));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
  sun.position.set(300, 700, 800);
  scene.add(sun);
  // Pixel-space camera: x right, y down from the top-left corner.
  const cam = new THREE.OrthographicCamera(0, W, 0, -H, -2000, 2000);
  cam.position.z = 1000;

  const overlay = document.createElement('div');
  Object.assign(overlay.style, { position: 'fixed', left: '0', top: '0', width: `${W}px`, height: `${H}px`, zIndex: '99998', background: '#0e3a52', fontFamily: 'Nunito, sans-serif', color: '#fff' });
  overlay.innerHTML = `<div style="position:absolute;left:0;right:0;top:34px;text-align:center;font-size:40px;font-weight:800">${title}</div>`
    + `<div style="position:absolute;left:0;right:0;top:86px;text-align:center;font-size:17px;opacity:.7">${subtitle}</div>`;

  rows.forEach((row, r) => {
    const rowY = TOP + r * ROW;
    const fishY = rowY + ROW / 2 - 18;
    const band = document.createElement('div');
    Object.assign(band.style, { position: 'absolute', left: '24px', right: '24px', top: `${rowY + 8}px`, height: `${ROW - 16}px`, borderRadius: '18px', background: 'rgba(255,255,255,0.045)' });
    overlay.appendChild(band);
    const head = document.createElement('div');
    Object.assign(head.style, { position: 'absolute', left: '56px', top: `${fishY - 30}px`, width: '220px' });
    head.innerHTML = `<div style="font-size:16px;letter-spacing:3px;font-weight:800;color:${row.color}">${row.kicker}</div>`
      + `<div style="font-size:30px;font-weight:800;color:${row.color}">${row.name}</div>`;
    overlay.appendChild(head);

    row.fish.forEach((f, i) => {
      const cx = LEFT + COL * i + COL / 2;
      const m = buildFish(f.color, false, false, f.tier, f.id);
      // Side on, head to the left.
      m.group.rotation.y = Math.PI / 2;
      const size = new THREE.Box3().setFromObject(m.group).getSize(new THREE.Vector3());
      m.group.scale.setScalar(FISH_LEN / Math.max(size.x, size.y));
      // Centre each fish on its cell.
      const c = new THREE.Box3().setFromObject(m.group).getCenter(new THREE.Vector3());
      m.group.position.set(cx - c.x, -fishY - c.y, 0);
      scene.add(m.group);
      const label = document.createElement('div');
      Object.assign(label.style, { position: 'absolute', left: `${cx - 150}px`, width: '300px', top: `${fishY + 78}px`, textAlign: 'center' });
      label.innerHTML = `<div style="font-size:22px;font-weight:700">${f.name}${f.night ? ' 🌙' : ''}</div>`
        + `<div style="font-size:14px;opacity:.6;margin-top:2px">${f.minSize}–${f.maxSize} cm</div>`;
      overlay.appendChild(label);
    });
  });
  renderer.render(scene, cam);
  const canvas = renderer.domElement;
  Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', zIndex: '99999' });
  document.body.appendChild(canvas);
  document.body.appendChild(overlay);
  return H;
}

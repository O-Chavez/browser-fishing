import * as THREE from 'three';
import type { MapDef, Spot } from '../data/maps';
import { DARK, cyl, mat, rbox, textPlane } from './hub';
import type { Circle } from './player';
import { boxUV, damaskTexture, fluteTexture, latticeTexture, panelTexture } from './textures';

const WALL_H = 5.4;
const GOLD = 0xe0b441;
const PLUM = 0x6a2a44;
/** Chandelier spots (x, z, strong light), shared with the ceiling medallions above them. */
const CHANDELIERS = [[-9, 43, true], [9, 43, true], [0, 53, true], [0, 34, false], [-12, 33, false], [12, 33, false], [-12, 54, false], [12, 54, false]] as const;

export interface RoomCtx {
  group: THREE.Group;
  solid: (c: Circle) => void;
  /** A basic material whose brightness follows the neon pulse. */
  glow: (color: number) => THREE.MeshBasicMaterial;
}

function carpetTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#4a1022';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#8a6a2a';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(64, 6);
  g.lineTo(122, 64);
  g.lineTo(64, 122);
  g.lineTo(6, 64);
  g.closePath();
  g.stroke();
  g.fillStyle = '#6a1a34';
  g.beginPath();
  g.arc(64, 64, 14, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#8a6a2a';
  for (const [x, y] of [[0, 0], [128, 0], [0, 128], [128, 128]]) {
    g.beginPath();
    g.arc(x, y, 8, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export function neonSign(text: string, w: number, color: string, bg = '#1a0a14'): THREE.Mesh {
  const { mesh, ctx, tex } = textPlane(w, w * 0.2, 512);
  const { width, height } = ctx.canvas;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = color;
  ctx.lineWidth = 7;
  ctx.strokeRect(7, 7, width - 14, height - 14);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  let px = Math.round(height * 0.52);
  ctx.font = `800 ${px}px system-ui, sans-serif`;
  while (ctx.measureText(text).width > width - 40 && px > 10) ctx.font = `800 ${--px}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2 + 3);
  tex.needsUpdate = true;
  return mesh;
}

/** The casino building: carpet, walls, ceiling, pillars, chandeliers, slot machines and the entrance. */
export function buildRoom(ctx: RoomCtx, hall: NonNullable<MapDef['casino']>['hall'], mirror: Spot): void {
  const { group, solid } = ctx;
  const { x: cx, z: cz, w, d } = hall;
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const z0 = cz - d / 2;
  const z1 = cz + d / 2;
  const put = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0): T => {
    o.position.set(x, y, z);
    o.rotation.y = ry;
    group.add(o);
    return o;
  };

  const tex = carpetTexture();
  tex.repeat.set(w / 1.6, d / 1.6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat(0xffffff, { map: tex }));
  floor.receiveShadow = true;
  put(floor, cx, 0, cz);
  const lattice = latticeTexture().clone();
  lattice.repeat.set(w / 2, d / 2);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2), mat(0x6a3448, { map: lattice, emissive: new THREE.Color(0x24101a) }));
  put(ceil, cx, WALL_H, cz);

  // Walls: plum upper, dark wood wainscot, gold rail.
  const upperMat = mat(PLUM, { map: damaskTexture() });
  const wainsMat = mat(0x6a4028, { map: panelTexture() });
  const wall = (len: number, x: number, z: number, ry: number): void => {
    const g = new THREE.Group();
    const upper = rbox(len, WALL_H, 0.4, PLUM, 0.02);
    upper.position.y = WALL_H / 2;
    const wains = rbox(len - 0.1, 1.3, 0.46, 0x4a2c1c, 0.03);
    wains.position.y = 0.65;
    // Damask tiles are 1 m wide and 2 m tall; one wood panel is 1.3 m square
    boxUV(upper.geometry, 1, len / 2, 0, 0.5);
    upper.material = upperMat;
    boxUV(wains.geometry, 1 / 1.3, len / 2, 0.65);
    wains.material = wainsMat;
    const rail = rbox(len - 0.05, 0.12, 0.5, GOLD, 0.03);
    rail.position.y = 1.36;
    const crown = rbox(len, 0.25, 0.55, GOLD, 0.04);
    crown.position.y = WALL_H - 0.12;
    g.add(upper, wains, rail, crown);
    put(g, x, 0, z, ry);
  };
  wall(w + 0.8, cx, z1 + 0.2, 0);
  wall(w + 0.8, cx, z0 - 0.2, 0);
  wall(d, x0 - 0.2, cz, Math.PI / 2);
  wall(d, x1 + 0.2, cz, Math.PI / 2);

  // Wall colliders.
  for (let x = x0 - 0.3; x <= x1 + 0.3; x += 1) {
    solid({ x, z: z1 + 0.35, r: 0.7 });
    solid({ x, z: z0 - 0.35, r: 0.7 });
  }
  for (let z = z0; z <= z1; z += 1) {
    solid({ x: x0 - 0.35, z, r: 0.7 });
    solid({ x: x1 + 0.35, z, r: 0.7 });
  }

  // Entrance: double doors, a lit EXIT sign and a gold arch on the front wall.
  const door = new THREE.Group();
  for (const sx of [-1, 1]) {
    const leaf = rbox(1.5, 3.2, 0.12, 0x5a2f1c, 0.03);
    leaf.position.set(sx * 0.78, 1.6, 0);
    const pane = rbox(1.0, 1.6, 0.14, 0x2b3a4a, 0.03);
    pane.position.set(sx * 0.78, 1.9, 0);
    const handle = cyl(0.04, 0.04, 0.6, GOLD, 8);
    handle.position.set(sx * 0.1, 1.5, 0.12);
    door.add(leaf, pane, handle);
  }
  const arch = rbox(3.6, 0.2, 0.3, GOLD, 0.05);
  arch.position.y = 3.3;
  door.add(arch);
  put(door, cx, 0, z0 + 0.02);
  const exit = neonSign('EXIT · STARTER POND', 3.4, '#7dffb0');
  put(exit, cx, 3.85, z0 + 0.3);

  // Marquee over the back wall.
  const marquee = neonSign('GILDED PERCH CASINO', 9, '#ffd35a');
  put(marquee, cx, 4.35, z1 - 0.25, Math.PI);

  // Pillars.
  for (const [px, pz] of [[-5.5, 34.5], [5.5, 34.5], [-5.5, 51.5], [5.5, 51.5]]) {
    const p = new THREE.Group();
    const shaft = cyl(0.42, 0.45, WALL_H, 0x5a2a3c, 16);
    (shaft.material as THREE.MeshLambertMaterial).map = fluteTexture();
    shaft.position.y = WALL_H / 2;
    const base = cyl(0.62, 0.66, 0.35, GOLD, 16);
    base.position.y = 0.17;
    const cap = cyl(0.64, 0.5, 0.4, GOLD, 16);
    cap.position.y = WALL_H - 0.2;
    p.add(shaft, base, cap);
    put(p, px, 0, pz);
    solid({ x: px, z: pz, r: 0.7 });
  }

  // Chandeliers, each with a real light.
  const bulbs = ctx.glow(0xffe2a0);
  const chandelier = (x: number, z: number, strong: boolean): void => {
    const g = new THREE.Group();
    const rod = cyl(0.03, 0.03, 1.0, DARK, 6);
    rod.position.y = WALL_H - 0.5;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 6, 20).rotateX(Math.PI / 2), mat(GOLD));
    ring.position.y = WALL_H - 1.1;
    g.add(rod, ring);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), bulbs);
      b.position.set(Math.cos(a) * 0.7, WALL_H - 1.0, Math.sin(a) * 0.7);
      g.add(b);
    }
    const l = new THREE.PointLight(0xffd9a0, strong ? 14 : 9, 16, 1.6);
    l.position.y = WALL_H - 1.4;
    g.add(l);
    put(g, x, 0, z);
  };
  for (const [x, z, s] of CHANDELIERS) chandelier(x, z, s);

  // Slot machines along both side walls.
  const slotBody = mat(0x2a1232);
  const slotTrim = mat(GOLD);
  const screens = [0xff4f9a, 0x4fd2ff, 0xffd35a, 0x7dffb0].map((c) => ctx.glow(c));
  const seat = mat(0x7a1f3f);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 11; i++) {
      const z = z0 + 5.2 + i * 2.15;
      if (z > z1 - 3) break;
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.85, 0.95), slotBody);
      body.position.y = 0.93;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 1.0), slotTrim);
      head.position.y = 1.95;
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.55), screens[(i + (side > 0 ? 2 : 0)) % 4]);
      scr.position.set(-0.41, 1.35, 0);
      scr.rotation.y = -Math.PI / 2;
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.45, 10), seat);
      stool.position.set(-1.0, 0.23, 0);
      g.add(body, head, scr, stool);
      // Machines face the room: local -x is the screen side.
      put(g, side < 0 ? x0 + 0.65 : x1 - 0.65, 0, z, side < 0 ? Math.PI : 0);
      solid({ x: side < 0 ? x0 + 0.8 : x1 - 0.8, z, r: 0.55 });
    }
  }

  {
    // Coffered ceiling: a grid of dark wood beams with gold medallions over the chandeliers
    // A faint warm self-glow stands in for chandelier light reaching up to the ceiling
    const beamMat = mat(0x7a4a34, { map: panelTexture(), emissive: new THREE.Color(0x2a140c) });
    const step = w / 8;
    for (let i = 1; i < 8; i++) {
      const bx = rbox(0.32, 0.3, d, 0x3a1a22, 0.03);
      boxUV(bx.geometry, 1.5);
      bx.material = beamMat;
      put(bx, x0 + i * step, WALL_H - 0.15, cz);
      const bz = rbox(w, 0.3, 0.32, 0x3a1a22, 0.03);
      boxUV(bz.geometry, 1.5);
      bz.material = beamMat;
      put(bz, cx, WALL_H - 0.15, z0 + i * (d / 8));
    }
    const medMat = mat(GOLD, { emissive: new THREE.Color(0x4a3008) });
    for (const [x, z] of CHANDELIERS) {
      const med = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.06, 24), medMat);
      put(med, x, WALL_H - 0.05, z);
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.08, 24), mat(0x6a3448));
      put(inner, x, WALL_H - 0.06, z);
    }
  }

  {
    // Wall sconces above the slot machines: glow only, no extra lights
    const glowBulb = ctx.glow(0xffd9a0);
    const sconce = (x: number, z: number, ry: number) => {
      const g = new THREE.Group();
      const plate = rbox(0.28, 0.5, 0.06, GOLD, 0.02);
      const arm = cyl(0.03, 0.03, 0.3, GOLD, 6);
      arm.rotation.x = Math.PI / 2;
      arm.position.set(0, -0.05, 0.15);
      const cup = cyl(0.13, 0.07, 0.12, GOLD, 10);
      cup.position.set(0, 0.02, 0.3);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), glowBulb);
      bulb.position.set(0, 0.14, 0.3);
      g.add(plate, arm, cup, bulb);
      g.scale.setScalar(1.5);
      put(g, x, 3.3, z, ry);
    };
    for (let z = z0 + 6.3; z < z1 - 3; z += 4.3) {
      sconce(x0 + 0.02, z, Math.PI / 2);
      sconce(x1 - 0.02, z, -Math.PI / 2);
    }
    // Framed fish paintings on the back and front walls
    const painting = (x: number, z: number, ry: number, hue: number, seed: number) => {
      const { mesh, ctx: p, tex } = textPlane(2.0, 1.35, 384);
      const W = p.canvas.width;
      const H = p.canvas.height;
      const sky = p.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, `hsl(${hue}, 45%, 70%)`);
      sky.addColorStop(1, `hsl(${hue + 20}, 55%, 30%)`);
      p.fillStyle = sky;
      p.fillRect(0, 0, W, H);
      p.fillStyle = 'rgba(255,255,255,0.18)';
      for (let i = 0; i < 6; i++) p.fillRect(0, H * (0.55 + i * 0.07), W, 3);
      p.save();
      p.translate(W * 0.5, H * 0.5);
      p.rotate(seed % 2 ? -0.18 : 0.12);
      p.fillStyle = `hsl(${(hue + 160) % 360}, 70%, 60%)`;
      p.beginPath();
      p.ellipse(0, 0, W * 0.22, H * 0.16, 0, 0, Math.PI * 2);
      p.fill();
      p.beginPath();
      p.moveTo(W * 0.18, 0);
      p.lineTo(W * 0.32, -H * 0.15);
      p.lineTo(W * 0.32, H * 0.15);
      p.closePath();
      p.fill();
      p.fillStyle = '#fff';
      p.beginPath();
      p.arc(-W * 0.13, -H * 0.03, H * 0.035, 0, Math.PI * 2);
      p.fill();
      p.fillStyle = '#222';
      p.beginPath();
      p.arc(-W * 0.125, -H * 0.03, H * 0.018, 0, Math.PI * 2);
      p.fill();
      p.restore();
      tex.needsUpdate = true;
      (mesh.material as THREE.MeshBasicMaterial).color.setScalar(0.8);
      const frame = rbox(2.3, 1.65, 0.1, GOLD, 0.04);
      const g = new THREE.Group();
      mesh.position.z = 0.06;
      g.add(frame, mesh);
      put(g, x, 2.9, z + (ry === 0 ? 0.07 : -0.07), ry);
    };
    painting(-11, z1 - 0.02, Math.PI, 200, 1);
    painting(11, z1 - 0.02, Math.PI, 30, 2);
    painting(-8, z0 + 0.02, 0, 280, 3);
    painting(8, z0 + 0.02, 0, 150, 4);
  }

  // Dressing mirror on the left wall by the entrance.
  const m = new THREE.Group();
  const frame = rbox(0.12, 2.5, 1.5, GOLD, 0.04);
  frame.position.y = 1.65;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.3), new THREE.MeshBasicMaterial({ color: 0x9ec4d8 }));
  glass.position.set(0.07, 1.65, 0);
  glass.rotation.y = Math.PI / 2;
  m.add(frame, glass);
  put(m, x0 + 0.1, 0, mirror.z);

  // Plants in the corners.
  for (const [px, pz] of [[x0 + 1, z0 + 1.2], [x1 - 1, z0 + 1.2], [x0 + 1, z1 - 1.2], [x1 - 1, z1 - 1.2]]) {
    const pot = cyl(0.4, 0.3, 0.6, 0x6b2a3a, 12);
    pot.position.y = 0.3;
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), mat(0x2f6b3a));
    leaves.position.y = 1.1;
    const g = new THREE.Group();
    g.add(pot, leaves);
    put(g, px, 0, pz);
    solid({ x: px, z: pz, r: 0.6 });
  }
}

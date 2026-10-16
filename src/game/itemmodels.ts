import * as THREE from 'three';
import { BAITS, RODS } from '../data/content';

const lambert = (color: number) => new THREE.MeshLambertMaterial({ color });

export const TIN_COLORS: Record<string, number> = Object.fromEntries(BAITS.map((b) => [b.id, b.color]));

/** The colored bait jar from the shop stall, centred on its middle. */
export function buildTin(id: string): THREE.Group {
  const g = new THREE.Group();
  const tin = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.16, 16), lambert(TIN_COLORS[id] ?? 0x999999));
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 16), lambert(0x3b3b40));
  lid.position.y = 0.1;
  g.add(tin, lid);
  const b = BAITS.find((x) => x.id === id);
  if (b && b.tier >= 4) {
    (tin.material as THREE.MeshLambertMaterial).emissive.setHex(b.color).multiplyScalar(0.55);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: b.color })));
    g.children[g.children.length - 1].position.y = 0.16;
  }
  return g;
}

/** A compact copy of the first-person rod (handle, reel, tapering shaft) lying along the x axis. */
export function buildRodModel(id = 'twig'): THREE.Group {
  const r = RODS.find((x) => x.id === id);
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.4, 8).rotateZ(Math.PI / 2), lambert(0xb98a52));
  handle.position.x = -0.5;
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 14).rotateX(Math.PI / 2), lambert(0x9aa3ad));
  reel.position.set(-0.45, -0.06, 0);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.019, 1.1, 6).rotateZ(-Math.PI / 2), lambert(0x15171c));
  shaft.position.x = 0.25;
  g.add(handle, reel, shaft);
  if (r && r.tier > 1) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.05, 8).rotateZ(Math.PI / 2), r.tier >= 4 ? new THREE.MeshBasicMaterial({ color: r.color }) : lambert(r.color));
    band.position.x = -0.28;
    g.add(band);
    if (r.tier >= 4) {
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: r.color }));
      tip.position.x = 0.8;
      g.add(tip);
    }
  }
  return g;
}

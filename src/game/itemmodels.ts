import * as THREE from 'three';

const lambert = (color: number) => new THREE.MeshLambertMaterial({ color });

export const TIN_COLORS: Record<string, number> = { worm: 0x9aa3ad, fly: 0xcc6a3a, minnow: 0x4a8f5a };

/** The colored bait jar from the shop stall, centred on its middle. */
export function buildTin(id: string): THREE.Group {
  const g = new THREE.Group();
  const tin = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.16, 16), lambert(TIN_COLORS[id] ?? 0x999999));
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 16), lambert(0x3b3b40));
  lid.position.y = 0.1;
  g.add(tin, lid);
  return g;
}

/** A compact copy of the first-person rod (handle, reel, tapering shaft) lying along the x axis. */
export function buildRodModel(): THREE.Group {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.4, 8).rotateZ(Math.PI / 2), lambert(0xb98a52));
  handle.position.x = -0.5;
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 14).rotateX(Math.PI / 2), lambert(0x9aa3ad));
  reel.position.set(-0.45, -0.06, 0);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.019, 1.1, 6).rotateZ(-Math.PI / 2), lambert(0x15171c));
  shaft.position.x = 0.25;
  g.add(handle, reel, shaft);
  return g;
}

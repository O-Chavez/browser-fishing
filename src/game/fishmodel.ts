import * as THREE from 'three';

export interface FishModel {
  group: THREE.Group;
  tail: THREE.Object3D;
  materials: THREE.Material[];
}

/** Low-poly fish, nose toward -Z, length 1 unit. `shadow` makes a dark underwater silhouette. */
export function buildFish(baseColor: number, shadow = false, shiny = false): FishModel {
  const color = shiny ? new THREE.Color(baseColor).lerp(new THREE.Color(0xffd23a), 0.7).getHex() : baseColor;
  const group = new THREE.Group();
  const materials: THREE.Material[] = [];
  const mat = (c: number) => {
    const m: THREE.Material = shadow
      ? new THREE.MeshBasicMaterial({ color: shiny ? 0x9a7410 : 0x06141a, transparent: true, opacity: shiny ? 0.9 : 0.75 })
      : new THREE.MeshPhongMaterial({ color: c, shininess: shiny ? 120 : 40, specular: shiny ? 0xffffff : 0x333333, emissive: shiny ? 0x6b4a00 : 0x000000 });
    materials.push(m);
    return m;
  };
  const bodyGeo = new THREE.SphereGeometry(0.5, 24, 16);
  const top = new THREE.Color(color);
  const low = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.4);
  const cols: number[] = [];
  const pos = bodyGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = THREE.MathUtils.smoothstep(pos.getY(i), 0.0, -0.4);
    const c = top.clone().lerp(low, k);
    cols.push(c.r, c.g, c.b);
  }
  bodyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const bodyMat = mat(0xffffff);
  if (!shadow) (bodyMat as THREE.MeshPhongMaterial).vertexColors = true;
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.scale.set(0.28, 0.4, 1);
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 12), mat(new THREE.Color(color).multiplyScalar(0.7).getHex()));
  dorsal.position.set(0, 0.2, 0.05);
  dorsal.rotation.x = 0.4;

  const tail = new THREE.Group();
  tail.position.z = 0.42;
  const fin = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 0.3, 14).rotateX(-Math.PI / 2),
    mat(new THREE.Color(color).multiplyScalar(0.8).getHex()),
  );
  fin.position.z = 0.14;
  fin.scale.x = 0.15;
  tail.add(fin);

  const finMat = mat(new THREE.Color(color).multiplyScalar(0.85).getHex());
  group.add(body, dorsal, tail);
  for (const sx of [-1, 1]) {
    const pec = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), finMat);
    pec.scale.set(0.15, 0.5, 1.1);
    pec.position.set(sx * 0.13, -0.07, -0.12);
    pec.rotation.set(0, 0, sx * 0.5);
    group.add(pec);
  }
  if (!shadow) {
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (const s of [-1, 1]) {
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: 0xf6f6f0 }));
      white.position.set(s * 0.1, 0.06, -0.35);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 6), eyeMat);
      eye.position.set(s * 0.025, 0.003, -0.025);
      white.add(eye);
      group.add(white);
    }
  }
  return { group, tail, materials };
}

export function setFishOpacity(m: FishModel, a: number): void {
  for (const mat of m.materials) {
    (mat as THREE.MeshBasicMaterial).opacity = a * 0.75;
  }
}

export function animateFish(m: FishModel, t: number, speed: number, amp: number): void {
  m.tail.rotation.y = Math.sin(t * speed) * amp;
  m.group.children[0].rotation.y = Math.sin(t * speed + 0.6) * amp * 0.25;
}

/** Rotate so the nose (-Z) points along (vx, vz). */
export function faceDirection(g: THREE.Object3D, vx: number, vz: number): void {
  if (vx * vx + vz * vz > 1e-8) g.rotation.y = Math.atan2(-vx, -vz);
}

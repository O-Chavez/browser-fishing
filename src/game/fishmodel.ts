import * as THREE from 'three';

export interface FishModel {
  group: THREE.Group;
  tail: THREE.Object3D;
  materials: THREE.Material[];
  /** Decorations that orbit or pulse for high tiers. */
  orbit?: THREE.Group;
  pulse?: THREE.Material[];
}

/** Low-poly fish, nose toward -Z, length 1 unit. `shadow` makes a dark underwater silhouette. */
export function buildFish(baseColor: number, shadow = false, shiny = false, tier = 1): FishModel {
  const color = shiny ? new THREE.Color(baseColor).lerp(new THREE.Color(0xffd23a), 0.7).getHex() : baseColor;
  const group = new THREE.Group();
  const materials: THREE.Material[] = [];
  const glow = tier >= 4 ? new THREE.Color(color).multiplyScalar((tier >= 5 ? 0.3 : 0.2) * (new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 }).l > 0.8 ? 0.25 : 1)).getHex() : 0;
  const mat = (c: number) => {
    const m: THREE.Material = shadow
      ? new THREE.MeshBasicMaterial({ color: shiny ? 0x9a7410 : 0x06141a, transparent: true, opacity: shiny ? 0.9 : 0.75 })
      : new THREE.MeshPhongMaterial({ color: c, shininess: shiny ? 120 : 40 + tier * 25, specular: shiny ? 0xffffff : tier >= 3 ? 0x999999 : 0x333333, emissive: shiny ? 0x6b4a00 : glow });
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
    let c = top.clone().lerp(low, k);
    if (tier >= 3 && Math.sin(pos.getZ(i) * 18) > 0.55) c = c.lerp(new THREE.Color(0x000000), 0.28);
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
  dorsal.scale.set(1 + (tier - 1) * 0.25, 1 + (tier - 1) * 0.35, 1);

  const tail = new THREE.Group();
  tail.position.z = 0.42;
  const fin = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 0.3, 14).rotateX(-Math.PI / 2),
    mat(new THREE.Color(color).multiplyScalar(0.8).getHex()),
  );
  fin.position.z = 0.14;
  fin.scale.set(0.15, 1 + Math.max(0, tier - 3) * 0.35, 1 + Math.max(0, tier - 3) * 0.25);
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
  let orbit: THREE.Group | undefined;
  const pulse: THREE.Material[] = [];
  const base = new THREE.Color(color);
  const bright = base.r + base.g + base.b > 2.3;
  const accent = bright ? new THREE.Color(0x7fc4ff) : base.clone().lerp(new THREE.Color(0xffffff), 0.3);
  const add = (o: THREE.Object3D) => group.add(o);
  const glowMat = (op: number) => {
    const m = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
    pulse.push(m);
    return m;
  };
  if (!shadow) {
    // T2: second dorsal fin and a lateral stripe
    if (tier >= 2) {
      const stripe = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 6, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.08), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.55 }));
      stripe.scale.set(0.285, 0.405, 1.005);
      add(stripe);
      const d2 = dorsal.clone();
      d2.position.set(0, 0.17, 0.3);
      d2.scale.multiplyScalar(0.7);
      add(d2);
    }
    // T3: a tall sail fin and flowing tail streamers
    if (tier >= 3) {
      const sail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 4).rotateX(Math.PI / 2), mat(new THREE.Color(color).multiplyScalar(0.9).getHex()));
      sail.scale.set(0.12, 1, 1);
      sail.position.set(0, 0.3, 0.02);
      sail.rotation.x = 0.2;
      add(sail);
      for (const sx of [-1, 1]) {
        const st = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.4, 6).rotateX(Math.PI / 2), glowMat(0.6));
        st.position.set(sx * 0.05, 0, 0.3);
        st.rotation.y = sx * 0.25;
        tail.add(st);
      }
    }
    // T4: glowing halo, translucent crest and orbiting sparks
    if (tier >= 4) {
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 12), glowMat(tier >= 5 ? 0.22 : 0.14));
      halo.scale.set(0.42, 0.56, 1.25);
      add(halo);
      const crest = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 5), glowMat(0.45));
      crest.scale.set(0.15, 1, 1);
      crest.position.set(0, 0.36, -0.2);
      crest.rotation.x = -0.5;
      add(crest);
      orbit = new THREE.Group();
      const n = tier >= 5 ? 7 : 4;
      for (let i = 0; i < n; i++) {
        const sp = new THREE.Mesh(new THREE.SphereGeometry(tier >= 5 ? 0.028 : 0.022, 8, 6), new THREE.MeshBasicMaterial({ color: tier >= 5 ? 0xffffff : accent, blending: THREE.AdditiveBlending, transparent: true }));
        const a = (i / n) * Math.PI * 2;
        sp.position.set(Math.cos(a) * 0.4, Math.sin(a * 2) * 0.12, Math.sin(a) * 0.65);
        orbit.add(sp);
      }
      add(orbit);
    }
    // T5: wing-like fins, a second glow shell and glowing eyes
    if (tier >= 5) {
      for (const sx of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 6).rotateX(Math.PI / 2), glowMat(0.5));
        wing.scale.set(0.08, 1, 1);
        wing.position.set(sx * 0.2, 0.03, 0.12);
        wing.rotation.set(0.1, sx * 0.55, sx * 0.9);
        add(wing);
      }
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 12), glowMat(0.1));
      shell.scale.set(0.62, 0.8, 1.6);
      add(shell);
      for (const e of group.children) {
        if (e instanceof THREE.Mesh && (e.material as THREE.MeshBasicMaterial).color?.getHex() === 0xf6f6f0) (e.material as THREE.MeshBasicMaterial).color.setHex(0xfff2a0);
      }
    }
  }
  return { group, tail, materials, orbit, pulse };
}

export function setFishOpacity(m: FishModel, a: number): void {
  for (const mat of m.materials) {
    (mat as THREE.MeshBasicMaterial).opacity = a * 0.75;
  }
}

export function animateFish(m: FishModel, t: number, speed: number, amp: number): void {
  m.tail.rotation.y = Math.sin(t * speed) * amp;
  m.group.children[0].rotation.y = Math.sin(t * speed + 0.6) * amp * 0.25;
  if (m.orbit) m.orbit.rotation.y = t * 1.6;
  if (m.pulse) {
    const k = 0.8 + Math.sin(t * 3) * 0.2;
    m.pulse.forEach((p, i) => ((p as THREE.MeshBasicMaterial).opacity = Math.min(1, ((p as THREE.MeshBasicMaterial).userData.o ??= (p as THREE.MeshBasicMaterial).opacity) * k * (i % 2 ? 1.1 : 1))));
  }
}

/** Rotate so the nose (-Z) points along (vx, vz). */
export function faceDirection(g: THREE.Object3D, vx: number, vz: number): void {
  if (vx * vx + vz * vz > 1e-8) g.rotation.y = Math.atan2(-vx, -vz);
}

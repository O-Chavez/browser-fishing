import * as THREE from 'three';

export interface FishModel {
  group: THREE.Group;
  tail: THREE.Object3D;
  materials: THREE.Material[];
  /** Decorations that orbit or pulse for high tiers. */
  orbit?: THREE.Group;
  pulse?: THREE.Material[];
  /** Exotic (tier 5) bodies: segments that undulate, plumes that flicker, ribbons that cycle colour. */
  body?: THREE.Object3D;
  wave?: THREE.Object3D[];
  flames?: THREE.Object3D[];
  flaps?: { o: THREE.Object3D; s: number }[];
  hue?: { m: THREE.MeshBasicMaterial; off: number }[];
  twinkle?: THREE.Object3D[];
  spin?: THREE.Object3D[];
}

type Flair = 'veil' | 'flame' | 'ribbon' | 'stars';
const EXOTIC: Record<string, { body: number; glow: number; flair: Flair; ghost?: boolean }> = {
  ghostcarp: { body: 0xe4f1ff, glow: 0x8fd0ff, flair: 'veil', ghost: true },
  sunfire: { body: 0xff6a1a, glow: 0xffc23a, flair: 'flame' },
  aurorapike: { body: 0x1fc9b0, glow: 0x7af0d8, flair: 'ribbon' },
  constellation: { body: 0x241868, glow: 0xb9a8ff, flair: 'stars' },
};

/** Tier 5: a serpentine, dragon-like body with a mane, horns, whiskers, ribbon fins and orbiting rings. */
function buildExotic(baseColor: number, shiny: boolean, id: string): FishModel {
  const st = EXOTIC[id] ?? { body: baseColor, glow: 0xfff2a0, flair: 'ribbon' as Flair };
  const bodyCol = new THREE.Color(shiny ? new THREE.Color(st.body).lerp(new THREE.Color(0xffd23a), 0.6) : st.body);
  const glowCol = new THREE.Color(shiny ? 0xffe27a : st.glow);
  const group = new THREE.Group();
  const materials: THREE.Material[] = [];
  const pulse: THREE.Material[] = [];
  const hue: { m: THREE.MeshBasicMaterial; off: number }[] = [];
  const flames: THREE.Object3D[] = [];
  const flaps: { o: THREE.Object3D; s: number }[] = [];
  const twinkle: THREE.Object3D[] = [];
  const spin: THREE.Object3D[] = [];
  const wave: THREE.Object3D[] = [];

  const solid = (c: THREE.Color, em = 0.35) => {
    const m = new THREE.MeshPhongMaterial({
      color: c, shininess: 140, specular: 0xffffff, emissive: c.clone().multiplyScalar(em),
      transparent: !!st.ghost, opacity: st.ghost ? 0.62 : 1,
    });
    materials.push(m);
    return m;
  };
  const glow = (op: number, c = glowCol, cycle = false) => {
    const m = new THREE.MeshBasicMaterial({ color: c.clone(), transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    pulse.push(m);
    if (cycle) hue.push({ m, off: hue.length * 0.17 });
    return m;
  };

  const N = 14;
  const segs: THREE.Group[] = [];
  for (let i = 0; i < N; i++) {
    const k = i / (N - 1);
    const r = i === 0 ? 0.15 : 0.04 + 0.14 * Math.sin(Math.min(1, (k + 0.12) * 1.15) * Math.PI * 0.82);
    const seg = new THREE.Group();
    seg.position.z = -0.45 + k * 1.1;
    const c = bodyCol.clone().lerp(glowCol, k * 0.25);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), solid(c));
    ball.scale.set(1, 1.1, 1.55);
    seg.add(ball);
    // Mane: a glowing plume along the back
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16 + 0.1 * Math.sin(k * Math.PI), 5), glow(0.3, glowCol, st.flair === 'ribbon'));
    plume.position.y = r * 1.15 + 0.07;
    plume.rotation.x = -0.35;
    seg.add(plume);
    if (st.flair === 'flame') flames.push(plume);
    // Belly lantern
    if (i % 3 === 1) {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), glow(0.9, new THREE.Color(0xffffff)));
      orb.position.y = -r * 1.1;
      seg.add(orb);
      twinkle.push(orb);
    }
    group.add(seg);
    segs.push(seg);
    wave.push(seg);
  }

  // Head: glowing eyes, antler horns, whiskers
  const head = segs[0];
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff6b0 }));
    eye.position.set(sx * 0.1, 0.06, -0.1);
    head.add(eye);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), glow(0.35, new THREE.Color(0xffee88)));
    halo.position.copy(eye.position);
    head.add(halo);
    for (const [len, tilt, y] of [[0.34, 0.9, 0.12], [0.2, 1.5, 0.2]] as const) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.025, len, 6), solid(new THREE.Color(0xfff0c0), 0.5));
      horn.position.set(sx * 0.08, y + 0.08, 0.05);
      horn.rotation.set(0.5 + tilt * 0.35, 0, -sx * (tilt * 0.55));
      head.add(horn);
    }
    const whisk = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.012, 0.55, 5), glow(0.8));
    whisk.position.set(sx * 0.13, -0.04, -0.2);
    whisk.rotation.set(1.25, 0, -sx * 0.6);
    head.add(whisk);
    flaps.push({ o: whisk, s: sx });
  }

  // Ribbon fins on the flanks
  for (const idx of [3, 5]) {
    for (const sx of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.5, 3).rotateZ(Math.PI / 2 * sx), glow(0.28, glowCol, st.flair === 'ribbon'));
      fin.position.set(sx * 0.2, 0, 0.06);
      fin.scale.set(1, 0.18, 1);
      segs[idx].add(fin);
      flaps.push({ o: fin, s: sx });
    }
  }

  // Flowing tail fan, attached to the last segment so it follows the wave
  const tail = new THREE.Group();
  tail.position.z = 0.04;
  const fan = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 8).rotateX(-Math.PI / 2), glow(0.3, glowCol, st.flair === 'ribbon'));
  fan.position.z = 0.22;
  fan.scale.set(0.08, 1.2, 1);
  tail.add(fan);
  for (const sx of [-1, 0, 1]) {
    const st2 = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.5, 5).rotateX(Math.PI / 2), glow(0.5, glowCol, st.flair === 'ribbon'));
    st2.position.set(sx * 0.06, sx * 0.04, 0.5);
    st2.rotation.y = sx * 0.3;
    tail.add(st2);
  }
  segs[N - 1].add(tail);

  // Species flair
  if (st.flair === 'veil') {
    for (let i = 0; i < 6; i++) {
      const v = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.7, 4).rotateX(Math.PI / 2), glow(0.28));
      v.position.set(Math.sin(i * 2.1) * 0.12, Math.cos(i * 2.1) * 0.12, 0.2);
      v.rotation.y = Math.sin(i * 2.1) * 0.25;
      segs[6].add(v);
      flaps.push({ o: v, s: i % 2 ? 1 : -1 });
    }
  } else if (st.flair === 'stars') {
    for (let i = 0; i < 22; i++) {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(0.014 + (i % 3) * 0.006, 6, 5), glow(1, new THREE.Color(0xffffff)));
      const seg = segs[1 + (i % (N - 2))];
      const a = i * 2.4;
      sp.position.set(Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0);
      seg.add(sp);
      twinkle.push(sp);
    }
  } else if (st.flair === 'flame') {
    for (let i = 0; i < 3; i++) {
      const em = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), glow(0.6, new THREE.Color(0xff5a10)));
      em.position.set((i - 1) * 0.07, 0.3, 0.1);
      segs[4].add(em);
      flames.push(em);
    }
  }

  // Orbiting rings and sparks
  const orbit = new THREE.Group();
  for (let r = 0; r < 2; r++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34 + r * 0.1, 0.008, 6, 40), glow(0.6, glowCol, st.flair === 'ribbon'));
    ring.rotation.set(Math.PI / 2 + r * 0.7, r * 0.5, 0);
    ring.position.z = 0.02;
    orbit.add(ring);
    spin.push(ring);
  }
  for (let i = 0; i < 10; i++) {
    const sp = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), glow(0.95, new THREE.Color(0xffffff)));
    const a = (i / 10) * Math.PI * 2;
    sp.position.set(Math.cos(a) * 0.45, Math.sin(a * 2) * 0.16, Math.sin(a) * 0.6);
    orbit.add(sp);
    twinkle.push(sp);
  }
  group.add(orbit);
  const aura = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 12), glow(0.09));
  aura.scale.set(0.9, 1.0, 2.2);
  group.add(aura);
  // Great wing-fins and a spiked crown make the silhouette unmistakable
  for (const sx of [-1, 1]) {
    for (const [z, len, rot] of [[-0.05, 0.9, 0.5], [0.2, 0.7, 0.8]] as const) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.2, len, 4).rotateX(Math.PI / 2), glow(0.4, glowCol, st.flair === 'ribbon'));
      wing.scale.set(0.06, 1, 1);
      wing.position.set(sx * 0.22, 0.12, z);
      wing.rotation.set(0.1, sx * 0.4, sx * rot * 1.6);
      group.add(wing);
      flaps.push({ o: wing, s: sx });
    }
  }
  for (let i = 0; i < 5; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.3 - Math.abs(i - 2) * 0.05, 5), solid(new THREE.Color(0xfff0c0), 0.6));
    spike.position.set((i - 2) * 0.05, 0.2, -0.52 + Math.abs(i - 2) * 0.04);
    spike.rotation.x = -0.4;
    group.add(spike);
  }
  const outer = new THREE.Group();
  group.scale.setScalar(1.7);
  outer.add(group);
  return { group: outer, tail, materials, orbit, pulse, wave, flames, flaps, hue, twinkle, spin };
}

/** Low-poly fish, nose toward -Z, length 1 unit. `shadow` makes a dark underwater silhouette. */
export function buildFish(baseColor: number, shadow = false, shiny = false, tier = 1, id = ''): FishModel {
  if (tier >= 5 && !shadow) return buildExotic(baseColor, shiny, id);
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
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 12), glowMat(0.24));
      halo.scale.set(0.42, 0.56, 1.25);
      add(halo);
      const crest = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 5), glowMat(0.45));
      crest.scale.set(0.15, 1, 1);
      crest.position.set(0, 0.36, -0.2);
      crest.rotation.x = -0.5;
      add(crest);
      orbit = new THREE.Group();
      const n = 9;
      for (let i = 0; i < n; i++) {
        const sp = new THREE.Mesh(new THREE.SphereGeometry(tier >= 5 ? 0.028 : 0.022, 8, 6), new THREE.MeshBasicMaterial({ color: tier >= 5 ? 0xffffff : accent, blending: THREE.AdditiveBlending, transparent: true }));
        const a = (i / n) * Math.PI * 2;
        sp.position.set(Math.cos(a) * 0.4, Math.sin(a * 2) * 0.12, Math.sin(a) * 0.65);
        orbit.add(sp);
      }
      add(orbit);
      // Extra spines and glowing side fins
      for (const sx of [-1, 1]) {
        const fin = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 4).rotateX(Math.PI / 2), glowMat(0.4));
        fin.scale.set(0.07, 1, 1);
        fin.position.set(sx * 0.15, 0.04, 0.05);
        fin.rotation.set(0.1, sx * 0.5, sx * 0.9);
        add(fin);
      }
      for (let i = 0; i < 4; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.22, 5), glowMat(0.6));
        sp.position.set(0, 0.26 - i * 0.015, -0.15 + i * 0.12);
        sp.rotation.x = -0.25;
        add(sp);
      }
      body.scale.set(0.34, 0.5, 1.15);
      group.scale.setScalar(1.35);
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
  const outer = new THREE.Group();
  outer.add(group);
  return { group: outer, body, tail, materials, orbit, pulse };
}

export function setFishOpacity(m: FishModel, a: number): void {
  for (const mat of m.materials) {
    (mat as THREE.MeshBasicMaterial).opacity = a * 0.75;
  }
}

export function animateFish(m: FishModel, t: number, speed: number, amp: number): void {
  m.tail.rotation.y = Math.sin(t * speed) * amp;
  if (m.wave) {
    const n = m.wave.length;
    m.wave.forEach((s, i) => {
      s.position.x = Math.sin(t * speed * 0.5 - i * 0.7) * amp * 0.16 * (0.25 + i / n);
    });
    m.flames?.forEach((f, i) => f.scale.set(1, 0.8 + 0.4 * Math.sin(t * 9 + i * 1.7), 1));
    m.flaps?.forEach((f, i) => (f.o.rotation.z += (Math.sin(t * 4 + i) * 0.015) * f.s));
    m.twinkle?.forEach((o, i) => o.scale.setScalar(0.7 + 0.5 * Math.abs(Math.sin(t * 3 + i * 1.3))));
    m.spin?.forEach((o, i) => (o.rotation.z = t * (0.9 + i * 0.5)));
    m.hue?.forEach((h) => h.m.color.setHSL((t * 0.12 + h.off) % 1, 0.9, 0.62));
  } else {
    (m.body ?? m.group.children[0]).rotation.y = Math.sin(t * speed + 0.6) * amp * 0.25;
  }
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

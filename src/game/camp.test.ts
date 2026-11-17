import * as THREE from 'three';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { FISH } from '../data/content';
import {
  KETTLE_COUNTER_Z, KETTLE_KEEPER, buildCrownPost, buildDerbyStand, buildFishMount, buildHearth, buildHedgeArc, buildHedgeRun,
  buildKettleStall, buildLanternPier, buildPicketRun, buildPlaque, buildRocketRack, buildSignpost, buildSkipSign, buildSteps,
  buildGatePier, buildStoneArc, buildStonePile, buildStoneRun, buildTotem, mountBoard, writeSkipSign,
} from './camp';

/** A canvas that draws nothing: the builders only need something to hold their text, so no DOM is needed. */
function fakeCanvas(): unknown {
  const canvas: Record<string, unknown> = { width: 0, height: 0 };
  const ctx: unknown = new Proxy({ canvas } as Record<string | symbol, unknown>, {
    get: (t, k) => (k in t ? t[k] : () => ctx),
    set: (t, k, v) => ((t[k] = v), true),
  });
  canvas.getContext = () => ctx;
  return canvas;
}

// Before any describe block builds a prop (textures and text planes draw on a canvas when they are made).
vi.stubGlobal('document', { createElement: fakeCanvas });
afterAll(() => {
  vi.unstubAllGlobals();
});

const meshes = (g: THREE.Object3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  g.updateMatrixWorld(true);
  g.traverse((o) => (o as THREE.Mesh).isMesh && out.push(o as THREE.Mesh));
  return out;
};
const box = (g: THREE.Object3D): THREE.Box3 => new THREE.Box3().setFromObject(g);
/** Where a mesh set stands: every mesh has a finite bounding box. */
const sane = (g: THREE.Object3D) => {
  const b = box(g);
  expect([b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].every(Number.isFinite)).toBe(true);
  return b;
};
const inside = (solids: [number, number, number][], b: THREE.Box3, slack = 0.6) => {
  for (const [x, z, r] of solids) {
    expect(r).toBeGreaterThan(0);
    expect(x).toBeGreaterThanOrEqual(b.min.x - slack);
    expect(x).toBeLessThanOrEqual(b.max.x + slack);
    expect(z).toBeGreaterThanOrEqual(b.min.z - slack);
    expect(z).toBeLessThanOrEqual(b.max.z + slack);
  }
};
/** Bearing round from +z toward +x, in degrees, of a point about the origin. */
const bearingOf = (x: number, z: number) => (Math.atan2(x, z) * 180) / Math.PI;

describe('the Great Fire', () => {
  const h = buildHearth();
  it('is a hearth 2.1 m across with flames up to about 1.9 m', () => {
    expect(meshes(h.group).length).toBeGreaterThan(10);
    const flames = new THREE.Box3();
    for (const f of h.flames) flames.union(new THREE.Box3().setFromObject(f));
    expect(flames.max.y).toBeGreaterThan(1.8);
    expect(flames.max.y).toBeLessThan(2.1);
    expect(h.flames.length).toBe(7);
    const stones = new THREE.Box3();
    for (const m of meshes(h.group)) {
      const mb = new THREE.Box3().setFromObject(m);
      if (Math.hypot((mb.min.x + mb.max.x) / 2, (mb.min.z + mb.max.z) / 2) < 1.2 && mb.max.y < 0.7 && !(m.material as THREE.Material & { emissive?: THREE.Color }).emissive?.getHex()) stones.union(mb);
    }
    expect(stones.max.x - stones.min.x).toBeGreaterThan(1.95);
    expect(stones.max.x - stones.min.x).toBeLessThan(2.4);
    expect(h.lamps.length).toBeGreaterThan(0);
    // The caller's light hangs in the middle of the flames, and it is the light that carries the night halo.
    expect(h.fireSpot.position.y).toBeCloseTo(1, 5);
    expect(h.fireSpot.userData.glow).toBeUndefined();
  });
  it('lets its leaning tongues spin about their own axes', () => {
    // The caller sets `rotation.y`: applied before the lean, it leaves where a tongue points unchanged.
    for (const f of h.flames) {
      const before = new THREE.Vector3(0, 1, 0).applyEuler(f.rotation);
      const spun = f.rotation.clone();
      spun.y = 1.3;
      expect(new THREE.Vector3(0, 1, 0).applyEuler(spun).distanceTo(before)).toBeLessThan(1e-6);
    }
  });
  it('blocks the fire and the tripod, which stand inside its footprint', () => {
    expect(h.solids.length).toBe(2);
    inside(h.solids, box(h.group));
  });
});

describe('the crown post', () => {
  it('stands as tall as asked, with a finial above', () => {
    const p = buildCrownPost(3.3);
    const b = sane(p.group);
    expect(b.min.y).toBeCloseTo(0, 2);
    expect(b.max.y).toBeGreaterThan(3.3);
    expect(b.max.y).toBeLessThan(3.6);
    expect(buildCrownPost().group).toBeTruthy();
    expect(buildCrownPost(2).group.children.length).toBeGreaterThan(2);
  });
});

describe("Bram's Kettle", () => {
  const s = buildKettleStall();
  const b = sane(s.group);
  it('is 3.2 m wide by about 2.2 m deep, with a counter, awning, sign and lamp', () => {
    expect(meshes(s.group).length).toBeGreaterThan(30);
    const shack = new THREE.Box3();
    for (const m of meshes(s.group)) {
      const mb = new THREE.Box3().setFromObject(m);
      if (mb.max.y - mb.min.y > 2.2 && mb.max.y < 2.5) shack.union(mb);
    }
    expect(shack.max.x - shack.min.x).toBeGreaterThan(3.1);
    expect(shack.max.x - shack.min.x).toBeLessThan(3.4);
    expect(shack.max.z - shack.min.z).toBeGreaterThan(2.1);
    expect(shack.max.z - shack.min.z).toBeLessThan(2.4);
    expect(s.lamps.length).toBe(1);
    expect(s.ctx).toBeTruthy();
    expect(s.tex).toBeTruthy();
  });
  it('hangs its awning above a standing player\'s eye, with the lantern under its front edge for the caller\'s light', () => {
    // The valance's scallops are the only half discs; the keeper's head is at about 1.75 m and an eye at 1.7 m.
    const scallops = meshes(s.group).filter((m) => (m.geometry as THREE.CircleGeometry).type === 'CircleGeometry');
    expect(scallops.length).toBe(10);
    for (const m of scallops) expect(new THREE.Box3().setFromObject(m).min.y).toBeGreaterThan(1.85);
    const lamp = s.lantern.getWorldPosition(new THREE.Vector3());
    expect(lamp.z).toBeGreaterThan(KETTLE_COUNTER_Z);
    expect(lamp.y).toBeGreaterThan(1.2);
    expect(lamp.y).toBeLessThan(1.8);
  });
  it('keeps its keeper behind the counter, inside the shack', () => {
    expect(s.keeper).toEqual(KETTLE_KEEPER);
    expect(s.keeper.z).toBeLessThan(KETTLE_COUNTER_Z - 1);
    expect(Math.abs(s.keeper.x)).toBeLessThan(1);
    expect(b.max.z).toBeGreaterThan(KETTLE_COUNTER_Z);
  });
  it('has solids within its footprint', () => {
    inside(s.solids, b);
  });
});

describe("the Legends' Totem", () => {
  const t = buildTotem();
  const b = sane(t.group);
  it('is about 3.4 m high with a silhouette about 1.4 m across at the fins and 1.7 m at the Kraken', () => {
    expect(b.min.y).toBeCloseTo(0, 2);
    expect(b.max.y).toBeGreaterThan(3.3);
    expect(b.max.y).toBeLessThan(3.5);
    expect(b.max.x - b.min.x).toBeGreaterThan(1.4);
    expect(b.max.x - b.min.x).toBeLessThan(2.0);
    inside(t.solids, b);
    expect(meshes(t.group).length).toBeLessThan(75);
  });
  it('stacks the lake legends, two sea legends and the Kraken, each its own paint', () => {
    const lake = FISH.filter((f) => f.tier === 5 && !f.sea);
    expect(lake.length).toBe(4);
    const bodies = meshes(t.group).filter((m) => {
      const mb = new THREE.Box3().setFromObject(m);
      return Math.abs(mb.max.x - mb.min.x) > 0.7 && Math.abs(mb.max.y - mb.min.y) > 0.3 && Math.abs(mb.max.y - mb.min.y) < 0.45 && mb.min.y > 0.4;
    });
    expect(bodies.length).toBe(6);
    const colours = new Set(bodies.map((m) => (m.material as THREE.MeshLambertMaterial).color.getHex()));
    expect(colours.size).toBe(6);
    // Tiers rise with a gap of bare pole between them.
    const ys = bodies.map((m) => new THREE.Box3().setFromObject(m)).sort((a, c) => a.min.y - c.min.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i].min.y - ys[i - 1].max.y).toBeGreaterThan(0.03);
  });
});

describe('hedges', () => {
  it('lay blocks round an arc that cover the bearings asked for', () => {
    const h = buildHedgeArc(4, 30, 150, 1.4, 0.7);
    const ms = meshes(h.group);
    expect(ms.length).toBeGreaterThan(6);
    const degs = ms.map((m) => bearingOf(m.position.x, m.position.z));
    expect(Math.min(...degs)).toBeGreaterThan(30);
    expect(Math.min(...degs)).toBeLessThan(40);
    expect(Math.max(...degs)).toBeLessThan(150);
    expect(Math.max(...degs)).toBeGreaterThan(140);
    for (const m of ms) expect(Math.hypot(m.position.x, m.position.z)).toBeCloseTo(4, 3);
    for (const [x, z] of h.solids) expect(Math.hypot(x, z)).toBeCloseTo(4, 3);
  });
  it('are the same every time, with small differences between blocks', () => {
    const a = buildHedgeArc(3, 0, 90, 1.2);
    const c = buildHedgeArc(3, 0, 90, 1.2);
    const sizes = (g: THREE.Group) => meshes(g).map((m) => +new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()).y.toFixed(4));
    expect(sizes(a.group)).toEqual(sizes(c.group));
    expect(new Set(sizes(a.group)).size).toBeGreaterThan(1);
  });
  it('sit on the terrain they are given', () => {
    const ground = (x: number) => 0.2 * x;
    const h = buildHedgeRun([[0, 0], [10, 0]], 1.2, 0.7, ground);
    for (const m of meshes(h.group)) {
      const mb = new THREE.Box3().setFromObject(m);
      const lowest = Math.min(ground(mb.min.x), ground(mb.max.x));
      expect(mb.min.y).toBeLessThanOrEqual(lowest + 0.001);
      expect(mb.min.y).toBeGreaterThan(lowest - 0.3);
    }
  });
  it('run along every point asked for', () => {
    const pts: [number, number][] = [[0, 0], [5, 0], [5, 6]];
    const h = buildHedgeRun(pts, 1.2);
    const bb = box(h.group);
    expect(bb.min.x).toBeLessThan(0.5);
    expect(bb.max.x).toBeGreaterThan(5);
    expect(bb.max.z).toBeGreaterThan(5.5);
    inside(h.solids, bb, 0.5);
    expect(h.solids.some(([x, z]) => Math.hypot(x - 5, z - 6) < 0.8)).toBe(true);
  });
});

describe('the picket fence', () => {
  it("uses the town's pickets and rails along a polyline, a picket about every 0.8 m", () => {
    const f = buildPicketRun([[0, 0], [8, 0]]);
    const ms = meshes(f.group);
    const pickets = ms.filter((m) => Math.abs(new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()).y - 0.8) < 0.01);
    const rails = ms.length - pickets.length;
    expect(pickets.length).toBe(11);
    expect(rails).toBe(2);
    const bb = box(f.group);
    expect(bb.min.x).toBeLessThan(0.1);
    expect(bb.max.x).toBeGreaterThan(7.9);
    expect(bb.min.y).toBeCloseTo(0, 2);
    inside(f.solids, bb, 0.4);
  });
  it('does not double the picket where two runs meet, and follows the ground', () => {
    const f = buildPicketRun([[0, 0], [4, 0], [4, 4]], (x, z) => 0.1 * (x + z));
    const ps = meshes(f.group).filter((m) => Math.abs(new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()).y - 0.8) < 0.05 && m.position.y > 0.3);
    const keys = ps.map((m) => `${m.position.x.toFixed(2)},${m.position.z.toFixed(2)}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const m of ps) expect(m.position.y).toBeCloseTo(0.1 * (m.position.x + m.position.z) + 0.4, 3);
  });
});

describe('the stone wall', () => {
  it('runs along an arc at its radius, to the height asked, over the bearings asked', () => {
    const w = buildStoneArc(5, -40, 60, 1.1, 0.6);
    const bb = sane(w.group);
    expect(bb.max.y).toBeGreaterThan(1.1);
    expect(bb.max.y).toBeLessThan(1.3);
    expect(bb.min.y).toBeLessThan(0);
    const degs = w.solids.map(([x, z]) => bearingOf(x, z));
    expect(Math.min(...degs)).toBeCloseTo(-40, 0);
    expect(Math.max(...degs)).toBeCloseTo(60, 0);
    for (const [x, z] of w.solids) expect(Math.hypot(x, z)).toBeCloseTo(5, 3);
    // Every metre of it has a collider close by.
    for (let d = -40; d <= 60; d += 3) {
      const [x, z] = [5 * Math.sin((d * Math.PI) / 180), 5 * Math.cos((d * Math.PI) / 180)];
      expect(w.solids.some(([sx, sz, r]) => Math.hypot(sx - x, sz - z) < r + 0.3)).toBe(true);
    }
  });
  it('steps with the ground it stands on', () => {
    const w = buildStoneArc(4, 0, 90, 0.8, 0.5, (x) => 0.3 * x);
    const bb = box(w.group);
    expect(bb.max.y).toBeGreaterThan(0.8 + 0.3 * 4 - 0.5);
  });
  it('ends on a gate pier: a square shaft as tall as asked, under a capstone a little wider than it', () => {
    const p = buildGatePier(0.75, 2);
    const bb = sane(p.group);
    expect(bb.max.y).toBeCloseTo(2, 2);
    expect(bb.min.y).toBeLessThan(-0.2);
    // The capstone is the widest part and the only pale one; the shaft is 0.75 m square.
    expect(bb.max.x - bb.min.x).toBeCloseTo(0.91, 2);
    const cap = meshes(p.group).filter((m) => !(m.material as THREE.MeshLambertMaterial).map);
    expect(cap).toHaveLength(1);
    expect(new THREE.Box3().setFromObject(cap[0]).min.y).toBeGreaterThan(1.9);
    expect(p.solids).toEqual([[0, 0, 0.455]]);
  });
  it('runs straight from point to point as well, solid along its length', () => {
    const w = buildStoneRun([[0, 0], [3, 0], [3, 2]], 0.7, 0.35, () => 0.45);
    const bb = sane(w.group);
    expect(bb.max.y).toBeGreaterThan(0.45 + 0.7);
    expect(bb.max.y).toBeLessThan(0.45 + 0.7 + 0.1);
    expect(bb.min.y).toBeCloseTo(0.45 - 0.25, 2);
    expect(bb.max.x).toBeGreaterThan(3);
    expect(bb.max.z).toBeGreaterThan(2);
    for (const [x, z] of [[0.2, 0], [1.5, 0], [2.9, 0], [3, 1], [3, 1.9]]) expect(w.solids.some(([sx, sz, r]) => Math.hypot(sx - x, sz - z) < r + 0.2)).toBe(true);
  });
});

describe('steps', () => {
  it('put the top tread at y = 0 and go down toward +z', () => {
    const s = buildSteps(2, 0.2, 5);
    const ms = meshes(s.group);
    expect(ms.length).toBe(5);
    const tops = ms.map((m) => new THREE.Box3().setFromObject(m).max.y).sort((a, b) => b - a);
    expect(tops[0]).toBeCloseTo(0, 3);
    expect(tops[4]).toBeCloseTo(-0.8, 3);
    const first = ms.map((m) => m.position.z).sort((a, b) => a - b);
    expect(first[0]).toBeCloseTo(0, 3);
    expect(first[4]).toBeGreaterThan(1.5);
    const bb = box(s.group);
    expect(bb.max.x - bb.min.x).toBeCloseTo(2, 3);
    expect(s.length).toBeCloseTo(5 * 0.42, 3);
  });
});

describe('the small props', () => {
  it('has a stone pile with loose stones beside it', () => {
    const p = buildStonePile();
    expect(meshes(p.group).length).toBeGreaterThanOrEqual(12);
    const bb = sane(p.group);
    expect(bb.max.y).toBeLessThan(0.5);
    expect(bb.min.y).toBeGreaterThanOrEqual(-0.001);
    inside(p.solids, bb);
  });
  it('has a skip sign with a canvas the caller writes on', () => {
    const s = buildSkipSign();
    expect(s.ctx).toBeTruthy();
    expect(s.tex).toBeInstanceOf(THREE.CanvasTexture);
    inside(s.solids, sane(s.group));
    const version = s.tex.version;
    writeSkipSign(s.ctx, s.tex, 'today: 7 skips');
    expect(s.tex.version).toBeGreaterThan(version);
  });
  it('has a rocket rack with three rockets and a crate', () => {
    const r = buildRocketRack();
    const bb = sane(r.group);
    expect(meshes(r.group).length).toBeGreaterThan(20);
    expect(bb.min.y).toBeGreaterThanOrEqual(-0.02);
    inside(r.solids, bb);
  });
  it('has a signpost with a finger for each entry', () => {
    const s = buildSignpost(['Fire', 'Stones', 'Rockets']);
    expect(s.yaws.length).toBe(3);
    expect(new Set(s.yaws).size).toBe(3);
    const bb = sane(s.group);
    expect(bb.max.y).toBeGreaterThan(2.2);
    expect(bb.max.x - bb.min.x).toBeGreaterThan(1.5);
    const one = buildSignpost(['Only']);
    expect(meshes(one.group).length).toBeLessThan(meshes(s.group).length);
    expect(buildSignpost([]).group.children.length).toBeGreaterThan(0);
  });
  it('has a signpost whose fingers can all point right, swung as asked, on a post tall enough to walk under', () => {
    const s = buildSignpost(['Fire', 'Stones', 'Rockets'], [0.12, 0.3, 0.5], 3);
    expect(s.yaws).toEqual([0.12, 0.3, 0.5]);
    const bb = sane(s.group);
    expect(bb.max.y).toBeGreaterThan(3);
    // Nothing reaches left of the post, and the lowest finger clears a player's head (1.8 m).
    expect(bb.min.x).toBeGreaterThan(-0.2);
    expect(bb.max.x).toBeGreaterThan(1);
    const fingers = s.group.children.filter((c) => (c as THREE.Group).isGroup);
    expect(fingers.length).toBe(3);
    for (const f of fingers) expect(new THREE.Box3().setFromObject(f).min.y).toBeGreaterThan(1.9);
  });
  it('has a plaque of the width asked with a canvas face', () => {
    const p = buildPlaque(1.5);
    expect(p.width).toBe(1.5);
    const bb = sane(p.group);
    expect(bb.max.x - bb.min.x).toBeGreaterThan(1.5);
    expect(bb.max.x - bb.min.x).toBeLessThan(1.8);
    expect(p.ctx).toBeTruthy();
    expect(buildPlaque().width).toBe(1.2);
  });
  it("has a fish mount that stands on the roof and holds the fish at its anchor", () => {
    const m = buildFishMount();
    const bb = sane(m.group);
    expect(bb.min.y).toBeCloseTo(0, 3);
    expect(m.anchor.parent).toBe(m.group);
    expect(m.anchor.position.y).toBeGreaterThan(0.3);
    expect(m.anchor.position.y).toBeLessThan(bb.max.y);
    // Its backboard has a pale face in a dark frame, at any size, and a board of another size matches it.
    const pale = (g: THREE.Object3D) => meshes(g).filter((k) => (k.material as THREE.MeshLambertMaterial).color.getHex() === 0xc9ad7a);
    expect(pale(m.group)).toHaveLength(1);
    const big = buildFishMount(1.6, 0.95);
    expect(new THREE.Box3().setFromObject(pale(big.group)[0]).getSize(new THREE.Vector3()).x).toBeCloseTo(1.48, 2);
    expect(big.feet).toEqual([-0.65, 0.65]);
    expect(pale(mountBoard(1.6, 1.3))).toHaveLength(1);
  });
  it('has a derby stand the size of the Thank You board', () => {
    const d = buildDerbyStand();
    const bb = sane(d.group);
    expect(bb.max.x - bb.min.x).toBeGreaterThan(1.8);
    expect(bb.max.x - bb.min.x).toBeLessThan(2.0);
    expect(bb.max.y).toBeGreaterThan(2.3);
    expect(bb.max.y).toBeLessThan(2.6);
    expect(d.solids.length).toBe(2);
    inside(d.solids, bb);
    expect(d.tex).toBeInstanceOf(THREE.CanvasTexture);
  });
  it('has a lantern pier no taller than 0.6 m under its lantern, which glows', () => {
    const p = buildLanternPier();
    const pier = new THREE.Box3();
    for (const m of meshes(p.group)) {
      if ((m.material as THREE.MeshLambertMaterial).map) pier.union(new THREE.Box3().setFromObject(m));
    }
    expect(pier.max.y).toBeLessThanOrEqual(0.6);
    expect(pier.max.y).toBeGreaterThan(0.4);
    expect(p.lamps.length).toBe(1);
    expect(p.lamps[0].emissiveIntensity).toBeGreaterThan(0);
    expect(meshes(p.group).some((m) => m.userData.glow)).toBe(true);
    inside(p.solids, sane(p.group));
    // Asked to, it stands the lantern at the front of the cap, which leaves the back clear for a post.
    const front = buildLanternPier(0.17);
    const glass = meshes(front.group).find((m) => m.userData.glow)!;
    expect(new THREE.Box3().setFromObject(glass).min.z).toBeGreaterThan(0);
    expect(new THREE.Box3().setFromObject(glass).max.z).toBeLessThan(0.38);
  });
});

describe('every builder', () => {
  it('shares geometry and materials so the map can bake it: few meshes', () => {
    expect(meshes(buildTotem().group).length).toBeLessThan(110);
    expect(meshes(buildKettleStall().group).length).toBeLessThan(120);
    expect(meshes(buildHearth().group).length).toBeLessThan(60);
  });
});

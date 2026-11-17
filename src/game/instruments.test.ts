import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { INSTRUMENTS } from '../data/band';
import { LOG } from '../data/maps';
import { INSTRUMENT_BUILDERS, SQUEEZEBOX, buildInstrument, restInstrument, squeeze, squeezeboxWidth } from './instruments';

const meshes = (g: THREE.Object3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  g.updateMatrixWorld(true);
  g.traverse((o) => void ((o as THREE.Mesh).isMesh && out.push(o as THREE.Mesh)));
  return out;
};
/** Every vertex of a model, in the model's own frame. */
const points = (g: THREE.Object3D): THREE.Vector3[] =>
  meshes(g).flatMap((m) => {
    const pos = m.geometry.getAttribute('position');
    return Array.from({ length: pos.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
  });

describe("the campfire band's instruments", () => {
  it('has a builder for each of the six, in the band\'s order', () => {
    expect(Object.keys(INSTRUMENT_BUILDERS)).toEqual(INSTRUMENTS.map((i) => i.id));
  });

  it('builds each as a small model that would sit in two hands, about its own middle', () => {
    for (const { id } of INSTRUMENTS) {
      const inst = buildInstrument(id);
      expect(inst.id).toBe(id);
      const ms = meshes(inst.group);
      expect(ms.length, id).toBeGreaterThan(0);
      const size = new THREE.Box3().setFromObject(inst.group).getSize(new THREE.Vector3());
      const dims = [size.x, size.y, size.z].sort((a, b) => a - b);
      // Nothing thinner than a whistle, nothing longer than a banjo; and none is a flat card or a speck.
      expect(dims[0], id).toBeGreaterThan(0.03);
      expect(dims[2], id).toBeGreaterThan(0.25);
      expect(dims[2], id).toBeLessThan(1.05);
      for (const p of points(inst.group)) expect(p.length(), id).toBeLessThan(1);
      for (const m of ms) expect(m.geometry.getAttribute('position').count, id).toBeGreaterThan(20);
    }
  });

  it('keeps them cheap: one draw each (three for the squeezebox), one material and one geometry for every copy', () => {
    const mats = new Set<THREE.Material>();
    let triangles = 0;
    for (const { id } of INSTRUMENTS) {
      const [a, b] = [buildInstrument(id), buildInstrument(id)];
      const [ma, mb] = [meshes(a.group), meshes(b.group)];
      expect(ma.length, id).toBe(id === 'squeezebox' ? 3 : 1);
      ma.forEach((m, i) => {
        mats.add(m.material as THREE.Material);
        // A second copy is new objects round the same geometry.
        expect(mb[i]).not.toBe(m);
        expect(mb[i].geometry).toBe(m.geometry);
        expect(m.geometry.getAttribute('color')).toBeTruthy();
        expect(m.geometry.getAttribute('normal')).toBeTruthy();
        triangles += m.geometry.getAttribute('position').count / 3;
      });
    }
    expect(mats.size).toBe(1);
    expect((([...mats][0]) as THREE.MeshLambertMaterial).vertexColors).toBe(true);
    // All six together are a few thousand triangles: less than one of the camp's bigger props.
    expect(triangles).toBeLessThan(4500);
  });

  it('stretches the squeezebox: its ends move apart with its bellows', () => {
    const sq = buildInstrument('squeezebox');
    const width = () => new THREE.Box3().setFromObject(sq.group).getSize(new THREE.Vector3()).x;
    squeeze(sq, 0);
    const shut = width();
    squeeze(sq, 1);
    const open = width();
    expect(open - shut).toBeCloseTo(SQUEEZEBOX.open - SQUEEZEBOX.shut, 2);
    // The ends sit right on the bellows at any stretch, and the hands' measure of it agrees.
    for (const k of [0, 0.4, 1]) {
      squeeze(sq, k);
      expect(sq.ends![1].position.x - sq.ends![0].position.x).toBeCloseTo(sq.bellows!.scale.x + SQUEEZEBOX.end, 6);
      expect(width()).toBeGreaterThan(squeezeboxWidth(k) - 0.01);
      expect(width()).toBeLessThan(squeezeboxWidth(k) + 0.06);
    }
    // Out of range is held at the ends.
    squeeze(sq, 5);
    expect(sq.bellows!.scale.x).toBeCloseTo(SQUEEZEBOX.open, 6);
  });

  describe('standing by a log', () => {
    const top = LOG.rest + LOG.thick;
    /** Inside the log, which lies along -x from the stand's origin: how deep a point is under its bark (0 outside). */
    const inLog = (p: THREE.Vector3) => (p.x < 0 ? Math.max(0, Math.min(-p.x, LOG.thick - Math.hypot(p.y - LOG.rest, p.z))) : 0);

    it('rests each on the cobbles or the log, never under the ground or through the log', () => {
      for (const { id } of INSTRUMENTS) {
        for (const end of [1, -1] as const) {
          const stand = restInstrument(id, end).group;
          const pts = points(stand);
          const low = Math.min(...pts.map((p) => p.y));
          if (id === 'whistle') {
            // Stuck in the top of the log's end, its collar on the bark.
            expect(low, id).toBeGreaterThan(top - 0.05);
            for (const p of pts) expect(p.x, id).toBeLessThan(0.05);
          } else {
            expect(low, id).toBeGreaterThan(-0.012);
            expect(low, id).toBeLessThan(0.03);
            // A leaning one touches the log's end; none is sunk into it.
            for (const p of pts) expect(inLog(p), id).toBeLessThan(0.02);
          }
          // Small and close: within an arm of the log's end, no taller than a seated player's shoulder.
          for (const p of pts) {
            expect(p.y, id).toBeLessThan(1.05);
            expect(Math.abs(p.z), id).toBeLessThan(0.3);
            expect(p.x, id).toBeLessThan(0.5);
            expect(p.x, id).toBeGreaterThan(-0.2);
          }
        }
      }
    });

    it('leans the banjo, the drum and the washboard on the log\'s end', () => {
      for (const id of ['banjo', 'drum', 'washboard'] as const) {
        const pts = points(restInstrument(id).group);
        // Something of it is within a finger of the end's face or its top edge.
        expect(Math.min(...pts.map((p) => Math.hypot(Math.max(0, p.x), Math.max(0, p.y - top)))), id).toBeLessThan(0.03);
        // And it stands taller than the log, so it shows over it from the far side.
        expect(Math.max(...pts.map((p) => p.y)), id).toBeGreaterThan(id === 'drum' ? 0.3 : top + 0.1);
      }
    });

    it('carries no light and nothing to walk into', () => {
      for (const { id } of INSTRUMENTS) {
        const made = restInstrument(id) as unknown as Record<string, unknown>;
        expect(made.solids).toBeUndefined();
        expect(made.lamps).toBeUndefined();
        let lights = 0;
        (made.group as THREE.Object3D).traverse((o) => void ((o as THREE.Light).isLight && lights++));
        expect(lights).toBe(0);
      }
    });
  });
});

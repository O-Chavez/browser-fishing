import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MAPS } from '../data/maps';
import { TERRAIN, groundHeight, setAprons, setIslet, setLevels, setPad, terrainGrid, terrainHeight } from './env';
import { BED_DEEP, BED_HALF, BED_N, BED_RANGE, bakeBed } from './lakebed';
import { BED_DEFINES, UNDERWATER, setDry, setLake, setUnderwaterLite, underwaterShader } from './underwater';

const pond = MAPS.find((m) => m.id === 'pond')!;
setPad(pond.pad);
setAprons(pond.aprons ?? []);
setLevels(pond.levels ?? []);
setIslet(pond.islet ?? null);

const grid = terrainGrid();
const heights = Float32Array.from({ length: grid.points.length / 2 }, (_, k) => groundHeight(grid.points[k * 2], grid.points[k * 2 + 1]));

/** Whether (x, z) lies on one of the grid's triangles, seen from above. */
function covered(x: number, z: number): boolean {
  const p = grid.points;
  for (let t = 0; t < grid.index.length; t += 3) {
    const [a, b, c] = [grid.index[t], grid.index[t + 1], grid.index[t + 2]];
    if (Math.hypot(p[a * 2], p[a * 2 + 1]) > 4) continue;
    const cross = (i: number, j: number) => (p[j * 2] - p[i * 2]) * (z - p[i * 2 + 1]) - (p[j * 2 + 1] - p[i * 2 + 1]) * (x - p[i * 2]);
    const s = [cross(a, b), cross(b, c), cross(c, a)];
    if (s.every((v) => v >= -1e-9) || s.every((v) => v <= 1e-9)) return true;
  }
  return false;
}

describe("the lake's bed", () => {
  it('has no hole at the lake\'s middle, under the pier, where the deep disc used to show through', () => {
    for (let x = -1.5; x <= 1.5; x += 0.25) for (let z = -1.5; z <= 1.5; z += 0.25) expect(covered(x, z), `${x}, ${z}`).toBe(true);
    // The fan meets the first ring without a step, and its middle is the ground's height there.
    expect(terrainHeight(0, 0)).toBeCloseTo(groundHeight(0, 0), 5);
    for (let a = 0; a < Math.PI * 2; a += 0.7) {
      const r = TERRAIN.radius(0);
      expect(terrainHeight(Math.sin(a) * (r - 1e-4), Math.cos(a) * (r - 1e-4))).toBeCloseTo(terrainHeight(Math.sin(a) * (r + 1e-4), Math.cos(a) * (r + 1e-4)), 2);
    }
  });

  it('faces every triangle of the terrain up, the fan included', () => {
    const p = grid.points;
    for (let t = 0; t < grid.index.length; t += 3) {
      const [a, b, c] = [grid.index[t], grid.index[t + 1], grid.index[t + 2]];
      // The y of (b - a) x (c - a): up, so the ground's front faces the sky and its normals point up.
      const up = (p[c * 2] - p[a * 2]) * (p[b * 2 + 1] - p[a * 2 + 1]) - (p[b * 2] - p[a * 2]) * (p[c * 2 + 1] - p[a * 2 + 1]);
      expect(up).toBeGreaterThan(0);
    }
  });

  it('bakes the height the terrain mesh draws, finely near the waterline and clamped beyond it', () => {
    const data = bakeBed(grid.points, heights, grid.index);
    const [low, high] = BED_RANGE;
    const step = (high - low) / 255;
    let near = 0;
    let off = 0;
    for (let j = 0; j < BED_N; j += 7) {
      for (let i = 0; i < BED_N; i += 7) {
        const x = ((i + 0.5) / BED_N - 0.5) * 2 * BED_HALF;
        const z = ((j + 0.5) / BED_N - 0.5) * 2 * BED_HALF;
        const drawn = terrainHeight(x, z);
        const baked = low + (data[(j * BED_N + i) * 2] / 255) * (high - low);
        const deep = BED_DEEP[0] + (data[(j * BED_N + i) * 2 + 1] / 255) * (BED_DEEP[1] - BED_DEEP[0]);
        expect(Math.abs(deep - Math.min(BED_DEEP[1], Math.max(BED_DEEP[0], drawn)))).toBeLessThan((BED_DEEP[1] - BED_DEEP[0]) / 255);
        expect(Math.abs(baked - Math.min(high, Math.max(low, drawn))), `${x.toFixed(1)}, ${z.toFixed(1)}`).toBeLessThan(step);
        // Near the lake's waterline it is the ground's own height, give or take the mesh's flat triangles.
        if (drawn > -0.5 && drawn < 0.3 && Math.hypot(x, z) < 58) {
          near++;
          off += Math.abs(baked - groundHeight(x, z));
          expect(Math.abs(baked - groundHeight(x, z)), `${x.toFixed(1)}, ${z.toFixed(1)}`).toBeLessThan(0.25);
        }
      }
    }
    expect(near).toBeGreaterThan(100);
    expect(off / near).toBeLessThan(0.03);
  });
});

describe('what lies under the water', () => {
  const lambert = (defines: Record<string, string> = {}) => {
    const lib = THREE.ShaderLib.lambert;
    return { shaderID: 'lambert', defines, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
  };

  it('leaves every program as three has it away from the lake (the sea, the casino)', () => {
    setLake(false);
    const sh = lambert({ ...BED_DEFINES });
    underwaterShader(sh);
    expect(sh.fragmentShader).toBe(THREE.ShaderLib.lambert.fragmentShader);
    expect(sh.vertexShader).toBe(THREE.ShaderLib.lambert.vertexShader);
  });

  it("reaches every built-in material's shader on the lake, at every point it hooks into", () => {
    setLake(true);
    const lit = ['lambert', 'phong', 'physical', 'toon'];
    // ShaderLib's names, and three's shaderID for each; the ones that keep the view position rebuild the world from it.
    for (const [id, shaderID] of [['basic', 'basic'], ['lambert', 'lambert'], ['phong', 'phong'], ['physical', 'physical'], ['toon', 'toon'], ['matcap', 'matcap'], ['points', 'points']]) {
      const lib = THREE.ShaderLib[id];
      const sh = { shaderID, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
      underwaterShader(sh);
      const rebuilt = ['lambert', 'phong', 'physical', 'toon', 'matcap'].includes(shaderID);
      expect(sh.vertexShader.includes('vLakeW = (modelMatrix * lakeP).xyz;'), id).toBe(!rebuilt);
      expect(sh.fragmentShader.includes('vLakeW = vec3(dot(viewMatrix[0].xyz, -vViewPosition)'), id).toBe(rebuilt);
      expect(sh.fragmentShader, id).toContain('float lakeD = lakeDepth();');
      expect(sh.fragmentShader, id).toContain('float lakeDepth(){');
      expect(sh.fragmentShader, id).toContain('outgoingLight = lakeAbsorb(outgoingLight, lakeD);');
      expect(sh.fragmentShader.includes('lakeNet(lakeP'), id).toBe(lit.includes(id));
      expect(sh.uniforms.uLake, id).toBe(UNDERWATER.uLake);
    }
    setLake(false);
  });

  it('in lite graphics leaves every material alone, the bed too (the surface veils what is under it)', () => {
    setLake(true);
    setUnderwaterLite(true);
    const post = lambert();
    const bed = lambert({ ...BED_DEFINES });
    underwaterShader(post);
    underwaterShader(bed);
    setUnderwaterLite(false);
    setLake(false);
    expect(post.fragmentShader).toBe(THREE.ShaderLib.lambert.fragmentShader);
    expect(bed.fragmentShader).toBe(THREE.ShaderLib.lambert.fragmentShader);
  });

  it("keeps an open hull's inside dry: its footprint at the waterline maps to the unit disc", () => {
    const hull = { x: -10.3, z: 6.2, facing: 0.2, half: [0.64, 1.8] as [number, number] };
    setDry([hull]);
    const u = UNDERWATER.uLake.value;
    // Hull i's two rows sit in slots 5 + 2i and 6 + 2i (`LAKE_U_GLSL`).
    const disc = (x: number, z: number, i = 0) => {
      const r = (k: number) => u[k * 4] * x + u[k * 4 + 1] * z + u[k * 4 + 2];
      return Math.hypot(r(5 + i * 2), r(6 + i * 2));
    };
    expect(disc(hull.x, hull.z)).toBeCloseTo(0, 5);
    // Along its length (local +z, turned by `facing`) and across it (local +x).
    expect(disc(hull.x + Math.sin(hull.facing) * 1.8, hull.z + Math.cos(hull.facing) * 1.8)).toBeCloseTo(1, 5);
    expect(disc(hull.x + Math.cos(hull.facing) * 0.64, hull.z - Math.sin(hull.facing) * 0.64)).toBeCloseTo(1, 5);
    // A step off its side is wet.
    expect(disc(hull.x + 1, hull.z)).toBeGreaterThan(1);
    setDry([]);
  });
});

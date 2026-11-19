import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { seaHeight, seaMood } from '../data/sea';
import { setWaves, waveSurface, waveUniforms } from './seawaves';

describe('the drawn waves', () => {
  it('lift a point on the water by the same height as seaHeight, and lean it sideways', () => {
    const u = waveUniforms();
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (const depth of [8, 48, 76, 120]) {
      const mood = seaMood(depth);
      setWaves(u, mood);
      for (const t of [0, 37.5, 116]) {
        u.uTime.value = t;
        for (const [x, z] of [[0, -9], [14, 3], [-30, -60], [120, 40]]) {
          waveSurface(u, x, z, p, n);
          expect(p.y).toBeCloseTo(seaHeight(x, z, t, mood), 6);
          expect(n.length()).toBeCloseTo(1, 6);
          expect(n.y).toBeGreaterThan(0);
        }
      }
    }
  });

  it('adds up the chop and the long swell for the foam', () => {
    const u = waveUniforms();
    const sums = { chop: 0, swell: 0 };
    setWaves(u, seaMood(1), sums);
    expect(sums.swell).toBe(0);
    expect(sums.chop).toBeGreaterThan(0);
    setWaves(u, seaMood(76), sums);
    expect(sums.swell).toBeGreaterThan(1);
  });
});

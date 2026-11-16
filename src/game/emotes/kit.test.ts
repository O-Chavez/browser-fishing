import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { mulberry } from '../env';
import { clamp01, easeInCubic, easeInOutSine, easeOutBack, easeOutCubic, envelope, freeLook, hop, hump, keep, lerp, progress, seedOf, smoothstep } from './kit';

describe('look kit', () => {
  it('eases between 0 and 1', () => {
    for (const f of [easeInCubic, easeOutCubic, easeInOutSine, easeOutBack]) {
      expect(f(0)).toBeCloseTo(0);
      expect(f(1)).toBeCloseTo(1);
    }
    expect(easeOutBack(0.7)).toBeGreaterThan(1);
    expect([hump(0), hump(0.5), hump(1), hump(-1), hump(2)]).toEqual([0, 1, 0, 0, 0]);
    expect([clamp01(-2), clamp01(0.3), clamp01(9)]).toEqual([0, 0.3, 1]);
    expect(lerp(2, 4, 0.25)).toBe(2.5);
    expect([envelope(-1, 2), envelope(1, 2), envelope(2, 2)]).toEqual([0, 1, 0]);
    expect([hop(0, 0.5, 0.3), hop(0.25, 0.5, 0.3), hop(0.5, 0.5, 0.3), hop(-1, 0.5, 0.3)]).toEqual([0, 0.3, 0, 0]);
    expect([progress(2, 4, 1), progress(2, 4, 3), progress(2, 4, 7)]).toEqual([0, 0.5, 1]);
    expect([smoothstep(2, 4, 1), smoothstep(2, 4, 3), smoothstep(2, 4, 7)]).toEqual([0, 0.5, 1]);
  });

  it('seeds the same random for the same name, and another for another', () => {
    expect(seedOf('kelp-C')).toBe(seedOf('kelp-C'));
    expect(seedOf('kelp-C')).not.toBe(seedOf('twilight-B'));
    expect(mulberry(seedOf('kelp-C'))()).toBe(mulberry(seedOf('kelp-C'))());
  });

  it('frees geometries, textures and instanced buffers, leaving kept things and plain materials', () => {
    const freed: string[] = [];
    const watch = <T extends THREE.EventDispatcher<{ dispose: object }>>(x: T, name: string): T => {
      x.addEventListener('dispose', () => freed.push(name));
      return x;
    };
    const tex = watch(new THREE.Texture(), 'tex');
    const shared = watch(keep(new THREE.Texture()), 'shared texture');
    const mat = watch(new THREE.MeshBasicMaterial({ map: tex }), 'material');
    const geo = watch(new THREE.BoxGeometry(), 'geometry');
    const keptGeo = watch(keep(new THREE.BoxGeometry()), 'kept geometry');
    const inst = watch(new THREE.InstancedMesh(watch(new THREE.BoxGeometry(), 'instanced geometry'), watch(new THREE.MeshBasicMaterial({ map: shared }), 'material 2'), 4), 'instances');
    const own = watch(new THREE.ShaderMaterial(), 'own shader');
    const kept = watch(keep(new THREE.ShaderMaterial()), 'kept shader');
    const root = new THREE.Group();
    const inner = new THREE.Group();
    // The same geometry and material twice: freed once.
    inner.add(new THREE.Mesh(geo, mat), new THREE.Mesh(geo, mat), new THREE.Mesh(keptGeo, own), new THREE.Mesh(keptGeo, kept));
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
    // Every sprite draws with the same quad, the name tags' too: it stays.
    watch(sprite.geometry, 'shared sprite quad');
    root.add(inner, inst, sprite);
    const scene = new THREE.Scene();
    scene.add(root);
    freeLook(root);
    expect(freed.sort()).toEqual(['geometry', 'instanced geometry', 'instances', 'own shader', 'tex'].sort());
    expect(root.parent).toBeNull();
  });
});

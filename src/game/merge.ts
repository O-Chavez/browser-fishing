import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Bakes plain, static Lambert meshes under `root` into a few vertex-coloured meshes (one per
 * shadow flag combination), cutting draw calls and shadow-pass work. Then any other static
 * meshes that share one material instance (glowing bulbs, screens) are merged and keep that
 * material, so animating its colour still works. Anything under `keep`, and anything
 * transparent, is left untouched.
 */
const CELL = 14; // bucket size so far-away chunks can be frustum culled

export function mergeStatic(root: THREE.Object3D, keep: Iterable<THREE.Object3D>): void {
  const kept = new Set(keep);
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, { cast: boolean; recv: boolean; side: THREE.Side; geos: THREE.BufferGeometry[] }>();
  const doomed: THREE.Mesh[] = [];

  const isKept = (o: THREE.Object3D): boolean => {
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (kept.has(p)) return true;
    return false;
  };

  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m === root || isKept(m)) return;
    const mat = m.material as THREE.MeshLambertMaterial;
    if (!mat.isMeshLambertMaterial || mat.map || mat.transparent || mat.emissive.getHex() !== 0 || !m.visible) return;
    const wp = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
    const key = `${m.castShadow}|${m.receiveShadow}|${mat.side}|${Math.floor(wp.x / CELL)},${Math.floor(wp.z / CELL)}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { cast: m.castShadow, recv: m.receiveShadow, side: mat.side, geos: [] }));
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()) as THREE.BufferGeometry;
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) mat.color.toArray(colors, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    b.geos.push(g);
    doomed.push(m);
  });

  for (const m of doomed) {
    m.parent?.remove(m);
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
  }
  for (const b of buckets.values()) {
    const geo = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: b.side }));
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.recv;
    root.add(mesh);
  }
  mergeShared(root, isKept, inv);
}

function mergeShared(root: THREE.Object3D, isKept: (o: THREE.Object3D) => boolean, inv: THREE.Matrix4): void {
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; meshes: THREE.Mesh[] }>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m === root || (m as THREE.InstancedMesh).isInstancedMesh || isKept(m) || !m.visible) return;
    const mat = m.material as THREE.Material & { map?: THREE.Texture | null };
    if (Array.isArray(mat) || mat.transparent || (mat as THREE.ShaderMaterial).isShaderMaterial) return;
    const attrs = m.geometry.getAttribute('uv') && mat.map ? 'uv' : '';
    const wp = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
    const key = `${mat.uuid}|${m.castShadow}|${m.receiveShadow}|${attrs}|${Math.floor(wp.x / CELL)},${Math.floor(wp.z / CELL)}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat, cast: m.castShadow, recv: m.receiveShadow, meshes: [] }));
    b.meshes.push(m);
  });
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) continue;
    const geos = b.meshes.map((m) => {
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()) as THREE.BufferGeometry;
      const keepUv = !!(b.mat as { map?: unknown }).map;
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && !(keepUv && name === 'uv')) g.deleteAttribute(name);
      return g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    });
    const geo = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!geo) continue;
    for (const m of b.meshes) {
      m.parent?.remove(m);
      m.geometry.dispose();
    }
    const mesh = new THREE.Mesh(geo, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.recv;
    root.add(mesh);
  }
}

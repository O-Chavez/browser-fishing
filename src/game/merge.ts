import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Bakes plain, static Lambert meshes under `root` into a few vertex-coloured meshes (one per
 * shadow flag combination), cutting draw calls and shadow-pass work. Anything under `keep`,
 * and any mesh with a texture, transparency or emissive glow, is left untouched.
 */
const CELL = 14; // bucket size so far-away chunks can be frustum culled

export function mergeStatic(root: THREE.Object3D, keep: Iterable<THREE.Object3D>): void {
  const kept = new Set(keep);
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, { cast: boolean; recv: boolean; geos: THREE.BufferGeometry[] }>();
  const doomed: THREE.Mesh[] = [];

  const isKept = (o: THREE.Object3D): boolean => {
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (kept.has(p)) return true;
    return false;
  };

  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || isKept(m)) return;
    const mat = m.material as THREE.MeshLambertMaterial;
    if (!mat.isMeshLambertMaterial || mat.map || mat.transparent || mat.emissive.getHex() !== 0 || !m.visible) return;
    const wp = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
    const key = `${m.castShadow}|${m.receiveShadow}|${mat.side}|${Math.floor(wp.x / CELL)},${Math.floor(wp.z / CELL)}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { cast: m.castShadow, recv: m.receiveShadow, geos: [] }));
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
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.recv;
    root.add(mesh);
  }
}

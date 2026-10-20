import * as THREE from 'three';

/**
 * Frees the GPU copies of every geometry and texture under `root`; removing an object from the
 * scene alone leaves them allocated. Materials are left alone on purpose: disposing one releases
 * its compiled shader once nothing else uses it, so coming back to a map (or catching the next
 * fish) would freeze while it recompiles. Compiled shaders are a small fixed set, so keeping
 * them doesn't grow memory.
 */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if ((v as THREE.Texture | null)?.isTexture) (v as THREE.Texture).dispose();
    }
  });
}

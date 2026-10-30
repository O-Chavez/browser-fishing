import type * as THREE from 'three';

/**
 * Shows everything under `root` for a one-off draw, hidden objects too and nothing frustum-culled,
 * and returns a function that puts every object back as it was. Lights keep the visibility they
 * have now, with a hidden parent counting as hidden: the number of lights is part of every shader
 * program, so a draw with more of them would compile programs that are never used.
 */
export function revealAll(root: THREE.Object3D): () => void {
  const lit = new Set<THREE.Object3D>();
  root.traverseVisible((o) => {
    if ((o as THREE.Light).isLight) lit.add(o);
  });
  const saved: [THREE.Object3D, boolean, boolean][] = [];
  root.traverse((o) => {
    saved.push([o, o.visible, o.frustumCulled]);
    o.visible = (o as THREE.Light).isLight ? lit.has(o) : true;
    o.frustumCulled = false;
  });
  return () => {
    for (const [o, visible, culled] of saved) {
      o.visible = visible;
      o.frustumCulled = culled;
    }
  };
}

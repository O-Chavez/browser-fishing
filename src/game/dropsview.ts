import * as THREE from 'three';
import { BAITS, FISH, RODS, byId } from '../data/content';
import type { Drop } from './drops';
import { standHeight } from './env';
import { disposeTree } from './dispose';
import { buildFish } from './fishmodel';
import { buildRodModel, buildTin } from './itemmodels';


/** Items lying on the ground, with a soft glow and a light beam so other players can spot them from afar. */
export class DropsView {
  readonly group = new THREE.Group();
  private meshes = new Map<number, { obj: THREE.Object3D; drop: Drop }>();

  constructor(scene: THREE.Scene, private surface: (x: number, z: number) => number) {
    scene.add(this.group);
  }

  private build(d: Drop): THREE.Object3D {
    const g = new THREE.Group();
    const it = d.item;
    if (it.k === 'fish') {
      const f = buildFish(byId(FISH, it.fishId).color, false, it.shiny, byId(FISH, it.fishId).tier, it.fishId);
      f.group.scale.setScalar(0.45 + Math.min(1, it.size / 100) * 0.5);
      g.add(f.group);
    } else if (it.k === 'bait') {
      g.add(buildTin(it.id));
    } else {
      g.add(buildRodModel(it.id));
    }
    const glow = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.5, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffe9a3, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    glow.position.y = -0.12;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 6, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe9a3, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
    );
    beam.position.y = 2.85;
    g.add(glow, beam);
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    return g;
  }

  sync(list: Drop[], map: string): void {
    const ids = new Set(list.filter((d) => d.map === map).map((d) => d.id));
    for (const [id, m] of this.meshes) {
      if (ids.has(id)) continue;
      this.group.remove(m.obj);
      disposeTree(m.obj);
      this.meshes.delete(id);
    }
    for (const d of list) {
      if (d.map !== map || this.meshes.has(d.id)) continue;
      const obj = this.build(d);
      this.group.add(obj);
      this.meshes.set(d.id, { obj, drop: d });
    }
  }

  /** Items blink during their last 5 seconds. */
  update(t: number, now = Date.now()): void {
    for (const { obj, drop } of this.meshes.values()) {
      obj.position.set(drop.x, Math.max(standHeight(drop.x, drop.z), this.surface(drop.x, drop.z)) + 0.3 + Math.sin(t * 2 + drop.id) * 0.05, drop.z);
      obj.rotation.y = t * 0.6 + drop.id;
      obj.visible = drop.expires - now > 5000 || Math.floor(t * 4) % 2 === 0;
    }
  }
}

export const itemName = (it: Drop['item']): string =>
  it.k === 'fish' ? `${it.shiny ? '✨ Shiny ' : ''}${byId(FISH, it.fishId).name}` : it.k === 'bait' ? `${byId(BAITS, it.id).name} x${it.n}` : byId(RODS, it.id).name;

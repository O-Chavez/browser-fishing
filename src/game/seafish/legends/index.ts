// The sea's legends that are fish (the Shelf's, the Drop-off's, Kelp Deep's and the Twilight's): each has its own
// module that builds the whole model, body to tackle. `buildFish` hands every species to `buildLegend` first.
import * as THREE from 'three';
import { FISH_LOOK, type FishLook } from '../../../data/fishlook';
import { WATER_ORDER } from '../../env';
import type { FishModel } from '../../fishmodel';
import { chandelier } from './chandelier';
import { grouper } from './grouper';
import { kelpbeard } from './kelpbeard';
import { kelpwyrm } from './kelpwyrm';
import { marlin } from './marlin';
import { oarfish } from './oarfish';
import { legendSkin, type Legend } from './kit';

export type { Legend, LegendCtx, PaintCtx } from './kit';

export const LEGENDS: Record<string, Legend | undefined> = { grouper, marlin, kelpbeard, kelpwyrm, oarfish, chandelier };

const GOLD = new THREE.Color(0xffd23a);
const gold = (c: number, k = 0.55) => new THREE.Color(c).lerp(GOLD, k).getHex();

/** A legend's whole model (its body, fins, face, parts and lost tackle), or null for any other fish. */
export function buildLegend(id: string, shadow: boolean, shiny: boolean, glowTexture: () => THREE.Texture): FishModel | null {
  const legend = LEGENDS[id];
  if (!legend) return null;
  const look: FishLook = { ...FISH_LOOK[id], ...legend.look };
  const L: FishLook = shiny ? { ...look, back: gold(look.back), belly: gold(look.belly, 0.35), fin: gold(look.fin), accent: 0xffe27a } : look;
  const accent = new THREE.Color(L.accent ?? new THREE.Color(L.fin).lerp(new THREE.Color(0xffffff), 0.4).getHex());
  const group = new THREE.Group();
  const materials: THREE.Material[] = [];
  const pulse: THREE.Material[] = [];
  const twinkle: THREE.Object3D[] = [];
  const shadowMat = () => new THREE.MeshBasicMaterial({ color: shiny ? 0x9a7410 : 0x06141a, transparent: true, opacity: shiny ? 0.9 : 0.75, side: THREE.DoubleSide });
  const light = shadow ? 1 : (legend.light ?? 1);
  const bodyMat: THREE.Material = shadow
    ? shadowMat()
    : new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(light, light, light),
        map: legendSkin(legend, look, id, false, shiny),
        roughness: shiny ? 0.25 : 0.5,
        metalness: shiny ? 0.4 : 0,
        clearcoat: 0.5,
        clearcoatRoughness: 0.3,
        emissive: legend.glow ? 0xffffff : 0x000000,
        emissiveMap: legend.glow ? legendSkin(legend, look, id, true, shiny) : null,
        emissiveIntensity: 1,
      });
  materials.push(bodyMat);
  const finMat: THREE.Material = shadow ? shadowMat() : new THREE.MeshStandardMaterial({ color: new THREE.Color(L.fin).multiplyScalar(light), roughness: 0.48, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  materials.push(finMat);
  const body = new THREE.Mesh(legend.body(), bodyMat);
  body.castShadow = !shadow;
  group.add(body);
  // The tail's pivot hangs off the body, so the tail turns with it as it swims and wags on top.
  const tail = new THREE.Group();
  tail.position.z = 0.47;
  body.add(tail);
  legend.build({ root: body, tail, look, L, id, shiny, shadow, accent, bodyMat, finMat, body, pulse, twinkle, glowTexture, light });

  // A shiny's gold sparkles circle it, as on every shiny fish.
  let orbit: THREE.Group | undefined;
  if (shiny && !shadow) {
    orbit = new THREE.Group();
    const geo = new THREE.SphereGeometry(0.011, 8, 6);
    const m = new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    materials.push(m);
    for (let i = 0; i < 10; i++) {
      const sp = new THREE.Mesh(geo, m);
      const a = (i / 10) * Math.PI * 2;
      sp.position.set(Math.cos(a) * 0.26, Math.sin(a * 2) * 0.3, Math.sin(a) * 0.6);
      orbit.add(sp);
      twinkle.push(sp);
    }
    group.add(orbit);
  }

  // Additive glows don't write depth, so they draw after the water, as in `buildFish`.
  group.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (m && !Array.isArray(m) && m.blending === THREE.AdditiveBlending && !m.depthWrite) o.renderOrder = WATER_ORDER + 1;
  });
  const outer = new THREE.Group();
  outer.add(group);
  return { group: outer, body, tail, materials, orbit, pulse, twinkle };
}

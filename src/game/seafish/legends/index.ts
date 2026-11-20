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

/**
 * A shiny sea legend keeps its own look (Oscar, 2026-11-20: the gold wash "kind of cheapens them"): no gold, no
 * glossier finish, the same silhouette. Its only mark is the ring of small gold sparkles every shiny fish has, here and
 * on the Abyss's three (`buildFish`). A play-test default: false leaves a shiny legend looking exactly like a plain one.
 */
export const SHINY_LEGEND_SPARKLES = true;

/** A legend's whole model (its body, fins, face, parts and lost tackle), or null for any other fish. */
export function buildLegend(id: string, shadow: boolean, shiny: boolean, glowTexture: () => THREE.Texture): FishModel | null {
  const legend = LEGENDS[id];
  if (!legend) return null;
  const look: FishLook = { ...FISH_LOOK[id], ...legend.look };
  const accent = new THREE.Color(look.accent ?? new THREE.Color(look.fin).lerp(new THREE.Color(0xffffff), 0.4).getHex());
  const group = new THREE.Group();
  const materials: THREE.Material[] = [];
  const pulse: THREE.Material[] = [];
  const twinkle: THREE.Object3D[] = [];
  const shadowMat = () => new THREE.MeshBasicMaterial({ color: 0x06141a, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
  const light = shadow ? 1 : (legend.light ?? 1);
  const bodyMat: THREE.Material = shadow
    ? shadowMat()
    : new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(light, light, light),
        map: legendSkin(legend, look, id, false),
        roughness: 0.5,
        metalness: 0,
        clearcoat: 0.5,
        clearcoatRoughness: 0.3,
        emissive: legend.glow ? 0xffffff : 0x000000,
        emissiveMap: legend.glow ? legendSkin(legend, look, id, true) : null,
        emissiveIntensity: 1,
      });
  materials.push(bodyMat);
  const finMat: THREE.Material = shadow ? shadowMat() : new THREE.MeshStandardMaterial({ color: new THREE.Color(look.fin).multiplyScalar(light), roughness: 0.48, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  materials.push(finMat);
  const body = new THREE.Mesh(legend.body(), bodyMat);
  body.castShadow = !shadow;
  group.add(body);
  // The tail's pivot hangs off the body, so the tail turns with it as it swims and wags on top.
  const tail = new THREE.Group();
  tail.position.z = 0.47;
  body.add(tail);
  legend.build({ root: body, tail, look, id, shadow, accent, bodyMat, finMat, body, pulse, twinkle, glowTexture, light });

  // A shiny's gold sparkles circle it, as on every shiny fish: its only mark (`SHINY_LEGEND_SPARKLES`).
  let orbit: THREE.Group | undefined;
  if (shiny && !shadow && SHINY_LEGEND_SPARKLES) {
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

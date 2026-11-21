import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ABYSS, BOAT, CHINE, KEEL, KELP, SHELF_FAR, DEEP_LOOKS, abyssAt, boatMotion, hullHalfWidth, lightningAt, kelpAt, nightRamp, rainAt, seaHeight, sheetGlow, stormAt, type BoatMotion, type DeepLook } from '../data/sea';
import { AbyssLurk } from './abysslurk';
import { mulberry } from './env';
import { Jellies } from './jellies';
import { Gulls, MarkerBuoy, Rain } from './seaatmo';
import { setWaves, waveUniforms, WAVE_GLSL } from './seawaves';

/**
 * The open sea around the charter boat. The boat stays still at the origin and this whole frame (the
 * swell, the low cloud and the distant headland) moves the opposite way to the boat's ride, so the
 * deck, players and drops need nothing special while the horizon heaves and rolls at eye height.
 *
 * Roughness follows the depth's mood (`seaMood`): 0 is the pond's sky over a choppy sea, 0.6 the
 * Drop-off's low cloud, fog, whitecaps and spray.
 */

/** Shared with the world's sky and pond water: daylight sets these once for everything. */
export interface SkyUniforms {
  uSkyH: { value: THREE.Color };
  uSkyT: { value: THREE.Color };
  uSunCol: { value: THREE.Color };
  uSunDir: { value: THREE.Vector3 };
  uFogColor: { value: THREE.Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
  uSunVis: { value: number };
  uMoonDir: { value: THREE.Vector3 };
  uMoonCol: { value: THREE.Color };
  /** At sea: the hidden sun's glow (zero ashore). */
  uGlow: { value: THREE.Color };
  /** How far the Abyss's look is in (`abyssAt`); at 0 the shaders skip everything below. */
  uAbyss: { value: number };
  /** The Abyss's light in the sky (`ABYSS`): the band on the horizon (its colour; how tall and how broken)... */
  uBand: { value: THREE.Color };
  uBandShape: { value: THREE.Vector2 };
  /** ...a bolt's flash behind the cloud (the way to the bolt, its light now, and the share of it on the far side of the sky)... */
  uFlashDir: { value: THREE.Vector3 };
  uFlashCol: { value: THREE.Color };
  uFlashWide: { value: number };
  /** ...and sheet lightning inside the cloud (the way to it, its light on the cloud and on the sky, and how tight the patch is). */
  uSheetDir: { value: THREE.Vector3 };
  uSheetCol: { value: THREE.Color };
  uSheetSky: { value: number };
  uSheetSize: { value: number };
  /** Up in the sea's frame, which the horizon and its band heave with. */
  uSeaUp: { value: THREE.Vector3 };
}

/** The Abyss's uniforms at rest: not in, so every other sky is drawn as it always was. */
export const abyssSkyUniforms = () => ({
  uAbyss: { value: 0 },
  uBand: { value: new THREE.Color(0) },
  uBandShape: { value: new THREE.Vector2(0.1, 0) },
  uFlashDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() },
  uFlashCol: { value: new THREE.Color(0) },
  uFlashWide: { value: 0.2 },
  uSheetDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() },
  uSheetCol: { value: new THREE.Color(0) },
  uSheetSky: { value: 0.5 },
  uSheetSize: { value: 0.5 },
  uSeaUp: { value: new THREE.Vector3(0, 1, 0) },
});

/**
 * GLSL shared by the sky and the water that mirrors it: the Abyss's light along `d` (a unit direction, y up the sky).
 * `abyssBand` is the storm-light on the horizon, fading by `tall` up the sky, strongest out to sea (-z) and broken along
 * the horizon; `abyssFlash` is a bolt lighting the sky from behind, brightest toward the bolt, plus sheet lightning's patch.
 */
export const ABYSS_SKY_GLSL = `
uniform vec3 uBand, uFlashDir, uFlashCol, uSheetDir, uSheetCol; uniform vec2 uBandShape; uniform float uAbyss, uFlashWide, uSheetSky, uSheetSize;
vec3 abyssBand(vec3 d, float tall){
  vec2 a = d.xz / max(length(d.xz), 0.0001);
  float gap = 0.6 * (0.5 + 0.5 * a.y) + 0.4 * (0.5 + 0.5 * (a.x * (16.0 * a.x * a.x * a.x * a.x - 20.0 * a.x * a.x + 5.0)));
  return uBand * exp(-pow(max(d.y, 0.0) / tall, 1.5)) * (1.0 - uBandShape.y * gap);
}
vec3 abyssFlash(vec3 d){
  float f = max(dot(d, uFlashDir), 0.0);
  float s = max(dot(d, uSheetDir), 0.0);
  return uFlashCol * (uFlashWide + (1.0 - uFlashWide) * f * f * f) * mix(1.0, 0.5, max(d.y, 0.0))
    + uSheetCol * uSheetSky * pow(s, 2.0 + 14.0 * uSheetSize);
}`;

/**
 * The water's shaders. With `ABYSS` defined they carry the Abyss's own shading (`ABYSS` in data/sea.ts) as well; the sea
 * draws that build only where the Abyss's look is in, so the other zones run the shader they always did.
 */
const seaVert = `
${WAVE_GLSL}
varying vec3 vWorld; varying vec3 vN; varying float vHc; varying float vHs; varying float vAtt;
#ifdef ABYSS
uniform vec2 uWind;
varying float vRidge;
#endif
void main(){
  vec3 d, n; float hc, hs, att;
  seaWaves(position.xz, d, n, hc, hs, att);
  vec3 p = position + d;
  vHc = hc; vHs = hs; vAtt = att;
#ifdef ABYSS
  // The water's slope along the wind, in the sea's own frame: nothing at the top of a ridge, above it down its leading face.
  vRidge = dot(n.xz, uWind) / max(n.y, 0.05);
#endif
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  vN = mat3(modelMatrix) * n;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const seaFrag = `
uniform float uTime, uSunVis, uFoam, uAmpChop, uAmpSwell, uStorm, uFogNear, uFogFar, uLift, uBoatGlow, uFarMix, uHaze, uKelp, uKelpPatch;
uniform vec3 uKelpCol, uKelpCol2, uShallow, uDeep, uFar, uSkyH, uSkyT, uSunCol, uSunDir, uFogColor, uFoamCol, uMoonDir, uMoonCol, uGlow;
uniform vec2 uWind;
varying vec3 vWorld; varying vec3 vN; varying float vHc; varying float vHs; varying float vAtt;
#ifdef ABYSS
uniform vec3 uSeaUp, uCrestLit, uFaceLit, uRim, uPoolCol; uniform vec4 uFoamKeep, uLines; uniform vec2 uPool, uGlint; uniform float uPoolFoam, uPoolGlint, uHullFoam;
${ABYSS_SKY_GLSL}
varying float vRidge;
// How much of one kind of the storm's foam the Abyss keeps (uFoamKeep).
#define KEEP(k) * uFoamKeep.k
#else
#define KEEP(k)
#endif
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
void main(){
  // A hole in the hull's shape (hullHalfWidth, hullSheer and hullChine in data/sea.ts), up past the rails, so a
  // swell can't show through the deck and the water meets the planking instead of stopping short of it.
  float u = vWorld.x / ${BOAT.len.toFixed(1)} + 0.5;
  float uc = clamp(u, 0.0, 1.0);
  float hw = uc < 0.5 ? 0.92 + 0.08 * sin(uc * ${Math.PI.toFixed(5)}) : cos((uc - 0.5) * ${Math.PI.toFixed(5)}) * 0.97 + 0.03;
  float sheer = 1.0 + 0.5 * pow(uc, 2.5);
  float chine = ${CHINE.toFixed(2)} + (sheer - ${CHINE.toFixed(2)}) * 0.15 * uc * uc;
  float keel = ${KEEL.toFixed(2)} * (1.0 - 0.6 * uc * uc * uc);
  float hullW = ${BOAT.beam.toFixed(2)} * hw * (1.0 - 0.12 * clamp((sheer - vWorld.y) / (sheer - chine), 0.0, 1.0));
  hullW *= clamp((vWorld.y - keel) / (chine - keel), 0.0, 1.0) * 0.999 + 0.001;
  if (u > 0.0 && u < 1.0 && abs(vWorld.z) < hullW - 0.015 && vWorld.y < ${(BOAT.deck + 2.5).toFixed(2)}) discard;
  // How far this water is from the hull, for the foam along it and the lamps' glow on the water.
  float hd = length(vec2(max(abs(vWorld.z) - hullW, 0.0), max(abs(vWorld.x) - ${(BOAT.len / 2).toFixed(2)}, 0.0)));
  vec3 V = normalize(cameraPosition - vWorld);
  float dist = length(cameraPosition - vWorld);
  vec3 n = normalize(vN);
  vec2 g = 0.025 * (1.0 - smoothstep(8.0, 45.0, dist)) * vec2(sin(vWorld.x*2.7+uTime*1.9) + sin(vWorld.z*4.1-uTime*1.3), cos(vWorld.z*3.1+uTime*1.6) + cos(vWorld.x*5.3+uTime*1.1));
  n = normalize(n + vec3(-g.x, 0.0, -g.y));
  // How high up its own wave this point is (0 trough, 1 crest): for the chop and for the long swell.
  float crest = clamp(vHc / max(uAmpChop, 0.01) * 0.5 + 0.5, 0.0, 1.0);
  float swellCrest = clamp(vHs / max(uAmpSwell, 0.01) * 0.5 + 0.5, 0.0, 1.0);
  vec3 base = mix(uShallow, uDeep, smoothstep(4.0, 90.0, dist));
  // The Shelf's water deepens to blue toward the horizon.
  float farOut = uFarMix * smoothstep(10.0, 170.0, dist);
  base = mix(base, uFar, farOut);
  // Crests catch the light; uLift dims that at night.
  float lit = max(smoothstep(0.55, 1.0, crest), smoothstep(0.6, 1.0, swellCrest) * uStorm);
  base = mix(base, base * 1.3 + vec3(0.02, 0.06, 0.06) * uLift, lit * 0.6);
  vec3 R = reflect(-V, n);
  vec3 sky = mix(uSkyH, uSkyT, pow(clamp(R.y, 0.0, 1.0), 0.6));
  // Far off, the waves' faces mirror the sky higher up, not the pale haze at the horizon.
  sky = mix(sky, uSkyT, farOut * 0.85);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
#ifdef ABYSS
  // How high up the chop this point is where the chop is cut down (near the boat and far off): for the Abyss's lines of foam.
  float crestN = clamp(vHc / max(uAmpChop * vAtt, 0.01) * 0.5 + 0.5, 0.0, 1.0);
  vec3 rimLight;
  {
    // The Abyss: the top of each swell catches a little of the horizon's storm-light, so the black water still reads,
    // and a face leaning toward the boat keeps a very faint sheen, stepping in value from facet to facet and stronger
    // toward its top, so a wall of water beside the boat has a surface instead of being a black panel.
    vec3 facet = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    facet *= sign(facet.y);
    float lean = dot(facet.xz, -normalize(vWorld.xz + 0.0001));
    base += uCrestLit * (0.6 * smoothstep(0.45, 1.0, swellCrest) + 0.4 * lit)
      + uFaceLit * (0.3 + 0.7 * swellCrest) * smoothstep(0.08, 0.75, lean) * (1.0 - smoothstep(25.0, 80.0, dist));
    // The water mirrors the band on the horizon, in the sea's own frame (the horizon heaves with it). Seen edge-on
    // that is a rim of light along a crest, and it comes and goes along the crest with the chop and a slow drift of
    // the water (uRim.z): wide and bright where it catches, thinning to nothing between.
    float catchK = smoothstep(0.36, 0.6, noise(vWorld.xz * 0.06 + vec2(uTime * 0.03, 0.0)) * 0.5 + noise(vWorld.xz * 0.23 + 7.0) * 0.22 + crest * 0.28);
    float rimK = mix(1.0, catchK, uRim.z);
    vec3 Rs = vec3(R.x, dot(R, uSeaUp), R.z);
    vec3 bandR = abyssBand(Rs, uRim.y * mix(1.0, 0.3 + 1.1 * catchK, uRim.z)) * rimK;
    sky += bandR;
    // Lightning lights only the very edge of a crest and throws narrow glints back at the bolt, so the faces stay black
    // under a bright sky.
    float edge = fres * fres;
    rimLight = bandR * uRim.x * edge + abyssFlash(Rs) * uGlint.y * edge * edge * rimK + uFlashCol * uGlint.x * pow(max(dot(R, uFlashDir), 0.0), 400.0);
  }
  vec3 col = mix(base, sky, clamp(fres * 0.6 + 0.03, 0.0, 1.0)) + rimLight;
#else
  vec3 col = mix(base, sky, clamp(fres * 0.6 + 0.03, 0.0, 1.0));
#endif
  float sp = max(dot(R, uSunDir), 0.0);
  col += uSunCol * uSunVis * (pow(sp, 350.0) * 4.0 + pow(sp, 30.0) * 0.15);
  col += uSunCol * (1.0 - uSunVis) * pow(sp, 8.0) * 0.08;
  // The hidden sun's soft path on the water.
  col += uGlow * (pow(sp, 6.0) * 0.35 + pow(sp, 40.0) * 0.5) * (0.3 + 0.7 * fres);
  // The moon's path on the water.
  float mp = max(dot(R, uMoonDir), 0.0);
  col += uMoonCol * (pow(mp, 260.0) * 1.6 + pow(mp, 24.0) * 0.12);
  // Kelp Deep: the forest shows as darker water where it nears the surface, and rafts of torn kelp drift past
  // on the swell, more of them over the forest. Foam breaks round the rafts, not over them.
  float kelpMat = 0.0;
  if (uKelp > 0.0 || uKelpPatch > 0.0) {
    vec2 kp = vWorld.xz + vec2(uTime * 0.55, uTime * 0.1);
    float forest = smoothstep(0.45, 0.56, noise(kp * 0.065) * 0.65 + noise(kp * 0.17 + 9.0) * 0.35);
    col = mix(col, uDeep * 0.45 + uKelpCol2 * 0.35, forest * 0.8 * uKelpPatch);
    float raft = noise(kp * 0.16 + 4.0) * 0.58 + noise(kp * 0.55) * 0.27 + noise(kp * 1.9) * 0.15;
    float th = 0.76 - 0.2 * uKelp - 0.07 * forest * uKelpPatch;
    kelpMat = smoothstep(th, th + 0.025, raft) * step(0.001, uKelp) * (1.0 - smoothstep(110.0, 200.0, dist));
    // Blades lying across the raft in two tones, with a pale bulb here and there.
    float blade = abs(noise(vec2(kp.x * 0.8, kp.y * 3.6) + 2.0) - 0.5) * 2.0;
    vec3 kc = mix(uKelpCol2, uKelpCol, smoothstep(0.12, 0.42, blade));
    float bulb = smoothstep(0.83, 0.88, noise(kp * 5.5));
    kc = mix(kc, uKelpCol * 1.7, bulb);
    col = mix(col, kc * (0.85 + 0.35 * crest), kelpMat * 0.96);
  }
  // How much foam is on the water here (the Abyss's lamps light it).
  float foamy = 0.0;
  if (uFoam > 0.0) {
    vec2 fp = vWorld.xz;
    float f = 0.0;
#ifdef ABYSS
    // The Abyss's black water keeps little of the storm's own foam (uFoamKeep: the chop's, the faces', the streaks, the
    // whitecaps), and in the Abyss proper none, so none of it is worked out there.
    if (uFoamKeep.x + uFoamKeep.y + uFoamKeep.z + uFoamKeep.w > 0.0) {
#else
    {
#endif
      vec2 s2 = vec2(fp.x * 0.35, fp.y * 1.3);
      float nz = noise(s2 + vec2(uTime * 0.15, 0.0)) * 0.6 + noise(s2 * 3.1 - vec2(0.0, uTime * 0.3)) * 0.4;
      float th = 1.0 - uFoam * 0.3 + 0.1 * uStorm;
      f = smoothstep(th, th + 0.07, crest + (nz - 0.5) * 0.5) * smoothstep(0.3, 0.6, noise(vec2(fp.x * 1.2, fp.y * 4.0) + 7.0));
      // In the deep zones' big seas the foam is torn lace, not a sheet: flat pale panels on the swells stood
      // out against the dark water (worst in the Abyss). Only the whitecaps along the swell's crests stay solid.
      float lace = smoothstep(0.5, 0.66, noise(fp * 1.9 + vec2(uTime * 0.22, 0.0)) * 0.55 + noise(fp * 5.3 - vec2(0.0, uTime * 0.3)) * 0.45);
      f *= mix(1.0, lace * 0.75, uStorm) KEEP(x);
      if (uStorm > 0.0) {
        // The storm: whitecaps breaking along the swell's crests, foam down its steep faces, and long
        // wind-blown streaks across the water.
        float slope = 1.0 - normalize(vN).y;
        float broken = smoothstep(0.42, 0.72, noise(fp * 0.45 + vec2(uTime * 0.2, 0.0)));
        float cap = smoothstep(0.9 - 0.12 * uStorm, 0.99, swellCrest + (nz - 0.5) * 0.3) * broken;
        // Along the swell's crest the foam sits on the chop's own crests, with thin lace between them: the top of
        // a 130 m swell is tens of metres wide, and solid foam across it was the biggest pale panel of all.
        cap *= mix(0.25 * lace, 1.0, smoothstep(0.55, 0.9, crest)) * (0.35 + 0.65 * lace);
        float face = smoothstep(0.5 - 0.08 * uStorm, 0.7, slope + (nz - 0.5) * 0.2) * broken;
        vec2 along = vec2(dot(fp, uWind), dot(fp, vec2(-uWind.y, uWind.x)));
        float streak = smoothstep(0.62, 0.82, noise(along * vec2(0.05, 0.7) - vec2(uTime * 0.3, 0.0))) * smoothstep(0.35, 0.7, noise(fp * 0.12 + 3.0));
        f = max(f, uStorm * max(max(cap KEEP(w), face * lace * 0.5 KEEP(y)), streak * lace * 0.4 KEEP(z)));
      }
    }
#ifdef ABYSS
    // The Abyss's own whitecaps (uLines: how strong, how wide, how high up the chop, how many ridges bare): a thin
    // line of foam lying along a ridge, from just behind its top a little way down its leading face (vRidge), on
    // the ridges that stand high on the chop. Patches of sea break and patches don't, and each line is torn into
    // lengths that swell and thin; both drift downwind with the waves. A line is never wider than a metre or so
    // on the water nor than a few pixels on the screen, and one thinner than a pixel fades instead of sparkling.
    // None lie close round the boat, where the chop is cut down to gentle humps (a line there is a long drawn
    // curve).
    if (uStorm > 0.0 && uLines.x > 0.0) {
      // How sharply the ridge rounds over (slope per metre): a gentle hump carries no line.
      vec2 perM = abs(vec2(dFdx(vRidge), dFdy(vRidge))) / max(vec2(length(dFdx(vWorld)), length(dFdy(vWorld))), 0.0001);
      float sharp = max(perM.x, perM.y);
      float px = fwidth(vRidge) + 0.0001, lwMost = min(min(uLines.y, 0.65 * sharp), 3.2 * px);
      float away = length(vWorld.xz);
      // The breaking and the tearing (four lookups of noise) are worked out only where a line could lie: on a sharp
      // ridge high on the chop, within the widest a line gets of its top. Everywhere else the line comes to nothing.
      if (crestN > uLines.z && away > 9.0 && sharp > 0.07 && vRidge > -0.5 * lwMost - px && vRidge < lwMost + px) {
        vec2 along = vec2(dot(fp, uWind), dot(fp, vec2(-uWind.y, uWind.x)));
        vec2 drift = vec2(along.x - uTime * 3.6, along.y);
        float breaking = smoothstep(uLines.w, uLines.w + 0.14, noise(drift * vec2(0.045, 0.07) + 11.0) * 0.7 + noise(drift * vec2(0.13, 0.2)) * 0.3 + 0.12);
        float torn = smoothstep(0.47, 0.64, noise(drift * vec2(0.22, 0.5) + 5.0) * 0.6 + noise(drift * vec2(0.5, 1.6)) * 0.4);
        float lw = lwMost * (0.3 + 0.7 * torn);
        float line = smoothstep(-0.5 * lw - px, -0.1 * lw, vRidge) * (1.0 - smoothstep(0.6 * lw, lw + px, vRidge)) * min(1.0, 1.4 * lw / px);
        line *= breaking * torn * smoothstep(0.07, 0.22, sharp) * smoothstep(uLines.z, uLines.z + 0.1, crestN) * smoothstep(9.0, 17.0, away);
        f = max(f, uLines.x * line);
      }
    }
#endif
    foamy = f * mix(vAtt, 1.0, uStorm) * 0.92 * (1.0 - kelpMat);
    col = mix(col, uFoamCol, foamy);
  }
  // The sea laps along the hull: a band of foam that breathes with the chop, wider in rough water, with
  // broken lace drifting off it.
  float hn = noise(vec2(vWorld.x * 1.3 + uTime * 0.5, vWorld.z * 1.3 - uTime * 0.35));
#ifdef ABYSS
  // (uHullFoam: a narrower band in the Abyss, where the lamps' pool lies on black water.)
  float lap = (0.2 + 0.3 * hn + 0.1 * sin(uTime * 1.3 + vWorld.x * 0.9)) * (1.0 + uFoam) * uHullFoam;
  float lapOut = lap + (0.5 + 0.9 * uFoam) * uHullFoam;
#else
  float lap = (0.2 + 0.3 * hn + 0.1 * sin(uTime * 1.3 + vWorld.x * 0.9)) * (1.0 + uFoam);
  float lapOut = lap + 0.5 + 0.9 * uFoam;
#endif
  float hull = 1.0 - smoothstep(lap * 0.5, lap, hd);
  float lace = smoothstep(0.5, 0.72, noise(vWorld.xz * 2.6 + vec2(uTime * 0.25, 0.0))) * (1.0 - smoothstep(lap, lapOut, hd));
  col = mix(col, uFoamCol, max(hull * 0.9, lace * 0.55));
  // After dark the deck lamps and lit windows glow on the water around the boat.
  col += vec3(1.0, 0.72, 0.42) * uBoatGlow * exp(-hd * 0.55) * (0.06 + 0.14 * hn * crest);
  // The Abyss: the boat is the only warm light, a soft pool on the water hugging the hull. It is measured from the
  // hull through the air, so a swell towering beside the boat is lit only at its foot (uPool: full within the first, gone
  // by the second, in metres), a little stronger abreast of the two deck lamps, and shaped gently by the way each wave
  // leans. On top, a few thin glints lie along the hull, fading with it, and the foam in it shows warm.
#ifdef ABYSS
  {
    float pd = length(vec2(hd, max(vWorld.y - 1.0, 0.0) + max(-1.0 - vWorld.y, 0.0)));
    if (pd < uPool.y) {
      float fall = 1.0 - smoothstep(uPool.x, uPool.y, pd);
      vec2 by = (vWorld.x - vec2(0.95, -6.2)) / 3.5;
      float lamp = 0.55 + 0.45 * max(exp(-by.x * by.x), exp(-by.y * by.y));
      vec3 L = normalize(vec3(clamp(vWorld.x, -6.2, 0.95), 2.9, 0.0) - vWorld);
      // The ripples (g) shade it finely, the waves broadly.
      float form = clamp(0.2 + 0.8 * smoothstep(0.3, 0.95, dot(n, L)) - 7.0 * dot(g, normalize(L.xz + 0.0001)), 0.0, 1.4);
      // Glints: thin dashes lying along the hull, spaced down the water's slope rather than across the flat.
      vec2 rp = vec2(vWorld.x * 3.4 + uTime * 0.4, (abs(vWorld.z) + vWorld.y) * 24.0 - uTime * 1.6);
      float dash = smoothstep(0.785, 0.81, noise(rp) * 0.65 + noise(rp * vec2(2.3, 1.7) + 5.0) * 0.35) * (0.4 + 0.6 * hn);
      foamy = max(foamy, max(hull * 0.9, lace * 0.55));
      col += uPoolCol * fall * fall * lamp * (form * (1.0 + uPoolFoam * foamy) + uPoolGlint * dash);
    }
  }
#endif
  col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, dist) * uHaze);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Rings of vertices that grow apart with distance: dense near the boat, sparse at the horizon. */
function radialGrid(segs: number, r0: number, growth: number, rMax: number): THREE.BufferGeometry {
  const pos: number[] = [0, 0, 0];
  const rings: number[] = [];
  for (let rad = r0; rad < rMax; rad *= growth) rings.push(rad);
  rings.push(rMax);
  for (let j = 0; j < rings.length; j++)
    for (let i = 0; i < segs; i++) {
      const a = ((i + (j % 2) * 0.5) / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * rings[j], 0, Math.sin(a) * rings[j]);
    }
  const idx: number[] = [];
  for (let i = 0; i < segs; i++) idx.push(0, 1 + ((i + 1) % segs), 1 + i);
  for (let j = 0; j < rings.length - 1; j++)
    for (let i = 0; i < segs; i++) {
      const a = 1 + j * segs + i, b = 1 + j * segs + ((i + 1) % segs);
      const c = 1 + (j + 1) * segs + i, d = 1 + (j + 1) * segs + ((i + 1) % segs);
      if (j % 2 === 0) idx.push(a, b, c, b, d, c);
      else idx.push(a, b, d, a, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** Strips a geometry to positions plus one float attribute, ready to merge. */
function bare(geo: THREE.BufferGeometry, name: string, value: (y: number, i: number) => number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  const p = g.getAttribute('position');
  const a = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) a[i] = value(p.getY(i), i);
  g.setAttribute(name, new THREE.BufferAttribute(a, 1));
  return g;
}


/** Low cloud: flat-bottomed puffs all around, darker underneath, merged into one draw (~5k triangles). */
function lowCloud(u: SkyUniforms & { uTop: { value: THREE.Color }; uBot: { value: THREE.Color }; uShow: { value: number }; uCloudHaze: { value: number }; uCloudFlash: { value: THREE.Vector3 } }): THREE.Mesh {
  const rnd = mulberry(11);
  const parts: THREE.BufferGeometry[] = [];
  const flat = 0.5;
  for (let i = 0; i < 46; i++) {
    const n = 4 + Math.floor(rnd() * 4);
    const a = rnd() * Math.PI * 2;
    const d = 60 + rnd() * 240;
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d, cy = 30 + rnd() * 25;
    const size = 1.6;
    const tone = Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const geo = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
      const sx = (10 + rnd() * 12) * size, sy = (4 + rnd() * 4) * size, sz = (8 + rnd() * 6) * size;
      const ox = (k - n / 2) * 11 * size + rnd() * 4, oy = rnd() * 3, oz = rnd() * 6;
      const pos = geo.getAttribute('position');
      const turn = a + Math.PI / 2;
      for (let v = 0; v < pos.count; v++) {
        const y = Math.max(pos.getY(v), -flat);
        const lx = pos.getX(v) * sx + ox, lz = pos.getZ(v) * sz + oz;
        pos.setXYZ(v, cx + lx * Math.cos(turn) - lz * Math.sin(turn), cy + y * sy + oy, cz + lx * Math.sin(turn) + lz * Math.cos(turn));
      }
      // 0 at the flat underside, 1 at the top; each cloud a tone of its own (stored in the whole part), so the deck reads in layers.
      parts.push(bare(geo, 'shade', (y) => tone + THREE.MathUtils.clamp((y - cy + flat * sy) / ((1 + flat) * sy + 3), 0, 0.999)));
    }
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: u as unknown as Record<string, THREE.IUniform>,
    vertexShader: `attribute float shade; varying float vShade; varying vec3 vWorld;
      void main(){ vShade = shade; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uTop, uBot, uFogColor, uGlow, uSunDir, uSeaUp; uniform vec3 uCloudFlash; uniform float uShow, uFogNear, uFogFar, uCloudHaze; varying float vShade; varying vec3 vWorld;
      ${ABYSS_SKY_GLSL}
      void main(){
        // Three tones of cloud (the whole part of vShade), and facets a touch lighter where they face up.
        float tone = floor(vShade + 0.0005);
        vec3 fn = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        float up = clamp(vShade - tone, 0.0, 1.0);
        vec3 lit = mix(uBot, uTop, pow(up, 0.7)) * (0.86 + 0.09 * tone) * (0.95 + 0.07 * abs(fn.y));
        // The hidden sun lights the undersides of the cloud toward it.
        lit += uGlow * pow(max(dot(normalize(vWorld.xz), normalize(uSunDir.xz)), 0.0), 4.0) * (1.0 - up) * 0.12;
        vec3 col = mix(uFogColor, lit, uShow);
        col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, length(cameraPosition - vWorld)) * uCloudHaze);
        // The Abyss's light is behind the deck. Cloud well past the fog is the lit haze itself (the horizon's band and
        // a bolt's flash show through it, a little dimmer, so its skirts still read), while nearer cloud stays a dark
        // body, darker the nearer, whose rim (facets seen edge-on) lights up toward the bolt. Sheet lightning lights a
        // patch of cloud from inside.
        if (uAbyss > 0.0) {
          vec3 D = normalize(vWorld - cameraPosition);
          vec3 Ds = vec3(D.x, dot(D, uSeaUp), D.z);
          float far = smoothstep(uFogFar * 0.8, uFogFar * 2.2, length(cameraPosition - vWorld));
          col += (abyssBand(Ds, uBandShape.x) * uCloudFlash.x + abyssFlash(Ds) * uCloudFlash.y) * far;
          float rim = 1.0 - abs(dot(fn, D));
          float bolt = max(dot(D, uFlashDir), 0.0);
          col += uFlashCol * (uFlashWide + (1.0 - uFlashWide) * bolt * bolt * bolt) * uCloudFlash.z * pow(rim, 5.0);
          float inside = pow(max(dot(D, uSheetDir), 0.0), 2.0 + 14.0 * uSheetSize);
          col += uSheetCol * inside * (0.45 + 0.2 * tone + 0.5 * rim * rim) * (1.15 - 0.5 * up);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return new THREE.Mesh(mergeGeometries(parts)!, mat);
}

/**
 * Fair-weather cumulus standing on the horizon all around: flat-based towers far past the fog, so their haze
 * is baked in (bases melt into the horizon, tops catch the light). They take the day's colours, and sink
 * into the overcast as it rolls in toward the Drop-off. One draw (~8k triangles).
 */
function horizonCloud(u: SkyUniforms & { uTop: { value: THREE.Color }; uBot: { value: THREE.Color }; uShow: { value: number } }): THREE.Mesh {
  const rnd = mulberry(29);
  const parts: THREE.BufferGeometry[] = [];
  const N = 15;
  for (let i = 0; i < N; i++) {
    // Uneven gaps, and a clear stretch where the headland stands.
    const a = ((i + (rnd() - 0.5) * 0.7) / N) * Math.PI * 2;
    const d = 640 + rnd() * 160;
    const big = 0.6 + rnd() * 0.9;
    const n = 4 + Math.floor(rnd() * 4);
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d, base = 5 + rnd() * 6;
    const turn = a + Math.PI / 2;
    for (let k = 0; k < n; k++) {
      const geo = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
      const mid = 1 - Math.abs((k + 0.5) / n - 0.5) * 1.4;
      const sx = (38 + rnd() * 26) * big, sy = (22 + rnd() * 30) * big * (0.45 + 0.75 * mid), sz = (26 + rnd() * 14) * big;
      const ox = ((k + 0.5) / n - 0.5) * n * 34 * big + (rnd() - 0.5) * 14, oz = (rnd() - 0.5) * 20;
      const pos = geo.getAttribute('position');
      for (let v = 0; v < pos.count; v++) {
        // Flat underneath, like the low cloud.
        const y = Math.max(pos.getY(v), -0.25);
        const lx = pos.getX(v) * sx + ox, lz = pos.getZ(v) * sz + oz;
        pos.setXYZ(v, cx + lx * Math.cos(turn) - lz * Math.sin(turn), base + (y + 0.25) * sy, cz + lx * Math.sin(turn) + lz * Math.cos(turn));
      }
      parts.push(bare(geo, 'shade', (y) => THREE.MathUtils.clamp((y - base) / (70 * big), 0, 1)));
    }
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: u as unknown as Record<string, THREE.IUniform>,
    vertexShader: `attribute float shade; varying float vShade; varying vec3 vWorld;
      void main(){ vShade = shade; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uTop, uBot, uFogColor, uSunDir; uniform float uShow; varying float vShade; varying vec3 vWorld;
      void main(){
        // Facets facing the sun and the sky are lighter; the haze thickens toward the base.
        vec3 fn = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        float lit = 0.5 + 0.3 * max(dot(fn, uSunDir), 0.0) + 0.2 * max(fn.y, 0.0);
        vec3 col = mix(uBot, uTop, clamp(lit * (0.55 + 0.6 * vShade), 0.0, 1.0));
        col = mix(uFogColor, col, uShow * mix(0.4, 0.92, smoothstep(0.0, 0.5, vShade)));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(mergeGeometries(parts)!, mat);
  mesh.frustumCulled = false;
  return mesh;
}

/** The Shelf's distant headland and lighthouse, off the starboard bow; it fades into the haze as the dive goes deeper. */
function headland(u: SkyUniforms & { uFade: { value: number }; uNight: { value: number } }): THREE.Mesh {
  const rnd = mulberry(5);
  const parts: THREE.BufferGeometry[] = [];
  const col = (geo: THREE.BufferGeometry, hex: number, glow = 0) => {
    const c = new THREE.Color(hex);
    const g = bare(geo, 'glow', () => glow);
    const n = g.getAttribute('position').count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(a, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    parts.push(g);
  };
  // Behind the players, past the port rail: they fish facing open sea (-z), away from land.
  const base = -0.45;
  for (let i = 0; i < 9; i++) {
    const a = base + (i / 8) * 0.55;
    const d = 330 + rnd() * 40;
    const hill = new THREE.ConeGeometry(30 + rnd() * 30, 14 + rnd() * 18 + (i > 2 && i < 7 ? 10 : 0), 6, 1);
    hill.translate(Math.sin(a) * d, 4, Math.cos(a) * d);
    col(hill, 0x56795a);
    const beach = new THREE.CylinderGeometry(34, 40, 6, 7);
    beach.translate(Math.sin(a) * (d - 20), 0, Math.cos(a) * (d - 20));
    col(beach, 0xb8a77d);
  }
  const la = base + 0.5, ld = 300;
  const lx = Math.sin(la) * ld, lz = Math.cos(la) * ld;
  const put = (g: THREE.BufferGeometry, y: number) => g.translate(lx, y, lz);
  col(put(new THREE.CylinderGeometry(9, 12, 8, 7), 4), 0x6e6a64);
  col(put(new THREE.CylinderGeometry(1.6, 2.4, 16, 8), 16), 0xf4f1ea);
  col(put(new THREE.CylinderGeometry(2.0, 2.15, 4, 8), 14), 0xd9483b);
  col(put(new THREE.ConeGeometry(2.4, 3, 8), 26), 0xd9483b);
  col(put(new THREE.CylinderGeometry(1.3, 1.3, 2.2, 8), 23.6), 0xfff0b0, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: u as unknown as Record<string, THREE.IUniform>,
    vertexColors: true,
    vertexShader: `attribute float glow; varying vec3 vCol; varying float vGlow;
      void main(){ vCol = color; vGlow = glow; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    // Haze is baked in rather than fogged: the land sits past the fog's far edge.
    fragmentShader: `uniform vec3 uFogColor; uniform float uFade, uNight; varying vec3 vCol; varying float vGlow;
      void main(){
        vec3 col = vCol * mix(1.0 - 0.75 * uNight, 1.0 + uNight, vGlow);
        col = mix(col, uFogColor, mix(0.45, 1.0, uFade) * (1.0 - vGlow * uNight * 0.6));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return new THREE.Mesh(mergeGeometries(parts)!, mat);
}

const smooth = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);

/** Soft round sprite for the spray. */
function dotTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

const seaUniforms = (sky: SkyUniforms) => ({
  ...sky,
  ...waveUniforms(),
  uAmpChop: { value: 1 },
  uAmpSwell: { value: 1 },
  uStorm: { value: 0 },
  uWind: { value: new THREE.Vector2(Math.sin((35 * Math.PI) / 180), Math.cos((35 * Math.PI) / 180)) },
  uShallow: { value: new THREE.Color() },
  uDeep: { value: new THREE.Color() },
  uFar: { value: new THREE.Color() },
  uFarMix: { value: 0 },
  uHaze: { value: 1 },
  uKelp: { value: 0 },
  uKelpPatch: { value: 0 },
  uKelpCol: { value: new THREE.Color() },
  uKelpCol2: { value: new THREE.Color() },
  uFoamCol: { value: new THREE.Color() },
  uFoam: { value: 0 },
  uLift: { value: 1 },
  uBoatGlow: { value: 0 },
  // The Abyss (`ABYSS`); at rest these leave the water as it always was.
  uCrestLit: { value: new THREE.Color(0) },
  uFoamKeep: { value: new THREE.Vector4(1, 1, 1, 1) },
  uFaceLit: { value: new THREE.Color(0) },
  uRim: { value: new THREE.Vector3(0, 0.2, 0) },
  uPool: { value: new THREE.Vector2(1.5, 4.5) },
  uPoolCol: { value: new THREE.Color(0) },
  uPoolFoam: { value: 0 },
  uPoolGlint: { value: 0 },
  uGlint: { value: new THREE.Vector2() },
  uHullFoam: { value: 1 },
  uLines: { value: new THREE.Vector4(0, 0.1, 0.6, 0.5) },
});
const cloudUniforms = (sky: SkyUniforms) => ({ ...sky, uTop: { value: new THREE.Color() }, uBot: { value: new THREE.Color() }, uShow: { value: 0 }, uCloudHaze: { value: 1 }, uCloudFlash: { value: new THREE.Vector3() } });
const landUniforms = (sky: SkyUniforms) => ({ ...sky, uFade: { value: 0 }, uNight: { value: 0 } });

const SPRAY = 420;
const SPRAY_COL = new THREE.Color(0xf4f8fa);
const DRIFT_COL = new THREE.Color(0xeef2f5);
/** The open sea at night leans toward a deep blue rather than the pond's teal. */
const NIGHT_SEA = new THREE.Color(0x07121f);

/** Bow spray: droplets thrown off both sides of the bow as it digs in, blown aft along the rails. */
class Spray {
  readonly points: THREE.Points;
  private pos = new Float32Array(SPRAY * 3);
  private vel = new Float32Array(SPRAY * 3);
  private life = new Float32Array(SPRAY);
  private next = 0;
  private owed = 0;
  private rnd = mulberry(9);

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(
      g,
      new THREE.PointsMaterial({ map: dotTexture(), size: 0.11, color: SPRAY_COL, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.points.frustumCulled = false;
    this.pos.fill(-100);
  }

  /** `rate`: droplets a second; the bow's sink speed (m/s) adds bursts. */
  update(dt: number, rate: number, sink: number): void {
    const r = this.rnd;
    this.owed += dt * rate * (0.4 + 2.5 * Math.max(0, sink));
    while (this.owed >= 1) {
      this.owed -= 1;
      const i = this.next;
      this.next = (this.next + 1) % SPRAY;
      const side = r() < 0.5 ? -1 : 1;
      const x = BOAT.len / 2 - 0.8 - r() * 1.8;
      this.pos.set([x, BOAT.deck + 0.2 + r() * 0.5, side * (hullHalfWidth(x) + 0.1 + r() * 0.3)], i * 3);
      this.vel.set([-1.5 - r() * 2.5, 2 + r() * 3, side * (1 + r() * 1.5)], i * 3);
      this.life[i] = 0.9 + r() * 0.6;
    }
    for (let i = 0; i < SPRAY; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= 9.8 * dt;
      // Wind carries it aft.
      this.vel[k] -= 3 * dt;
      for (let a = 0; a < 3; a++) this.pos[k + a] += this.vel[k + a] * dt;
      if (this.life[i] <= 0 || this.pos[k + 1] < -0.5) {
        this.life[i] = 0;
        this.pos[k + 1] = -100;
      }
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}

const DRIFT = 700;
/** The way the storm blows: along the long swell. */
const WIND = new THREE.Vector2(Math.sin((35 * Math.PI) / 180), Math.cos((35 * Math.PI) / 180));

/** Spindrift: spray the wind tears off the swell's crests all around the boat, in the sea's frame. */
class Spindrift {
  readonly points: THREE.Points;
  private pos = new Float32Array(DRIFT * 3);
  private vel = new Float32Array(DRIFT * 3);
  private life = new Float32Array(DRIFT);
  private next = 0;
  private owed = 0;
  private rnd = mulberry(17);

  constructor(tex: THREE.Texture) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(
      g,
      new THREE.PointsMaterial({ map: tex, size: 0.5, color: DRIFT_COL, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    this.points.frustumCulled = false;
    this.pos.fill(-100);
  }

  update(dt: number, t: number, mood: number, storm: number, crestAt: number): void {
    const r = this.rnd;
    this.owed += dt * 900 * storm;
    let tries = 0;
    while (this.owed >= 1 && tries++ < 400) {
      // A spot 8-70 m out; only crests throw spindrift.
      const a = r() * Math.PI * 2;
      const d = 8 + Math.sqrt(r()) * 62;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const h = seaHeight(x, z, t, mood);
      if (h < crestAt) continue;
      this.owed -= 1;
      const i = this.next;
      this.next = (this.next + 1) % DRIFT;
      const v = 4 + r() * 7;
      this.pos.set([x + (r() - 0.5) * 2, h + 0.1, z + (r() - 0.5) * 2], i * 3);
      this.vel.set([WIND.x * v, 1 + r() * 3, WIND.y * v], i * 3);
      this.life[i] = 0.8 + r() * 1.0;
    }
    this.owed = Math.min(this.owed, 50);
    for (let i = 0; i < DRIFT; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= 5 * dt;
      for (let c = 0; c < 3; c++) this.pos[k + c] += this.vel[k + c] * dt;
      if (this.life[i] <= 0) this.pos[k + 1] = -100;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}

/**
 * Lightning in the Abyss: a forked bolt out on the water every few seconds, more often the deeper,
 * flickering two or three times. `flash` (0..1) lights the sky, and with it the sea's reflections.
 * Between bolts sheet lightning flickers inside the cloud (`sheet`), with no bolt and no thunder.
 */
class Lightning {
  readonly group = new THREE.Group();
  /** How bright the sky is lit right now. */
  flash = 0;
  /** Where the bolt lighting the sky stands (or the last one stood): its bearing (atan2 of z, x) and how far off it is (m). */
  bearing = -Math.PI / 2;
  distance = 150;
  /** Sheet lightning: how bright the cloud is lit from inside right now (0..1), and the bearing of the patch. */
  sheet = 0;
  sheetBearing = -Math.PI / 2;
  private sheetAge = Infinity;
  private sheetLen = 0;
  private sheetPeak = 0;
  private sheetK = 0;
  private sheetTimer = 1;
  /** Its own dice, so the bolts fall as they always did. */
  private sheetRnd = mulberry(31);
  private mat = new THREE.MeshBasicMaterial({ color: 0xf4f0ff, fog: false });
  private bolt: THREE.Mesh | null = null;
  private age = Infinity;
  private timer = 2;
  private rnd = mulberry(23);
  /** Called with each strike's distance in metres, for the thunder. */
  onStrike?: (dist: number) => void;
  /** How fast the sea's own bolts come, times their usual pace (a giant's fight builds the storm: `Sea.fight`). */
  haste = 1;

  /** `level`: how often bolts strike (0..1); `sheets`: whether sheet lightning plays too (the Abyss's own look). */
  update(dt: number, level: number, sheets = false): void {
    this.age += dt;
    if (level > 0) {
      this.timer -= dt * this.haste;
      if (this.timer <= 0) {
        this.strike();
        this.timer = (12 - 9 * level) * (0.5 + this.rnd());
      }
    }
    this.sheetAge += dt;
    if (level > 0 && sheets) {
      this.sheetTimer -= dt;
      if (this.sheetTimer <= 0) {
        this.flicker();
        const [rare, often] = ABYSS.sheet.every;
        this.sheetTimer = (rare + (often - rare) * level) * (0.4 + 1.2 * this.sheetRnd());
      }
    }
    this.sheet = this.sheetPeak * sheetGlow(this.sheetAge, this.sheetLen, this.sheetK);
    // Three flickers in the first 0.4 s, then a fading afterglow.
    const a = this.age;
    const on = a < 0.08 || (a > 0.14 && a < 0.2) || (a > 0.3 && a < 0.4);
    if (this.bolt) this.bolt.visible = on;
    this.flash = on ? 1 : Math.max(0, this.flash - dt * 4);
  }

  /** Sheet lightning now, at `bearing` if given (anywhere round the sky otherwise) and `strength` (0..1) of its brightness. */
  flicker(bearing?: number, strength?: number): void {
    const r = this.sheetRnd;
    const [l0, l1] = ABYSS.sheet.length, [s0, s1] = ABYSS.sheet.strength;
    this.sheetBearing = bearing ?? r() * Math.PI * 2;
    this.sheetLen = l0 + (l1 - l0) * r();
    this.sheetPeak = strength ?? s0 + (s1 - s0) * r();
    this.sheetK = r();
    this.sheetAge = 0;
  }

  /** Holds the sea's own bolts off for `secs` seconds (a quiet moment: the Dreamer waking). Bolts thrown with `strike` still land. */
  hush(secs: number): void {
    this.timer = Math.max(this.timer, secs);
  }

  /**
   * Throws a bolt now, at `bearing` (atan2 of z, x) if given; mostly over the open sea players face (-z). `dist`: how
   * far off it stands (m; 90 to 200 at random unless given), which sets its thunder: a near one cracks.
   */
  strike(bearing?: number, dist?: number): void {
    const r = this.rnd;
    if (this.bolt) {
      this.group.remove(this.bolt);
      this.bolt.geometry.dispose();
    }
    const a = bearing ?? (r() < 0.7 ? -Math.PI * (0.15 + 0.7 * r()) : r() * Math.PI * 2);
    const d = dist ?? 90 + r() * 110;
    const parts: THREE.BufferGeometry[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    const seg = (p: THREE.Vector3, q: THREE.Vector3, w: number) => {
      const dir = q.clone().sub(p);
      const g = new THREE.BoxGeometry(w, dir.length(), w);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize()));
      g.translate((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
      parts.push(g);
    };
    const fork = (from: THREE.Vector3, steps: number, w: number, drop: number) => {
      let p = from;
      for (let i = 0; i < steps && p.y > 0; i++) {
        const q = p.clone().add(new THREE.Vector3((r() - 0.5) * 14, -drop * (0.7 + r() * 0.6), (r() - 0.5) * 14));
        q.y = Math.max(0, q.y);
        seg(p, q, w);
        if (w > 1.2 && r() < 0.3) fork(q, 4, w * 0.5, drop * 0.8);
        p = q;
      }
    };
    fork(new THREE.Vector3(Math.cos(a) * d, 75, Math.sin(a) * d), 13, 3, 8);
    this.bolt = new THREE.Mesh(mergeGeometries(parts.map((g) => g.toNonIndexed()))!, this.mat);
    this.bolt.frustumCulled = false;
    this.group.add(this.bolt);
    this.age = 0;
    this.bearing = a;
    this.distance = d;
    this.onStrike?.(d);
  }
}

export class Sea {
  /** The sea's own frame: moves opposite to the boat's ride. */
  readonly frame = new THREE.Group();
  /** Things fixed to the boat: the spray. */
  readonly onBoat = new THREE.Group();
  readonly motion: BoatMotion = { heave: 0, pitch: 0, roll: 0 };
  /**
   * A push on the boat on top of the swell's own motion (a surfacing giant's swell lifting it, its weight heeling it):
   * set by the game each frame, nothing unless it is. The sea and the sky move by it like any other heave and roll.
   */
  readonly shove: BoatMotion = { heave: 0, pitch: 0, roll: 0 };
  /** The sea frame's rotation (the boat's, reversed), for the sky to tilt with. */
  readonly tilt = new THREE.Quaternion();
  /**
   * The weather as a giant's fight bends it (`LEGEND_FIGHT.storm`), set by the game each frame and at rest otherwise:
   * `bolts` how fast the sea's own bolts come, `rain` how much of the rain falls and `wind` how hard it is driven
   * (each times the zone's own).
   */
  readonly fight = { bolts: 1, rain: 1, wind: 1 };
  private u: ReturnType<typeof seaUniforms>;
  private cloudU: ReturnType<typeof cloudUniforms>;
  private landU: ReturnType<typeof landUniforms>;
  private clouds: THREE.Mesh;
  private bankU: ReturnType<typeof cloudUniforms>;
  /** The water, and the same water with the Abyss's shading built in (`seaFrag`): one of the two is drawn. */
  private water: THREE.Mesh;
  private waterAbyss: THREE.Mesh;
  private bank: THREE.Mesh;
  private land: THREE.Mesh;
  private spray = new Spray();
  private drift = new Spindrift(dotTexture());
  readonly lightning = new Lightning();
  private rain: Rain;
  private buoy = new MarkerBuoy();
  private gulls = new Gulls();
  private jellies: Jellies;
  /** What lurks in the Abyss (`LURK`). */
  readonly lurk: AbyssLurk;
  private night = 0;
  private lamps = 0;
  /** The deep look `setColors` last had, for the weather. */
  private look: DeepLook = DEEP_LOOKS.dropoff;
  private lastBow = 0;
  /** How fast the bow is dropping into the water (m/s), for the spray on the screen. */
  slam = 0;
  /** The long swell's height right now, for the wash of the waves. */
  swell = 0;
  private boatM = new THREE.Matrix4();
  private tmp = new THREE.Vector3();
  private sums = { chop: 0, swell: 0 };
  private mood = 0;
  private t = 0;
  private cloudTurn = 0;

  constructor(sky: SkyUniforms) {
    this.u = seaUniforms(sky);
    const shader = { uniforms: this.u, vertexShader: seaVert, fragmentShader: seaFrag };
    this.water = new THREE.Mesh(radialGrid(96, 0.4, 1.06, 1100), new THREE.ShaderMaterial(shader));
    this.waterAbyss = new THREE.Mesh(this.water.geometry, new THREE.ShaderMaterial({ ...shader, defines: { ABYSS: '' } }));
    this.water.frustumCulled = this.waterAbyss.frustumCulled = false;
    this.waterAbyss.visible = false;
    this.cloudU = cloudUniforms(sky);
    this.clouds = lowCloud(this.cloudU);
    this.bankU = cloudUniforms(sky);
    this.bank = horizonCloud(this.bankU);
    this.landU = landUniforms(sky);
    this.land = headland(this.landU);
    this.frame.matrixAutoUpdate = false;
    this.rain = new Rain(sky);
    this.jellies = new Jellies(this.u);
    this.frame.add(this.water, this.waterAbyss, this.bank, this.clouds, this.land, this.drift.points, this.lightning.group, this.buoy.group, this.gulls.mesh, this.jellies.group);
    this.onBoat.add(this.spray.points, this.rain.mesh);
    this.lurk = new AbyssLurk(this.u);
    this.frame.add(this.lurk.group);
  }

  /** Spray is see-through overdraw near the eye; lite graphics drops it, and thins the rain and the jellies. */
  setLite(on: boolean): void {
    this.spray.points.visible = !on;
    this.rain.setLite(on);
    this.jellies.setLite(on);
    this.lurk.setLite(on);
    this.lite = on;
  }
  private lite = false;
  /** How bright the rain is against the sky (1 the old half white; a look with its own night dims it). */
  private rainLit = 1;

  /** The waves' uniforms, for things drawn riding the water (`WAVE_GLSL`): a legend's shadow. */
  get waves(): { uTime: THREE.IUniform; uWa: THREE.IUniform; uWb: THREE.IUniform } {
    return { uTime: this.u.uTime, uWa: this.u.uWa, uWb: this.u.uWb };
  }

  /** Whether the marker buoy has drifted up alongside the boat. */
  get buoyAlongside(): boolean {
    return this.buoy.alongside;
  }

  /** Whether the boat is stopped at a marker: its buoy drifts up alongside, and falls astern on sailing on. */
  setMarker(on: boolean): void {
    this.buoy.set(on);
  }

  /**
   * Water, cloud and land colours for the time of day and mood. `n`: nightness, `tw`: twilight,
   * `base`: the location's water and deep colours, `look`: the deep zone's colours for this mood,
   * `lamps`: how far the boat's lamps are lit, for their glow on the water.
   */
  setColors(n: number, tw: number, base: { water: THREE.Color; deep: THREE.Color }, look: DeepLook, lamps: number): void {
    const m = Math.min(1, this.mood);
    const u = this.u;
    const dim = (h: number, k: number) => new THREE.Color(h).multiplyScalar(k);
    // A touch darker than the pond's water at night, for atmosphere out on open sea.
    u.uShallow.value.copy(base.water).multiplyScalar(1 - 0.9 * n).lerp(NIGHT_SEA, 0.45 * n).lerp(new THREE.Color(look.water).lerp(new THREE.Color(look.nightWater), n), Math.min(1, m * 1.4));
    u.uDeep.value.copy(base.deep).multiplyScalar(1 - 0.88 * n).lerp(NIGHT_SEA, 0.3 * n).lerp(new THREE.Color(look.deep).lerp(new THREE.Color(look.nightDeep), n), Math.min(1, m * 1.4));
    // The Shelf's far water: a deeper blue by day, dimmed with the rest at night.
    u.uFar.value.set(SHELF_FAR.color).multiplyScalar(1 - 0.88 * n).lerp(NIGHT_SEA, 0.3 * n);
    this.night = n;
    // Kelp Deep's kelp, dimmed with the night like the water.
    u.uKelpCol.value.set(KELP.color).multiplyScalar(1 - 0.85 * n);
    u.uKelpCol2.value.set(KELP.shade).multiplyScalar(1 - 0.85 * n);
    this.lamps = lamps;
    this.look = look;
    // A look with its own night (`nightLook`): the foam turns to its glowing night surf, the cloud darkens with the
    // sky to just above it, and the spray and spindrift dim with the night.
    const nr = nightRamp(n);
    const own = look.nightLook;
    u.uFoamCol.value.set(look.foam).lerp(new THREE.Color(0xf6f4f2), n).multiplyScalar(1 - 0.72 * n)
      .lerp(new THREE.Color(look.foam).lerp(dim(look.nightFoam, 0.2), nr), own * m);
    u.uLift.value = 1 - 0.85 * n;
    u.uBoatGlow.value = lamps;
    this.cloudU.uCloudHaze.value = look.cloudHaze;
    const nightTop = new THREE.Color(look.nightSkyT).lerp(new THREE.Color(look.nightSkyH), 0.3);
    const cloudAt = (day: number, night: THREE.Color) => dim(day, 1 - 0.7 * n).lerp(new THREE.Color(day).lerp(night, nr), own);
    const cloud = new THREE.Color(0xffffff).lerp(new THREE.Color(0x26304f), n).lerp(new THREE.Color(0xffb890), tw * 0.5);
    this.cloudU.uTop.value.copy(cloud).lerp(cloudAt(look.cloudTop, nightTop), m);
    this.cloudU.uBot.value.copy(cloud).multiplyScalar(0.93).lerp(cloudAt(look.cloudBot, dim(look.nightSkyT, 0.7)), m);
    const dimmed = 1 - 0.8 * nr * own * m;
    this.rainLit = dimmed;
    // The horizon's cumulus: white by day, peach at dusk, moonlit slate at night, its shaded side toward the sky's own colour.
    this.bankU.uTop.value.set(0xffffff).lerp(new THREE.Color(0x3a4668), n).lerp(new THREE.Color(0xffc09a), tw * 0.6);
    this.bankU.uBot.value.copy(this.bankU.uTop.value).multiplyScalar(0.78).lerp(u.uSkyT.value, 0.35);
    this.landU.uNight.value = n;
    this.setAbyss(n, lamps, dimmed);
  }

  /**
   * The Abyss's own look (`ABYSS`), laid over the colours above as far as it is in (`abyssAt`): black water with the
   * horizon's band on its crests, little foam, dim spray, and the lamps' pool round the hull. Outside the Abyss every
   * value here is the one that leaves the sea as it always was. `dimmed`: how far a look with its own night has the spray
   * and spindrift dimmed (1 not at all).
   */
  private setAbyss(n: number, lamps: number, dimmed: number): void {
    const A = ABYSS;
    const ab = abyssAt(this.mood);
    const u = this.u;
    const c = this.scratch;
    // The clock still passes: a little less light at night.
    const lit = 1 - (1 - A.night) * n;
    if (ab > 0) {
      u.uShallow.value.lerp(c.set(A.water), ab);
      u.uDeep.value.lerp(c.set(A.deep), ab);
      u.uFoamCol.value.lerp(c.set(A.foam.color).multiplyScalar(lit), ab);
      u.uLift.value *= 1 - ab;
      this.cloudU.uTop.value.lerp(c.set(A.cloud[0]), ab);
      this.cloudU.uBot.value.lerp(c.set(A.cloud[1]), ab);
    }
    u.uCrestLit.value.set(A.band).multiplyScalar(A.crest * lit * ab);
    u.uFaceLit.value.set(A.band).multiplyScalar(A.face * lit * ab);
    u.uRim.value.set(A.rim * ab, A.rimWidth, A.rimBreak);
    u.uFoamKeep.value.set(1 + (A.foam.chop - 1) * ab, 1 + (A.foam.face - 1) * ab, 1 + (A.foam.streak - 1) * ab, 1 + (A.foam.caps - 1) * ab);
    // The pool takes the place of the old faint glow, which showed as a flat stain on black water.
    u.uBoatGlow.value = lamps * (1 - ab);
    u.uPool.value.set(A.pool.core, A.pool.reach);
    u.uPoolCol.value.set(A.pool.color).multiplyScalar(A.pool.glow * lamps * ab);
    u.uPoolFoam.value = A.pool.foam;
    u.uPoolGlint.value = A.pool.glints;
    u.uHullFoam.value = 1 + (A.foam.hull - 1) * ab;
    u.uLines.value.set(A.foam.lines * ab, A.foam.lineWidth, A.foam.lineHeight, A.foam.lineBare);
    u.uGlint.value.set(A.flash.glint, A.flash.crests);
    this.cloudU.uCloudFlash.value.set(A.cloudBand, A.flash.haze, A.flash.edge);
    // Spray and rain take what light there is instead of glowing white against the black; the bow's spray is in the
    // lamps. Under that they keep the dimming of a look with its own night (the Twilight's), which eases out as this eases in.
    (this.drift.points.material as THREE.PointsMaterial).color.copy(DRIFT_COL).multiplyScalar(dimmed).multiplyScalar(1 + (A.spindrift - 1) * ab);
    (this.spray.points.material as THREE.PointsMaterial).color.copy(SPRAY_COL).multiplyScalar(dimmed).lerp(c.set(A.bowSpray), ab);
    this.rainStand = 1 + (A.rain - 1) * ab;
    this.rainLamps = lamps * (1 + (A.pool.rain - 1) * ab);
  }
  private scratch = new THREE.Color();
  /** How far the rain stands out from the fog (1; less against the Abyss's black), and how brightly the lamps catch it. */
  private rainStand = 1;
  private rainLamps = 0;

  /** The Abyss's lightning for the sky, the cloud and the water: where the bolt and the sheet flicker are, and their light now. */
  private setLightning(ab: number): void {
    const A = ABYSS, L = this.lightning, u = this.u;
    // Toward the bolt, a little above the horizon where its light comes through the cloud.
    u.uFlashDir.value.set(Math.cos(L.bearing) * L.distance, 28, Math.sin(L.bearing) * L.distance).normalize();
    u.uFlashCol.value.set(A.flash.color).multiplyScalar(A.flash.sky * L.flash * ab);
    u.uFlashWide.value = A.flash.wide;
    u.uSheetDir.value.set(Math.cos(L.sheetBearing), 0.32, Math.sin(L.sheetBearing)).normalize();
    u.uSheetCol.value.set(A.sheet.color).multiplyScalar(A.sheet.cloud * L.sheet * ab);
    u.uSheetSky.value = A.sheet.sky / Math.max(0.01, A.sheet.cloud);
    u.uSheetSize.value = A.sheet.size;
    this.rain.flash(A.flash.rain);
  }

  update(t: number, dt: number, mood: number): void {
    this.t = t;
    this.mood = mood;
    const u = this.u;
    u.uTime.value = t;
    setWaves(u, mood, this.sums);
    u.uAmpChop.value = this.sums.chop;
    u.uAmpSwell.value = this.sums.swell;
    this.swell = this.sums.swell;
    u.uStorm.value = stormAt(mood);
    const F = this.fight;
    u.uFoam.value = 0.15 + 0.65 * Math.min(1, mood) + 0.2 * stormAt(mood);

    const shelf = 1 - smooth(0, SHELF_FAR.until, mood);
    u.uFarMix.value = shelf;
    u.uHaze.value = 1 - (1 - SHELF_FAR.haze) * shelf;
    const kelp = kelpAt(mood);
    u.uKelp.value = KELP.rafts * kelp;
    u.uKelpPatch.value = KELP.forest * kelp;

    // Clear Shelf nights keep their stars; the low cloud rolls in toward the Drop-off.
    const show = smooth(0.35, 0.65, mood);
    this.cloudU.uShow.value = show;
    this.clouds.visible = show > 0;
    // The deck drifts round on the wind, faster in the deep zones' weather.
    this.cloudTurn += dt * (0.003 + 0.004 * Math.min(2, mood));
    this.clouds.rotation.y = this.cloudTurn;
    const bank = 1 - smooth(0.25, 0.6, mood);
    this.bankU.uShow.value = bank;
    this.bank.visible = bank > 0;
    const fade = smooth(0, 0.35, mood);
    this.landU.uFade.value = fade;
    this.land.visible = fade < 1;

    const mo = boatMotion(t, mood, this.motion);
    const sv = this.shove;
    this.boatM.makeRotationFromEuler(new THREE.Euler(mo.roll + sv.roll, 0, mo.pitch + sv.pitch, 'YXZ')).setPosition(0, mo.heave + sv.heave, 0);
    this.frame.matrix.copy(this.boatM).invert();
    this.frame.matrixWorldNeedsUpdate = true;
    this.tilt.setFromRotationMatrix(this.frame.matrix);

    // The bow's height relative to the water under it: when it drops into a wave, spray flies.
    const bow = mo.heave + mo.pitch * (BOAT.len * 0.45) - seaHeight(BOAT.len * 0.45, 0, t, mood);
    const sink = dt > 0 ? (this.lastBow - bow) / dt : 0;
    this.lastBow = bow;
    this.slam = sink;
    // Tons of spray in the deep: three times the Drop-off's by the Abyss, in bigger drops.
    const storm = stormAt(mood);
    (this.spray.points.material as THREE.PointsMaterial).size = 0.11 + 0.09 * storm;
    if (this.spray.points.visible) this.spray.update(dt, 90 * smooth(0.3, 1.1, mood) * (1 + 2 * Math.max(0, mood - 1)), sink);
    // Spindrift off the swell's crests (half the rate in lite graphics).
    this.drift.points.visible = storm > 0;
    const look = this.look;
    if (storm > 0) this.drift.update(dt, t, mood, storm * (this.lite ? 0.5 : 1), 0.45 * this.swell + 0.3);
    const abyss = abyssAt(mood);
    this.waterAbyss.visible = abyss > 0;
    this.water.visible = !this.waterAbyss.visible;
    this.lightning.haste = F.bolts;
    this.lightning.update(dt, lightningAt(mood), abyss > 0);
    this.setLightning(abyss);
    u.uSeaUp.value.setFromMatrixColumn(this.frame.matrix, 1);
    this.rain.update(t, rainAt(mood) * F.rain, storm * F.wind, WIND, this.rainLamps, this.rainLit, this.rainStand);
    this.buoy.update(t, dt, mood, Math.max(this.night, this.lamps));
    this.gulls.update(t, dt, mood, this.night);
    this.jellies.update(t, mood, this.night);
    this.lurk.update(t, dt, mood, this.night, this.lightning);
  }

  /** World height of the water at (x, z): the swell, carried by the sea's frame. */
  surface(x: number, z: number): number {
    const h = seaHeight(x, z, this.t, this.mood);
    return this.tmp.set(x, h, z).applyMatrix4(this.frame.matrix).y;
  }
}

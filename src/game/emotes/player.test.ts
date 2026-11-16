import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultLook } from '../../data/cosmetics';
import { EMOTES, emoteById, type EmoteDef } from '../../data/emotes';
import type { Character } from '../character';
import { WATER_ORDER } from '../env';
import { EMOTE_LOOKS, emoteLook } from './looks';
import { EmotePlayer } from './player';
import { restPose, type EmoteCtx, type EmoteLook, type EmotePose } from './types';

/** A stand-in for `Character` with what an emote touches: the last pose put on it and its effects group. */
const fakeChar = () => {
  const poses: (EmotePose | null)[] = [];
  const char = { look: defaultLook(), extent: { top: 2.3, reach: 0.6 }, effects: new THREE.Group(), pose: (p: EmotePose | null) => poses.push(p ? { ...p } : null) };
  return { char: char as unknown as Character, effects: char.effects, poses, last: () => poses.at(-1) };
};
const def = (id: string, seconds: number): EmoteDef => ({ id, name: id, icon: '?', tier: 'base', seconds, camera: 'behind' });
/** A test look that hops for the whole emote and records what it was given. */
const spy = () => {
  const seen = { ctx: null as EmoteCtx | null, ts: [] as number[], disposed: 0, group: new THREE.Group() };
  const look: EmoteLook = (ctx) => {
    seen.ctx = ctx;
    return { group: seen.group, update: (t, _dt, pose) => { seen.ts.push(t); pose.lift = 1; pose.roll = 0.5; }, dispose: () => { seen.disposed++; } };
  };
  return { seen, look };
};

afterEach(() => {
  for (const k of Object.keys(EMOTE_LOOKS)) if (k.startsWith('test')) delete EMOTE_LOOKS[k];
  vi.restoreAllMocks();
});

describe('emote looks', () => {
  it('has a look for every emote in the catalog, and a plain one for an id with none', () => {
    for (const e of EMOTES) expect(EMOTE_LOOKS[e.id], e.id).toBeTypeOf('function');
    // An emote added to the catalog before its look plays the plain bob, which is only body motion.
    const plain = emoteLook('nope');
    expect(emoteLook('toString')).toBe(plain);
    const play = plain({ look: defaultLook(), top: 1.9, reach: 0.3, dark: 0, local: true });
    expect(play.group.children).toHaveLength(0);
    const pose = restPose();
    play.update(0.7, 0.016, pose);
    expect(pose.lift).toBeGreaterThan(0);
    expect({ ...pose, lift: 0 }).toEqual(restPose());
  });
});

describe('playing an emote on a character', () => {
  it('builds the look for the character, moves the body through its pose, and frees it when the emote has run its length', () => {
    const { char, effects, last } = fakeChar();
    const { seen, look } = spy();
    EMOTE_LOOKS.testhop = look;
    const p = new EmotePlayer(char);
    expect(p.playing).toBeNull();
    p.start(def('testhop', 1), 0.8, true);
    expect(seen.ctx).toEqual({ look: char.look, top: 2.3, reach: 0.6, dark: 0.8, local: true });
    expect(p.playing?.id).toBe('testhop');
    expect(effects.children).toEqual([seen.group]);
    // The first frame is drawn at once, at t = 0.
    expect(seen.ts).toEqual([0]);
    expect(last()).toMatchObject({ lift: 1, roll: 0.5, squash: 1 });
    expect(p.update(0.4)).toBe(true);
    expect(p.update(0.4)).toBe(true);
    expect(seen.ts).toEqual([0, 0.4, 0.8]);
    expect(p.t).toBeCloseTo(0.8);
    // Past its length it is over: the look is freed and taken off the character.
    expect(p.update(0.4)).toBe(false);
    expect(p.playing).toBeNull();
    expect(seen.disposed).toBe(1);
    expect(effects.children).toHaveLength(0);
    expect(seen.ts).toHaveLength(3);
  });

  it('tells how high the look reaches over the head, for a name tag to clear, and nothing once it is over', () => {
    const { char } = fakeChar();
    EMOTE_LOOKS.testover = () => {
      const play = { group: new THREE.Group(), over: 0, update: (t: number) => void (play.over = 2 + t), dispose() {} };
      return play;
    };
    const p = new EmotePlayer(char);
    expect(p.over).toBe(0);
    p.start(def('testover', 1), 0, false);
    p.update(0.5);
    expect(p.over).toBeCloseTo(2.5);
    p.update(1);
    expect(p.over).toBe(0);
  });

  it("draws a look's see-through parts after the water, unless the look set their order itself", () => {
    const { char } = fakeChar();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    const solid = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const glass = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ transparent: true }));
    const own = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    own.renderOrder = 12;
    // A look's own order among its see-through parts is kept: a pool of light under a glow.
    const pool = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    pool.renderOrder = 1;
    const dots = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    dots.renderOrder = 2;
    EMOTE_LOOKS.testglow = () => {
      const group = new THREE.Group();
      const inner = new THREE.Group();
      inner.add(glow);
      group.add(inner, solid, glass, own, pool, dots);
      return { group, update() {}, dispose() {} };
    };
    new EmotePlayer(char).start(def('testglow', 1), 0, false);
    expect([glow.renderOrder, pool.renderOrder, dots.renderOrder]).toEqual([WATER_ORDER + 1, WATER_ORDER + 2, WATER_ORDER + 3]);
    // Solid parts and ones that write depth are in front of the water anyway.
    expect([solid.renderOrder, glass.renderOrder, own.renderOrder]).toEqual([0, 0, 12]);
  });

  it('hands the look a pose at rest every frame', () => {
    const { char } = fakeChar();
    const got: EmotePose[] = [];
    EMOTE_LOOKS.testrest = () => ({ group: new THREE.Group(), update: (_t, _dt, pose) => { got.push({ ...pose }); pose.yaw = 2; pose.squash = 0.5; }, dispose() {} });
    const p = new EmotePlayer(char);
    p.start(def('testrest', 1), 0, false);
    p.update(0.1);
    p.update(0.1);
    expect(got).toEqual([restPose(), restPose(), restPose()]);
  });

  it('eases the body back to rest after an emote ends, from wherever the pose left it', () => {
    const { char, poses, last } = fakeChar();
    EMOTE_LOOKS.testhop = spy().look;
    const p = new EmotePlayer(char);
    p.start(def('testhop', 5), 0, false);
    p.update(0.1);
    p.stop();
    expect(p.playing).toBeNull();
    p.update(0.05);
    const mid = last()!;
    expect(mid.lift).toBeGreaterThan(0);
    expect(mid.lift).toBeLessThan(1);
    expect(mid.squash).toBe(1);
    p.update(0.5);
    expect(last()).toBeNull();
    // At rest it stops touching the character.
    const n = poses.length;
    p.update(0.5);
    expect(poses).toHaveLength(n);
  });

  it('starts over when another emote starts, freeing the first', () => {
    const { char, effects } = fakeChar();
    const a = spy();
    const b = spy();
    EMOTE_LOOKS.testa = a.look;
    EMOTE_LOOKS.testb = b.look;
    const p = new EmotePlayer(char);
    p.start(def('testa', 5), 0, false);
    p.update(1);
    p.start(def('testb', 5), 0, false);
    expect(a.seen.disposed).toBe(1);
    expect(p.playing?.id).toBe('testb');
    expect(p.t).toBe(0);
    expect(effects.children).toEqual([b.seen.group]);
  });

  it('stands the character at rest at once when it is cleared', () => {
    const { char, last, effects } = fakeChar();
    EMOTE_LOOKS.testhop = spy().look;
    const p = new EmotePlayer(char);
    p.start(def('testhop', 5), 0, false);
    p.update(0.1);
    p.clear();
    expect(last()).toBeNull();
    expect(effects.children).toHaveLength(0);
    expect(p.update(0.1)).toBe(false);
  });

  it('survives a look that throws: when it is built, while it plays, or when it is freed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { char, effects, last } = fakeChar();
    const p = new EmotePlayer(char);
    EMOTE_LOOKS.testbuild = () => { throw new Error('no build'); };
    p.start(def('testbuild', 1), 0, false);
    expect(p.playing).toBeNull();
    expect(p.update(0.1)).toBe(false);
    let n = 0;
    EMOTE_LOOKS.testplay = () => ({ group: new THREE.Group(), update: () => { if (n++ > 0) throw new Error('no play'); }, dispose: () => { throw new Error('no dispose'); } });
    p.start(def('testplay', 1), 0, false);
    expect(p.playing?.id).toBe('testplay');
    expect(p.update(0.1)).toBe(false);
    expect(effects.children).toHaveLength(0);
    p.update(1);
    expect(last()).toBeNull();
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('plays an emote for the length its catalog entry gives, whatever its look', () => {
    // Every catalog emote's own look needs a canvas (looks.test.ts plays them with one stood in); the length is the
    // catalog's either way, so a plain one stands in for them here.
    for (const e of EMOTES) {
      const { char } = fakeChar();
      const p = new EmotePlayer(char);
      p.start({ ...e, id: 'nope' }, 0, false);
      let secs = 0;
      while (p.update(0.25)) secs += 0.25;
      expect(secs).toBeCloseTo(Math.ceil(e.seconds / 0.25) * 0.25 - 0.25);
    }
  });

});

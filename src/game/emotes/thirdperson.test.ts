import { describe, expect, it } from 'vitest';
import { CAM, ThirdPerson, clearDist, type CamEnv } from './thirdperson';

const OPEN: CamEnv = { blocked: () => false, floor: () => 0, ceiling: Infinity };
const EYE = { x: 0, y: 1.7, z: 0 };
/** Runs the camera for `secs` at 60 frames a second and returns the last view. */
const run = (tp: ThirdPerson, secs: number, env: CamEnv = OPEN, yaw = 0, pitch = 0, eye = EYE) => {
  let v = tp.update(0, eye, yaw, pitch, env);
  for (let i = 0; i < Math.round(secs * 60); i++) v = tp.update(1 / 60, eye, yaw, pitch, env);
  return v;
};

describe('third-person camera', () => {
  it('is the plain first-person view until an emote starts', () => {
    const tp = new ThirdPerson();
    expect(tp.active).toBe(false);
    expect(tp.update(0.016, EYE, 0, 0, OPEN)).toBeNull();
    expect(tp.showsBody).toBe(false);
  });

  it('pulls back behind and above the player, looking the way they faced', () => {
    const tp = new ThirdPerson();
    tp.start('behind', 2.5);
    const first = tp.update(0, EYE, 0, -0.1, OPEN)!;
    // It starts from the eyes, along the view.
    expect(first).toMatchObject({ x: 0, z: 0, yaw: 0 });
    expect(first.y).toBeCloseTo(1.7);
    expect(first.pitch).toBeCloseTo(-0.1);
    const v = run(tp, 1, OPEN, 0, -0.1)!;
    // Yaw 0 looks along -z, so behind is +z.
    expect(v.x).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(CAM.behind.dist * Math.cos(CAM.behind.pitch));
    expect(v.y).toBeCloseTo(1.7 + CAM.behind.rise - CAM.behind.dist * Math.sin(CAM.behind.pitch));
    expect(v.y).toBeGreaterThan(1.7);
    expect(v.yaw).toBeCloseTo(0);
    expect(v.pitch).toBeCloseTo(CAM.behind.pitch);
    expect(tp.dist).toBeCloseTo(CAM.behind.dist);
    expect(tp.showsBody).toBe(true);
    // Facing +x (yaw -90°), behind is -x.
    const side = new ThirdPerson();
    side.start('behind', 2.5);
    const s = run(side, 1, OPEN, -Math.PI / 2)!;
    expect(s.x).toBeLessThan(-3);
    expect(s.z).toBeCloseTo(0);
  });

  it("shows the player's own model only once the camera is clear of it", () => {
    const tp = new ThirdPerson();
    tp.start('behind', 2.5);
    tp.update(0, EYE, 0, 0, OPEN);
    tp.update(0.05, EYE, 0, 0, OPEN);
    expect(tp.dist).toBeGreaterThan(0);
    expect(tp.dist).toBeLessThan(CAM.showAt);
    expect(tp.showsBody).toBe(false);
    run(tp, 0.5);
    expect(tp.showsBody).toBe(true);
  });

  it('eases home to first person when the emote ends, and then lets go of the view', () => {
    const tp = new ThirdPerson();
    tp.start('behind', 2.5);
    run(tp, 1);
    tp.end();
    expect(tp.framing).toBe(false);
    expect(tp.active).toBe(true);
    const mid = tp.update(CAM.easeOut / 2, EYE, 0, -0.1, OPEN)!;
    expect(tp.dist).toBeGreaterThan(0);
    expect(tp.dist).toBeLessThan(CAM.behind.dist);
    expect(mid.pitch).toBeLessThan(-0.1);
    expect(mid.pitch).toBeGreaterThan(CAM.behind.pitch);
    expect(run(tp, CAM.easeOut)).toBeNull();
    expect(tp.active).toBe(false);
    expect(tp.dist).toBe(0);
    expect(tp.showsBody).toBe(false);
  });

  it('circles the player once over a cinematic emote, and ends behind them again', () => {
    const tp = new ThirdPerson();
    tp.start('cinematic', 8);
    const quarter = run(tp, 2)!;
    // A quarter of the way round: beside the player, looking across at them.
    expect(quarter.yaw).toBeCloseTo(Math.PI / 2, 1);
    expect(quarter.x).toBeGreaterThan(4);
    expect(Math.abs(quarter.z)).toBeLessThan(0.3);
    expect(tp.dist).toBeCloseTo(CAM.cinematic.dist);
    const half = run(tp, 2)!;
    expect(half.z).toBeLessThan(-4);
    const full = run(tp, 4.1)!;
    expect(full.yaw).toBeCloseTo(Math.PI * 2 * CAM.turns);
    expect(full.z).toBeGreaterThan(4);
    // Home from a full circle is straight in: no swing round on the way.
    tp.end();
    const back = tp.update(CAM.easeOut / 2, EYE, 0, 0, OPEN)!;
    expect(Math.abs(Math.sin(back.yaw))).toBeLessThan(1e-6);
    expect(Math.abs(back.x)).toBeLessThan(1e-6);
  });

  it("stands as far back as the emote asks (a tall scene's camera distance), and stops short of a wall the same way", () => {
    const far = new ThirdPerson();
    far.start('cinematic', 10.5, 6.5);
    const half = run(far, 5.25)!;
    expect(far.dist).toBeCloseTo(6.5);
    expect(Math.hypot(half.x, half.z)).toBeCloseTo(6.5 * Math.cos(CAM.cinematic.pitch), 1);
    // The same tilt and aim as the usual circle, only further back.
    expect(half.pitch).toBeCloseTo(CAM.cinematic.pitch);
    expect(half.y).toBeCloseTo(1.7 + CAM.cinematic.rise - 6.5 * Math.sin(CAM.cinematic.pitch), 1);
    // A wall 3 m behind holds it in as it would the usual camera.
    const walled = new ThirdPerson();
    walled.start('cinematic', 10.5, 6.5);
    run(walled, 0.6, { ...OPEN, blocked: (_x, z) => z > 3 });
    expect(walled.dist).toBeLessThanOrEqual(3 / Math.cos(CAM.cinematic.pitch) + 1e-6);
    // The next emote without a distance of its own goes back to the usual one.
    far.start('cinematic', 8);
    run(far, 2);
    expect(far.dist).toBeCloseTo(CAM.cinematic.dist);
    far.start('behind', 2.5);
    run(far, 1);
    expect(far.dist).toBeCloseTo(CAM.behind.dist);
  });

  it('comes home the short way when a cinematic emote is cut short', () => {
    const tp = new ThirdPerson();
    tp.start('cinematic', 8);
    // Three quarters round: a quarter turn from home the short way.
    run(tp, 6);
    tp.end();
    let v = tp.update(1 / 60, EYE, 0, 0, OPEN)!;
    const from = Math.atan2(Math.sin(v.yaw), Math.cos(v.yaw));
    expect(from).toBeCloseTo(-Math.PI / 2, 1);
    let widest = 0;
    while (tp.active) {
      const next = tp.update(1 / 60, EYE, 0, 0, OPEN);
      if (!next) break;
      v = next;
      widest = Math.max(widest, Math.abs(v.yaw));
    }
    expect(widest).toBeLessThanOrEqual(Math.PI / 2 + 0.01);
    expect(Math.abs(v.yaw)).toBeLessThan(0.05);
  });

  it('turns round the player with a drag while the emote plays, within its tilt limits, and not after', () => {
    const tp = new ThirdPerson();
    tp.drag(1, 1);
    expect(tp.active).toBe(false);
    tp.start('behind', 2.5);
    run(tp, 1);
    // A drag to the right turns the view right (yaw goes down), as in first person.
    tp.drag(0.5, 0);
    const v = tp.update(1 / 60, EYE, 0, 0, OPEN)!;
    expect(v.yaw).toBeCloseTo(-0.5);
    expect(v.x).toBeLessThan(0);
    // Dragging down tilts it up to nearly overhead; dragging up stops just under level.
    tp.drag(0, 50);
    expect(tp.update(1 / 60, EYE, 0, 0, OPEN)!.pitch).toBeCloseTo(CAM.pitchMin);
    tp.drag(0, -50);
    expect(tp.update(1 / 60, EYE, 0, 0, OPEN)!.pitch).toBeCloseTo(CAM.pitchMax);
    tp.end();
    tp.drag(3, 0);
    const after = tp.update(1 / 60, EYE, 0, 0, OPEN)!;
    expect(Math.abs(after.yaw)).toBeLessThanOrEqual(0.5);
  });

  it('stops short of a wall behind the player, and moves back out once it is clear', () => {
    // A wall across z > 2.
    const wall: CamEnv = { ...OPEN, blocked: (_x, z) => z > 2 };
    expect(clearDist(0, 0, 0, 1, 3.6, wall.blocked)).toBeLessThanOrEqual(2);
    expect(clearDist(0, 0, 0, 1, 3.6, wall.blocked)).toBeGreaterThan(1.5);
    expect(clearDist(0, 0, 0, 1, 3.6, OPEN.blocked)).toBe(3.6);
    // Right against it there is no room at all.
    expect(clearDist(0, 0, 0, 1, 3.6, () => true)).toBe(0);
    const tp = new ThirdPerson();
    tp.start('behind', 60);
    const v = run(tp, 1, wall)!;
    expect(v.z).toBeLessThanOrEqual(2);
    expect(v.z).toBeGreaterThan(1.4);
    // Too close to show the model? Then the camera stays inside the head and the model stays hidden.
    const tight = new ThirdPerson();
    tight.start('behind', 60);
    run(tight, 1, { ...OPEN, blocked: (_x, z) => z > 0.5 });
    expect(tight.showsBody).toBe(false);
    // The wall gone, it eases out to its full distance instead of snapping.
    const next = tp.update(1 / 60, EYE, 0, 0, OPEN)!;
    expect(next.z).toBeLessThan(2.5);
    expect(run(tp, 2)!.z).toBeCloseTo(CAM.behind.dist * Math.cos(CAM.behind.pitch), 1);
  });

  it('stays above the ground and the water, and under a ceiling, still looking at the player', () => {
    // A bank rising behind the player: 1 m up per metre back.
    const hill: CamEnv = { ...OPEN, floor: (_x, z) => Math.max(0, z) * 1.2 };
    const tp = new ThirdPerson();
    tp.start('behind', 60);
    const v = run(tp, 1, hill)!;
    expect(v.y).toBeGreaterThanOrEqual(hill.floor(v.x, v.z) + CAM.clear - 1e-9);
    // Lifted, it tilts down further to keep the player in view.
    expect(v.pitch).toBeLessThan(CAM.behind.pitch);
    // A low ceiling: the camera is held under it and looks up less steeply than it would from above.
    const low: CamEnv = { ...OPEN, ceiling: 2.6 };
    const under = new ThirdPerson();
    under.start('behind', 60);
    const u = run(under, 1, low)!;
    expect(u.y).toBeCloseTo(2.6 - CAM.headroom);
    expect(u.pitch).toBeGreaterThan(CAM.behind.pitch);
    // A swell higher than the camera would be lifts it too.
    const swell: CamEnv = { ...OPEN, floor: () => 4 };
    const wet = new ThirdPerson();
    wet.start('cinematic', 60);
    expect(run(wet, 1, swell)!.y).toBeCloseTo(4 + CAM.clear);
  });

  it('goes straight back to first person when the player is moved', () => {
    const tp = new ThirdPerson();
    tp.start('cinematic', 8);
    run(tp, 1);
    tp.reset();
    expect(tp.active).toBe(false);
    expect(tp.dist).toBe(0);
    expect(tp.update(1 / 60, EYE, 0, 0, OPEN)).toBeNull();
  });

  it('goes back out from where it is when the next emote starts before it is home', () => {
    const tp = new ThirdPerson();
    tp.start('behind', 2.5);
    run(tp, 1);
    tp.drag(0.4, 0);
    tp.end();
    tp.update(CAM.easeOut / 2, EYE, 0, 0, OPEN);
    const before = tp.update(1 / 600, EYE, 0, 0, OPEN)!;
    tp.start('behind', 2.5);
    const after = tp.update(1 / 600, EYE, 0, 0, OPEN)!;
    expect(after.yaw).toBeCloseTo(before.yaw, 2);
    expect(after.z).toBeCloseTo(before.z, 1);
    expect(run(tp, 1)!.z).toBeGreaterThan(3);
  });
});

/**
 * A seated body's height against a standing one's: it sinks into a squat (and widens to keep its volume, `applyPose`).
 */
export const SIT_SQUASH = 0.8;
/** The lowest point of a standing body over its feet (the capsule's round end, character.ts). */
const BODY_FOOT = 0.22;
/** How far the body's round end settles into a seat, so it rests on it and doesn't balance on a point. Play-test. */
const SIT_SINK = 0.03;
/** How high a seated body is lifted so that it rests on a seat whose top is `top` m over where it stood. */
export const sitLift = (top: number): number => Math.max(0, top - BODY_FOOT * SIT_SQUASH - SIT_SINK);
/** The lift on a seat of unknown height: a seat wall's or a log's, near enough. */
export const SIT_LIFT = sitLift(0.44);

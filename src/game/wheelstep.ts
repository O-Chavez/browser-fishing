/** Pixel delta at or above which one wheel event is a mouse notch rather than a trackpad sample. */
const NOTCH_PX = 50;
/** Trackpad travel needed to start a step. */
const SWIPE_PX = 30;
/** Quiet time that ends a trackpad gesture (and its momentum tail). */
const GESTURE_GAP_MS = 150;

/**
 * Turns wheel events into hotbar steps: each mouse notch moves one slot, and each trackpad
 * swipe moves one slot however long its momentum keeps sending events.
 */
export class WheelStepper {
  private acc = 0;
  private last = -Infinity;
  private swiping = false;
  /** A notch landed this burst: smaller samples after it are a trackpad's tail, not a new swipe. */
  private notched = false;

  /** Returns -1, 0 or 1. `deltaMode` is the WheelEvent's (0 = pixels, 1 = lines, 2 = pages). */
  step(deltaY: number, deltaMode: number, now: number): number {
    const gap = now - this.last;
    this.last = now;
    if (gap > GESTURE_GAP_MS) {
      this.acc = 0;
      this.swiping = false;
      this.notched = false;
    }
    if (this.swiping || deltaY === 0) return 0;
    if (deltaMode !== 0 || Math.abs(deltaY) >= NOTCH_PX) {
      this.notched = true;
      return Math.sign(deltaY);
    }
    if (this.notched) return 0;
    this.acc += deltaY;
    if (Math.abs(this.acc) < SWIPE_PX) return 0;
    this.swiping = true;
    return Math.sign(this.acc);
  }
}

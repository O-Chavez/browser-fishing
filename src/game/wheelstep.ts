/** Pixel delta at or above which one wheel event is a mouse notch rather than a trackpad sample. */
const NOTCH_PX = 50;
/** Trackpad travel needed to start a step. */
const SWIPE_PX = 30;
/** Quiet time that ends a trackpad gesture (and its momentum tail). */
const GESTURE_GAP_MS = 150;

/**
 * A mouse notch rather than a trackpad sample, by the legacy `wheelDeltaY` Chrome and Safari still
 * send: a multiple of 120 per notch, but -3 × deltaY from a trackpad (rounded to a whole number, so
 * it's compared loosely). This catches Chrome on macOS, where a slow notch is only about 4 px.
 */
const legacyNotch = (deltaY: number, wheelDeltaY: number | undefined): boolean =>
  !!wheelDeltaY && wheelDeltaY % 120 === 0 && Math.abs(wheelDeltaY + 3 * deltaY) > 1;

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
  /** Direction of the current trackpad swipe. */
  private dir = 0;

  /**
   * Returns -1, 0 or 1. `deltaMode` is the WheelEvent's (0 = pixels, 1 = lines, 2 = pages);
   * `wheelDeltaY` is its legacy field, where the browser has one.
   */
  step(deltaY: number, deltaMode: number, now: number, wheelDeltaY?: number): number {
    const gap = now - this.last;
    this.last = now;
    if (deltaY === 0) return 0;
    // Momentum never reverses, so a swipe the other way is a new gesture even mid-tail.
    if (gap > GESTURE_GAP_MS || (this.swiping && Math.sign(deltaY) !== this.dir)) {
      this.acc = 0;
      this.swiping = false;
      this.notched = false;
    }
    if (deltaMode !== 0 || Math.abs(deltaY) >= NOTCH_PX || legacyNotch(deltaY, wheelDeltaY)) {
      this.notched = true;
      this.swiping = false;
      return Math.sign(deltaY);
    }
    if (this.swiping || this.notched) return 0;
    this.acc += deltaY;
    if (Math.abs(this.acc) < SWIPE_PX) return 0;
    this.swiping = true;
    this.dir = Math.sign(this.acc);
    return this.dir;
  }
}

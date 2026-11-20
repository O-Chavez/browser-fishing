/** Phones and tablets: a coarse pointer and nothing that can hover (no mouse). */
export const touchOnly = typeof matchMedia === 'function' && matchMedia('(pointer: coarse) and (hover: none)').matches;

/**
 * The touch layout's width in CSS pixels: the desktop HUD laid out this wide and scaled to the screen. 1400 puts an
 * 844-wide phone at about 0.6x; smaller phones get a narrower layout so they stay near 0.6x instead of shrinking
 * every label further (an iPhone SE would be 0.48x at 1400), down to 1000. Tablets keep 1400 and show it larger.
 */
export function touchLayoutWidth(w: number, h: number): number {
  const long = Math.max(w, h);
  if (!long) return 1400;
  return Math.round(Math.min(1400, Math.max(1000, long / 0.6)));
}

/**
 * Font size of a text field in the touch layout, in its CSS pixels, so the field is at least 17 real pixels on the
 * screen: under 16, Safari on an iPhone zooms the page into a field when it's tapped and leaves it zoomed (and
 * scrolled, the top cut off) afterwards. The layout's scale comes from the width Safari shows it in, which on a phone
 * with a notch (a screen more than twice as long as it is tall) is the long side less about 62 points each end, so
 * the layout is nearer 0.53x than 0.6x there. Never under 28, the size tablets and wide screens get.
 */
export function touchFieldPx(w: number, h: number): number {
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  if (!long) return 28;
  const shown = long / short > 2 ? long - 124 : long;
  return Math.max(28, Math.ceil((17 * touchLayoutWidth(w, h)) / shown));
}

/**
 * Whether a touch on this part of the on-screen controls keeps the browser's own handling. Only the top buttons (💬,
 * 🎒) do: they act on the click, which a cancelled touch never sends, and iOS opens the keyboard only from a click.
 */
export function keepsNativeTouch(target: EventTarget | null): boolean {
  return !!(target as Partial<Element> | null)?.closest?.('.t-top');
}

/** What the on-screen controls ask the game to do. */
export interface TouchHandlers {
  /** Stick position: x strafes right, y walks forward, both -1..1; sprint when pushed past the rim. */
  move(x: number, y: number, sprint: boolean): void;
  /** Camera drag in CSS pixels. */
  look(dx: number, dy: number): void;
  /** A short tap on the open view (not a drag), in client coordinates. */
  tap(x: number, y: number): void;
  press(): void;
  release(): void;
  jump(): void;
  /**
   * The 👋 button, for the emote wheel: a finger went down on it, dragged to (dx, dy) from where it went down, and
   * came up `ms` later (`emoteUp`), or the touch was taken away (`emoteCancel`).
   */
  emoteDown(): void;
  emoteDrag(dx: number, dy: number): void;
  emoteUp(ms: number, dx: number, dy: number): void;
  emoteCancel(): void;
  bag(): void;
  chat(): void;
}

export type ActionTone = 'gold' | 'hook' | 'danger' | 'quiet';

/** Stick travel in CSS pixels (of the touch layout, `touchLayoutWidth`); the knob stops at the rim, pushing past it sprints. */
const STICK_R = 80;
const SPRINT_AT = 1.25;
/** Taps shorter and stiller than this count as taps, not drags. */
const TAP_MS = 300;
const TAP_PX = 10;

/**
 * On-screen controls for touch-only devices: a floating move stick on the left, drag anywhere
 * else to look, and big buttons for the action (cast/hook/reel), jump, emotes, bag and chat.
 */
export class TouchControls {
  readonly root = document.createElement('div');
  private stick = document.createElement('div');
  private knob = document.createElement('div');
  private action = document.createElement('button');
  private stickId = -1;
  private stickX = 0;
  private stickY = 0;
  private stickT = 0;
  private stickMoved = 0;
  private looks = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private actionKey = '';

  constructor(private h: TouchHandlers) {
    this.root.id = 'touch';
    this.root.className = 'hidden';
    this.root.innerHTML = `
      <div class="t-view"></div>
      <div class="t-top"><button class="t-btn" data-t="chat" aria-label="Chat">💬<span class="t-badge" hidden></span></button><button class="t-btn" data-t="bag" aria-label="Bag">🎒</button></div>
      <button class="t-jump" aria-label="Jump">JUMP</button>
      <button class="t-emote" aria-label="Emotes">👋</button>`;
    this.stick.className = 't-stick';
    this.knob.className = 't-knob';
    this.stick.append(this.knob);
    this.action.className = 't-action';
    this.action.setAttribute('aria-label', 'Action');
    this.root.append(this.stick, this.action);
    document.body.append(this.root);

    const view = this.root.querySelector<HTMLElement>('.t-view')!;
    view.addEventListener('pointerdown', (e) => this.viewDown(e, view));
    view.addEventListener('pointermove', (e) => this.viewMove(e));
    view.addEventListener('pointerup', (e) => this.viewUp(e, true));
    view.addEventListener('pointercancel', (e) => this.viewUp(e, false));

    this.action.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.action.setPointerCapture(e.pointerId);
      this.action.classList.add('down');
      this.h.press();
    });
    const up = () => {
      this.action.classList.remove('down');
      this.h.release();
    };
    this.action.addEventListener('pointerup', up);
    this.action.addEventListener('pointercancel', up);
    this.root.querySelector('.t-jump')!.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.h.jump();
    });
    // The 👋 button is held like F: the finger's drag from where it went down picks from the wheel, and letting go
    // plays the pick. `Game` tells a quick tap from a hold (`touchRelease`).
    const emote = this.root.querySelector<HTMLElement>('.t-emote')!;
    let held: { id: number; x: number; y: number; t: number } | null = null;
    emote.addEventListener('pointerdown', (e) => {
      if (held) return;
      e.preventDefault();
      emote.setPointerCapture(e.pointerId);
      held = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp };
      emote.classList.add('down');
      this.h.emoteDown();
    });
    emote.addEventListener('pointermove', (e) => {
      if (held?.id === e.pointerId) this.h.emoteDrag(e.clientX - held.x, e.clientY - held.y);
    });
    const emoteEnd = (e: PointerEvent, ended: boolean): void => {
      if (held?.id !== e.pointerId) return;
      const h = held;
      held = null;
      emote.classList.remove('down');
      if (ended) this.h.emoteUp(e.timeStamp - h.t, e.clientX - h.x, e.clientY - h.y);
      else this.h.emoteCancel();
    };
    emote.addEventListener('pointerup', (e) => emoteEnd(e, true));
    emote.addEventListener('pointercancel', (e) => emoteEnd(e, false));
    // Click (not pointerdown) so iOS counts it as a user gesture and opens the keyboard for chat.
    this.root.querySelector('.t-top')!.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-t]')?.dataset.t;
      if (t === 'bag') this.h.bag();
      else if (t === 'chat') this.h.chat();
    });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    // iPhones read quick taps on one spot (reeling in bursts) as their own gestures: two taps zoom the page in on the
    // button, and a second tap held brings up the text magnifier. `touch-action` and `user-select` (body.touch) don't
    // stop either on every iOS version, and `preventDefault` on a pointer event never does; cancelling the touch
    // events does. The controls work on pointer events, which still fire.
    for (const ev of ['touchstart', 'touchend'] as const) {
      this.root.addEventListener(ev, (e) => {
        if (e.cancelable && !keepsNativeTouch(e.target)) e.preventDefault();
      }, { passive: false });
    }
  }

  setVisible(on: boolean): void {
    if (this.root.classList.contains('hidden') !== on) return;
    this.root.classList.toggle('hidden', !on);
    if (!on) this.reset();
  }

  /** Unread chat badge on the 💬 button; empty hides it. */
  setUnread(label: string): void {
    const b = this.root.querySelector<HTMLElement>('.t-badge')!;
    b.textContent = label;
    b.hidden = !label;
    this.root.querySelector('[data-t="chat"]')!.setAttribute('aria-label', label ? `Chat, ${label} unread` : 'Chat');
  }

  /** Relabels the action button; cheap to call every frame. */
  setAction(icon: string, label: string, tone: ActionTone): void {
    const key = `${icon}|${label}|${tone}`;
    if (key === this.actionKey) return;
    this.actionKey = key;
    this.action.className = `t-action ${tone}${this.action.classList.contains('down') ? ' down' : ''}`;
    this.action.innerHTML = `<span class="ic">${icon}</span><span class="lb">${label}</span>`;
  }

  /** Lets go of every finger, e.g. when a menu opens over the controls. */
  private reset(): void {
    this.stickId = -1;
    this.stick.classList.remove('on');
    this.looks.clear();
    this.action.classList.remove('down');
    this.h.move(0, 0, false);
  }

  private viewDown(e: PointerEvent, view: HTMLElement): void {
    e.preventDefault();
    view.setPointerCapture(e.pointerId);
    // The left 40% of the screen moves; everywhere else looks.
    if (this.stickId < 0 && e.clientX < innerWidth * 0.4) {
      this.stickId = e.pointerId;
      this.stickX = e.clientX;
      this.stickY = e.clientY;
      this.stickT = e.timeStamp;
      this.stickMoved = 0;
      this.stick.style.left = `${e.clientX}px`;
      this.stick.style.top = `${e.clientY}px`;
      this.knob.style.transform = '';
      this.stick.classList.add('on');
      return;
    }
    this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: e.timeStamp });
  }

  private viewMove(e: PointerEvent): void {
    if (e.pointerId === this.stickId) {
      const dx = e.clientX - this.stickX;
      const dy = e.clientY - this.stickY;
      const d = Math.hypot(dx, dy);
      this.stickMoved = Math.max(this.stickMoved, d);
      const k = d > STICK_R ? STICK_R / d : 1;
      this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      this.h.move((dx * k) / STICK_R, (-dy * k) / STICK_R, d > STICK_R * SPRINT_AT);
      return;
    }
    const l = this.looks.get(e.pointerId);
    if (!l) return;
    this.h.look(e.clientX - l.x, e.clientY - l.y);
    l.x = e.clientX;
    l.y = e.clientY;
  }

  private viewUp(e: PointerEvent, ended: boolean): void {
    if (e.pointerId === this.stickId) {
      this.stickId = -1;
      this.stick.classList.remove('on');
      this.h.move(0, 0, false);
      // A quick, still touch on the left is a tap too (e.g. a casino bet spot on that side).
      if (ended && e.timeStamp - this.stickT < TAP_MS && this.stickMoved < TAP_PX) this.h.tap(e.clientX, e.clientY);
      return;
    }
    const l = this.looks.get(e.pointerId);
    if (!l) return;
    this.looks.delete(e.pointerId);
    if (ended && e.timeStamp - l.t < TAP_MS && Math.hypot(e.clientX - l.sx, e.clientY - l.sy) < TAP_PX) this.h.tap(e.clientX, e.clientY);
  }
}

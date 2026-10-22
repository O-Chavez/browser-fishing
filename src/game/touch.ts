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
  bag(): void;
  chat(): void;
}

export type ActionTone = 'gold' | 'hook' | 'danger' | 'quiet';

/** Stick travel in CSS pixels (of the 1400px-wide touch layout); the knob stops at the rim, pushing past it sprints. */
const STICK_R = 80;
const SPRINT_AT = 1.25;
/** Taps shorter and stiller than this count as taps, not drags. */
const TAP_MS = 300;
const TAP_PX = 10;

/**
 * On-screen controls for touch-only devices: a floating move stick on the left, drag anywhere
 * else to look, and big buttons for the action (cast/hook/reel), jump, bag and chat.
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
      <div class="t-top"><button class="t-btn" data-t="chat" aria-label="Chat">💬</button><button class="t-btn" data-t="bag" aria-label="Bag">🎒</button></div>
      <button class="t-jump" aria-label="Jump">JUMP</button>`;
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
    // Click (not pointerdown) so iOS counts it as a user gesture and opens the keyboard for chat.
    this.root.querySelector('.t-top')!.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-t]')?.dataset.t;
      if (t === 'bag') this.h.bag();
      else if (t === 'chat') this.h.chat();
    });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setVisible(on: boolean): void {
    if (this.root.classList.contains('hidden') !== on) return;
    this.root.classList.toggle('hidden', !on);
    if (!on) this.reset();
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

/** Frames-per-second readout for testing on devices; tapping it toggles the lighter graphics mode. */
export class FpsMeter {
  private el = document.createElement('button');
  private frames = 0;
  private since = 0;
  private lite = false;

  constructor(onToggle: (lite: boolean) => void) {
    this.el.id = 'fps';
    this.el.addEventListener('click', () => {
      this.lite = !this.lite;
      onToggle(this.lite);
      this.since = 0;
    });
    document.body.append(this.el);
  }

  frame(now: number): void {
    this.frames++;
    if (!this.since) {
      this.since = now;
      this.frames = 0;
      return;
    }
    if (now - this.since < 500) return;
    const fps = Math.round((this.frames * 1000) / (now - this.since));
    this.el.textContent = `${fps} fps · ${this.lite ? 'lite' : 'full'} (tap to switch)`;
    this.frames = 0;
    this.since = now;
  }
}

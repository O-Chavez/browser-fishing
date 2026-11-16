import { WHEEL, slotDir, wheelMove, wheelPick, type WheelSlot } from './wheel';

/** A click on the wheel this soon after it turned into a tap menu is the tail of the tap that opened it, not a pick. */
const TAP_GUARD_MS = 350;

/**
 * The emote wheel on screen (`#emotewheel`, style.css). Held open (F, or a finger held on the touch 👋 button), a
 * pointer moves from the middle with the mouse or the finger's drag, the slot in that direction lights up, and letting
 * go plays it (the middle plays nothing). After a quick tap on the touch button it is a tap menu instead: a slot is
 * tapped, and a tap anywhere else closes it.
 */
export class EmoteWheel {
  private slots: WheelSlot[] = [];
  private at = { x: 0, y: 0 };
  private lit = -1;
  private taps = false;
  /** Held open by a finger, not F: the middle's hint says "drag". */
  private finger = false;
  private tapsAt = -Infinity;
  private mid: HTMLElement;
  private dot: HTMLElement;
  private ring: HTMLElement;

  /** `onTap` is a tapped slot (touch), or -1 for a tap anywhere else; `onLight` fires as the lit slot changes. */
  constructor(
    private root: HTMLElement,
    private onTap: (i: number) => void,
    private onLight: () => void = () => {},
  ) {
    root.innerHTML = '<div class="ew-ring"><div class="ew-mid"></div><div class="ew-dot"></div></div>';
    this.ring = root.querySelector<HTMLElement>('.ew-ring')!;
    this.mid = root.querySelector<HTMLElement>('.ew-mid')!;
    this.dot = root.querySelector<HTMLElement>('.ew-dot')!;
    root.addEventListener('click', (e) => {
      if (!this.taps || performance.now() - this.tapsAt < TAP_GUARD_MS) return;
      const el = (e.target as HTMLElement).closest<HTMLElement>('.ew-slot');
      this.onTap(el ? Number(el.dataset.i) : -1);
    });
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  /** The lit slot: what letting go would play. */
  get picked(): WheelSlot | null {
    return this.slots[this.lit] ?? null;
  }

  /** True while the wheel is a tap menu (touch, after a quick tap on the button). */
  get tapping(): boolean {
    return this.isOpen && this.taps;
  }

  /**
   * Shows the wheel with these slots, the pointer in the middle. `taps`: slots are tapped (touch). `finger`: it is held
   * open by a finger on the touch button.
   */
  open(slots: WheelSlot[], taps: boolean, finger = false): void {
    this.slots = slots;
    this.taps = taps;
    this.finger = finger;
    if (taps) this.tapsAt = performance.now();
    this.at = { x: 0, y: 0 };
    this.lit = -1;
    this.ring.querySelectorAll('.ew-slot').forEach((el) => el.remove());
    slots.forEach((s, i) => {
      const d = slotDir(i, slots.length);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `ew-slot${s.locked ? ' locked' : ''}`;
      el.dataset.i = String(i);
      el.style.setProperty('--sx', d.x.toFixed(4));
      el.style.setProperty('--sy', d.y.toFixed(4));
      el.setAttribute('aria-label', s.locked ? `${s.emote.name}, locked` : s.emote.name);
      el.innerHTML = `<span class="ic">${s.emote.icon}</span><span class="nm"></span>${s.locked ? '<span class="lk">🔒</span>' : ''}`;
      el.querySelector('.nm')!.textContent = s.emote.name;
      this.ring.append(el);
    });
    this.root.classList.toggle('taps', taps);
    this.root.classList.remove('hidden');
    this.draw();
  }

  close(): void {
    this.root.classList.add('hidden');
  }

  /** A wheel held open by a finger becomes a tap menu (the press was a quick tap): the pointer goes, the slots take taps. */
  toTaps(): void {
    if (!this.isOpen) return;
    this.taps = true;
    this.finger = false;
    this.tapsAt = performance.now();
    this.at = { x: 0, y: 0 };
    this.lit = -1;
    this.root.classList.add('taps');
    this.draw();
  }

  /** A mouse movement while the wheel is held open. */
  move(dx: number, dy: number): void {
    this.aim(this.at.x + dx, this.at.y + dy);
  }

  /** Puts the pointer (x, y) from the middle, kept within reach: a finger's drag from where it went down. */
  aim(x: number, y: number): void {
    if (!this.isOpen || this.taps) return;
    this.at = wheelMove({ x: 0, y: 0 }, x, y);
    const lit = wheelPick(this.at.x, this.at.y, this.slots.length);
    if (lit !== this.lit) {
      this.lit = lit;
      this.onLight();
    }
    this.draw();
  }

  private draw(): void {
    this.dot.style.transform = `translate(${this.at.x.toFixed(1)}px, ${this.at.y.toFixed(1)}px)`;
    this.dot.classList.toggle('out', Math.hypot(this.at.x, this.at.y) >= WHEEL.dead);
    this.ring.querySelectorAll<HTMLElement>('.ew-slot').forEach((el) => el.classList.toggle('on', Number(el.dataset.i) === this.lit));
    const s = this.picked;
    const title = s ? s.emote.name : 'Emotes';
    const sub = s ? (s.locked ? s.hint : 'Let go to play') : this.taps ? 'Tap one to play' : `${this.finger ? 'Drag' : 'Move'} to pick · let go here to close`;
    this.mid.classList.toggle('locked', !!s?.locked);
    this.mid.innerHTML = '<b></b><small></small>';
    this.mid.querySelector('b')!.textContent = title;
    this.mid.querySelector('small')!.textContent = sub;
  }
}

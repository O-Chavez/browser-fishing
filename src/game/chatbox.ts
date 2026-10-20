/** Lines leave the window this long after they arrive. */
export const CHAT_TTL_MS = 5 * 60_000;
/** Lines shown at once; older ones scroll away. */
const SHOWN = 8;
/** Matches the server's limit (`server/chat.ts`). */
const MAX_LEN = 120;

export interface ChatLine {
  name: string;
  /** Map id the speaker was on. */
  map: string;
  text: string;
  self: boolean;
  /** A server notice ("Ann has joined"): no speaker, shown in every world filter. */
  system?: boolean;
  at: number;
}

/** Lines still young enough to show. */
export const liveLines = (lines: ChatLine[], now: number): ChatLine[] => lines.filter((l) => now - l.at < CHAT_TTL_MS);

/** The newest lines for the window, optionally only those from one map. */
export const shownLines = (lines: ChatLine[], onlyMap: string | null): ChatLine[] =>
  lines.filter((l) => !onlyMap || l.system || l.map === onlyMap).slice(-SHOWN);

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * The global chat window in the top right: a short log, a "Press Enter to chat" hint, and an
 * input that takes over the keyboard while open. Tab in the input switches between all
 * messages and only those from the current world.
 */
export class ChatBox {
  private lines: ChatLine[] = [];
  private onlyHere = false;
  private log: HTMLElement;
  private input: HTMLInputElement;
  private hint: HTMLElement;
  private escapedAt = -Infinity;

  constructor(
    root: HTMLElement,
    private opts: {
      send: (text: string) => void;
      /** Current map id, for the world filter and tags. */
      map: () => string;
      mapName: (id: string) => string;
      now?: () => number;
    },
  ) {
    root.innerHTML = '<div class="chat-log"></div><input class="chat-input hidden" type="text" autocomplete="off" spellcheck="false"><div class="chat-hint"></div>';
    this.log = root.querySelector('.chat-log')!;
    this.input = root.querySelector('.chat-input')!;
    this.hint = root.querySelector('.chat-hint')!;
    this.input.maxLength = MAX_LEN;
    this.input.placeholder = 'Say something to everyone on the server…';
    this.input.addEventListener('keydown', (e) => {
      // The game listens on the document; keep typing from moving the player or switching slots.
      e.stopPropagation();
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        const text = this.input.value.trim();
        if (text) this.opts.send(text);
        this.close();
      } else if (e.code === 'Escape') {
        this.escapedAt = performance.now();
        this.close();
      }
      else if (e.code === 'Tab') {
        e.preventDefault();
        this.onlyHere = !this.onlyHere;
        this.render();
      }
    });
    this.input.addEventListener('keyup', (e) => e.stopPropagation());
    this.input.addEventListener('blur', () => this.close());
    setInterval(() => this.expire(), 5000);
    this.render();
  }

  get isOpen(): boolean {
    return !this.input.classList.contains('hidden');
  }

  /** Open, or just cancelled with Esc (some browsers deliver the key before releasing the mouse). */
  get active(): boolean {
    return this.isOpen || performance.now() - this.escapedAt < 500;
  }

  open(): void {
    this.input.value = '';
    this.input.classList.remove('hidden');
    this.input.focus();
    this.render();
  }

  close(): void {
    if (!this.isOpen) return;
    this.input.classList.add('hidden');
    this.input.blur();
    this.render();
  }

  add(line: Omit<ChatLine, 'at'>): void {
    this.lines.push({ ...line, at: this.now() });
    if (this.lines.length > 100) this.lines.shift();
    this.render();
  }

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  private expire(): void {
    const keep = liveLines(this.lines, this.now());
    if (keep.length === this.lines.length) return;
    this.lines = keep;
    this.render();
  }

  private render(): void {
    const here = this.opts.map();
    this.log.innerHTML = shownLines(this.lines, this.onlyHere ? here : null)
      .map((l) => {
        if (l.system) return `<div class="chat-line sys">${esc(l.text)}</div>`;
        const tag = !this.onlyHere && l.map !== here ? `<span class="chat-tag">${esc(this.opts.mapName(l.map))}</span> ` : '';
        return `<div class="chat-line${l.self ? ' self' : ''}">${tag}<b>${esc(l.name)}:</b> ${esc(l.text)}</div>`;
      })
      .join('');
    const scope = this.onlyHere ? esc(this.opts.mapName(here)) : 'All worlds';
    this.hint.innerHTML = this.isOpen
      ? `<b>Enter</b> send · <b>Esc</b> cancel · <b>Tab</b> showing: ${scope}`
      : `Press <b>Enter</b> to chat${this.onlyHere ? ` · ${scope}` : ''}`;
  }
}

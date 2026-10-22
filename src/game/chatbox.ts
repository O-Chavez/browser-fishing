/** Lines leave the window this long after they arrive. */
export const CHAT_TTL_MS = 5 * 60_000;
/** Lines shown at once; older ones scroll away. */
const SHOWN = 8;
/** Matches the server's limits (`server/chat.ts`, and `server/feedback.ts` for slash commands like /bug). */
const MAX_LEN = 120;
const CMD_MAX_LEN = 500;

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

/** Slash commands any player can use, in Tab order. Dev console commands stay unlisted. */
export const COMMANDS = [
  { cmd: 'bug', about: 'report a problem' },
  { cmd: 'idea', about: 'suggest something' },
  { cmd: 'feedback', about: 'anything else' },
] as const;
type Command = (typeof COMMANDS)[number];

/** While a command name is being typed ("/", "/b"), the commands it could be; otherwise null. */
export const commandMatches = (text: string): Command[] | null => {
  const m = /^\/(\w*)$/.exec(text);
  return m ? COMMANDS.filter((c) => c.cmd.startsWith(m[1].toLowerCase())) : null;
};

/** The command whose text is being typed ("/bug my fish…"). */
export const typedCommand = (text: string): Command | undefined => {
  const m = /^\/(\w+)\s/.exec(text);
  return m ? COMMANDS.find((c) => c.cmd === m[1].toLowerCase()) : undefined;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * The global chat window in the top right: a short log, a "Press Enter to chat" hint, and an
 * input that takes over the keyboard while open. Tab in the input completes a half-typed slash
 * command (again to step through several); in normal chat it switches between all messages and
 * only those from the current world.
 */
export class ChatBox {
  private lines: ChatLine[] = [];
  private onlyHere = false;
  private log: HTMLElement;
  private input: HTMLInputElement;
  private hint: HTMLElement;
  private escapedAt = -Infinity;
  /** The commands Tab is stepping through, and the text it last filled in. */
  private cycle: { list: Command[]; i: number; shown: string } | null = null;

  constructor(
    private root: HTMLElement,
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
    this.input.placeholder = 'Say something… or /bug, /idea to send feedback';
    // Feedback reports get more room than chat lines.
    this.input.addEventListener('input', () => {
      this.input.maxLength = this.input.value.startsWith('/') ? CMD_MAX_LEN : MAX_LEN;
      this.cycle = null;
      this.renderHint();
    });
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
        // In a slash command Tab only completes, so it never flips the world filter mid-report.
        if (!this.complete(e.shiftKey ? -1 : 1) && !this.input.value.startsWith('/')) this.onlyHere = !this.onlyHere;
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

  /** Tab on a half-typed command: fills in the match, or the next of several. False if there's nothing to complete. */
  private complete(step: number): boolean {
    if (this.cycle && this.input.value === this.cycle.shown) {
      const n = this.cycle.list.length;
      this.cycle.i = (this.cycle.i + step + n) % n;
    } else {
      const list = commandMatches(this.input.value);
      if (!list?.length) return false;
      this.cycle = { list, i: step < 0 ? list.length - 1 : 0, shown: '' };
    }
    const c = this.cycle;
    this.input.value = c.shown = `/${c.list[c.i].cmd} `;
    this.input.maxLength = CMD_MAX_LEN;
    if (c.list.length === 1) this.cycle = null;
    return true;
  }

  open(): void {
    this.cycle = null;
    this.input.value = '';
    this.input.maxLength = MAX_LEN;
    this.input.classList.remove('hidden');
    this.root.classList.add('typing');
    this.input.focus();
    this.render();
  }

  close(): void {
    if (!this.isOpen) return;
    this.input.classList.add('hidden');
    this.root.classList.remove('typing');
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
    this.renderHint();
  }

  private renderHint(): void {
    const scope = this.onlyHere ? esc(this.opts.mapName(this.opts.map())) : 'All worlds';
    const text = this.input.value;
    const matches = this.isOpen ? commandMatches(text) : null;
    const typed = this.isOpen ? typedCommand(text) : undefined;
    const current = this.cycle?.shown === text ? this.cycle.list[this.cycle.i] : undefined;
    this.hint.innerHTML = !this.isOpen
      ? `Press <b>Enter</b> to chat${this.onlyHere ? ` · ${scope}` : ''}`
      : matches?.length
        ? `<b>Tab</b> ${matches.map((c) => `<span class="chat-cmd">/${c.cmd}</span> ${c.about}`).join(' · ')}`
        : current && this.cycle!.list.length > 1
          ? `<b>Tab</b> ${this.cycle!.list.map((c) => `<span class="chat-cmd${c === current ? ' on' : ''}">/${c.cmd}</span>`).join(' ')} · ${current.about}`
          : typed
            ? `<span class="chat-cmd">/${typed.cmd}</span> ${typed.about} · <b>Enter</b> send · <b>Esc</b> cancel`
            : `<b>Enter</b> send · <b>Esc</b> cancel${text.startsWith('/') ? '' : ` · <b>Tab</b> showing: ${scope}`}`;
  }
}

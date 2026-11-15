import { coinText, escapeHtml as esc } from './format';
import { BOTTOM, keyFace, keyId, keyOf, pressKey, REPEAT_DELAY_MS, REPEAT_MS, ROWS, startKeys, type Key, type KeyState } from './softkeys';

/** Lines leave the window this long after they arrive. */
export const CHAT_TTL_MS = 5 * 60_000;
/** A new line shows at full strength this long before it's back to the faded look (`.chat-line.fresh` in style.css). */
export const FLASH_MS = 4000;
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
  /** The speaker tipped on Ko-fi: a 💗 before their name. */
  sup?: boolean;
  at: number;
}

/** Lines still young enough to show. */
export const liveLines = (lines: ChatLine[], now: number): ChatLine[] => lines.filter((l) => now - l.at < CHAT_TTL_MS);

/** The newest lines for the window, optionally only those from one map. */
export const shownLines = (lines: ChatLine[], onlyMap: string | null): ChatLine[] =>
  lines.filter((l) => !onlyMap || l.system || l.map === onlyMap).slice(-SHOWN);

/**
 * How far into its flash a line is, or null once it's over. The window is rebuilt on every change,
 * so a line still flashing picks the animation up where it left off instead of restarting it.
 */
export const flashElapsed = (l: ChatLine, now: number): number | null => (now - l.at < FLASH_MS ? Math.max(0, now - l.at) : null);

/**
 * Whether a line is worth an unread badge on the touch 💬 button: another player's message. Your own echoes, server
 * notices (joins, rank-ups, renames) and command replies are not conversation, so they never count.
 */
export const countsAsUnread = (l: Pick<ChatLine, 'self' | 'system'>): boolean => !l.self && !l.system;

/** The badge text for a number of unread lines: empty for none, capped at "9+" so it stays small. */
export const unreadLabel = (n: number): string => (n <= 0 ? '' : n > 9 ? '9+' : String(n));

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

/** A command whose secret is asked for in its own starred-out panel (`DevPrompt`) instead of being typed into the chat. */
export type SecretPrompt = { kind: 'login' } | { kind: 'resetpass'; name: string };

/**
 * `/login` on its own, or `/resetpass <name>` with the name but no password, wants the panel. Anything typed in
 * full ("/login user pass", "/resetpass Big Fish pass") is left alone and still works the old way.
 */
export const secretPrompt = (text: string): SecretPrompt | null => {
  const t = text.trim();
  if (/^\/login$/i.test(t)) return { kind: 'login' };
  const m = /^\/resetpass\s+(\S+)$/i.exec(t);
  return m ? { kind: 'resetpass', name: m[1] } : null;
};

/** The commands the panel sends, exactly as the server reads them (`command` in `server/room.ts`). */
export const loginCommand = (user: string, pass: string): string => `/login ${user} ${pass}`;
export const resetPassCommand = (name: string, pass: string): string => `/resetpass ${name} ${pass}`;

/** A command as the local echo shows it, with the password hidden. */
export const maskedEcho = (text: string): string =>
  text.replace(/^(\/login\s+\S+\s+).*/, '$1••••').replace(/^(\/resetpass\s+.+\s)\S+$/, '$1••••');

/** What the panel's echo says: the user name and password stay out of the chat. */
export const promptEcho = (p: SecretPrompt): string => (p.kind === 'login' ? '/login ••••' : `/resetpass ${p.name} ••••`);

/** Why the panel won't send these values yet, or null. The server splits a command at spaces, so a space would change what it reads. */
export const secretError = (values: string[]): string | null => {
  if (values.some((v) => !v)) return 'Fill in every box.';
  if (values.some((v) => /\s/.test(v))) return 'No spaces, please.';
  return null;
};

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
  /** Other players' lines that arrived while the input was closed; reset when it opens. */
  private unread = 0;
  /** The commands Tab is stepping through, and the text it last filled in. */
  private cycle: { list: Command[]; i: number; shown: string } | null = null;
  /** Touch: the in-game keyboard is up (`softkeys.ts`), in place of the phone's. Null with the phone's keyboard or on desktop. */
  private keys: KeyState | null = null;
  private field: HTMLElement;
  private keysEl: HTMLElement;
  private scope: HTMLElement;
  private repeat = 0;
  /** The layer and ⇧ the keys were last drawn for; letters only redraw when these change. */
  private drawnKeys = '';

  constructor(
    private root: HTMLElement,
    private opts: {
      send: (text: string) => void;
      /** Current map id, for the world filter and tags. */
      map: () => string;
      mapName: (id: string) => string;
      now?: () => number;
      /** The unread count changed (the touch 💬 button's badge). */
      onUnread?: (n: number) => void;
      /** Touch mode: chat opens with the in-game keyboard. */
      soft?: () => boolean;
    },
  ) {
    root.innerHTML =
      '<div class="chat-top"><button class="chat-scope" type="button"></button><button class="chat-x" type="button" aria-label="Close chat">✕</button></div>' +
      '<div class="chat-log"></div>' +
      '<div class="chat-bar"><input class="chat-input hidden" type="text" autocomplete="off" spellcheck="false"><div class="chat-field" aria-live="polite"></div><button class="chat-send" type="button">Send</button></div>' +
      '<div class="chat-hint"></div><div class="chat-keys"></div>';
    this.log = root.querySelector('.chat-log')!;
    this.input = root.querySelector('.chat-input')!;
    this.hint = root.querySelector('.chat-hint')!;
    this.field = root.querySelector('.chat-field')!;
    this.keysEl = root.querySelector('.chat-keys')!;
    this.scope = root.querySelector('.chat-scope')!;
    this.wireTouch();
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
        this.submit();
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
    // The in-game keyboard never focuses the input, so only the phone's (or a desktop's) keyboard closes on blur.
    this.input.addEventListener('blur', () => {
      if (!this.keys) this.close();
    });
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
    this.setUnread(0);
    this.input.classList.remove('hidden');
    this.root.classList.add('typing');
    if (this.opts.soft?.()) {
      this.keys = startKeys();
      this.root.classList.add('soft');
      this.input.readOnly = true;
      addEventListener('keydown', this.hardKey, true);
      addEventListener('keyup', this.hardKeyUp, true);
    } else this.input.focus();
    this.render();
  }

  close(): void {
    if (!this.isOpen) return;
    this.input.classList.add('hidden');
    this.root.classList.remove('typing', 'soft', 'native');
    this.input.style.fontSize = '';
    if (this.keys) {
      this.keys = null;
      this.input.readOnly = false;
      removeEventListener('keydown', this.hardKey, true);
      removeEventListener('keyup', this.hardKeyUp, true);
    }
    this.stopRepeat();
    this.input.blur();
    this.render();
  }

  /** Sends what's typed. Closed first: a send can open the login panel, which takes the focus. */
  private submit(): void {
    const text = this.input.value.trim();
    this.close();
    if (text) this.opts.send(text);
  }

  private maxLen(text: string): number {
    return text.startsWith('/') ? CMD_MAX_LEN : MAX_LEN;
  }

  /** The touch layout's buttons: the in-game keys, Send, ✕, the world filter and the tappable slash commands. */
  private wireTouch(): void {
    // pointerdown with preventDefault: a key acts at once and never takes the focus (which would close the phone's keyboard).
    this.keysEl.addEventListener('pointerdown', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-k]');
      e.preventDefault();
      if (!el) return;
      const k = keyOf(el.dataset.k!);
      if (!k || ('act' in k && k.act === 'native')) return;
      el.classList.add('down');
      // On the window: a press can redraw the keys (⇧, 123), and the finger lifts over the new ones.
      const up = () => {
        el.classList.remove('down');
        this.stopRepeat();
        removeEventListener('pointerup', up);
        removeEventListener('pointercancel', up);
      };
      addEventListener('pointerup', up);
      addEventListener('pointercancel', up);
      this.press(k);
      if ('act' in k && k.act === 'back') {
        this.repeat = window.setTimeout(() => {
          this.repeat = window.setInterval(() => this.press(k), REPEAT_MS);
        }, REPEAT_DELAY_MS);
      }
    });
    // The phone's keyboard opens only from a click (iOS counts it as the user's gesture), so 🌐 acts on click.
    this.keysEl.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-k="native"]');
      if (el) this.toNative();
    });
    const tap = (sel: string, fn: () => void) =>
      this.root.querySelector(sel)!.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        fn();
      });
    tap('.chat-send', () => this.submit());
    tap('.chat-x', () => this.close());
    tap('.chat-scope', () => {
      this.onlyHere = !this.onlyHere;
      this.render();
    });
    this.hint.addEventListener('pointerdown', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-cmd]');
      if (!el || !this.isOpen) return;
      e.preventDefault();
      this.input.value = `/${el.dataset.cmd} `;
      this.input.maxLength = CMD_MAX_LEN;
      if (this.keys) this.keys = { ...this.keys, text: this.input.value, shift: false };
      this.cycle = null;
      this.render();
      if (!this.keys) this.input.focus();
    });
  }

  private stopRepeat(): void {
    clearTimeout(this.repeat);
    clearInterval(this.repeat);
    this.repeat = 0;
  }

  /** One in-game key. */
  private press(k: Key): void {
    if (!this.keys) return;
    if ('act' in k && k.act === 'send') return this.submit();
    this.keys = pressKey({ ...this.keys, text: this.input.value }, k, this.maxLen(this.input.value + ('ch' in k ? k.ch : '')));
    this.input.value = this.keys.text;
    this.cycle = null;
    this.render();
  }

  /** A hardware keyboard (a tablet's) while the in-game keys are up: it types into the chat, not the game. */
  private hardKey = (e: KeyboardEvent): void => {
    if (!this.keys) return;
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const v = this.input.value;
    if (e.key === 'Enter') this.submit();
    else if (e.key === 'Escape') {
      this.escapedAt = performance.now();
      this.close();
    } else if (e.key === 'Backspace') this.press({ act: 'back' });
    else if (e.key === 'Tab') {
      if (!this.complete(e.shiftKey ? -1 : 1) && !v.startsWith('/')) this.onlyHere = !this.onlyHere;
      this.keys = { ...this.keys, text: this.input.value };
      this.render();
    } else if (e.key.length === 1 || [...e.key].length === 1) {
      if (v.length >= this.maxLen(v + e.key)) return void e.preventDefault();
      this.input.value = v + e.key;
      this.keys = { ...this.keys, text: this.input.value, shift: false };
      this.cycle = null;
      this.render();
    } else return;
    e.preventDefault();
  };

  private hardKeyUp = (e: KeyboardEvent): void => {
    if (this.keys) e.stopPropagation();
  };

  /**
   * 🌐: the phone's own keyboard, for emoji, other languages and voice typing. Its text is sized to at least 16 real
   * pixels (the touch layout is scaled down), or iPhones zoom the page into the field; the layout puts the field at
   * the top, clear of the keyboard.
   */
  private toNative(): void {
    if (!this.keys) return;
    this.keys = null;
    removeEventListener('keydown', this.hardKey, true);
    removeEventListener('keyup', this.hardKeyUp, true);
    this.input.readOnly = false;
    this.root.classList.remove('soft');
    this.root.classList.add('native');
    this.input.style.fontSize = `${nativeFontPx()}px`;
    this.input.focus();
    this.render();
  }

  add(line: Omit<ChatLine, 'at'>): void {
    this.lines.push({ ...line, at: this.now() });
    if (this.lines.length > 100) this.lines.shift();
    if (!this.isOpen && countsAsUnread(line)) this.setUnread(this.unread + 1);
    this.render();
  }

  private setUnread(n: number): void {
    if (n === this.unread) return;
    this.unread = n;
    this.opts.onUnread?.(n);
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
    const now = this.now();
    const open = (l: ChatLine, cls: string) => {
      const t = flashElapsed(l, now);
      return t === null ? `<div class="chat-line${cls}">` : `<div class="chat-line${cls} fresh" style="animation-delay:${-t}ms">`;
    };
    this.log.innerHTML = shownLines(this.lines, this.onlyHere ? here : null)
      .map((l) => {
        if (l.system) return `${open(l, ' sys')}${coinText(l.text)}</div>`;
        const tag = !this.onlyHere && l.map !== here ? `<span class="chat-tag">${esc(this.opts.mapName(l.map))}</span> ` : '';
        return `${open(l, l.self ? ' self' : '')}${tag}<b>${l.sup ? '<span class="sup" title="Lakeside supporter">💗</span>' : ''}${esc(l.name)}:</b> ${coinText(l.text)}</div>`;
      })
      .join('');
    this.renderHint();
    this.renderTouch();
  }

  /** The touch layout's field (the typed text with a caret), keys and filter button. */
  private renderTouch(): void {
    if (!this.opts.soft?.()) return;
    this.scope.textContent = this.onlyHere ? `📍 ${this.opts.mapName(this.opts.map())}` : '🌍 All worlds';
    const text = this.input.value;
    this.field.innerHTML = text ? `<span>${esc(text)}</span><i class="caret"></i>` : '<i class="caret"></i><span class="ph">Say something…</span>';
    this.field.scrollLeft = this.field.scrollWidth;
    const st = this.keys;
    const drawn = st ? `${st.layer}:${st.shift}` : '';
    if (drawn === this.drawnKeys) return;
    this.drawnKeys = drawn;
    if (!st) return void (this.keysEl.innerHTML = '');
    const key = (k: Key) => {
      const f = keyFace(k, st);
      return `<button type="button" class="${f.cls}" data-k="${esc(keyId(k))}">${esc(f.label)}</button>`;
    };
    this.keysEl.innerHTML = [...ROWS[st.layer], BOTTOM].map((r) => `<div class="row">${r.map(key).join('')}</div>`).join('');
  }

  private renderHint(): void {
    const scope = this.onlyHere ? esc(this.opts.mapName(this.opts.map())) : 'All worlds';
    const text = this.input.value;
    const matches = this.isOpen ? commandMatches(text) : null;
    const typed = this.isOpen ? typedCommand(text) : undefined;
    const current = this.cycle?.shown === text ? this.cycle.list[this.cycle.i] : undefined;
    if (this.opts.soft?.()) {
      // Touch: no keys to name, so only the commands, which a tap fills in.
      const list = text === '' ? COMMANDS : matches;
      this.hint.innerHTML = list?.length ? list.map((c) => `<button type="button" class="chat-cmd" data-cmd="${c.cmd}">/${c.cmd}</button> ${c.about}`).join(' · ') : '';
      return;
    }
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

/** The phone keyboard's field text size in the scaled touch layout: 16 real pixels or more, so iPhones don't zoom. */
export function nativeFontPx(): number {
  const real = Math.max(screen.width, screen.height) || innerWidth;
  return Math.max(22, Math.ceil((17 * innerWidth) / real));
}

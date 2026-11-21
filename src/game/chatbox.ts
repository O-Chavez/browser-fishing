import { atMaxRank } from '../data/ranks';
import { anchorHtml } from './anchor';
import { coinText, escapeHtml as esc } from './format';
import { shownWidth } from './touch';
import { BOTTOM, keyFace, keyId, keyOf, keysLiftPx, pressKey, REPEAT_DELAY_MS, REPEAT_MS, ROWS, startKeys, type Key, type KeyState } from './softkeys';

/**
 * Enter from any keyboard. Phone keyboards (iOS, Gboard) often send an empty `code` and only set
 * `key`, so a `code`-only check never fires there. Keys that confirm an IME composition (e.g. picking
 * a Japanese candidate) are skipped so they don't send a half-typed line.
 */
export function isEnterKey(e: KeyboardEvent): boolean {
  if (e.isComposing || e.keyCode === 229) return false;
  return e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.keyCode === 13;
}

/** Lines leave the window this long after they arrive. */
export const CHAT_TTL_MS = 5 * 60_000;
/** A new line shows at full strength this long before it's back to the faded look (`.chat-line.fresh` in style.css). */
export const FLASH_MS = 4000;
/** Lines shown at once; older ones scroll away. */
const SHOWN = 8;
/** Touch, chat closed: the most lines the glance at the corner shows, and how long a line stays in it (play-test defaults). */
export const TOUCH_SHOWN = 3;
export const TOUCH_GLANCE_MS = 30_000;
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
  /** The speaker is at the last rank: the aurora anchor before their name (and before the 💗). */
  top?: boolean;
  at: number;
}

/** Lines still young enough to show. */
export const liveLines = (lines: ChatLine[], now: number): ChatLine[] => lines.filter((l) => now - l.at < CHAT_TTL_MS);

/** The newest lines for the window, optionally only those from one map. */
export const shownLines = (lines: ChatLine[], onlyMap: string | null): ChatLine[] =>
  lines.filter((l) => !onlyMap || l.system || l.map === onlyMap).slice(-SHOWN);

const inWorld = (l: ChatLine, onlyMap: string | null): boolean => !onlyMap || !!l.system || l.map === onlyMap;

/** Touch, chat closed: the last few lines from the last half minute, optionally one map only. Older lines stay in the full log. */
export const glanceLines = (lines: ChatLine[], onlyMap: string | null, now: number): ChatLine[] =>
  lines.filter((l) => now - l.at < TOUCH_GLANCE_MS && inWorld(l, onlyMap)).slice(-TOUCH_SHOWN);

/** Touch, chat open: every line kept, to scroll back through, optionally one map only. */
export const fullLines = (lines: ChatLine[], onlyMap: string | null): ChatLine[] => lines.filter((l) => inWorld(l, onlyMap));

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
  /** Touch, chat open: the log is scrolled to its newest line, so a new line keeps it there. */
  private stick = true;
  /** The glance last drawn (touch, closed), so the 5 s tick only redraws when it changed. */
  private glanceKey = '';

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
      /** Touch mode: open with the phone's own keyboard (the setting), not the in-game one. */
      phoneKeys?: () => boolean;
    },
  ) {
    root.innerHTML =
      '<div class="chat-top"><button class="chat-scope" type="button"></button><button class="chat-x" type="button" aria-label="Close chat">✕</button></div>' +
      '<div class="chat-log"></div>' +
      '<div class="chat-bar"><input class="chat-input hidden" type="text" enterkeyhint="send" autocomplete="off" spellcheck="false"><div class="chat-field" aria-live="polite"></div><button class="chat-send" type="button">Send</button></div>' +
      '<div class="chat-hint"></div><div class="chat-keys"></div>';
    this.log = root.querySelector('.chat-log')!;
    this.input = root.querySelector('.chat-input')!;
    this.hint = root.querySelector('.chat-hint')!;
    this.field = root.querySelector('.chat-field')!;
    this.keysEl = root.querySelector('.chat-keys')!;
    this.scope = root.querySelector('.chat-scope')!;
    this.wireTouch();
    this.log.addEventListener('scroll', () => {
      this.stick = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 8;
    });
    // The browser's bars showing or hiding change the glance's room.
    addEventListener('resize', () => {
      if (this.opts.soft?.() && !this.isOpen) this.render();
    });
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
      if (isEnterKey(e)) {
        e.preventDefault();
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
    // The phone's keyboard put away with its own ✓ / Done sends what's typed (`sendsOnBlur`).
    this.input.addEventListener('blur', (e) => {
      if (this.keys) return;
      const send = sendsOnBlur({
        open: this.isOpen,
        native: this.root.classList.contains('native'),
        movedTo: !!e.relatedTarget,
        stillFocused: document.activeElement === this.input,
      });
      if (send) this.submit();
      else this.close();
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
    this.stick = true;
    // The phone's keyboard must be focused inside the tap that opened chat (iOS), so this stays synchronous.
    if (this.opts.soft?.() && this.opts.phoneKeys?.()) {
      this.enterNative();
      return;
    }
    if (this.opts.soft?.()) {
      this.keys = startKeys();
      this.root.classList.add('soft');
      // The keys sit clear of the phone's home bar, measured in real screen points (`keysLiftPx`).
      this.root.style.setProperty('--kb-lift', `${keysLiftPx(innerWidth, Math.max(screen.width, screen.height))}px`);
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
      // Keys that close the keyboard act on the click instead (below), or that same tap's click lands on what was under it.
      if (!k || ('act' in k && (k.act === 'native' || k.act === 'send'))) return;
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
    // The phone's keyboard opens only from a click (iOS counts it as the user's gesture), so 🌐 acts on click; Send
    // too, since closing on pointerdown would hand the tap's click to the button under it (the action button).
    this.keysEl.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-k]');
      if (el?.dataset.k === 'native') this.toNative();
      else if (el?.dataset.k === 'send') this.submit();
    });
    // pointerdown keeps the focus where it is (the phone's keyboard stays up for Send); the click does the work, so a
    // closing chat doesn't pass the tap on (✕ sits where 🎒 is).
    const tap = (sel: string, fn: () => void) => {
      const el = this.root.querySelector(sel)!;
      el.addEventListener('pointerdown', (e) => e.preventDefault());
      el.addEventListener('click', () => fn());
    };
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
    this.enterNative();
  }

  /** The phone's keyboard up and the field at the top; 🌐 and the "phone's keyboard" setting both land here. */
  private enterNative(): void {
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
    if (keep.length !== this.lines.length) {
      this.lines = keep;
      this.render();
    } else if (this.opts.soft?.() && !this.isOpen && this.glanceKey !== this.glanceId()) this.render();
  }

  /** Which lines the touch glance holds right now. */
  private glanceId(): string {
    return glanceLines(this.lines, this.onlyHere ? this.opts.map() : null, this.now()).map((l) => l.at).join();
  }

  private render(): void {
    const here = this.opts.map();
    const now = this.now();
    const open = (l: ChatLine, cls: string) => {
      const t = flashElapsed(l, now);
      return t === null ? `<div class="chat-line${cls}">` : `<div class="chat-line${cls} fresh" style="animation-delay:${-t}ms">`;
    };
    const only = this.onlyHere ? here : null;
    const touch = !!this.opts.soft?.();
    const shown = !touch ? shownLines(this.lines, only) : this.isOpen ? fullLines(this.lines, only) : glanceLines(this.lines, only, now);
    this.glanceKey = touch && !this.isOpen ? shown.map((l) => l.at).join() : '';
    this.log.innerHTML = shown
      .map((l) => {
        if (l.system) return `${open(l, ' sys')}${coinText(l.text)}</div>`;
        const tag = !this.onlyHere && l.map !== here ? `<span class="chat-tag">${esc(this.opts.mapName(l.map))}</span> ` : '';
        return `${open(l, l.self ? ' self' : '')}${tag}<b>${anchorHtml(!!l.top)}${l.sup ? '<span class="sup" title="Lakeside supporter">💗</span>' : ''}${esc(l.name)}:</b> ${coinText(l.text)}</div>`;
      })
      .join('');
    // The open log on touch scrolls back; a new line only follows if the player was already at the bottom.
    if (touch && this.isOpen && this.stick) this.log.scrollTop = this.log.scrollHeight;
    // The closed glance keeps to the room its CSS gives it (less when the browser's bars show): the oldest lines that
    // don't fit whole go, rather than one showing cut in half.
    if (touch && !this.isOpen) while (this.log.childElementCount > 1 && this.log.scrollHeight > this.log.clientHeight + 1) this.log.firstElementChild!.remove();
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

/**
 * Whether the chat field losing the focus sends what's typed. With the phone's own keyboard up, its ✓ / Done button
 * (iPhones) puts the keyboard away without an Enter, and the page sees only the field lose the focus, so that sends
 * (Oscar, 2026-11-21: Enter sent, ✓ didn't). Not when chat was already closed (✕, Esc and Send close it first, then
 * let go of the field), not when the focus went to another field (the keyboard's ⌃ ⌄ arrows), and not when the page
 * itself lost the focus (another app or tab: the field is still the page's focused element then). Desktop and the
 * in-game keyboard never send this way.
 */
export function sendsOnBlur(o: { open: boolean; native: boolean; movedTo: boolean; stillFocused: boolean }): boolean {
  return o.open && o.native && !o.movedTo && !o.stillFocused;
}

/** The phone keyboard's field text size in the scaled touch layout: 16 real pixels or more, so iPhones don't zoom. */
export function nativeFontPx(): number {
  const real = shownWidth(screen.width, screen.height) || innerWidth;
  return Math.max(22, Math.ceil((17 * innerWidth) / real));
}

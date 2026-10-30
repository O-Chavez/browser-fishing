/** Matches the server's limits on a report (`FEEDBACK_MAX` and `FEEDBACK_MIN` in `server/feedback.ts`). */
export const FEEDBACK_MAX = 500;
export const FEEDBACK_MIN = 5;
/** How long to wait for the server's answer before letting the player try again. */
export const FEEDBACK_WAIT_MS = 8000;

export type FeedbackKind = 'bug' | 'idea';
export type FeedbackState = 'edit' | 'sending' | 'sent' | 'error';

export const OFFLINE_MSG = 'Feedback needs a connection to the game server.';

/** Spaces and line breaks squashed the way the server does, so the length check agrees with it. */
const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * The Bug / Idea form in ⚙️ Settings (the pause screen opens it too). It sends through the same
 * `/bug` and `/idea` commands as chat, so the server's rate limits and Discord posting apply as-is;
 * the server's answer (thanks, or why it was refused) is shown in the form.
 */
export class FeedbackForm {
  open = false;
  kind: FeedbackKind = 'bug';
  /** The draft; kept while the menu is closed so an Esc doesn't lose it. */
  text = '';
  state: FeedbackState = 'edit';
  /** The last answer or problem, shown under the text box. */
  msg = '';

  get sending(): boolean {
    return this.state === 'sending';
  }

  show(kind?: FeedbackKind): void {
    this.open = true;
    if (this.sending) return;
    if (kind) this.kind = kind;
    this.state = 'edit';
    this.msg = '';
  }

  hide(): void {
    this.open = false;
    if (!this.sending) this.msg = '';
  }

  /** The command to send for the draft, or null (with `msg` saying why) if it can't go yet. */
  submit(connected: boolean): string | null {
    if (this.sending) return null;
    const text = squash(this.text);
    const fail = (msg: string) => {
      this.state = 'error';
      this.msg = msg;
      return null;
    };
    if (!connected) return fail(OFFLINE_MSG);
    if ([...text].length < FEEDBACK_MIN) return fail(this.kind === 'bug' ? 'Say a few words about what went wrong.' : 'Say a few words about your idea.');
    this.state = 'sending';
    this.msg = '';
    return `/${this.kind} ${[...text].slice(0, FEEDBACK_MAX).join('')}`;
  }

  /** The server's answer to a sent report. False if nothing was waiting for one (it was typed in chat). */
  answer(sent: boolean, line: string): boolean {
    if (!this.sending) return false;
    this.state = sent ? 'sent' : 'error';
    this.msg = line;
    if (sent) this.text = '';
    return true;
  }

  /** No answer in time, or the connection dropped while waiting. */
  giveUp(msg = 'No answer from the server. Try again in a moment.'): void {
    if (!this.sending) return;
    this.state = 'error';
    this.msg = msg;
  }
}

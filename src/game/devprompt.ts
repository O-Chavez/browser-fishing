import { loginCommand, promptEcho, resetPassCommand, secretError, type SecretPrompt } from './chatbox';

interface Field {
  label: string;
  max: number;
}

/**
 * The small panel `/login` and `/resetpass <name>` open: the secrets are typed into starred-out boxes
 * instead of the chat input, so nothing readable shows to anyone watching the screen. The values never
 * reach the chat log or any history; the echo is "/login ••••". Enter sends, Esc cancels.
 *
 * Every box is `type="password"` (even the user name) with autocomplete off and no `<form>`, so browsers
 * and password managers don't offer to fill or save anything.
 */
export class DevPrompt {
  private ask: SecretPrompt | null = null;
  private inputs: HTMLInputElement[] = [];
  private title: HTMLElement;
  private fields: HTMLElement;
  private msg: HTMLElement;
  private go: HTMLButtonElement;

  constructor(
    private root: HTMLElement,
    private opts: {
      /** The command for the server, and the line that may be shown in the chat. */
      send: (text: string, echo: string) => void;
      /** The panel went away by Cancel, Esc or sending. */
      closed: () => void;
    },
  ) {
    this.title = root.querySelector('#devprompt-title')!;
    this.fields = root.querySelector('#devprompt-fields')!;
    this.msg = root.querySelector('#devprompt-msg')!;
    this.go = root.querySelector('#devprompt-go')!;
    this.go.addEventListener('click', () => this.submit());
    root.querySelector('#devprompt-cancel')!.addEventListener('click', () => this.cancel());
    // The game listens on the document; keep typing here from moving the player or switching slots.
    root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        if ((e.target as HTMLElement).tagName === 'BUTTON' && (e.target as HTMLElement).id === 'devprompt-cancel') this.cancel();
        else this.submit();
      } else if (e.code === 'Escape') this.cancel();
    });
    root.addEventListener('keyup', (e) => e.stopPropagation());
    // A click on the dim backdrop outside the card does nothing; only Cancel or Esc closes it.
  }

  get isOpen(): boolean {
    return this.ask !== null;
  }

  open(ask: SecretPrompt): void {
    this.ask = ask;
    const fields: Field[] = ask.kind === 'login' ? [{ label: 'Username', max: 60 }, { label: 'Password', max: 128 }] : [{ label: 'New password', max: 128 }];
    this.title.textContent = ask.kind === 'login' ? 'Dev login' : `Reset password for ${ask.name}`;
    this.go.textContent = ask.kind === 'login' ? 'Log in' : 'Set password';
    this.fields.textContent = '';
    this.inputs = fields.map((f, i) => {
      const label = document.createElement('label');
      label.textContent = f.label;
      const input = document.createElement('input');
      input.type = 'password';
      input.maxLength = f.max;
      input.id = `devprompt-f${i}`;
      input.name = `dev-field-${i}`;
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.setAttribute('autocapitalize', 'off');
      input.setAttribute('autocorrect', 'off');
      input.setAttribute('data-1p-ignore', '');
      input.setAttribute('data-lpignore', 'true');
      input.setAttribute('data-form-type', 'other');
      label.htmlFor = input.id;
      this.fields.append(label, input);
      return input;
    });
    this.msg.textContent = '';
    this.root.classList.remove('hidden');
    this.inputs[0].focus();
  }

  /** Hides the panel and forgets the values, without telling the game (it is already closing it). */
  close(): void {
    if (!this.ask) return;
    this.ask = null;
    for (const i of this.inputs) i.value = '';
    this.inputs = [];
    this.fields.textContent = '';
    this.root.classList.add('hidden');
  }

  private cancel(): void {
    this.close();
    this.opts.closed();
  }

  private submit(): void {
    const ask = this.ask;
    if (!ask) return;
    const values = this.inputs.map((i) => i.value);
    const bad = secretError(values);
    if (bad) {
      this.msg.textContent = bad;
      this.inputs[values.findIndex((v) => !v || /\s/.test(v))]?.focus();
      return;
    }
    const text = ask.kind === 'login' ? loginCommand(values[0], values[1]) : resetPassCommand(ask.name, values[0]);
    this.close();
    this.opts.send(text, promptEcho(ask));
    this.opts.closed();
  }
}

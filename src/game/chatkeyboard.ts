/** Which keyboard touch chat opens with: our own (default), or the phone's (autocomplete, emoji, voice typing). */
export type ChatKeyboard = 'game' | 'phone';

export const CHAT_KEYBOARD_KEY = 'fishing-chat-keyboard';

/** Anything but 'phone' (a missing, blocked or odd value) is the game's keyboard. */
export const parseChatKeyboard = (v: string | null | undefined): ChatKeyboard => (v === 'phone' ? 'phone' : 'game');

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** The saved choice; a browser that blocks storage gets the game's keyboard. */
export function readChatKeyboard(store?: Store): ChatKeyboard {
  try {
    return parseChatKeyboard((store ?? localStorage).getItem(CHAT_KEYBOARD_KEY));
  } catch {
    return 'game';
  }
}

export function writeChatKeyboard(v: ChatKeyboard, store?: Store): void {
  try {
    (store ?? localStorage).setItem(CHAT_KEYBOARD_KEY, v);
  } catch {}
}

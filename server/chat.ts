export const CHAT_MAX = 120;
/** At most `CHAT_BURST` messages per `CHAT_WINDOW_MS`, per account. */
export const CHAT_BURST = 3;
export const CHAT_WINDOW_MS = 5000;
/** The same message can't be sent again within this time. */
export const CHAT_REPEAT_MS = 10_000;

/** Masked anywhere inside a word ("fucking", "bullshit"). */
const ROOTS = ['fuck', 'shit', 'cunt', 'bitch', 'nigg', 'faggot', 'whore', 'pussy'];
/** Masked only as whole words, so "class", "cocktail" and "Dickens" stay intact. */
const WORDS = new Set(['ass', 'asshole', 'dick', 'dicks', 'cock', 'cocks', 'piss', 'slut', 'sluts', 'bastard', 'fag', 'fags', 'retard', 'retards', 'twat', 'wanker']);
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't' };

const plain = (word: string): string =>
  word
    .toLowerCase()
    .replace(/[01!34@5$7]/g, (c) => LEET[c])
    .replace(/(.)\1+/g, '$1$1');

/** `safe` is cut out before looking for ROOTS, so innocent words that contain one can pass. */
const rude = (word: string, safe?: RegExp): boolean => {
  const p = plain(word);
  const squeezed = p.replace(/(.)\1+/g, '$1');
  const r = safe ? p.replace(safe, '') : p;
  const rSqueezed = r.replace(/(.)\1+/g, '$1');
  return ROOTS.some((root) => r.includes(root) || rSqueezed.includes(root)) || WORDS.has(p) || WORDS.has(squeezed);
};

/**
 * Innocent words that contain a root ("Scunthorpe", "Yoshitaka", "Shiitake", "FishIt"). Chat and
 * names both skip these; a name's capital still splits them ("FiShit"), so names stay strict there.
 */
const NAME_SAFE = /scunthorpe|shi+take|[yt]oshit(?=[aeiou])|fishit/g;

/** Replaces rude words with asterisks of the same length. */
export function censor(text: string): string {
  return text.replace(/[\p{L}\p{N}@$!]+/gu, (w) => (rude(w, NAME_SAFE) ? '*'.repeat(w.length) : w));
}

const NAME_SEP = /[^\p{L}\p{N}@$!]+/u;
/** Between "Big" and "Dick" in "BigDick", or "XX" and "Ass" in "XXAss". */
const CAMEL = /(?<=[\p{Ll}\p{N}])(?=\p{Lu})|(?<=\p{Lu})(?=\p{Lu}\p{Ll})/u;

/**
 * Whether a name has a rude word in it. Names have no spaces, so on top of the chat rules each
 * piece is also split at capitals, digits and symbols ("BigDickFisher", "xx_ass_xx", "Ass99"),
 * and spaced-out letters are joined ("f u c k"). Whole-word ones still only match a whole piece,
 * so "Hancock", "Dickens" and "Classic" pass. `AccountStore.auth` only asks for new claims, so old accounts keep theirs.
 */
export function rudeName(name: string): boolean {
  // Also as the name will be saved, with symbols dropped ("Fu.ck" becomes "Fuck").
  return [name, name.replace(/[^\p{L}\p{N}\s_-]/gu, '')].some((text) => {
    const chunks: string[] = [];
    let letters = '';
    for (const c of text.split(NAME_SEP)) {
      if ([...c].length === 1) letters += c;
      else {
        if (letters) chunks.push(letters);
        if (c) chunks.push(c);
        letters = '';
      }
    }
    if (letters) chunks.push(letters);
    return chunks.some((chunk) =>
      [chunk, ...chunk.split(CAMEL)].some((part) => rude(part, NAME_SAFE) || part.split(/[\p{N}@$!]+/u).some((w) => w && rude(w, NAME_SAFE))),
    );
  });
}

/** Trims, drops control characters, collapses whitespace and caps the length. Empty means "nothing to send". */
export function cleanText(raw: unknown, max = CHAT_MAX): string {
  if (typeof raw !== 'string') return '';
  return [...raw.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim()].slice(0, max).join('');
}

export type ChatResult = { ok: true; text: string } | { ok: false; msg?: string };

/** Server-wide chat rules: one instance is shared by every room so limits follow the account. */
export class ChatGate {
  private sent = new Map<string, { times: number[]; last: string; lastAt: number }>();

  constructor(private now: () => number = Date.now) {}

  check(who: string, raw: unknown): ChatResult {
    const text = cleanText(raw);
    if (!text) return { ok: false };
    const t = this.now();
    const key = who.toLowerCase();
    const rec = this.sent.get(key) ?? { times: [], last: '', lastAt: -Infinity };
    rec.times = rec.times.filter((x) => t - x < CHAT_WINDOW_MS);
    if (rec.times.length >= CHAT_BURST) return { ok: false, msg: 'Slow down: wait a moment before chatting again.' };
    const same = text.toLowerCase();
    if (same === rec.last && t - rec.lastAt < CHAT_REPEAT_MS) return { ok: false, msg: "You just said that." };
    rec.times.push(t);
    rec.last = same;
    rec.lastAt = t;
    this.sent.set(key, rec);
    return { ok: true, text: censor(text) };
  }

  /** Forgets accounts that have been quiet for a while, so the map doesn't grow forever. */
  prune(): void {
    const t = this.now();
    for (const [k, r] of this.sent) if (t - r.lastAt > CHAT_REPEAT_MS && t - (r.times.at(-1) ?? -Infinity) > CHAT_WINDOW_MS) this.sent.delete(k);
  }
}

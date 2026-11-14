/**
 * Easter eggs you can type. A message that mentions one of these makes Lim act
 * it out while the reply is on its way; the question still gets answered.
 */
export type Stunt =
  | 'flip'
  | 'spin'
  | 'dance'
  | 'jump'
  | 'love'
  | 'sleep'
  | 'big'
  | 'tiny'
  | 'boo'
  | 'party'
  | 'pop'
  | 'wave'

const RULES: [RegExp, Stunt][] = [
  [/\b(back ?flip|flip|somersault)\b/i, 'flip'],
  [/\b(spin|twirl|pirouette)\b/i, 'spin'],
  [/\b(dance|boogie|disco)\b/i, 'dance'],
  [/\b(party|confetti|celebrate|congrat\w*|hooray|yay)\b/i, 'party'],
  [/\b(pop|burst|explode)\b/i, 'pop'],
  [/\b(jump|hop|bounce)\b/i, 'jump'],
  [/(\b(love|cute|adorable|xoxo)\b|❤|♥|😍|🥰)/i, 'love'],
  [/\b(sleep|sleepy|nap|bedtime|good ?night)\b/i, 'sleep'],
  [/\b(embiggen|grow|huge|giant|bigger)\b/i, 'big'],
  [/\b(shrink|tiny|teeny|smaller)\b/i, 'tiny'],
  [/\bbo{2,}\b/i, 'boo'],
  [/^\s*(hi|hiya|hello|hey|howdy|yo)\b/i, 'wave'],
]

export function stuntFor(text: string): Stunt | null {
  for (const [re, stunt] of RULES) if (re.test(text)) return stunt
  return null
}

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']

/** Feed it keydown keys; true on the keystroke that completes ↑↑↓↓←→←→BA. */
export function konami(): (key: string) => boolean {
  let at = 0
  return (key) => {
    const k = key.length === 1 ? key.toLowerCase() : key
    at = k === KONAMI[at] ? at + 1 : k === KONAMI[0] ? 1 : 0
    if (at < KONAMI.length) return false
    at = 0
    return true
  }
}

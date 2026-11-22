import type { ComponentType } from "react"
import type { KeyCombo } from "./keys"

// The command palette's model and its search. Pure: a list of commands and a
// query in, ranked groups out.

export type CommandGroup = "Actions" | "Go to" | "Days" | "Stops" | "Trips" | "Settings"

/** Groups always appear in this order, whatever matched best. */
export const GROUP_ORDER: readonly CommandGroup[] = ["Actions", "Go to", "Days", "Stops", "Trips", "Settings"]

/** What an empty query shows. Stops wait to be searched for: a long trip has hundreds. */
const DEFAULT_GROUPS: readonly CommandGroup[] = ["Actions", "Go to", "Days", "Trips", "Settings"]

/** A lucide icon, or any icon component that takes a size (e.g. `IgGlyph`). */
export type CommandIcon = ComponentType<{ size?: number; strokeWidth?: number }>

export interface Command {
  /** Unique across the palette; the first command registered with an id wins. */
  id: string
  /** Sentence case, a verb where it is an action: "Share trip", "Export to calendar". */
  title: string
  /** Muted context after the title: "Day 4 · 10:00". */
  subtitle?: string
  group: CommandGroup
  /** Other words that should find this command (synonyms, the place's address). */
  keywords?: string[]
  /** Key tokens from `keys.ts` ("mod", "shift", "alt", "left", "k" …), drawn per platform. */
  shortcut?: KeyCombo
  icon?: CommandIcon
  /** Shown, dimmed, and skipped by the arrow keys. */
  disabled?: boolean
  run: () => void
}

export interface CommandResultGroup {
  group: CommandGroup
  commands: Command[]
}

const FOLD: Record<string, string> = { ø: "o", æ: "ae", œ: "oe", ł: "l", đ: "d", ð: "d", þ: "th", ß: "ss", ı: "i" }

/**
 * Case- and accent-insensitive form of a string, for matching only.
 *
 * NFKD splits "é" into "e" + a combining accent (dropped: only the Latin
 * combining block, so Japanese dakuten survive), maps full-width Latin to
 * ASCII, and splits Hangul syllables into jamo. Jamo matter: while a Korean
 * IME is mid-syllable the field holds "겨" on the way to "경", and the jamo
 * of "겨" are a prefix of the jamo of "경복궁", so results keep up with typing.
 */
export function foldText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[øæœłđðþßı]/g, (ch) => FOLD[ch] ?? ch)
    .replace(/\s+/g, " ")
    .trim()
}

const TIER = { exact: 6, prefix: 5, wordStart: 4, substring: 3, allWords: 2, subsequence: 1, none: 0 } as const

const isWordChar = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch)

function matchTier(text: string, query: string): number {
  if (!text) return TIER.none
  if (text === query) return TIER.exact
  if (text.startsWith(query)) return TIER.prefix
  let at = text.indexOf(query)
  if (at < 0) return TIER.none
  // Any later occurrence at a word start beats the first mid-word one.
  while (at >= 0) {
    if (!isWordChar(text[at - 1])) return TIER.wordStart
    at = text.indexOf(query, at + 1)
  }
  return TIER.substring
}

/** "gbg" in "gyeongbokgung": letters in order. Latin only; in jamo it would match nearly anything. */
function isSubsequence(text: string, query: string): boolean {
  let at = 0
  for (const ch of query) {
    at = text.indexOf(ch, at)
    if (at < 0) return false
    at += 1
  }
  return true
}

const LATIN_QUERY = /^[a-z0-9]+$/

// The same tier in the title beats it in a keyword, which beats it in the subtitle.
const weigh = (tier: number, field: 0 | 1 | 2) => (tier === TIER.none ? 0 : tier * 4 + field)

interface Folded {
  title: string
  keywords: string[]
  subtitle: string
}

/**
 * Each command's text, folded once. Folding (NFKD, jamo) was most of the
 * palette's work per keystroke on a long trip. Commands are never changed in
 * place (screens build new ones), so the command itself is the key.
 */
const foldedText = new WeakMap<Command, Folded>()

function folded(command: Command): Folded {
  let entry = foldedText.get(command)
  if (!entry) {
    entry = { title: foldText(command.title), keywords: (command.keywords ?? []).map(foldText), subtitle: foldText(command.subtitle ?? "") }
    foldedText.set(command, entry)
  }
  return entry
}

/** How well one command matches a folded query; 0 is no match. */
function score(command: Command, query: string): number {
  const { title, keywords, subtitle } = folded(command)
  let best = weigh(matchTier(title, query), 2)
  for (const keyword of keywords) best = Math.max(best, weigh(matchTier(keyword, query), 1))
  best = Math.max(best, weigh(matchTier(subtitle, query), 0))
  if (best > 0) return best

  const words = query.split(" ")
  if (words.length > 1) {
    const haystack = [title, ...keywords, subtitle].join(" ")
    if (words.every((word) => haystack.includes(word))) return weigh(TIER.allWords, 0)
  }
  if (LATIN_QUERY.test(query) && query.length > 1 && isSubsequence(title, query)) return weigh(TIER.subsequence, 0)
  return 0
}

/**
 * Rank and group commands for a query.
 *
 * Within a group: exact title > prefix > a word start > anywhere > every
 * word somewhere > letters in order, then enabled before disabled, then the
 * order the commands were given in. The last two kinds show only when
 * nothing matches better. Groups keep `GROUP_ORDER`. An empty query shows
 * the commands as given, minus Stops. At most `limitPerGroup` each.
 */
export function searchCommands(commands: readonly Command[], query: string, limitPerGroup = 8): CommandResultGroup[] {
  const q = foldText(query)
  const scored = commands.flatMap((command, index) => {
    if (!q) return DEFAULT_GROUPS.includes(command.group) ? [{ command, score: 1, index }] : []
    const value = score(command, q)
    return value > 0 ? [{ command, score: value, index }] : []
  })
  // Loose matches (every word somewhere, letters in order) are a fallback.
  // Next to a real match they are noise, and with groups in a fixed order
  // they would sit above it: "pal" must not put "Trip details" over "Palace".
  const solid = weigh(TIER.substring, 0)
  const strict = scored.some((entry) => entry.score >= solid)
  const byGroup = new Map<CommandGroup, typeof scored>()
  for (const entry of scored) {
    if (strict && entry.score < solid) continue
    const list = byGroup.get(entry.command.group) ?? []
    list.push(entry)
    byGroup.set(entry.command.group, list)
  }

  const results: CommandResultGroup[] = []
  for (const group of GROUP_ORDER) {
    const list = byGroup.get(group)
    if (!list) continue
    list.sort((x, y) => y.score - x.score || Number(Boolean(x.command.disabled)) - Number(Boolean(y.command.disabled)) || x.index - y.index)
    results.push({ group, commands: list.slice(0, limitPerGroup).map((entry) => entry.command) })
  }
  return results
}

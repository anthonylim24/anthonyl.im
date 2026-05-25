// Entity dictionary for the trip. Fetched once from /api/korea/entities,
// shared via context so any descendant of <KoreaLayout> can consume it
// without prop drilling.
//
// Used by <LinkifiedText> to detect proper-noun mentions inside free-form
// text (day themes, bullets, callouts, neighborhood picks, reservation
// notes) and wrap them in <SmartEntity> popovers.

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { EntityType } from "./entityLinks"

export interface EntityRef {
  name: string
  type: EntityType
  city?: string
  aliases?: string[]
}

export interface EntityMatch {
  name: string
  type: EntityType
  city?: string
}

export interface EntityIndex {
  /** Flat array of all entities (names + aliases collapsed). */
  entries: EntityRef[]
  /**
   * Combined regex for matching any entity name or alias inside a
   * string. Built once (memoized) per loaded index. `null` when the
   * index hasn't loaded yet or is empty.
   */
  matchRegex: RegExp | null
  /** Lookup table: lowercased matched substring → resolved EntityMatch. */
  resolve(matchedText: string): EntityMatch | null
}

const EMPTY_INDEX: EntityIndex = {
  entries: [],
  matchRegex: null,
  resolve: () => null,
}

const EntityIndexContext = createContext<EntityIndex>(EMPTY_INDEX)

// Module-level cache so we never re-fetch within a single SPA session.
let cachedEntries: EntityRef[] | null = null
let inflight: Promise<EntityRef[]> | null = null

async function fetchEntities(): Promise<EntityRef[]> {
  if (cachedEntries) return cachedEntries
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const r = await fetch("/api/korea/entities")
      if (!r.ok) return []
      const rows = (await r.json()) as EntityRef[]
      return Array.isArray(rows) ? rows : []
    } catch {
      return []
    }
  })().then((rows) => {
    cachedEntries = rows
    return rows
  })
  return inflight
}

// Regex meta-character escape. Keeps the combined regex safe for entity
// names that contain parens, dots, ampersands, etc.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// Heuristic guard so we don't wrap generic English words. Matches are
// only emitted when ALL of these hold:
//   - The matched substring is ≥ 4 characters long, OR
//   - The match starts with an uppercase letter (proper noun shape), OR
//   - The match contains a digit or hyphen (codes / station refs)
// Without this, an alias like "M" or "Yongsan" would match anywhere.
//
// Aliases under 3 chars are filtered out at index-build time.

function buildIndex(entries: EntityRef[]): EntityIndex {
  if (!entries.length) return EMPTY_INDEX

  // Build name→entity lookup; aliases point back to the canonical entity.
  // Lowercased keys; resolve() maps the matched substring (lowercased)
  // back to the canonical entity.
  const lookup = new Map<string, EntityMatch>()
  const allTerms: string[] = []
  for (const entry of entries) {
    const canon: EntityMatch = { name: entry.name, type: entry.type, city: entry.city }
    if (entry.name.length >= 3) {
      lookup.set(entry.name.toLowerCase(), canon)
      allTerms.push(entry.name)
    }
    for (const alias of entry.aliases ?? []) {
      if (alias.length < 3) continue
      lookup.set(alias.toLowerCase(), canon)
      allTerms.push(alias)
    }
  }

  if (!allTerms.length) return EMPTY_INDEX

  // Long-string-first so multi-word names win over their prefixes:
  // "Gentle Monster Haus Dosan" beats "Gentle Monster" beats "Gentle".
  const sortedTerms = [...new Set(allTerms)].sort((a, b) => b.length - a.length)

  // Word boundaries (\b) work fine for ASCII / romanized names. For
  // mixed-script terms (Korean characters), \b doesn't fire — the regex
  // engine treats CJK as non-word characters in default mode. We allow
  // both word-boundary AND lookbehind-non-letter for those cases.
  const pattern = `(?<![\\p{L}\\p{N}])(?:${sortedTerms.map(escapeRegex).join("|")})(?![\\p{L}\\p{N}])`
  let matchRegex: RegExp
  try {
    matchRegex = new RegExp(pattern, "giu")
  } catch {
    // Some older browsers might not support \p in regex. Fall back to
    // plain word boundaries (ASCII).
    matchRegex = new RegExp(`\\b(?:${sortedTerms.map(escapeRegex).join("|")})\\b`, "gi")
  }

  return {
    entries,
    matchRegex,
    resolve(matchedText: string) {
      return lookup.get(matchedText.toLowerCase()) ?? null
    },
  }
}

export function EntityIndexProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<EntityRef[] | null>(cachedEntries)

  useEffect(() => {
    if (entries) return
    let cancelled = false
    void fetchEntities().then((rows) => {
      if (!cancelled) setEntries(rows)
    })
    return () => {
      cancelled = true
    }
  }, [entries])

  const index = useMemo<EntityIndex>(() => (entries ? buildIndex(entries) : EMPTY_INDEX), [entries])

  return <EntityIndexContext.Provider value={index}>{children}</EntityIndexContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useEntityIndex(): EntityIndex {
  return useContext(EntityIndexContext)
}

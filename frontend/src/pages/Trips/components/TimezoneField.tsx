import { useEffect, useId, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Check, Globe2 } from "lucide-react"

// Searchable timezone combobox built on Intl — no dependency, always current
// with the runtime's IANA database. Zones are shown with live GMT offsets and
// a friendly city name; the detected zone and a short common list float to
// the top so the right answer is usually one click.

interface TimezoneFieldProps {
  value: string
  onChange: (tz: string) => void
}

const COMMON_ZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Singapore",
  "Australia/Sydney",
]

function allZones(): string[] {
  try {
    // supportedValuesOf is es2022 — not in this project's TS lib yet, but
    // present in every browser this app supports. Fallback keeps old engines
    // working with the common list.
    const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
    return intl.supportedValuesOf ? intl.supportedValuesOf("timeZone") : COMMON_ZONES
  } catch {
    return COMMON_ZONES
  }
}

export function offsetLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date())
    return parts.find((p) => p.type === "timeZoneName")?.value ?? ""
  } catch {
    return ""
  }
}

export function cityLabel(tz: string): string {
  const city = tz.split("/").pop() ?? tz
  return city.replace(/_/g, " ")
}

interface ZoneOption {
  tz: string
  city: string
  offset: string
  group: "detected" | "common" | "all"
}

export function TimezoneField({ value, onChange }: TimezoneFieldProps) {
  const reduce = useReducedMotion()
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)

  const detected = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])

  const options = useMemo<ZoneOption[]>(() => {
    const q = query.trim().toLowerCase().replace(/ /g, "_")
    const seen = new Set<string>()
    const out: ZoneOption[] = []
    const push = (tz: string, group: ZoneOption["group"]) => {
      if (seen.has(tz)) return
      seen.add(tz)
      out.push({ tz, city: cityLabel(tz), offset: offsetLabel(tz), group })
    }
    if (!q) {
      push(detected, "detected")
      for (const tz of COMMON_ZONES) push(tz, "common")
      return out
    }
    for (const tz of allZones()) {
      if (tz.toLowerCase().includes(q) || cityLabel(tz).toLowerCase().includes(query.trim().toLowerCase())) {
        push(tz, "all")
        if (out.length >= 12) break
      }
    }
    return out
  }, [query, detected])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("touchstart", onDown)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("touchstart", onDown)
    }
  }, [open])

  const select = (tz: string) => {
    onChange(tz)
    setQuery("")
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false)
      return
    }
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      e.preventDefault()
      setOpen(true)
      return
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      const next = e.key === "ArrowDown" ? activeIndex + 1 : activeIndex - 1
      const clamped = Math.max(0, Math.min(options.length - 1, next))
      setActiveIndex(clamped)
      listRef.current?.children[clamped]?.scrollIntoView({ block: "nearest" })
    }
    if (e.key === "Enter" && options[activeIndex]) {
      e.preventDefault()
      select(options[activeIndex].tz)
    }
  }

  const GROUP_LABEL: Record<ZoneOption["group"], string> = {
    detected: "Detected",
    common: "Common",
    all: "Time zones",
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-3 rounded-xl border border-stone-300 bg-white px-3 py-1 transition focus-within:border-amber-600 focus-within:ring-2 focus-within:ring-amber-600/25 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:hover:border-stone-600">
        <Globe2 className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Time zone"
          value={open ? query : `${cityLabel(value)} (${offsetLabel(value)})`}
          placeholder="Search city or zone…"
          onFocus={() => {
            setOpen(true)
            setQuery("")
            setActiveIndex(0)
          }}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActiveIndex(0)
          }}
          onKeyDown={onKeyDown}
          className="w-full bg-transparent py-1.5 text-sm text-stone-900 placeholder:text-stone-500 focus:outline-none dark:text-stone-100 dark:placeholder:text-stone-400"
        />
      </div>

      <AnimatePresence>
        {open && (
          <motion.ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Time zones"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 max-h-72 overflow-auto rounded-2xl border border-stone-200 bg-white py-1.5 shadow-xl shadow-stone-950/10 dark:border-stone-700 dark:bg-stone-900 dark:shadow-black/40"
          >
            {options.length === 0 && (
              <li className="px-4 py-3 text-sm text-stone-500 dark:text-stone-400">No matching time zone.</li>
            )}
            {options.map((opt, i) => {
              const showGroup = i === 0 || options[i - 1]!.group !== opt.group
              return (
                <li key={opt.tz} role="presentation">
                  {showGroup && (
                    <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500" aria-hidden>
                      {GROUP_LABEL[opt.group]}
                    </div>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={opt.tz === value}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => select(opt.tz)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm transition-colors ${
                      i === activeIndex
                        ? "bg-amber-50 text-stone-900 dark:bg-amber-500/10 dark:text-stone-100"
                        : "text-stone-700 dark:text-stone-300"
                    }`}
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{opt.city}</span>
                      <span className="ml-2 text-xs text-stone-500 dark:text-stone-400">{opt.tz}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-stone-500 dark:text-stone-400">
                      {opt.offset}
                      {opt.tz === value && <Check className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" aria-hidden />}
                    </span>
                  </button>
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

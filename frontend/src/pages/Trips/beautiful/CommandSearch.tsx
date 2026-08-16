import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import { Search } from "lucide-react"
import { focusRingClass, inputClass, mutedInkClass, wrapAnywhereClass } from "../ui"
import type { SearchHit } from "./types"
import { useWorkspace } from "./workspace"

export function CommandSearch() {
  const { searchOpen, openSearch, closeSearch, trips, currentTrip } = useWorkspace()
  const [query, setQuery] = useState("")
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        if (searchOpen) closeSearch()
        else openSearch()
      }
    }
    const onOpen = () => openSearch()
    window.addEventListener("keydown", onKey)
    window.addEventListener("trips:open-search", onOpen)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("trips:open-search", onOpen)
    }
  }, [searchOpen, openSearch, closeSearch])

  const hits = useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase()
    const out: SearchHit[] = []
    for (const trip of trips) {
      const href = `/trips/${trip.slug ?? trip.id}`
      if (!q || trip.name.toLowerCase().includes(q) || trip.destinations.some((d) => d.toLowerCase().includes(q))) {
        out.push({
          id: trip.id,
          href,
          title: trip.name,
          detail: trip.destinations.join(" · "),
          group: "Trips",
        })
      }
    }
    if (currentTrip) {
      const key = currentTrip.slug ?? currentTrip.id
      for (const [i, day] of currentTrip.days.entries()) {
        const title = day.title?.trim() || `Day ${i + 1}`
        if (!q || title.toLowerCase().includes(q)) {
          out.push({
            id: day.id,
            href: `/trips/${key}/day/${day.id}`,
            title,
            detail: currentTrip.name,
            group: "Days",
          })
        }
      }
    }
    return out.slice(0, 16)
  }, [query, trips, currentTrip])

  if (!searchOpen || typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <button type="button" className="absolute inset-0 bg-stone-950/40" aria-label="Close search" onClick={closeSearch} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search trips"
        className="relative mx-auto mt-[12vh] w-[min(36rem,calc(100vw-2rem))] rounded-2xl border border-stone-200 bg-[var(--trips-surface)] p-3 shadow-2xl dark:border-stone-700 dark:bg-stone-900"
      >
        <div className="flex items-center gap-2 px-1">
          <Search className={`h-4 w-4 ${mutedInkClass}`} strokeWidth={1.5} aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search trips, days, or stops"
            className={`border-0 bg-transparent shadow-none ring-0 ${inputClass}`}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeSearch()
              if (e.key === "Enter" && hits[0]) {
                navigate(hits[0].href)
                closeSearch()
              }
            }}
          />
        </div>
        <ul className="mt-2 max-h-[50vh] overflow-y-auto">
          {hits.length === 0 ? (
            <li className={`px-3 py-6 text-sm ${mutedInkClass}`}>
              {query.trim() ? "No matches for that search." : "Type a trip or day name."}
            </li>
          ) : (
            hits.map((hit) => (
              <li key={`${hit.group}-${hit.id}`}>
                <button
                  type="button"
                  onClick={() => {
                    navigate(hit.href)
                    closeSearch()
                  }}
                  className={`flex min-h-11 w-full flex-col items-start rounded-xl px-3 py-2 text-left hover:bg-stone-100 dark:hover:bg-stone-800 ${focusRingClass}`}
                >
                  <span className={`text-[10px] uppercase tracking-[0.14em] ${mutedInkClass}`}>{hit.group}</span>
                  <span className={`text-sm font-medium text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}>
                    {hit.title}
                  </span>
                  {hit.detail && <span className={`text-xs ${mutedInkClass}`}>{hit.detail}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>,
    document.body,
  )
}

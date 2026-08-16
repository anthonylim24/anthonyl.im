import { Link, useLocation } from "react-router-dom"
import { CalendarDays, Home, Plus, Search } from "lucide-react"
import { formatTripDate } from "../theme"
import { focusRingClass, mutedInkClass, wrapAnywhereClass } from "../ui"
import { useWorkspace } from "./workspace"

export function WorkspaceSidebar({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean
  onNavigate?: () => void
}) {
  const { pathname } = useLocation()
  const { trips, currentTrip, openSearch } = useWorkspace()
  const atIndex = pathname === "/trips" || pathname === "/trips/"
  const tripKey = currentTrip?.slug ?? currentTrip?.id

  return (
    <nav aria-label="Trip workspace" className={mobile ? "space-y-6" : "flex h-full flex-col gap-6 p-4"}>
      <div>
        <p className={`font-mono-trips text-[10px] uppercase tracking-[0.18em] ${mutedInkClass}`}>Workspace</p>
        <ul className="mt-2 space-y-0.5">
          <li>
            <Link
              to="/trips"
              onClick={onNavigate}
              className={navClass(atIndex)}
            >
              <Home className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
              Home
            </Link>
          </li>
          <li>
            <Link to="/trips/new" onClick={onNavigate} className={navClass(pathname.startsWith("/trips/new"))}>
              <Plus className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
              New trip
            </Link>
          </li>
          <li>
            <button type="button" onClick={() => { openSearch(); onNavigate?.() }} className={`${navClass(false)} w-full`}>
              <Search className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
              Search
              <kbd className={`ml-auto font-mono-trips text-[10px] ${mutedInkClass}`}>⌘K</kbd>
            </button>
          </li>
        </ul>
      </div>

      {atIndex && trips.length > 0 && (
        <div>
          <p className={`font-mono-trips text-[10px] uppercase tracking-[0.18em] ${mutedInkClass}`}>Trips</p>
          <ul className="mt-2 space-y-0.5">
            {trips.slice(0, 12).map((trip) => (
              <li key={trip.id}>
                <Link
                  to={`/trips/${trip.slug ?? trip.id}`}
                  onClick={onNavigate}
                  className={navClass(false)}
                >
                  <span className={`min-w-0 truncate ${wrapAnywhereClass}`}>{trip.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {currentTrip && tripKey && (
        <div>
          <p className={`font-mono-trips text-[10px] uppercase tracking-[0.18em] ${mutedInkClass}`}>
            {currentTrip.name}
          </p>
          <ul className="mt-2 space-y-0.5">
            <li>
              <Link
                to={`/trips/${tripKey}`}
                onClick={onNavigate}
                className={navClass(pathname === `/trips/${tripKey}` || pathname === `/trips/${currentTrip.id}`)}
              >
                Overview
              </Link>
            </li>
            <li>
              <Link
                to={`/trips/${tripKey}/edit`}
                onClick={onNavigate}
                className={navClass(pathname.endsWith("/edit"))}
              >
                Editor
              </Link>
            </li>
            {currentTrip.days.map((day, i) => (
              <li key={day.id}>
                <Link
                  to={`/trips/${tripKey}/day/${day.id}`}
                  onClick={onNavigate}
                  className={navClass(pathname.includes(`/day/${day.id}`))}
                >
                  <CalendarDays className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                  <span className="min-w-0 truncate">
                    {day.title?.trim() || `Day ${i + 1}`}
                  </span>
                  <span className={`ml-auto font-mono-trips text-[10px] ${mutedInkClass}`}>
                    {formatTripDate(day.date, "UTC", { weekday: undefined, month: "short", day: "numeric" })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  )
}

function navClass(active: boolean): string {
  return `flex min-h-11 items-center gap-2 rounded-xl px-2.5 text-sm ${focusRingClass} ${
    active
      ? "bg-[color:var(--ta-soft)] font-medium text-[color:var(--ta)]"
      : "text-stone-700 hover:bg-stone-200/50 dark:text-stone-300 dark:hover:bg-stone-800/60"
  }`
}

import { useId, useState } from "react"
import { ChevronDown } from "lucide-react"
import { ACCENT_LABEL, ACCENT_SWATCH, TRIP_ACCENTS, resolveAccent } from "../theme"
import {
  bareInputClass,
  checkboxClass,
  fieldShellClass,
  focusRingInsetClass,
  hintClass,
  inputClass,
  labelClass,
  mutedInkClass,
  panelClass,
} from "../ui"
import type { Trip } from "../types"

/** Configures the dossier-style public pages: accent family, editorial copy,
 *  permalink. A once-per-trip task, so it lives in the settings cluster at the
 *  bottom of the editor rather than above the days. */
export function AppearancePanel({
  trip,
  locked = false,
  onChange,
  onSlugChange,
}: {
  trip: Trip
  locked?: boolean
  onChange: (appearance: NonNullable<Trip["appearance"]>) => void
  onSlugChange: (slug: string) => void
}) {
  const [open, setOpen] = useState(false)
  const uid = useId()
  const shareHelpId = `${uid}-share-help`
  const appearance = trip.appearance ?? {}
  const selectedAccent = resolveAccent(appearance.accent)
  const patch = (p: Partial<NonNullable<Trip["appearance"]>>) => onChange({ ...appearance, ...p })

  return (
    <section className={`mt-3 ${panelClass}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-[var(--tr-r-panel)] px-5 py-3.5 text-left ${focusRingInsetClass}`}
      >
        <span className="flex items-center gap-2.5 text-sm font-semibold text-[color:var(--tr-ink)]">
          <span
            className="h-3.5 w-3.5 rounded-[var(--tr-r-control)]"
            style={{ backgroundColor: ACCENT_SWATCH[selectedAccent] }}
            aria-hidden
          />
          Appearance
          <span className={`hidden font-normal sm:inline ${mutedInkClass}`}>
            accent, dossier copy, permalink
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${mutedInkClass} ${open ? "rotate-180" : ""}`}
          strokeWidth={1.5}
          aria-hidden
        />
      </button>
      {open && (
        <div className="space-y-4 border-t border-[color:var(--tr-line)] px-5 py-4">
          <fieldset disabled={locked} className="m-0 min-w-0 space-y-4 border-0 p-0">
            <div>
              <span className={labelClass} id={`${uid}-accent`}>
                Accent
              </span>
              <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-labelledby={`${uid}-accent`}>
                {TRIP_ACCENTS.map((name) => {
                  const selected = selectedAccent === name
                  return (
                    <button
                      key={name}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={ACCENT_LABEL[name]}
                      onClick={() => patch({ accent: name })}
                      className={`flex min-h-11 min-w-11 flex-col items-center gap-1.5 rounded-[var(--tr-r-control)] px-2 py-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--tr-ink)] ${
                        selected ? "bg-[var(--tr-overlay)]" : "hover:bg-[var(--tr-overlay)]"
                      }`}
                    >
                      <span
                        className={`h-8 w-8 rounded-[var(--tr-r-control)] ${
                          selected
                            ? "ring-2 ring-[color:var(--tr-ink)] ring-offset-2 ring-offset-[var(--tr-surface)]"
                            : "opacity-60"
                        }`}
                        style={{ backgroundColor: ACCENT_SWATCH[name] }}
                        aria-hidden
                      />
                      <span
                        className={`text-[11px] ${
                          selected ? "font-medium text-[color:var(--tr-ink)]" : mutedInkClass
                        }`}
                      >
                        {ACCENT_LABEL[name]}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Eyebrow</span>
                <input
                  className={`mt-1.5 ${inputClass}`}
                  value={appearance.eyebrow ?? ""}
                  placeholder="The dossier"
                  onChange={(e) => patch({ eyebrow: e.target.value || undefined })}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Subtitle</span>
                <input
                  className={`mt-1.5 ${inputClass}`}
                  value={appearance.subtitle ?? ""}
                  placeholder="a Seoul & Busan dossier"
                  onChange={(e) => patch({ subtitle: e.target.value || undefined })}
                />
              </label>
            </div>
            <label className="block">
              <span className={labelClass}>Headline</span>
              <textarea
                rows={2}
                className={`mt-1.5 ${inputClass}`}
                value={appearance.headline ?? ""}
                placeholder="Editorial paragraph under the trip title."
                onChange={(e) => patch({ headline: e.target.value || undefined })}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Permalink</span>
              <span className={`mt-1.5 ${fieldShellClass}`}>
                <span className={`shrink-0 select-none text-sm ${mutedInkClass}`}>/trips/</span>
                <input
                  value={trip.slug ?? ""}
                  placeholder="my-trip-2026"
                  aria-label="Trip permalink"
                  onChange={(e) =>
                    onSlugChange(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]+/g, "-")
                        .replace(/-{2,}/g, "-")
                        .slice(0, 80),
                    )
                  }
                  className={bareInputClass}
                />
              </span>
              <span className={`block ${hintClass}`}>Lowercase letters, numbers, hyphens. Must be unique.</span>
            </label>
            <div>
              <span className={labelClass} id={`${uid}-share`}>
                Sharing
              </span>
              <label className="mt-2 flex min-h-11 items-start gap-3">
                <input
                  type="checkbox"
                  className={`mt-0.5 ${checkboxClass}`}
                  checked={Boolean(trip.sharedWithAllUsers)}
                  disabled
                  aria-labelledby={`${uid}-share`}
                  aria-describedby={shareHelpId}
                />
                <span className="text-sm text-[color:var(--tr-ink)]">Shared with all signed-in users</span>
              </label>
              <p id={shareHelpId} className={hintClass}>
                When this is on, every signed-in user can open and edit the trip. When it is off, only
                you and people you add can see it.
              </p>
            </div>
          </fieldset>
        </div>
      )}
    </section>
  )
}

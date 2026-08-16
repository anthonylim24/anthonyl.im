import { useState } from "react"
import { FineTuneCard } from "../beautiful"
import { ACCENT_SWATCH, TRIP_ACCENTS, resolveAccent } from "../theme"
import { hintClass, inputClass, labelClass, mutedInkClass } from "../ui"
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
  const appearance = trip.appearance ?? {}
  const selectedAccent = resolveAccent(appearance.accent)
  const patch = (p: Partial<NonNullable<Trip["appearance"]>>) => onChange({ ...appearance, ...p })

  return (
    <div className="mt-3">
      <FineTuneCard
        title="Appearance"
        open={open}
        onToggle={() => setOpen((o) => !o)}
        swatch={<span className={`h-3.5 w-3.5 rounded-full ${ACCENT_SWATCH[selectedAccent]}`} aria-hidden />}
      >
        <fieldset disabled={locked} className="m-0 min-w-0 space-y-4 border-0 p-0">
          <div>
            <span className={labelClass}>Accent</span>
            <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label="Accent color">
              {TRIP_ACCENTS.map((name) => {
                const selected = selectedAccent === name
                return (
                  <button
                    key={name}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => patch({ accent: name })}
                    // Neutral focus ring on purpose: an accent ring over a grid
                    // of accent swatches vanishes on the matching swatch.
                    className={`flex min-h-11 min-w-11 flex-col items-center gap-1.5 rounded-xl px-2 py-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 dark:focus-visible:ring-stone-100 ${
                      selected ? "bg-stone-900/5 dark:bg-stone-100/10" : "hover:bg-stone-900/5 dark:hover:bg-stone-100/10"
                    }`}
                  >
                    <span
                      className={`h-8 w-8 rounded-full ${ACCENT_SWATCH[name]} ${
                        selected
                          ? "ring-2 ring-stone-900 ring-offset-2 ring-offset-[var(--trips-surface)] dark:ring-stone-100"
                          : "opacity-60"
                      }`}
                      aria-hidden
                    />
                    <span
                      className={`text-[11px] capitalize ${
                        selected
                          ? "font-medium text-stone-900 dark:text-stone-100"
                          : "text-stone-600 dark:text-stone-400"
                      }`}
                    >
                      {name}
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
            <span className="mt-1.5 flex items-center gap-0 overflow-hidden rounded-xl border border-stone-300/90 bg-[var(--trips-surface)] focus-within:border-[color:var(--trips-accent)] focus-within:ring-2 focus-within:ring-[color:var(--trips-focus)] dark:border-stone-700 dark:bg-stone-900">
              <span className={`shrink-0 select-none border-r border-stone-300/90 bg-stone-100 px-2.5 py-2.5 text-sm dark:border-stone-700 dark:bg-stone-800 ${mutedInkClass}`}>
                /trips/
              </span>
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
                className="min-h-11 w-full bg-transparent px-2.5 py-2 text-sm text-stone-900 focus:outline-none dark:text-stone-100"
              />
            </span>
            <span className={`block ${hintClass}`}>Lowercase letters, numbers, hyphens. Must be unique.</span>
          </label>
        </fieldset>
      </FineTuneCard>
    </div>
  )
}

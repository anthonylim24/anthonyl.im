import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { ACCENT_SWATCH, TRIP_ACCENTS, resolveAccent } from "../theme"
import {
  fieldShellClass,
  focusRingClass,
  focusRingInsetClass,
  hintClass,
  inputClass,
  labelClass,
  mutedInkClass,
  overlayHoverClass,
  softPanelClass,
} from "../ui"
import type { Trip } from "../types"
import { sx } from '@/lib/utils'
import { styles } from '../trips.stylex'

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
    <section {...sx('mt-3', softPanelClass)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        {...sx('flex min-h-12 w-full items-center justify-between gap-3 rounded-[length:var(--trips-radius)] px-5 py-3.5 text-left', focusRingInsetClass)}
      >
        <span className="flex items-center gap-2.5 text-[0.9375rem] font-semibold text-[color:var(--trips-ink)]">
          <span {...sx('h-3.5 w-3.5 rounded-full', ACCENT_SWATCH[selectedAccent])} aria-hidden />
          Appearance
          <span {...sx('hidden font-normal sm:inline', mutedInkClass)}>
            accent, dossier copy, permalink
          </span>
        </span>
        <ChevronDown
          {...sx(styles.iconSm, styles.shrink0, styles.transitionTransform, mutedInkClass, open ? "rotate-180" : "")}
          strokeWidth={1.5}
          aria-hidden
        />
      </button>
      {open && (
        <div className="space-y-4 border-t border-[color:var(--trips-border)] px-5 py-4">
        <fieldset disabled={locked} className="m-0 min-w-0 space-y-4 border-0 p-0">
          <div>
            <span {...sx(labelClass)}>Accent</span>
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
                    {...sx('flex min-h-11 min-w-11 flex-col items-center gap-1.5 rounded-[length:var(--trips-radius)] px-2 py-1.5 transition ${overlayHoverClass} ${focusRingClass}', selected ? "bg-[color:var(--trips-rail)]" : "")}
                  >
                    <span
                      {...sx('h-8 w-8 rounded-full ${ACCENT_SWATCH[name]}', selected
                          ? "ring-2 ring-[color:var(--trips-ink)] ring-offset-2 ring-offset-[var(--trips-surface)]"
                          : "opacity-60")}
                      aria-hidden
                    />
                    <span
                      {...sx('text-[11px] capitalize', selected ? "font-medium text-[color:var(--trips-ink)]" : mutedInkClass)}
                    >
                      {name}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label {...sx(styles.block)}>
              <span {...sx(labelClass)}>Eyebrow</span>
              <input
                {...sx('mt-1.5', inputClass)}
                value={appearance.eyebrow ?? ""}
                placeholder="The dossier"
                onChange={(e) => patch({ eyebrow: e.target.value || undefined })}
              />
            </label>
            <label {...sx(styles.block)}>
              <span {...sx(labelClass)}>Subtitle</span>
              <input
                {...sx('mt-1.5', inputClass)}
                value={appearance.subtitle ?? ""}
                placeholder="a Seoul & Busan dossier"
                onChange={(e) => patch({ subtitle: e.target.value || undefined })}
              />
            </label>
          </div>
          <label {...sx(styles.block)}>
            <span {...sx(labelClass)}>Headline</span>
            <textarea
              rows={2}
              {...sx('mt-1.5', inputClass)}
              value={appearance.headline ?? ""}
              placeholder="Editorial paragraph under the trip title."
              onChange={(e) => patch({ headline: e.target.value || undefined })}
            />
          </label>
          <label {...sx(styles.block)}>
            <span {...sx(labelClass)}>Permalink</span>
            <span {...sx('mt-1.5', fieldShellClass, 'gap-0 overflow-hidden px-0')}>
              <span {...sx('shrink-0 select-none border-r border-[color:var(--trips-border)] bg-[color:var(--trips-rail)] px-2.5 py-2.5 text-sm', mutedInkClass)}>
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
                className="min-h-11 w-full bg-transparent px-2.5 py-2 text-sm text-[color:var(--trips-ink)] focus:outline-none"
              />
            </span>
            <span {...sx('block', hintClass)}>Lowercase letters, numbers, hyphens. Must be unique.</span>
          </label>
        </fieldset>
        </div>
      )}
    </section>
  )
}

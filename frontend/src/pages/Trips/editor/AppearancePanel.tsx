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
    <section {...sx(styles.mt3, softPanelClass)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        {...sx(styles.appearanceToggle, focusRingInsetClass)}
      >
        <span {...sx(styles.appearanceTitle)}>
          <span {...sx(styles.accentSwatchDot, ACCENT_SWATCH[selectedAccent])} aria-hidden />
          Appearance
          <span {...sx(styles.hiddenSmInline, styles.fontNormal, mutedInkClass)}>
            accent, dossier copy, permalink
          </span>
        </span>
        <ChevronDown
          {...sx(styles.iconSm, styles.shrink0, styles.transitionTransform, mutedInkClass, open ? styles.rotate180 : undefined)}
          strokeWidth={1.5}
          aria-hidden
        />
      </button>
      {open && (
        <div {...sx(styles.appearanceBody)}>
        <fieldset disabled={locked} {...sx(styles.appearanceFieldset)}>
          <div>
            <span {...sx(labelClass)}>Accent</span>
            <div {...sx(styles.accentSwatchRow)} role="radiogroup" aria-label="Accent color">
              {TRIP_ACCENTS.map((name) => {
                const selected = selectedAccent === name
                return (
                  <button
                    key={name}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => patch({ accent: name })}
                    {...sx(
                      styles.accentSwatchBtn,
                      overlayHoverClass,
                      focusRingClass,
                      selected ? styles.accentSwatchBtnSelected : undefined,
                    )}
                  >
                    <span
                      {...sx(
                        styles.accentSwatchCircle,
                        ACCENT_SWATCH[name],
                        selected ? styles.accentSwatchCircleSelected : styles.accentSwatchCircleIdle,
                      )}
                      aria-hidden
                    />
                    <span
                      {...sx(styles.accentSwatchName, selected ? styles.accentSwatchNameSelected : mutedInkClass)}
                    >
                      {name}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div {...sx(styles.gridCols2SmGap4)}>
            <label {...sx(styles.block)}>
              <span {...sx(labelClass)}>Eyebrow</span>
              <input
                {...sx(styles.mt1_5, inputClass)}
                value={appearance.eyebrow ?? ""}
                placeholder="The dossier"
                onChange={(e) => patch({ eyebrow: e.target.value || undefined })}
              />
            </label>
            <label {...sx(styles.block)}>
              <span {...sx(labelClass)}>Subtitle</span>
              <input
                {...sx(styles.mt1_5, inputClass)}
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
              {...sx(styles.mt1_5, inputClass)}
              value={appearance.headline ?? ""}
              placeholder="Editorial paragraph under the trip title."
              onChange={(e) => patch({ headline: e.target.value || undefined })}
            />
          </label>
          <label {...sx(styles.block)}>
            <span {...sx(labelClass)}>Permalink</span>
            <span {...sx(styles.mt1_5, fieldShellClass, styles.fieldShellNoPad)}>
              <span {...sx(styles.fieldShellPrefix, mutedInkClass)}>
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
                {...sx(styles.slugInput)}
              />
            </span>
            <span {...sx(styles.block, hintClass)}>Lowercase letters, numbers, hyphens. Must be unique.</span>
          </label>
        </fieldset>
        </div>
      )}
    </section>
  )
}

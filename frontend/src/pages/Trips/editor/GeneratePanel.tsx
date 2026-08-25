import { useState, useTransition } from "react"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { motion } from "motion/react"
import { Loader2, Sparkles } from "lucide-react"
import { ACCENT } from "../theme"
import { generateItinerary, type GetToken } from "../tripsApi"
import {
  EASE,
  alertErrorClass,
  inputClass,
  mutedInkClass,
  primaryBtnClass,
  softPanelClass,
  spinnerClass,
  wrapAnywhereClass,
} from "../ui"
import { DEFAULT_ITINERARY_PROMPT, type GeneratePreferences, type Trip } from "../types"
import { sx } from '@/lib/utils'
import { styles } from '../trips.stylex'

/** AI generation for an empty itinerary — also the retry path when
 *  generation failed during the create flow. */
export function GeneratePanel({
  getToken,
  tripId,
  locked = false,
  initialPrompt,
  preferences,
  onGenerated,
}: {
  getToken: GetToken
  tripId: string
  locked?: boolean
  initialPrompt?: string
  preferences?: GeneratePreferences
  onGenerated: (trip: Trip) => void
}) {
  const readToken = useLatestCallback(getToken)
  const [prompt, setPrompt] = useState(initialPrompt ?? DEFAULT_ITINERARY_PROMPT)
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const generate = () => {
    if (busy || locked) return
    setError(null)
    startTransition(async () => {
      try {
        const { trip } = await generateItinerary(readToken, tripId, {
          prompt: prompt.trim() || undefined,
          preferences,
          replaceExisting: true,
        })
        onGenerated(trip)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: EASE }}
      aria-label="Generate itinerary with AI"
      {...sx(styles.mt6, styles.p5, styles.motionPanel, softPanelClass)}
    >
      <h2 {...sx(styles.flexCenterGap2, styles.panelTitleRow)}>
        <Sparkles {...sx(styles.iconSm, ACCENT.text)} strokeWidth={1.5} aria-hidden />
        Draft this itinerary with AI
      </h2>
      <p {...sx(styles.mt1, styles.textSm, mutedInkClass)}>
        The itinerary is empty. Generate a structured starting point, then reshape it. Every place
        the AI adds lands on the map.
      </p>
      <textarea
        value={prompt}
        rows={3}
        aria-label="AI prompt"
        disabled={locked}
        onChange={(e) => setPrompt(e.target.value)}
        {...sx(styles.mt3, inputClass)}
      />
      {error && (
        <p {...sx(styles.mt3, alertErrorClass, wrapAnywhereClass)} role="alert">
          The draft didn’t finish. Your days are unchanged, so you can retry below. ({error})
        </p>
      )}
      <div {...sx(styles.panelActionsRow)}>
        <button type="button" onClick={generate} disabled={busy || locked} aria-busy={busy} {...sx(primaryBtnClass)}>
          {busy ? (
            <Loader2 {...sx(styles.iconSm, spinnerClass)} aria-hidden />
          ) : (
            <Sparkles {...sx(styles.iconSm)} strokeWidth={1.5} aria-hidden />
          )}
          {busy ? "Generating… (~30s)" : error ? "Retry generation" : "Generate itinerary"}
        </button>
        {preferences && Object.values(preferences).some(Boolean) && (
          <span {...sx(styles.textXs, mutedInkClass)}>
            Your traveler preferences from the create form are included.
          </span>
        )}
      </div>
    </motion.section>
  )
}

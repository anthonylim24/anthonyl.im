import { useState } from "react"
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
  const [prompt, setPrompt] = useState(initialPrompt ?? DEFAULT_ITINERARY_PROMPT)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = async () => {
    if (busy || locked) return
    setBusy(true)
    setError(null)
    try {
      const { trip } = await generateItinerary(getToken, tripId, {
        prompt: prompt.trim() || undefined,
        preferences,
        replaceExisting: true,
      })
      onGenerated(trip)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: EASE }}
      aria-label="Generate itinerary with AI"
      className={`mt-6 p-5 motion-reduce:transition-none ${softPanelClass}`}
    >
      <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900 dark:text-stone-100">
        <Sparkles className={`h-4 w-4 ${ACCENT.text}`} strokeWidth={1.5} aria-hidden />
        Draft this itinerary with AI
      </h2>
      <p className={`mt-1 text-sm ${mutedInkClass}`}>
        The itinerary is empty. Generate a structured starting point, then reshape it. Every place
        the AI adds lands on the map.
      </p>
      <textarea
        value={prompt}
        rows={3}
        aria-label="AI prompt"
        disabled={locked}
        onChange={(e) => setPrompt(e.target.value)}
        className={`mt-3 ${inputClass}`}
      />
      {error && (
        <p className={`mt-3 ${alertErrorClass} ${wrapAnywhereClass}`} role="alert">
          The draft didn’t finish. Your days are unchanged, so you can retry below. ({error})
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void generate()} disabled={busy || locked} className={primaryBtnClass}>
          {busy ? (
            <Loader2 className={`h-4 w-4 ${spinnerClass}`} aria-hidden />
          ) : (
            <Sparkles className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          )}
          {busy ? "Generating… (~30s)" : error ? "Retry generation" : "Generate itinerary"}
        </button>
        {preferences && Object.values(preferences).some(Boolean) && (
          <span className={`text-xs ${mutedInkClass}`}>
            Your traveler preferences from the create form are included.
          </span>
        )}
      </div>
    </motion.section>
  )
}

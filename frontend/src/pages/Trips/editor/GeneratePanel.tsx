import { useId, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { Loader2, Sparkles } from "lucide-react"
import { generateItinerary, type GetToken } from "../tripsApi"
import {
  EASE,
  alertErrorClass,
  hintClass,
  inputClass,
  labelClass,
  mutedInkClass,
  panelClass,
  primaryBtnClass,
  spinnerClass,
  wrapAnywhereClass,
} from "../ui"
import { DEFAULT_ITINERARY_PROMPT, type GeneratePreferences, type Trip } from "../types"

/** AI generation for an empty itinerary - also the retry path when
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
  const reduce = useReducedMotion()
  const promptId = useId()

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
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.28, ease: EASE }}
      aria-label="Generate itinerary with AI"
      className={`mt-6 p-5 ${panelClass}`}
    >
      <h2 className="text-base font-semibold text-[color:var(--tr-ink)]">Draft this itinerary</h2>
      <label className={`mt-3 ${labelClass}`} htmlFor={promptId}>
        What to include
      </label>
      <textarea
        id={promptId}
        value={prompt}
        rows={3}
        aria-label="AI prompt"
        disabled={locked}
        onChange={(e) => setPrompt(e.target.value)}
        className={`mt-1.5 ${inputClass}`}
      />
      {error && (
        <p className={`mt-3 ${alertErrorClass} ${wrapAnywhereClass}`} role="alert">
          The draft didn’t finish. Your days are unchanged, so you can retry below. ({error})
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy || locked}
          className={primaryBtnClass}
          aria-describedby={`${promptId}-help`}
        >
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
      <p id={`${promptId}-help`} className={hintClass}>
        This replaces the empty days with a structured starting point. Every place it adds lands on the map.
      </p>
    </motion.section>
  )
}

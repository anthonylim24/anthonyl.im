import { useState, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { BreathingSession } from '@/components/breathing/BreathingSession'
import { BreathPatternStrip } from '@/components/breathing/BreathPatternStrip'
import { CadenceEditor } from '@/components/breathing/CadenceEditor'
import { clampCadenceDuration } from '@/lib/cadenceDurations'
import { ProgressiveHoldLadder } from '@/components/breathing/ProgressiveHoldLadder'
import {
  applyCustomPhaseDurations,
  breathingProtocols,
  calculateSessionDuration,
  getProtocolCatalog,
  hasCustomPhaseDurations,
  isTechniqueId,
  type BreathingProtocol,
  type SessionConfig,
} from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type BreathPhase, type TechniqueId } from '@/lib/constants'
import { formatTime, cn } from '@/lib/utils'
import { parseCustomPhaseDurations } from '@/lib/sessionRoutes'
import { TechniqueGeometryIcon } from '@/components/ui/TechniqueGeometryIcon'
import { Clock, Minus, Plus, Play, ChevronLeft, ChevronDown, ExternalLink, ShieldAlert } from 'lucide-react'
import { useHaptics } from '@/hooks/useHaptics'
import { useViewTransitionNavigate } from '@/hooks/useViewTransition'
import { useEntranceMotion } from '@/lib/motionPresets'

function getInitialRounds(requestedRounds: string | null, techniqueId: TechniqueId): number {
  const parsedRounds = Number(requestedRounds)
  if (Number.isInteger(parsedRounds) && parsedRounds >= 1 && parsedRounds <= 40) {
    return parsedRounds
  }
  return breathingProtocols[techniqueId].defaultRounds
}

function formatCadenceNumber(cadence: number): string {
  return cadence.toFixed(1).replace(/\.0$/, '')
}

function getCadenceLabel(
  protocol: BreathingProtocol,
  displayedProtocol: BreathingProtocol,
  hasCustomCadence: boolean,
): string {
  if (protocol.progressiveHold) {
    return hasCustomCadence ? 'Custom ladder' : `${formatCadenceNumber(protocol.breathsPerMinute)} bpm`
  }

  const cycleDuration = displayedProtocol.phases.reduce(
    (sum, phaseConfig) => sum + phaseConfig.duration,
    0,
  )

  if (cycleDuration <= 0) {
    return `${formatCadenceNumber(protocol.breathsPerMinute)} bpm`
  }

  return `${formatCadenceNumber(60 / cycleDuration)} bpm`
}

interface ProtocolSafetyGateProps {
  protocol: BreathingProtocol
  acknowledged: boolean
  onAcknowledgedChange: (acknowledged: boolean) => void
  idPrefix: string
  compact?: boolean
}

function ProtocolSafetyGate({
  protocol,
  acknowledged,
  onAcknowledgedChange,
  idPrefix,
  compact = false,
}: ProtocolSafetyGateProps) {
  const checklist = protocol.safetyChecklist

  if (!checklist?.length) {
    return null
  }

  const checkboxId = `${idPrefix}-${protocol.id}-safety`
  const noticeId = `${checkboxId}-notice`
  const contraindicationsId = `${checkboxId}-contraindications`
  const checklistId = `${checkboxId}-checklist`
  const describedBy = [
    protocol.safetyNotice ? noticeId : null,
    protocol.contraindications?.length ? contraindicationsId : null,
    checklistId,
  ].filter(Boolean).join(' ')

  return (
    <div
      className={cn(
        'border-y border-bw-border',
        compact ? 'mb-3 py-3' : 'pt-5 pb-6'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border border-bw-border text-bw-accent">
          <ShieldAlert className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[10px] font-medium tracking-[0.07em] uppercase text-bw-secondary">
            Safety check
          </h2>
          {protocol.safetyNotice ? (
            <p id={noticeId} className="mt-2 text-xs leading-relaxed text-bw-tertiary">
              {protocol.safetyNotice}
            </p>
          ) : null}
          {protocol.contraindications?.length ? (
            <div id={contraindicationsId} className="mt-3">
              <h3 className="text-[10px] font-medium uppercase tracking-[0.07em] text-bw-secondary">
                Avoid or consult first
              </h3>
              <ul className="mt-2 space-y-1.5">
                {protocol.contraindications.map((item) => (
                  <li key={item} className="flex gap-2 text-[11px] leading-relaxed text-bw-secondary">
                    <span className="mt-2 h-1 w-1 shrink-0 bg-bw-tertiary" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <ul id={checklistId} className="mt-3 space-y-1.5">
            {checklist.map((item) => (
              <li key={item} className="flex gap-2 text-[11px] leading-relaxed text-bw-secondary">
                <span className="mt-2 h-1 w-1 shrink-0 bg-bw-accent" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <label
            htmlFor={checkboxId}
            className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 border border-bw-border px-3 py-2 text-left transition-colors hover:bg-bw-hover"
          >
            <input
              id={checkboxId}
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => onAcknowledgedChange(event.currentTarget.checked)}
              aria-describedby={describedBy}
              className="h-5 w-5 shrink-0 accent-bw-accent"
            />
            <span className="text-xs font-medium leading-relaxed text-bw">
              I have reviewed the cautions, am in a safe setting, and can stop immediately if needed.
            </span>
          </label>
        </div>
      </div>
    </div>
  )
}

interface EvidenceTrailProps {
  citations: BreathingProtocol['citations']
  compact?: boolean
}

function EvidenceTrail({ citations, compact = false }: EvidenceTrailProps) {
  if (!citations.length) {
    return null
  }

  return (
    <div className={cn('border-t border-bw-border', compact ? 'mt-4 pt-3' : 'mt-5 pt-4')}>
      <h3 className="text-[10px] font-medium tracking-[0.07em] uppercase text-bw-secondary">
        Evidence Trail
      </h3>
      <ul
        aria-label="Protocol evidence sources"
        className={cn(compact ? 'mt-2 space-y-1.5' : 'mt-3 space-y-2')}
      >
        {citations.map((citation) => (
          <li key={`${citation.authors}-${citation.year}-${citation.title}`}>
            <a
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${citation.title} (${citation.authors}, ${citation.year})`}
              className={cn(
                'group flex min-h-11 items-start justify-between gap-3 py-2 transition-colors hover:bg-bw-hover',
                compact ? 'text-xs' : 'text-sm'
              )}
            >
              <span className="min-w-0">
                <span className="block text-[10px] font-medium uppercase tracking-[0.07em] text-bw-secondary">
                  {citation.authors} · {citation.year} · {citation.source}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-bw-tertiary transition-colors group-hover:text-bw-secondary">
                  {citation.title}
                </span>
              </span>
              <ExternalLink
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bw-tertiary transition-colors group-hover:text-bw-accent"
                aria-hidden="true"
              />
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Session() {
  const navigate = useViewTransitionNavigate()
  const {
    reducedMotion,
    stagger,
    fadeUp,
    transition: motionTransition,
    spring,
    tap,
    hoverOpacity,
  } = useEntranceMotion()
  const [searchParams] = useSearchParams()
  const requestedTechnique = searchParams.get('technique')
  const requestedRounds = searchParams.get('rounds')
  const requestedCustomPhaseDurations = parseCustomPhaseDurations(searchParams)
  const initialTechnique = isTechniqueId(requestedTechnique)
    ? requestedTechnique
    : TECHNIQUE_IDS.CYCLIC_SIGHING

  const [selectedTechnique, setSelectedTechnique] =
    useState<TechniqueId>(initialTechnique)
  const [rounds, setRounds] = useState(() =>
    getInitialRounds(requestedRounds, initialTechnique)
  )
  const [customPhaseDurations, setCustomPhaseDurations] =
    useState<Partial<Record<BreathPhase, number>>>(() => requestedCustomPhaseDurations)
  const [sessionStarted, setSessionStarted] = useState(false)
  const [scienceExpanded, setScienceExpanded] = useState(false)
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false)

  const { trigger: haptic } = useHaptics()

  const protocol = breathingProtocols[selectedTechnique]
  const protocols = useMemo(() => getProtocolCatalog(), [])
  const requiresSafetyCheck = Boolean(protocol.safetyChecklist?.length)
  const canStartSession = !requiresSafetyCheck || safetyAcknowledged
  const hasCustomCadence = useMemo(
    () => hasCustomPhaseDurations(protocol, customPhaseDurations),
    [customPhaseDurations, protocol]
  )
  const displayedProtocol = useMemo(
    () => applyCustomPhaseDurations(protocol, customPhaseDurations),
    [customPhaseDurations, protocol]
  )
  const cadenceLabel = useMemo(
    () => getCadenceLabel(protocol, displayedProtocol, hasCustomCadence),
    [displayedProtocol, hasCustomCadence, protocol],
  )

  const sessionConfig: SessionConfig = useMemo(
    () => ({
      techniqueId: selectedTechnique,
      rounds,
      ...(hasCustomCadence ? { customPhaseDurations } : {}),
    }),
    [customPhaseDurations, hasCustomCadence, rounds, selectedTechnique]
  )

  const estimatedDuration = useMemo(
    () => calculateSessionDuration(sessionConfig),
    [sessionConfig]
  )

  const handleTechniqueChange = (techniqueId: TechniqueId) => {
    if (techniqueId === selectedTechnique) {
      return
    }

    haptic(20)
    setSelectedTechnique(techniqueId)
    setRounds(breathingProtocols[techniqueId].defaultRounds)
    setCustomPhaseDurations({})
    setSafetyAcknowledged(false)
  }

  const handleCadenceChange = useCallback((phase: BreathPhase, duration: number) => {
    haptic(10)
    setCustomPhaseDurations((currentDurations) => {
      const defaultDuration = protocol.phases.find((phaseConfig) => phaseConfig.phase === phase)
        ?.duration
      const normalizedDuration = clampCadenceDuration(phase, duration)

      if (!defaultDuration || normalizedDuration === defaultDuration) {
        const nextDurations = { ...currentDurations }
        delete nextDurations[phase]
        return nextDurations
      }

      return {
        ...currentDurations,
        [phase]: normalizedDuration,
      }
    })
  }, [haptic, protocol.phases])

  const handleCadenceReset = useCallback(() => {
    haptic('selection')
    setCustomPhaseDurations({})
  }, [haptic])

  const handleStartSession = () => {
    if (!canStartSession) {
      haptic(10)
      return
    }

    haptic('success')
    setSessionStarted(true)
  }

  const handleSessionComplete = () => {
    setSessionStarted(false)
    navigate('/breathwork/progress')
  }

  const handleSessionCancel = () => {
    setSessionStarted(false)
  }

  if (sessionStarted) {
    return (
      <BreathingSession
        config={sessionConfig}
        onComplete={handleSessionComplete}
        onCancel={handleSessionCancel}
      />
    )
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      {/* ═══ MOBILE LAYOUT ═══════════════════════════════ */}
      <div className="md:hidden flex h-[calc(100dvh-4rem-3rem)] flex-col overflow-y-auto no-scrollbar pb-4">
        {/* Back button */}
        <motion.button
          variants={fadeUp}
          type="button"
          onClick={() => { haptic('light'); navigate('/breathwork') }}
          className="mb-2 -ml-1 flex min-h-11 items-center gap-1 text-xs text-bw-tertiary transition-colors hover:text-bw"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Back</span>
        </motion.button>

        {/* Technique header */}
        <motion.div variants={fadeUp} className="mb-3">
          <div className="flex items-center gap-3 mb-2">
            <div
              className="h-7 w-7 flex items-center justify-center shrink-0 border border-bw-border"
              style={{ viewTransitionName: `technique-icon-${selectedTechnique}` } as React.CSSProperties}
            >
              <TechniqueGeometryIcon techniqueId={selectedTechnique} className="text-bw-accent" size={12} />
            </div>
            <h1
              className="font-display text-2xl font-semibold text-bw leading-none"
              style={{ viewTransitionName: `technique-name-${selectedTechnique}` } as React.CSSProperties}
            >{protocol.name}</h1>
          </div>
          <p className="text-xs text-bw-tertiary leading-relaxed">{protocol.description}</p>
        </motion.div>

        {/* Technique rail */}
        <motion.div variants={fadeUp} className="-mx-5 mb-3 overflow-x-auto no-scrollbar">
          <div
            className="flex gap-2 px-5"
            style={{ width: 'max-content' }}
            role="group"
            aria-label="Technique choices"
          >
            {protocols.map((p) => {
              const isSelected = selectedTechnique === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => handleTechniqueChange(p.id)}
                  className={cn(
                    'flex min-h-11 items-center gap-2 border px-3 text-[10px] font-medium uppercase tracking-[0.07em] transition-colors duration-200',
                    isSelected
                      ? 'border-bw-accent text-bw bg-bw-active'
                      : 'border-bw-border text-bw-tertiary'
                  )}
                >
                  <TechniqueGeometryIcon techniqueId={p.id} className={isSelected ? 'text-bw-accent' : 'text-bw-tertiary'} size={12} />
                  <span>{p.shortName}</span>
                </button>
              )
            })}
          </div>
        </motion.div>

        {/* Phase pattern */}
        <motion.div variants={fadeUp} className="border-t border-bw-border py-3 mb-3">
          <BreathPatternStrip protocol={displayedProtocol} compact animated />
        </motion.div>

        {/* Protocol metadata */}
        <motion.div variants={fadeUp} className="grid grid-cols-3 gap-2 border-y border-bw-border py-2.5 mb-3">
          <div>
            <span className="block text-[9px] text-bw-tertiary font-medium uppercase tracking-[0.07em]">Evidence</span>
            <span className="block text-[10px] text-bw-secondary mt-0.5 truncate">{protocol.evidence}</span>
          </div>
          <div>
            <span className="block text-[9px] text-bw-tertiary font-medium uppercase tracking-[0.07em]">Cadence</span>
            <span className="block text-[10px] text-bw-secondary mt-0.5">{cadenceLabel}</span>
          </div>
          <div>
            <span className="block text-[9px] text-bw-tertiary font-medium uppercase tracking-[0.07em]">Intensity</span>
            <span className="block text-[10px] text-bw-secondary mt-0.5 capitalize">{protocol.intensity}</span>
          </div>
        </motion.div>

        {protocol.caution ? (
          <motion.div
            variants={fadeUp}
            className="mb-3 border-y border-bw-border py-3"
            data-testid="mobile-protocol-caution"
          >
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-bw-accent" aria-hidden="true" />
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.07em] text-bw-secondary">
                  Caution
                </div>
                <p className="mt-1 text-xs leading-relaxed text-bw-tertiary">
                  {protocol.caution}
                </p>
              </div>
            </div>
          </motion.div>
        ) : null}

        {/* Science section — collapsible */}
        {protocol.science && (
          <motion.div variants={fadeUp} className="mb-3">
            <button
              type="button"
              aria-expanded={scienceExpanded}
              aria-controls={`mobile-science-panel-${selectedTechnique}`}
              onClick={() => setScienceExpanded(!scienceExpanded)}
              className="flex min-h-11 w-full items-center justify-between text-left"
            >
              <span className="text-[10px] font-medium text-bw-secondary uppercase tracking-[0.07em]">How it works</span>
              <ChevronDown className={cn(
                'h-3 w-3 text-bw-tertiary transition-transform duration-200',
                scienceExpanded && 'rotate-180'
              )} aria-hidden="true" />
            </button>
            <motion.div
              id={`mobile-science-panel-${selectedTechnique}`}
              initial={false}
              animate={{ height: scienceExpanded ? 'auto' : 0, opacity: scienceExpanded ? 1 : 0 }}
              transition={reducedMotion ? motionTransition : { duration: 0.2 }}
              className="overflow-hidden"
            >
              <p className="mt-2 text-xs text-bw-tertiary leading-relaxed">{protocol.science}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {protocol.bestFor.map((item) => (
                  <span
                    key={item}
                    className="border border-bw-border px-2 py-1 text-[10px] text-bw-tertiary"
                  >
                    {item}
                  </span>
                ))}
              </div>
              <EvidenceTrail citations={protocol.citations} compact />
            </motion.div>
          </motion.div>
        )}

        {requiresSafetyCheck ? (
          <motion.div variants={fadeUp}>
            <ProtocolSafetyGate
              protocol={protocol}
              acknowledged={safetyAcknowledged}
              onAcknowledgedChange={setSafetyAcknowledged}
              idPrefix="mobile"
              compact
            />
          </motion.div>
        ) : null}

        <motion.div variants={fadeUp}>
          <CadenceEditor
            protocol={protocol}
            customDurations={customPhaseDurations}
            onDurationChange={handleCadenceChange}
            onReset={handleCadenceReset}
            compact
          />
        </motion.div>

        <motion.div variants={fadeUp}>
          <ProgressiveHoldLadder
            protocol={protocol}
            rounds={rounds}
            customPhaseDurations={customPhaseDurations}
            compact
          />
        </motion.div>

        {/* Rounds */}
        <motion.div
          variants={fadeUp}
          className="flex min-h-36 flex-1 flex-col items-center justify-center gap-4 pb-24"
          role="group"
          aria-label={`Session rounds, ${rounds} selected`}
        >
          <span className="text-[10px] font-medium text-bw-secondary tracking-[0.07em] uppercase">Rounds</span>
          <div className="flex items-center gap-8">
            <motion.button
              whileTap={tap(0.9)}
              transition={spring}
              type="button"
              aria-label={`Decrease rounds, currently ${rounds} rounds selected`}
              onClick={() => { haptic(15); setRounds((r) => Math.max(1, r - 1)) }}
              disabled={rounds <= 1}
              className="h-11 w-11 border border-bw-border hover:bg-bw-hover disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center transition-all text-bw"
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </motion.button>
            <span className="font-mono text-2xl font-normal tabular-nums text-bw leading-none min-w-[48px] text-center">
              {rounds}
            </span>
            <motion.button
              whileTap={tap(0.9)}
              transition={spring}
              type="button"
              aria-label={`Increase rounds, currently ${rounds} rounds selected`}
              onClick={() => { haptic(15); setRounds((r) => Math.min(40, r + 1)) }}
              disabled={rounds >= 40}
              className="h-11 w-11 border border-bw-border hover:bg-bw-hover disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center transition-all text-bw"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </motion.button>
          </div>
          <span className="text-xs text-bw-tertiary">
            Est. {formatTime(estimatedDuration)}
          </span>
        </motion.div>

        {/* Pinned CTA */}
        <motion.div variants={fadeUp} className="sticky bottom-0 z-10 shrink-0 bg-bw-canvas pt-3 pb-1">
          <button
            type="button"
            onClick={handleStartSession}
            disabled={!canStartSession}
            className="w-full py-3.5 px-6 border border-bw-accent bg-bw-accent font-medium text-bw-accent-foreground text-sm flex items-center justify-center gap-3 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:border-bw-border disabled:bg-bw-active disabled:text-bw-tertiary disabled:hover:opacity-100"
          >
            <span>Begin Session</span>
          </button>
        </motion.div>
      </div>

      {/* ═══ DESKTOP LAYOUT ══════════════════════════════ */}
      <div className="hidden md:flex md:flex-col max-w-2xl mx-auto space-y-8 h-[calc(100dvh-4rem-5rem)] overflow-y-auto no-scrollbar pb-4">
        {/* Header */}
        <motion.div variants={fadeUp}>
          <h1 className="font-display text-4xl font-semibold text-bw leading-none">
            Session Setup
          </h1>
        </motion.div>

        {/* Technique Selection — border-separated list */}
        <motion.div variants={fadeUp}>
          <h2 className="text-[10px] font-medium tracking-[0.07em] uppercase text-bw-secondary mb-4">
            Technique
          </h2>
          <div
            className="divide-y divide-bw-border border-t border-bw-border"
            role="group"
            aria-label="Technique choices"
          >
            {protocols.map((p) => {
              const isSelected = selectedTechnique === p.id

              return (
                <motion.button
                  key={p.id}
                  type="button"
                  aria-pressed={isSelected}
                  whileTap={tap(0.99)}
                  transition={spring}
                  onClick={() => handleTechniqueChange(p.id)}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-4 py-4 text-left transition-colors duration-200',
                    isSelected ? 'bg-bw-active' : 'hover:bg-bw-hover'
                  )}
                >
                  <div
                    className="h-8 w-8 flex items-center justify-center shrink-0 border border-bw-border"
                    style={isSelected ? { viewTransitionName: `technique-icon-${p.id}` } as React.CSSProperties : undefined}
                  >
                    <TechniqueGeometryIcon techniqueId={p.id} className={isSelected ? 'text-bw-accent' : 'text-bw-secondary'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3
                      className={cn(
                        'text-base text-bw leading-tight',
                        isSelected ? 'font-semibold' : 'font-medium'
                      )}
                      style={isSelected ? { viewTransitionName: `technique-name-${p.id}` } as React.CSSProperties : undefined}
                    >{p.name}</h3>
                    <p className="text-xs text-bw-tertiary mt-0.5 line-clamp-1">
                      {p.purpose} · {p.bestFor[0]}
                    </p>
                  </div>
                  <div className="hidden lg:block shrink-0 text-right">
                    <div className="text-[10px] text-bw-secondary font-medium uppercase tracking-[0.07em]">
                      {p.evidence}
                    </div>
                    <div className="text-[10px] text-bw-tertiary capitalize mt-0.5">
                      {p.intensity}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {p.phases.map((phase, i) => (
                      <span key={i} className="flex items-center gap-0.5">
                        <span className="text-[10px] font-mono text-bw-tertiary">
                          {phase.duration}s
                        </span>
                        {i < p.phases.length - 1 && (
                          <span className="text-bw-tertiary text-[10px]">→</span>
                        )}
                      </span>
                    ))}
                  </div>
                  {isSelected && (
                    <div className="h-1.5 w-1.5 bg-bw-accent shrink-0" />
                  )}
                </motion.button>
              )
            })}
          </div>
        </motion.div>

        {/* Selected science */}
        <motion.div variants={fadeUp} className="border-t border-bw-border pt-5">
          <div className="grid grid-cols-[1fr_auto] gap-6">
            <div>
              <h2 className="text-[10px] font-medium tracking-[0.07em] uppercase text-bw-secondary mb-3">
                Protocol Notes
              </h2>
              <p className="text-xs text-bw-tertiary leading-relaxed">
                {protocol.science}
              </p>
              <BreathPatternStrip protocol={displayedProtocol} className="mt-5" animated />
              {protocol.caution && (
                <p className="text-[10px] text-bw-tertiary leading-relaxed mt-3">
                  {protocol.caution}
                </p>
              )}
              <EvidenceTrail citations={protocol.citations} />
            </div>
            <div className="min-w-36 border-l border-bw-border pl-5">
              <div className="text-[10px] text-bw-secondary font-medium uppercase tracking-[0.07em]">
                {protocol.evidence}
              </div>
              <div className="text-[10px] text-bw-tertiary capitalize mt-1">
                {protocol.intensity} · {cadenceLabel}
              </div>
              <div className="mt-4 space-y-1.5">
                {protocol.bestFor.map((item) => (
                  <div key={item} className="text-[10px] text-bw-tertiary">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {requiresSafetyCheck ? (
          <motion.div variants={fadeUp}>
            <ProtocolSafetyGate
              protocol={protocol}
              acknowledged={safetyAcknowledged}
              onAcknowledgedChange={setSafetyAcknowledged}
              idPrefix="desktop"
            />
          </motion.div>
        ) : null}

        <motion.div variants={fadeUp}>
          <CadenceEditor
            protocol={protocol}
            customDurations={customPhaseDurations}
            onDurationChange={handleCadenceChange}
            onReset={handleCadenceReset}
          />
        </motion.div>

        <motion.div variants={fadeUp}>
          <ProgressiveHoldLadder
            protocol={protocol}
            rounds={rounds}
            customPhaseDurations={customPhaseDurations}
          />
        </motion.div>

        {/* Round Counter */}
        <motion.div variants={fadeUp} className="border-t border-bw-border pt-8">
          <div className="space-y-6">
            <label className="text-[10px] font-medium text-bw-secondary tracking-[0.07em] uppercase">
              Number of Rounds
            </label>
            <div
              className="flex items-center justify-center gap-10"
              role="group"
              aria-label={`Session rounds, ${rounds} selected`}
            >
              <motion.button
                whileTap={tap(0.95)}
                transition={spring}
                type="button"
                aria-label={`Decrease rounds, currently ${rounds} rounds selected`}
                onClick={() => { haptic(15); setRounds((r) => Math.max(1, r - 1)) }}
                disabled={rounds <= 1}
                className="h-12 w-12 border border-bw-border hover:bg-bw-hover disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-300 text-bw"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </motion.button>
              <div className="text-center min-w-[80px]">
                <span className="font-mono text-3xl font-normal tabular-nums text-bw leading-none">
                  {rounds}
                </span>
                <span className="block text-[10px] text-bw-secondary mt-2 font-medium tracking-[0.07em] uppercase">
                  rounds
                </span>
              </div>
              <motion.button
                whileTap={tap(0.95)}
                transition={spring}
                type="button"
                aria-label={`Increase rounds, currently ${rounds} rounds selected`}
                onClick={() => { haptic(15); setRounds((r) => Math.min(40, r + 1)) }}
                disabled={rounds >= 40}
                className="h-12 w-12 border border-bw-border hover:bg-bw-hover disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-300 text-bw"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </motion.button>
            </div>

            <div className="flex items-center justify-center gap-2 py-3 border-t border-bw-border">
              <Clock className="h-3.5 w-3.5 text-bw-tertiary" aria-hidden="true" />
              <span className="text-xs text-bw-tertiary">Estimated</span>
              <span className="font-mono font-medium text-sm text-bw tabular-nums">
                {formatTime(estimatedDuration)}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Start Button */}
        <motion.button
          type="button"
          variants={fadeUp}
          whileTap={tap(0.98)}
          whileHover={canStartSession ? hoverOpacity(0.8) : undefined}
          transition={spring}
          onClick={handleStartSession}
          disabled={!canStartSession}
          className="w-full py-4 px-6 border border-bw-accent bg-bw-accent font-medium text-bw-accent-foreground text-sm flex items-center justify-center gap-3 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:border-bw-border disabled:bg-bw-active disabled:text-bw-tertiary disabled:hover:opacity-100"
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          <span>Begin {protocol.name}</span>
        </motion.button>
      </div>
    </motion.div>
  )
}

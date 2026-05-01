import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { BreathingSession } from '@/components/breathing/BreathingSession'
import {
  breathingProtocols,
  calculateSessionDuration,
  getProtocolCatalog,
  isTechniqueId,
  type SessionConfig,
} from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { formatTime, cn } from '@/lib/utils'
import { TechniqueGeometryIcon } from '@/components/ui/TechniqueGeometryIcon'
import { Clock, Minus, Plus, Play, ChevronLeft, ChevronDown } from 'lucide-react'
import { useHaptics } from '@/hooks/useHaptics'
import { useViewTransitionNavigate } from '@/hooks/useViewTransition'

const motionTransition = { type: 'tween' as const, duration: 0.6, ease: [0.33, 0, 0, 1] as const }
const spring = { type: 'spring' as const, stiffness: 300, damping: 30, mass: 1 }
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const fadeUp = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: motionTransition } }

export function Session() {
  const navigate = useViewTransitionNavigate()
  const [searchParams] = useSearchParams()
  const requestedTechnique = searchParams.get('technique')
  const initialTechnique = isTechniqueId(requestedTechnique)
    ? requestedTechnique
    : TECHNIQUE_IDS.CYCLIC_SIGHING

  const [selectedTechnique, setSelectedTechnique] =
    useState<TechniqueId>(initialTechnique)
  const [rounds, setRounds] = useState(
    breathingProtocols[initialTechnique].defaultRounds
  )
  const [sessionStarted, setSessionStarted] = useState(false)
  const [scienceExpanded, setScienceExpanded] = useState(false)

  const { trigger: haptic } = useHaptics()

  const protocol = breathingProtocols[selectedTechnique]
  const protocols = useMemo(() => getProtocolCatalog(), [])

  const sessionConfig: SessionConfig = useMemo(
    () => ({
      techniqueId: selectedTechnique,
      rounds,
    }),
    [selectedTechnique, rounds]
  )

  const estimatedDuration = useMemo(
    () => calculateSessionDuration(sessionConfig),
    [sessionConfig]
  )

  const handleTechniqueChange = (techniqueId: TechniqueId) => {
    haptic(20)
    setSelectedTechnique(techniqueId)
    setRounds(breathingProtocols[techniqueId].defaultRounds)
  }

  const handleStartSession = () => {
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
      <div className="md:hidden flex flex-col h-[calc(100dvh-4rem-3rem)] overflow-hidden">
        {/* Back button */}
        <motion.button
          variants={fadeUp}
          onClick={() => { haptic('light'); navigate('/breathwork') }}
          className="flex items-center gap-1 text-xs text-bw-tertiary hover:text-bw transition-colors mb-2 -ml-1"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Back</span>
        </motion.button>

        {/* Technique header */}
        <motion.div variants={fadeUp} className="mb-3">
          <div className="flex items-center gap-3 mb-2">
            <div
              className="h-7 w-7 flex items-center justify-center shrink-0 border border-bw-border"
              style={{ viewTransitionName: `technique-icon-${selectedTechnique}` } as React.CSSProperties}
            >
              <TechniqueGeometryIcon techniqueId={selectedTechnique} className="text-bw-secondary" size={12} />
            </div>
            <h1
              className="font-mono text-sm font-medium text-bw tracking-[0.02em]"
              style={{ viewTransitionName: `technique-name-${selectedTechnique}` } as React.CSSProperties}
            >{protocol.name}</h1>
          </div>
          <p className="text-xs text-bw-tertiary leading-relaxed">{protocol.description}</p>
        </motion.div>

        {/* Technique rail */}
        <motion.div variants={fadeUp} className="-mx-5 mb-3 overflow-x-auto no-scrollbar">
          <div className="flex gap-2 px-5" style={{ width: 'max-content' }}>
            {protocols.map((p) => {
              const isSelected = selectedTechnique === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => handleTechniqueChange(p.id)}
                  className={cn(
                    'h-10 px-3 flex items-center gap-2 border text-[10px] font-mono font-medium uppercase tracking-[0.07em] transition-colors duration-200',
                    isSelected
                      ? 'border-bw text-bw bg-bw-hover'
                      : 'border-bw-border text-bw-tertiary'
                  )}
                >
                  <TechniqueGeometryIcon techniqueId={p.id} className={isSelected ? 'text-bw' : 'text-bw-tertiary'} size={12} />
                  <span>{p.shortName}</span>
                </button>
              )
            })}
          </div>
        </motion.div>

        {/* Phase pattern */}
        <motion.div variants={fadeUp} className="flex items-center gap-2 py-2 border-t border-bw-border mb-3 justify-center">
          {protocol.phases.map((phase, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className="text-xs font-mono text-bw-secondary">{phase.duration}s</span>
              {i < protocol.phases.length - 1 && (
                <span className="text-bw-tertiary">→</span>
              )}
            </span>
          ))}
        </motion.div>

        {/* Protocol metadata */}
        <motion.div variants={fadeUp} className="grid grid-cols-3 gap-2 border-y border-bw-border py-2.5 mb-3">
          <div>
            <span className="block text-[9px] text-bw-tertiary font-medium uppercase tracking-[0.07em]">Evidence</span>
            <span className="block text-[10px] text-bw-secondary mt-0.5 truncate">{protocol.evidence}</span>
          </div>
          <div>
            <span className="block text-[9px] text-bw-tertiary font-medium uppercase tracking-[0.07em]">Cadence</span>
            <span className="block text-[10px] text-bw-secondary mt-0.5">{protocol.breathsPerMinute} bpm</span>
          </div>
          <div>
            <span className="block text-[9px] text-bw-tertiary font-medium uppercase tracking-[0.07em]">Intensity</span>
            <span className="block text-[10px] text-bw-secondary mt-0.5 capitalize">{protocol.intensity}</span>
          </div>
        </motion.div>

        {/* Science section — collapsible */}
        {protocol.science && (
          <motion.div variants={fadeUp} className="mb-3">
            <button
              onClick={() => setScienceExpanded(!scienceExpanded)}
              className="flex items-center justify-between w-full text-left"
            >
              <span className="text-[10px] font-medium text-bw-secondary uppercase tracking-[0.07em]">How it works</span>
              <ChevronDown className={cn(
                'h-3 w-3 text-bw-tertiary transition-transform duration-200',
                scienceExpanded && 'rotate-180'
              )} />
            </button>
            <motion.div
              initial={false}
              animate={{ height: scienceExpanded ? 'auto' : 0, opacity: scienceExpanded ? 1 : 0 }}
              transition={{ duration: 0.2 }}
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
              {protocol.caution && (
                <p className="mt-3 text-[10px] text-bw-tertiary leading-relaxed">
                  {protocol.caution}
                </p>
              )}
            </motion.div>
          </motion.div>
        )}

        {/* Rounds */}
        <motion.div variants={fadeUp} className="flex-1 flex flex-col items-center justify-center gap-4">
          <span className="text-[10px] font-medium text-bw-secondary tracking-[0.07em] uppercase">Rounds</span>
          <div className="flex items-center gap-8">
            <motion.button
              whileTap={{ scale: 0.9 }}
              transition={spring}
              onClick={() => { haptic(15); setRounds((r) => Math.max(1, r - 1)) }}
              disabled={rounds <= 1}
              className="h-11 w-11 border border-bw-border hover:bg-bw-hover disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center transition-all text-bw"
            >
              <Minus className="h-4 w-4" />
            </motion.button>
            <span className="font-mono text-2xl font-normal tabular-nums text-bw leading-none min-w-[48px] text-center">
              {rounds}
            </span>
            <motion.button
              whileTap={{ scale: 0.9 }}
              transition={spring}
              onClick={() => { haptic(15); setRounds((r) => Math.min(40, r + 1)) }}
              disabled={rounds >= 40}
              className="h-11 w-11 border border-bw-border hover:bg-bw-hover disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center transition-all text-bw"
            >
              <Plus className="h-4 w-4" />
            </motion.button>
          </div>
          <span className="text-xs text-bw-tertiary">
            Est. {formatTime(estimatedDuration)}
          </span>
        </motion.div>

        {/* Pinned CTA */}
        <motion.div variants={fadeUp} className="pt-3 shrink-0">
          <button
            onClick={handleStartSession}
            className="w-full py-3.5 px-6 border border-bw-border bg-transparent font-mono font-medium text-bw text-sm flex items-center justify-center gap-3 hover:bg-bw-hover transition-colors"
          >
            <span>Begin Session</span>
          </button>
        </motion.div>
      </div>

      {/* ═══ DESKTOP LAYOUT ══════════════════════════════ */}
      <div className="hidden md:flex md:flex-col max-w-2xl mx-auto space-y-8 h-[calc(100dvh-4rem-5rem)] overflow-y-auto no-scrollbar pb-4">
        {/* Header */}
        <motion.div variants={fadeUp}>
          <h1 className="font-mono text-lg font-medium text-bw tracking-[0.02em]">
            Session Setup
          </h1>
        </motion.div>

        {/* Technique Selection — border-separated list */}
        <motion.div variants={fadeUp}>
          <h2 className="text-[10px] font-medium tracking-[0.07em] uppercase text-bw-secondary mb-4">
            Technique
          </h2>
          <div className="divide-y divide-bw-border border-t border-bw-border">
            {protocols.map((p) => {
              const isSelected = selectedTechnique === p.id

              return (
                <motion.button
                  key={p.id}
                  whileTap={{ scale: 0.99 }}
                  transition={spring}
                  onClick={() => handleTechniqueChange(p.id)}
                  className={cn(
                    'w-full flex items-center gap-4 py-4 text-left transition-colors duration-200',
                    isSelected ? 'bg-bw-hover' : 'hover:bg-bw-hover'
                  )}
                >
                  <div
                    className="h-8 w-8 flex items-center justify-center shrink-0 border border-bw-border"
                    style={isSelected ? { viewTransitionName: `technique-icon-${p.id}` } as React.CSSProperties : undefined}
                  >
                    <TechniqueGeometryIcon techniqueId={p.id} className="text-bw-secondary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3
                      className={cn(
                        'font-mono text-sm text-bw leading-tight',
                        isSelected ? 'font-medium' : 'font-normal'
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
                    <div className="h-1.5 w-1.5 bg-bw shrink-0" />
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
              {protocol.caution && (
                <p className="text-[10px] text-bw-tertiary leading-relaxed mt-3">
                  {protocol.caution}
                </p>
              )}
            </div>
            <div className="min-w-36 border-l border-bw-border pl-5">
              <div className="text-[10px] text-bw-secondary font-medium uppercase tracking-[0.07em]">
                {protocol.evidence}
              </div>
              <div className="text-[10px] text-bw-tertiary capitalize mt-1">
                {protocol.intensity} · {protocol.breathsPerMinute} bpm
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

        {/* Round Counter */}
        <motion.div variants={fadeUp} className="border-t border-bw-border pt-8">
          <div className="space-y-6">
            <label className="text-[10px] font-medium text-bw-secondary tracking-[0.07em] uppercase">
              Number of Rounds
            </label>
            <div className="flex items-center justify-center gap-10">
              <motion.button
                whileTap={{ scale: 0.95 }}
                transition={spring}
                onClick={() => { haptic(15); setRounds((r) => Math.max(1, r - 1)) }}
                disabled={rounds <= 1}
                className="h-12 w-12 border border-bw-border hover:bg-bw-hover disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-300 text-bw"
              >
                <Minus className="h-4 w-4" />
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
                whileTap={{ scale: 0.95 }}
                transition={spring}
                onClick={() => { haptic(15); setRounds((r) => Math.min(40, r + 1)) }}
                disabled={rounds >= 40}
                className="h-12 w-12 border border-bw-border hover:bg-bw-hover disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-300 text-bw"
              >
                <Plus className="h-4 w-4" />
              </motion.button>
            </div>

            <div className="flex items-center justify-center gap-2 py-3 border-t border-bw-border">
              <Clock className="h-3.5 w-3.5 text-bw-tertiary" />
              <span className="text-xs text-bw-tertiary">Estimated</span>
              <span className="font-mono font-medium text-sm text-bw tabular-nums">
                {formatTime(estimatedDuration)}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Start Button */}
        <motion.button
          variants={fadeUp}
          whileTap={{ scale: 0.98 }}
          whileHover={{ opacity: 0.8 }}
          transition={spring}
          onClick={handleStartSession}
          className="w-full py-4 px-6 border border-bw-border bg-transparent font-mono font-medium text-bw text-sm flex items-center justify-center gap-3 hover:bg-bw-hover transition-colors"
        >
          <Play className="h-4 w-4" />
          <span>Begin {protocol.name}</span>
        </motion.button>
      </div>
    </motion.div>
  )
}

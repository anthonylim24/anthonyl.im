import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { BreathingSession } from '@/components/breathing/BreathingSession'
import {
  breathingProtocols,
  calculateSessionDuration,
  type SessionConfig,
} from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { formatTime, cn } from '@/lib/utils'
import { ACCENT_BRIGHT } from '@/lib/palette'
import { techniqueGradientStyle, techniqueActiveStyle } from '@/lib/techniqueConfig'
import { Wind, Flame, Box, Clock, Minus, Plus, Play, Heart } from 'lucide-react'

const spring = { type: 'spring' as const, stiffness: 300, damping: 30, mass: 1 }
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } }
const fadeUp = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: spring } }

const techniqueIcons: Record<TechniqueId, React.ReactNode> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: <Box className="h-5 w-5" />,
  [TECHNIQUE_IDS.CO2_TOLERANCE]: <Flame className="h-5 w-5" />,
  [TECHNIQUE_IDS.POWER_BREATHING]: <Wind className="h-5 w-5" />,
  [TECHNIQUE_IDS.CYCLIC_SIGHING]: <Heart className="h-5 w-5" />,
}

export function Session() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialTechnique =
    (searchParams.get('technique') as TechniqueId) || TECHNIQUE_IDS.BOX_BREATHING

  const [selectedTechnique, setSelectedTechnique] =
    useState<TechniqueId>(initialTechnique)
  const [rounds, setRounds] = useState(
    breathingProtocols[initialTechnique].defaultRounds
  )
  const [sessionStarted, setSessionStarted] = useState(false)

  const protocol = breathingProtocols[selectedTechnique]

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
    setSelectedTechnique(techniqueId)
    setRounds(breathingProtocols[techniqueId].defaultRounds)
  }

  const handleStartSession = () => {
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
    <motion.div className="pb-4" variants={stagger} initial="hidden" animate="show">
      <div className="max-w-2xl mx-auto space-y-10 sm:space-y-14">
        {/* Header */}
        <motion.div variants={fadeUp}>
          <h1 className="font-display text-[clamp(2rem,6vw,3rem)] font-extrabold text-white tracking-[-0.02em] leading-[0.95]">
            Session Setup
          </h1>
          <p className="text-sm text-white/30 mt-2 tracking-wide">
            Choose your technique and customize
          </p>
        </motion.div>

        {/* Technique Selection - horizontal pill picker on mobile, 3-col on sm+ */}
        <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {Object.values(TECHNIQUE_IDS).map((id) => {
            const p = breathingProtocols[id]
            const isSelected = selectedTechnique === id

            return (
              <motion.button
                key={id}
                whileTap={{ scale: 0.98 }}
                transition={spring}
                onClick={() => handleTechniqueChange(id)}
                className={cn(
                  'card-elevated rounded-[20px] p-5 text-left transition-all duration-300',
                  'border',
                  !isSelected && 'border-white/5 hover:border-white/10'
                )}
                style={isSelected ? techniqueActiveStyle(id) : undefined}
              >
                <div
                  className="h-12 w-12 rounded-2xl flex items-center justify-center mb-3"
                  style={techniqueGradientStyle(id)}
                >
                  <span className="text-white">{techniqueIcons[id]}</span>
                </div>
                <h3 className="font-display text-base font-bold text-white mb-0.5">{p.name}</h3>
                <p className="text-xs text-white/35 leading-relaxed line-clamp-2">
                  {p.purpose}
                </p>
                {/* Phase pattern */}
                <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                  {p.phases.map((phase, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <span className="px-2 py-0.5 rounded-md surface-inset text-[10px] font-mono text-white/45">
                        {phase.duration}s
                      </span>
                      {i < p.phases.length - 1 && (
                        <span className="text-white/15 text-[10px]">→</span>
                      )}
                    </span>
                  ))}
                </div>
              </motion.button>
            )
          })}
        </motion.div>

        {/* Selected technique detail */}
        <motion.div variants={fadeUp} className="card-elevated rounded-[20px] p-5">
          <div className="flex items-start gap-4">
            <div
              className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0"
              style={techniqueGradientStyle(selectedTechnique)}
            >
              <span className="text-white">{techniqueIcons[selectedTechnique]}</span>
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-lg font-bold text-white">{protocol.name}</h3>
              <p className="mt-1 text-sm text-white/35 leading-relaxed">{protocol.description}</p>
            </div>
          </div>
          {protocol.science && (
            <div className="mt-4 pt-4 border-t border-white/5">
              <span className="text-[10px] font-semibold text-white/25 uppercase tracking-wider">How it works</span>
              <p className="mt-1.5 text-xs text-white/30 leading-relaxed">{protocol.science}</p>
            </div>
          )}
        </motion.div>

        {/* Round Counter */}
        <motion.div variants={fadeUp} className="card-elevated rounded-[24px] overflow-hidden">
          <div className="p-6 sm:p-8 space-y-8">
            {/* Rounds */}
            <div className="space-y-5">
              <label className="text-xs font-medium text-white/40 tracking-wide uppercase">
                Number of Rounds
              </label>
              <div className="flex items-center justify-center gap-6 sm:gap-10">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  transition={spring}
                  onClick={() => setRounds((r) => Math.max(1, r - 1))}
                  disabled={rounds <= 1}
                  className="h-14 w-14 rounded-2xl surface-inset hover:bg-white/5 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-300 text-white"
                >
                  <Minus className="h-5 w-5" />
                </motion.button>
                <div className="text-center min-w-[100px]">
                  <span className="font-display text-6xl sm:text-7xl font-extrabold tabular-nums text-white leading-none">
                    {rounds}
                  </span>
                  <span className="block text-xs text-white/35 mt-2 font-medium tracking-wide uppercase">
                    rounds
                  </span>
                </div>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  transition={spring}
                  onClick={() => setRounds((r) => Math.min(40, r + 1))}
                  disabled={rounds >= 40}
                  className="h-14 w-14 rounded-2xl surface-inset hover:bg-white/5 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-300 text-white"
                >
                  <Plus className="h-5 w-5" />
                </motion.button>
              </div>
            </div>

            {/* Estimated Duration */}
            <div className="flex items-center justify-center gap-3 py-4 px-6 rounded-2xl surface-inset">
              <Clock className="h-4.5 w-4.5 text-white/30" />
              <span className="text-sm text-white/35">Estimated</span>
              <span className="font-display font-bold text-lg text-white tabular-nums">
                {formatTime(estimatedDuration)}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Start Button */}
        <motion.button
          variants={fadeUp}
          whileTap={{ scale: 0.98 }}
          whileHover={{ scale: 1.02 }}
          transition={spring}
          onClick={handleStartSession}
          className="w-full py-5 px-6 rounded-[20px] font-display font-bold text-white text-lg flex items-center justify-center gap-3"
          style={{
            ...techniqueGradientStyle(selectedTechnique),
            boxShadow: `0 20px 40px -12px ${ACCENT_BRIGHT}40`,
          }}
        >
          <Play className="h-5 w-5" />
          Begin {protocol.name}
        </motion.button>
      </div>
    </motion.div>
  )
}

import { BREATH_PHASES, TECHNIQUE_IDS, type BreathPhase, type TechniqueId } from './constants'

export interface PhaseConfig {
  phase: BreathPhase
  duration: number // in seconds
}

export type ProtocolCategory = 'calm' | 'sleep' | 'performance' | 'recovery' | 'focus'
export type ProtocolIntensity = 'gentle' | 'moderate' | 'advanced'
export type ProtocolEvidenceLevel = 'strong' | 'promising' | 'traditional'

export const MIN_SESSION_ROUNDS = 1
export const BASE_MAX_SESSION_ROUNDS = 40

export interface ProtocolCitation {
  authors: string
  title: string
  source: string
  year: number
  url: string
}

export interface BreathingProtocol {
  id: TechniqueId
  name: string
  shortName: string
  description: string
  science: string
  evidence: string
  evidenceLevel: ProtocolEvidenceLevel
  citations: ProtocolCitation[]
  purpose: string
  category: ProtocolCategory
  intensity: ProtocolIntensity
  bestFor: string[]
  breathsPerMinute: number
  caution?: string
  safetyNotice?: string
  contraindications?: string[]
  safetyChecklist?: string[]
  defaultRounds: number
  phases: PhaseConfig[]
  progressiveHold?: boolean // For CO2 tables - hold times increase each round
  holdIncrement?: number // Seconds to add per round for progressive holds
}

export const protocolOrder: TechniqueId[] = [
  TECHNIQUE_IDS.CYCLIC_SIGHING,
  TECHNIQUE_IDS.RESONANCE_BREATHING,
  TECHNIQUE_IDS.DIAPHRAGMATIC_BREATHING,
  TECHNIQUE_IDS.EXTENDED_EXHALE,
  TECHNIQUE_IDS.BOX_BREATHING,
  TECHNIQUE_IDS.FOUR_SEVEN_EIGHT,
  TECHNIQUE_IDS.CO2_TOLERANCE,
  TECHNIQUE_IDS.PURSED_LIP_RECOVERY,
  TECHNIQUE_IDS.POWER_BREATHING,
]

const protocolCitations = {
  balban2023: {
    authors: 'Balban et al.',
    title: 'Brief structured respiration practices enhance mood and reduce physiological arousal',
    source: 'Cell Reports Medicine',
    year: 2023,
    url: 'https://doi.org/10.1016/j.xcrm.2022.100895',
  },
  zaccaro2018: {
    authors: 'Zaccaro et al.',
    title: 'How Breath-Control Can Change Your Life: A Systematic Review on Psycho-Physiological Correlates of Slow Breathing',
    source: 'Frontiers in Human Neuroscience',
    year: 2018,
    url: 'https://doi.org/10.3389/fnhum.2018.00353',
  },
  lehrer2014: {
    authors: 'Lehrer and Gevirtz',
    title: 'Heart rate variability biofeedback: how and why does it work?',
    source: 'Frontiers in Psychology',
    year: 2014,
    url: 'https://doi.org/10.3389/fpsyg.2014.00756',
  },
  kox2014: {
    authors: 'Kox et al.',
    title: 'Voluntary activation of the sympathetic nervous system and attenuation of the innate immune response in humans',
    source: 'PNAS',
    year: 2014,
    url: 'https://doi.org/10.1073/pnas.1322174111',
  },
  parkes2006: {
    authors: 'Parkes',
    title: 'Breath-holding and its breakpoint',
    source: 'Experimental Physiology',
    year: 2006,
    url: 'https://doi.org/10.1113/expphysiol.2005.031625',
  },
  murphey2020: {
    authors: 'Murphey and Lafrenz',
    title: 'Effects of nasal only and apnea breathing on performance in trained cyclists',
    source: 'International Journal of Exercise Science: Conference Proceedings',
    year: 2020,
    url: 'https://digitalcommons.wku.edu/ijesab/vol8/iss8/5/',
  },
  dogan2026: {
    authors: 'Dogan and Sungur',
    title: 'The effect of 4-7-8 breathing exercise training on sleep quality of undergraduate nursing students: A randomized controlled study',
    source: 'European Journal of Integrative Medicine',
    year: 2026,
    url: 'https://doi.org/10.1016/j.eujim.2026.102620',
  },
  kirazli2026: {
    authors: 'Kirazli et al.',
    title: 'The Effect of 4-7-8 Breathing Exercise Technique on Tinnitus Handicap, Psychological Factors, and Sleep Quality in Tinnitus Patients: A Randomized Controlled Study',
    source: 'Brain and Behavior',
    year: 2026,
    url: 'https://doi.org/10.1002/brb3.70854',
  },
  ubolnuar2019: {
    authors: 'Ubolnuar et al.',
    title: 'Effects of Breathing Exercises in Patients With Chronic Obstructive Pulmonary Disease: Systematic Review and Meta-Analysis',
    source: 'Annals of Rehabilitation Medicine',
    year: 2019,
    url: 'https://doi.org/10.5535/arm.2019.43.4.509',
  },
  burge2024: {
    authors: 'Burge et al.',
    title: 'Breathing techniques to reduce symptoms in people with serious respiratory illness: a systematic review',
    source: 'European Respiratory Review',
    year: 2024,
    url: 'https://doi.org/10.1183/16000617.0012-2024',
  },
  nield2007: {
    authors: 'Nield et al.',
    title: 'Efficacy of pursed-lips breathing: a breathing pattern retraining strategy for dyspnea reduction',
    source: 'Journal of Cardiopulmonary Rehabilitation and Prevention',
    year: 2007,
    url: 'https://doi.org/10.1097/01.HCR.0000281770.82652.cb',
  },
  ma2017: {
    authors: 'Ma et al.',
    title: 'The Effect of Diaphragmatic Breathing on Attention, Negative Affect and Stress in Healthy Adults',
    source: 'Frontiers in Psychology',
    year: 2017,
    url: 'https://doi.org/10.3389/fpsyg.2017.00874',
  },
  kwon2026: {
    authors: 'Kwon et al.',
    title: 'The health effects of diaphragmatic breathing: A systematic review',
    source: 'Complementary Therapies in Medicine',
    year: 2026,
    url: 'https://doi.org/10.1016/j.ctim.2025.103317',
  },
} satisfies Record<string, ProtocolCitation>

export const breathingProtocols: Record<TechniqueId, BreathingProtocol> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: {
    id: TECHNIQUE_IDS.BOX_BREATHING,
    name: 'Box Breathing',
    shortName: 'Box',
    description: 'Equal-duration 4-second phases at 3.75 breaths/min. A simple, structured cadence adopted in performance and clinical stress-management settings.',
    science: 'The equal-phase pattern slows respiratory rhythm and gives attention a predictable timing anchor. In Balban et al., box breathing was one of several 5-minute daily practices associated with lower anxiety and negative affect; broader slow-breathing reviews also link paced breathing with HRV and reduced arousal. Evidence for the named box protocol is promising rather than definitive, so BreathFlow treats it as a practical stress-regulation drill.',
    evidence: 'Clinical stress protocol',
    evidenceLevel: 'promising',
    citations: [protocolCitations.balban2023, protocolCitations.zaccaro2018],
    purpose: 'Calm the nervous system under stress',
    category: 'focus',
    intensity: 'moderate',
    bestFor: ['Pre-performance calm', 'Acute stress', 'Steady focus'],
    breathsPerMinute: 3.75,
    caution: 'Use a softer ratio if breath holds create strain.',
    defaultRounds: 19, // 19 × 16s = 304s ≈ 5 min (systematic review: <5 min sessions 67% ineffective)
    phases: [
      { phase: BREATH_PHASES.INHALE, duration: 4 },
      { phase: BREATH_PHASES.HOLD_IN, duration: 4 },
      { phase: BREATH_PHASES.EXHALE, duration: 4 },
      { phase: BREATH_PHASES.HOLD_OUT, duration: 4 },
    ],
  },

  [TECHNIQUE_IDS.CO2_TOLERANCE]: {
    id: TECHNIQUE_IDS.CO2_TOLERANCE,
    name: 'CO2 Tolerance Table',
    shortName: 'CO2 Table',
    description: 'Progressive breath holds that increase by 5s each round, training your body to tolerate higher CO2 levels. Adapted from freediving CO2 table protocols.',
    science: 'Holding your breath raises blood CO2, which normally triggers the urge to breathe. Progressive tables rehearse staying composed as that signal rises. Breath-hold physiology is well described, and a small conference study of nasal/apnea training in cyclists reported improved CO2 tolerance and threshold-power measures after 6 weeks. Because performance evidence is limited, BreathFlow treats this as stress-inoculation and composure training, not a guaranteed endurance boost.',
    evidence: 'Performance protocol',
    evidenceLevel: 'promising',
    citations: [protocolCitations.parkes2006, protocolCitations.murphey2020],
    purpose: 'Build CO2 tolerance for performance and composure',
    category: 'performance',
    intensity: 'advanced',
    bestFor: ['Stress inoculation', 'Performance composure', 'Breath-hold training'],
    breathsPerMinute: 1.2,
    caution: 'Practice seated or lying down. Stop immediately if dizzy, tingling, or panicked.',
    safetyNotice: 'This protocol uses progressive breath holds. Confirm a low-risk setting before starting.',
    contraindications: [
      'Avoid during pregnancy or with a history of seizures, epilepsy, or fainting.',
      'Consult a clinician first if you have cardiovascular disease, uncontrolled blood pressure, respiratory disease, or another serious health condition.',
    ],
    safetyChecklist: [
      'I am seated or lying down.',
      'I am not driving, swimming, bathing, standing, or near water.',
      'I will stop immediately if I feel dizzy, tingling, panicked, or uncomfortable.',
    ],
    defaultRounds: 8, // 8 rounds = 388s ≈ 6.5 min (already above 5 min minimum)
    phases: [
      { phase: BREATH_PHASES.INHALE, duration: 3 },
      { phase: BREATH_PHASES.HOLD_IN, duration: 15 }, // Starting hold, increases each round
      { phase: BREATH_PHASES.EXHALE, duration: 3 },
      { phase: BREATH_PHASES.REST, duration: 10 },
    ],
    progressiveHold: true,
    holdIncrement: 5, // Add 5 seconds to hold each round
  },

  [TECHNIQUE_IDS.POWER_BREATHING]: {
    id: TECHNIQUE_IDS.POWER_BREATHING,
    name: 'Power Breathing',
    shortName: 'Power',
    description: '30 rapid deep breaths at 15 breaths/min. Based on Wim Hof-style hyperventilation studied as one part of Kox et al. 2014.',
    science: 'Controlled hyperventilation lowers blood CO2 and can create a short-lived high-arousal state with tingling or lightheadedness. Kox et al. studied trained participants after a multi-component program that included breathing, meditation, and cold exposure during experimental endotoxemia; it does not show that an app session independently treats inflammation or modulates immunity. BreathFlow treats this as alertness and activation training only.',
    evidence: 'Clinical trial lineage',
    evidenceLevel: 'promising',
    citations: [protocolCitations.kox2014],
    purpose: 'Sympathetic activation and alertness',
    category: 'performance',
    intensity: 'advanced',
    bestFor: ['Morning activation', 'Cold exposure prep', 'High-energy focus'],
    breathsPerMinute: 15,
    caution: 'Never practice while driving, standing, swimming, or in water. Stop if lightheaded.',
    safetyNotice: 'This protocol uses controlled hyperventilation. Confirm a low-risk setting before starting.',
    contraindications: [
      'Avoid during pregnancy or with a history of seizures, epilepsy, or fainting.',
      'Consult a clinician first if you have cardiovascular disease, uncontrolled blood pressure, respiratory disease, or another serious health condition.',
    ],
    safetyChecklist: [
      'I am seated or lying down.',
      'I am not driving, swimming, bathing, standing, or near water.',
      'I will stop immediately if I feel lightheaded, numb, or uncomfortable.',
    ],
    defaultRounds: 30, // Standard Wim Hof: 30 breaths per round (30 × 4s = 120s = 2 min)
    phases: [
      { phase: BREATH_PHASES.INHALE, duration: 2 },
      { phase: BREATH_PHASES.EXHALE, duration: 2 },
    ],
  },

  [TECHNIQUE_IDS.CYCLIC_SIGHING]: {
    id: TECHNIQUE_IDS.CYCLIC_SIGHING,
    name: 'Cyclic Sighing',
    shortName: 'Sighing',
    description: 'Double inhale through the nose, then a long slow exhale at ~6 breaths/min. Outperformed mindfulness meditation for anxiety reduction in a Stanford RCT (Balban et al., 2023).',
    science: 'The double inhale can recruit additional lung volume before a long exhale, biasing the pattern toward slower respiratory rhythm and a calmer breathing cycle. In a 111-person randomized controlled trial, 5 min/day of cyclic sighing produced greater improvement in positive affect and lower respiratory rate than box breathing, hyperventilation, or mindfulness meditation, with benefits increasing over consecutive days of practice.',
    evidence: 'Stanford RCT',
    evidenceLevel: 'strong',
    citations: [protocolCitations.balban2023, protocolCitations.zaccaro2018],
    purpose: 'De-stress and reduce anxiety',
    category: 'calm',
    intensity: 'gentle',
    bestFor: ['Anxiety relief', 'Mood reset', 'Midday decompression'],
    breathsPerMinute: 6,
    defaultRounds: 30, // ~5 min session (10s per cycle × 30 = 300s) — matches the RCT protocol
    phases: [
      { phase: BREATH_PHASES.INHALE, duration: 3 },       // First inhale – fill lungs
      { phase: BREATH_PHASES.DEEP_INHALE, duration: 2 },  // Second sip – maximize expansion
      { phase: BREATH_PHASES.EXHALE, duration: 5 },       // Slow extended exhale (~1:2 inhale:exhale emphasis)
    ],
  },

  [TECHNIQUE_IDS.RESONANCE_BREATHING]: {
    id: TECHNIQUE_IDS.RESONANCE_BREATHING,
    name: 'Resonance Breathing',
    shortName: 'Resonance',
    description: 'A sensor-free HRV biofeedback entry point: 5-second inhale, 5-second exhale, 6 breaths/min. Designed to entrain respiratory sinus arrhythmia and baroreflex rhythm.',
    science: 'Slow paced breathing around 4.5-6.5 breaths/min is the core training range used in resonance-frequency HRV biofeedback. Breathing at this cadence can amplify respiratory sinus arrhythmia, stimulate the baroreflex, and increase heart-rate variability. Systematic reviews of slow breathing report autonomic shifts alongside reduced arousal, anxiety, anger, and confusion in healthy subjects.',
    evidence: 'HRV biofeedback standard',
    evidenceLevel: 'strong',
    citations: [protocolCitations.lehrer2014, protocolCitations.zaccaro2018],
    purpose: 'Increase HRV and baseline nervous-system flexibility',
    category: 'calm',
    intensity: 'gentle',
    bestFor: ['Daily baseline', 'HRV training', 'Steady calm'],
    breathsPerMinute: 6,
    caution: 'Keep the breath quiet and nasal when possible; bigger is not better.',
    defaultRounds: 30,
    phases: [
      { phase: BREATH_PHASES.INHALE, duration: 5 },
      { phase: BREATH_PHASES.EXHALE, duration: 5 },
    ],
  },

  [TECHNIQUE_IDS.DIAPHRAGMATIC_BREATHING]: {
    id: TECHNIQUE_IDS.DIAPHRAGMATIC_BREATHING,
    name: 'Diaphragmatic Reset',
    shortName: 'Belly',
    description: 'A foundational belly-breathing cadence: 4-second inhale, 4-second exhale, no holds. Built for low-friction body awareness and calm baseline training.',
    science: 'Diaphragmatic breathing trains the diaphragm to lead the breath instead of the upper chest. Randomized research in healthy adults found improved sustained attention, lower negative affect, and reduced cortisol after structured practice. A recent systematic review found promising benefits for anxiety and several clinical conditions, while noting that protocols and study quality remain heterogeneous. BreathFlow treats this as a gentle self-regulation practice, not a medical treatment.',
    evidence: 'RCT + systematic review',
    evidenceLevel: 'promising',
    citations: [protocolCitations.ma2017, protocolCitations.kwon2026, protocolCitations.zaccaro2018],
    purpose: 'Build calm body awareness with the lowest-effort breath',
    category: 'calm',
    intensity: 'gentle',
    bestFor: ['Beginners', 'Body awareness', 'Low-intensity reset'],
    breathsPerMinute: 7.5,
    caution: 'Keep the breath quiet and easy. If belly breathing feels forced, return to normal breathing.',
    defaultRounds: 38,
    phases: [
      { phase: BREATH_PHASES.INHALE, duration: 4 },
      { phase: BREATH_PHASES.EXHALE, duration: 4 },
    ],
  },

  [TECHNIQUE_IDS.EXTENDED_EXHALE]: {
    id: TECHNIQUE_IDS.EXTENDED_EXHALE,
    name: 'Extended Exhale',
    shortName: 'Exhale',
    description: 'A no-hold downshift protocol: 4-second inhale and 6-second exhale at 6 breaths/min. Built for users who want calm without retention.',
    science: 'Slow breathing below 10 breaths/min is associated with increased HRV and respiratory sinus arrhythmia. Research on exhale-heavy ratios is mixed, but multiple studies report stronger cardiac vagal activity when exhalation is longer than inhalation. This protocol keeps the cadence easy while biasing the breath toward a longer, calmer outflow.',
    evidence: 'Slow-breathing research',
    evidenceLevel: 'strong',
    citations: [protocolCitations.zaccaro2018],
    purpose: 'Fast parasympathetic downshift without breath holds',
    category: 'calm',
    intensity: 'gentle',
    bestFor: ['Anxiety spikes', 'Hold-free calm', 'Pre-sleep decompression'],
    breathsPerMinute: 6,
    caution: 'Shorten the exhale if it starts to feel effortful.',
    defaultRounds: 30,
    phases: [
      { phase: BREATH_PHASES.INHALE, duration: 4 },
      { phase: BREATH_PHASES.EXHALE, duration: 6 },
    ],
  },

  [TECHNIQUE_IDS.FOUR_SEVEN_EIGHT]: {
    id: TECHNIQUE_IDS.FOUR_SEVEN_EIGHT,
    name: '4-7-8 Downshift',
    shortName: '4-7-8',
    description: 'A pranayama-derived sleep protocol: inhale for 4, hold for 7, exhale for 8. The long cycle creates a deliberate off-ramp for racing thoughts.',
    science: 'The 4-7-8 pattern slows respiration to about 3.2 breaths/min with an extended exhale and post-inhale retention. Direct evidence is still emerging, but randomized studies in specific populations report short-term improvements in anxiety, stress, and sleep-related outcomes. Treat it as a stronger downshift protocol, not a competition to hold longer.',
    evidence: 'Emerging RCT evidence',
    evidenceLevel: 'promising',
    citations: [protocolCitations.dogan2026, protocolCitations.kirazli2026, protocolCitations.zaccaro2018],
    purpose: 'Sleep onset and cognitive downshift',
    category: 'sleep',
    intensity: 'moderate',
    bestFor: ['Sleep ritual', 'Late-night rumination', 'Anger reset'],
    breathsPerMinute: 3.2,
    caution: 'Skip or shorten the 7-second hold if retention increases anxiety.',
    defaultRounds: 16,
    phases: [
      { phase: BREATH_PHASES.INHALE, duration: 4 },
      { phase: BREATH_PHASES.HOLD_IN, duration: 7 },
      { phase: BREATH_PHASES.EXHALE, duration: 8 },
    ],
  },

  [TECHNIQUE_IDS.PURSED_LIP_RECOVERY]: {
    id: TECHNIQUE_IDS.PURSED_LIP_RECOVERY,
    name: 'Pursed-Lip Recovery',
    shortName: 'Recovery',
    description: 'A gentle 2-in, 4-out cadence adapted from pulmonary rehabilitation breathing strategies. Useful after exertion or when the breath feels shallow.',
    science: 'Pursed-lip breathing creates light expiratory back-pressure, slows the respiratory cycle, and can improve ventilation efficiency. In pulmonary rehabilitation literature, pursed-lip and diaphragmatic breathing strategies are associated with lower dyspnea and better exercise tolerance in chronic lung disease. In this app it is offered as a gentle recovery cadence, not a medical treatment.',
    evidence: 'Pulmonary rehab literature',
    evidenceLevel: 'strong',
    citations: [protocolCitations.burge2024, protocolCitations.ubolnuar2019, protocolCitations.nield2007],
    purpose: 'Recover from exertion and reduce shallow breathing',
    category: 'recovery',
    intensity: 'gentle',
    bestFor: ['Post-workout recovery', 'Breathlessness', 'Gentle reset'],
    breathsPerMinute: 10,
    caution: 'Seek medical care for chest pain, severe shortness of breath, or symptoms that do not settle.',
    defaultRounds: 50,
    phases: [
      { phase: BREATH_PHASES.INHALE, duration: 2 },
      { phase: BREATH_PHASES.EXHALE, duration: 4 },
    ],
  },
}

export interface SessionConfig {
  techniqueId: TechniqueId
  rounds: number
  customPhaseDurations?: Partial<Record<BreathPhase, number>>
}

export function getProtocol(id: TechniqueId): BreathingProtocol {
  return breathingProtocols[id]
}

export function getProtocolCatalog(): BreathingProtocol[] {
  return protocolOrder.map((id) => breathingProtocols[id])
}

export function getProtocolRoundLimit(techniqueId: TechniqueId): number {
  return Math.max(BASE_MAX_SESSION_ROUNDS, breathingProtocols[techniqueId].defaultRounds)
}

export function clampProtocolRounds(techniqueId: TechniqueId, rounds: number): number {
  const roundedRounds = Number.isFinite(rounds) ? Math.round(rounds) : MIN_SESSION_ROUNDS

  return Math.max(
    MIN_SESSION_ROUNDS,
    Math.min(getProtocolRoundLimit(techniqueId), roundedRounds),
  )
}

export function isTechniqueId(value: string | null): value is TechniqueId {
  return Boolean(value && Object.values(TECHNIQUE_IDS).includes(value as TechniqueId))
}

export function calculateSessionDuration(config: SessionConfig): number {
  const protocol = getProtocol(config.techniqueId)
  let totalSeconds = 0

  for (let round = 0; round < config.rounds; round++) {
    for (const phaseConfig of protocol.phases) {
      let duration = config.customPhaseDurations?.[phaseConfig.phase] ?? phaseConfig.duration

      // Apply progressive hold increment for CO2 tolerance
      if (protocol.progressiveHold && phaseConfig.phase === BREATH_PHASES.HOLD_IN) {
        duration += round * (protocol.holdIncrement ?? 0)
      }

      totalSeconds += duration
    }
  }

  return totalSeconds
}

export function hasCustomPhaseDurations(
  protocol: BreathingProtocol,
  customDurations?: Partial<Record<BreathPhase, number>>
): boolean {
  if (!customDurations) {
    return false
  }

  return protocol.phases.some((phaseConfig) => {
    const customDuration = customDurations[phaseConfig.phase]
    return customDuration !== undefined && customDuration !== phaseConfig.duration
  })
}

export function applyCustomPhaseDurations(
  protocol: BreathingProtocol,
  customDurations?: Partial<Record<BreathPhase, number>>
): BreathingProtocol {
  if (!hasCustomPhaseDurations(protocol, customDurations)) {
    return protocol
  }

  return {
    ...protocol,
    phases: protocol.phases.map((phaseConfig) => ({
      ...phaseConfig,
      duration: customDurations?.[phaseConfig.phase] ?? phaseConfig.duration,
    })),
  }
}

export function getPhaseForRound(
  protocol: BreathingProtocol,
  round: number,
  phaseIndex: number,
  customDurations?: Partial<Record<BreathPhase, number>>
): PhaseConfig {
  const basePhase = protocol.phases[phaseIndex]
  let duration = customDurations?.[basePhase.phase] ?? basePhase.duration

  // Apply progressive hold for CO2 tolerance tables
  if (protocol.progressiveHold && basePhase.phase === BREATH_PHASES.HOLD_IN) {
    duration += round * (protocol.holdIncrement ?? 0)
  }

  return {
    phase: basePhase.phase,
    duration,
  }
}

import { BREATH_PHASES, TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import type { BreathingProtocol } from './types'

/**
 * The nine published BreathFlow protocols, in catalog order.
 * Data is authoritative: do not add techniques or medical claims.
 */
export const PROTOCOLS: readonly BreathingProtocol[] = [
  {
    id: TECHNIQUE_IDS.CYCLIC_SIGHING,
    name: 'Cyclic Sighing',
    description: 'Double inhale, long sigh out — the fastest studied route to calm.',
    science:
      'A physiological sigh is a normal inhale topped with a short second sip of air, followed by an extended '
      + 'exhale. The second inhale reinflates collapsed air sacs so more carbon dioxide leaves on the long '
      + 'exhale, which slows heart rate through the vagus nerve. In a month-long randomized trial, five '
      + 'minutes of daily cyclic sighing improved mood and lowered resting breathing rate more than '
      + 'mindfulness meditation.',
    evidenceLabel: 'Randomized controlled trial',
    evidenceLevel: 'strong',
    citations: [
      {
        authors: 'Balban MY, Neri E, Kogon MM, et al.',
        title: 'Brief structured respiration practices enhance mood and reduce physiological arousal',
        source: 'Cell Reports Medicine',
        year: 2023,
        url: 'https://doi.org/10.1016/j.xcrm.2022.100895',
      },
    ],
    purpose: 'Rapid, reliable downshift for stress and anxious arousal',
    bestFor: ['Acute stress', 'Daily calm practice', 'First-time breathwork'],
    breathsPerMinute: 6,
    category: 'calm',
    intensity: 'gentle',
    defaultRounds: 30,
    phases: [
      { phase: BREATH_PHASES.INHALE, seconds: 3 },
      { phase: BREATH_PHASES.DEEP_INHALE, seconds: 2 },
      { phase: BREATH_PHASES.EXHALE, seconds: 5 },
    ],
  },
  {
    id: TECHNIQUE_IDS.RESONANCE_BREATHING,
    name: 'Resonance Breathing',
    description: 'Six breaths a minute — the cadence where heart and breath sync.',
    science:
      'Breathing at roughly six breaths per minute drives heart rate variability to its maximum by aligning '
      + 'the breath with the baroreflex, the pressure-sensing loop between heart and brain. Decades of HRV '
      + 'biofeedback research use this "resonance frequency" cadence to train autonomic flexibility and '
      + 'reduce anxiety symptoms.',
    evidenceLabel: 'Meta-analytic support',
    evidenceLevel: 'strong',
    citations: [
      {
        authors: 'Lehrer PM, Gevirtz R',
        title: 'Heart rate variability biofeedback: how and why does it work?',
        source: 'Frontiers in Psychology',
        year: 2014,
        url: 'https://doi.org/10.3389/fpsyg.2014.00756',
      },
    ],
    purpose: 'Balance the nervous system and train heart rate variability',
    bestFor: ['Daily regulation', 'HRV training', 'Steady focus'],
    breathsPerMinute: 6,
    category: 'calm',
    intensity: 'gentle',
    defaultRounds: 30,
    phases: [
      { phase: BREATH_PHASES.INHALE, seconds: 5 },
      { phase: BREATH_PHASES.EXHALE, seconds: 5 },
    ],
  },
  {
    id: TECHNIQUE_IDS.DIAPHRAGMATIC_BREATHING,
    name: 'Diaphragmatic Reset',
    description: 'Slow belly breathing that rebuilds the foundation of every technique.',
    science:
      'Diaphragmatic breathing moves the breath low into the belly, recruiting the diaphragm instead of the '
      + 'neck and chest muscles that dominate stressed breathing. Trials in healthy adults link a regular '
      + 'practice to improved sustained attention, lower negative affect, and reduced cortisol.',
    evidenceLabel: 'Controlled trials',
    evidenceLevel: 'promising',
    citations: [
      {
        authors: 'Ma X, Yue ZQ, Gong ZQ, et al.',
        title: 'The effect of diaphragmatic breathing on attention, negative affect and stress in healthy adults',
        source: 'Frontiers in Psychology',
        year: 2017,
        url: 'https://doi.org/10.3389/fpsyg.2017.00874',
      },
    ],
    purpose: 'Restore relaxed, mechanically efficient breathing',
    bestFor: ['Beginners', 'Desk-tension unwinding', 'Foundation practice'],
    breathsPerMinute: 7.5,
    category: 'calm',
    intensity: 'gentle',
    defaultRounds: 38,
    phases: [
      { phase: BREATH_PHASES.INHALE, seconds: 4 },
      { phase: BREATH_PHASES.EXHALE, seconds: 4 },
    ],
  },
  {
    id: TECHNIQUE_IDS.EXTENDED_EXHALE,
    name: 'Extended Exhale',
    description: 'Exhale longer than you inhale to tip the balance toward rest.',
    science:
      'Heart rate rises slightly on every inhale and falls on every exhale. Making the exhale longer than '
      + 'the inhale weights each breath toward the parasympathetic half of that cycle. Systematic reviews of '
      + 'slow-breathing studies consistently associate low-and-slow exhale-biased patterns with increased '
      + 'vagal activity and reduced anxiety.',
    evidenceLabel: 'Systematic review',
    evidenceLevel: 'strong',
    citations: [
      {
        authors: 'Zaccaro A, Piarulli A, Laurino M, et al.',
        title: 'How breath-control can change your life: a systematic review on psycho-physiological correlates of slow breathing',
        source: 'Frontiers in Human Neuroscience',
        year: 2018,
        url: 'https://doi.org/10.3389/fnhum.2018.00353',
      },
    ],
    purpose: 'Gentle wind-down without holds',
    bestFor: ['Evening wind-down', 'Pre-meeting nerves', 'Hold-free calm'],
    breathsPerMinute: 6,
    category: 'calm',
    intensity: 'gentle',
    defaultRounds: 30,
    phases: [
      { phase: BREATH_PHASES.INHALE, seconds: 4 },
      { phase: BREATH_PHASES.EXHALE, seconds: 6 },
    ],
  },
  {
    id: TECHNIQUE_IDS.BOX_BREATHING,
    name: 'Box Breathing',
    description: 'Four equal sides — in, hold, out, hold — for steady focus under pressure.',
    science:
      'Box breathing (also called tactical breathing) paces the breath around four equal counts. The equal '
      + 'holds keep carbon dioxide steady while the counting task occupies working memory, which is why it '
      + 'is taught for composure in high-stress professions. Controlled studies of paced tactical breathing '
      + 'report reduced physiological stress responses during demanding tasks.',
    evidenceLabel: 'Applied studies',
    evidenceLevel: 'promising',
    citations: [
      {
        authors: 'Röttger S, Theobald DA, Abendroth J, Jacobsen T',
        title: 'The effectiveness of combat tactical breathing as compared with prolonged exhalation',
        source: 'Applied Psychophysiology and Biofeedback',
        year: 2021,
        url: 'https://doi.org/10.1007/s10484-020-09485-w',
      },
    ],
    purpose: 'Composure and concentration on demand',
    bestFor: ['Before presentations', 'Deep-work entry', 'Pressure moments'],
    breathsPerMinute: 3.75,
    category: 'focus',
    intensity: 'moderate',
    defaultRounds: 19,
    phases: [
      { phase: BREATH_PHASES.INHALE, seconds: 4 },
      { phase: BREATH_PHASES.HOLD_IN, seconds: 4 },
      { phase: BREATH_PHASES.EXHALE, seconds: 4 },
      { phase: BREATH_PHASES.HOLD_OUT, seconds: 4 },
    ],
  },
  {
    id: TECHNIQUE_IDS.FOUR_SEVEN_EIGHT,
    name: '4-7-8 Downshift',
    description: 'Inhale 4, hold 7, exhale 8 — a long-exhale ritual built for sleep.',
    science:
      'The 4-7-8 pattern combines a brief hold with an exhale twice as long as the inhale, an unusually '
      + 'strong parasympathetic bias. Small controlled studies report acute improvements in heart rate '
      + 'variability and blood pressure after 4-7-8 practice, and the fixed ritual gives a racing mind a '
      + 'single track to follow at bedtime.',
    evidenceLabel: 'Small controlled studies',
    evidenceLevel: 'promising',
    citations: [
      {
        authors: 'Vierra J, Boonla O, Prasertsri P',
        title: 'Effects of sleep deprivation and 4-7-8 breathing control on heart rate variability, blood pressure, blood glucose, and endothelial function in healthy young adults',
        source: 'Physiological Reports',
        year: 2022,
        url: 'https://doi.org/10.14814/phy2.15389',
      },
    ],
    purpose: 'Downshift toward sleep',
    bestFor: ['Bedtime', 'Night waking', 'Racing thoughts'],
    breathsPerMinute: 3.2,
    category: 'sleep',
    intensity: 'moderate',
    defaultRounds: 16,
    caution: 'The 7-second hold can feel intense at first. Shorten the hold rather than straining.',
    phases: [
      { phase: BREATH_PHASES.INHALE, seconds: 4 },
      { phase: BREATH_PHASES.HOLD_IN, seconds: 7 },
      { phase: BREATH_PHASES.EXHALE, seconds: 8 },
    ],
  },
  {
    id: TECHNIQUE_IDS.CO2_TOLERANCE,
    name: 'CO2 Tolerance Table',
    description: 'Progressive breath holds that raise your comfort with air hunger.',
    science:
      'The urge to breathe is driven mostly by rising carbon dioxide, not falling oxygen. Repeated relaxed '
      + 'holds — lengthening a little each round — teach the brain to tolerate higher CO2 before sounding '
      + 'the alarm, a training approach borrowed from freediving static-apnea tables. Physiological studies '
      + 'of trained breath-holders document markedly blunted ventilatory responses to CO2.',
    evidenceLabel: 'Physiological studies',
    evidenceLevel: 'promising',
    citations: [
      {
        authors: 'Bain AR, Drvis I, Dujic Z, MacLeod DB, Ainslie PN',
        title: 'Physiology of static breath holding in elite apneists',
        source: 'Experimental Physiology',
        year: 2018,
        url: 'https://doi.org/10.1113/EP086269',
      },
    ],
    purpose: 'Build breath-hold capacity and calm under air hunger',
    bestFor: ['Breath-hold training', 'Swimmers and divers', 'Air-hunger tolerance'],
    breathsPerMinute: 1.9,
    category: 'performance',
    intensity: 'advanced',
    defaultRounds: 8,
    phases: [
      { phase: BREATH_PHASES.INHALE, seconds: 3 },
      { phase: BREATH_PHASES.HOLD_IN, seconds: 15 },
      { phase: BREATH_PHASES.EXHALE, seconds: 3 },
      { phase: BREATH_PHASES.REST, seconds: 10 },
    ],
    holdIncrementSeconds: 5,
    caution: 'Holds lengthen by 5 seconds each round. End the hold early any time — never strain.',
    safetyNotice:
      'Breath holds are practiced seated or lying down only. Never practice holds in or near water, while '
      + 'driving, or standing. Stop immediately if you feel dizzy, tingling, or panicked.',
    contraindications: [
      'Pregnancy',
      'History of seizures, epilepsy, or fainting',
      'Consult a clinician first if you have cardiovascular disease, uncontrolled blood pressure, respiratory conditions, or any other serious condition',
    ],
    safetyChecklist: [
      'I am seated or lying down',
      'I am not driving, swimming, bathing, standing, or near water',
      'I will stop if I feel dizzy, tingling, panicked, or uncomfortable',
    ],
  },
  {
    id: TECHNIQUE_IDS.PURSED_LIP_RECOVERY,
    name: 'Pursed-Lip Recovery',
    description: 'Short inhale, slow pursed-lip exhale to settle breath after exertion.',
    science:
      'Exhaling through pursed lips creates gentle back-pressure that keeps airways open longer, slows the '
      + 'breath, and improves gas exchange — a pattern-retraining strategy studied for reducing '
      + 'breathlessness. After exertion it shortens the time back to an easy, nose-led breathing rhythm.',
    evidenceLabel: 'Clinical trials',
    evidenceLevel: 'strong',
    citations: [
      {
        authors: 'Nield MA, Soo Hoo GW, Roper JM, Santiago S',
        title: 'Efficacy of pursed-lips breathing: a breathing pattern retraining strategy for dyspnea reduction',
        source: 'Journal of Cardiopulmonary Rehabilitation and Prevention',
        year: 2007,
        url: 'https://doi.org/10.1097/01.HCR.0000265031.02952.19',
      },
    ],
    purpose: 'Settle breathing quickly after exercise or exertion',
    bestFor: ['Post-workout', 'Stair-climb recovery', 'Breathless moments'],
    breathsPerMinute: 10,
    category: 'recovery',
    intensity: 'gentle',
    defaultRounds: 50,
    phases: [
      { phase: BREATH_PHASES.INHALE, seconds: 2 },
      { phase: BREATH_PHASES.EXHALE, seconds: 4 },
    ],
  },
  {
    id: TECHNIQUE_IDS.POWER_BREATHING,
    name: 'Power Breathing',
    description: 'Fast, full rounds of deliberate over-breathing for short-term arousal.',
    science:
      'Rapid deep breathing temporarily lowers carbon dioxide and activates the sympathetic nervous system '
      + '— the opposite of the calming techniques. Research on voluntary hyperventilation practices shows '
      + 'measurable adrenaline release, which is why this style is used briefly and deliberately before '
      + 'effort, never for relaxation.',
    evidenceLabel: 'Mechanistic studies',
    evidenceLevel: 'promising',
    citations: [
      {
        authors: 'Kox M, van Eijk LT, Zwaag J, et al.',
        title: 'Voluntary activation of the sympathetic nervous system and attenuation of the innate immune response in humans',
        source: 'Proceedings of the National Academy of Sciences',
        year: 2014,
        url: 'https://doi.org/10.1073/pnas.1322174111',
      },
    ],
    purpose: 'Short, deliberate energy and arousal boost',
    bestFor: ['Pre-workout', 'Morning activation', 'Cold-exposure prep'],
    breathsPerMinute: 15,
    category: 'performance',
    intensity: 'advanced',
    defaultRounds: 30,
    phases: [
      { phase: BREATH_PHASES.INHALE, seconds: 2 },
      { phase: BREATH_PHASES.EXHALE, seconds: 2 },
    ],
    caution: 'Lightheadedness means slow down or stop — it is a signal, not a goal.',
    safetyNotice:
      'Hyperventilation-style breathing is practiced seated or lying down only. Never practice in or near '
      + 'water, while driving, or standing. Stop immediately if you feel lightheaded or numb.',
    contraindications: [
      'Pregnancy',
      'History of seizures, epilepsy, or fainting',
      'Consult a clinician first if you have cardiovascular disease, uncontrolled blood pressure, respiratory conditions, or any other serious condition',
    ],
    safetyChecklist: [
      'I am seated or lying down',
      'I am not driving, swimming, bathing, standing, or near water',
      'I will stop if I feel lightheaded, numb, or uncomfortable',
    ],
  },
]

/** Default technique for first-run Begin and for unknown-technique fallback. */
export const DEFAULT_TECHNIQUE_ID: TechniqueId = TECHNIQUE_IDS.CYCLIC_SIGHING

const PROTOCOL_BY_ID = new Map<TechniqueId, BreathingProtocol>(
  PROTOCOLS.map((protocol) => [protocol.id, protocol]),
)

export function isTechniqueId(value: unknown): value is TechniqueId {
  return typeof value === 'string' && PROTOCOL_BY_ID.has(value as TechniqueId)
}

/** Unknown ids fall back to Cyclic Sighing (spec: deep-link fallback). */
export function getProtocol(id: string | null | undefined): BreathingProtocol {
  if (isTechniqueId(id)) {
    return PROTOCOL_BY_ID.get(id) as BreathingProtocol
  }
  return PROTOCOL_BY_ID.get(DEFAULT_TECHNIQUE_ID) as BreathingProtocol
}

/** A protocol is advanced (safety-gated) iff it has a safety checklist. */
export function isAdvancedProtocol(protocol: BreathingProtocol): boolean {
  return (protocol.safetyChecklist?.length ?? 0) > 0
}

export function isAdvancedTechnique(id: TechniqueId): boolean {
  return isAdvancedProtocol(getProtocol(id))
}

export const ADVANCED_TECHNIQUE_IDS: readonly TechniqueId[] = PROTOCOLS
  .filter(isAdvancedProtocol)
  .map((protocol) => protocol.id)

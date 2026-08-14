/** Every visible string on the root page.
 *
 *  Kept in one module for two reasons. Components stay fast-refreshable when
 *  they export only components, and more importantly this is the file to read
 *  before changing what the page claims: each line is grounded in the profile
 *  the model is briefed with (`server/src/routes/constants.ts`). If a fact is
 *  not in that briefing, it does not belong here either.
 */

export const CHAT_NAME = 'Anthony Lim'
export const CHAT_POSITIONING = 'Software engineer at DoorDash, based in San Francisco.'
export const CHAT_SUBTEXT =
  'Ask this assistant about his work, the teams he has shipped with, or how to reach him.'
export const CHAT_LINKEDIN_HREF = 'https://www.linkedin.com/in/alim24/'
export const CHAT_EMAIL = 'anthonylim.ucsc@gmail.com'

export const CHAT_PLACEHOLDER = "Ask about Anthony's work"

export const CHAT_SUGGESTIONS = [
  'What does Anthony build at DoorDash?',
  'Which stacks does he work in?',
  'Where has he worked before?',
  'How do I reach him?',
] as const

export const CHAT_DISCLAIMER =
  "Answers come from a model briefed on Anthony's background. Verify anything important."

/** What the assistant can actually answer, shown while the transcript is empty
 *  so the first question is an easy one to ask. */
export const CHAT_KNOWN_TOPICS = [
  ['Roles and teams', 'DoorDash, eBay, and the work before them'],
  ['Craft', 'the stacks, tools, and problems he works in'],
  ['Getting in touch', 'the fastest way to reach him'],
] as const

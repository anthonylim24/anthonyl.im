/**
 * What a traveller writes for themselves (a trip's description, a stop's
 * notes, a day's journal) often holds things that are none of a model's
 * business: a flight's booking code, a hotel's confirmation number, an email
 * address, a phone number, a card or passport number. None of it helps plan
 * a day, so it is replaced with a placeholder before the text goes into any
 * prompt. The rest of the text is kept as it is.
 *
 * Structured booking fields (`ItineraryReservation.confirmation`) never go
 * to a model in the first place; this is for free text.
 */

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu

/**
 * A label that says the next token is a code: "confirmation: X7K2PQ",
 * "booking ref 88123", "PNR ABCD1E", "passport no. M1234567".
 */
const LABELLED_CODE =
  /\b(confirmation|confirm|conf|booking|reservation|record locator|locator|pnr|reference|ref|e-?ticket|ticket|order|passport|membership|member|loyalty|frequent flyer)\b((?:\s*(?:no\.?|number|num|code|id|#))?)(\s*[:#.]?\s*)([A-Za-z0-9][A-Za-z0-9-]{3,})/giu

/**
 * Long runs of digits, alone or split by spaces, dots, dashes or brackets:
 * phone, card and account numbers. Ten digits at least, or a leading "+"
 * with eight, so that years, times, prices and street numbers stay.
 */
const LONG_NUMBER = /(\+\s?)?\(?\d[\d\s().-]{6,}\d\)?/g

/** Korean, Japanese and similar phone numbers: 02-123-4567, 010-1234-5678. */
const LOCAL_PHONE = /\b0\d{1,2}-\d{3,4}-\d{4}\b/g

/** An airline-style booking code on its own: six letters and digits, mixed. */
const BARE_CODE = /\b[A-Z0-9]{6}\b/g

/** Flight and train numbers look alike but are useful: KE018, OZ1085, KTX101, 7C1102. */
const TRANSPORT_NUMBER = /^(?:[A-Z]{1,4}\d{1,5}|[A-Z0-9]{2}\d{1,4}[A-Z]?)$/

const ISO_DATE = /\d{4}-\d{2}-\d{2}/

function hasLetterAndDigit(token: string): boolean {
  return /\p{L}/u.test(token) && /\d/.test(token)
}

export const REDACTED_CODE = "[code]"
export const REDACTED_EMAIL = "[email]"
export const REDACTED_NUMBER = "[number]"

export function redactPrivate(text: string): string {
  return text
    .replace(EMAIL, REDACTED_EMAIL)
    .replace(LABELLED_CODE, (match, label: string, kind: string, gap: string, code: string) => {
      // "Booking confirmed", "Reservation at Mingles": a word, not a code.
      const looksLikeCode = /\d/.test(code) || (code.length >= 5 && code === code.toUpperCase())
      return looksLikeCode ? `${label}${kind}${gap}${REDACTED_CODE}` : match
    })
    .replace(LOCAL_PHONE, REDACTED_NUMBER)
    .replace(LONG_NUMBER, (match, plus: string | undefined) => {
      if (ISO_DATE.test(match)) return match
      const digits = match.replace(/\D/g, "").length
      return digits >= 10 || (plus && digits >= 8) ? REDACTED_NUMBER : match
    })
    .replace(BARE_CODE, (token) => (hasLetterAndDigit(token) && !TRANSPORT_NUMBER.test(token) ? REDACTED_CODE : token))
}

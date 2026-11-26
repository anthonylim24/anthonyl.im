// Addresses as Google and OpenStreetMap write them. Pure text, shared so the
// wishlist's areas, its rows and the map's pins read an address the same way.

export function normaliseName(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

export function withoutNumbers(part: string): string {
  return part
    .split(/\s+/)
    .filter((token) => !/\d/.test(token))
    .join(" ")
    .trim()
}

let countries: Set<string> | null = null

function countryNames(): Set<string> {
  if (countries) return countries
  const names = new Set<string>([
    "usa",
    "us",
    "united states of america",
    "uk",
    "uae",
    "korea",
    "republic of korea",
    "대한민국",
    "한국",
    "日本",
    "中国",
    "turkey",
    "czech republic",
    "hong kong",
    "macau",
    "españa",
    "deutschland",
    "italia",
    "brasil",
    "méxico",
    "nederland",
    "schweiz",
    "österreich",
  ].map(normaliseName))
  try {
    const display = new Intl.DisplayNames(["en"], { type: "region" })
    const A = "A".charCodeAt(0)
    for (let i = 0; i < 26; i++) {
      for (let j = 0; j < 26; j++) {
        const code = String.fromCharCode(A + i, A + j)
        const name = display.of(code)
        if (name && name !== code) names.add(normaliseName(name))
      }
    }
  } catch {
    // No Intl.DisplayNames: the short list above still drops the usual ones.
  }
  countries = names
  return names
}

export const isCountry = (part: string) => countryNames().has(normaliseName(withoutNumbers(part)))
/** A part that is a number and nothing else: a house number ("88", "1-1", "1−1") or a postcode. */
const NUMBER = /^\d+(?:[\s\-‐‑–−]\d+)*$/
/** The shapes postcodes take alone: four digits or more ("03195", "1300-085", "10001-1234"), or Japan's "603-8361". */
const POSTCODE = /^(?:\d{4,}(?:[\s-]\d{3,4})?|\d{3}-\d{4})$/

/**
 * An address's parts street first, without the country or a part that is
 * only a postcode. Google writes some addresses country first ("Japan,
 * 〒150-0041 Tokyo, Shibuya, Jinnan, 1-chōme-22-7"): those are turned round
 * ("1-chōme-22-7, Jinnan, Shibuya, 〒150-0041 Tokyo"). A number alone
 * beside the street is its house number: before it once the address is
 * turned round ("South Korea, Seoul, Jongno-gu, Changgyeonggung-ro, 88" →
 * "88 Changgyeonggung-ro, Jongno-gu, Seoul"), or just after it with more to
 * come ("C/ de Mallorca, 401, L'Eixample"). Last, or further on beside the
 * town or the country, it is a postcode when it is marked 〒 or shaped like one.
 */
export function streetFirst(address: string | undefined): string[] {
  const parts = (address ?? "").split(",").map((part) => part.trim()).filter(Boolean)
  if (parts.length > 1 && isCountry(parts[0]!)) parts.reverse()
  while (parts.length > 0 && isCountry(parts[parts.length - 1]!)) parts.pop()
  const [first, street] = parts
  if (first !== undefined && street !== undefined && NUMBER.test(first) && !NUMBER.test(street)) parts.splice(0, 2, `${first} ${street}`)
  return parts.filter((part, i) => {
    if (part.startsWith("〒")) return !NUMBER.test(part.slice(1).trim())
    const afterStreet = i === 1 && i < parts.length - 1 && !NUMBER.test(parts[0]!)
    return afterStreet || !POSTCODE.test(part)
  })
}

/**
 * The town an address ends in: the last part before the country, without
 * its postcode, skipping a state code ("New York, NY 10001, USA" → "New
 * York"). Needs at least two parts, so a lone street or venue name is not
 * mistaken for a town; null when nothing is left.
 */
export function addressLocality(address: string | undefined): string | null {
  const parts = (address ?? "").split(",").map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const rest = streetFirst(address).map(withoutNumbers)
  while (rest.length > 0 && rest[rest.length - 1] === "") rest.pop()
  while (rest.length > 1 && (rest[rest.length - 1] === "" || /^[A-Z]{2,3}$/.test(rest[rest.length - 1]!))) rest.pop()
  const town = rest[rest.length - 1]
  return town && !/^[A-Z]{2,3}$/.test(town) ? town : null
}

const plain = (part: string) => normaliseName(part.replace(/\S*\d\S*/g, ""))

/**
 * "161 Sajik-ro, Jongno District, Seoul, South Korea" in Seoul → "161
 * Sajik-ro, Jongno District"; "Japan, 〒150-0041 Tokyo, Shibuya, Jinnan,
 * 1-chōme-22-7" in Tokyo → "1-chōme-22-7, Jinnan". Never the country or a postcode.
 */
export function streetLine(address: string | undefined, area: string | null, name: string): string | null {
  const parts = streetFirst(address)
  const town = area ? parts.findIndex((part) => plain(part) === normaliseName(area)) : -1
  const before = (town >= 0 ? parts.slice(0, town) : parts.slice(0, 2)).filter((part) => normaliseName(part) !== normaliseName(name))
  return before.length > 0 ? before.slice(0, 2).join(", ") : null
}

// Entity-specific link resolver.
//
// Pure functions, no network. For a given (type, name, city), builds a
// curated list of external destinations that are likely useful for that
// kind of entity. <SmartEntity> renders this list in the popover.
//
// Templates are intentionally generic — they hit a *search* page on the
// target service rather than guessing a canonical URL. Google Maps,
// Wikipedia search, Naver Place, FlightAware all support this pattern,
// so a 30-character entity name doesn't need pre-resolved IDs.

export type EntityType =
  | "flight"
  | "hotel"
  | "restaurant"
  | "city"
  | "neighborhood"
  | "palace"
  | "museum"
  | "place"
  | "transit"
  | "airport"
  | "person"

export type LinkKind =
  | "maps"
  | "wikipedia"
  | "naver"
  | "official"
  | "tracker"
  | "reservation"
  | "search"
  | "knowledge"

export interface EntityLink {
  label: string
  url: string
  kind: LinkKind
}

const enc = (s: string) => encodeURIComponent(s.trim())

function mapsLink(query: string): EntityLink {
  return {
    label: "Google Maps",
    url: `https://www.google.com/maps/search/?api=1&query=${enc(query)}`,
    kind: "maps",
  }
}
function wikipediaLink(query: string): EntityLink {
  return {
    label: "Wikipedia",
    url: `https://en.wikipedia.org/wiki/Special:Search?search=${enc(query)}`,
    kind: "wikipedia",
  }
}
function naverLink(query: string): EntityLink {
  return {
    label: "Naver Map",
    url: `https://map.naver.com/p/search/${enc(query)}`,
    kind: "naver",
  }
}
function googleSearchLink(query: string, label = "Search"): EntityLink {
  return {
    label,
    url: `https://www.google.com/search?q=${enc(query)}`,
    kind: "search",
  }
}

// Brand-site router for known hotel chains. Matches by case-insensitive
// substring so "Park Hyatt Seoul" → Hyatt official, "Lotte Hotel Busan"
// → Lotte official. If no brand matches, we skip the official link
// rather than guessing at a URL.
function hotelOfficialLink(name: string): EntityLink | null {
  const lower = name.toLowerCase()
  const brands: Array<{ test: RegExp; label: string; url: string }> = [
    { test: /park hyatt|grand hyatt|hyatt regency|hyatt place|andaz/i, label: "Hyatt", url: "https://www.hyatt.com" },
    { test: /\blotte\b/i, label: "Lotte Hotels", url: "https://www.lottehotel.com" },
    { test: /four seasons/i, label: "Four Seasons", url: "https://www.fourseasons.com" },
    { test: /shilla/i, label: "The Shilla", url: "https://www.shillahotels.com" },
    { test: /conrad/i, label: "Conrad", url: "https://www.hilton.com/en/conrad-hotels" },
    { test: /\bw hotel|\bw seoul|\bw busan/i, label: "W Hotels", url: "https://www.marriott.com/hotels/w-hotels" },
    { test: /signiel|signiel seoul/i, label: "Signiel", url: "https://www.lottehotel.com/signiel-seoul" },
    { test: /josun|josun palace/i, label: "Josun Hotels", url: "https://www.josunhotel.com" },
    { test: /grand walkerhill|walkerhill/i, label: "Walkerhill", url: "https://www.walkerhill.com" },
    { test: /mondrian/i, label: "Mondrian", url: "https://www.mondrianhotels.com" },
    { test: /capella/i, label: "Capella", url: "https://www.capellahotels.com" },
    { test: /paradise/i, label: "Paradise", url: "https://www.paradisehotel.co.kr" },
    { test: /banyan tree/i, label: "Banyan Tree", url: "https://www.banyantree.com" },
  ]
  for (const b of brands) {
    if (b.test.test(lower)) return { label: b.label, url: b.url, kind: "official" }
  }
  return null
}

// Airline-site router for known carriers. Maps a 2-letter code or
// brand-name match to the official site.
function airlineOfficialLink(name: string): EntityLink | null {
  const lower = name.toLowerCase()
  const m = name.match(/\b([A-Z]{2})\s?\d{1,5}\b/)
  const code = m?.[1]
  const carriers: Array<{ test: RegExp; codes?: string[]; label: string; url: string }> = [
    { test: /\bunited|^ua\b/i, codes: ["UA"], label: "United", url: "https://www.united.com" },
    { test: /\bkorean air|\bke\b/i, codes: ["KE"], label: "Korean Air", url: "https://www.koreanair.com" },
    { test: /asiana|\boz\b/i, codes: ["OZ"], label: "Asiana", url: "https://flyasiana.com" },
    { test: /american|\baa\b/i, codes: ["AA"], label: "American", url: "https://www.aa.com" },
    { test: /delta|\bdl\b/i, codes: ["DL"], label: "Delta", url: "https://www.delta.com" },
    { test: /alaska|\bas\b/i, codes: ["AS"], label: "Alaska", url: "https://www.alaskaair.com" },
    { test: /british airways|\bba\b/i, codes: ["BA"], label: "British Airways", url: "https://www.britishairways.com" },
    { test: /japan airlines|\bjl\b/i, codes: ["JL"], label: "JAL", url: "https://www.jal.co.jp" },
    { test: /\bana\b|\bnh\b/i, codes: ["NH"], label: "ANA", url: "https://www.ana.co.jp" },
  ]
  for (const c of carriers) {
    if ((code && c.codes?.includes(code)) || c.test.test(lower)) {
      return { label: c.label, url: c.url, kind: "official" }
    }
  }
  return null
}

export interface ResolveOptions {
  city?: string
}

export function resolveLinks(name: string, type: EntityType, opts: ResolveOptions = {}): EntityLink[] {
  const { city } = opts
  const qWithCity = city ? `${name}, ${city}` : `${name}, South Korea`

  switch (type) {
    case "flight": {
      // "UA 893" or "KE 12" or "United 893"
      const m = name.match(/\b([A-Z]{2})\s?(\d{1,5})\b/)
      const flightId = m ? `${m[1]}${m[2]}` : name.replace(/\s/g, "")
      const links: EntityLink[] = [
        { label: "FlightAware", url: `https://www.flightaware.com/live/flight/${flightId}`, kind: "tracker" },
      ]
      const carrier = airlineOfficialLink(name)
      if (carrier) links.push(carrier)
      links.push(googleSearchLink(`${name} flight status`))
      return links
    }

    case "hotel": {
      const links: EntityLink[] = [mapsLink(qWithCity), naverLink(name)]
      const brand = hotelOfficialLink(name)
      if (brand) links.push(brand)
      links.push(wikipediaLink(name))
      return links
    }

    case "restaurant": {
      return [
        mapsLink(qWithCity),
        naverLink(name),
        { label: "Catch Table", url: `https://app.catchtable.co.kr/ct/search?keyword=${enc(name)}`, kind: "reservation" },
        googleSearchLink(`${name} ${city ?? "Seoul"} restaurant`),
      ]
    }

    case "city":
    case "neighborhood": {
      const display = type === "neighborhood" && city ? `${name}, ${city}` : qWithCity
      return [
        mapsLink(display),
        wikipediaLink(name),
        naverLink(name),
      ]
    }

    case "palace":
    case "museum": {
      return [
        mapsLink(qWithCity),
        wikipediaLink(name),
        { label: "Visit Korea", url: `https://english.visitkorea.or.kr/svc/search/sch.do?keyword=${enc(name)}`, kind: "official" },
        naverLink(name),
      ]
    }

    case "transit": {
      // Often KTX trains or subway lines
      const links: EntityLink[] = []
      if (/\bktx\b|\bsrt\b/i.test(name)) {
        links.push({ label: "Korail (KTX)", url: "https://www.letskorail.com/", kind: "official" })
        links.push({ label: "SRT", url: "https://www.srail.or.kr/main.do", kind: "official" })
      }
      links.push(mapsLink(qWithCity))
      links.push(wikipediaLink(name))
      return links
    }

    case "airport": {
      return [
        mapsLink(name),
        wikipediaLink(name),
        { label: "FlightAware", url: `https://www.flightaware.com/live/airport/${enc(name)}`, kind: "tracker" },
      ]
    }

    case "person": {
      return [wikipediaLink(name), googleSearchLink(name)]
    }

    case "place":
    default: {
      return [mapsLink(qWithCity), wikipediaLink(name), naverLink(name)]
    }
  }
}

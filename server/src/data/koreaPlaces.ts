// Geo + metadata lookup for places referenced by the Korea itinerary.
// Used by /api/korea/day/:slug/places to produce a ranked, geocoded list
// of points around the user's current location.
//
// Coordinates are hand-curated from public sources (Naver Map, Google Maps,
// Wikipedia). All values are WGS-84 decimal degrees. Add new places by
// dropping another entry with the same shape.

export type PlaceCategory =
  | "hotel"
  | "palace"
  | "museum"
  | "shrine"
  | "market"
  | "shopping"
  | "cafe"
  | "restaurant"
  | "bar"
  | "park"
  | "viewpoint"
  | "experience"
  | "transit"
  | "neighborhood"
  | "venue"

export interface PlaceDef {
  id: string
  name: string
  category: PlaceCategory
  lat: number
  lng: number
  city: "Seoul" | "Busan" | "Yangju" | "Incheon" | "Other"
  address?: string
  description: string
  photoQuery: string // For Unsplash / Wikimedia lookup
  openingHours?: string
  notice?: string // e.g. "Closed Mondays"
  // Free-text aliases used by the day extractor to map a section bullet to
  // this place. Match is case-insensitive and substring.
  aliases?: string[]
}

// Icon glyphs by category (emoji — rendered both in the 3D scene and detail sheet)
export const categoryIcon: Record<PlaceCategory, string> = {
  hotel: "🏨",
  palace: "🏯",
  museum: "🏛️",
  shrine: "⛩️",
  market: "🛒",
  shopping: "🛍️",
  cafe: "☕",
  restaurant: "🍴",
  bar: "🍸",
  park: "🌳",
  viewpoint: "🗼",
  experience: "🎟️",
  transit: "🚄",
  neighborhood: "📍",
  venue: "💒",
}

export const categoryColor: Record<PlaceCategory, string> = {
  hotel: "#a78bfa",
  palace: "#f97316",
  museum: "#0ea5e9",
  shrine: "#eab308",
  market: "#f59e0b",
  shopping: "#ec4899",
  cafe: "#92400e",
  restaurant: "#ef4444",
  bar: "#8b5cf6",
  park: "#22c55e",
  viewpoint: "#06b6d4",
  experience: "#f43f5e",
  transit: "#64748b",
  neighborhood: "#f43f5e",
  venue: "#e11d48",
}

export const koreaPlaces: PlaceDef[] = [
  // ── Hotels ──────────────────────────────────────────────────────
  {
    id: "hotel-parnas",
    name: "Grand InterContinental Seoul Parnas",
    category: "hotel",
    lat: 37.5093,
    lng: 127.0578,
    city: "Seoul",
    address: "521 Teheran-ro, Gangnam-gu",
    description: "Day 1–3 base · COEX-adjacent business hotel with Grand Kitchen restaurant and a quiet lobby lounge.",
    photoQuery: "InterContinental Seoul Parnas COEX",
    aliases: ["Parnas", "Grand InterContinental"],
  },
  {
    id: "hotel-phs",
    name: "Park Hyatt Seoul",
    category: "hotel",
    lat: 37.5081,
    lng: 127.0606,
    city: "Seoul",
    address: "606 Teheran-ro, Gangnam-gu",
    description: "Day 3–9 base · Samseong-side luxury with The Lounge (24F) and 24F infinity pool.",
    photoQuery: "Park Hyatt Seoul Gangnam",
    aliases: ["Park Hyatt"],
  },
  {
    id: "hotel-signiel-busan",
    name: "Signiel Busan",
    category: "hotel",
    lat: 35.1485,
    lng: 129.1601,
    city: "Busan",
    address: "30 Dalmaji-gil, Haeundae-gu",
    description: "Day 9 base · LCT Tower hotel above Haeundae beach with Chaoran Bar on L14.",
    photoQuery: "Signiel Busan LCT Tower",
    aliases: ["Signiel Busan"],
  },
  {
    id: "hotel-signiel-seoul",
    name: "Signiel Seoul",
    category: "hotel",
    lat: 37.5126,
    lng: 127.1025,
    city: "Seoul",
    address: "300 Olympic-ro, Songpa-gu",
    description: "Day 10–12 base · L76-101 of Lotte World Tower with Bicena (L81) and 123 Lounge (L123).",
    photoQuery: "Signiel Seoul Lotte World Tower",
    aliases: ["Signiel Seoul"],
  },

  // ── Palaces / museums ───────────────────────────────────────────
  {
    id: "gyeongbokgung",
    name: "Gyeongbokgung Palace",
    category: "palace",
    lat: 37.5796,
    lng: 126.977,
    city: "Seoul",
    address: "161 Sajik-ro, Jongno-gu",
    description: "Joseon dynasty's main palace. 10:00 Royal Guard ceremony; hanbok rental gets free entry.",
    photoQuery: "Gyeongbokgung Palace Seoul",
    openingHours: "Wed–Mon 09:00–18:00",
    notice: "Closed Tuesdays (May 26 + Jun 2)",
    aliases: ["Gyeongbokgung"],
  },
  {
    id: "changdeokgung",
    name: "Changdeokgung",
    category: "palace",
    lat: 37.5794,
    lng: 126.9911,
    city: "Seoul",
    address: "99 Yulgok-ro, Jongno-gu",
    description: "UNESCO-listed palace with the famous Secret Garden tour.",
    photoQuery: "Changdeokgung Secret Garden",
    notice: "Closed Mondays",
    aliases: ["Changdeokgung"],
  },
  {
    id: "bongeunsa",
    name: "Bongeunsa Temple",
    category: "shrine",
    lat: 37.5145,
    lng: 127.0573,
    city: "Seoul",
    address: "531 Bongeunsa-ro, Gangnam-gu",
    description: "Working Jogye-order temple opposite COEX. Lantern courtyards prettiest at sunset.",
    photoQuery: "Bongeunsa Temple lanterns",
    aliases: ["Bongeunsa"],
  },
  {
    id: "leeum",
    name: "Leeum Museum",
    category: "museum",
    lat: 37.5384,
    lng: 126.9994,
    city: "Seoul",
    address: "60-16 Itaewon-ro 55-gil, Yongsan-gu",
    description: "Samsung's flagship contemporary art museum. Tino Sehgal exhibit through Jun 28.",
    photoQuery: "Leeum Museum of Art Seoul",
    openingHours: "Tue–Sun 10:00–18:00",
    notice: "Closed Mondays",
    aliases: ["Leeum"],
  },
  {
    id: "apma",
    name: "Amorepacific Museum (APMA)",
    category: "museum",
    lat: 37.5293,
    lng: 126.9648,
    city: "Seoul",
    address: "100 Hangang-daero, Yongsan-gu",
    description: "David Chipperfield HQ with 'Chapter Five' exhibit — Nam June Paik's TV Vertical Flower returning after 20 years.",
    photoQuery: "Amorepacific Museum Seoul Chipperfield",
    aliases: ["APMA", "Amorepacific"],
  },
  {
    id: "nmk",
    name: "National Museum of Korea",
    category: "museum",
    lat: 37.524,
    lng: 126.9802,
    city: "Seoul",
    address: "137 Seobinggo-ro, Yongsan-gu",
    description: "Korea's national museum. Joseon-master 'Kim Hongdo: Painting His Era' blockbuster May 4 – Aug 2. Free admission.",
    photoQuery: "National Museum of Korea Yongsan",
    aliases: ["NMK", "National Museum of Korea"],
  },
  {
    id: "mmca",
    name: "MMCA Seoul",
    category: "museum",
    lat: 37.5784,
    lng: 126.98,
    city: "Seoul",
    address: "30 Samcheong-ro, Jongno-gu",
    description: "National Museum of Modern and Contemporary Art. Late hours Wed/Sat to 21:00.",
    photoQuery: "MMCA Seoul Samcheong",
    openingHours: "Daily 10:00–18:00, Wed/Sat to 21:00",
    aliases: ["MMCA"],
  },

  // ── Markets ─────────────────────────────────────────────────────
  {
    id: "gwangjang",
    name: "Gwangjang Market",
    category: "market",
    lat: 37.5703,
    lng: 127.0,
    city: "Seoul",
    address: "88 Changgyeonggung-ro, Jongno-gu",
    description: "100-year-old covered market famous for bindaetteok, mayak gimbap, and yukhoe.",
    photoQuery: "Gwangjang Market Seoul food",
    aliases: ["Gwangjang"],
  },
  {
    id: "haeundae-market",
    name: "Haeundae Traditional Market",
    category: "market",
    lat: 35.16,
    lng: 129.1612,
    city: "Busan",
    description: "Raw seafood crawl in a covered alley two blocks back from Haeundae Beach.",
    photoQuery: "Haeundae Traditional Market raw fish",
    aliases: ["Haeundae Traditional Market"],
  },
  {
    id: "jagalchi",
    name: "Jagalchi Fish Market",
    category: "market",
    lat: 35.0964,
    lng: 129.0317,
    city: "Busan",
    description: "Korea's largest fish market — pick your tank downstairs, eat upstairs.",
    photoQuery: "Jagalchi Fish Market Busan",
    aliases: ["Jagalchi"],
  },

  // ── Shopping ────────────────────────────────────────────────────
  {
    id: "starfield-coex",
    name: "Starfield Library (COEX)",
    category: "shopping",
    lat: 37.5114,
    lng: 127.0598,
    city: "Seoul",
    address: "513 Yeongdong-daero, Gangnam-gu",
    description: "Two-story open-air library inside COEX Mall. Free, open 10:30–22:00.",
    photoQuery: "Starfield Library COEX Seoul",
    aliases: ["Starfield", "COEX Library"],
  },
  {
    id: "galleria",
    name: "Galleria Department Store",
    category: "shopping",
    lat: 37.527,
    lng: 127.0394,
    city: "Seoul",
    address: "343 Apgujeong-ro, Gangnam-gu",
    description: "Korea's flagship luxury department store. West = international maisons, East = Korean designers, Gourmet 494 in basement.",
    photoQuery: "Galleria Department Store Apgujeong",
    aliases: ["Galleria"],
  },
  {
    id: "ap-house",
    name: "AP House Seoul",
    category: "shopping",
    lat: 37.5247,
    lng: 127.0481,
    city: "Seoul",
    address: "10 Apgujeong-ro 56-gil, Gangnam-gu",
    description: "6-story Audemars Piguet flagship. Appointment-only.",
    photoQuery: "Audemars Piguet AP House Seoul",
    openingHours: "By appointment",
    aliases: ["AP House"],
  },
  {
    id: "haus-dosan",
    name: "Gentle Monster Haus Dosan",
    category: "shopping",
    lat: 37.5236,
    lng: 127.0356,
    city: "Seoul",
    address: "12 Apgujeong-ro 46-gil, Gangnam-gu",
    description: "5-floor flagship — eyewear + kinetic sculpture + Nudake café.",
    photoQuery: "Gentle Monster Haus Dosan Seoul",
    aliases: ["Haus Dosan", "Gentle Monster"],
  },
  {
    id: "haus-nowhere",
    name: "HAUS NOWHERE Seongsu",
    category: "shopping",
    lat: 37.5448,
    lng: 127.0568,
    city: "Seoul",
    description: "Gentle Monster's experimental retail concept opened Sept 2025.",
    photoQuery: "Haus Nowhere Seongsu Gentle Monster",
    aliases: ["HAUS NOWHERE", "Haus Nowhere"],
  },
  {
    id: "musinsa-megastore",
    name: "Musinsa Megastore Seongsu",
    category: "shopping",
    lat: 37.5444,
    lng: 127.0558,
    city: "Seoul",
    description: "Korea's biggest streetwear retailer flagship — opened Apr 2026.",
    photoQuery: "Musinsa Seongsu",
    aliases: ["Musinsa Megastore", "Musinsa Standard"],
  },
  {
    id: "lotte-mall",
    name: "Lotte World Mall",
    category: "shopping",
    lat: 37.5126,
    lng: 127.1024,
    city: "Seoul",
    address: "300 Olympic-ro, Songpa-gu",
    description: "Massive mall at the base of Lotte World Tower. Avenuel luxury hall + duty free.",
    photoQuery: "Lotte World Mall Jamsil",
    aliases: ["Lotte World Mall", "Avenuel"],
  },

  // ── Cafés / bakeries ────────────────────────────────────────────
  {
    id: "cafe-onion",
    name: "Cafe Onion Seongsu",
    category: "cafe",
    lat: 37.5413,
    lng: 127.0553,
    city: "Seoul",
    description: "Factory-remodel café landmark — pandoro is the move.",
    photoQuery: "Cafe Onion Seongsu",
    aliases: ["Cafe Onion", "Onion Seongsu"],
  },
  {
    id: "starbucks-reserve-dosan",
    name: "Starbucks Reserve Dosan",
    category: "cafe",
    lat: 37.5236,
    lng: 127.0354,
    city: "Seoul",
    description: "Korea's first Reserve specialty store. Opened Apr 29, 2026.",
    photoQuery: "Starbucks Reserve Dosan Park",
    aliases: ["Starbucks Reserve"],
  },
  {
    id: "fritz-coffee",
    name: "Fritz Coffee Hannam",
    category: "cafe",
    lat: 37.5365,
    lng: 127.0027,
    city: "Seoul",
    description: "Seoul's most-loved specialty roaster — seal-logo cult brand.",
    photoQuery: "Fritz Coffee Hannam Seoul",
    aliases: ["Fritz Coffee", "Fritz"],
  },

  // ── Restaurants / bars ──────────────────────────────────────────
  {
    id: "born-bred",
    name: "Born & Bred Seoul",
    category: "restaurant",
    lat: 37.5648,
    lng: 127.0397,
    city: "Seoul",
    address: "2F, 1 Majang-ro 42-gil, Seongdong-gu",
    description: "Hanwoo butcher omakase from Korea's top 1++ beef. 2-hour cap.",
    photoQuery: "Born and Bred Seoul hanwoo",
    aliases: ["Born & Bred", "Born and Bred"],
  },
  {
    id: "zest",
    name: "Zest Seoul",
    category: "bar",
    lat: 37.5263,
    lng: 127.0354,
    city: "Seoul",
    address: "26 Dosan-daero 55-gil, Gangnam-gu",
    description: "Asia's 50 Best Bars #2. Sustainability-led cocktails behind a Hannam brownstone.",
    photoQuery: "Zest Seoul cocktail bar",
    aliases: ["Zest"],
  },
  {
    id: "doori",
    name: "Doori",
    category: "restaurant",
    lat: 37.5354,
    lng: 127.0025,
    city: "Seoul",
    description: "New 2026 MICHELIN — Korean-Western tasting, 'All of Today's Scraps' zero-waste signature.",
    photoQuery: "Doori restaurant Hannam Korean",
    aliases: ["Doori"],
  },
  {
    id: "bicena",
    name: "Bicena (Signiel Seoul L81)",
    category: "restaurant",
    lat: 37.5126,
    lng: 127.1025,
    city: "Seoul",
    description: "★ MICHELIN Korean fine dining on L81 of Lotte World Tower.",
    photoQuery: "Bicena Signiel Seoul",
    aliases: ["Bicena"],
  },
  {
    id: "san",
    name: "Restaurant San",
    category: "restaurant",
    lat: 37.5197,
    lng: 127.0306,
    city: "Seoul",
    description: "Asia's 50 Best 2026 'One To Watch' — Chef Jo Seung-hyun (ex-Benu SF). 3-hr subterranean tasting.",
    photoQuery: "Restaurant San Seoul Gangnam",
    aliases: ["Restaurant San", "San"],
  },
  {
    id: "le-chamber",
    name: "Le Chamber",
    category: "bar",
    lat: 37.5263,
    lng: 127.0414,
    city: "Seoul",
    description: "Asia's 50 Best speakeasy behind a bookshelf. Ginseng martini is the move.",
    photoQuery: "Le Chamber Seoul speakeasy",
    aliases: ["Le Chamber"],
  },
  {
    id: "bar-cham",
    name: "Bar Cham",
    category: "bar",
    lat: 37.5757,
    lng: 126.9747,
    city: "Seoul",
    description: "Seochon hanok cocktail room. Korean-native-spirits program. #7 Asia's 50 Best 2026.",
    photoQuery: "Bar Cham Seoul hanok",
    aliases: ["Bar Cham"],
  },
  {
    id: "josaeho",
    name: "Josaeho Gwangalli",
    category: "restaurant",
    lat: 35.153,
    lng: 129.1183,
    city: "Busan",
    description: "3-tier grilled-shellfish tower with Gwangan Bridge straight ahead.",
    photoQuery: "Josaeho Gwangalli shellfish",
    aliases: ["Josaeho"],
  },
  {
    id: "chaoran",
    name: "Chaoran Bar (Signiel Busan L14)",
    category: "bar",
    lat: 35.1485,
    lng: 129.1601,
    city: "Busan",
    description: "Korean-ingredient cocktails with the coastline view from Signiel Busan L14.",
    photoQuery: "Chaoran Bar Signiel Busan",
    aliases: ["Chaoran"],
  },

  // ── Parks / viewpoints ──────────────────────────────────────────
  {
    id: "seoul-forest",
    name: "Seoul Forest",
    category: "park",
    lat: 37.5443,
    lng: 127.0376,
    city: "Seoul",
    description: "Seoul's green lung — deer enclosure, lakes, the Garden Show 2026 anchor.",
    photoQuery: "Seoul Forest Seongsu",
    aliases: ["Seoul Forest"],
  },
  {
    id: "han-river",
    name: "Han River — Banpo",
    category: "park",
    lat: 37.5113,
    lng: 126.9961,
    city: "Seoul",
    description: "Riverside park with the Moonlight Rainbow Fountain (20:00 + 21:00 shows).",
    photoQuery: "Banpo Bridge Rainbow Fountain",
    aliases: ["Banpo", "Han River"],
  },
  {
    id: "ttukseom-hangang",
    name: "Ttukseom Hangang Park",
    category: "park",
    lat: 37.531,
    lng: 127.0696,
    city: "Seoul",
    description: "Hangang Drone Light Show venue. Access via Jayang Stn L7 Exits 2/3.",
    photoQuery: "Ttukseom Hangang Park Seoul",
    aliases: ["Ttukseom"],
  },
  {
    id: "seoul-sky",
    name: "Seoul Sky (Lotte World Tower)",
    category: "viewpoint",
    lat: 37.5126,
    lng: 127.1025,
    city: "Seoul",
    description: "Observation deck on L117–123. 123 Lounge is Korea's highest bar at 555m.",
    photoQuery: "Seoul Sky Lotte World Tower view",
    aliases: ["Seoul Sky", "123 Lounge", "Lotte World Tower"],
  },
  {
    id: "haeundae-beach",
    name: "Haeundae Beach",
    category: "park",
    lat: 35.1587,
    lng: 129.1604,
    city: "Busan",
    description: "Busan's flagship beach. Sand Festival sculptures remain through Jun 14.",
    photoQuery: "Haeundae Beach Busan",
    notice: "Swim season opens Jun 26; water 17–19 °C in early June",
    aliases: ["Haeundae Beach", "Haeundae"],
  },
  {
    id: "gwangan-bridge",
    name: "Gwangalli Beach",
    category: "park",
    lat: 35.1531,
    lng: 129.119,
    city: "Busan",
    description: "Bay facing Gwangan Bridge — Busan's most photogenic skyline. Bridge light-up at 20:00.",
    photoQuery: "Gwangalli Beach Gwangan Bridge night",
    aliases: ["Gwangalli", "Gwangan Bridge"],
  },
  {
    id: "cheongsapo",
    name: "Cheongsapo Sky Capsule",
    category: "experience",
    lat: 35.1666,
    lng: 129.1922,
    city: "Busan",
    description: "Pods running 30m above the old coastal rail line. Mipo → Cheongsapo direction sells out first.",
    photoQuery: "Haeundae Sky Capsule Cheongsapo",
    aliases: ["Sky Capsule", "Cheongsapo", "Mipo"],
  },

  // ── Neighborhoods (geocoded to a representative point) ─────────
  {
    id: "n-bukchon",
    name: "Bukchon Hanok Village",
    category: "neighborhood",
    lat: 37.5826,
    lng: 126.9836,
    city: "Seoul",
    description: "Hanok-lined hillside between Gyeongbokgung and Changdeokgung. Walk 10am–4pm only (Red Zone enforced).",
    photoQuery: "Bukchon Hanok Village",
    notice: "Closed to tourists 5 PM – 10 AM (₩100K fine)",
    aliases: ["Bukchon"],
  },
  {
    id: "n-ikseondong",
    name: "Ikseon-dong",
    category: "neighborhood",
    lat: 37.5727,
    lng: 126.9907,
    city: "Seoul",
    description: "Hanok-café labyrinth — best late-afternoon light.",
    photoQuery: "Ikseondong hanok alley Seoul",
    aliases: ["Ikseondong", "Ikseon-dong"],
  },
  {
    id: "n-seongsu",
    name: "Seongsu",
    category: "neighborhood",
    lat: 37.5446,
    lng: 127.056,
    city: "Seoul",
    description: "Seoul's Brooklyn — factory cafés, Korean designer flagships, indie roasters.",
    photoQuery: "Seongsu Seoul cafe",
    aliases: ["Seongsu"],
  },
  {
    id: "n-hannam",
    name: "Hannam",
    category: "neighborhood",
    lat: 37.5366,
    lng: 127.0008,
    city: "Seoul",
    description: "Quiet-luxury Hannam — David Chipperfield architecture, fragrance flagships, museum row.",
    photoQuery: "Hannam-dong Seoul street",
    aliases: ["Hannam"],
  },
  {
    id: "n-itaewon",
    name: "Itaewon Antiques Street",
    category: "neighborhood",
    lat: 37.5343,
    lng: 126.9942,
    city: "Seoul",
    description: "1km of 1960s-origin dealers: jewelry, furniture, vintage accessories.",
    photoQuery: "Itaewon antiques Seoul",
    aliases: ["Itaewon Antiques"],
  },

  // ── Wedding venue ───────────────────────────────────────────────
  {
    id: "hesse-garden",
    name: "Yangju Hesse's Garden",
    category: "venue",
    lat: 37.8267,
    lng: 126.9764,
    city: "Yangju",
    address: "111 Hoguk-ro 550beon-gil, Jangheung-myeon, Yangju-si",
    description: "Wedding venue — forested countryside ~1h15m north of Gangnam via Sejong-Pocheon Expressway.",
    photoQuery: "Yangju Hesse Garden wedding",
    aliases: ["Hesse's Garden", "Yangju"],
  },

  // ── Airport ─────────────────────────────────────────────────────
  {
    id: "icn",
    name: "Incheon International Airport (ICN)",
    category: "transit",
    lat: 37.4602,
    lng: 126.4407,
    city: "Incheon",
    description: "ICN Terminal 1 for UA 893/902. AREX Express from Seoul Station = 43 min.",
    photoQuery: "Incheon Airport Terminal 1",
    aliases: ["ICN", "Incheon Airport"],
  },

  // ── Transit ─────────────────────────────────────────────────────
  {
    id: "seoul-station",
    name: "Seoul Station (KTX)",
    category: "transit",
    lat: 37.554,
    lng: 126.9707,
    city: "Seoul",
    description: "KTX 007 outbound platform — 06:33 to Busan.",
    photoQuery: "Seoul Station KTX",
    aliases: ["Seoul Station"],
  },
  {
    id: "busan-station",
    name: "Busan Station (KTX)",
    category: "transit",
    lat: 35.115,
    lng: 129.0413,
    city: "Busan",
    description: "KTX 026 return platform — 10:28 to Seoul.",
    photoQuery: "Busan Station KTX",
    aliases: ["Busan Station"],
  },
]

// Compute Haversine distance in meters between two lat/lng pairs.
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000
  const toRad = (n: number) => (n * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function formatDistance(meters: number): string {
  if (meters < 1_000) return `${Math.round(meters)} m`
  if (meters < 10_000) return `${(meters / 1_000).toFixed(1)} km`
  return `${Math.round(meters / 1_000)} km`
}

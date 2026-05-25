// Static snapshot of the Seoul + Busan itinerary from the source Notion
// workspace. Kept in code so the /korea route renders instantly without a
// Notion API token; the route will prefer live Notion data when NOTION_TOKEN
// is set, falling back to this snapshot.
//
// Generated from the May 25, 2026 (T-1) state of the Notion pages,
// cross-referenced against latest weather (KMA / AccuWeather), MICHELIN
// Guide 2026, Asia's 50 Best 2026, and current Korean event/traffic news.

export type ReservationStatus = "confirmed" | "tentative" | "pending"
export type ReservationType =
  | "flight"
  | "hotel"
  | "meal"
  | "bar"
  | "experience"
  | "transit"
  | "event"
  | "appointment"
  | "wedding"

export interface Reservation {
  id: string
  date: string // ISO yyyy-mm-dd
  time?: string // HH:mm in local Seoul/Busan time
  type: ReservationType
  status: ReservationStatus
  title: string
  subtitle?: string
  address?: string
  contact?: string
  url?: string
  notes?: string
  dayNumber?: number
}

export interface DaySection {
  heading: string
  time?: string
  bullets: string[]
}

export interface Day {
  n: number
  slug: string
  date: string // ISO
  dayOfWeek: string
  emoji: string
  title: string
  city: "Seoul" | "Busan" | "Yangju" | "Incheon"
  neighborhoods: string[]
  theme: string
  hotel: string
  weather?: { highC: number; lowC: number; condition: string }
  reservations: Reservation[]
  sections: DaySection[]
  callouts?: { icon: string; tone: "info" | "warn" | "success" | "alert"; body: string }[]
}

export interface Snapshot {
  generatedAt: string
  trip: {
    title: string
    startDate: string
    endDate: string
    flights: { out: string; back: string; confirmation: string }
    hotels: { name: string; nights: string }[]
    anchor: string
    holidays: string[]
  }
  status: {
    tMinus: number
    asOf: string
    headline: string
    weather: string[]
    bookActions: { id: string; label: string }[]
    adds: string[]
  }
  reservations: Reservation[]
  days: Day[]
  neighborhoods: { name: string; days: string; picks: string }[]
}

export const koreaSnapshot: Snapshot = {
  generatedAt: "2026-05-25T00:00:00+09:00",
  trip: {
    title: "South Korea — Seoul + Busan",
    startDate: "2026-05-26",
    endDate: "2026-06-06",
    flights: {
      out: "UA 893 · Mon May 25 10:40 AM PDT → ICN Tue May 26 3:00 PM KST",
      back: "UA 902 · Sat Jun 6 4:50 PM KST → SFO 12:00 PM same day",
      confirmation: "NKXR3T",
    },
    hotels: [
      { name: "Grand InterContinental Seoul Parnas", nights: "May 26 – 28" },
      { name: "Park Hyatt Seoul", nights: "May 28 – Jun 3" },
      { name: "Signiel Busan", nights: "Jun 3 – 4" },
      { name: "Signiel Seoul (Lotte World Tower L76-101)", nights: "Jun 4 – 6" },
    ],
    anchor: "Wedding · Sun May 31, 5 PM · Yangju Hesse's Garden",
    holidays: ["Wed Jun 3 — Local Election Day (9th nationwide)", "Sat Jun 6 — Memorial Day (10 AM siren)"],
  },
  status: {
    tMinus: 1,
    asOf: "Mon May 25, 2026",
    headline: "Bags packed, T-1. Wedding day now 26 °C / 16 °C — 5 °C cooler than the T-9 forecast.",
    weather: [
      "Seoul Tue–Thu May 26–28: 23–28 °C / 15–19 °C · light showers May 26–27, cooler dip May 28",
      "Seoul Fri–Sat May 29–30: 29–31 °C / 15–18 °C, sunny",
      "Sun May 31 Yangju (wedding): 26 °C / 16 °C, clear, dry — light cardigan for evening",
      "Mon Jun 1–Tue Jun 2 Seoul: 25/15 dry · Wed Jun 3 Busan 24/17 light shower risk · Thu Jun 4 Busan 25/19",
      "Fri Jun 5 Seoul: 25 / 17, partly cloudy · drone-show wind ~4 m/s, borderline 5 m/s cancel threshold",
      "Pre-jangma window (central onset ~Jun 25–27) · no yellow-dust alert · no typhoon activity",
    ],
    bookActions: [
      { id: "sky-capsule", label: "Sky Capsule Wed Jun 3 (1–2 week window — Klook/KKday for foreign cards)" },
      { id: "bicena", label: "Bicena (Signiel Seoul L81) — Thu Jun 4 dinner · 2 months out" },
      { id: "doori", label: "Doori (Hannam) — Tue Jun 2 dinner · Catch Table" },
      { id: "san", label: "Restaurant San — Fri Jun 5 lunch 12:00" },
      { id: "busan-dinner", label: "Busan dinner Wed Jun 3 — Le Dorer ★ / IAán / Ilpum / Living Room PHB / Mori ★" },
    ],
    adds: [
      "GiwaKang promoted to ★ MICHELIN 2026 — book Bukchon hanok lunch ahead",
      "Le Dorer (Busan, Marine City) newly ★ MICHELIN 2026 — Busan's 4th star",
      "Busan Classic Park Concert (Hayaria Lawn, Citizens' Park, 18:30) — Wed Jun 3 KBS Symphony · Thu Jun 4 Busan Phil — FREE first-come",
      "Seoul Garden Festival weekend programming through Jun 7 — Leenalchi · 10cm · MeloMance on Seoul Forest stage",
      "Car-Free Jamsugyo Bridge Festival Sun May 31 (Banpo Hangang Park) — pedestrian bridge crossing",
      "Hangang Triathlon Jun 5–7 (Ttukseom + MY PACE) — overlaps drone show, add buffer",
      "Naver Map star ratings restored April 2026 — reliable signal again for restaurant scouting",
    ],
  },
  reservations: [
    {
      id: "ua-893",
      date: "2026-05-25",
      time: "10:40",
      type: "flight",
      status: "confirmed",
      title: "UA 893 · SFO → ICN",
      subtitle: "Lands ICN Tue May 26 3:00 PM KST",
      contact: "Conf NKXR3T",
      dayNumber: 1,
    },
    {
      id: "hotel-parnas",
      date: "2026-05-26",
      type: "hotel",
      status: "confirmed",
      title: "Grand InterContinental Seoul Parnas",
      subtitle: "2 nights · May 26 – 28",
      address: "521 Teheran-ro, Gangnam-gu · Samseong / COEX",
      dayNumber: 1,
    },
    {
      id: "ap-house",
      date: "2026-05-27",
      time: "11:00",
      type: "appointment",
      status: "confirmed",
      title: "AP House Seoul",
      subtitle: "Audemars Piguet flagship · 60–90 min slot",
      address: "Cheongdam Luxury Street, Gangnam-gu",
      contact: "+82 2-3438-4090 · audemarspiguet.com",
      notes: "Bring passport for tax-refund eligibility. Mention any existing AP CRM relationship on booking.",
      dayNumber: 2,
    },
    {
      id: "hotel-phs",
      date: "2026-05-28",
      type: "hotel",
      status: "confirmed",
      title: "Park Hyatt Seoul",
      subtitle: "6 nights · May 28 – Jun 3",
      address: "606 Teheran-ro, Gangnam-gu · Samseong",
      dayNumber: 3,
    },
    {
      id: "born-bred",
      date: "2026-05-29",
      time: "18:00",
      type: "meal",
      status: "confirmed",
      title: "Born & Bred Seoul",
      subtitle: "Hanwoo omakase · butcher-theatre",
      address: "2F, 1 Majang-ro 42-gil, Seongdong-gu · Majang Stn L5 Exit 3",
      contact: "+82 2-2294-5005",
      notes: "2-hour dining cap. >15 min late forfeits table.",
      dayNumber: 4,
    },
    {
      id: "zest",
      date: "2026-05-30",
      time: "15:00",
      type: "bar",
      status: "confirmed",
      title: "Zest Seoul",
      subtitle: "Asia's 50 Best Bars #2",
      address: "26 Dosan-daero 55-gil, Gangnam-gu · Sinsa/Apgujeong",
      contact: "+82 2-794-1614",
      notes: "Sat/Sun open 15:00–02:00 — 3 PM is the open time.",
      dayNumber: 5,
    },
    {
      id: "wedding",
      date: "2026-05-31",
      time: "17:00",
      type: "wedding",
      status: "confirmed",
      title: "Wedding ceremony",
      subtitle: "Anchor event of the trip",
      address: "Yangju Hesse's Garden · 111 Hoguk-ro 550beon-gil, Jangheung-myeon, Yangju-si",
      notes: "Leave Park Hyatt 3:00 PM sharp. Pre-book Kakao Black round-trip with driver-wait. Cash envelope (축의금) ₩100–200K.",
      dayNumber: 6,
    },
    {
      id: "perfume",
      date: "2026-06-02",
      time: "14:30",
      type: "experience",
      status: "confirmed",
      title: "Perfume Making class",
      subtitle: "~2 hr studio session",
      address: "1 Noksapyeong-daero 40na-gil, Yongsan-gu · Noksapyeong Stn L6",
      notes: "Confirm directly with studio (Naver Smart Place / Instagram DM / Catch Table).",
      dayNumber: 8,
    },
    {
      id: "doori",
      date: "2026-06-02",
      time: "19:00",
      type: "meal",
      status: "pending",
      title: "Doori",
      subtitle: "MICHELIN Selected 2026 · Korean-Western tasting (zero-waste signature)",
      address: "Yongsan-gu · Hannam",
      contact: "Catch Table",
      notes: "Books ~1 month ahead — book now.",
      dayNumber: 8,
    },
    {
      id: "ktx-007",
      date: "2026-06-03",
      time: "06:33",
      type: "transit",
      status: "confirmed",
      title: "KTX 007 · Seoul → Busan",
      subtitle: "Car 3, Seats 1B / 1C · arrives 09:22",
      address: "Seoul Station — leave Park Hyatt 05:45",
      contact: "ETh 87305-0505-10004-56 · AL 87304-0505-10010-00 (Korail app)",
      dayNumber: 9,
    },
    {
      id: "sky-capsule",
      date: "2026-06-03",
      type: "experience",
      status: "pending",
      title: "Sky Capsule · Mipo → Cheongsapo",
      subtitle: "Haeundae Blueline Park",
      contact: "bluelinepark.com or Klook / KKday / GetYourGuide",
      notes: "1–2 week booking window — likely sold out on official site by now; Klook / KKday / GetYourGuide hold inventory for foreign cards. Pricing ₩35K (1–2 pax) / ₩45K (3) / ₩50K (4).",
      dayNumber: 9,
    },
    {
      id: "hotel-signiel-busan",
      date: "2026-06-03",
      type: "hotel",
      status: "confirmed",
      title: "Signiel Busan",
      subtitle: "1 night",
      address: "30 Dalmaji-gil, Haeundae-gu, Busan",
      dayNumber: 9,
    },
    {
      id: "busan-dinner",
      date: "2026-06-03",
      type: "meal",
      status: "pending",
      title: "Busan dinner — pick ONE",
      subtitle: "Le Dorer ★ · IAán · Ilpum Hanwoo · Living Room PHB · Mori Masters ★",
      address: "Haeundae / Marine City",
      contact: "Catch Table",
      dayNumber: 9,
    },
    {
      id: "ktx-026",
      date: "2026-06-04",
      time: "10:28",
      type: "transit",
      status: "confirmed",
      title: "KTX 026 · Busan → Seoul",
      subtitle: "Car 3, Seats 2C / 2B · arrives 13:04",
      address: "Busan Station — leave Signiel Busan 09:30",
      dayNumber: 10,
    },
    {
      id: "hotel-signiel-seoul",
      date: "2026-06-04",
      type: "hotel",
      status: "confirmed",
      title: "Signiel Seoul",
      subtitle: "2 nights · L76-101 Lotte World Tower",
      address: "300 Olympic-ro, Songpa-gu · Jamsil",
      dayNumber: 10,
    },
    {
      id: "bicena",
      date: "2026-06-04",
      time: "19:00",
      type: "meal",
      status: "pending",
      title: "Bicena · Signiel Seoul L81",
      subtitle: "★ MICHELIN Korean fine dining",
      address: "Lotte World Tower L81, Jamsil",
      contact: "Catch Table or Signiel concierge",
      notes: "Books fill 2 months out. Window-side L81 table preferred. Smart & Elegant dress code.",
      dayNumber: 10,
    },
    {
      id: "san",
      date: "2026-06-05",
      time: "12:00",
      type: "meal",
      status: "pending",
      title: "Restaurant San (lunch)",
      subtitle: "50 Best 2026 'One To Watch' · 3-hr tasting",
      address: "Gangnam-gu (subterranean)",
      contact: "restaurantsan.com · contact@restaurantsan.com",
      dayNumber: 11,
    },
    {
      id: "lijin",
      date: "2026-06-05",
      time: "15:30",
      type: "appointment",
      status: "confirmed",
      title: "Lijin Clinic",
      address: "Myeongdong",
      dayNumber: 11,
    },
    {
      id: "drone-show",
      date: "2026-06-05",
      time: "20:30",
      type: "event",
      status: "tentative",
      title: "Hangang Drone Light Show",
      subtitle: "Free · 1,200 main drones + 300 mini",
      address: "Ttukseom Hangang Park · Jayang Stn L7 Exits 2/3",
      contact: "seouldroneshow.com",
      notes: "Cancels if wind >5 m/s or rain. Check day-of.",
      dayNumber: 11,
    },
    {
      id: "ua-902",
      date: "2026-06-06",
      time: "16:50",
      type: "flight",
      status: "confirmed",
      title: "UA 902 · ICN → SFO",
      subtitle: "Lands SFO same-day 12:00 PM",
      address: "Leave Signiel 12:30 PM · Line 2 → AREX Express",
      contact: "Conf NKXR3T",
      dayNumber: 12,
    },
  ],
  days: [
    {
      n: 1,
      slug: "day-1",
      date: "2026-05-26",
      dayOfWeek: "Tuesday",
      emoji: "✈️",
      title: "Arrival & Easy Gangnam Evening",
      city: "Seoul",
      neighborhoods: ["Samseong", "COEX", "Bongeunsa"],
      theme: "Soft landing — COEX walk-around, Bongeunsa (post-festival, quiet), hanwoo dinner, 10:30 PM bedtime.",
      hotel: "Grand InterContinental Seoul Parnas",
      weather: { highC: 27, lowC: 19, condition: "partly cloudy · light showers possible" },
      reservations: [],
      sections: [
        {
          heading: "Arrival logistics",
          time: "15:00 onward",
          bullets: [
            "UA 893 lands ICN ~3:00 PM — immigration ~45-60 min",
            "KAL Limousine 6703 (ICN T1 ↔ COEX / Westin Parnas / Grand InterContinental) ₩18,000 adult · ~70-80 min — easiest with luggage",
            "AREX Express ₩13,000 to Seoul Station (43 min) → Line 2 to Samseong (faster but more handling)",
            "Samseong Stn L2 has active GBC/GTX-A construction through 2026 — allow extra transfer time",
            "Apps to download: Naver Map (star ratings restored Apr 2026), KakaoMap, Kakao T, Catch Table, Papago",
          ],
        },
        {
          heading: "Late afternoon — Settle into COEX",
          bullets: [
            "Starfield Library (COEX B1, free, until 10 PM) — two-story open-air bookshelf",
            "Bongeunsa Temple — working Jogye-order temple, prettiest at sunset (Buddha's Birthday lanterns wrapped May 24–25; main installation taken down)",
            "Don't nap more than 60-90 min or jet lag will wreck Day 2",
          ],
        },
        {
          heading: "Evening — Jet-lag-friendly dinner",
          bullets: [
            "Gwangpyung Naengmyeon & Galbi (Samseong) — Pyongyang cold noodles + hanwoo galbi combo (Catch Table)",
            "Byeokje Galbi Bongeunsa — Michelin Guide hanwoo galbi institution (reserve)",
            "Grand Kitchen (in-hotel) if exhausted",
            "One mellow drink at Lobby Lounge · in bed by 10:30 PM",
          ],
        },
      ],
    },
    {
      n: 2,
      slug: "day-2",
      date: "2026-05-27",
      dayOfWeek: "Wednesday",
      emoji: "⌚",
      title: "Apgujeong · Dosan · Cheongdam (AP House Day)",
      city: "Seoul",
      neighborhoods: ["Apgujeong Rodeo", "Dosan", "Cheongdam Luxury Street"],
      theme: "Gangnam style day — AP House appointment, Galleria + Gourmet 494, Dosan flagships, Jungsik + Le Chamber.",
      hotel: "Grand InterContinental Seoul Parnas",
      weather: { highC: 28, lowC: 19, condition: "partly cloudy · patchy showers" },
      reservations: [],
      sections: [
        {
          heading: "Morning — AP House + Galleria",
          time: "09:00 – 14:00",
          bullets: [
            "09:00-10:30 Hotel breakfast at Grand Kitchen + cab north to Cheongdam",
            "11:00-12:30 AP House Seoul (Audemars Piguet flagship, 6-story, by appointment)",
            "12:30-14:00 Lunch at Gourmet 494 (Galleria B1) — 8-min walk south from Cheongdam Luxury Street",
            "Galleria Department Store Luxury Hall West (Chanel, Hermès, LV) + East (Korean designers, Boon the Shop)",
          ],
        },
        {
          heading: "Afternoon — Dosan Park + designer flagships",
          time: "14:00 – 18:00",
          bullets: [
            "Walk south to Dosan Park (~10 min from Galleria)",
            "Korean designer crawl: Low Classic · Amomento · Recto · Nothing Written · TIME Seoul · thisisneverthat",
            "Café break: Nudake (Haus Dosan) Peak croissant · % Arabica Dosan · Café Knotted Dosan donuts",
            "Save Gentle Monster Haus / Tamburins Haus Nowhere for Day 3",
          ],
        },
        {
          heading: "Late afternoon — Cheongdam Luxury Street",
          bullets: [
            "Cheongdam maison walk: Dior · Louis Vuitton · Prada · Saint Laurent · Cartier · Van Cleef",
            "Boon the Shop Cheongdam — Korea's best-curated multi-brand luxury",
            "10 Corso Como Seoul (concept store + restaurant)",
          ],
        },
        {
          heading: "Evening — Jungsik + Le Chamber",
          time: "19:00 – late",
          bullets: [
            "Dinner: Jungsik (★★ Michelin) — modern Korean tasting · Catch Table required, books 2-3 weeks out",
            "Alt: Soigné (★★ Banpo) · Onjium (royal-court, Buam-dong) · Born & Bred Apgujeong (dry-aged hanwoo)",
            "Le Chamber (Cheongdam) — Asia's 50 Best speakeasy behind a bookshelf. Ginseng Martini.",
            "Alt bars: Alice Cheongdam · Charles H. (Four Seasons) · H. Bar",
          ],
        },
      ],
    },
    {
      n: 3,
      slug: "day-3",
      date: "2026-05-28",
      dayOfWeek: "Thursday",
      emoji: "🛬",
      title: "Hotel Move & Dosan Drift",
      city: "Seoul",
      neighborhoods: ["Samseong", "Apgujeong", "Dosan"],
      theme: "Move from Parnas to Park Hyatt Seoul, drift through Dosan flagships, in-hotel nightcap.",
      hotel: "Park Hyatt Seoul",
      weather: { highC: 23, lowC: 15, condition: "cool · cool front passing" },
      reservations: [],
      sections: [
        {
          heading: "Morning — Move & settle in",
          bullets: [
            "Grand InterContinental Parnas → Park Hyatt Seoul (~10-15 min taxi; both in COEX/Samseong)",
            "Park Hyatt rooms ready ~3 PM — bag drop, unpack, scan Naver Map + Catch Table",
            "Hotel breakfast at The Lounge (24F) once checked in · 24F infinity pool + sauna",
          ],
        },
        {
          heading: "Afternoon — Dosan Park drift",
          bullets: [
            "Gentle Monster Haus Dosan — 5 floors of kinetic sculpture + eyewear + Nudake café (Peak croissant)",
            "Tamburins Haus Nowhere Dosan — GM group's sculptural fragrance flagship",
            "Starbucks Reserve Dosan (opened Apr 29, 2025 — Korea's first Reserve specialty store, day coffee / night cocktails)",
            "Hyein Seo · 0914 Flagship · Ader Error Sinsa Space 3.0 · Boontheshop Cheongdam",
          ],
        },
        {
          heading: "Evening — Stay close",
          bullets: [
            "Dinner: Gwangpyung Naengmyeon Galbi (Samseong) or The Timber House (Park Hyatt B1) — live jazz, robatayaki, top cocktails",
            "Cornerstone (Park Hyatt) — wood-fired Italian if exhausted",
            "Hotel afternoon tea at The Lounge (24F) — panoramic Seoul",
          ],
        },
      ],
      callouts: [
        {
          icon: "🚨",
          tone: "warn",
          body: "Book NOW: Sky Capsule (window opened May 6), Bicena (fills 2 months out), Doori, Restaurant San lunch, Busan dinner.",
        },
      ],
    },
    {
      n: 4,
      slug: "day-4",
      date: "2026-05-29",
      dayOfWeek: "Friday",
      emoji: "🏯",
      title: "Palaces, Hanok Lanes & Born & Bred",
      city: "Seoul",
      neighborhoods: ["Jongno", "Bukchon", "Samcheong", "Seochon"],
      theme: "Old-Seoul day — palace grandeur, hanok alleyways, Gwangjang market crawl, hanwoo capstone.",
      hotel: "Park Hyatt Seoul",
      weather: { highC: 31, lowC: 18, condition: "sunny · warming back up" },
      reservations: [],
      sections: [
        {
          heading: "Morning — Palace grandeur",
          time: "09:00 – 13:00",
          bullets: [
            "09:00 Enter Gyeongbokgung via east gate (skip Gwanghwamun crush)",
            "10:00 Royal Guard Changing Ceremony · Hanbok rental = free entry",
            "Gyotaejeon + Hyangwonjeong Pavilion — prettiest corners",
            "Tosokchon Samgyetang ginseng chicken — go 10:30 open or after 2 PM (45-90 min queue)",
          ],
        },
        {
          heading: "Afternoon — Hanok lanes + market",
          time: "13:00 – 17:00",
          bullets: [
            "Bukchon Hanok Village walk — strictly 10 AM – 4 PM (Red Zone after 5 PM, ₩100K fine)",
            "Use the 8 official photo points · wander down to Samcheong-dong",
            "Gwangjang Market crawl: Soonhee's bindaetteok · Mo-nyeo mayak gimbap · Bucheon yukhoe (bring cash)",
            "Ikseon-dong hanok alleys — café crawl, best late-afternoon light",
          ],
        },
        {
          heading: "Evening — Born & Bred + Seochon",
          time: "18:00 – late",
          bullets: [
            "18:00 Born & Bred Seoul (booked) — hanwoo butcher-omakase, 1++ beef, 2-2.5 hrs",
            "Post-dinner: Bar Cham (Seochon) — #7 Asia's 50 Best Bars 2026, hanok cocktail room, Korean-native-spirits program",
            "Alt: Charles H. (Four Seasons, Gwanghwamun) · Alice Cheongdam · Anthracite Coffee Seochon",
          ],
        },
      ],
      callouts: [
        {
          icon: "🏯",
          tone: "alert",
          body: "Bukchon Red Zone: closed to tourists 5 PM – 10 AM, ₩100K spot fine. Plan walks for the 10 AM – 4 PM window only.",
        },
      ],
    },
    {
      n: 5,
      slug: "day-5",
      date: "2026-05-30",
      dayOfWeek: "Saturday",
      emoji: "🌷",
      title: "Seongsu · Seoul Forest · Garden Show",
      city: "Seoul",
      neighborhoods: ["Seongsu", "Yeonmujang-gil", "Seoul Forest", "Sinsa"],
      theme: "Seoul's Brooklyn factory-cafés + Korean designer flagships + Garden Show → Zest 3 PM Sinsa.",
      hotel: "Park Hyatt Seoul",
      weather: { highC: 29, lowC: 15, condition: "mostly sunny · dry" },
      reservations: [],
      sections: [
        {
          heading: "Morning — Seongsu café triangle",
          time: "10:00 – 13:00",
          bullets: [
            "Cafe Onion Seongsu — factory-remodel landmark, pandoro is the move (before 11)",
            "Lowkey Coffee Yeonmujang-gil — 15-year roastery, signature latte",
            "Salt-bread crawl: Beton (★4.7) · Jayeondo Sogeumppang (7K buns/day) · Elephant Bagel",
            "Seoul International Garden Show — enter Seongsu side at 10 AM open or after 4 PM",
          ],
        },
        {
          heading: "Afternoon — Forest + designer flagships",
          time: "13:00 – 14:30",
          bullets: [
            "Seoul Forest walk + deer enclosure",
            "Korean designer crawl: Low Classic · Kijun · SAMO ONDOH · Tamburins Seongsu",
            "HAUS NOWHERE Seongsu · Musinsa Megastore (opened Apr 2026)",
            "Leave Seongsu by 14:30 for 15:00 Zest reservation in Sinsa (15-20 min cab)",
          ],
        },
        {
          heading: "Late afternoon — Zest",
          time: "15:00 – 17:00",
          bullets: [
            "Zest Seoul (booked) — Asia's 50 Best Bars #2",
            "26 Dosan-daero 55-gil, Gangnam-gu (Sinsa/Apgujeong, south of river — NOT Hannam)",
            "Sat hours 15:00–02:00 · 3 PM is the open time",
          ],
        },
        {
          heading: "Evening — Seongsu's hardest res night",
          time: "19:00 – late",
          bullets: [
            "Pick one: Nanpo (modern Korean) · Palette by Park Sungjin (★ Michelin) · Mineus (natural wine) · Solsot (clay-pot seafood)",
            "Cinderella Bar (Seongsu 2-ga) — hidden-entrance, heel-glass cocktails",
            "Banpo Moonlight Rainbow Fountain 20:00 show (10-min taxi)",
          ],
        },
      ],
      callouts: [
        {
          icon: "🌷",
          tone: "info",
          body: "Garden Show 'Seoul, Green Soul' May 1 – Oct 27. Pokémon Secret Forest + Ditto/Metamon Playground May 1 – Jun 21 (Metamon 10:00–21:00, free QR queue). Seoul Garden Festival weekend programming continues through Jun 7 — Leenalchi · 10cm · MeloMance perform on the Seoul Forest stage.",
        },
      ],
    },
    {
      n: 6,
      slug: "day-6",
      date: "2026-05-31",
      dayOfWeek: "Sunday",
      emoji: "💒",
      title: "Wedding Day · Yangju",
      city: "Yangju",
      neighborhoods: ["Samseong (AM)", "Jangheung-myeon (PM)"],
      theme: "The anchor day. Light morning, 3 PM depart, ceremony at 5, safe return to Park Hyatt.",
      hotel: "Park Hyatt Seoul",
      weather: { highC: 26, lowC: 16, condition: "clear · dry · pleasant" },
      reservations: [],
      sections: [
        {
          heading: "Morning — Park Hyatt slow brunch",
          bullets: [
            "Cornerstone brunch (Park Hyatt, 12-3 PM) — zero transit risk before the drive",
            "The Lounge afternoon tea (24F) — panoramic Seoul",
            "Park Hyatt spa + 24F infinity pool",
            "Park Hyatt ironing/steaming — request 3+ hours ahead",
          ],
        },
        {
          heading: "Afternoon — Depart for Yangju",
          time: "15:00 sharp",
          bullets: [
            "Leave Park Hyatt 15:00 via pre-booked Kakao Black",
            "~1h–1h15m off-peak: Sejong-Pocheon Expy → Route 39 → Jangheung-myeon",
            "Arrive Yangju Hesse's Garden ~16:30 — settle before 5 PM ceremony",
            "Cash envelope (축의금) ₩100-200K prepared",
          ],
        },
        {
          heading: "Evening — Ceremony + return",
          time: "17:00 onward",
          bullets: [
            "17:00 Wedding ceremony + reception at Yangju Hesse's Garden",
            "Pre-book return car BEFORE the ceremony · target driver pickup 21:45",
            "Return to Park Hyatt ~22:00-23:00",
            "Optional nightcap: The Timber House (Park Hyatt B1) · Alice Cheongdam · room service",
          ],
        },
      ],
      callouts: [
        {
          icon: "🌡️",
          tone: "success",
          body: "Weather (T-1): 26 °C / 16 °C, clear, dry — driest day of the month, 5 °C cooler than the T-9 forecast. 5 PM ceremony ~22-24 °C, light sun on west-facing grass lawn. Pack: light cardigan for evening · SPF 30-50 · 2× water · linen/cotton suiting · hand fan optional. KMA short-range will confirm wind 72h out — re-check Friday morning.",
        },
        {
          icon: "🚗",
          tone: "warn",
          body: "Jangheung-myeon is rural — Kakao T unreliable past 21:00. Pre-book Kakao Black with driver-wait (+₩30-50K/hr) or have venue staff call 양주콜택시 before 20:00.",
        },
        {
          icon: "🌉",
          tone: "info",
          body: "Tonight in Seoul: Car-Free Jamsugyo Bridge Festival at Banpo Hangang Park — pedestrian-only crossing, optional return-leg detour if you're back early.",
        },
      ],
    },
    {
      n: 7,
      slug: "day-7",
      date: "2026-06-01",
      dayOfWeek: "Monday",
      emoji: "🏛️",
      title: "Yongsan Museums (Monday Pivot)",
      city: "Seoul",
      neighborhoods: ["Yongsan", "Itaewon"],
      theme: "Monday closure-pivot — APMA + NMK Yongsan museum morning, non-Hannam afternoon, Mon-safe dinner.",
      hotel: "Park Hyatt Seoul",
      weather: { highC: 25, lowC: 15, condition: "partly sunny" },
      reservations: [],
      sections: [
        {
          heading: "Morning — Yongsan museum pair",
          time: "10:00 – 13:00",
          bullets: [
            "APMA 'Chapter Five — From the APMA Collection' (open Mon) — Nam June Paik TV Vertical Flower (first public showing in 20+ years), Haegue Yang, Lee Bul, Kiki Smith",
            "National Museum of Korea 'Kim Hongdo: Painting His Era' (May 4 – Aug 2, free, open Mon)",
            "Fritz Coffee Hannam / Yongsan or Blue Bottle Hannam (specialty roasters)",
          ],
        },
        {
          heading: "Afternoon — Non-Hannam pivot",
          time: "13:00 – 18:00",
          bullets: [
            "Hannam designer crawl moved to Day 8 (Tue) — keep Mon afternoon for alternatives:",
            "Mangwon Market + Hapjeong walk-up — Mon-safe street food",
            "War Memorial of Korea — free, open Mon, 15 min from APMA",
            "Hyundai Card Music Library + Storage (members/ticket)",
            "Yongsan Family Park",
          ],
        },
        {
          heading: "Evening — Monday-safe dinner",
          bullets: [
            "Gamnamujib Gisa Sikdang (24/7) — stir-fried pork (dwaeji bulbaek), Infinite Challenge institution",
            "Daol Charcoal Grill — hanwoo charcoal BBQ (4.9 Naver, #1 Hannam Tripadvisor)",
            "The Timber House (Park Hyatt B1) — live jazz nightcap, zero logistics",
          ],
        },
      ],
      callouts: [
        {
          icon: "⚠️",
          tone: "warn",
          body: "Closed Monday: Leeum · Changdeokgung · Deoksugung · Changgyeonggung · many Hongdae/Yeonnam indie cafés. Open Monday: APMA · NMK · MMCA Seoul · War Memorial · Gyeongbokgung (closed Tue only). Some sources flag APMA/MMCA/War Memorial as Mon-closed in 2026 — phone-verify Sun PM (APMA +82-2-6396-5800, MMCA 1688-5300) before locking the morning.",
        },
      ],
    },
    {
      n: 8,
      slug: "day-8",
      date: "2026-06-02",
      dayOfWeek: "Tuesday",
      emoji: "🌸",
      title: "Leeum + Perfume Class + Doori Capstone",
      city: "Seoul",
      neighborhoods: ["Hannam", "Itaewon", "Yongsan"],
      theme: "Hannam consolidation day — Leeum at open, perfume class in Itaewon, designer + antiques walk, Doori capstone.",
      hotel: "Park Hyatt Seoul",
      weather: { highC: 25, lowC: 15, condition: "dry · 66 % humidity" },
      reservations: [],
      sections: [
        {
          heading: "Morning — Leeum",
          time: "10:00 – 12:30",
          bullets: [
            "Leeum Museum at open (closed Mon, open Tue)",
            "Tino Sehgal performance exhibit through Jun 28",
            "Book timed entry at leeum.org",
          ],
        },
        {
          heading: "Lunch — Light palate prep",
          time: "12:30 – 14:00",
          bullets: [
            "Hannam Oriental Roast Chicken or Solsot bowls",
            "Avoid garlic/spice-heavy plates before the perfume class",
          ],
        },
        {
          heading: "Afternoon — Perfume class",
          time: "14:30 – 16:30",
          bullets: [
            "Perfume Making class · 1 Noksapyeong-daero 40na-gil, Yongsan-gu",
            "Noksapyeong Stn L6 (~5 min walk) · 5-min cab from Leeum",
            "~2 hr studio session",
          ],
        },
        {
          heading: "Late afternoon — Hannam designer crawl",
          time: "16:30 – 18:30",
          bullets: [
            "Wooyoungmi Hannam · Tamburins Hannam · Beaker · Mardi Mercredi · Nothing Written · Recto",
            "Itaewon Antiques Street — 1 km of vintage dealers (jewelry, furniture, accessories)",
          ],
        },
        {
          heading: "Evening — Doori capstone",
          time: "19:00 – late",
          bullets: [
            "Doori (Hannam) — MICHELIN Selected 2026, Korean-Western tasting ('All of Today's Scraps' zero-waste signature)",
            "Chef + wife concept, named for their dog",
            "Post-dinner: Pussyfoot Saloon · GAENARI · Bar Cham (Seochon cab)",
          ],
        },
      ],
      callouts: [
        {
          icon: "🧴",
          tone: "info",
          body: "Geographic note: this is the consolidated Hannam day. Leeum, Perfume class, Doori, and the antiques walk are all within ~2 km — zero cross-river transit.",
        },
      ],
    },
    {
      n: 9,
      slug: "day-9",
      date: "2026-06-03",
      dayOfWeek: "Wednesday",
      emoji: "🌊",
      title: "Busan · Haeundae · Gwangalli",
      city: "Busan",
      neighborhoods: ["Haeundae", "Cheongsapo", "Mipo", "Gwangalli"],
      theme: "One packed coastal day — Sky Capsule along the old rail line, seafood by the bridge, cocktails in the Signiel sky.",
      hotel: "Signiel Busan",
      weather: { highC: 24, lowC: 17, condition: "cool · sea breeze · light shower risk" },
      reservations: [],
      sections: [
        {
          heading: "Morning — KTX → Busan",
          time: "06:00 – 10:00",
          bullets: [
            "Leave Park Hyatt 05:45 → Seoul Station ~15 min",
            "KTX 007 · Seoul 06:33 → Busan 09:22 · Car 3, Seats 1B/1C (re-verify train number in Korail app night before — seasonal renumbering)",
            "Screenshot QR codes · taxi ~20 min Busan Station → Signiel Busan (Haeundae)",
            "Bag drop · rooms ready ~3 PM",
          ],
        },
        {
          heading: "Late morning — Sand Festival + market",
          time: "10:00 – 13:00",
          bullets: [
            "Haeundae Sand Festival sculptures (through Jun 14) — walkable from Signiel",
            "Haeundae Traditional Market raw seafood crawl — bring cash",
            "Lunch: Ssangdungi Dwaeji Gukbap (Chosun Daily top-10) or Gaetmaeul Sikdang (Michelin Guide)",
          ],
        },
        {
          heading: "Afternoon — Blueline Sky Capsule",
          time: "13:00 – 17:00",
          bullets: [
            "Sky Capsule Mipo → Cheongsapo — book bluelinepark.com / Klook / KKday",
            "1–2 week booking window (2–4 wks for sunset slots) · ₩35K (1–2 pax) / ₩45K (3) / ₩50K (4)",
            "Cafe Rooftop Cheongsapo — iconic Blueline + ocean shot",
            "Cheongsapo Station Hanok Café — quieter alt",
          ],
        },
        {
          heading: "Evening — Gwangalli + Signiel sky bar",
          time: "18:00 – late",
          bullets: [
            "Josaeho Gwangalli — 3-tier grilled-shellfish tower with Gwangan Bridge straight ahead",
            "20:00 Gwangan Bridge light-up beach walk",
            "Pick ONE fine-dining: Le Dorer (Marine City, NEW ★) · IAán (2026 Opening of Year) · Ilpum Hanwoo · Living Room PHB 31F · Mori Masters (★ kaiseki)",
            "Chaoran Bar (Signiel L5) — Korean-ingredient cocktails, coastline view, zero logistics",
          ],
        },
      ],
      callouts: [
        {
          icon: "🎼",
          tone: "success",
          body: "FREE Classic Park Concert at Hayaria Lawn, Busan Citizens' Park (18:30) — Wed Jun 3: KBS Symphony with Chung Myung-whun (opera arias + Busan Municipal Choir) · Thu Jun 4: Busan Philharmonic (Suyeol Choi). Stripes Korea also cites Jun 7–8 — confirm with Busan Concert Hall before walking over.",
        },
        {
          icon: "🗳️",
          tone: "info",
          body: "Election Day (9th nationwide local). Polls 6 AM – 6 PM. Government offices + banks closed; tourist spots, palaces, museums, subway open as normal. Expect sound-truck campaign residuals through 6 PM. Get cash before Tuesday.",
        },
        {
          icon: "🏖️",
          tone: "info",
          body: "Beach reality check: Haeundae + Songjeong don't open for swimming until Jun 26. Water 17-19 °C, no lifeguards. Wading + photos only.",
        },
      ],
    },
    {
      n: 10,
      slug: "day-10",
      date: "2026-06-04",
      dayOfWeek: "Thursday",
      emoji: "🗼",
      title: "Busan → Seoul / Jamsil at 555 m",
      city: "Seoul",
      neighborhoods: ["Haeundae (AM)", "Jamsil", "Songpa", "Seokchon Lake"],
      theme: "Back to Seoul by mid-afternoon, check into Signiel Seoul L76-101, Bicena + 123 Lounge capstone.",
      hotel: "Signiel Seoul",
      weather: { highC: 25, lowC: 19, condition: "cool · clearing" },
      reservations: [],
      sections: [
        {
          heading: "Morning — Signiel Busan → KTX",
          time: "08:00 – 13:30",
          bullets: [
            "In-hotel breakfast at Signiel Busan + slow morning (Spa or APEC Nurimaru walk · open 09:00–18:00)",
            "Leave Signiel Busan 09:30 — taxi ~15 min to Busan Station",
            "KTX 026 · Busan 10:28 → Seoul Station 13:04 · Car 3, Seats 2C/2B (re-verify train number in Korail app night before)",
            "Taxi Seoul Station → Signiel Seoul (~20 min via Han River)",
          ],
        },
        {
          heading: "Afternoon — Check-in + Songpa walk",
          time: "13:30 – 18:00",
          bullets: [
            "Signiel Seoul L76-101, Lotte World Tower · early check-in not guaranteed before 3 PM (bag drop)",
            "Seokchon Lake loop + Songridan-gil café crawl (Layered · Matt's · Bakery Maman)",
            "Lotte World Mall + Avenuel luxury hall · Olympic Park (10-min taxi)",
          ],
        },
        {
          heading: "Evening — Bicena + 123 Lounge",
          time: "19:00 – late",
          bullets: [
            "Bicena (Signiel Seoul L81) — ★ MICHELIN 2026 (9th consecutive year) · Smart & Elegant dress · book 2 months out",
            "123 Lounge L123 — Korea's highest bar at 555 m · champagne + skyline",
            "Alt: STAY by Yannick Alléno (Signiel L81) · Pierre Gagnaire à Séoul (Lotte Hotel)",
          ],
        },
      ],
    },
    {
      n: 11,
      slug: "day-11",
      date: "2026-06-05",
      dayOfWeek: "Friday",
      emoji: "💎",
      title: "Restaurant San + Lijin + Drone Show",
      city: "Seoul",
      neighborhoods: ["Cheongdam", "Apgujeong", "Myeongdong", "Ttukseom"],
      theme: "Capstone day — Restaurant San lunch tasting, Lijin Clinic, Cheongdam dessert, finish with Drone Show on the Han River.",
      hotel: "Signiel Seoul",
      weather: { highC: 25, lowC: 17, condition: "partly cloudy · wind 4 m/s borderline for drones" },
      reservations: [],
      sections: [
        {
          heading: "Morning — Cheongdam maison walk-by",
          time: "10:00 – 12:00",
          bullets: [
            "Patek Philippe (The Hour Glass) · Rolex Cheongdam · Vacheron Constantin · Cartier Maison · Van Cleef & Arpels (walk-bys, no fixed appointments — AP House was Day 2)",
            "Boon the Shop Cheongdam · 10 Corso Como Seoul",
          ],
        },
        {
          heading: "Lunch — Restaurant San",
          time: "12:00 – 15:00",
          bullets: [
            "Restaurant San (Gangnam, subterranean) — Asia's 50 Best 2026 'One To Watch'",
            "Chef Jo Seung-hyun (ex-Benu SF) · 3-hr tasting · Fri lunch slot resolves drone-show conflict",
            "Book restaurantsan.com or contact@restaurantsan.com",
          ],
        },
        {
          heading: "Afternoon — Lijin Clinic",
          time: "15:30 – 17:00",
          bullets: [
            "Lijin Clinic appointment (Myeongdong)",
            "15-20 min cab from Gangnam",
          ],
        },
        {
          heading: "Wind-down — Cheongdam dessert/cocktail",
          time: "17:00 – 19:30",
          bullets: [
            "Nudake Dosan sculptural dessert · Alice Cheongdam · Le Chamber early-evening pour",
            "Pack KF94 + light layer for evening Drone Show",
          ],
        },
        {
          heading: "Evening — Hangang Drone Show",
          time: "20:00 – 22:00",
          bullets: [
            "Cab Cheongdam → Jayang Stn Line 7 (15-20 min)",
            "Jayang Stn Exits 2/3 = 2-min walk to Ttukseom Hangang Park",
            "20:30-20:45 Main show (1,200 drones) · 20:45-20:55 Mini (300 drones)",
            "Cultural performance bookends 19:30 + 20:55",
            "Cancels if wind >5 m/s — check seouldroneshow.com day-of",
          ],
        },
      ],
      callouts: [
        {
          icon: "🎆",
          tone: "info",
          body: "'Sheeom-Sheeom Hangang 3 Sports Festival' + 'MY PACE Hangang Triathlon' Jun 5–7 share the Ttukseom park footprint with the drone show. Expect added crowds + perimeter; arrive Ttukseom by 20:00 to settle in. Final show of the spring series (Apr 10 – Jun 5).",
        },
        {
          icon: "💨",
          tone: "warn",
          body: "Drone show cancels if wind > 5 m/s. Today's forecast wind ~4 m/s — borderline. Refresh seouldroneshow.com and @seouldroneshow_official by 18:00 before committing the cab to Jayang.",
        },
      ],
    },
    {
      n: 12,
      slug: "day-12",
      date: "2026-06-06",
      dayOfWeek: "Saturday",
      emoji: "🛅",
      title: "Final Bites & Departure",
      city: "Incheon",
      neighborhoods: ["Seokchon Lake", "Jamsil", "ICN"],
      theme: "One lake-side brunch, last gifts, clean run to ICN.",
      hotel: "Signiel Seoul (checkout)",
      weather: { highC: 26, lowC: 18, condition: "dry" },
      reservations: [],
      sections: [
        {
          heading: "Morning — Lake-side brunch",
          time: "08:30 – 11:30",
          bullets: [
            "Wicker Park West (Seokchon Lake-side, new 2025) — arrive by 8:30 for a table",
            "STAY by Yannick Alléno (Signiel L81, 6:30-10:00) — in-hotel French alt",
            "Seokchon Lake loop walk · last skyline swim in Signiel pool",
          ],
        },
        {
          heading: "Late morning — Gifts + checkout",
          time: "11:30 – 12:30",
          bullets: [
            "Olive Young Lotte World Mall L5 — last gifts (passport for tax refund)",
            "Lotte Duty Free Jamsil · Tous Les Jours / Paris Baguette for flight snacks",
            "Final luggage check + hotel checkout",
          ],
        },
        {
          heading: "Departure — Leave by 12:30 PM",
          time: "12:30 – 16:50",
          bullets: [
            "Memorial Day cemetery motorcade + Weverse Con crowd compound Saturday-morning congestion",
            "PREFERRED: Line 2 (Jamsil → Hongik Univ.) → AREX Express (43 min) to ICN T1 — book seat on airportrailroad.com",
            "Backup: pre-booked Kakao T Black or Signiel hotel car (book night before)",
            "UA 902 ICN 16:50 → SFO 12:00 PM same day · Conf NKXR3T",
          ],
        },
      ],
      callouts: [
        {
          icon: "🪦",
          tone: "warn",
          body: "Memorial Day: Seoul National Cemetery (Dongjak-gu, 210 Hyeonchung-ro) — Presidential 추념식 ~10 AM; Hyeonchung-ro + cemetery perimeter closures roughly 08:00–11:00. Avoid driving Dongjak; use Line 4/9 Dongjak Stn Exit 8 if you must transit. Banks closed. Flags at half-mast.",
        },
        {
          icon: "🔔",
          tone: "info",
          body: "10:00 AM nationwide moment of silence — air-raid sirens sound for ~1 minute. Pause wherever you are; locals stand still. Plan brunch order timing around this.",
        },
        {
          icon: "🎤",
          tone: "warn",
          body: "Weverse Con Day 1 at KSPO Dome + 88 Lawn Field, Olympic Park (1 stop from Jamsil): 30 artists incl. RAIN (Tribute headliner), ENHYPEN, LE SSERAFIM, ILLIT, &TEAM, ZICO. 40K+ fans surround your hotel — not the airport. Leave by 12:30 PM. Avoid Jamsil/Songpa subway crush.",
        },
      ],
    },
  ],
  neighborhoods: [
    { name: "Samseong · COEX · Bongeunsa", days: "1, 3", picks: "Starfield Library · Bongeunsa Temple · Byeokje Galbi / Gwangpyung" },
    { name: "Apgujeong · Dosan · Cheongdam", days: "2, 3, 11", picks: "AP House · Galleria + Gourmet 494 · Korean designer crawl" },
    { name: "Bukchon · Samcheong · Seochon · Ikseon-dong", days: "4", picks: "Gyeongbokgung 10 AM Royal Guard · Bukchon 10–16 only · Gwangjang Market" },
    { name: "Seongsu · Seoul Forest · Ttukseom", days: "5", picks: "Cafe Onion · salt-bread crawl · Garden Show" },
    { name: "Hannam · Itaewon · Yongsan", days: "7, 8", picks: "Leeum (closed Mon) · APMA (open Mon) · NMK · perfume class · antiques" },
    { name: "Han River parks", days: "11", picks: "Banpo Fountain 20:00/21:00 · Drone Show Ttukseom Jun 5" },
    { name: "Jamsil · Songpa · Seokchon", days: "10, 12", picks: "Seoul Sky L117–123 + 123 Lounge · Seokchon Lake · Avenuel" },
    { name: "Haeundae (Busan)", days: "9, AM Day 10", picks: "Sand Festival sculptures · Traditional Market · Chaoran Bar L5" },
    { name: "Cheongsapo · Mipo · Songjeong", days: "9 afternoon", picks: "Sky Capsule · Cafe Rooftop Cheongsapo · Hanok Café" },
    { name: "Gwangalli", days: "9 evening", picks: "Josaeho 3-tier shellfish · 20:00 bridge light-up · Magnate / Vinty" },
  ],
}

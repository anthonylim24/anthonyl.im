// Korean → Revised Romanization for HangJeongDong place names.
//
// Why this isn't just `hangul-romanization`'s `convert()`:
//   1. The library does syllable-by-syllable conversion with no
//      assimilation rules — so 종로 comes out "jongro" instead of the
//      official "Jongno". A handful of well-known names need fixing.
//   2. No admin-suffix hyphens or title case (the library returns
//      lowercase "gangnamgu" but the official sign reads "Gangnam-gu").
//   3. Numerals embedded in dong names (성수1가1동) need spaces and
//      hyphens around them ("Seongsu 1-ga 1-dong").
//
// The 39 sgg-level names are hard-coded against the official English
// names used by Seoul Metropolitan and Busan city governments (which
// happen to also be Wikipedia titles). Dong-level names fall through to
// the library + post-processing.

import { convert } from "hangul-romanization"

/** Official English names for every 시·군·구 in the dataset. Keys are
 *  exactly what `properties.adm_nm` carries after the city prefix is
 *  stripped (e.g. "강남구", not "서울특별시 강남구"). */
const SGG_MAP: Record<string, string> = {
  // Seoul — 25 gu
  "강남구": "Gangnam-gu",
  "강동구": "Gangdong-gu",
  "강북구": "Gangbuk-gu",
  "강서구": "Gangseo-gu", // appears in both Seoul + Busan; spelling is identical
  "관악구": "Gwanak-gu",
  "광진구": "Gwangjin-gu",
  "구로구": "Guro-gu",
  "금천구": "Geumcheon-gu",
  "노원구": "Nowon-gu",
  "도봉구": "Dobong-gu",
  "동대문구": "Dongdaemun-gu",
  "동작구": "Dongjak-gu",
  "마포구": "Mapo-gu",
  "서대문구": "Seodaemun-gu",
  "서초구": "Seocho-gu",
  "성동구": "Seongdong-gu",
  "성북구": "Seongbuk-gu",
  "송파구": "Songpa-gu",
  "양천구": "Yangcheon-gu",
  "영등포구": "Yeongdeungpo-gu",
  "용산구": "Yongsan-gu",
  "은평구": "Eunpyeong-gu",
  "종로구": "Jongno-gu", // assimilation: ㄹ → n after ㅇ
  "중구": "Jung-gu",
  "중랑구": "Jungnang-gu",
  // Busan — 15 gu + 1 gun
  "금정구": "Geumjeong-gu",
  "기장군": "Gijang-gun",
  "남구": "Nam-gu",
  "동구": "Dong-gu",
  "동래구": "Dongnae-gu", // assimilation again
  "부산진구": "Busanjin-gu",
  "북구": "Buk-gu",
  "사상구": "Sasang-gu",
  "사하구": "Saha-gu",
  "서구": "Seo-gu",
  "수영구": "Suyeong-gu",
  "연제구": "Yeonje-gu",
  "영도구": "Yeongdo-gu",
  "해운대구": "Haeundae-gu",
}

/** Common dong-name romanizations the syllable converter gets wrong
 *  because it doesn't apply Korean assimilation. Extend this when a new
 *  problem case shows up. Match is on the bare dong stem (without the
 *  -dong / -ga suffix and without numeric suffixes). */
const DONG_OVERRIDES: Record<string, string> = {
  "종로": "Jongno",     // 종로1.2.3.4가동 etc.
  "신림": "Sillim",
  "신촌": "Sinchon",
  "신당": "Sindang",
  "왕십리": "Wangsimni",
  "을지로": "Euljiro",
  "광희": "Gwanghui",
}

/** Title-case a romanized stem. ASCII-only; the input is already
 *  romanized so this just needs to uppercase the first letter. */
function titleCase(s: string): string {
  if (!s) return s
  return s[0].toUpperCase() + s.slice(1)
}

/** Apply Korean Revised Romanization assimilation rules the syllable-
 *  by-syllable library skips. The big one: ㄹ at the start of a syllable
 *  preceded by ㅇ (transliterated 'ng') becomes /n/, not /r/. So 종로 →
 *  "Jongno", not "Jongro"; 정릉 → "Jeongneung", not "Jeongreung". Apply
 *  before title-casing so the replacement works on the lowercase output. */
function applyAssimilation(roman: string): string {
  // Most cases: ng + (r/l)<vowel> → ng + n<vowel>.
  // The library always emits "r" for ㄹ at syllable start (and "l" for
  // ㄹ at syllable end), so we rewrite "ngr" → "ngn" and "ngl" → "ngn"
  // wherever they appear inside a stem.
  return roman.replace(/ngr/g, "ngn").replace(/ngl/g, "ngn")
}

/** Convert a Korean dong-name stem (without admin suffix) to RR.
 *  Tries the manual override map first, falls back to mechanical
 *  conversion + assimilation cleanup + title-case. */
function romanizeDongStem(korean: string): string {
  if (DONG_OVERRIDES[korean]) return DONG_OVERRIDES[korean]
  return titleCase(applyAssimilation(convert(korean)))
}

/** Romanize a full HangJeongDong dong portion. Admin suffixes
 *  (동/가/면/읍/리) only appear at the END of the name — characters
 *  like 가 inside 가양 or 면 inside 면목 are stem chars, not suffix
 *  markers. The parse goes right-to-left:
 *    1. peel off trailing 동/읍/리/면 (mandatory for almost all entries)
 *    2. peel off trailing digits (e.g. "1" in "광안1동")
 *    3. peel off trailing 가 + its preceding digits (e.g. "1가" in
 *       "성수1가1동", or "1.2.3.4가" in "종로1.2.3.4가동")
 *    4. whatever's left is the stem, run through the romanizer
 *  Then reassemble left-to-right with proper hyphens + spaces. */
function romanizeDong(korean: string): string {
  const SUFFIX_MAP: Record<string, string> = {
    "동": "dong",
    "면": "myeon",
    "읍": "eup",
    "리": "ri",
  }
  let rest = korean

  // 1. Trailing admin suffix
  const lastCh = rest[rest.length - 1]
  let tailSuffix: string | null = null
  if (SUFFIX_MAP[lastCh]) {
    tailSuffix = SUFFIX_MAP[lastCh]
    rest = rest.slice(0, -1)
  }

  // 2. Trailing digits before that suffix. The data uses both ASCII
  //    "." and the Korean middle-dot "·" (U+00B7) as separators between
  //    numerals (e.g. "1·2·3·4가" in 종로 sub-dongs). Accept both and
  //    normalize to a dot in the output.
  let tailNum: string | null = null
  const tailDigitMatch = rest.match(/([\d.·]+)$/)
  if (tailDigitMatch && /\d/.test(tailDigitMatch[1])) {
    tailNum = tailDigitMatch[1].replace(/·/g, ".")
    rest = rest.slice(0, -tailDigitMatch[1].length)
  }

  // 3. 가 + its own digit prefix
  let gaNum: string | null = null
  let hasGa = false
  if (rest.endsWith("가")) {
    hasGa = true
    rest = rest.slice(0, -1)
    const gaDigitMatch = rest.match(/([\d.·]+)$/)
    if (gaDigitMatch && /\d/.test(gaDigitMatch[1])) {
      gaNum = gaDigitMatch[1].replace(/·/g, ".")
      rest = rest.slice(0, -gaDigitMatch[1].length)
    }
  }

  const stem = rest ? romanizeDongStem(rest) : ""

  // Reassemble: stem [<space>gaNum-ga] [<space>tailNum]-suffix
  let out = stem
  if (hasGa) {
    if (gaNum) out += ` ${gaNum}-ga`
    else out += "-ga"
  }
  if (tailSuffix) {
    if (tailNum) out += ` ${tailNum}-${tailSuffix}`
    else out += `-${tailSuffix}`
  } else if (tailNum) {
    out += ` ${tailNum}`
  }
  return out.trim()
}

/** Top-level entry: takes a full HangJeongDong adm_nm-without-city-prefix
 *  string (e.g. "강남구 청담동", "수영구 광안1동") and returns the
 *  romanized form ("Gangnam-gu, Cheongdam-dong"). */
export function romanizeAdmName(korean: string): string {
  const parts = korean.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    // sgg-only — shouldn't happen in this dataset but handle defensively.
    return SGG_MAP[parts[0]] ?? titleCase(convert(parts[0]))
  }
  const sgg = SGG_MAP[parts[0]] ?? titleCase(convert(parts[0]))
  // The remainder is the dong (possibly with extra tokens for non-dong
  // admin units; rejoin then romanize as one unit).
  const dongKorean = parts.slice(1).join(" ")
  const dong = romanizeDong(dongKorean)
  return `${sgg}, ${dong}`
}

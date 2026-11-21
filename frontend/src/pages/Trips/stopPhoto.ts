import { useEffect, useState } from "react"
import { lookupGooglePlacePhoto, lookupPhoto } from "./placePhoto"

// A photo for a stop: Google Places first (when the build has a key), then
// Wikipedia. "none" means the card should not reserve any space for one.

export type PhotoState = { status: "loading" } | { status: "ready"; url: string } | { status: "none" }

const settled = new Map<string, string | null>()

/**
 * Wikipedia's fuzzy search finds the right palace but the wrong hotel or
 * restaurant ("Park Hyatt" → Grand Hyatt), and a wrong photo is worse than
 * none. Businesses only get a Google photo.
 */
const BUSINESS = /hotel|lodging|hostel|stay|restaurant|meal|food|cafe|coffee|bakery|bar|pub|shop|store|boutique|salon|spa|clinic/i

async function find(name: string, city: string, lat: number, lng: number, size: number, category?: string): Promise<string | null> {
  const google = await lookupGooglePlacePhoto({ name, city, lat, lng, maxWidth: size })
  if (google) return google
  if (category && BUSINESS.test(category)) return null
  return lookupPhoto([name], { size })
}

export function useStopPhoto(
  stop: { id: string; title: string; lat: number; lng: number; category?: string } | null,
  city: string,
  size = 800,
): PhotoState {
  const key = stop ? `${stop.title}|${city}|${stop.lat.toFixed(4)},${stop.lng.toFixed(4)}` : ""
  const known = key ? settled.get(key) : null
  const [state, setState] = useState<{ key: string; photo: PhotoState }>({ key: "", photo: { status: "none" } })

  useEffect(() => {
    if (!stop || !key || settled.has(key)) return
    // Until this key's answer lands, the render below reads "loading".
    let cancelled = false
    void find(stop.title, city, stop.lat, stop.lng, size, stop.category)
      .catch(() => null)
      .then((url) => {
        settled.set(key, url)
        if (!cancelled) setState({ key, photo: url ? { status: "ready", url } : { status: "none" } })
      })
    return () => {
      cancelled = true
    }
    // `key` covers the stop's identity and position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, size])

  if (!stop) return { status: "none" }
  if (known !== undefined && known !== null) return { status: "ready", url: known }
  if (known === null && settled.has(key)) return { status: "none" }
  return state.key === key ? state.photo : { status: "loading" }
}

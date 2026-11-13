import { useEffect, useState } from "react"
import { lookupGooglePlacePhoto, lookupPhoto } from "../placePhoto"

// A photo for a stop: Google Places first (when the build has a key), then
// Wikipedia. "none" means the card should not reserve any space for one.

export type PhotoState = { status: "loading" } | { status: "ready"; url: string } | { status: "none" }

const settled = new Map<string, string | null>()

async function find(name: string, city: string, lat: number, lng: number, size: number): Promise<string | null> {
  const google = await lookupGooglePlacePhoto({ name, city, lat, lng, maxWidth: size })
  if (google) return google
  return lookupPhoto([name], { size })
}

export function useStopPhoto(
  stop: { id: string; title: string; lat: number; lng: number } | null,
  city: string,
  size = 800,
): PhotoState {
  const key = stop ? `${stop.title}|${city}|${stop.lat.toFixed(4)},${stop.lng.toFixed(4)}` : ""
  const known = key ? settled.get(key) : null
  const [state, setState] = useState<{ key: string; photo: PhotoState }>({ key: "", photo: { status: "none" } })

  useEffect(() => {
    if (!stop || !key || settled.has(key)) return
    let cancelled = false
    setState({ key, photo: { status: "loading" } })
    void find(stop.title, city, stop.lat, stop.lng, size)
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

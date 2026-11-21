// How Open-Meteo takes several places in one request, shared by the live
// forecast (`forecast.ts`) and the archive (`climate.ts`): coordinates and
// dates go as comma-separated lists, one entry per place, each place with its
// own dates; the answer is an array in the order asked (an object for one).

export interface OpenMeteoPlace {
  lat: number
  lng: number
  /** ISO dates, inclusive. */
  start: string
  end: string
}

/** The place part of the query string. */
export function placesQuery(places: readonly OpenMeteoPlace[]): string {
  const list = (pick: (place: OpenMeteoPlace) => string | number) => places.map(pick).join(",")
  return `latitude=${list((p) => p.lat)}&longitude=${list((p) => p.lng)}&start_date=${list((p) => p.start)}&end_date=${list((p) => p.end)}`
}

/** The answer for each place asked for, in order; undefined where it has none. */
export function perPlace<T>(body: T | T[] | null | undefined, count: number): Array<T | undefined> {
  const list = Array.isArray(body) ? body : body ? [body] : []
  return Array.from({ length: count }, (_, i) => list[i])
}

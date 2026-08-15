import { Effect } from "effect"
import { bearerHeaders, fetchApi, parseJson, readAuthToken } from "../../effect/http"
import { runPromise } from "../../effect/runtime"
import { HttpStatusError } from "../../effect/errors"
import type { PlacesResponse } from "./mapModeTypes"

export type GetToken = () => Promise<string | null>

const fetchDayPlacesEffect = Effect.fn("DayPlacesService.fetch")(function* (
  getToken: GetToken,
  placesPath: string,
  coords?: { lat: number; lng: number },
) {
  const token = yield* readAuthToken(getToken)
  const qs = new URLSearchParams()
  if (coords) {
    qs.set("lat", String(coords.lat))
    qs.set("lng", String(coords.lng))
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : ""
  const res = yield* fetchApi(`${placesPath}${suffix}`, {
    headers: bearerHeaders(token),
  })
  if (!res.ok) {
    return yield* Effect.fail(new HttpStatusError({ status: res.status, message: `Places fetch ${res.status}` }))
  }
  return yield* parseJson<PlacesResponse>(res)
})

/** Ranked places + IG saves for a day. `placesPath` is either the Korea
 *  snapshot URL or a trip day's `/api/trips/:id/days/:dayId/places`. */
export function fetchDayPlaces(
  getToken: GetToken,
  placesPath: string,
  coords?: { lat: number; lng: number },
): Promise<PlacesResponse> {
  return runPromise(fetchDayPlacesEffect(getToken, placesPath, coords))
}

// Shapes the trips API answers with that the client takes as they are
// (`frontend/src/pages/Trips/areas/contract.ts`, `ideas/contract.ts`). Types
// only, importing nothing, so the client's type check can read this file.

/** One photo of a place. `url` carries no API key and goes straight into an <img>. */
export interface PlacePhoto {
  url: string
  width?: number
  height?: number
  /** Who took it. Google's terms require showing this with the photo. */
  author?: { name: string; uri?: string }
}

/** GET /api/trips/:id/neighborhoods, one area. Computed on demand and cached; never written to the trip. */
export interface Neighborhood {
  /** Stable for the same name and city: `a-` and a short hash. */
  id: string
  name: string
  /** The name in the local language and script, when it differs ("성수동"). */
  localName?: string
  /** `localName`'s language as a BCP 47 tag ("ko", "ja", "zh-TW"), for its `lang`. */
  localLang?: string
  /** Empty when neither the model nor the plan named one. */
  city: string
  /** One plain sentence about the place: what kind of place it is and where it lies. */
  summary: string
  /** The trip's stops in it, in trip order. Read against the live trip: a stop deleted since is simply gone. */
  stopIds: string[]
  /** At most one, credited. None when Google has nothing that is surely the area or one of its stops. */
  photos: PlacePhoto[]
  /** Set when the photo is of one of the area's stops, not the area: that stop's name. */
  photoOf?: string
}

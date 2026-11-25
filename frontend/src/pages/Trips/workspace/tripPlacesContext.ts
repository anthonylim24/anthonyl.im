import { createContext } from "react"
import { NO_TRIP_PLACES, type TripPlaces } from "../searchArea"

/**
 * What the trip already has, for every place field on its page: the
 * workspace provides it, so a day's composer, the wishlist and a stop's
 * location all count the trip's other city as near.
 */
export const TripPlacesContext = createContext<TripPlaces>(NO_TRIP_PLACES)

import { Navigate, useLocation, useParams } from "react-router-dom"

const KOREA = "korea-2026"

/** Legacy `/korea` bookmarks land on the seeded trip. */
export function KoreaIndexRedirect() {
  return <Navigate to={`/trips/${KOREA}`} replace />
}

export function KoreaDayRedirect() {
  const { slug } = useParams<{ slug: string }>()
  return <Navigate to={slug ? `/trips/${KOREA}/day/${slug}` : `/trips/${KOREA}`} replace />
}

export function KoreaPlacesRedirect() {
  return <Navigate to={`/trips/${KOREA}/places`} replace />
}

export function KoreaIngestRedirect() {
  return <Navigate to={`/trips/${KOREA}?ingest=1#trip-ingest`} replace />
}

export function KoreaCatchRedirect() {
  return <Navigate to={`/trips/${KOREA}`} replace />
}

/** `/trips/:id/edit` folds into the living document, keeping hash + query. */
export function TripEditRedirect() {
  const { tripId } = useParams<{ tripId: string }>()
  const { hash, search } = useLocation()
  return <Navigate to={`/trips/${tripId ?? ""}${search}${hash}`} replace />
}

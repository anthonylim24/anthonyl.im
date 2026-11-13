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
  return <Navigate to={`/trips/${KOREA}`} replace />
}

/** The old ingest page is now the Instagram import sheet on the trip. */
export function KoreaIngestRedirect() {
  return <Navigate to={`/trips/${KOREA}?ingest=1`} replace />
}

export function KoreaCatchRedirect() {
  return <Navigate to={`/trips/${KOREA}`} replace />
}

/** `/trips/:id/edit` and `/trips/:id/places` fold into the trip page, keeping hash + query. */
export function TripEditRedirect() {
  const { tripId } = useParams<{ tripId: string }>()
  const { hash, search } = useLocation()
  return <Navigate to={`/trips/${tripId ?? ""}${search}${hash}`} replace />
}

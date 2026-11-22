// Which Trips page a path under /trips renders, as AppRoutes declares them.
// The router decides what renders; this only lets the page's chunk start
// downloading alongside the layout's instead of after the sign-in gate.

export type TripsPage = "index" | "create" | "join" | "trip"

export function tripsPageAt(pathname: string): TripsPage | null {
  const path = pathname.replace(/\/+$/, "")
  if (path === "/trips") return "index"
  if (path === "/trips/new") return "create"
  if (/^\/trips\/join\/[^/]+$/.test(path)) return "join"
  if (/^\/trips\/[^/]+(?:\/day\/[^/]+)?$/.test(path)) return "trip"
  return null
}

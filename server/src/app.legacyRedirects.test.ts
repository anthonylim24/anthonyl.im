import { expect, test } from "bun:test"

// A bookmark to an old address is a full page load, so the server answers it
// before the app's own redirects (KoreaRedirects.tsx) ever run.
async function loadApp() {
  process.env.IG_WORKER_ENABLED ||= "false"
  process.env.TRIPS_REVIEW_WORKER ||= "false"
  return (await import("../app")).default
}

test.each([
  ["/korea", "/trips/korea-2026"],
  ["/korea/", "/trips/korea-2026"],
  ["/korea/places", "/trips/korea-2026"],
  ["/korea/ingest", "/trips/korea-2026?ingest=1"],
  ["/korea/day/day-2", "/trips/korea-2026/day/day-2"],
  ["/korea/anything-else", "/trips/korea-2026"],
  ["/chatbot", "/"],
])("%s redirects to %s", async (from, to) => {
  const app = await loadApp()
  const res = await app.request(from)
  expect(res.status).toBe(301)
  expect(res.headers.get("location")).toBe(to)
})

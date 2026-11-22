// Seeds two trips into a LOCAL memory-store Trips API for scripts/trips-jank.mjs:
//
//   bun scripts/seed-bench-trips.ts http://127.0.0.1:3100
//
// - "Lisbon long weekend": live now (started two days ago), a few stops a day.
// - "Japan in autumn": three weeks out, twelve days of eight stops: the heavy one.
// Dates are relative to today, so the live trip stays live. Needs the API
// started with TRIPS_STORE=memory and IG_DEV_BEARER=codex-dev-bearer. Never
// point it at a real store.
const origin = (process.argv[2] ?? "http://127.0.0.1:3100").replace(/\/$/, "")
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) throw new Error(`local APIs only, not ${origin}`)
const API = `${origin}/api/trips`
const H = { Authorization: "Bearer codex-dev-bearer", "Content-Type": "application/json" }

let n = 0
const id = (prefix: string) => `${prefix}-${++n}`
const base = { status: "none", createdBy: "user" } as const
const loc = (name: string, lat: number, lng: number, category?: string) => ({ name, lat, lng, category, source: "user" })
const iso = (offsetDays: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

async function create(body: Record<string, unknown>) {
  const res = await fetch(API, { method: "POST", headers: H, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`create ${res.status} ${await res.text()}`)
  return (await res.json()).trip
}
async function patch(tripId: string, body: Record<string, unknown>) {
  const res = await fetch(`${API}/${tripId}`, { method: "PATCH", headers: H, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`patch ${res.status} ${await res.text()}`)
  return (await res.json()).trip
}

const lisbon = await create({
  name: "Lisbon long weekend",
  destinations: ["Lisbon"],
  startDate: iso(-2),
  endDate: iso(4),
  timezone: "Europe/Lisbon",
  status: "active",
  center: { lat: 38.72, lng: -9.14 },
})
const lisbonStops: [string, number, number, string, string][] = [
  ["Pastéis de Belém", 38.6975, -9.2033, "cafe", "09:30"],
  ["Jerónimos Monastery", 38.6979, -9.2068, "sight", "10:30"],
  ["LX Factory", 38.7036, -9.1786, "shop", "14:00"],
  ["Miradouro da Graça", 38.7163, -9.1307, "sight", "17:30"],
  ["Cervejaria Ramiro", 38.7208, -9.1357, "restaurant", "19:30"],
  ["Tasca do Chico", 38.7117, -9.1446, "bar", "22:30"],
]
lisbon.days.forEach((day: { items: unknown[]; city?: string }, i: number) => {
  day.city = "Lisbon"
  day.items = lisbonStops
    .filter((_, k) => (k + i) % 3 !== 0)
    .map(([name, lat, lng, category, time]) => ({ ...base, id: id("i"), kind: "place", title: name, time, location: loc(name, lat, lng, category) }))
})
await patch(lisbon.id, {
  days: lisbon.days,
  ideas: [{ ...base, id: id("w"), kind: "place", title: "Sintra day trip", location: loc("Sintra", 38.7979, -9.3907, "sight") }],
})

const japan = await create({
  name: "Japan in autumn",
  destinations: ["Tokyo", "Kyoto", "Osaka"],
  startDate: iso(21),
  endDate: iso(32),
  timezone: "Asia/Tokyo",
  status: "active",
  center: { lat: 35.68, lng: 139.76 },
})
const cities: [string, number, number][] = [
  ["Tokyo", 35.6812, 139.7671],
  ["Kyoto", 35.0116, 135.7681],
  ["Osaka", 34.6937, 135.5023],
]
const kinds = ["cafe", "sight", "shop", "restaurant", "park", "sight", "bar", "restaurant"]
japan.days.forEach((day: { items: unknown[]; city?: string }, i: number) => {
  const [city, lat, lng] = cities[Math.min(2, Math.floor(i / 4))]!
  day.city = city
  day.items = kinds.map((category, k) => {
    const name = `${city} ${category} ${i + 1}.${k + 1}`
    const time = `${String(8 + k * 2).padStart(2, "0")}:${k % 2 ? "30" : "00"}`
    // A loose loop around the city centre, different every day.
    const angle = (k / kinds.length) * Math.PI * 2 + i
    return {
      ...base,
      id: id("i"),
      kind: "place",
      title: name,
      time,
      note: k % 3 === 0 ? "Book ahead; it fills up by mid-morning on weekends." : undefined,
      location: loc(name, lat + Math.sin(angle) * 0.03, lng + Math.cos(angle) * 0.04, category),
    }
  })
})
await patch(japan.id, { days: japan.days })

console.log(JSON.stringify({ lisbon: lisbon.slug ?? lisbon.id, japan: japan.slug ?? japan.id }))

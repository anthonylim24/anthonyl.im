import { test as base, expect, type APIRequestContext } from '@playwright/test'

/**
 * Shared ground for the Trips workflow specs.
 *
 * Every spec runs against the hermetic stack in playwright.config.ts: an
 * in-memory trip store and no AI keys. The worker preflight refuses to run on
 * a stack that has AI configured, and the per-test tripwire fails any test
 * whose page asks for a draft, a review, the concierge or an Instagram read,
 * so these specs can never spend model calls.
 *
 * All specs share one dev user, so a test seeds its own trip, never edits
 * `korea-2026`, and never asserts how many trips the index holds.
 */

export const DEV_BEARER = 'codex-dev-bearer'
const AUTH = { Authorization: `Bearer ${DEV_BEARER}` }

export interface Location {
  name: string
  address?: string
  lat?: number
  lng?: number
  category?: string
  source?: 'user' | 'ai' | 'migration'
}

export interface Item {
  id: string
  kind: 'place' | 'note' | 'section' | 'reservation'
  title: string
  time?: string
  endTime?: string
  notes?: string
  status?: 'none' | 'optional' | 'booked' | 'completed' | 'skipped' | 'needs_review'
  location?: Location
  reservation?: Record<string, unknown>
  cost?: { amount: number; currency: string }
  highlight?: boolean
  theme?: string
  createdBy?: 'user' | 'ai' | 'migration'
}

export interface Day {
  id: string
  date: string
  title?: string
  city?: string
  journal?: string
  timezone?: string
  items: Item[]
}

export interface Trip {
  id: string
  slug: string
  name: string
  destinations: string[]
  startDate: string
  endDate: string
  timezone: string
  updatedAt: string
  days: Day[]
  ideas?: Item[]
  budget?: { currency: string; total?: number }
  party?: { id: string; name: string }[]
  expenses?: Record<string, unknown>[]
  checklist?: { id: string; text: string; done: boolean; group: string; assignee?: string }[]
  invites?: { token: string; role: string }[]
  [key: string]: unknown
}

export interface SeedInput {
  name?: string
  destinations?: string[]
  startDate?: string
  endDate?: string
  timezone?: string
  center?: { lat: number; lng: number }
  /** Applied with a PATCH after the create, keyed onto the created days. */
  patch?: (trip: Trip) => Record<string, unknown>
}

let seq = 0
/** A name no other test or worker will produce. */
export function uniqueName(label: string): string {
  seq += 1
  return `Audit ${label} ${Date.now().toString(36)}${seq}`
}

let itemSeq = 0
export function itemId(prefix = 'e2e'): string {
  itemSeq += 1
  return `${prefix}-${Date.now().toString(36)}-${itemSeq}`
}

export const TOKYO = { lat: 35.6812, lng: 139.7671 }

/** A place stop with a pin, ready to drop into `days[n].items`. */
export function place(title: string, lat: number, lng: number, extra: Partial<Item> = {}): Item {
  return {
    id: itemId('place'),
    kind: 'place',
    title,
    status: 'none',
    createdBy: 'user',
    location: { name: title, lat, lng, source: 'user', category: 'sight' },
    ...extra,
  }
}

export function note(title: string, extra: Partial<Item> = {}): Item {
  return { id: itemId('note'), kind: 'note', title, status: 'none', createdBy: 'user', ...extra }
}

async function json<T>(res: Awaited<ReturnType<APIRequestContext['get']>>, what: string): Promise<T> {
  if (!res.ok()) throw new Error(`${what} answered ${res.status()}: ${await res.text()}`)
  return (await res.json()) as T
}

export async function seedTrip(request: APIRequestContext, input: SeedInput = {}): Promise<Trip> {
  const created = await json<{ trip: Trip }>(
    await request.post('/api/trips', {
      headers: AUTH,
      data: {
        name: input.name ?? uniqueName('trip'),
        destinations: input.destinations ?? ['Tokyo'],
        startDate: input.startDate ?? '2027-03-01',
        endDate: input.endDate ?? '2027-03-03',
        timezone: input.timezone ?? 'Asia/Tokyo',
        center: input.center ?? TOKYO,
      },
    }),
    'POST /api/trips',
  )
  if (!input.patch) return created.trip
  return patchTrip(request, created.trip.id, input.patch(created.trip))
}

export async function readTrip(request: APIRequestContext, id: string): Promise<Trip> {
  return (await json<{ trip: Trip }>(await request.get(`/api/trips/${id}`, { headers: AUTH }), `GET /api/trips/${id}`)).trip
}

export async function patchTrip(request: APIRequestContext, id: string, patch: Record<string, unknown>): Promise<Trip> {
  return (
    await json<{ trip: Trip }>(
      await request.patch(`/api/trips/${id}`, { headers: AUTH, data: patch }),
      `PATCH /api/trips/${id}`,
    )
  ).trip
}

export async function deleteTrip(request: APIRequestContext, id: string): Promise<void> {
  await request.delete(`/api/trips/${id}`, { headers: AUTH })
}

/** Waits until the server copy satisfies `check`, then returns it. */
export async function serverTrip(
  request: APIRequestContext,
  id: string,
  check: (trip: Trip) => boolean,
  message: string,
): Promise<Trip> {
  let last: Trip | undefined
  await expect
    .poll(
      async () => {
        last = await readTrip(request, id)
        return check(last)
      },
      { message, timeout: 10_000 },
    )
    .toBe(true)
  return last!
}

/** Requests that would reach a model. None of them may leave the page. */
const AI_REQUESTS: { method: string; path: RegExp }[] = [
  { method: 'POST', path: /^\/api\/trips\/[^/]+\/(generate|enhance|chat)$/ },
  { method: 'POST', path: /^\/api\/trips\/[^/]+\/enhancements\/[^/]+\/apply$/ },
  { method: 'POST', path: /^\/api\/instagram(\/.*)?$/ },
  { method: 'POST', path: /^\/api\/korea\/places\/from-instagram(\/.*)?$/ },
  { method: 'POST', path: /^\/api\/invoke$/ },
]

export const test = base.extend<{ aiTripwire: string[]; pageErrors: string[] }, { noAiStack: void }>({
  noAiStack: [
    async ({ playwright }, use, workerInfo) => {
      const baseURL = workerInfo.project.use.baseURL
      const request = await playwright.request.newContext({ baseURL })
      const trip = await seedTrip(request, { name: uniqueName('preflight') })
      const res = await request.post(`/api/trips/${trip.id}/bookings/parse`, {
        headers: AUTH,
        data: { text: 'Flight KE123 on 1 March' },
      })
      const body = await res.text()
      await deleteTrip(request, trip.id)
      await request.dispose()
      if (res.status() !== 503 || !body.includes('ai_not_configured')) {
        throw new Error(
          `Refusing to run: the stack at ${baseURL} has AI configured (bookings/parse answered ${res.status()}). ` +
            'Run against the hermetic stack from playwright.config.ts.',
        )
      }
      await use()
    },
    { scope: 'worker', auto: true },
  ],
  aiTripwire: [
    async ({ page }, use) => {
      const hits: string[] = []
      await page.route('**/api/**', async (route) => {
        const req = route.request()
        const path = new URL(req.url()).pathname.replace(/^\/preview\/pr\/\d+/, '')
        if (AI_REQUESTS.some((ai) => ai.method === req.method() && ai.path.test(path))) {
          hits.push(`${req.method()} ${path}`)
          await route.abort()
          return
        }
        await route.fallback()
      })
      await use(hits)
      expect(hits, 'no request reached an AI endpoint').toEqual([])
    },
    { auto: true },
  ],
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await use(errors)
      expect(errors, 'no uncaught page errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

import type { APIRequestContext, Page, Response } from '@playwright/test'
import {
  DEV_BEARER,
  deleteTrip,
  expect as baseExpect,
  note,
  place,
  readTrip,
  seedTrip,
  serverTrip,
  test,
  uniqueName,
  type SeedInput,
  type Trip,
} from './fixtures'

// On a loaded machine lazy chunks and maps take well past the 5 s default.
const expect = baseExpect.configure({ timeout: 30_000 })
test.describe.configure({ timeout: 240_000 })

/** Leaving an index of every agent's trips is the slowest hand-off in this file. */
const LEFT_INDEX = { timeout: 90_000 }

const AUTH = { Authorization: `Bearer ${DEV_BEARER}` }
const KOREA = 'korea-2026'
/** The Hono server itself: the redirects it answers before the SPA loads, and cleanup that outlives a dev-server crash. */
const API_ORIGIN = `http://localhost:${process.env.PORT ?? 3210}`

/**
 * Every trip this worker made. A test that times out has lost its `request` by
 * the time its `finally` runs, so `afterAll` deletes whatever is still here.
 */
const made = new Set<string>()

async function seed(request: APIRequestContext, label: string, input: SeedInput = {}): Promise<Trip> {
  const trip = await seedTrip(request, { ...input, name: input.name ?? uniqueName(`idx ${label}`) })
  made.add(trip.id)
  return trip
}

async function remove(request: APIRequestContext, id: string | undefined): Promise<void> {
  if (!id) return
  await deleteTrip(request, id)
  made.delete(id)
}

test.afterAll(async ({ playwright }) => {
  if (made.size === 0) return
  const request = await playwright.request.newContext({ baseURL: API_ORIGIN })
  for (const id of made) await deleteTrip(request, id)
  made.clear()
  await request.dispose()
})

async function apiStatus(request: APIRequestContext, id: string): Promise<number> {
  return (await request.get(`/api/trips/${encodeURIComponent(id)}`, { headers: AUTH })).status()
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** An ISO date `offset` days from today (UTC). Callers keep a margin of days around today. */
function isoFromToday(offset: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function datesBetween(start: string, end: string): string[] {
  const out: string[] = []
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

const spoken = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts })

/** How the date field reads a range out loud: "Dates: Wed, Jan 6 → Sat, Jan 9, 4 days. Change dates". */
function rangeLabel(start: string, end: string): string {
  const day = (iso: string) => spoken(iso, { weekday: 'short', month: 'short', day: 'numeric' })
  const count = datesBetween(start, end).length
  return `Dates: ${day(start)} → ${day(end)}, ${count} ${count === 1 ? 'day' : 'days'}. Change dates`
}

const cardLink = (page: Page, name: string) =>
  page
    .getByRole('region', { name: 'Your trips' })
    .getByRole('link', { name: new RegExp(`^${escapeRegExp(name)}, `) })

/** The index's list, in reading order: each bucket heading with the trip names under it. */
async function buckets(page: Page): Promise<{ heading: string; trips: string[] }[]> {
  return page
    .getByRole('region', { name: 'Your trips' })
    .locator('h3, article h4')
    .evaluateAll((nodes) => {
      const out: { heading: string; trips: string[] }[] = []
      for (const node of nodes) {
        const text = node.textContent?.trim() ?? ''
        if (node.tagName === 'H3') out.push({ heading: text, trips: [] })
        else out.at(-1)?.trips.push(text)
      }
      return out
    })
}

const createdTrip = (res: Response) =>
  res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/trips' && res.status() === 201

const MONTHS = Array.from({ length: 12 }, (_, i) => spoken(`2000-${String(i + 1).padStart(2, '0')}-15`, { month: 'long' }))

/** "January 2027" as a count of months, so two labels can be compared. */
function monthNumber(label: string): number {
  const [name, year] = label.split(' ')
  return Number(year) * 12 + MONTHS.indexOf(name ?? '')
}

/** Clicks `first`, then `second`, in the range calendar, paging to each one's month. */
async function pickDates(page: Page, first: string, second: string) {
  await page.getByRole('button', { name: /^Dates: / }).click()
  const calendar = page.getByRole('dialog', { name: 'Choose dates' })
  const month = calendar.getByRole('group')
  for (const iso of [first, second]) {
    const wanted = spoken(iso, { month: 'long', year: 'numeric' })
    for (let i = 0; i < 24; i++) {
      const shown = (await month.getAttribute('aria-label')) ?? ''
      if (shown === wanted) break
      const step = monthNumber(wanted) > monthNumber(shown) ? 'Next month' : 'Previous month'
      await calendar.getByRole('button', { name: step }).click()
      await expect(month).not.toHaveAttribute('aria-label', shown)
    }
    await month
      .getByRole('button', { name: spoken(iso, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), exact: true })
      .click()
  }
  await expect(calendar).toBeHidden()
}

async function pickLisbon(page: Page) {
  await page.getByRole('combobox', { name: 'Destinations' }).fill('Lisbon')
  await page.getByRole('option', { name: /^Lisbon Lisbon District, Portugal$/ }).click()
  await expect(page.getByRole('button', { name: 'Remove Lisbon' })).toBeVisible()
}

async function draftWithoutAi(page: Page) {
  const ai = page.getByRole('switch', { name: /Draft the itinerary with AI/ })
  await ai.click()
  await expect(ai).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByRole('button', { name: 'Create trip', exact: true })).toBeVisible()
}

test.describe('index', () => {
  test('a trip shows as a card on the index and the card opens its workspace', async ({ page, request }) => {
    const trip = await seed(request, 'card')
    try {
      await page.goto('/trips')
      await cardLink(page, trip.name).click()
      await expect(page).toHaveURL(new RegExp(`/trips/${escapeRegExp(trip.slug)}$`))
      await expect(page.getByRole('textbox', { name: 'Trip name' })).toHaveValue(trip.name, LEFT_INDEX)
    } finally {
      await remove(request, trip.id)
    }
  })

  test('trips sort into Happening now, Upcoming and Past by their dates', async ({ page, request }) => {
    const tag = uniqueName('idx bucket')
    const seeds = [
      { name: `${tag} under way`, startDate: isoFromToday(-3), endDate: isoFromToday(3) },
      { name: `${tag} ahead`, startDate: isoFromToday(30), endDate: isoFromToday(33) },
      { name: `${tag} last month`, startDate: isoFromToday(-40), endDate: isoFromToday(-37) },
      { name: `${tag} last year`, startDate: isoFromToday(-300), endDate: isoFromToday(-296) },
    ]
    const trips: Trip[] = []
    try {
      for (const input of seeds) trips.push(await seed(request, 'bucket', { ...input, timezone: 'UTC' }))
      await page.goto('/trips')
      await expect(cardLink(page, seeds[3].name)).toBeVisible()

      const bucketOf = (list: { heading: string; trips: string[] }[], name: string) => {
        const group = list.find((g) => g.trips.includes(name))
        return group ? group.heading.replace(/ · \d+$/, '') : null
      }
      await expect
        .poll(async () => {
          const list = await buckets(page)
          return seeds.map((input) => bucketOf(list, input.name))
        }, { message: 'each trip sits under the heading its dates call for' })
        .toEqual(['Happening now', 'Upcoming', 'Past', 'Past'])

      const past = (await buckets(page)).find((g) => g.heading.startsWith('Past'))!.trips
      expect(past.indexOf(seeds[2].name), 'the most recent past trip comes first').toBeLessThan(past.indexOf(seeds[3].name))
      for (const heading of (await buckets(page)).map((g) => g.heading)) {
        expect(heading, 'every bucket heading counts its trips').toMatch(/^(Happening now|Upcoming|Past) · [1-9]\d*$/)
      }
    } finally {
      for (const trip of trips) await remove(request, trip.id)
    }
  })

  test('pressing / focuses the trip search, and typing filters the cards by name', async ({ page, request }) => {
    const seeded: Trip[] = []
    try {
      const alpha = await seed(request, 'search alpha')
      seeded.push(alpha)
      const beta = await seed(request, 'search beta')
      seeded.push(beta)
      await page.goto('/trips')
      await expect(cardLink(page, alpha.name)).toBeVisible()
      await expect(cardLink(page, beta.name)).toBeVisible()

      const search = page.getByRole('searchbox', { name: 'Search trips' })
      await page.keyboard.press('/')
      await expect(search).toBeFocused()
      await search.fill(alpha.name)
      await expect(cardLink(page, beta.name)).toHaveCount(0)
      await expect(cardLink(page, alpha.name)).toBeVisible()
      await expect(page.getByRole('status').filter({ hasText: /^1 matching trip\.$/ })).toBeAttached()

      await search.fill(`${alpha.name} zzz-no-such-trip`)
      await expect(page.getByText(`No trips match “${alpha.name} zzz-no-such-trip”.`)).toBeVisible()
      await page.getByRole('button', { name: 'Clear search' }).click()
      await expect(search).toHaveValue('')
      await expect(cardLink(page, alpha.name)).toBeVisible()
      await expect(cardLink(page, beta.name)).toBeVisible()
    } finally {
      for (const trip of seeded) await remove(request, trip.id)
    }
  })

  test('pressing n on the index opens a new trip', async ({ page }) => {
    await page.goto('/trips')
    await expect(page.getByRole('searchbox', { name: 'Search trips' })).toBeVisible()
    await page.keyboard.press('n')
    await expect(page).toHaveURL(/\/trips\/new$/)
    await expect(page.getByRole('heading', { name: 'Where to?' })).toBeVisible(LEFT_INDEX)
  })
})

test.describe('create', () => {
  test('a trip created without AI from a city search and picked dates opens with one day per date and is saved', async ({
    page,
    request,
  }) => {
    const name = uniqueName('idx created')
    const start = isoFromToday(45)
    const end = isoFromToday(48)
    let createdId: string | undefined
    try {
      await page.goto('/trips/new')
      await pickLisbon(page)
      await pickDates(page, start, end)
      await expect(page.getByRole('button', { name: rangeLabel(start, end) })).toBeVisible()
      await page.getByRole('textbox', { name: /^Name/ }).fill(name)
      await draftWithoutAi(page)

      const created = page.waitForResponse(createdTrip)
      await page.getByRole('button', { name: 'Create trip', exact: true }).click()
      const trip = ((await (await created).json()) as { trip: Trip }).trip
      createdId = trip.id
      made.add(trip.id)

      await expect(page).toHaveURL(new RegExp(`/trips/${escapeRegExp(trip.slug)}$`))
      await expect(page.getByRole('textbox', { name: 'Trip name' })).toHaveValue(name)
      await expect(page.getByRole('main').getByText(/^In .* · Lisbon · Draft$/)).toBeVisible()
      const days = page.getByRole('navigation', { name: 'Days' }).getByRole('link', { name: /^Day \d+, / })
      const dates = datesBetween(start, end)
      await expect(days).toHaveCount(dates.length)
      for (const [i, iso] of dates.entries()) {
        await expect(days.nth(i)).toHaveAccessibleName(
          new RegExp(`^Day ${i + 1}, ${spoken(iso, { weekday: 'long', month: 'long', day: 'numeric' })}`),
        )
      }

      const saved = await readTrip(request, trip.id)
      expect(saved.name).toBe(name)
      expect(saved.destinations).toEqual(['Lisbon'])
      expect([saved.startDate, saved.endDate]).toEqual([start, end])
      expect(saved.timezone).toBe('Europe/Lisbon')
      expect(saved.days.map((d) => d.date)).toEqual(dates)
      expect(saved.days.every((d) => d.items.length === 0), 'a trip made without AI starts with empty days').toBe(true)
      const center = saved.center as { lat: number; lng: number }
      expect(center.lat).toBeCloseTo(38.72, 0)
      expect(center.lng).toBeCloseTo(-9.14, 0)

      await page.reload()
      await expect(page.getByRole('textbox', { name: 'Trip name' })).toHaveValue(name)
      await expect(days).toHaveCount(dates.length)
    } finally {
      await remove(request, createdId)
    }
  })

  test('a trip left unnamed is named after its destination, and the Weekend length makes three days', async ({ page, request }) => {
    let createdId: string | undefined
    try {
      await page.goto('/trips/new')
      await pickLisbon(page)
      await expect(page.getByRole('textbox', { name: /^Name/ })).toHaveAttribute('placeholder', 'Lisbon')
      await page.getByRole('group', { name: 'Trip length' }).getByRole('button', { name: 'Weekend' }).click()
      await expect(page.getByRole('button', { name: /^Dates: .*, 3 days\. Change dates$/ })).toBeVisible()
      await draftWithoutAi(page)

      const created = page.waitForResponse(createdTrip)
      await page.getByRole('button', { name: 'Create trip', exact: true }).click()
      const trip = ((await (await created).json()) as { trip: Trip }).trip
      createdId = trip.id
      made.add(trip.id)

      await expect(page.getByRole('textbox', { name: 'Trip name' })).toHaveValue('Lisbon')
      const saved = await readTrip(request, trip.id)
      expect(saved.name).toBe('Lisbon')
      expect(saved.days).toHaveLength(3)
      expect(saved.days.map((d) => d.date)).toEqual(datesBetween(saved.startDate, saved.endDate))
    } finally {
      await remove(request, createdId)
    }
  })

  test('picking the last day before the first in the calendar still makes a trip that ends after it starts', async ({
    page,
    request,
  }) => {
    const name = uniqueName('idx reversed')
    const early = isoFromToday(50)
    const late = isoFromToday(53)
    let createdId: string | undefined
    try {
      await page.goto('/trips/new')
      await pickLisbon(page)
      await pickDates(page, late, early)
      await expect(page.getByRole('button', { name: rangeLabel(early, late) })).toBeVisible()
      await page.getByRole('textbox', { name: /^Name/ }).fill(name)
      await draftWithoutAi(page)

      const created = page.waitForResponse(createdTrip)
      await page.getByRole('button', { name: 'Create trip', exact: true }).click()
      const trip = ((await (await created).json()) as { trip: Trip }).trip
      createdId = trip.id
      made.add(trip.id)

      const saved = await readTrip(request, trip.id)
      expect([saved.startDate, saved.endDate]).toEqual([early, late])
      expect(saved.days.map((d) => d.date)).toEqual(datesBetween(early, late))
    } finally {
      await remove(request, createdId)
    }
  })

  test('the server refuses a trip whose end date is before its start date', async ({ request }) => {
    const name = uniqueName('idx backwards')
    const res = await request.post('/api/trips', {
      headers: AUTH,
      data: { name, destinations: ['Tokyo'], startDate: '2027-03-05', endDate: '2027-03-01', timezone: 'Asia/Tokyo' },
    })
    if (res.ok()) await remove(request, ((await res.json()) as { trip: Trip }).trip.id)
    expect(res.status()).toBe(400)
    expect(await res.text()).toContain('endDate must be on or after startDate')
  })
})

test.describe('trip lifecycle', () => {
  const planned = (trip: Trip) => ({
    days: trip.days.map((day, i) =>
      i === 0
        ? { ...day, items: [place('Senso-ji', 35.7148, 139.7967, { time: '09:00' }), note('Buy a Suica card')] }
        : i === 1
          ? { ...day, items: [place('Meiji Jingu', 35.6764, 139.6993, { time: '10:30', notes: 'Enter by the south gate' })] }
          : day,
    ),
  })

  const plan = (trip: Trip) =>
    trip.days.map((day) => ({
      date: day.date,
      items: day.items.map((item) => ({
        kind: item.kind,
        title: item.title,
        time: item.time,
        notes: item.notes,
        location: item.location && { name: item.location.name, lat: item.location.lat, lng: item.location.lng },
      })),
    }))

  test('Duplicate trip in the trip menu opens a copy with the same days and stops under a new id', async ({ page, request }) => {
    const original = await seed(request, 'copy source', { patch: planned })
    let copyId: string | undefined
    try {
      await page.goto(`/trips/${original.slug}`)
      await expect(page.getByRole('textbox', { name: 'Trip name' })).toHaveValue(original.name)

      const created = page.waitForResponse(createdTrip)
      await page.getByRole('button', { name: 'More trip options' }).click()
      await page.getByRole('menuitem', { name: 'Duplicate trip' }).click()
      const copyShell = ((await (await created).json()) as { trip: Trip }).trip
      copyId = copyShell.id
      made.add(copyShell.id)

      await expect(page).toHaveURL(new RegExp(`/trips/${escapeRegExp(copyShell.slug)}$`))
      await expect(page.getByRole('textbox', { name: 'Trip name' })).toHaveValue(`${original.name} (copy)`)
      await expect(page.getByRole('navigation', { name: 'Days' }).getByRole('link', { name: /^Day 1, .*, 2 items$/ })).toBeVisible()

      const copy = await serverTrip(request, copyShell.id, (t) => t.days.some((d) => d.items.length > 0), 'the copy got its plan')
      expect(copy.id).not.toBe(original.id)
      expect(copy.slug).not.toBe(original.slug)
      expect(copy.name).toBe(`${original.name} (copy)`)
      expect(plan(copy)).toEqual(plan(original))
      const originalIds = new Set(original.days.flatMap((d) => d.items.map((i) => i.id)))
      expect(copy.days.flatMap((d) => d.items).filter((i) => originalIds.has(i.id)), 'the copy has its own stop ids').toEqual([])
      expect(plan(await readTrip(request, original.id)), 'the original is untouched').toEqual(plan(original))
    } finally {
      await remove(request, copyId)
      await remove(request, original.id)
    }
  })

  test('Delete trip in the trip menu asks first, then removes the trip from the index and the server', async ({ page, request }) => {
    const trip = await seed(request, 'menu delete')
    try {
      await page.goto(`/trips/${trip.id}`)
      await expect(page.getByRole('textbox', { name: 'Trip name' })).toHaveValue(trip.name)

      await page.getByRole('button', { name: 'More trip options' }).click()
      await page.getByRole('menuitem', { name: 'Delete trip…' }).click()
      const confirm = page.getByRole('dialog', { name: `Delete “${trip.name}”?` })
      await expect(confirm).toContainText('This can’t be undone.')
      await confirm.getByRole('button', { name: 'Keep trip' }).click()
      await expect(confirm).toBeHidden()
      expect(await apiStatus(request, trip.id), 'Keep trip leaves it in place').toBe(200)

      await page.getByRole('button', { name: 'More trip options' }).click()
      await page.getByRole('menuitem', { name: 'Delete trip…' }).click()
      await confirm.getByRole('button', { name: 'Delete trip' }).click()

      await expect(page).toHaveURL(/\/trips$/)
      await expect(page.getByRole('searchbox', { name: 'Search trips' })).toBeVisible()
      await expect(cardLink(page, trip.name)).toHaveCount(0)
      expect(await apiStatus(request, trip.id)).toBe(404)
      expect(await apiStatus(request, trip.slug)).toBe(404)
    } finally {
      await remove(request, trip.id)
    }
  })

  test('a card’s Delete trip on the index removes the card and the server copy', async ({ page, request }) => {
    const trip = await seed(request, 'card delete')
    try {
      await page.goto('/trips')
      await page.getByRole('searchbox', { name: 'Search trips' }).fill(trip.name)
      await expect(cardLink(page, trip.name)).toBeVisible()
      await page.getByRole('button', { name: `Options for ${trip.name}` }).click()
      await page.getByRole('menuitem', { name: 'Delete trip…' }).click()
      await page.getByRole('dialog', { name: `Delete “${trip.name}”?` }).getByRole('button', { name: 'Delete trip' }).click()

      await expect(cardLink(page, trip.name)).toHaveCount(0)
      await expect(page.getByRole('status').filter({ hasText: 'No matching trips.' })).toBeAttached()
      expect(await apiStatus(request, trip.id)).toBe(404)
    } finally {
      await remove(request, trip.id)
    }
  })

  test('a card’s Duplicate on the index opens the copy with the same plan', async ({ page, request }) => {
    const original = await seed(request, 'copy source', { patch: planned })
    let copyId: string | undefined
    try {
      await page.goto('/trips')
      await page.getByRole('searchbox', { name: 'Search trips' }).fill(original.name)
      await expect(cardLink(page, original.name)).toBeVisible()

      const created = page.waitForResponse(createdTrip)
      await page.getByRole('button', { name: `Options for ${original.name}` }).click()
      await page.getByRole('menuitem', { name: 'Duplicate' }).click()
      const copyShell = ((await (await created).json()) as { trip: Trip }).trip
      copyId = copyShell.id
      made.add(copyShell.id)

      await expect(page).toHaveURL(new RegExp(`/trips/${escapeRegExp(copyShell.slug)}$`))
      await expect(page.getByRole('textbox', { name: 'Trip name' })).toHaveValue(`${original.name} (copy)`, LEFT_INDEX)
      const copy = await serverTrip(request, copyShell.id, (t) => t.days.some((d) => d.items.length > 0), 'the copy got its plan')
      expect(copy.id).not.toBe(original.id)
      expect(plan(copy)).toEqual(plan(original))
    } finally {
      await remove(request, copyId)
      await remove(request, original.id)
    }
  })

  test('the shared Korea trip offers Duplicate but never Delete', async ({ page, request }) => {
    const korea = await readTrip(request, KOREA)
    await page.goto(`/trips/${KOREA}`)
    await expect(page.getByRole('textbox', { name: 'Trip name' })).toHaveValue(korea.name)
    await page.getByRole('button', { name: 'More trip options' }).click()
    await expect(page.getByRole('menuitem', { name: 'Duplicate trip' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Delete trip/ })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menuitem', { name: 'Duplicate trip' })).toBeHidden()

    await page.goto('/trips')
    await page.getByRole('searchbox', { name: 'Search trips' }).fill(korea.name)
    await page.getByRole('button', { name: `Options for ${korea.name}` }).click()
    await expect(page.getByRole('menuitem', { name: 'Duplicate' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Delete trip/ })).toHaveCount(0)
    await page.keyboard.press('Escape')
  })
})

test.describe('routing', () => {
  test('an address that matches no trip shows the not-found page', async ({ page }) => {
    for (const path of ['/trips/does-not-exist', '/trips/does-not-exist/extra/segments']) {
      await page.goto(path)
      const main = page.getByRole('main')
      await expect(main.getByRole('heading', { name: 'Here be dragons.' })).toBeVisible()
      await expect(main.getByText('404 · Off the map')).toBeVisible()
      await expect(main.getByRole('link', { name: 'Back to all trips' })).toHaveAttribute('href', '/trips')
    }
  })

  test('/edit and /places addresses land on the trip, keeping the query and hash', async ({ page, request }) => {
    const trip = await seed(request, 'legacy path')
    try {
      for (const legacy of ['edit', 'places']) {
        await page.goto(`/trips/${trip.id}/${legacy}?tab=budget#audit`)
        await expect(page).toHaveURL(new RegExp(`/trips/${escapeRegExp(trip.id)}\\?tab=budget#audit$`))
        await expect(page.getByRole('textbox', { name: 'Trip name' })).toHaveValue(trip.name)
        await expect(page.getByRole('tab', { name: 'Budget' })).toHaveAttribute('aria-selected', 'true')
      }
    } finally {
      await remove(request, trip.id)
    }
  })

  test('old /korea addresses open the Korea trip in the app', async ({ page, request }) => {
    const korea = await readTrip(request, KOREA)
    for (const path of ['/korea', '/korea/places']) {
      await page.goto(path)
      await expect(page).toHaveURL(new RegExp(`/trips/${KOREA}$`))
      await expect(page.getByRole('textbox', { name: 'Trip name' })).toHaveValue(korea.name)
    }
    const second = korea.days[1]
    await page.goto(`/korea/day/${second.id}`)
    await expect(page).toHaveURL(new RegExp(`/trips/${KOREA}/day/${escapeRegExp(second.id)}$`))
    await expect(page.getByRole('region', { name: 'Day 2 plan' })).toBeVisible()
  })

  test('the server sends old /korea addresses to the Korea trip before the app loads', async ({ request }) => {
    const cases = [
      ['/korea', `/trips/${KOREA}`],
      ['/korea/places', `/trips/${KOREA}`],
      ['/korea/day/day-2', `/trips/${KOREA}/day/day-2`],
      ['/korea/anything-else', `/trips/${KOREA}`],
    ] as const
    for (const [from, to] of cases) {
      const res = await request.get(`${API_ORIGIN}${from}`, { maxRedirects: 0 })
      expect(res.status(), from).toBe(301)
      const location = new URL(res.headers().location ?? '', API_ORIGIN)
      expect(`${location.pathname}${location.search}`, from).toBe(to)
    }
  })

  test('the server sends /korea/ingest to the Korea trip with the Instagram import open', async ({ request }) => {
    const res = await request.get(`${API_ORIGIN}/korea/ingest`, { maxRedirects: 0 })
    expect(res.status()).toBe(301)
    const location = new URL(res.headers().location ?? '', API_ORIGIN)
    expect(`${location.pathname}${location.search}`).toBe(`/trips/${KOREA}?ingest=1`)
  })

  test('a trip opens by its slug and by its id', async ({ page, request }) => {
    const trip = await seed(request, 'slug')
    try {
      expect(trip.slug).not.toBe(trip.id)
      for (const key of [trip.slug, trip.id]) {
        await page.goto(`/trips/${key}`)
        await expect(page).toHaveURL(new RegExp(`/trips/${escapeRegExp(key)}$`))
        await expect(page.getByRole('textbox', { name: 'Trip name' })).toHaveValue(trip.name)
        await expect(page.getByRole('navigation', { name: 'Days' }).getByRole('link', { name: /^Day \d+, / })).toHaveCount(
          trip.days.length,
        )
      }
    } finally {
      await remove(request, trip.id)
    }
  })
})

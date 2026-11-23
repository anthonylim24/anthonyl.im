import type { APIRequestContext, Locator, Page, Route } from '@playwright/test'
import {
  deleteTrip,
  expect as baseExpect,
  itemId,
  note,
  patchTrip,
  place,
  readTrip,
  seedTrip,
  test,
  uniqueName,
  type Item,
  type SeedInput,
  type Trip,
} from './fixtures'

// On a heavily loaded machine the day page was seen to stall for tens of
// seconds (a fill that took 61 s, a 100 ms timer that fired 32 s late), next to
// Chromium's "GPU stall due to ReadPixels" warnings. The stock 5 s and 30 s
// failed on those stalls, not on the behaviour under test.
const expect = baseExpect.configure({ timeout: 30_000 })
test.describe.configure({ timeout: 120_000 })

const SENSO = [35.7148, 139.7967] as const
const UENO = [35.7156, 139.7745] as const
const MEIJI = [35.6764, 139.6993] as const
const SHIBUYA = [35.6595, 139.7005] as const

const seed = (request: APIRequestContext, days: Item[][], input: Omit<SeedInput, 'patch'> = {}) =>
  seedTrip(request, {
    name: uniqueName('sync'),
    ...input,
    patch: (created) => ({ days: created.days.map((day, i) => ({ ...day, items: days[i] ?? [] })) }),
  })

/** Writes as another device would: against the server's current copy, so the server takes it. */
async function writeAsSomeoneElse(request: APIRequestContext, id: string, change: (trip: Trip) => Partial<Trip>): Promise<Trip> {
  const now = await readTrip(request, id)
  return patchTrip(request, id, { ...change(now), baseUpdatedAt: now.updatedAt })
}

const itemsOf = (trip: Trip, day: number) => trip.days[day].items
const titled = (trip: Trip, day: number, title: string) => itemsOf(trip, day).find((i) => i.title === title)

/** The one save line on screen (header from 1024 px). */
const saveLine = (page: Page) =>
  page.getByRole('status').filter({ hasText: /^(Saved|Saving|Offline · will save when back online|Not saved · .+)$/ })

const tripPath = (trip: Trip) => `/api/trips/${trip.id}`

const isTripPatch = (trip: Trip) => (route: Route) =>
  route.request().method() === 'PATCH' && new URL(route.request().url()).pathname === tripPath(trip)

async function openDay(page: Page, trip: Trip, day: number) {
  await page.goto(`/trips/${trip.id}/day/${trip.days[day].id}`)
  const plan = page.getByRole('region', { name: `Day ${day + 1} plan` })
  await expect(saveLine(page)).toHaveText('Saved')
  // The forecast's held place can fold away when the lookup finds nothing,
  // moving the plan up under a click that was aimed at a stop.
  await expect(page.getByLabel('Loading the forecast')).toHaveCount(0)
  return plan
}

/** Opens a stop's editor and returns its name field. */
async function openStop(plan: Locator, title: string) {
  await plan.getByText(title, { exact: true }).click()
  const name = plan.getByRole('textbox', { name: 'Name', exact: true })
  await expect(name).toHaveValue(title)
  return name
}

/** A marker that only survives while the page is the same document (no reload behind the test's back). */
const markDocument = (page: Page) => page.evaluate(() => Object.assign(window, { __auditSameDocument: true }))
const sameDocument = (page: Page) => page.evaluate(() => (window as { __auditSameDocument?: boolean }).__auditSameDocument === true)

test('an edit made offline says it will save, then saves by itself once back online', async ({ page, context, request }) => {
  const trip = await seed(request, [[place('Senso-ji', ...SENSO, { time: '09:00' })], [], []])
  try {
    const plan = await openDay(page, trip, 0)
    const name = await openStop(plan, 'Senso-ji')
    await markDocument(page)

    await context.setOffline(true)
    await name.fill('Senso-ji at dawn')
    await expect(saveLine(page)).toHaveText('Offline · will save when back online')
    await expect(plan.getByText('Senso-ji at dawn', { exact: true })).toBeVisible()
    expect(titled(await readTrip(request, trip.id), 0, 'Senso-ji'), 'nothing reached the server while offline').toBeTruthy()

    await context.setOffline(false)
    await expect(saveLine(page)).toHaveText('Saved')
    const saved = await readTrip(request, trip.id)
    expect(itemsOf(saved, 0).map((i) => i.title)).toEqual(['Senso-ji at dawn'])
    expect(await sameDocument(page), 'saved without a reload').toBe(true)
  } finally {
    await context.setOffline(false)
    await deleteTrip(request, trip.id)
  }
})

test('an edit the server never got survives a reload and saves once the server answers', async ({ page, request }) => {
  const trip = await seed(request, [[place('Senso-ji', ...SENSO, { time: '09:00' })], [], []])
  try {
    const plan = await openDay(page, trip, 0)
    const name = await openStop(plan, 'Senso-ji')

    const unreachable = isTripPatch(trip)
    await page.route('**/api/trips/**', (route) => (unreachable(route) ? route.abort('connectionfailed') : route.fallback()))
    await name.fill('Senso-ji, kept on this device')
    await expect(saveLine(page)).toHaveText('Not saved · Couldn’t reach the server')
    await expect(page.getByRole('button', { name: 'Retry saving' })).toBeVisible()

    await markDocument(page)
    page.on('dialog', (dialog) => void (dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss()))
    await page.reload()
    expect(await sameDocument(page), 'the page really reloaded').toBe(false)

    const after = page.getByRole('region', { name: 'Day 1 plan' })
    await expect(after.getByText('Senso-ji, kept on this device', { exact: true })).toBeVisible()
    await expect(saveLine(page)).toHaveText('Not saved · Couldn’t reach the server')
    expect(titled(await readTrip(request, trip.id), 0, 'Senso-ji'), 'the server still has the old name').toBeTruthy()

    await page.unroute('**/api/trips/**')
    await expect(saveLine(page)).toHaveText('Saved', { timeout: 45_000 })
    const saved = await readTrip(request, trip.id)
    expect(itemsOf(saved, 0).map((i) => i.title)).toEqual(['Senso-ji, kept on this device'])
  } finally {
    await deleteTrip(request, trip.id)
  }
})

test('an edit made while someone else changed another day keeps both changes', async ({ page, request }) => {
  const trip = await seed(request, [
    [place('Senso-ji', ...SENSO, { time: '09:00' })],
    [place('Meiji Shrine', ...MEIJI, { time: '10:00' })],
    [],
  ])
  try {
    const plan = await openDay(page, trip, 0)
    const name = await openStop(plan, 'Senso-ji')

    await writeAsSomeoneElse(request, trip.id, (now) => ({
      days: now.days.map((d, i) => (i === 1 ? { ...d, items: [...d.items, place('Shibuya Crossing', ...SHIBUYA, { time: '15:00' })] } : d)),
    }))

    const clash = page.waitForResponse(
      (res) => res.request().method() === 'PATCH' && new URL(res.url()).pathname === tripPath(trip) && res.status() === 409,
    )
    await name.fill('Senso-ji at dawn')
    await clash
    await expect(saveLine(page)).toHaveText('Saved')

    const saved = await readTrip(request, trip.id)
    expect(itemsOf(saved, 0).map((i) => i.title), 'my edit on day 1').toEqual(['Senso-ji at dawn'])
    expect(itemsOf(saved, 1).map((i) => i.title), 'their stop on day 2').toEqual(['Meiji Shrine', 'Shibuya Crossing'])

    await page.getByRole('link', { name: /^Day 2,/ }).click()
    await expect(page.getByRole('region', { name: 'Day 2 plan' }).getByText('Shibuya Crossing', { exact: true })).toBeVisible()
  } finally {
    await deleteTrip(request, trip.id)
  }
})

test('a stop both sides renamed keeps the traveller’s name without asking', async ({ page, request }) => {
  const trip = await seed(request, [[place('Senso-ji', ...SENSO, { time: '09:00' })], [], []])
  try {
    const plan = await openDay(page, trip, 0)
    const name = await openStop(plan, 'Senso-ji')

    await writeAsSomeoneElse(request, trip.id, (now) => ({
      days: now.days.map((d, i) => (i === 0 ? { ...d, items: d.items.map((it) => ({ ...it, title: 'Senso-ji (theirs)' })) } : d)),
    }))
    await name.fill('Senso-ji (mine)')
    await expect(saveLine(page)).toHaveText('Saved')
    await expect(page.getByRole('button', { name: 'Keep mine' })).toHaveCount(0)

    const saved = await readTrip(request, trip.id)
    expect(itemsOf(saved, 0).map((i) => i.title)).toEqual(['Senso-ji (mine)'])
  } finally {
    await deleteTrip(request, trip.id)
  }
})

for (const choice of ['Keep mine', 'Use theirs'] as const) {
  test(`a day title both sides changed asks whose to keep, and "${choice}" keeps every change that doesn’t clash`, async ({
    page,
    request,
  }) => {
    const trip = await seed(request, [
      [place('Senso-ji', ...SENSO, { time: '09:00' }), place('Ueno Park', ...UENO, { time: '11:00' })],
      [place('Meiji Shrine', ...MEIJI, { time: '10:00' })],
      [],
    ])
    try {
      const plan = await openDay(page, trip, 0)

      await writeAsSomeoneElse(request, trip.id, (now) => ({
        days: now.days.map((d, i) =>
          i === 0
            ? { ...d, title: 'Their title', city: 'Asakusa' }
            : i === 1
              ? { ...d, items: [...d.items, place('Shibuya Crossing', ...SHIBUYA, { time: '15:00' })] }
              : d,
        ),
      }))

      await page.getByRole('textbox', { name: 'Day title' }).fill('My title')
      const name = await openStop(plan, 'Ueno Park')
      await name.fill('Ueno Zoo')

      const ask = page.getByRole('alert').filter({ hasText: 'Which version should stay?' })
      await expect(ask).toBeVisible()
      await expect(saveLine(page)).toHaveText('Not saved · Choose whose version to keep')
      await ask.getByRole('button', { name: choice }).click()

      await expect(saveLine(page)).toHaveText('Saved')
      await expect(ask).toBeHidden()
      const title = choice === 'Keep mine' ? 'My title' : 'Their title'
      await expect(page.getByRole('textbox', { name: 'Day title' })).toHaveValue(title)

      const saved = await readTrip(request, trip.id)
      expect(saved.days[0].title, 'the clash goes to the chosen side').toBe(title)
      expect(saved.days[0].city, 'their city on the same day').toBe('Asakusa')
      expect(itemsOf(saved, 0).map((i) => i.title), 'my rename on the same day').toEqual(['Senso-ji', 'Ueno Zoo'])
      expect(itemsOf(saved, 1).map((i) => i.title), 'their stop on day 2').toEqual(['Meiji Shrine', 'Shibuya Crossing'])
    } finally {
      await deleteTrip(request, trip.id)
    }
  })
}

test('a save the server refuses says why, offers no retry of the same thing, and the next change saves', async ({ page, request }) => {
  const full = Array.from({ length: 200 }, (_, i) => note(`Reminder ${i + 1}`))
  const trip = await seed(request, [full, [], []])
  try {
    const plan = await openDay(page, trip, 0)
    await page.getByRole('combobox', { name: 'Add a place, note or booking' }).fill('One stop too many')
    await page.getByRole('option', { name: 'Add as a note' }).click()
    await expect(plan.getByText('One stop too many', { exact: true })).toBeVisible()

    await expect(saveLine(page)).toHaveText('Not saved · The list of stops on day 1 has too many entries (200 at most).')
    await expect(page.getByRole('button', { name: 'Retry saving' })).toHaveCount(0)
    expect(itemsOf(await readTrip(request, trip.id), 0)).toHaveLength(200)

    await plan.getByText('Reminder 1', { exact: true }).click()
    await plan.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(saveLine(page)).toHaveText('Saved')

    const saved = await readTrip(request, trip.id)
    const titles = itemsOf(saved, 0).map((i) => i.title)
    expect(titles).toHaveLength(200)
    expect(titles).toContain('One stop too many')
    expect(titles).not.toContain('Reminder 1')
  } finally {
    await deleteTrip(request, trip.id)
  }
})

test('a save the server failed offers Retry, Retry sends it again, and it saves by itself once the server is back', async ({
  page,
  request,
}) => {
  const trip = await seed(request, [[place('Senso-ji', ...SENSO, { time: '09:00' })], [], []])
  try {
    const plan = await openDay(page, trip, 0)
    const name = await openStop(plan, 'Senso-ji')

    const attempts: number[] = []
    const failing = isTripPatch(trip)
    await page.route('**/api/trips/**', (route) => {
      if (!failing(route)) return route.fallback()
      attempts.push(Date.now())
      return route.fulfill({ status: 500, json: { error: 'internal_error' } })
    })
    await name.fill('Senso-ji at dawn')
    await expect(saveLine(page)).toHaveText('Not saved · The server had a problem')
    await expect.poll(() => attempts.length, { message: 'it tried again by itself', timeout: 60_000 }).toBeGreaterThanOrEqual(3)
    await expect(saveLine(page)).toHaveText('Not saved · The server had a problem')

    // The automatic retry backs off, so it never comes sooner than the wait
    // before it. A send inside that wait can only be the click.
    const tried = attempts.length
    const lastWait = attempts[tried - 1] - attempts[tried - 2]
    await page.getByRole('button', { name: 'Retry saving' }).click()
    await expect.poll(() => attempts.length, { message: 'Retry sent the save again' }).toBeGreaterThan(tried)
    expect(attempts[tried] - attempts[tried - 1], 'sent sooner than the automatic retry could have').toBeLessThan(lastWait)
    await expect(saveLine(page)).toHaveText('Not saved · The server had a problem')

    await page.unroute('**/api/trips/**')
    await expect(saveLine(page)).toHaveText('Saved', { timeout: 45_000 })
    const saved = await readTrip(request, trip.id)
    expect(itemsOf(saved, 0).map((i) => i.title)).toEqual(['Senso-ji at dawn'])
  } finally {
    await deleteTrip(request, trip.id)
  }
})

test('a traveller with view access sees the plan but no way to change it', async ({ page, request }) => {
  const trip = await seed(request, [[place('Senso-ji', ...SENSO, { time: '09:00' })], [], []])
  try {
    await page.route(
      (url) => url.pathname === tripPath(trip) || url.pathname === `/api/trips/${trip.slug}`,
      async (route) => {
        if (route.request().method() !== 'GET') return route.fallback()
        const res = await route.fetch()
        await route.fulfill({ response: res, json: { ...(await res.json()), access: 'view' } })
      },
    )
    await page.goto(`/trips/${trip.id}`)
    await expect(page.getByRole('heading', { level: 1, name: trip.name })).toBeVisible()
    await expect(page.getByText('View only', { exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Trip name' })).toHaveCount(0)
    await expect(saveLine(page)).toHaveCount(0)

    await page.getByRole('link', { name: /^Day 1,/ }).click()
    const plan = page.getByRole('region', { name: 'Day 1 plan' })
    await expect(plan.getByText('Senso-ji', { exact: true })).toBeVisible()
    await expect(saveLine(page)).toHaveCount(0)
    await expect(page.getByRole('combobox', { name: 'Add a place, note or booking' })).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: 'Day title' })).toHaveCount(0)
    await expect(plan.getByRole('button', { name: 'More for Senso-ji' })).toHaveCount(0)
    await plan.getByText('Senso-ji', { exact: true }).click()
    await expect(plan.getByRole('textbox', { name: 'Name', exact: true })).toHaveCount(0)
  } finally {
    await deleteTrip(request, trip.id)
  }
})

/** One zone per whole-hour offset, so some zone is always near late morning. */
const ZONES = [
  'Pacific/Pago_Pago',
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Halifax',
  'America/Sao_Paulo',
  'Atlantic/South_Georgia',
  'Atlantic/Azores',
  'Europe/London',
  'Europe/Paris',
  'Europe/Athens',
  'Europe/Istanbul',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Brisbane',
  'Pacific/Noumea',
  'Pacific/Tarawa',
  'Pacific/Tongatapu',
  'Pacific/Kiritimati',
]

function wallClock(zone: string, at: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at)
  const part = (type: string) => parts.find((p) => p.type === type)!.value
  return { date: `${part('year')}-${part('month')}-${part('day')}`, minutes: Number(part('hour')) * 60 + Number(part('minute')) }
}

const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

function nextDate(date: string) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * A two-day trip that is on its first day right now, in whichever zone it
 * is closest to 11:00: a stop under way, the next one, one after that, and
 * a booked dinner. Times are minutes after midnight on that day's clock.
 */
async function seedLiveTrip(request: APIRequestContext) {
  const local = ZONES.map((zone) => ({ zone, ...wallClock(zone, new Date()) })).sort(
    (x, y) => Math.abs(x.minutes - 660) - Math.abs(y.minutes - 660),
  )[0]
  const now = local.minutes
  const plan = {
    current: place('Morning market', ...SENSO, { id: itemId('current'), time: clock(now - 30), endTime: clock(now + 60) }),
    next: place('Harbour walk', ...UENO, { id: itemId('next'), time: clock(now + 90), endTime: clock(now + 150) }),
    later: place('Old town museum', ...MEIJI, { id: itemId('later'), time: clock(now + 210) }),
    dinner: place('Dinner booking', ...SHIBUYA, { id: itemId('dinner'), time: clock(now + 270), status: 'booked' }),
  }
  const trip = await seed(request, [[plan.current, plan.next, plan.later, plan.dinner], []], {
    startDate: local.date,
    endDate: nextDate(local.date),
    timezone: local.zone,
  })
  return { trip, plan, now }
}

const nowCard = (page: Page) => page.getByRole('region', { name: /^Today · Day 1 of 2$/ })

test('the Now card names the stop under way and the next one, and Done marks the current stop completed', async ({
  page,
  request,
}) => {
  const { trip, plan } = await seedLiveTrip(request)
  try {
    await page.goto(`/trips/${trip.id}`)
    const card = nowCard(page)
    await expect(card.getByRole('link', { name: 'Morning market', exact: true })).toBeVisible()
    await expect(card.getByRole('link', { name: 'Harbour walk', exact: true })).toBeVisible()

    await card.getByRole('button', { name: 'Done with Morning market' }).click()
    await expect(saveLine(page)).toHaveText('Saved')
    const saved = await readTrip(request, trip.id)
    expect(itemsOf(saved, 0).find((i) => i.id === plan.current.id)?.status).toBe('completed')
    expect(itemsOf(saved, 0).filter((i) => i.status === 'completed'), 'only that stop').toHaveLength(1)
  } finally {
    await deleteTrip(request, trip.id)
  }
})

test('Skip on the Now card marks the next stop skipped and moves on to the one after', async ({ page, request }) => {
  const { trip, plan } = await seedLiveTrip(request)
  try {
    await page.goto(`/trips/${trip.id}`)
    const card = nowCard(page)
    await card.getByRole('button', { name: 'More for Harbour walk' }).click()
    await page.getByRole('menuitem', { name: 'Skip' }).click()

    await expect(card.getByRole('link', { name: 'Old town museum', exact: true })).toBeVisible()
    await expect(saveLine(page)).toHaveText('Saved')
    const saved = await readTrip(request, trip.id)
    expect(itemsOf(saved, 0).find((i) => i.id === plan.next.id)?.status).toBe('skipped')
    expect(itemsOf(saved, 0).find((i) => i.id === plan.current.id)?.status, 'the stop under way is untouched').toBe('none')
  } finally {
    await deleteTrip(request, trip.id)
  }
})

test('Running late pushes the rest of today back, keeps bookings, and saves the new times', async ({ page, request }) => {
  const { trip, plan, now } = await seedLiveTrip(request)
  try {
    await page.goto(`/trips/${trip.id}`)
    const card = nowCard(page)
    await card.getByRole('button', { name: 'More for Harbour walk' }).click()
    await page.getByRole('menuitem', { name: 'Running late · 15 min' }).click()
    await expect(saveLine(page)).toHaveText('Saved')

    const byId = new Map(itemsOf(await readTrip(request, trip.id), 0).map((i) => [i.id, i]))
    expect(byId.get(plan.current.id), 'under way: same start, ends later').toMatchObject({ time: clock(now - 30), endTime: clock(now + 75) })
    expect(byId.get(plan.next.id)).toMatchObject({ time: clock(now + 105), endTime: clock(now + 165) })
    expect(byId.get(plan.later.id)).toMatchObject({ time: clock(now + 225) })
    expect(byId.get(plan.dinner.id), 'a booking keeps its time').toMatchObject({ time: clock(now + 270) })
  } finally {
    await deleteTrip(request, trip.id)
  }
})

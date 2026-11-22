import type { APIRequestContext, Locator, Page } from '@playwright/test'
import { expect as baseExpect, deleteTrip, itemId, place, readTrip, seedTrip, test, TOKYO, type Item, type Trip } from './fixtures'

// A loaded Vite dev server can take 20 s to serve a lazy chunk (the details
// card, the day picker) the first time; the waits allow for that.
const expect = baseExpect.configure({ timeout: 30_000 })
test.describe.configure({ timeout: 120_000 })

const SENSO_JI = { lat: 35.7148, lng: 139.7967 }
const UENO_PARK = { lat: 35.7156, lng: 139.7745 }
const SHIBUYA = { lat: 35.6595, lng: 139.7005 }
const IMPERIAL_GARDENS = { lat: 35.6852, lng: 139.7528 }

function idea(title: string, extra: Partial<Item> = {}): Item {
  return { id: itemId('idea'), kind: 'place', title, status: 'none', createdBy: 'user', ...extra }
}

function located(title: string, at: { lat: number; lng: number }, category = 'sight', extra: Partial<Item> = {}): Item {
  return { ...place(title, at.lat, at.lng), id: itemId('idea'), location: { name: title, lat: at.lat, lng: at.lng, source: 'user', category }, ...extra }
}

/** Shibuya on day 1, Ueno Park on day 2, day 3 empty: a trip the distance ranking can tell apart. */
function withStops(trip: Trip, ideas: Item[]) {
  return {
    ideas,
    days: trip.days.map((day, i) => ({
      ...day,
      items: i === 0 ? [place('Shibuya Crossing', SHIBUYA.lat, SHIBUYA.lng)] : i === 1 ? [place('Ueno Park', UENO_PARK.lat, UENO_PARK.lng, { location: { name: 'Ueno Park', lat: UENO_PARK.lat, lng: UENO_PARK.lng, source: 'user', category: 'park' } })] : [],
    })),
  }
}

const wishlist = (page: Page) => page.getByRole('tabpanel', { name: 'Wishlist' })

/**
 * Picks one of the composer's plain options by keyboard, counting up from the
 * end of the list: the highlight stays on that option when search results
 * arrive above it, so a slow place search cannot move it under a click.
 */
async function pickFromEnd(page: Page, field: Locator, stepsUp: number, name: string) {
  await field.press('ArrowUp')
  for (let i = 1; i < stepsUp; i++) await field.press('ArrowUp')
  await expect(page.getByRole('option', { name })).toHaveAttribute('aria-selected', 'true')
  await field.press('Enter')
}

function everywhere(trip: Trip, id: string): number {
  return trip.days.flatMap((d) => d.items).filter((i) => i.id === id).length + (trip.ideas ?? []).filter((i) => i.id === id).length
}

/** The server copy once it satisfies `check`: the fixture's `serverTrip`, with the same allowance. */
async function stored(request: APIRequestContext, id: string, check: (trip: Trip) => boolean, message: string): Promise<Trip> {
  let last: Trip | undefined
  await expect
    .poll(
      async () => {
        last = await readTrip(request, id)
        return check(last)
      },
      { message, timeout: 30_000 },
    )
    .toBe(true)
  return last!
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

test.describe('wishlist', () => {
  test('a place found by search saves to the wishlist with a pin on the map', async ({ page, request }) => {
    const trip = await seedTrip(request)
    try {
      await page.goto(`/trips/${trip.id}?tab=wishlist`)
      const field = wishlist(page).getByRole('combobox', { name: 'Save a place for later' })
      await field.fill('Senso-ji')
      const found = page.getByRole('option').filter({ hasNotText: 'without a pin' }).first()
      await expect(found, 'the search found the place').toBeVisible()
      await found.click()

      const server = await stored(request, trip.id, (t) => (t.ideas ?? []).length === 1, 'the idea reached the server')
      const kept = server.ideas![0]
      expect(kept.kind).toBe('place')
      expect(kept.location?.lat, 'it carries a point').toEqual(expect.any(Number))
      expect(Math.abs(kept.location!.lat! - TOKYO.lat) + Math.abs(kept.location!.lng! - TOKYO.lng), 'the point is in Tokyo').toBeLessThan(0.5)
      expect(server.days.every((d) => d.items.length === 0), 'no day gained it').toBe(true)

      await expect(wishlist(page).getByRole('button', { name: kept.title, exact: true })).toBeVisible()
      await expect(page.getByRole('region', { name: /and 1 wishlist place$/ })).toBeVisible()
      await expect(page.getByRole('button', { name: `${kept.title}, on the wishlist` })).toBeAttached()

      await page.reload()
      await expect(wishlist(page).getByRole('button', { name: kept.title, exact: true })).toBeVisible()
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('plain text saves to the wishlist without a pin', async ({ page, request }) => {
    const trip = await seedTrip(request, { patch: () => ({ ideas: [located('Imperial Palace East Gardens', IMPERIAL_GARDENS)] }) })
    const title = 'Grandmas secret noodle counter'
    try {
      await page.goto(`/trips/${trip.id}?tab=wishlist`)
      const field = wishlist(page).getByRole('combobox', { name: 'Save a place for later' })
      await field.fill(title)
      await pickFromEnd(page, field, 1, `Add “${title}” without a pin`)

      await expect(wishlist(page).getByRole('button', { name: title, exact: true })).toBeVisible()
      const server = await stored(request, trip.id, (t) => (t.ideas ?? []).some((i) => i.title === title), 'the idea reached the server')
      const kept = server.ideas!.find((i) => i.title === title)!
      expect(kept.location?.name).toBe(title)
      expect(kept.location?.lat, 'no point').toBeUndefined()

      await expect(page.getByRole('region', { name: /and 1 wishlist place$/ }), 'only the located idea is pinned').toBeVisible()
      await expect(page.getByRole('button', { name: 'Imperial Palace East Gardens, on the wishlist' })).toBeAttached()
      await expect(page.getByRole('button', { name: `${title}, on the wishlist` })).toHaveCount(0)
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('an idea filed under another category keeps it, and Automatic takes it back', async ({ page, request }) => {
    const market = located('Tsukiji Outer Market', { lat: 35.6655, lng: 139.7707 }, 'market')
    const trip = await seedTrip(request, { patch: () => ({ ideas: [market, located('Ueno Zoo', UENO_PARK, 'zoo')] }) })
    try {
      await page.goto(`/trips/${trip.id}?tab=wishlist`)
      const list = wishlist(page)
      await list.getByRole('button', { name: /^Category for Tsukiji Outer Market: .+ \(automatic\)$/ }).click()
      await page.getByRole('menuitem', { name: 'Shopping' }).click()
      await expect(list.getByRole('button', { name: 'Category for Tsukiji Outer Market: Shopping' })).toBeVisible()
      await stored(request, trip.id, (t) => t.ideas?.find((i) => i.id === market.id)?.theme === 'shopping', 'the category reached the server')

      await page.reload()
      await expect(list.getByRole('button', { name: 'Category for Tsukiji Outer Market: Shopping' })).toBeVisible()

      await list.getByRole('button', { name: 'Category for Tsukiji Outer Market: Shopping' }).click()
      await page.getByRole('menuitem', { name: /^Automatic/ }).click()
      await expect(list.getByRole('button', { name: /^Category for Tsukiji Outer Market: .+ \(automatic\)$/ })).toBeVisible()
      const back = await stored(request, trip.id, (t) => t.ideas?.find((i) => i.id === market.id)?.theme === undefined, 'automatic cleared the stored category')
      expect(back.ideas).toHaveLength(2)
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('the details card files an idea under a category too', async ({ page, request }) => {
    const zoo = located('Ueno Zoo', UENO_PARK, 'zoo')
    const trip = await seedTrip(request, { patch: () => ({ ideas: [zoo] }) })
    try {
      await page.goto(`/trips/${trip.id}?tab=wishlist`)
      await wishlist(page).getByRole('button', { name: 'Ueno Zoo', exact: true }).click()
      const card = page.getByRole('dialog', { name: 'Ueno Zoo' })
      await card.getByRole('combobox', { name: /^Category for Ueno Zoo:/ }).selectOption({ label: 'Nature & outdoors' })
      await expect(card.getByRole('combobox', { name: 'Category for Ueno Zoo: Nature & outdoors' })).toBeVisible()
      await stored(request, trip.id, (t) => t.ideas?.[0]?.theme === 'nature', 'the category reached the server')
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('a type chip shows only that category, and offers Show all once it empties', async ({ page, request }) => {
    const garden = idea('Shinjuku Gyoen', { theme: 'nature' })
    const trip = await seedTrip(request, {
      patch: () => ({ ideas: [idea('Ichiran Ramen', { theme: 'food' }), idea('Afuri Ramen', { theme: 'food' }), garden] }),
    })
    try {
      await page.goto(`/trips/${trip.id}?tab=wishlist`)
      const list = wishlist(page)
      const chips = list.getByRole('group', { name: 'Show by type' })
      await expect(chips.getByRole('button', { name: 'All, 3 places' })).toHaveAttribute('aria-pressed', 'true')
      await expect(chips.getByRole('button', { name: 'Food & cafés, 2 places' })).toBeVisible()

      await chips.getByRole('button', { name: 'Nature & outdoors, 1 place' }).click()
      await expect(chips.getByRole('button', { name: 'Nature & outdoors, 1 place' })).toHaveAttribute('aria-pressed', 'true')
      const shown = list.getByRole('list', { name: '1 place in Nature & outdoors' })
      await expect(shown.getByRole('button', { name: 'Shinjuku Gyoen', exact: true })).toBeVisible()
      await expect(list.getByRole('button', { name: 'Ichiran Ramen', exact: true })).toHaveCount(0)
      await expect(list.getByRole('button', { name: 'Afuri Ramen', exact: true })).toHaveCount(0)

      await list.getByRole('button', { name: 'Category for Shinjuku Gyoen: Nature & outdoors' }).click()
      await page.getByRole('menuitem', { name: 'Food & cafés' }).click()
      await expect(list.getByText('Nothing under Nature & outdoors now.')).toBeVisible()
      await expect(chips.getByRole('button', { name: 'Food & cafés, 3 places' })).toBeVisible()
      await list.getByRole('button', { name: 'Show all' }).click()
      await expect(list.getByRole('list', { name: '3 places on the wishlist' })).toBeVisible()
      await stored(request, trip.id, (t) => t.ideas?.find((i) => i.id === garden.id)?.theme === 'food', 'the new category reached the server')
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('a removed idea leaves the wishlist and the server copy', async ({ page, request }) => {
    const gone = idea('Afuri Ramen', { theme: 'food' })
    const trip = await seedTrip(request, { patch: () => ({ ideas: [idea('Ichiran Ramen', { theme: 'food' }), gone] }) })
    try {
      await page.goto(`/trips/${trip.id}?tab=wishlist`)
      await wishlist(page).getByRole('button', { name: 'Remove Afuri Ramen' }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Removed “Afuri Ramen” from the wishlist' }), 'the undo toast, which leaves after 12 s').toBeVisible()
      await expect(wishlist(page).getByRole('button', { name: 'Afuri Ramen', exact: true })).toHaveCount(0)
      const server = await stored(request, trip.id, (t) => !(t.ideas ?? []).some((i) => i.id === gone.id), 'the removal reached the server')
      expect(server.ideas!.map((i) => i.title)).toEqual(['Ichiran Ramen'])

      await page.reload()
      await expect(wishlist(page).getByRole('button', { name: 'Ichiran Ramen', exact: true })).toBeVisible()
      await expect(wishlist(page).getByRole('button', { name: 'Afuri Ramen', exact: true })).toHaveCount(0)
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('a wishlist row opens its details beside it; Back closes them and Back again leaves the trip', async ({ page, request }) => {
    const senso = located('Senso-ji', SENSO_JI, 'temple')
    const trip = await seedTrip(request, { patch: (t) => withStops(t, [senso, located('Imperial Palace East Gardens', IMPERIAL_GARDENS)]) })
    try {
      await page.goto('/trips')
      await page.goto(`/trips/${trip.id}?tab=wishlist`)
      await wishlist(page).getByRole('button', { name: 'Senso-ji', exact: true }).click()

      const card = page.getByRole('dialog', { name: 'Senso-ji' })
      await expect(card).toBeVisible()
      await expect(page).toHaveURL(new RegExp(`[?&]idea=${escape(senso.id)}(&|$)`))
      await expect(card, 'a popover, not a modal sheet').toHaveAttribute('aria-modal', 'false')
      await expect(wishlist(page).getByRole('button', { name: 'Remove Imperial Palace East Gardens' }), 'the list stays usable').toBeVisible()

      await page.goBack()
      await expect(card).toBeHidden()
      await expect(page).toHaveURL(new RegExp(`/trips/${escape(trip.id)}\\?tab=wishlist$`))

      await page.goBack()
      await expect(page).toHaveURL(/\/trips$/)
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('closing details opened from a row leaves one Back to leave the trip', async ({ page, request }) => {
    const senso = located('Senso-ji', SENSO_JI, 'temple')
    const trip = await seedTrip(request, { patch: () => ({ ideas: [senso] }) })
    try {
      await page.goto('/trips')
      await page.goto(`/trips/${trip.id}?tab=wishlist`)
      await wishlist(page).getByRole('button', { name: 'Senso-ji', exact: true }).click()
      const card = page.getByRole('dialog', { name: 'Senso-ji' })
      await card.getByRole('button', { name: 'Close' }).click()
      await expect(card).toBeHidden()
      await expect(page).toHaveURL(new RegExp(`/trips/${escape(trip.id)}\\?tab=wishlist$`))

      await page.goBack()
      await expect(page).toHaveURL(/\/trips$/)
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('a pasted ?idea= link opens that idea as a sheet, and closing it stays on the trip', async ({ page, request }) => {
    const senso = located('Senso-ji', SENSO_JI, 'temple')
    const trip = await seedTrip(request, { patch: () => ({ ideas: [senso, located('Ueno Zoo', UENO_PARK, 'zoo')] }) })
    try {
      await page.goto('/trips')
      await page.goto(`/trips/${trip.id}?tab=wishlist&idea=${senso.id}`)
      const sheet = page.getByRole('dialog', { name: 'Senso-ji' })
      await expect(sheet).toBeVisible()
      await expect(sheet, 'a sheet, not a popover').not.toHaveAttribute('aria-modal', 'false')
      await expect(page.getByRole('button', { name: 'Remove Ueno Zoo' }), 'the page behind the sheet is out of reach').toHaveCount(0)

      await sheet.getByRole('button', { name: 'Close' }).click()
      await expect(sheet).toBeHidden()
      await expect(page).toHaveURL(new RegExp(`/trips/${escape(trip.id)}\\?tab=wishlist$`))
      await expect(wishlist(page).getByRole('button', { name: 'Senso-ji', exact: true })).toBeVisible()
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('on a phone a wishlist row opens its details as a sheet that Back closes', async ({ page, request }) => {
    const senso = located('Senso-ji', SENSO_JI, 'temple')
    const trip = await seedTrip(request, { patch: () => ({ ideas: [senso, located('Ueno Zoo', UENO_PARK, 'zoo')] }) })
    try {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(`/trips/${trip.id}?tab=wishlist`)
      await wishlist(page).getByRole('button', { name: 'Senso-ji', exact: true }).click()
      const sheet = page.getByRole('dialog', { name: 'Senso-ji' })
      await expect(sheet).toBeVisible()
      await expect(sheet, 'a sheet, not a popover').not.toHaveAttribute('aria-modal', 'false')
      await expect(page).toHaveURL(new RegExp(`[?&]idea=${escape(senso.id)}(&|$)`))

      await page.goBack()
      await expect(sheet).toBeHidden()
      await expect(page).toHaveURL(new RegExp(`/trips/${escape(trip.id)}\\?tab=wishlist$`))
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('a wishlist pin on the map opens the same details', async ({ page, request }) => {
    const gardens = located('Imperial Palace East Gardens', IMPERIAL_GARDENS)
    const trip = await seedTrip(request, { patch: (t) => withStops(t, [gardens, idea('Noodle stall nobody can find')]) })
    try {
      await page.goto(`/trips/${trip.id}`)
      const map = page.getByRole('region', { name: /and 1 wishlist place$/ })
      await expect(map, 'only the located idea is pinned').toBeVisible()
      await expect(page.getByRole('button', { name: 'Noodle stall nobody can find, on the wishlist' })).toHaveCount(0)
      // While the map loads, its painted stand-in draws the same pins; wait for the live map so one pin answers.
      await expect(map.getByRole('button', { name: 'Zoom in' })).toBeVisible()
      await map.getByRole('button', { name: 'Imperial Palace East Gardens, on the wishlist' }).click()

      const sheet = page.getByRole('dialog', { name: 'Imperial Palace East Gardens' })
      await expect(sheet).toBeVisible()
      await expect(sheet, 'a map pin opens a sheet').not.toHaveAttribute('aria-modal', 'false')
      await expect(page).toHaveURL(new RegExp(`[?&]idea=${escape(gardens.id)}(&|$)`))
      await expect(sheet.getByRole('button', { name: 'Add to day' })).toBeVisible()
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('an idea scheduled from the recommended days lands on that day and leaves the wishlist', async ({ page, request }) => {
    const senso = located('Senso-ji', SENSO_JI, 'temple')
    const trip = await seedTrip(request, { patch: (t) => withStops(t, [senso, located('Imperial Palace East Gardens', IMPERIAL_GARDENS)]) })
    try {
      await page.goto(`/trips/${trip.id}?tab=wishlist`)
      const suggested = page.waitForResponse((r) => r.url().endsWith(`/api/trips/${trip.id}/ideas/suggest-days`))
      await wishlist(page).getByRole('button', { name: 'Add to day: Senso-ji' }).click()
      await expect(page).toHaveURL(new RegExp(`[?&]idea=${escape(senso.id)}&add=1`))

      const answer = await suggested
      expect(answer.status(), 'suggest-days answers without an AI key').toBe(200)
      const body = (await answer.json()) as { source: string; picks: { dayId: string; reason: string }[] }
      expect(body.source, 'the distance ranking').toBe('nearby')
      expect(body.picks[0]?.dayId, 'Ueno Park day is nearest').toBe(trip.days[1].id)

      const picker = page.getByRole('dialog', { name: 'Add “Senso-ji” to a day' })
      const recommended = picker.getByRole('region', { name: 'Recommended' })
      const best = recommended.getByRole('button').first()
      await expect(best).toContainText('Day 2')
      await expect(best).toContainText('2.0 km from Ueno Park')
      await expect(picker.getByText('Suggested by AI'), 'no AI label on the fallback').toHaveCount(0)
      await expect(picker.getByRole('button', { name: /^Day 3/ }).last(), 'every day is still offered').toBeEnabled()

      await best.click()
      await expect(page.getByRole('status').filter({ hasText: 'Added “Senso-ji” to day 2' }), 'the undo toast, which leaves after 12 s').toBeVisible()
      await expect(picker).toBeHidden()
      await expect(page).not.toHaveURL(/[?&]idea=/)
      await expect(wishlist(page).getByRole('button', { name: 'Senso-ji', exact: true })).toHaveCount(0)

      const server = await stored(
        request,
        trip.id,
        (t) => t.days[1].items.some((i) => i.title === 'Senso-ji') && !(t.ideas ?? []).some((i) => i.title === 'Senso-ji'),
        'the idea moved to day 2 on the server',
      )
      const moved = server.days[1].items.find((i) => i.title === 'Senso-ji')!
      expect(everywhere(server, moved.id), 'on a day or on the wishlist, never both').toBe(1)
      expect(moved.location).toMatchObject({ lat: SENSO_JI.lat, lng: SENSO_JI.lng })
      expect(server.ideas!.map((i) => i.title)).toEqual(['Imperial Palace East Gardens'])

      await page.goto(`/trips/${trip.id}/day/${trip.days[1].id}`)
      await expect(page.getByRole('region', { name: 'Day 2 plan' }).getByText('Senso-ji')).toBeVisible()
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('Cancel in a day picker opened from the details goes back to the details', async ({ page, request }) => {
    const senso = located('Senso-ji', SENSO_JI, 'temple')
    const trip = await seedTrip(request, { patch: (t) => withStops(t, [senso]) })
    try {
      await page.goto(`/trips/${trip.id}?tab=wishlist`)
      await wishlist(page).getByRole('button', { name: 'Senso-ji', exact: true }).click()
      const card = page.getByRole('dialog', { name: 'Senso-ji' })
      await card.getByRole('button', { name: 'Add to day' }).click()

      const picker = page.getByRole('dialog', { name: 'Add “Senso-ji” to a day' })
      await expect(picker).toBeVisible()
      await expect(page).toHaveURL(/&add=1/)
      await picker.getByRole('button', { name: 'Close' }).click()

      await expect(picker).toBeHidden()
      await expect(card).toBeVisible()
      await expect(page).not.toHaveURL(/[?&]add=/)
      await expect(page).toHaveURL(new RegExp(`[?&]idea=${escape(senso.id)}(&|$)`))
      expect((await readTrip(request, trip.id)).ideas!.map((i) => i.id), 'nothing scheduled').toEqual([senso.id])

      await page.goBack()
      await expect(card).toBeHidden()
      await expect(page).not.toHaveURL(/[?&]idea=/)
    } finally {
      await deleteTrip(request, trip.id)
    }
  })
})

test.describe('bookings by hand', () => {
  async function addBooking(page: Page, title: string) {
    const field = page.getByRole('combobox', { name: 'Add a place, note or booking' })
    await field.fill(title)
    await pickFromEnd(page, field, 2, 'Add as a booking')
    const plan = page.getByRole('region', { name: 'Day 1 plan' })
    await plan.getByRole('button', { name: new RegExp(`^${escape(title)}`), expanded: false }).click()
    return plan
  }

  async function fillTime(page: Page, label: string, value: string) {
    const field = page.getByLabel(label, { exact: true })
    await field.fill(value)
    await field.press('Tab')
  }

  test('a flight added from the composer saves its airline, number, route and confirmation', async ({ page, request }) => {
    const trip = await seedTrip(request)
    try {
      await page.goto(`/trips/${trip.id}/day/${trip.days[0].id}`)
      const plan = await addBooking(page, 'Korean Air to Tokyo')
      await plan.getByRole('combobox', { name: 'Type', exact: true }).selectOption({ label: 'Flight' })
      await plan.getByLabel('Airline', { exact: true }).fill('Korean Air')
      await plan.getByLabel('Flight number', { exact: true }).fill('KE 703')
      const from = plan.getByLabel('From', { exact: true })
      await from.fill('icn')
      await from.press('Tab')
      await expect(from, 'an airport code reads in capitals').toHaveValue('ICN')
      await plan.getByLabel('To', { exact: true }).fill('NRT')
      await fillTime(page, 'Departs', '9:10 AM')
      await fillTime(page, 'Lands', '11:35 AM')
      await plan.getByLabel('Confirmation', { exact: true }).fill('K7XQ2P')

      const server = await stored(
        request,
        trip.id,
        (t) => t.days[0].items.some((i) => i.reservation?.confirmation === 'K7XQ2P' && i.endTime === '11:35'),
        'the flight reached the server',
      )
      const flight = server.days[0].items.find((i) => i.title === 'Korean Air to Tokyo')!
      expect(flight.kind).toBe('reservation')
      expect(flight.time).toBe('09:10')
      expect(flight.reservation).toMatchObject({ type: 'flight', provider: 'Korean Air', number: 'KE 703', from: 'ICN', to: 'NRT', confirmation: 'K7XQ2P' })

      await page.goto(`/trips/${trip.id}`)
      const bookings = page.getByRole('region', { name: /^Bookings/ })
      const entry = bookings.getByRole('link', { name: /Korean Air to Tokyo/ })
      await expect(entry).toContainText('KE 703')
      await expect(entry).toContainText('ICN → NRT')
      await expect(entry).toContainText('lands 11:35')
      await expect(entry).toContainText('K7XQ2P')
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('a hotel added from the composer is where you sleep each night until check-out', async ({ page, request }) => {
    const trip = await seedTrip(request)
    try {
      await page.goto(`/trips/${trip.id}/day/${trip.days[0].id}`)
      const plan = await addBooking(page, 'Park Hyatt Tokyo')
      await plan.getByRole('combobox', { name: 'Type', exact: true }).selectOption({ label: 'Stay' })
      await fillTime(page, 'Check-in', '3:00 PM')
      await plan.getByRole('combobox', { name: 'Check-out', exact: true }).selectOption({ label: 'Wed 3 Mar · 2 nights' })
      await fillTime(page, 'Check-out time', '11:00 AM')
      await plan.getByLabel('Booked with', { exact: true }).fill('Booking.com')
      await plan.getByLabel('Confirmation', { exact: true }).fill('88412907')

      const server = await stored(
        request,
        trip.id,
        (t) => t.days[0].items.some((i) => i.reservation?.confirmation === '88412907' && i.endTime === '11:00'),
        'the stay reached the server',
      )
      const stay = server.days[0].items.find((i) => i.title === 'Park Hyatt Tokyo')!
      expect(stay.time).toBe('15:00')
      expect(stay.reservation).toMatchObject({ type: 'hotel', endDate: '2027-03-03', provider: 'Booking.com', confirmation: '88412907' })

      const tonight = (text: string) => page.getByRole('paragraph').filter({ hasText: text })
      await expect(tonight('Sleeping at Park Hyatt Tokyo')).toContainText('night 1 of 2')

      await page.getByRole('link', { name: /^Day 2,/ }).click()
      await expect(tonight('Sleeping at Park Hyatt Tokyo')).toContainText('night 2 of 2')
      await page.reload()
      await expect(tonight('Sleeping at Park Hyatt Tokyo'), 'still there after a reload').toContainText('night 2 of 2')

      await page.getByRole('link', { name: /^Day 3,/ }).click()
      await expect(tonight('Check out of Park Hyatt Tokyo')).toContainText('by 11:00')
      await expect(tonight('Sleeping at'), 'no night booked on the last day').toHaveCount(0)

      await page.goto(`/trips/${trip.id}`)
      const entry = page.getByRole('region', { name: /^Bookings/ }).getByRole('link', { name: /Park Hyatt Tokyo/ })
      await expect(entry).toContainText('2 nights')
      await expect(entry).toContainText('Check-out Wed 3 Mar, 11:00')
      await expect(entry).toContainText('Booked with Booking.com')
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('the paste sheet says reading confirmations is not set up and writes nothing', async ({ page, request }) => {
    const trip = await seedTrip(request, { patch: (t) => withStops(t, []) })
    const before = await readTrip(request, trip.id)
    const text = 'Korean Air KE703 ICN to NRT, 1 March 2027 09:10. Confirmation K7XQ2P'
    try {
      await page.goto(`/trips/${trip.id}`)
      await page.getByRole('button', { name: 'Add booking' }).click()
      await page.getByRole('menuitem', { name: 'Paste a confirmation' }).click()
      const sheet = page.getByRole('dialog', { name: 'Paste a confirmation' })
      const field = sheet.getByLabel('Confirmation email or page')
      await field.fill(text)

      const parsed = page.waitForResponse((r) => r.url().endsWith(`/api/trips/${trip.id}/bookings/parse`))
      await sheet.getByRole('button', { name: 'Find bookings' }).click()
      const answer = await parsed
      expect(answer.status()).toBe(503)
      expect(((await answer.json()) as { error: string }).error).toBe('ai_not_configured')

      await expect(sheet.getByRole('alert')).toHaveText('Reading confirmations isn’t set up on this server. Add the booking by hand instead.')
      await expect(field, 'the paste is kept').toHaveValue(text)
      await sheet.getByRole('button', { name: 'Cancel' }).click()
      await expect(sheet).toBeHidden()

      const after = await readTrip(request, trip.id)
      expect(after.days, 'no booking was added').toEqual(before.days)
      expect(after.days.flatMap((d) => d.items).filter((i) => i.kind === 'reservation')).toEqual([])
    } finally {
      await deleteTrip(request, trip.id)
    }
  })
})

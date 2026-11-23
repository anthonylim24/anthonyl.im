import type { APIRequestContext, Locator, Page } from '@playwright/test'
import { TOKYO, deleteTrip, expect as baseExpect, itemId, note, pickOption, place, readTrip, seedTrip, test, uniqueName, type Item, type Trip } from './fixtures'

// On a loaded machine a page can take several seconds to load or to send its autosave.
test.describe.configure({ timeout: 120_000 })
test.use({ actionTimeout: 30_000, navigationTimeout: 60_000 })
const expect = baseExpect.configure({ timeout: 20_000 })

/** The server copy once it satisfies `check`. */
async function serverTrip(request: APIRequestContext, id: string, check: (trip: Trip) => boolean, message: string): Promise<Trip> {
  let last: Trip | undefined
  await expect.poll(async () => check((last = await readTrip(request, id))), { message, timeout: 30_000 }).toBe(true)
  return last!
}

/** A patch that puts `days[i]` on the trip's i-th day. */
const withDays = (days: Item[][]) => (trip: Trip) => ({ days: trip.days.map((day, i) => ({ ...day, items: days[i] ?? [] })) })

const dayUrl = (trip: Trip, index: number) => `/trips/${trip.id}/day/${trip.days[index].id}`
const titles = (items: Item[]) => items.map((item) => item.title)
const findItem = (trip: Trip, id: string) => trip.days.flatMap((day) => day.items).find((item) => item.id === id)
const planOf = (page: Page, dayNumber: number) => page.getByRole('region', { name: `Day ${dayNumber} plan` })
const composerOf = (page: Page) => page.getByRole('combobox', { name: 'Add a place, note or booking' })
/** A stop's row in the list, its editor included. Scoped by id, so a rename does not lose it. */
const stopOf = (page: Page, id: string) => page.locator(`#item-${id}`)
/** The stop's header button: the only button in the row whose text is the title (the pin shows a number). */
const headOf = (stop: Locator, title: string) => stop.getByRole('button').filter({ hasText: title })
const toast = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text })

/**
 * Opens a day once its weather band has settled. The band holds its space while
 * the weather loads and collapses when none comes back, which moves the stops
 * under a click already on its way.
 */
async function openDay(page: Page, trip: Trip) {
  await page.goto(dayUrl(trip, 0))
  await expect(planOf(page, 1)).toBeVisible()
  await expect(page.getByLabel('Loading the forecast')).toHaveCount(0)
}

function isoFromToday(offset: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

test.describe('day composer', () => {
  test('a place picked from the search results is pinned on the map and saved with its coordinates', async ({ page, request }) => {
    const trip = await seedTrip(request, { name: uniqueName('composer pin') })
    try {
      await openDay(page, trip)
      await composerOf(page).fill('Senso-ji')
      // Until the search answers, the first option is the typed text "without a pin".
      const result = page.getByRole('option', { name: /^(?!Add (“|as ))/ }).first()
      await expect(result).toBeVisible({ timeout: 30_000 })
      await result.click()

      const saved = await serverTrip(
        request,
        trip.id,
        (t) => t.days[0].items.length === 1 && Number.isFinite(t.days[0].items[0].location?.lat) && Number.isFinite(t.days[0].items[0].location?.lng),
        'the picked place reached the server with a pin',
      )
      const stop = saved.days[0].items[0]
      expect(stop.kind).toBe('place')
      expect(stop.location).toMatchObject({ name: stop.title, source: 'user' })
      expect(Math.abs(stop.location!.lat! - TOKYO.lat), 'the result is the one near the trip').toBeLessThan(1)
      expect(Math.abs(stop.location!.lng! - TOKYO.lng), 'the result is the one near the trip').toBeLessThan(1)

      const plan = planOf(page, 1)
      await expect(plan.getByRole('button', { name: `Show ${stop.title} on the map` })).toHaveText('1')
      await expect(page.getByRole('region', { name: 'Map of day 1 with 1 pinned stop' })).toBeVisible()

      await page.reload()
      await expect(planOf(page, 1).getByRole('button', { name: `Show ${stop.title} on the map` })).toBeVisible()
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('text added "without a pin" saves as a stop with a name and no coordinates', async ({ page, request }) => {
    const trip = await seedTrip(request, { name: uniqueName('composer no pin') })
    const title = 'Grandma Kiyo ramen counter'
    try {
      await openDay(page, trip)
      await composerOf(page).fill(title)
      await page.getByRole('option', { name: `Add “${title}” without a pin` }).click()

      const plan = planOf(page, 1)
      await expect(plan.getByText(title)).toBeVisible()
      const saved = await serverTrip(request, trip.id, (t) => t.days[0].items.some((i) => i.title === title), 'the unpinned stop reached the server')
      const stop = saved.days[0].items.find((i) => i.title === title)!
      expect(stop.kind).toBe('place')
      expect(stop.location).toEqual({ name: title, source: 'user' })
      await expect(plan.getByRole('button', { name: /on the map$/ })).toHaveCount(0)
      await expect(page.getByRole('region', { name: 'Map of day 1 with 0 pinned stops' })).toBeVisible()

      await page.reload()
      await expect(planOf(page, 1).getByText(title)).toBeVisible()
      await expect(planOf(page, 1).getByRole('button', { name: /on the map$/ })).toHaveCount(0)
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('a heading added from the composer saves as a heading and stays editable', async ({ page, request }) => {
    const trip = await seedTrip(request, { name: uniqueName('composer heading') })
    try {
      await openDay(page, trip)
      await composerOf(page).fill('Evening in Shinjuku')
      await page.getByRole('option', { name: 'Add as a heading' }).click()

      await expect(planOf(page, 1).getByRole('textbox', { name: 'Heading' })).toHaveValue('Evening in Shinjuku')
      await serverTrip(
        request,
        trip.id,
        (t) => t.days[0].items.some((i) => i.kind === 'section' && i.title === 'Evening in Shinjuku'),
        'the heading reached the server',
      )

      await page.reload()
      await expect(planOf(page, 1).getByRole('textbox', { name: 'Heading' })).toHaveValue('Evening in Shinjuku')
    } finally {
      await deleteTrip(request, trip.id)
    }
  })
})

test.describe('editing a stop', () => {
  test('a stop’s name, start and end time, notes and cost save and survive a reload', async ({ page, request }) => {
    const market = place('Tsukiji Outer Market', 35.6655, 139.7707)
    const trip = await seedTrip(request, { name: uniqueName('edit stop'), patch: withDays([[market]]) })
    const renamed = 'Tsukiji breakfast crawl'
    try {
      await openDay(page, trip)
      const stop = stopOf(page, market.id)
      await headOf(stop, market.title).click()

      await stop.getByLabel('Name', { exact: true }).fill(renamed)
      const starts = stop.getByLabel('Starts')
      await starts.fill('8:30a')
      await starts.press('Enter')
      await expect(starts).toHaveValue('8:30 AM')
      await stop.getByRole('button', { name: 'Add end time' }).click()
      const ends = stop.getByLabel('Ends')
      await ends.fill('10:15')
      await ends.press('Enter')
      await expect(ends).toHaveValue('10:15 AM')
      await stop.getByLabel('Notes').fill('Tamagoyaki at the corner stall')
      await pickOption(stop.getByLabel('Cost currency'), /^USD · /)
      const cost = stop.getByLabel('Cost', { exact: true })
      await cost.fill('12.50')
      await cost.blur()

      await expect(headOf(stop, renamed)).toContainText('8:30 AM')
      const saved = await serverTrip(
        request,
        trip.id,
        (t) => findItem(t, market.id)?.cost?.currency === 'USD' && findItem(t, market.id)?.notes !== undefined,
        'the edits reached the server',
      )
      expect(findItem(saved, market.id)).toMatchObject({
        title: renamed,
        time: '08:30',
        endTime: '10:15',
        notes: 'Tamagoyaki at the corner stall',
        cost: { amount: 12.5, currency: 'USD' },
      })

      await page.reload()
      const again = stopOf(page, market.id)
      await headOf(again, renamed).click()
      await expect(again.getByLabel('Name', { exact: true })).toHaveValue(renamed)
      await expect(again.getByLabel('Starts')).toHaveValue('8:30 AM')
      await expect(again.getByLabel('Ends')).toHaveValue('10:15 AM')
      await expect(again.getByLabel('Notes')).toHaveValue('Tamagoyaki at the corner stall')
      await expect(again.getByLabel('Cost', { exact: true })).toHaveValue(/^12\.50?$/)
      await expect(again.getByLabel('Cost currency')).toHaveText('USD')
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('a stop set to Skipped leaves the route’s numbering, saves, and stays skipped after a reload', async ({ page, request }) => {
    const first = place('Ueno Park', 35.7156, 139.7745)
    const second = place('Ameyoko', 35.7101, 139.7745)
    const trip = await seedTrip(request, { name: uniqueName('skip stop'), patch: withDays([[first, second]]) })
    try {
      await openDay(page, trip)
      const stop = stopOf(page, first.id)
      await headOf(stop, first.title).click()
      await pickOption(stop.getByLabel('Status'), 'Skipped')

      const plan = planOf(page, 1)
      await expect(headOf(stop, first.title)).toContainText('Skipped')
      await expect(plan.getByRole('button', { name: `Show ${first.title} on the map` })).toHaveCount(0)
      await expect(plan.getByRole('button', { name: `Show ${second.title} on the map` })).toHaveText('1')
      await serverTrip(request, trip.id, (t) => findItem(t, first.id)?.status === 'skipped', 'the skipped status reached the server')

      await page.reload()
      await expect(headOf(stopOf(page, first.id), first.title)).toContainText('Skipped')
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('on a day that has been, Skip and Loved it on a stop save and show in the day’s journal', async ({ page, request }) => {
    const sky = place('Shibuya Sky', 35.6585, 139.7023)
    const trip = await seedTrip(request, {
      name: uniqueName('lived day'),
      startDate: isoFromToday(-6),
      endDate: isoFromToday(-4),
      patch: withDays([[sky]]),
    })
    try {
      await openDay(page, trip)
      const how = page.getByRole('group', { name: `How ${sky.title} went` })
      await how.getByRole('button', { name: 'Loved it' }).click()
      await how.getByRole('button', { name: 'Skip' }).click()

      await expect(how.getByRole('button', { name: 'Loved it' })).toHaveAttribute('aria-pressed', 'true')
      await expect(how.getByRole('button', { name: 'Skip' })).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByRole('list', { name: 'Loved it' })).toContainText(sky.title)
      await serverTrip(
        request,
        trip.id,
        (t) => findItem(t, sky.id)?.highlight === true && findItem(t, sky.id)?.status === 'skipped',
        'Loved it and Skip reached the server',
      )

      await page.reload()
      const after = page.getByRole('group', { name: `How ${sky.title} went` })
      await expect(after.getByRole('button', { name: 'Loved it' })).toHaveAttribute('aria-pressed', 'true')
      await expect(after.getByRole('button', { name: 'Skip' })).toHaveAttribute('aria-pressed', 'true')
    } finally {
      await deleteTrip(request, trip.id)
    }
  })
})

test.describe('ordering and moving stops', () => {
  test('Alt+Down and Alt+Up on a stop reorder the day, announce it, keep focus, and save the order', async ({ page, request }) => {
    const [gate, temple, street] = [note('Kaminarimon gate'), note('Senso-ji temple'), note('Nakamise street')]
    const trip = await seedTrip(request, { name: uniqueName('keyboard reorder'), patch: withDays([[gate, temple, street]]) })
    try {
      await openDay(page, trip)
      const plan = planOf(page, 1)
      const row = headOf(stopOf(page, gate.id), gate.title)
      await row.focus()

      await page.keyboard.press('Alt+ArrowDown')
      await expect(plan.getByRole('listitem')).toHaveText([/Senso-ji temple/, /Kaminarimon gate/, /Nakamise street/])
      await expect(page.getByRole('status').filter({ hasText: 'Kaminarimon gate moved down, now 2 of 3.' })).toHaveCount(1)
      await expect(row, 'the moved stop keeps keyboard focus').toBeFocused()

      await page.keyboard.press('Alt+ArrowDown')
      await expect(plan.getByRole('listitem')).toHaveText([/Senso-ji temple/, /Nakamise street/, /Kaminarimon gate/])
      await page.keyboard.press('Alt+ArrowUp')
      await expect(plan.getByRole('listitem')).toHaveText([/Senso-ji temple/, /Kaminarimon gate/, /Nakamise street/])

      await serverTrip(
        request,
        trip.id,
        (t) => titles(t.days[0].items).join('|') === 'Senso-ji temple|Kaminarimon gate|Nakamise street',
        'the new order reached the server',
      )
      await page.reload()
      await expect(planOf(page, 1).getByRole('listitem')).toHaveText([/Senso-ji temple/, /Kaminarimon gate/, /Nakamise street/])
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('a stop moved to day 2 from its menu leaves day 1 and saves last on day 2', async ({ page, request }) => {
    const moving = place('teamLab Planets', 35.6492, 139.7898)
    const staying = place('Tokyo Station', 35.6812, 139.7671)
    const already = place('Meiji Shrine', 35.6764, 139.6993)
    const trip = await seedTrip(request, { name: uniqueName('move day'), patch: withDays([[moving, staying], [already]]) })
    try {
      await openDay(page, trip)
      await page.getByRole('button', { name: `More for ${moving.title}` }).click()
      await page.getByRole('menuitem', { name: 'Move to another day…' }).click()
      await page.getByRole('dialog', { name: `Move “${moving.title}”` }).getByRole('button', { name: /^Day 2 · / }).click()

      await expect(toast(page, `Moved “${moving.title}” to Day 2`)).toBeVisible()
      await expect(planOf(page, 1).getByText(moving.title)).toHaveCount(0)
      const saved = await serverTrip(
        request,
        trip.id,
        (t) => t.days[1].items.some((i) => i.id === moving.id),
        'the stop reached day 2 on the server',
      )
      expect(titles(saved.days[0].items)).toEqual([staying.title])
      expect(titles(saved.days[1].items), 'it goes last on that day’s route').toEqual([already.title, moving.title])

      await page.getByRole('navigation', { name: 'Days' }).getByRole('link', { name: /^Day 2,/ }).click()
      await expect(planOf(page, 2).getByRole('listitem')).toHaveText([/Meiji Shrine/, /teamLab Planets/])
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('a deleted stop leaves the day and the server, and the toast’s Undo brings it back', async ({ page, request }) => {
    const doomed = place('Robot Restaurant', 35.6938, 139.7034)
    const kept = place('Omoide Yokocho', 35.6929, 139.6996)
    const trip = await seedTrip(request, { name: uniqueName('delete stop'), patch: withDays([[doomed, kept]]) })
    try {
      await openDay(page, trip)
      const stop = stopOf(page, doomed.id)
      await headOf(stop, doomed.title).click()
      await stop.getByRole('button', { name: 'Delete', exact: true }).click()

      const notice = toast(page, `Removed “${doomed.title}”`)
      await expect(notice).toBeVisible()
      // The toast leaves after 12 s unless the pointer is on it, and the server check can outlast that.
      await notice.hover()
      await expect(stop).toHaveCount(0)
      await serverTrip(request, trip.id, (t) => !findItem(t, doomed.id) && !!findItem(t, kept.id), 'the stop left the server')

      await notice.getByRole('button', { name: 'Undo' }).click()
      await expect(planOf(page, 1).getByRole('listitem')).toHaveText([/Robot Restaurant/, /Omoide Yokocho/])
      const back = await serverTrip(request, trip.id, (t) => !!findItem(t, doomed.id), 'Undo put the stop back on the server')
      expect(titles(back.days[0].items)).toEqual([doomed.title, kept.title])
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('Sort stops by time keeps a 1 AM bar after the 8 PM dinner it follows', async ({ page, request }) => {
    const lunch = note('Lunch at Afuri', { time: '13:00' })
    const dinner = note('Dinner in Golden Gai', { time: '20:00' })
    const bar = note('Bar Benfiddich', { time: '01:00' })
    const breakfast = note('Breakfast at the hotel', { time: '08:00' })
    const trip = await seedTrip(request, { name: uniqueName('sort by time'), patch: withDays([[lunch, dinner, bar, breakfast]]) })
    try {
      await openDay(page, trip)
      await page.getByRole('button', { name: 'More for day 1' }).click()
      await page.getByRole('menuitem', { name: 'Sort stops by time' }).click()

      const sorted = [/Breakfast at the hotel/, /Lunch at Afuri/, /Dinner in Golden Gai/, /Bar Benfiddich/]
      await expect(toast(page, 'Sorted day 1 by time')).toBeVisible()
      await expect(planOf(page, 1).getByRole('listitem')).toHaveText(sorted)
      await serverTrip(
        request,
        trip.id,
        (t) => titles(t.days[0].items).join('|') === [breakfast, lunch, dinner, bar].map((i) => i.title).join('|'),
        'the sorted order reached the server',
      )

      await page.getByRole('button', { name: 'More for day 1' }).click()
      await expect(page.getByRole('menuitem', { name: 'Export to calendar' })).toBeVisible()
      await expect(page.getByRole('menuitem', { name: 'Sort stops by time' }), 'the bar after dinner already reads as in order').toHaveCount(0)
    } finally {
      await deleteTrip(request, trip.id)
    }
  })
})

test('Ctrl+Z undoes an added stop on the server too, Shift redoes it, and a text field keeps the keys', async ({ page, request }) => {
  const trip = await seedTrip(request, { name: uniqueName('undo redo') })
  try {
    await openDay(page, trip)
    const composer = composerOf(page)
    const plan = planOf(page, 1)
    for (const title of ['Buy a Suica card', 'Charge the pocket wifi']) {
      await composer.fill(title)
      await page.getByRole('option', { name: 'Add as a note' }).click()
      await expect(plan.getByText(title)).toBeVisible()
    }
    await serverTrip(request, trip.id, (t) => t.days[0].items.length === 2, 'both notes reached the server')

    await expect(composer, 'the composer keeps focus after an add').toBeFocused()
    await page.keyboard.press('ControlOrMeta+z')
    await composer.blur()
    await page.keyboard.press('ControlOrMeta+z')
    await expect(plan.getByText('Charge the pocket wifi')).toHaveCount(0)
    await expect(plan.getByText('Buy a Suica card'), 'the press inside the composer undid nothing').toBeVisible()
    await serverTrip(
      request,
      trip.id,
      (t) => titles(t.days[0].items).join('|') === 'Buy a Suica card',
      'the undone note left the server',
    )

    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect(plan.getByText('Charge the pocket wifi')).toBeVisible()
    await serverTrip(
      request,
      trip.id,
      (t) => titles(t.days[0].items).join('|') === 'Buy a Suica card|Charge the pocket wifi',
      'the redone note came back to the server',
    )
  } finally {
    await deleteTrip(request, trip.id)
  }
})

test.describe('day header', () => {
  test('a day’s title and city typed in its header save and survive a reload', async ({ page, request }) => {
    const trip = await seedTrip(request, { name: uniqueName('day header') })
    try {
      await openDay(page, trip)
      await page.getByRole('textbox', { name: 'Day title' }).fill('Old Tokyo on foot')
      await page.getByRole('textbox', { name: 'City for this day' }).fill('Asakusa')

      await serverTrip(
        request,
        trip.id,
        (t) => t.days[0].title === 'Old Tokyo on foot' && t.days[0].city === 'Asakusa',
        'the day title and city reached the server',
      )
      await page.reload()
      await expect(page.getByRole('textbox', { name: 'Day title' })).toHaveValue('Old Tokyo on foot')
      await expect(page.getByRole('textbox', { name: 'City for this day' })).toHaveValue('Asakusa')
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('a past day’s journal saves and survives a reload', async ({ page, request }) => {
    const trip = await seedTrip(request, { name: uniqueName('journal'), startDate: isoFromToday(-6), endDate: isoFromToday(-4) })
    const entry = 'Rain all morning, and the ramen made up for it.'
    try {
      await openDay(page, trip)
      await page.getByRole('textbox', { name: 'Journal' }).fill(entry)

      await serverTrip(request, trip.id, (t) => t.days[0].journal === entry, 'the journal reached the server')
      await page.reload()
      await expect(page.getByRole('textbox', { name: 'Journal' })).toHaveValue(entry)
    } finally {
      await deleteTrip(request, trip.id)
    }
  })
})

test.describe('moving between days', () => {
  test('the left and right arrow keys step through the days and past day 1 to the overview, but not while typing', async ({ page, request }) => {
    const trip = await seedTrip(request, { name: uniqueName('arrow keys') })
    try {
      await openDay(page, trip)
      const title = page.getByRole('textbox', { name: 'Day title' })
      await title.focus()
      await page.keyboard.press('ArrowRight')
      await expect(page, 'an arrow inside a text field moves the caret, not the day').toHaveURL(/\/day\/day-1$/)
      await title.blur()

      await page.keyboard.press('ArrowRight')
      await expect(page).toHaveURL(/\/day\/day-2$/)
      await expect(page.getByText('Day 2 of 3')).toBeVisible()
      await page.keyboard.press('ArrowLeft')
      await expect(page).toHaveURL(/\/day\/day-1$/)
      await expect(page.getByText('Day 1 of 3')).toBeVisible()
      await page.keyboard.press('ArrowLeft')
      await expect(page).toHaveURL(/\/trips\/[^/]+$/)
      await expect(page.getByRole('textbox', { name: 'Trip name' })).toHaveValue(trip.name)
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('the day rail, the pager and the trip name move between the days and the overview', async ({ page, request }) => {
    const trip = await seedTrip(request, { name: uniqueName('day links') })
    try {
      await openDay(page, trip)
      const rail = page.getByRole('navigation', { name: 'Days' })
      await rail.getByRole('link', { name: /^Day 3, / }).click()
      await expect(page).toHaveURL(/\/day\/day-3$/)
      await expect(page.getByText('Day 3 of 3')).toBeVisible()

      await page.getByRole('navigation', { name: 'Other days' }).getByRole('link', { name: /Day 2/ }).click()
      await expect(page).toHaveURL(/\/day\/day-2$/)
      await expect(page.getByText('Day 2 of 3')).toBeVisible()

      // On a wide screen the trip name in the compact header is the way back; the eyebrow link is the phone's.
      await page.getByRole('link', { name: trip.name, exact: true }).click()
      await expect(page).toHaveURL(/\/trips\/[^/]+$/)
      await expect(page.getByRole('textbox', { name: 'Trip name' })).toHaveValue(trip.name)

      await rail.getByRole('link', { name: /^Day 1, / }).click()
      await expect(page).toHaveURL(/\/day\/day-1$/)
      await rail.getByRole('link', { name: 'Overview' }).click()
      await expect(page).toHaveURL(/\/trips\/[^/]+$/)
      await expect(page.getByRole('textbox', { name: 'Trip name' })).toHaveValue(trip.name)
    } finally {
      await deleteTrip(request, trip.id)
    }
  })
})

test.describe('deep links', () => {
  const route = (count: number): Item[] =>
    Array.from({ length: count }, (_, i) => place(`Stop ${String.fromCharCode(65 + i)} ${itemId('walk')}`, 35.66 + i * 0.004, 139.70 + i * 0.006))

  test('#item-<id> on a day URL selects that stop and shows it on the map', async ({ page, request }) => {
    const stops = route(3)
    const trip = await seedTrip(request, { name: uniqueName('deep item'), patch: withDays([stops]) })
    try {
      await page.goto(`${dayUrl(trip, 0)}#item-${stops[1].id}`)
      const card = page.getByRole('complementary', { name: 'Selected place' })
      await expect(card.getByRole('heading', { name: stops[1].title })).toBeVisible()
      await expect(card).toContainText('Stop 2 of 3')
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('on a phone, #item-<id> switches to the map and #stop-<id> stays on the list with the stop in view', async ({ page, request }) => {
    const stops = route(14)
    const last = stops[stops.length - 1]
    const trip = await seedTrip(request, { name: uniqueName('deep phone'), patch: withDays([stops]) })
    try {
      await page.setViewportSize({ width: 375, height: 812 })
      const view = page.getByRole('radiogroup', { name: 'View' })

      await page.goto(`${dayUrl(trip, 0)}#item-${last.id}`)
      await expect(view.getByRole('radio', { name: 'Map' })).toHaveAttribute('aria-checked', 'true')
      await expect(page.getByRole('complementary', { name: 'Selected place' }).getByRole('heading', { name: last.title })).toBeVisible()

      await page.goto(`/trips/${trip.id}`)
      await page.goto(`${dayUrl(trip, 0)}#stop-${last.id}`)
      await expect(headOf(stopOf(page, last.id), last.title)).toBeInViewport()
      await expect(view.getByRole('radio', { name: 'Itinerary' })).toHaveAttribute('aria-checked', 'true')
      await view.getByRole('radio', { name: 'Map' }).click()
      await expect(page.getByRole('complementary', { name: 'Selected place' }).getByRole('heading', { name: last.title })).toBeVisible()
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('a booking in the overview’s Bookings list opens its day with the booking selected', async ({ page, request }) => {
    const dinner: Item = {
      id: itemId('booking'),
      kind: 'reservation',
      title: 'Dinner at Den',
      time: '19:00',
      status: 'booked',
      createdBy: 'user',
      reservation: { type: 'restaurant', status: 'confirmed' },
      location: { name: 'Den', lat: 35.6735, lng: 139.7148, source: 'user' },
    }
    const trip = await seedTrip(request, { name: uniqueName('booking link'), patch: withDays([[], [dinner]]) })
    try {
      await page.goto(`/trips/${trip.id}`)
      await page.getByRole('link', { name: /^Dinner at Den/ }).click()
      await expect(page).toHaveURL(new RegExp(`/day/day-2#item-${dinner.id}$`))
      await expect(page.getByRole('complementary', { name: 'Selected place' }).getByRole('heading', { name: 'Dinner at Den' })).toBeVisible()
    } finally {
      await deleteTrip(request, trip.id)
    }
  })
})

test.describe('trip details', () => {
  const openDetails = async (page: Page) => {
    await page.getByRole('button', { name: 'More trip options' }).click()
    await page.getByRole('menuitem', { name: 'Trip details' }).click()
    return page.getByRole('dialog', { name: 'Trip details' })
  }
  const pickDates = async (page: Page, details: Locator, from: string, to: string) => {
    await details.getByRole('button', { name: /Change dates$/ }).click()
    const calendar = page.getByRole('dialog', { name: 'Choose dates' })
    await calendar.getByRole('button', { name: from, exact: true }).click()
    await calendar.getByRole('button', { name: to, exact: true }).click()
    await expect(calendar).toBeHidden()
  }

  test('a new name and description saved in Trip details reach the server and the header', async ({ page, request }) => {
    const trip = await seedTrip(request, { name: uniqueName('rename') })
    const name = uniqueName('renamed')
    try {
      await openDay(page, trip)
      const details = await openDetails(page)
      await details.getByLabel('Name', { exact: true }).fill(name)
      await details.getByLabel('About this trip').fill('Cherry blossom week with Sam and Jo.')
      await details.getByRole('button', { name: 'Save details' }).click()

      await expect(details).toBeHidden()
      await expect(page.getByRole('link', { name, exact: true })).toBeVisible()
      await serverTrip(
        request,
        trip.id,
        (t) => t.name === name && t.description === 'Cherry blossom week with Sam and Jo.',
        'the name and description reached the server',
      )
      await page.reload()
      await expect(page.getByRole('link', { name, exact: true })).toBeVisible()
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('keys in Trip details: Tab out of a field mid-search moves on, and Escape shuts only the open list', async ({ page, request }) => {
    const trip = await seedTrip(request, { name: uniqueName('keys') })
    const porto = { id: 2735943, name: 'Porto', latitude: 41.14961, longitude: -8.61099, country: 'Portugal', admin1: 'Porto', timezone: 'Europe/Lisbon' }
    await page.route('https://geocoding-api.open-meteo.com/**', (route) => route.fulfill({ json: { results: [porto] } }))
    try {
      await openDay(page, trip)
      const details = await openDetails(page)
      const name = details.getByLabel('Name', { exact: true })
      await name.fill('Kept while the keys move')
      const where = details.getByRole('combobox', { name: 'Where' })
      const places = page.getByRole('listbox', { name: 'Matching places' })

      await where.fill('Port')
      await expect(places.getByRole('option', { name: /Porto/ })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(places).toBeHidden()
      await expect(details).toBeVisible()
      await where.fill('')

      await where.fill('Porto')
      await expect(places.getByRole('option', { name: /Porto/ })).toBeVisible()
      await page.keyboard.press('Tab')
      await expect(details.getByRole('button', { name: /Change dates$/ }), 'focus left the open list for the next field').toBeFocused()
      await expect(details.getByRole('button', { name: 'Remove Porto' })).toBeVisible()

      await page.keyboard.press('Enter')
      const calendar = page.getByRole('dialog', { name: 'Choose dates' })
      await expect(calendar).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(calendar).toBeHidden()
      await expect(details).toBeVisible()

      const zone = details.getByRole('combobox', { name: 'Time zone' })
      const zones = page.getByRole('listbox', { name: 'Time zones' })
      await zone.click()
      await zone.pressSequentially('reykj')
      await expect(zones).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(zones).toBeHidden()
      await expect(details).toBeVisible()
      await zone.click()
      await expect(zones).toBeVisible()
      await zone.pressSequentially('reykjavik')
      await page.keyboard.press('Tab')
      await expect(details.getByRole('button', { name: 'Cancel' })).toBeFocused()
      await expect(zone).toHaveValue('Reykjavik · Atlantic')
      await expect(name).toHaveValue('Kept while the keys move')
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('later end dates add empty days and leave the existing plan where it was', async ({ page, request }) => {
    const first = place('Tokyo Tower', 35.6586, 139.7454)
    const trip = await seedTrip(request, { name: uniqueName('extend'), patch: withDays([[first]]) })
    try {
      await page.goto(`/trips/${trip.id}`)
      await page.getByRole('button', { name: /3 days$/ }).click()
      const details = page.getByRole('dialog', { name: 'Trip details' })
      await pickDates(page, details, 'Monday, March 1, 2027', 'Friday, March 5, 2027')
      await expect(details.getByRole('button', { name: /5 days\. Change dates$/ })).toBeVisible()
      await details.getByRole('button', { name: 'Save details' }).click()

      await expect(page.getByRole('navigation', { name: 'Days' }).getByRole('link', { name: /^Day 5, Friday, March 5/ })).toBeVisible()
      const saved = await serverTrip(request, trip.id, (t) => t.days.length === 5, 'the two new days reached the server')
      expect(saved).toMatchObject({ startDate: '2027-03-01', endDate: '2027-03-05' })
      expect(saved.days.map((d) => d.date)).toEqual(['2027-03-01', '2027-03-02', '2027-03-03', '2027-03-04', '2027-03-05'])
      expect(titles(saved.days[0].items)).toEqual([first.title])
      expect(saved.days.slice(1).every((d) => d.items.length === 0)).toBe(true)
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('an earlier end date saves the dropped day’s stop to the wishlist, as the dialog offers', async ({ page, request }) => {
    const kept = place('Ginza Six', 35.6697, 139.7640)
    const dropped = place('Ghibli Museum', 35.6962, 139.5704)
    const trip = await seedTrip(request, { name: uniqueName('shorten ideas'), patch: withDays([[kept], [], [dropped]]) })
    try {
      await openDay(page, trip)
      const details = await openDetails(page)
      await pickDates(page, details, 'Monday, March 1, 2027', 'Tuesday, March 2, 2027')

      await expect(details.getByText('This day falls outside the new dates')).toBeVisible()
      await expect(details.getByRole('listitem').filter({ hasText: 'Day 3' })).toContainText('1 stop')
      await expect(details.getByRole('radio', { name: /^Save its stop to the wishlist/ })).toHaveAttribute('aria-checked', 'true')
      await expect(details.getByRole('radiogroup', { name: 'What happens to your plans' }), 'moving only the end needs no plan choice').toHaveCount(0)
      await details.getByRole('button', { name: 'Save details' }).click()

      await expect(page.getByRole('navigation', { name: 'Days' }).getByRole('link', { name: /^Day 3,/ })).toHaveCount(0)
      const saved = await serverTrip(request, trip.id, (t) => t.days.length === 2, 'the shorter trip reached the server')
      expect(saved.endDate).toBe('2027-03-02')
      expect(findItem(saved, dropped.id), 'the stop is on no day').toBeUndefined()
      expect((saved.ideas ?? []).map((i) => i.title)).toContain(dropped.title)
      expect(titles(saved.days[0].items)).toEqual([kept.title])
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('an earlier end date with "Remove it" deletes the dropped day’s stop, and Undo restores the day', async ({ page, request }) => {
    const dropped = place('Ghibli Museum', 35.6962, 139.5704)
    const trip = await seedTrip(request, { name: uniqueName('shorten remove'), patch: withDays([[], [], [dropped]]) })
    try {
      await openDay(page, trip)
      const details = await openDetails(page)
      await pickDates(page, details, 'Monday, March 1, 2027', 'Tuesday, March 2, 2027')
      await details.getByRole('radio', { name: /^Remove it/ }).click()
      await details.getByRole('button', { name: 'Remove 1 stop and save' }).click()

      const notice = toast(page, 'Changed the trip dates')
      await expect(notice).toBeVisible()
      await notice.hover()
      const saved = await serverTrip(request, trip.id, (t) => t.days.length === 2, 'the shorter trip reached the server')
      expect(findItem(saved, dropped.id)).toBeUndefined()
      expect((saved.ideas ?? []).some((i) => i.id === dropped.id), 'not on the wishlist either').toBe(false)

      await notice.getByRole('button', { name: 'Undo' }).click()
      const restored = await serverTrip(request, trip.id, (t) => t.days.length === 3, 'Undo brought the day back on the server')
      expect(restored.endDate).toBe('2027-03-03')
      expect(titles(restored.days[2].items)).toEqual([dropped.title])
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('a new start date asks what happens to the plans, and "Move my plans with the dates" carries every stop', async ({ page, request }) => {
    const first = place('Tsukiji Outer Market', 35.6655, 139.7707)
    const last = place('Odaiba Seaside Park', 35.6297, 139.7752)
    const trip = await seedTrip(request, { name: uniqueName('shift'), patch: withDays([[first], [], [last]]) })
    try {
      await openDay(page, trip)
      const details = await openDetails(page)
      await pickDates(page, details, 'Monday, March 8, 2027', 'Wednesday, March 10, 2027')

      const save = details.getByRole('button', { name: 'Save details' })
      await expect(save, 'Save waits for an answer').toBeDisabled()
      await details.getByRole('radiogroup', { name: 'What happens to your plans' }).getByRole('radio', { name: /^Move my plans with the dates/ }).click()
      await save.click()

      const saved = await serverTrip(request, trip.id, (t) => t.startDate === '2027-03-08', 'the new dates reached the server')
      expect(saved.days.map((d) => d.date)).toEqual(['2027-03-08', '2027-03-09', '2027-03-10'])
      expect(titles(saved.days[0].items)).toEqual([first.title])
      expect(titles(saved.days[2].items)).toEqual([last.title])
      expect(saved.ideas ?? []).toEqual([])
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('a new start date with "Keep plans on their dates" keeps stops on their dates and offers the dropped day’s stop to the wishlist', async ({ page, request }) => {
    const early = place('Imperial Palace East Gardens', 35.6852, 139.7528)
    const second = place('Yanaka Ginza', 35.7276, 139.7663)
    const trip = await seedTrip(request, { name: uniqueName('keep'), patch: withDays([[early], [second]]) })
    try {
      await page.goto(`/trips/${trip.id}`)
      const details = await openDetails(page)
      await pickDates(page, details, 'Tuesday, March 2, 2027', 'Thursday, March 4, 2027')
      await details.getByRole('radiogroup', { name: 'What happens to your plans' }).getByRole('radio', { name: /^Keep plans on their dates/ }).click()

      await expect(details.getByRole('listitem').filter({ hasText: 'Day 1' })).toContainText('1 stop')
      await expect(details.getByRole('radio', { name: /^Save its stop to the wishlist/ })).toHaveAttribute('aria-checked', 'true')
      await details.getByRole('button', { name: 'Save details' }).click()

      const saved = await serverTrip(request, trip.id, (t) => t.startDate === '2027-03-02', 'the new dates reached the server')
      expect(saved.days.map((d) => d.date)).toEqual(['2027-03-02', '2027-03-03', '2027-03-04'])
      expect(titles(saved.days[0].items), 'the 2 March stop stays on 2 March').toEqual([second.title])
      expect(findItem(saved, early.id)).toBeUndefined()
      expect((saved.ideas ?? []).map((i) => i.title)).toContain(early.title)
    } finally {
      await deleteTrip(request, trip.id)
    }
  })
})

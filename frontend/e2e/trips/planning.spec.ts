import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { deleteTrip, expect as baseExpect, itemId, pickOption, place, seedTrip, serverTrip, test, type Item, type Trip } from './fixtures'

// On a loaded machine a lazy panel or a rate lookup takes well past the 5 s default.
const expect = baseExpect.configure({ timeout: 30_000 })
test.describe.configure({ timeout: 120_000 })

const yen = (amount: number) => `¥${amount.toLocaleString('en-US')}`

function dollars(amount: number): string {
  const cents = Math.round(amount * 100) / 100
  return cents.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(cents) ? 0 : 2, maximumFractionDigits: 2 })
}

const isoIn = (zone: string, at = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(at)

function shiftDate(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** The rate Frankfurter hands the page for `base` → `quote`: register before the page asks. */
function frankfurterRate(page: Page, base: string, quote: string): Promise<number> {
  return page
    .waitForResponse((res) => {
      const url = new URL(res.url())
      return (
        url.host === 'api.frankfurter.dev' &&
        url.searchParams.get('base') === base &&
        (url.searchParams.get('quotes') ?? '').split(',').includes(quote)
      )
    })
    .then(async (res) => {
      const rows = (await res.json()) as { base: string; quote: string; rate: number }[]
      const row = rows.find((r) => r.base === base && r.quote === quote)
      if (!row) throw new Error(`Frankfurter gave no ${base}→${quote} rate`)
      return row.rate
    })
}

const withDays = (trip: Trip, items: Item[][]) =>
  trip.days.map((day, index) => ({ ...day, items: items[index] ?? [] }))

const expense = (fields: Record<string, unknown>) => ({ createdAt: new Date().toISOString(), ...fields })

test.describe('budget', () => {
  test('a budget set in another currency saves, and removing it clears it on the server', async ({ page, request }) => {
    const trip = await seedTrip(request)
    try {
      await page.goto(`/trips/${trip.id}?tab=budget`)
      await page.getByRole('button', { name: 'Set a budget' }).click()
      await pickOption(page.getByRole('combobox', { name: 'Budget currency' }), /^EUR · /)
      await page.getByRole('textbox', { name: 'Budget for the whole trip' }).fill('2,500')
      await page.getByRole('button', { name: 'Save budget' }).click()

      const meter = page.getByRole('meter', { name: 'Budget used' })
      await expect(meter).toHaveAttribute('aria-valuetext', '€0 spent and €0 planned of €2,500: €2,500 left')
      await serverTrip(
        request,
        trip.id,
        (t) => t.budget?.currency === 'EUR' && t.budget.total === 2500,
        'the EUR 2,500 budget reached the server',
      )

      await page.reload()
      await expect(meter).toHaveAttribute('aria-valuetext', '€0 spent and €0 planned of €2,500: €2,500 left')

      await page.getByRole('button', { name: 'Change budget' }).click()
      await page.getByRole('button', { name: 'Remove budget' }).click()
      await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
      await expect(meter).toHaveCount(0)
      await serverTrip(request, trip.id, (t) => t.budget === undefined, 'the budget was removed on the server')

      await page.reload()
      await expect(page.getByRole('heading', { name: 'What the trip costs' })).toBeVisible()
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('stop costs count as planned, and marking one paid moves it to spent', async ({ page, request }) => {
    const teamLab = place('teamLab Planets', 35.6491, 139.7898, { cost: { amount: 4000, currency: 'JPY' } })
    const sushi = place('Sushi dinner', 35.6655, 139.7707, { cost: { amount: 12000, currency: 'JPY' } })
    sushi.location!.category = 'restaurant'
    const free = place('Meiji Shrine', 35.6764, 139.6993)
    const trip = await seedTrip(request, {
      patch: (t) => ({ budget: { currency: 'JPY', total: 100000 }, days: withDays(t, [[teamLab, sushi], [free]]) }),
    })
    try {
      await page.goto(`/trips/${trip.id}?tab=budget`)
      const meter = page.getByRole('meter', { name: 'Budget used' })
      await expect(meter).toHaveAttribute('aria-valuetext', '¥0 spent and ¥16,000 planned of ¥100,000: ¥84,000 left')

      const planned = page.getByRole('region', { name: 'Planned from your stops' })
      await expect(planned.getByRole('listitem')).toHaveCount(2)
      await expect(planned.getByRole('button', { name: 'Open “teamLab Planets” on day 1' })).toContainText(yen(4000))
      await expect(planned.getByRole('button', { name: 'Open “Sushi dinner” on day 1' })).toContainText(yen(12000))
      await expect(planned).not.toContainText('Meiji Shrine')

      await planned.getByRole('button', { name: 'Mark “Sushi dinner” paid' }).click()
      await expect(meter).toHaveAttribute('aria-valuetext', '¥12,000 spent and ¥4,000 planned of ¥100,000: ¥84,000 left')
      await expect(planned.getByRole('listitem').filter({ hasText: 'Sushi dinner' })).toContainText('Paid')
      await expect(page.getByRole('region', { name: 'Spent' }).getByRole('button', { name: 'Edit “Sushi dinner”, ¥12,000' })).toBeVisible()

      const stored = await serverTrip(
        request,
        trip.id,
        (t) => (t.expenses ?? []).some((e) => e.itemId === sushi.id),
        'the paid stop became an expense on the server',
      )
      expect(stored.expenses).toHaveLength(1)
      expect(stored.expenses![0]).toMatchObject({
        title: 'Sushi dinner',
        amount: 12000,
        currency: 'JPY',
        category: 'food',
        date: trip.days[0].date,
        itemId: sushi.id,
      })

      await page.reload()
      await expect(meter).toHaveAttribute('aria-valuetext', '¥12,000 spent and ¥4,000 planned of ¥100,000: ¥84,000 left')
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('travellers added by name join the party, and a removed one stays removed', async ({ page, request }) => {
    const trip = await seedTrip(request, { patch: () => ({ budget: { currency: 'JPY' } }) })
    try {
      await page.goto(`/trips/${trip.id}?tab=budget`)
      const party = page.getByRole('region', { name: /Who.s travelling/ })
      await expect(party.getByRole('textbox', { name: 'Name of Trip owner' })).toBeVisible()

      const name = party.getByRole('textbox', { name: 'Name of someone else on the trip' })
      await name.fill('Ann')
      await party.getByRole('button', { name: 'Add', exact: true }).click()
      await name.fill('Bo')
      await name.press('Enter')
      await expect(party.getByRole('textbox', { name: 'Name of Ann' })).toBeVisible()
      await expect(party.getByRole('textbox', { name: 'Name of Bo' })).toBeVisible()

      await party.getByRole('button', { name: 'Remove Trip owner' }).click()
      await expect(party.getByRole('textbox', { name: 'Name of Trip owner' })).toHaveCount(0)

      const stored = await serverTrip(
        request,
        trip.id,
        (t) => JSON.stringify((t.party ?? []).map((p) => p.name)) === '["Ann","Bo"]',
        'the party of Ann and Bo reached the server',
      )
      expect(new Set(stored.party!.map((p) => p.id)).size, 'each traveller has an id of their own').toBe(2)

      await page.reload()
      await expect(party.getByRole('textbox', { name: 'Name of Ann' })).toBeVisible()
      await expect(party.getByRole('textbox', { name: 'Name of Bo' })).toBeVisible()
      await expect(party.getByRole('textbox', { name: 'Name of Trip owner' })).toHaveCount(0)
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('an expense logged with payer and split saves, edits, and a removed one is gone after a reload', async ({ page, request }) => {
    const people = [
      { id: 'p-ann', name: 'Ann' },
      { id: 'p-bo', name: 'Bo' },
      { id: 'p-cy', name: 'Cy' },
    ]
    const trip = await seedTrip(request, { patch: () => ({ budget: { currency: 'JPY' }, party: people }) })
    try {
      await page.goto(`/trips/${trip.id}?tab=budget`)
      const spent = page.getByRole('region', { name: 'Spent' })

      await spent.getByRole('button', { name: 'Log an expense' }).click()
      let form = page.getByRole('form', { name: 'Log an expense' })
      await form.getByRole('textbox', { name: 'What for' }).fill('Ramen')
      await form.getByRole('textbox', { name: 'Amount', exact: true }).fill('4,500')
      await pickOption(form.getByRole('combobox', { name: 'Currency', exact: true }), /^JPY · /)
      await form.getByRole('radio', { name: 'Food & drink' }).click()
      await pickOption(form.getByRole('combobox', { name: 'Day', exact: true }), /^Day 2 · /)
      await pickOption(form.getByRole('combobox', { name: 'Paid by' }), 'Bo')
      await form.getByRole('group', { name: 'Split between' }).getByRole('checkbox', { name: 'Ann' }).click()
      await form.getByRole('button', { name: 'Log expense' }).click()

      const ramen = spent.getByRole('button', { name: 'Edit “Ramen”, ¥4,500' })
      await expect(ramen).toContainText('Food & drink · Paid by Bo · Split 2 ways')

      await spent.getByRole('button', { name: 'Log an expense' }).click()
      form = page.getByRole('form', { name: 'Log an expense' })
      await form.getByRole('textbox', { name: 'What for' }).fill('Taxi')
      await pickOption(form.getByRole('combobox', { name: 'Currency', exact: true }), /^USD · /)
      await form.getByRole('textbox', { name: 'Amount', exact: true }).fill('20')
      await form.getByRole('radio', { name: 'Transport' }).click()
      await pickOption(form.getByRole('combobox', { name: 'Paid by' }), 'Ann')
      await form.getByRole('button', { name: 'Log expense' }).click()
      await expect(spent.getByRole('button', { name: 'Edit “Taxi”, $20' })).toBeVisible()

      const logged = await serverTrip(
        request,
        trip.id,
        (t) => (t.expenses ?? []).length === 2,
        'both expenses reached the server',
      )
      const ramenSaved = logged.expenses!.find((e) => e.title === 'Ramen')
      expect(ramenSaved).toMatchObject({
        amount: 4500,
        currency: 'JPY',
        category: 'food',
        date: trip.days[1].date,
        paidBy: 'p-bo',
        splitWith: ['p-bo', 'p-cy'],
      })
      const taxiSaved = logged.expenses!.find((e) => e.title === 'Taxi')
      expect(taxiSaved).toMatchObject({ amount: 20, currency: 'USD', category: 'transport', paidBy: 'p-ann' })
      expect(taxiSaved, 'a split with everyone is stored as no split list').not.toHaveProperty('splitWith')

      await ramen.click()
      form = page.getByRole('form', { name: 'Edit “Ramen”' })
      await form.getByRole('textbox', { name: 'Amount', exact: true }).fill('6,000')
      await form.getByRole('button', { name: 'Save expense' }).click()
      await expect(spent.getByRole('button', { name: 'Edit “Ramen”, ¥6,000' })).toBeVisible()

      await spent.getByRole('button', { name: 'Edit “Taxi”, $20' }).click()
      await page.getByRole('form', { name: 'Edit “Taxi”' }).getByRole('button', { name: 'Remove' }).click()
      await expect(spent.getByText('Removed “Taxi”')).toBeVisible()
      await expect(spent.getByRole('button', { name: /Edit “Taxi”/ })).toHaveCount(0)

      const edited = await serverTrip(
        request,
        trip.id,
        (t) => (t.expenses ?? []).length === 1 && t.expenses![0].amount === 6000,
        'the edit and the removal reached the server',
      )
      expect(edited.expenses![0]).toMatchObject({ title: 'Ramen', paidBy: 'p-bo', splitWith: ['p-bo', 'p-cy'] })

      await page.reload()
      await expect(spent.getByRole('button', { name: /^Edit “/ })).toHaveCount(1)
      await expect(spent.getByRole('button', { name: 'Edit “Ramen”, ¥6,000' })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Costs in JPY' })).toContainText(/Spent so far\s*¥6,000/)
      const settle = page.getByRole('region', { name: 'Settle up' }).getByRole('listitem')
      await expect(settle).toHaveCount(1)
      await expect(settle).toHaveText(/^Cy pays Bo\s*¥3,000$/)
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('settle up squares five travellers in the fewest transfers', async ({ page, request }) => {
    // Ann is owed ¥6,000 by Bo and Cy, Di ¥4,000 by Ed. Paying the largest debt
    // first takes four transfers (Ed→Ann 4, Bo→Di 3, Cy→Ann 2, Cy→Di 1); three suffice.
    const people = ['Ann', 'Bo', 'Cy', 'Di', 'Ed'].map((name) => ({ id: `p-${name.toLowerCase()}`, name }))
    const trip = await seedTrip(request, {
      patch: () => ({
        budget: { currency: 'JPY', total: 50000 },
        party: people,
        expenses: [
          expense({ id: 'ex-ryokan', title: 'Ryokan', amount: 9000, currency: 'JPY', category: 'lodging', paidBy: 'p-ann', splitWith: ['p-ann', 'p-bo', 'p-cy'] }),
          expense({ id: 'ex-car', title: 'Car hire', amount: 8000, currency: 'JPY', category: 'transport', paidBy: 'p-di', splitWith: ['p-di', 'p-ed'] }),
        ],
      }),
    })
    try {
      await page.goto(`/trips/${trip.id}?tab=budget`)
      await expect(page.getByRole('meter', { name: 'Budget used' })).toHaveAttribute(
        'aria-valuetext',
        '¥17,000 spent and ¥0 planned of ¥50,000: ¥33,000 left',
      )
      const transfers = page.getByRole('region', { name: 'Settle up' }).getByRole('listitem')
      await expect(transfers).toHaveCount(3)
      await expect(transfers.filter({ hasText: /^Bo pays Ann\s*¥3,000$/ })).toHaveCount(1)
      await expect(transfers.filter({ hasText: /^Cy pays Ann\s*¥3,000$/ })).toHaveCount(1)
      await expect(transfers.filter({ hasText: /^Ed pays Di\s*¥4,000$/ })).toHaveCount(1)
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('an expense in euros converts into the yen budget at the Frankfurter rate', async ({ page, request }) => {
    const trip = await seedTrip(request, {
      patch: () => ({
        budget: { currency: 'JPY', total: 100000 },
        expenses: [
          expense({ id: 'ex-museum', title: 'Museum', amount: 20, currency: 'EUR', category: 'activities' }),
          expense({ id: 'ex-lunch', title: 'Lunch', amount: 1500, currency: 'JPY', category: 'food' }),
        ],
      }),
    })
    try {
      const rate = frankfurterRate(page, 'JPY', 'EUR')
      await page.goto(`/trips/${trip.id}?tab=budget`)
      const eurPerYen = await rate
      const museum = Math.round(20 / eurPerYen)
      const spent = museum + 1500

      await expect(page.getByRole('meter', { name: 'Budget used' })).toHaveAttribute(
        'aria-valuetext',
        `${yen(spent)} spent and ¥0 planned of ¥100,000: ${yen(100000 - spent)} left`,
      )
      const row = page.getByRole('button', { name: 'Edit “Museum”, €20' })
      await expect(row).toContainText(yen(museum))
      await expect(row).toContainText('€20 EUR')
      await expect(page.getByText(/Couldn.t convert/)).toHaveCount(0)
    } finally {
      await deleteTrip(request, trip.id)
    }
  })
})

test.describe('checklist', () => {
  test('entries added to each group, ticked, assigned and removed all persist', async ({ page, request }) => {
    const trip = await seedTrip(request, {
      patch: () => ({ party: [{ id: 'p-ann', name: 'Ann' }, { id: 'p-bo', name: 'Bo' }] }),
    })
    try {
      await page.goto(`/trips/${trip.id}?tab=checklist`)
      await page.getByRole('button', { name: 'Add your own' }).click()

      const add = async (group: string, text: string) => {
        const field = page.getByRole('textbox', { name: `Add to ${group}` })
        await field.fill(text)
        await field.press('Enter')
        await expect(page.getByRole('checkbox', { name: text })).toBeVisible()
      }
      await add('Packing', 'Sunscreen')
      await add('Packing', 'Umbrella')
      await add('Before you go', 'Book airport transfer')
      await add('Documents', 'Passport')

      await page.getByRole('checkbox', { name: 'Sunscreen' }).check()
      await page.getByRole('button', { name: 'Assign “Passport”' }).click()
      await page.getByRole('menuitem', { name: 'Bo', exact: true }).click()
      await expect(page.getByRole('button', { name: '“Passport” is with Bo. Reassign' })).toBeVisible()
      await page.getByRole('button', { name: 'Remove “Umbrella”' }).click()
      await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
      await expect(page.getByText('1 of 3 done')).toBeVisible()

      const stored = await serverTrip(
        request,
        trip.id,
        (t) => {
          const list = t.checklist ?? []
          return (
            list.length === 3 &&
            list.some((c) => c.text === 'Sunscreen' && c.done) &&
            list.some((c) => c.text === 'Passport' && c.assignee === 'p-bo')
          )
        },
        'the tick, the assignment and the removal reached the server',
      )
      const byText = Object.fromEntries(stored.checklist!.map((c) => [c.text, c]))
      expect(byText['Sunscreen']).toMatchObject({ group: 'packing', done: true })
      expect(byText['Book airport transfer']).toMatchObject({ group: 'todo', done: false })
      expect(byText['Passport']).toMatchObject({ group: 'documents', done: false, assignee: 'p-bo' })
      expect(byText['Umbrella']).toBeUndefined()

      await page.reload()
      await expect(page.getByRole('checkbox', { name: 'Sunscreen' })).toBeChecked()
      await expect(page.getByRole('checkbox', { name: 'Book airport transfer' })).not.toBeChecked()
      await expect(page.getByRole('button', { name: '“Passport” is with Bo. Reassign' })).toBeVisible()
      await expect(page.getByRole('checkbox', { name: 'Umbrella' })).toHaveCount(0)
      await expect(page.getByText('1 of 3 done')).toBeVisible()
    } finally {
      await deleteTrip(request, trip.id)
    }
  })
})

test.describe('essentials', () => {
  test.use({ timezoneId: 'America/New_York' })

  test('a Tokyo trip shows Japan’s emergency numbers and converts yen to the viewer’s dollars', async ({ page, request }) => {
    const trip = await seedTrip(request)
    try {
      const rate = frankfurterRate(page, 'JPY', 'USD')
      await page.goto(`/trips/${trip.id}?tab=essentials`)
      const japan = page.getByRole('region', { name: 'Japan' })
      await expect(japan.getByRole('link', { name: /Police\s*110/ })).toHaveAttribute('href', 'tel:110')
      await expect(japan.getByRole('link', { name: /Fire and ambulance\s*119/ })).toHaveAttribute('href', 'tel:119')
      await expect(japan).toContainText('On the left')

      const usdPerYen = await rate
      let unit = 1
      while (unit * usdPerYen < 1) unit *= 10
      await expect(japan.getByText(`${yen(unit)} ≈ $${dollars(unit * usdPerYen)} at today’s rate`)).toBeVisible()

      const local = japan.getByRole('textbox', { name: 'Amount in JPY' })
      const home = japan.getByRole('textbox', { name: 'Amount in USD, your currency' })
      await local.fill('10,000')
      await expect(home).toHaveValue(dollars(10000 * usdPerYen))
      await home.fill('10')
      await expect(local).toHaveValue(Math.round(10 / usdPerYen).toLocaleString('en-US'))
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('the public holidays on a Golden Week trip are listed from Nager.Date', async ({ page, request }) => {
    const trip = await seedTrip(request, { startDate: '2027-05-02', endDate: '2027-05-05' })
    try {
      await page.goto(`/trips/${trip.id}?tab=essentials`)
      const holidays = page.getByRole('region', { name: 'Japan' }).getByRole('listitem')
      await expect(holidays).toHaveCount(3)
      await expect(holidays.nth(0)).toContainText('Constitution Memorial Day')
      await expect(holidays.nth(1)).toContainText('Greenery Day')
      await expect(holidays.nth(2)).toContainText("Children's Day")
      await expect(page.getByRole('region', { name: 'Japan' })).not.toContainText('Shōwa Day')
      await expect(page.getByRole('region', { name: /Show to a driver/ })).toHaveCount(0)
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('tonight’s hotel is shown large for a driver, with its address and directions', async ({ page, request }) => {
    const today = isoIn('Asia/Tokyo')
    const start = shiftDate(today, -1)
    const end = shiftDate(today, 1)
    const hotel: Item = {
      id: itemId('stay'),
      kind: 'reservation',
      title: 'Hotel Gracery Shinjuku',
      status: 'booked',
      createdBy: 'user',
      location: {
        name: 'Hotel Gracery Shinjuku',
        address: '1-19-1 Kabukicho, Shinjuku City, Tokyo',
        lat: 35.6949,
        lng: 139.7019,
        category: 'hotel',
        source: 'user',
      },
      reservation: { type: 'hotel', status: 'confirmed', endDate: end },
    }
    const trip = await seedTrip(request, {
      startDate: start,
      endDate: end,
      patch: (t) => ({ days: withDays(t, [[hotel]]) }),
    })
    try {
      await page.goto(`/trips/${trip.id}?tab=essentials`)
      const card = page.getByRole('region', { name: 'Show to a driver' })
      await expect(card).toContainText('Tonight')
      await expect(card).toContainText('Hotel Gracery Shinjuku')
      await expect(card).toContainText('1-19-1 Kabukicho, Shinjuku City, Tokyo')
      await expect(card.getByRole('link', { name: /^Directions to Hotel Gracery Shinjuku/ })).toHaveAttribute('href', /^https:\/\//)
    } finally {
      await deleteTrip(request, trip.id)
    }
  })
})

test.describe('recap', () => {
  test('the recap of a finished trip lists the loved stops and saves a 1200×630 share picture', async ({ page, request }) => {
    const start = shiftDate(isoIn('Asia/Tokyo'), -10)
    const sensoji = place('Senso-ji', 35.7148, 139.7967, { highlight: true })
    const tsukiji = place('Tsukiji breakfast', 35.6655, 139.7707)
    const meiji = place('Meiji Shrine', 35.6764, 139.6993, { highlight: true, status: 'skipped' })
    const shibuya = place('Shibuya Sky', 35.6585, 139.7022, { highlight: true })
    const trip = await seedTrip(request, {
      startDate: start,
      endDate: shiftDate(start, 2),
      patch: (t) => ({ days: withDays(t, [[sensoji, tsukiji], [meiji, shibuya]]) }),
    })
    try {
      await page.goto(`/trips/${trip.id}`)
      await page.getByRole('button', { name: 'More trip options' }).click()
      await page.getByRole('menuitem', { name: 'Trip recap' }).click()

      const recap = page.getByRole('dialog', { name: trip.name })
      await expect(recap, 'skipped stops are not counted as visited').toContainText('3 days · 3 places · 1 city')
      const loved = recap.getByRole('region', { name: 'Loved' }).getByRole('listitem')
      await expect(loved).toHaveCount(2)
      await expect(loved.nth(0)).toContainText('Senso-ji')
      await expect(loved.nth(0)).toContainText('Day 1')
      await expect(loved.nth(1)).toContainText('Shibuya Sky')
      await expect(loved.nth(1)).toContainText('Day 2')
      await expect(recap.getByRole('region', { name: 'Loved' })).not.toContainText('Meiji Shrine')

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        recap.getByRole('button', { name: 'Share as a picture' }).click(),
      ])
      expect(download.suggestedFilename()).toMatch(/-recap\.png$/)
      const png = await readFile(await download.path())
      expect(png.subarray(0, 8).toString('hex'), 'a PNG file').toBe('89504e470d0a1a0a')
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], 'width and height').toEqual([1200, 630])
      await expect(recap.getByRole('status').filter({ hasText: 'Saved the picture to your downloads.' })).toBeVisible()
    } finally {
      await deleteTrip(request, trip.id)
    }
  })
})

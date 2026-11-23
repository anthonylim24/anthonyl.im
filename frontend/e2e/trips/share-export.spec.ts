import { readFile } from 'node:fs/promises'
import {
  DEV_BEARER,
  deleteTrip,
  expect as baseExpect,
  itemId,
  patchTrip,
  place,
  readTrip,
  seedTrip,
  serverTrip,
  test,
  uniqueName,
  type Item,
  type Trip,
} from './fixtures'

// On a loaded machine a cold page or a lazy chunk takes well over the default 5 s.
const expect = baseExpect.configure({ timeout: 15_000 })
test.describe.configure({ timeout: 90_000 })

const AUTH = { Authorization: `Bearer ${DEV_BEARER}` }

type Request = Parameters<typeof seedTrip>[0]

interface Plan {
  trip: Trip
  dayTwoTitle: string
  timed: Item
  untimed: Item
  dinner: Item
  afternoon: Item
  flight: Item
}

/**
 * Day 1: a timed stop, an untimed stop and a booked dinner. Day 2: one timed
 * stop under a title no other trip uses. Day 3: a booked flight that lands in
 * Los Angeles.
 */
async function seedPlan(request: Request): Promise<Plan> {
  const dayTwoTitle = `Lantern alleys ${Date.now().toString(36)}`
  const timed = place('Senso-ji', 35.7148, 139.7967, { time: '09:30', endTime: '11:00' })
  const untimed = place('Ueno Park', 35.7156, 139.7745)
  const dinner: Item = {
    ...place('Sushi dinner', 35.665, 139.77, { time: '19:00', status: 'booked' }),
    id: itemId('booking'),
    kind: 'reservation',
    location: { name: 'Sushi Dai', lat: 35.665, lng: 139.77, source: 'user', category: 'restaurant' },
    reservation: { type: 'restaurant', confirmation: 'ABC123', status: 'confirmed' },
  }
  const afternoon = place('Shibuya Crossing', 35.6595, 139.7005, { time: '14:00' })
  const flight: Item = {
    id: itemId('flight'),
    kind: 'reservation',
    title: 'Flight home',
    time: '17:00',
    endTime: '10:00',
    status: 'booked',
    createdBy: 'user',
    reservation: { type: 'flight', confirmation: 'FL7', status: 'confirmed', endTimezone: 'America/Los_Angeles' },
  }
  const created = await seedTrip(request, { name: uniqueName('share export') })
  try {
    const trip = await patchTrip(request, created.id, {
      days: [
        { ...created.days[0], items: [timed, untimed, dinner] },
        { ...created.days[1], title: dayTwoTitle, items: [afternoon] },
        { ...created.days[2], items: [flight] },
      ],
    })
    return { trip, dayTwoTitle, timed, untimed, dinner, afternoon, flight }
  } catch (error) {
    await deleteTrip(request, created.id)
    throw error
  }
}

interface Calendar {
  text: string
  /** Unfolded content lines. */
  lines: string[]
  /** VEVENT lines by UID. */
  events: Map<string, string[]>
  /** VTIMEZONE lines by TZID. */
  zones: Map<string, string[]>
}

function blocks(lines: string[], name: string): string[][] {
  const out: string[][] = []
  let current: string[] | null = null
  for (const line of lines) {
    if (line === `BEGIN:${name}`) current = []
    else if (line === `END:${name}` && current) {
      out.push(current)
      current = null
    } else current?.push(line)
  }
  return out
}

function field(lines: string[], prefix: string): string | undefined {
  return lines.find((line) => line.startsWith(`${prefix}:`))?.slice(prefix.length + 1)
}

function parseIcs(text: string): Calendar {
  const lines = text.replace(/\r\n[ \t]/g, '').split('\r\n').filter(Boolean)
  const events = new Map(blocks(lines, 'VEVENT').map((event) => [field(event, 'UID') ?? '', event]))
  const zones = new Map(blocks(lines, 'VTIMEZONE').map((zone) => [field(zone, 'TZID') ?? '', zone]))
  return { text, lines, events, zones }
}

async function readDownload(download: { path(): Promise<string | null> }): Promise<string> {
  const path = await download.path()
  if (!path) throw new Error('the download was not saved')
  return readFile(path, 'utf8')
}

const uid = (trip: Trip, item: Item) => `${item.id}.${trip.id}@trips.anthonyl.im`

async function createInvite(request: Request, tripId: string, role: 'viewer' | 'editor'): Promise<string> {
  const res = await request.post(`/api/trips/${tripId}/invites`, { headers: AUTH, data: { role } })
  if (!res.ok()) throw new Error(`POST invites answered ${res.status()}`)
  return ((await res.json()) as { invite: { token: string } }).invite.token
}

test.describe('sharing', () => {
  test('the owner makes a view link and an edit link, copies them, and turns one off, and the server keeps up', async ({
    page,
    request,
  }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    const { trip } = await seedPlan(request)
    try {
      await page.goto(`/trips/${trip.id}`)
      const origin = new URL(page.url()).origin
      const clipboard = () => page.evaluate(() => navigator.clipboard.readText())
      const joinUrl = (token: string) => `${origin}/trips/join/${token}`

      await page.getByRole('button', { name: 'Share', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Share this trip' })
      await expect(dialog.getByRole('radio', { name: 'Can view' })).toHaveAttribute('aria-checked', 'true')
      await expect(dialog.getByRole('textbox', { name: 'Invite link' })).toHaveCount(0)
      await expect(dialog.getByText('Only you so far.')).toBeVisible()

      await dialog.getByRole('button', { name: 'Copy invite link' }).click()
      // The confirmation clears itself after about two seconds, so both halves are awaited together.
      await Promise.all([
        expect(dialog.getByRole('button', { name: 'Link copied' })).toBeVisible(),
        expect(dialog.getByText('Anyone who opens it and signs in joins this trip.')).toBeVisible(),
      ])
      const withViewer = await serverTrip(
        request,
        trip.id,
        (t) => t.invites?.length === 1 && t.invites[0].role === 'viewer',
        'a view link was saved',
      )
      const viewerToken = withViewer.invites![0].token
      await expect(dialog.getByRole('textbox', { name: 'Invite link' })).toHaveValue(joinUrl(viewerToken))
      expect(await clipboard(), 'the view link is on the clipboard').toBe(joinUrl(viewerToken))

      await dialog.getByRole('radio', { name: 'Can edit' }).click()
      await expect(dialog.getByText('Can add, move and remove stops, and use AI.')).toBeVisible()
      await expect(dialog.getByRole('textbox', { name: 'Invite link' })).toHaveCount(0)
      await dialog.getByRole('button', { name: 'Copy invite link' }).click()
      await expect(dialog.getByRole('button', { name: 'Link copied' })).toBeVisible()
      const withBoth = await serverTrip(
        request,
        trip.id,
        (t) => t.invites?.length === 2 && t.invites.some((i) => i.role === 'editor'),
        'an edit link was saved beside the view link',
      )
      const editorToken = withBoth.invites!.find((i) => i.role === 'editor')!.token
      expect(editorToken).not.toBe(viewerToken)
      expect(withBoth.invites!.find((i) => i.role === 'viewer')!.token, 'the view link is unchanged').toBe(viewerToken)
      await expect(dialog.getByRole('textbox', { name: 'Invite link' })).toHaveValue(joinUrl(editorToken))
      expect(await clipboard(), 'the edit link replaced the view link on the clipboard').toBe(joinUrl(editorToken))

      await dialog.getByRole('button', { name: 'Turn off link' }).click()
      await expect(dialog.getByRole('textbox', { name: 'Invite link' })).toHaveCount(0)
      await expect(dialog.getByRole('button', { name: 'Turn off link' })).toHaveCount(0)
      const afterOff = await serverTrip(
        request,
        trip.id,
        (t) => t.invites?.length === 1 && t.invites[0].role === 'viewer',
        'only the view link is left on the server',
      )
      expect(afterOff.invites![0].token).toBe(viewerToken)

      await page.reload()
      await page.getByRole('button', { name: 'Share', exact: true }).click()
      const reopened = page.getByRole('dialog', { name: 'Share this trip' })
      await expect(reopened.getByRole('textbox', { name: 'Invite link' })).toHaveValue(joinUrl(viewerToken))
      await reopened.getByRole('radio', { name: 'Can edit' }).click()
      await expect(reopened.getByRole('textbox', { name: 'Invite link' })).toHaveCount(0)
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('the owner opening their own invite link lands on the trip without joining it', async ({ page, request }) => {
    const { trip } = await seedPlan(request)
    try {
      const token = await createInvite(request, trip.id, 'viewer')
      await page.goto(`/trips/join/${token}`)
      await expect(page).toHaveURL(new RegExp(`/trips/${trip.slug}$`))
      await expect(page.getByRole('textbox', { name: 'Trip name' })).toHaveValue(trip.name)

      const saved = await readTrip(request, trip.id)
      expect(saved.collaborators, 'the owner is not added as their own guest').toEqual([])
      expect(saved.invites?.map((i) => i.token), 'the link still works for others').toEqual([token])
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('an invite link that was turned off, or never existed, says it has expired', async ({ page, request }) => {
    const { trip } = await seedPlan(request)
    try {
      const token = await createInvite(request, trip.id, 'editor')
      const off = await request.delete(`/api/trips/${trip.id}/invites/${token}`, { headers: AUTH })
      expect(off.ok()).toBe(true)

      for (const dead of [token, `never-issued-${Date.now().toString(36)}`]) {
        await page.goto(`/trips/join/${dead}`)
        await expect(page.getByRole('heading', { name: 'This link has expired.' })).toBeVisible()
        await expect(page.getByText('The trip’s owner turned it off or made a new one.')).toBeVisible()
        await expect(page.getByRole('link', { name: 'Go to your trips' })).toHaveAttribute('href', '/trips')
      }
      expect((await readTrip(request, trip.id)).collaborators).toEqual([])
    } finally {
      await deleteTrip(request, trip.id)
    }
  })
})

test.describe('calendar export', () => {
  // A browser zone that is not the trip's, so local times can only come from the trip.
  test.use({ timezoneId: 'America/New_York' })

  test('the trip menu exports timed stops in the trip zone, untimed stops as all-day, and reminders on bookings', async ({
    page,
    request,
  }) => {
    const { trip, timed, untimed, dinner, afternoon, flight } = await seedPlan(request)
    try {
      await page.goto(`/trips/${trip.id}`)
      await page.getByRole('button', { name: 'More trip options' }).click()
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('menuitem', { name: 'Export to calendar' }).click(),
      ])
      expect(download.suggestedFilename()).toBe(`${trip.slug}.ics`)
      const ics = parseIcs(await readDownload(download))

      expect(ics.text.split('\r\n').every((line) => !line.includes('\n')), 'CRLF line endings').toBe(true)
      expect(ics.lines[0]).toBe('BEGIN:VCALENDAR')
      expect(ics.lines).toContain('X-WR-TIMEZONE:Asia/Tokyo')
      expect([...ics.events.keys()].sort()).toEqual([timed, untimed, dinner, afternoon, flight].map((i) => uid(trip, i)).sort())

      const tokyo = ics.zones.get('Asia/Tokyo')
      expect(tokyo, 'a VTIMEZONE for the trip zone').toBeDefined()
      expect(tokyo).toContain('TZOFFSETTO:+0900')

      const morning = ics.events.get(uid(trip, timed))!
      expect(morning).toContain('SUMMARY:Senso-ji')
      expect(morning).toContain('DTSTART;TZID=Asia/Tokyo:20270301T093000')
      expect(morning).toContain('DTEND;TZID=Asia/Tokyo:20270301T110000')
      expect(morning, 'an ordinary stop has no reminder').not.toContain('BEGIN:VALARM')

      const park = ics.events.get(uid(trip, untimed))!
      expect(park).toContain('DTSTART;VALUE=DATE:20270301')
      expect(park).toContain('DTEND;VALUE=DATE:20270302')
      expect(park).not.toContain('BEGIN:VALARM')

      const sushi = ics.events.get(uid(trip, dinner))!
      expect(sushi).toContain('DTSTART;TZID=Asia/Tokyo:20270301T190000')
      expect(sushi).toContain('BEGIN:VALARM')
      expect(sushi, 'an hour before a booked dinner').toContain('TRIGGER:-PT1H')

      expect(ics.events.get(uid(trip, afternoon))).toContain('DTSTART;TZID=Asia/Tokyo:20270302T140000')

      const home = ics.events.get(uid(trip, flight))!
      expect(home).toContain('DTSTART;TZID=Asia/Tokyo:20270303T170000')
      expect(home, 'the flight ends at its arrival, in the arrival zone').toContain('DTEND;TZID=America/Los_Angeles:20270303T100000')
      expect(home, 'three hours before a flight').toContain('TRIGGER:-PT3H')
      expect(ics.zones.get('America/Los_Angeles')).toContain('TZOFFSETTO:-0800')
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test("a day's menu exports only that day, and every export gives a stop the same UID", async ({ page, request }) => {
    const { trip, timed, untimed, dinner } = await seedPlan(request)
    try {
      await page.goto(`/trips/${trip.id}/day/${trip.days[0].id}`)
      const exportFrom = async (menu: string) => {
        await page.getByRole('button', { name: menu }).click()
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          page.getByRole('menuitem', { name: 'Export to calendar' }).click(),
        ])
        return { name: download.suggestedFilename(), ics: parseIcs(await readDownload(download)) }
      }

      const day = await exportFrom('More for day 1')
      expect(day.name).toBe(`${trip.slug}-2027-03-01.ics`)
      const dayOne = [timed, untimed, dinner].map((i) => uid(trip, i)).sort()
      expect([...day.ics.events.keys()].sort(), 'only day 1').toEqual(dayOne)
      expect(day.ics.zones.has('Asia/Tokyo')).toBe(true)

      const first = await exportFrom('More trip options')
      const second = await exportFrom('More trip options')
      const firstUids = [...first.ics.events.keys()].sort()
      expect(firstUids).toHaveLength(5)
      expect([...second.ics.events.keys()].sort(), 'a second export keeps every UID').toEqual(firstUids)
      expect(firstUids, 'the day export used the same UIDs').toEqual(expect.arrayContaining(dayOne))
    } finally {
      await deleteTrip(request, trip.id)
    }
  })
})

test('Copy itinerary puts every day and stop on the clipboard as plain text', async ({ page, request }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const { trip, dayTwoTitle } = await seedPlan(request)
  try {
    await page.goto(`/trips/${trip.id}`)
    await page.getByRole('button', { name: 'More trip options' }).click()
    await page.getByRole('menuitem', { name: 'Copy itinerary' }).click()
    await expect(page.getByText('Itinerary copied').first()).toBeVisible()

    const text = await page.evaluate(() => navigator.clipboard.readText())
    const lines = text.split('\n')
    expect(lines[0]).toBe(trip.name)
    expect(lines[1]).toBe('Mar 1 – 3, 2027 · 3 days')
    const dayAt = (n: number) => lines.findIndex((line) => line.includes(`Day ${n}`))
    expect(dayAt(1)).toBeGreaterThan(1)
    expect(dayAt(2)).toBeGreaterThan(dayAt(1))
    expect(dayAt(3)).toBeGreaterThan(dayAt(2))
    expect(lines[dayAt(2)]).toContain(dayTwoTitle)
    expect(text).toMatch(/^09:30–11:00\s+Senso-ji$/m)
    expect(text).toMatch(/^-\s+Ueno Park$/m)
    expect(text).toMatch(/^19:00\s+Sushi dinner · Sushi Dai · Booked · Conf ABC123$/m)
    expect(text).toMatch(/^14:00\s+Shibuya Crossing$/m)
    expect(text).toMatch(/^17:00–10:00\s+Flight home · Booked · Conf FL7$/m)
  } finally {
    await deleteTrip(request, trip.id)
  }
})

test('Print itinerary lays out every day for the print dialog and clears it away afterwards', async ({ page, request }) => {
  const { trip, dayTwoTitle } = await seedPlan(request)
  try {
    await page.addInitScript(() => {
      // Without WebGL2 the printout draws its chart fallback instead of map stills,
      // which a software GPU on a busy machine can stall for minutes.
      Reflect.deleteProperty(window, 'WebGL2RenderingContext')
      const w = window as unknown as { __prints: { title: string; text: string | null }[] }
      w.__prints = []
      window.print = () => {
        w.__prints.push({ title: document.title, text: document.querySelector('.trips-print-root')?.textContent ?? null })
      }
    })
    await page.goto(`/trips/${trip.id}`)
    const workspaceTitle = `${trip.name} · Trips`
    await expect(page).toHaveTitle(workspaceTitle)
    const prints = () =>
      page.evaluate(() => (window as unknown as { __prints: { title: string; text: string | null }[] }).__prints)

    await page.getByRole('button', { name: 'More trip options' }).click()
    await page.getByRole('menuitem', { name: 'Print itinerary' }).click()
    await expect(page.locator('.trips-print-root')).toHaveCount(1)
    await expect.poll(async () => (await prints()).length, { message: 'print() was called once', timeout: 30_000 }).toBe(1)

    const [printed] = await prints()
    expect(printed.title, 'the PDF is named after the trip').toBe(`${trip.name} itinerary`)
    for (const words of [trip.name, 'Senso-ji', 'Ueno Park', 'Sushi dinner', 'ABC123', dayTwoTitle, 'Shibuya Crossing', 'Flight home']) {
      expect(printed.text, `the printout holds ${words}`).toContain(words)
    }
    for (const n of [1, 2, 3]) expect(printed.text).toContain(`Day ${n}`)

    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
    await expect(page.locator('.trips-print-root')).toHaveCount(0)
    await expect(page).toHaveTitle(workspaceTitle)
    expect(await prints(), 'the dialog opened once').toHaveLength(1)
  } finally {
    await deleteTrip(request, trip.id)
  }
})

test.describe('command palette', () => {
  test('Ctrl/Cmd+K finds a day by its title and choosing it opens that day', async ({ page, request }) => {
    const { trip, dayTwoTitle } = await seedPlan(request)
    try {
      await page.goto(`/trips/${trip.id}`)
      await expect(page.getByRole('textbox', { name: 'Trip name' })).toHaveValue(trip.name)
      await page.keyboard.press('ControlOrMeta+k')
      const palette = page.getByRole('dialog', { name: 'Command palette' })
      const search = palette.getByRole('combobox', { name: 'Search commands' })
      await expect(search).toBeFocused()
      await search.fill(dayTwoTitle.split(' ').slice(0, 2).join(' '))
      const option = palette.getByRole('option', { name: new RegExp(`^Day 2 · .*${dayTwoTitle}`) })
      await expect(option).toBeVisible()
      await option.click()

      await expect(palette).toHaveCount(0)
      await expect(page).toHaveURL(new RegExp(`/trips/${trip.slug}/day/${trip.days[1].id}$`))
      await expect(page.getByRole('textbox', { name: 'Day title' })).toHaveValue(dayTwoTitle)

      await page.keyboard.press('ControlOrMeta+k')
      await expect(palette).toBeVisible()
      await page.keyboard.press('ControlOrMeta+k')
      await expect(palette, 'the same keys close it').toHaveCount(0)
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('a theme command changes the theme, the header toggle follows, and it survives a reload', async ({ page, request }) => {
    const { trip } = await seedPlan(request)
    try {
      await page.goto(`/trips/${trip.id}`)
      const html = page.locator('html')
      await expect(page.getByRole('button', { name: /^Theme: System/ })).toBeVisible()
      await expect(html).not.toHaveClass(/\bdark\b/)

      await page.keyboard.press('ControlOrMeta+k')
      const palette = page.getByRole('dialog', { name: 'Command palette' })
      await palette.getByRole('combobox', { name: 'Search commands' }).fill('dark theme')
      await palette.getByRole('option', { name: /Use dark theme/ }).click()

      await expect(palette).toHaveCount(0)
      await expect(html).toHaveClass(/\bdark\b/)
      await expect(page.getByRole('button', { name: 'Theme: Dark (click for System)' })).toBeVisible()
      await page.reload()
      await expect(page.getByRole('button', { name: 'Theme: Dark (click for System)' })).toBeVisible()
      await expect(html).toHaveClass(/\bdark\b/)
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('? opens the shortcuts sheet, but not while typing in a field', async ({ page, request }) => {
    const { trip } = await seedPlan(request)
    try {
      await page.goto(`/trips/${trip.id}/day/${trip.days[2].id}`)
      const composer = page.getByRole('combobox', { name: 'Add a place, note or booking' })
      await composer.click()
      await page.keyboard.press('?')
      await expect(composer).toHaveValue('?')
      const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
      await expect(sheet).toHaveCount(0)

      await composer.fill('')
      await composer.blur()
      await page.keyboard.press('?')
      await expect(sheet).toBeVisible()
      await expect(sheet.getByText('Open the palette')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(sheet).toHaveCount(0)
    } finally {
      await deleteTrip(request, trip.id)
    }
  })
})

test.describe('header chrome', () => {
  test.use({ colorScheme: 'light' })

  test('the theme toggle cycles System, Light and Dark and keeps the choice across a reload', async ({ page, request }) => {
    const { trip } = await seedPlan(request)
    try {
      await page.goto(`/trips/${trip.id}`)
      const html = page.locator('html')
      const toggle = page.getByRole('button', { name: /^Theme: / })

      await expect(toggle).toHaveAccessibleName('Theme: System (click for Light)')
      await toggle.click()
      await expect(toggle).toHaveAccessibleName('Theme: Light (click for Dark)')
      await expect(html).not.toHaveClass(/\bdark\b/)
      await toggle.click()
      await expect(toggle).toHaveAccessibleName('Theme: Dark (click for System)')
      await expect(html).toHaveClass(/\bdark\b/)

      await page.reload()
      await expect(toggle).toHaveAccessibleName('Theme: Dark (click for System)')
      await expect(html).toHaveClass(/\bdark\b/)
      await toggle.click()
      await expect(toggle).toHaveAccessibleName('Theme: System (click for Light)')
      await expect(html, 'System follows the light device setting').not.toHaveClass(/\bdark\b/)

      await page.reload()
      await expect(toggle).toHaveAccessibleName('Theme: System (click for Light)')
    } finally {
      await deleteTrip(request, trip.id)
    }
  })

  test('the Liquid Glass toggle switches the look and keeps it across a reload', async ({ page, request }) => {
    const { trip } = await seedPlan(request)
    try {
      await page.goto(`/trips/${trip.id}`)
      const html = page.locator('html')
      const glass = page.getByRole('button', { name: 'Liquid Glass look' })

      await expect(glass).toHaveAttribute('aria-pressed', 'false')
      await expect(html).not.toHaveAttribute('data-trips-look')
      await glass.click()
      await expect(glass).toHaveAttribute('aria-pressed', 'true')
      await expect(html).toHaveAttribute('data-trips-look', 'glass')

      await page.reload()
      await expect(glass).toHaveAttribute('aria-pressed', 'true')
      await expect(html).toHaveAttribute('data-trips-look', 'glass')
      await glass.click()
      await expect(glass).toHaveAttribute('aria-pressed', 'false')
      await expect(html).not.toHaveAttribute('data-trips-look')

      await page.reload()
      await expect(glass).toHaveAttribute('aria-pressed', 'false')
    } finally {
      await deleteTrip(request, trip.id)
    }
  })
})

test("a day's menu flies the day in 3D with its stops, and closing leaves no 3D canvas behind", async ({ page, request }) => {
  // The 3D entry waits for an idle main thread, and the scene runs on a software GPU here.
  test.setTimeout(180_000)
  const { trip } = await seedPlan(request)
  try {
    await page.goto(`/trips/${trip.id}/day/${trip.days[0].id}`)
    await expect(page.getByRole('button', { name: 'Fly in 3D' })).toBeVisible({ timeout: 60_000 })
    await page.getByRole('button', { name: 'More for day 1' }).click()
    await page.getByRole('menuitem', { name: 'Fly the day in 3D' }).click()

    const view = page.getByRole('dialog', { name: /^Day 1 in 3D: / })
    await expect(view).toBeVisible()
    const panel = view.getByRole('complementary', { name: 'Stops' })
    await expect(panel.getByRole('button', { name: /^Stop 1: Senso-ji/ })).toBeVisible()
    await expect(panel.getByRole('button', { name: /^Stop 2: Ueno Park/ })).toBeVisible()
    await expect(panel.getByRole('button', { name: /^Stop 3: Sushi dinner/ })).toBeVisible()
    await expect(view.getByText('All 3 stops in view'), 'the scene came up').toBeAttached({ timeout: 90_000 })
    await expect(view.locator('canvas')).toHaveCount(1)

    await view.getByRole('button', { name: 'Close 3D view' }).click()
    await expect(view).toHaveCount(0)
    await expect(page.locator('.photoreal-portal')).toHaveCount(0)
    await expect(page.locator('canvas:not(.maplibregl-canvas)'), 'only the day map keeps a canvas').toHaveCount(0)
  } finally {
    await deleteTrip(request, trip.id)
  }
})

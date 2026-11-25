import { deleteTrip, expect, patchTrip, place, readTrip, seedTrip, serverTrip, test } from './fixtures'

test('a note added from the day composer saves and survives a reload', async ({ page, request }) => {
  const trip = await seedTrip(request)
  try {
    await page.goto(`/trips/${trip.id}/day/${trip.days[0].id}`)
    const composer = page.getByRole('combobox', { name: 'Add a place, note or link' })
    await composer.fill('Pick up rail pass')
    await page.getByRole('option', { name: 'Add as a note' }).click()

    const plan = page.getByRole('region', { name: 'Day 1 plan' })
    await expect(plan.getByText('Pick up rail pass')).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: /^Saved$/ }).first()).toBeVisible()

    const saved = await serverTrip(
      request,
      trip.id,
      (t) => t.days[0].items.some((i) => i.kind === 'note' && i.title === 'Pick up rail pass'),
      'the note reached the server',
    )
    expect(saved.days[1].items, 'other days untouched').toEqual([])

    await page.reload()
    await expect(page.getByRole('region', { name: 'Day 1 plan' }).getByText('Pick up rail pass')).toBeVisible()
  } finally {
    await deleteTrip(request, trip.id)
  }
})

test('typing while a save is on its way sends each save once', async ({ page, request }) => {
  const trip = await seedTrip(request)
  try {
    const sent: { base: string; title: string | undefined }[] = []
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route(`**/api/trips/${trip.id}`, async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback()
      const body = route.request().postDataJSON() as { baseUpdatedAt: string; days: { title?: string }[] }
      sent.push({ base: body.baseUpdatedAt, title: body.days[0]?.title })
      if (sent.length === 1) await held
      await route.fallback()
    })

    await page.goto(`/trips/${trip.id}/day/${trip.days[0].id}`)
    const title = page.getByRole('textbox', { name: 'Day title' })
    await title.fill('Ky')
    await expect.poll(() => sent.length, { message: 'the first save went out' }).toBe(1)
    await title.fill('Kyoto')
    // Past the 900 ms save debounce: a repeated PATCH would have gone out by now.
    await page.waitForTimeout(1500)
    release()

    await serverTrip(request, trip.id, (t) => t.days[0].title === 'Kyoto', 'the last title reached the server')
    await expect(page.getByRole('status').filter({ hasText: /^Saved$/ }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /keep mine/i })).toHaveCount(0)
    expect(sent.map((s) => s.title), 'one PATCH per version, none repeated').toEqual(['Ky', 'Kyoto'])
    expect(sent[1].base, 'the second save is based on the first one').not.toBe(sent[0].base)
  } finally {
    await deleteTrip(request, trip.id)
  }
})

test("undo after another device's change takes back only the traveller's step", async ({ page, request }) => {
  const trip = await seedTrip(request, {
    patch: (t) => ({
      days: t.days.map((d, i) => (i === 0 ? { ...d, items: [place('Fish market', 35.665, 139.77), place('Tea house', 35.67, 139.76)] } : d)),
    }),
  })
  try {
    const teaHouse = trip.days[0].items[1]
    await page.goto(`/trips/${trip.id}/day/${trip.days[0].id}`)
    const title = page.getByRole('textbox', { name: 'Day title' })
    await title.fill('Market')
    await serverTrip(request, trip.id, (t) => t.days[0].title === 'Market', 'the first title saved')

    const current = await readTrip(request, trip.id)
    await patchTrip(request, trip.id, {
      baseUpdatedAt: current.updatedAt,
      days: current.days.map((d, i) => (i === 0 ? { ...d, items: d.items.map((it) => (it.id === teaHouse.id ? { ...it, title: 'Tea house (renamed elsewhere)' } : it)) } : d)),
    })

    await title.fill('Market day')
    await serverTrip(request, trip.id, (t) => t.days[0].title === 'Market day', 'the second title saved over their copy')
    await title.fill('Market day out')
    await serverTrip(request, trip.id, (t) => t.days[0].title === 'Market day out', 'the third title saved')

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('ControlOrMeta+z')

    const after = await serverTrip(request, trip.id, (t) => t.days[0].title !== 'Market day out', 'the undo saved')
    expect(after.days[0].items.find((i) => i.id === teaHouse.id)?.title, "the other device's rename survives undo").toBe(
      'Tea house (renamed elsewhere)',
    )
  } finally {
    await deleteTrip(request, trip.id)
  }
})

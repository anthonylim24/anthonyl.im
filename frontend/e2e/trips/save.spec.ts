import { deleteTrip, expect, seedTrip, serverTrip, test } from './fixtures'

test('a note added from the day composer saves and survives a reload', async ({ page, request }) => {
  const trip = await seedTrip(request)
  try {
    await page.goto(`/trips/${trip.id}/day/${trip.days[0].id}`)
    const composer = page.getByRole('combobox', { name: 'Add a place, note or booking' })
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

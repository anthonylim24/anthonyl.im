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

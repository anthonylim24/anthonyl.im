import { act, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearBoot, paintBoot } from '@/test/bootPage'

const clerk = vi.hoisted(() => ({ isLoaded: false }))

vi.mock('@/lib/clerk', () => ({ CLERK_ENABLED: true, CLERK_PROXY_URL: undefined, CLERK_PUBLISHABLE_KEY: 'pk_test' }))
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ isLoaded: clerk.isLoaded }),
  SignIn: () => (clerk.isLoaded ? <form aria-label="Sign in" /> : null),
  SignUp: () => (clerk.isLoaded ? <form aria-label="Sign up" /> : null),
}))

import { AuthPage } from '../AuthPage'

const page = () => (
  <MemoryRouter initialEntries={['/sign-in']}>
    <AuthPage mode="sign-in" />
  </MemoryRouter>
)

afterEach(() => {
  clerk.isLoaded = false
  clearBoot()
})

describe('the sign-in page', () => {
  it('keeps the boot screen up, at its sign-in step, until Clerk can draw the form', async () => {
    const boot = paintBoot('/sign-in')
    const view = render(page())
    expect(boot).toHaveAttribute('data-step', 'auth')
    expect(boot).toHaveAttribute('data-state', 'showing')

    clerk.isLoaded = true
    view.rerender(page())
    await act(async () => {})
    expect(view.getByRole('form', { name: 'Sign in' })).toBeInTheDocument()
    expect(boot).toHaveAttribute('data-state', 'leaving')
  })
})

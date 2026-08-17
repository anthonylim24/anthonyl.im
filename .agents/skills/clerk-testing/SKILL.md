---
name: clerk-testing
description: E2E testing for Clerk apps. Use with Playwright or Cypress for auth flow
  tests.
allowed-tools: WebFetch
license: MIT
metadata:
  author: clerk
  version: 1.2.0
compatibility: Requires CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY
---

# Testing

## Decision Tree

| Framework | Documentation |
|-----------|---------------|
| Overview | https://clerk.com/docs/guides/development/testing/overview |
| Playwright | https://clerk.com/docs/guides/development/testing/playwright/overview |
| Cypress | https://clerk.com/docs/guides/development/testing/cypress/overview |

## Mental Model

Test auth = isolated session state. Each test needs fresh auth context.
- Required env: `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` (test instance keys only)
- `clerkSetup()` initializes the test environment and retrieves a Testing Token
- `setupClerkTestingToken()` injects that token to bypass bot detection
- `storageState` persists auth between tests for speed
- `CLERK_TESTING_TOKEN` is optional: set it only to override `clerkSetup()` with a token you minted via the Backend API. Do not require a Dashboard-issued Testing Token.

## Workflow

1. Identify test framework (Playwright or Cypress)
2. Confirm `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are set (`pk_test_*` / `sk_test_*`)
3. WebFetch the appropriate URL from decision tree above
4. Follow official setup instructions (`clerkSetup()` obtains the Testing Token)
5. Use `pk_test_*` and `sk_test_*` keys only

## Best Practices

- Use `setupClerkTestingToken()` before navigating to auth pages
- Use test API keys: `pk_test_xxx`, `sk_test_xxx`
- Save auth state with `storageState` for faster tests
- Use `page.waitForSelector('[data-clerk-component]')` for Clerk UI

## Anti-Patterns

| Pattern | Problem | Fix |
|---------|---------|-----|
| Production keys in tests | Security risk | Use `pk_test_*` keys |
| No `setupClerkTestingToken()` | Auth fails | Call before navigation |
| UI-based sign-in every test | Slow tests | Use `storageState` |

## Framework-Specific

**Playwright**: Use `globalSetup` for auth state
**Cypress**: Add `addClerkCommands({ Cypress, cy })` to support file

## See Also

- `clerk-setup` - Install Clerk before adding tests
- `clerk-nextjs-patterns` - Next.js patterns being tested
- [Demo Repo](https://github.com/clerk/clerk-playwright-nextjs/tree/main/e2e)

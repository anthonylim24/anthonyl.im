# B2B Billing Patterns

## Overview

B2B billing in Clerk attaches subscriptions to **organizations**, not individual users. Each org gets its own subscription. Plans can carry a **seat limit** (membership cap) which Clerk enforces on member invites.

> **Create the plan as an Organization Plan, not a User Plan.** Use [Dashboard → Billing → Plans](https://dashboard.clerk.com/last-active?path=billing/plans) (Organization Plans tab). Slugs are scoped per type. A `team` plan registered under User Plans will not appear in `<PricingTable for="organization" />`, and vice versa. Plan type cannot be changed after creation, recreate if misplaced.

## Core Pattern: Org-Level Plan Check

```typescript
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function TeamDashboard() {
	const { orgId, has } = await auth()

	if (!orgId) {
		redirect('/sign-in')
	}

	if (!has({ plan: 'org:team' })) {
		redirect('/billing')
	}

	return <TeamFeatures />
}
```

**Always check `orgId` first.** If the user has no active org, `has({ plan })` evaluates against the user's personal subscription (which may not exist).

## Seat-based Organization Plans

Organization Plans support **seat limits** and **per-seat pricing**. Use them independently or together — a fixed-price seat cap is not the only model.

### Seat limits (fixed-price cap)

A plan can have a fixed price and an optional membership cap; Clerk enforces the cap at invite/join time. Adding members does not increment the org's billing amount unless per-seat pricing is also enabled. To charge larger orgs more without per-seat fees, create tiered plans (e.g. `starter` capped at 5, `team` at 10, `enterprise` unlimited) with increasing fixed prices.

### Per-seat pricing

A plan can charge based on purchased seats. Configure any combination of:

- **Base fee** — recurring plan price
- **Per-seat fee** — cost per member seat
- **Included seats** — seats covered by the base fee before per-seat charges apply
- **Seat limit** — maximum seats (optional; use unlimited members for no cap)

Example: $20/mo base + $8/mo per seat, 2 included seats, 10-seat limit → 1 member = $20, 3 members = $28, 10 members = $84.

**SDK requirements for per-seat Billing Plans:** `@clerk/nextjs` v7.5.1+, `@clerk/clerk-js` v6.16.0+, `@clerk/ui` v1.16.0+ (also `@clerk/react` v6.9.0+). Pin or upgrade before using per-seat plans.

Key invariants:
- **One `active` SubscriptionItem per payer per Plan.** Do not derive seat count from `items.length`.
- **Seat limit and per-seat fee are Plan properties.** Set them when creating the plan (Dashboard → Billing → Plans → Organization Plans tab); seat limit cannot be changed later.
- When an org exceeds or changes to a plan with a lower limit, existing members stay but new invites are blocked until the org is under cap. See [Seat-based Plans](https://clerk.com/docs/guides/billing/seat-based-plans) for admin behavior, proration, and renewal seat adjustment.

No custom seat-counting code is needed. Read the active plan with `has({ plan: 'org:team' })` and let Clerk enforce membership limits and seat purchases.

## Org Billing Page

Use `<OrganizationProfile />` for the org account billing UI. It renders the active org plan, members, invitations, and the upgrade / cancellation flow scoped to the active organization, with admin-only access to billing actions enforced by Clerk:

```tsx
import { OrganizationProfile } from '@clerk/nextjs'

export default function OrgAccountPage() {
	return <OrganizationProfile />
}
```

Organization Plans configured in Dashboard → Billing → Plans automatically appear inside `<OrganizationProfile />` (in the **Plans** section). Only org admins see the billing controls. Build a custom page only when you need branded layouts or to embed `<PricingTable for="organization" />` outside the OrganizationProfile shell.

## Webhook: Org Subscription Events

```typescript
if (evt.type === 'subscription.created') {
	const { id, payer, items, status } = evt.data
	if (payer.organization_id) {
		const plan = items[0]?.plan?.slug
		await db.orgSubscriptions.upsert({
			where: { orgId: payer.organization_id },
			create: {
				orgId: payer.organization_id,
				plan,
				subscriptionId: id,
				status,
			},
			update: { plan, subscriptionId: id, status },
		})
	}
}

if (evt.type === 'subscription.updated') {
	const { id, payer, items, status } = evt.data
	if (payer.organization_id) {
		const plan = items[0]?.plan?.slug
		await db.orgSubscriptions.update({
			where: { orgId: payer.organization_id },
			data: { plan, status },
		})
	}
}
```

Use `payer.organization_id` (nested under `payer`, not a top-level `org_id`) when the subscription belongs to an organization. Do NOT use `items.length` as a seat count, seat limits are set at the plan level and there is only one active SubscriptionItem per payer per Plan.

## Plan Naming for B2B

Tier plans by seat cap so bigger orgs pay more:

| Plan | Slug | Seat cap |
|------|------|-------|
| Startup | `org:starter` | 5 |
| Team | `org:team` | 10 |
| Business | `org:business` | 25 |
| Enterprise | `org:enterprise` | unlimited (requires B2B Authentication add-on) |

Define these via Dashboard → Billing → Plans → **Organization Plans** tab with **Seat-based** toggled on. Use the `org:` prefix in slugs to disambiguate org plans from user plans in code (`has({ plan: 'org:team' })` vs `has({ plan: 'team' })`). Seat caps above 20 and "unlimited" require the B2B Authentication add-on.

## Common Mistake: Checking Plan Without Active Org

```typescript
// WRONG, user has no active org, has() checks user subscription
const { has } = await auth()
if (!has({ plan: 'org:team' })) redirect('/billing')

// CORRECT, check orgId first
const { orgId, has } = await auth()
if (!orgId) redirect('/sign-in')
if (!has({ plan: 'org:team' })) redirect('/billing')
```

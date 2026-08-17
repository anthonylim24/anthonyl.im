---
name: clerk-webhooks
description: Clerk webhooks for real-time events and data syncing. Verify with verifyWebhook
  from the framework-specific package. Handle user, session, organization, billing, and
  payment events. Build event-driven features like database sync, notifications, and
  integrations.
allowed-tools: WebFetch
license: MIT
metadata:
  author: clerk
  version: 1.2.0
compatibility: Requires CLERK_WEBHOOK_SIGNING_SECRET (svix signing secret from Clerk dashboard)
---

# Webhooks

Output complete, working webhook handlers with `verifyWebhook(req)` verification in every handler.

## When to Use Webhooks

Webhooks are **asynchronous and eventually consistent**. Delivery is fast but not guaranteed to be immediate, and may occasionally fail (Svix retries on a fixed schedule). Use them for:

- Database sync (a separate users / orgs table that follows Clerk)
- Notifications (welcome emails, Slack pings, internal alerts)
- Integrations triggered by lifecycle events

Do NOT rely on webhook delivery as part of a synchronous flow such as onboarding ("user signs up, then we read X from our DB"). For data the user just created, read it from the [Clerk session token](https://clerk.com/docs/guides/sessions/session-tokens) or call the Backend API directly. Webhooks fill the gap when you need data about *other* users or events the session token doesn't carry.

## Verify Every Webhook

Use `verifyWebhook(req)` from the framework-specific package (`@clerk/nextjs/webhooks`, `@clerk/express/webhooks`, etc.). It reads `CLERK_WEBHOOK_SIGNING_SECRET` automatically and throws on bad signatures. Skipping verification, even for notification-only handlers, exposes the endpoint to spoofed events.

## Make the Webhook Route Public

Webhook routes must be excluded from Clerk middleware protection. Without this, Clerk returns 401.

```typescript
// proxy.ts (Next.js <=15: middleware.ts)
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher(['/api/webhooks(.*)'])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) await auth.protect()
})
```

## Complete Webhook Handler (Next.js App Router)

`skipDuplicates: true` only suppresses replays when `webhookReceipts.svixId` has a unique database constraint (`@@unique([svixId])` in Prisma, or equivalent). Apply that constraint before using any of the receipt examples below.

```typescript
// app/api/webhooks/route.ts
import { verifyWebhook } from '@clerk/nextjs/webhooks'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  // ALWAYS verify - never skip, even for notification-only handlers
  let evt
  try {
    evt = await verifyWebhook(req) // uses CLERK_WEBHOOK_SIGNING_SECRET automatically
  } catch (err) {
    console.error('Webhook verification failed:', err)
    return new Response('Verification failed', { status: 400 })
  }

  const svixId = req.headers.get('svix-id')
  if (!svixId) return new Response('Missing svix-id', { status: 400 })

  await db.$transaction(async (tx) => {
    // Requires unique(webhookReceipts.svixId)
    const receipt = await tx.webhookReceipts.createMany({
      data: [{ svixId, eventType: evt.type }],
      skipDuplicates: true,
    })
    if (receipt.count === 0) return // replay — already processed

    if (evt.type === 'user.created' || evt.type === 'user.updated') {
      const { id, email_addresses, primary_email_address_id, first_name, last_name } = evt.data
      const email = email_addresses.find((e) => e.id === primary_email_address_id)?.email_address
      if (!email) return
      const name = `${first_name ?? ''} ${last_name ?? ''}`.trim()
      await tx.users.upsert({
        where: { clerkId: id },
        create: { clerkId: id, email, name },
        update: { email, name },
      })
    }

    if (evt.type === 'user.deleted') {
      const { id } = evt.data
      await tx.users.upsert({
        where: { clerkId: id },
        create: { clerkId: id, deletedAt: new Date() },
        update: { deletedAt: new Date() },
      })
    }

    if (evt.type === 'organizationMembership.created') {
      const { organization, public_user_data, role } = evt.data
      const orgId = organization.id
      const userId = public_user_data.user_id
      await tx.teamMembers.upsert({
        where: { orgId_userId: { orgId, userId } },
        create: { orgId, userId, role },
        update: { role },
      })
    }

    if (evt.type === 'organizationMembership.deleted') {
      const { organization, public_user_data } = evt.data
      const orgId = organization.id
      const userId = public_user_data.user_id
      await tx.teamMembers.upsert({
        where: { orgId_userId: { orgId, userId } },
        create: { orgId, userId, leftAt: new Date() },
        update: { leftAt: new Date() },
      })
    }
  })

  return new Response('OK', { status: 200 })
}
```

## Full Example: Welcome Email (Resend) + Slack Notification on user.created

Notification-only handlers still verify the signature. Same pattern as the database-sync handler:

```typescript
// app/api/webhooks/route.ts
import { verifyWebhook } from '@clerk/nextjs/webhooks'
import { NextRequest } from 'next/server'
import { Resend } from 'resend'
import { db } from '@/lib/db'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  // Step 1: ALWAYS verify the webhook signature - NEVER skip this
  let evt
  try {
    evt = await verifyWebhook(req) // uses CLERK_WEBHOOK_SIGNING_SECRET env var
  } catch (err) {
    console.error('Webhook verification failed:', err)
    return new Response('Verification failed', { status: 400 })
  }

  const svixId = req.headers.get('svix-id')
  if (!svixId) return new Response('Missing svix-id', { status: 400 })

  // Step 2: Listen for user.created event
  if (evt.type === 'user.created') {
    // Step 3: Extract primary email and name from webhook payload
    const { email_addresses, primary_email_address_id, first_name, last_name } = evt.data
    const email = email_addresses.find((e) => e.id === primary_email_address_id)?.email_address
    const name = `${first_name ?? ''} ${last_name ?? ''}`.trim()
    if (!email) {
      return new Response('OK', { status: 200 })
    }

    // Step 4: Enqueue notifications on an idempotent outbox in the same
    // transaction as the svix-id receipt. A worker sends Resend / Slack.
    // Do not call those APIs in the request path before returning 2xx.
    await db.$transaction(async (tx) => {
      // Requires unique(webhookReceipts.svixId)
      const receipt = await tx.webhookReceipts.createMany({
        data: [{ svixId, eventType: evt.type }],
        skipDuplicates: true,
      })
      if (receipt.count === 0) return

      await tx.outbox.create({
        data: { svixId, kind: 'welcome_email', payload: { email, name } },
      })
      await tx.outbox.create({
        data: { svixId: `${svixId}:slack`, kind: 'slack_new_user', payload: { email, name } },
      })
    })
  }

  // Always return 200 to acknowledge receipt
  return new Response('OK', { status: 200 })
}

// Worker (separate process): claim one pending job atomically, then send.
// const job = await db.$transaction(async (tx) => {
//   const next = await tx.outbox.findFirst({ where: { processedAt: null, claimedAt: null } })
//   if (!next) return null
//   const claimed = await tx.outbox.updateMany({
//     where: { id: next.id, processedAt: null, claimedAt: null },
//     data: { claimedAt: new Date() },
//   })
//   return claimed.count === 1 ? next : null
// })
// try {
//   if (job?.kind === 'welcome_email') {
//     await resend.emails.send({
//       from: 'noreply@yourdomain.com',
//       to: job.payload.email,
//       subject: 'Welcome!',
//       html: `<p>Hi ${job.payload.name}, welcome to our app!</p>`,
//     })
//   }
//   if (job?.kind === 'slack_new_user') {
//     await fetch(process.env.SLACK_WEBHOOK_URL!, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ text: `New user signed up: ${job.payload.name} (${job.payload.email})` }),
//     })
//   }
//   if (job) await db.outbox.update({ where: { id: job.id }, data: { processedAt: new Date() } })
// } catch {
//   if (job) {
//     await db.outbox.update({
//       where: { id: job.id },
//       data: { claimedAt: null, attempts: { increment: 1 } },
//     })
//   }
// }
```

**Also include proxy.ts (Next.js <=15: middleware.ts) to make the route public:**
```typescript
// proxy.ts (Next.js <=15: middleware.ts)
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
const isPublicRoute = createRouteMatcher(['/api/webhooks(.*)'])
export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) await auth.protect()
})
```

## Full Example: Organization Membership Sync to Database

```typescript
// app/api/webhooks/route.ts
import { verifyWebhook } from '@clerk/nextjs/webhooks'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db' // your database client

export async function POST(req: NextRequest) {
  // ALWAYS verify signature - never skip, even for simple handlers
  let evt
  try {
    evt = await verifyWebhook(req) // uses CLERK_WEBHOOK_SIGNING_SECRET env var
  } catch (err) {
    console.error('Webhook verification failed:', err)
    return new Response('Verification failed', { status: 400 })
  }

  const svixId = req.headers.get('svix-id')
  if (!svixId) return new Response('Missing svix-id', { status: 400 })

  await db.$transaction(async (tx) => {
    // Requires unique(webhookReceipts.svixId)
    const receipt = await tx.webhookReceipts.createMany({
      data: [{ svixId, eventType: evt.type }],
      skipDuplicates: true,
    })
    if (receipt.count === 0) return

    if (evt.type === 'organization.created') {
      const { id, name } = evt.data
      await tx.workspaces.upsert({
        where: { orgId: id },
        create: { orgId: id, name, createdAt: new Date() },
        update: { name },
      })
    }

    if (evt.type === 'organizationMembership.created') {
      const { organization, public_user_data, role } = evt.data
      const orgId = organization.id
      const userId = public_user_data.user_id

      await tx.team_members.upsert({
        where: { orgId_userId: { orgId, userId } },
        create: { orgId, userId, role },
        update: { role },
      })

      await tx.workspaces.upsert({
        where: { orgId_userId: { orgId, userId } },
        create: { orgId, userId, createdAt: new Date() },
        update: {},
      })
    }

    if (evt.type === 'organizationMembership.deleted') {
      const { organization, public_user_data } = evt.data
      const orgId = organization.id
      const userId = public_user_data.user_id

      await tx.team_members.upsert({
        where: { orgId_userId: { orgId, userId } },
        create: { orgId, userId, leftAt: new Date() },
        update: { leftAt: new Date() },
      })

      await tx.workspaces.upsert({
        where: { orgId_userId: { orgId, userId } },
        create: { orgId, userId, leftAt: new Date() },
        update: { leftAt: new Date() },
      })
    }
  })

  // Return 200 status on success
  return new Response('OK', { status: 200 })
}
```

## Other Frameworks

For Express, Astro, Fastify, Nuxt, React Router, and TanStack Start, use the framework-specific `verifyWebhook` adapter. Each Clerk SDK package ships its own (`@clerk/express/webhooks`, `@clerk/astro/webhooks`, `@clerk/fastify/webhooks`, etc.).

See `references/frameworks.md` for full handler examples per framework.

## Type Narrowing for `evt.data`

`verifyWebhook` returns `WebhookEvent`, a discriminated union of all event types. Narrow with `evt.type` to get type-safe access to `evt.data`:

```typescript
const evt = await verifyWebhook(req)

if (evt.type === 'user.created') {
  // evt.data is now UserJSON, autocompletes id, email_addresses, etc.
  console.log(evt.data.id)
}
```

For manual typing of nested payloads, import the JSON types from your framework's webhook subpath: `DeletedObjectJSON`, `EmailJSON`, `OrganizationInvitationJSON`, `OrganizationJSON`, `OrganizationMembershipJSON`, `SessionJSON`, `SMSMessageJSON`, `UserJSON`.

## Payload Field Reference

### User events (`user.created`, `user.updated`, `user.deleted`)
```typescript
const {
  id,                       // Clerk user ID
  email_addresses,          // array; pick the entry whose id === primary_email_address_id
  primary_email_address_id, // do not assume email_addresses[0] is primary
  first_name,
  last_name,
  image_url,
  public_metadata,
} = evt.data
// const email = email_addresses.find((e) => e.id === primary_email_address_id)?.email_address
// if (!email) { /* skip DB write / notification / logging */ }
```

### Organization events (`organization.created`, `organization.updated`, `organization.deleted`)
```typescript
const {
  id,    // org ID
  name,  // org name
  slug,
} = evt.data
```

### Organization Membership events (`organizationMembership.created`, `organizationMembership.updated`, `organizationMembership.deleted`)
```typescript
const {
  organization,        // { id, name, ... }
  public_user_data,    // { user_id, first_name, last_name, ... }
  role,                // e.g. 'org:admin', 'org:member'
} = evt.data
// Access: organization.id, public_user_data.user_id, role
```

## Supported Events (Full Catalog)

**User**: `user.created` `user.updated` `user.deleted`

**Session**: `session.created` `session.ended` `session.removed` `session.revoked`

**Organization**: `organization.created` `organization.updated` `organization.deleted`

**Organization Membership**: `organizationMembership.created` `organizationMembership.updated` `organizationMembership.deleted`

**Organization Domain**: `organizationDomain.created` `organizationDomain.updated` `organizationDomain.deleted`

**Organization Invitation**: `organizationInvitation.accepted` `organizationInvitation.created` `organizationInvitation.revoked`

**Communication**: `email.created` `sms.created`

**Waitlist**: `waitlistEntry.created` `waitlistEntry.updated`

**Permission**: `permission.created` `permission.updated` `permission.deleted`

**Role**: `role.created` `role.updated` `role.deleted`

**Subscription**: `subscription.created` `subscription.updated` `subscription.active` `subscription.pastDue`

**Subscription Item**: `subscriptionItem.created` `subscriptionItem.active` `subscriptionItem.updated` `subscriptionItem.canceled` `subscriptionItem.upcoming` `subscriptionItem.ended` `subscriptionItem.abandoned` `subscriptionItem.incomplete` `subscriptionItem.pastDue` `subscriptionItem.freeTrialEnding`

**Payment**: `paymentAttempt.created` `paymentAttempt.updated`

## Webhook Reliability

**Retries**: Svix retries failed webhooks on a set schedule (see [Svix Retry Schedule](https://docs.svix.com/retries)). Return 2xx to succeed, 4xx/5xx to retry. Store a receipt keyed by the `svix-id` header in the same transaction as idempotent projection writes so retried events do not double-apply.

**Replay**: Failed webhooks can be replayed from Dashboard.

## Common Pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| Verification fails (Next.js) | Wrong import or usage | Use `@clerk/nextjs/webhooks`, pass `req` directly |
| Verification fails (Express) | Using `express.json()` | Use `express.raw({ type: 'application/json' })` for webhook route |
| Route not found (404) | Wrong path | Use `/api/webhooks` or preserve existing path |
| Not authorized (401) | Route is protected by middleware | Make route public in `clerkMiddleware()` |
| No data in DB | Async job pending | Wait/check logs |
| Duplicate entries | Only handling `user.created` | Also handle `user.updated` |
| Timeouts | Handler too slow | Queue async work, return 200 first |

## Testing & Deployment

**Local**: Use the Clerk CLI's first-party tunnel — no auth or linked project needed:

```sh
clerk webhooks listen --token "$(clerk webhooks token)" --forward-to http://localhost:3000/api/webhooks
```

Add the printed relay URL (`https://webhooks.clerk.com/in/c_.../`) as a webhook endpoint in the Dashboard — events don't flow until you do. `svix-*` headers are preserved, so `verifyWebhook()` works against that endpoint's signing secret as usual. Flags, offline signature checks (`clerk webhooks verify`), and agent-mode behavior are in the `clerk-cli` skill. Without the CLI, tunnel `localhost:3000` yourself (`ngrok`, `localtunnel`, `Cloudflare Tunnel`) and add the public URL to the Dashboard endpoint.

**Production**: Update webhook endpoint URL to production domain. Copy `CLERK_WEBHOOK_SIGNING_SECRET` to production env vars.

## References

| Reference | Description |
|-----------|-------------|
| `references/frameworks.md` | Webhook handler examples for Express, Astro, Fastify, Nuxt, React Router, TanStack Start |

## See Also

- `clerk-cli` - `clerk webhooks listen`/`verify` for local webhook testing
- `clerk-setup` - Initial Clerk install
- `clerk-orgs` - Org membership events
- `clerk-billing` - Subscription, subscription item, and payment attempt events
- `clerk-backend-api` - Sync via direct API calls
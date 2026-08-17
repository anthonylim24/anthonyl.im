# Pinia Integration

## Auth Store (Thin Wrapper)

Wrap `useAuth` in a Pinia store for app-wide access without prop drilling:

```ts
// stores/auth.ts
import { defineStore } from 'pinia'
import { useAuth, useUser } from '@clerk/vue'

export const useAuthStore = defineStore('auth', () => {
  const { isSignedIn, isLoaded, userId, signOut, getToken } = useAuth()
  const { user } = useUser()

  return {
    isSignedIn,
    isLoaded,
    userId,
    user,
    signOut,
    getToken,
  }
})
```

Usage in components:

```vue
<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
</script>

<template>
  <p v-if="auth.isSignedIn">{{ auth.user?.firstName }}</p>
</template>
```

## Org Store

```ts
// stores/org.ts
import { computed } from 'vue'
import { defineStore } from 'pinia'
import { useClerk, useOrganization, useUser } from '@clerk/vue'

export const useOrgStore = defineStore('org', () => {
  const clerk = useClerk()
  const { organization, membership, isLoaded } = useOrganization()
  const { user } = useUser()
  const memberships = computed(() => user.value?.organizationMemberships ?? [])

  function switchOrg(orgId: string) {
    return clerk.value?.setActive({ organization: orgId })
  }

  return {
    isLoaded,
    organization,
    membership,
    memberships,
    switchOrg,
  }
})
```

## CRITICAL

- Do NOT copy `userId` into Pinia state manually — it creates a stale copy. Always return refs directly from composables
- Pinia store `setup()` function runs inside Vue's setup context — composables work correctly here

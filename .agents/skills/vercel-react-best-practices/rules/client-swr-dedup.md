---
title: Use SWR for Automatic Deduplication
impact: MEDIUM-HIGH
impactDescription: automatic deduplication
tags: client, swr, deduplication, data-fetching
---

> **anthonyl.im override (wins):** This app has no SWR. Do **not** add `swr`. Deduplicate `/api` with Effect (`requestJson` / `fetchApi`) and a latest-request-wins sequence guard. See [`effect-ts`](../../effect-ts/SKILL.md) and [`../SKILL.md`](../SKILL.md).

## Automatic Deduplication (not SWR)

**Incorrect (no deduplication, each instance fetches):**

```tsx
function UserList() {
  const [users, setUsers] = useState([])
  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(setUsers)
  }, [])
}
```

**Correct in this repo:** put the request in a `*Api.ts` module (`Effect.fn` + `runPromise`). In the React loader, ignore stale responses:

```tsx
let seq = 0

async function refresh(getToken: () => Promise<string | null>) {
  const id = ++seq
  const data = await listTrips(getToken)
  if (id !== seq) return
  setTrips(data)
}
```

<details>
<summary>Upstream SWR examples (do not copy in this repo)</summary>

```tsx
import useSWR from 'swr'
const { data: users } = useSWR('/api/users', fetcher)
```

```tsx
import { useSWRMutation } from 'swr/mutation'
const { trigger } = useSWRMutation('/api/user', updateUser)
```

Reference: [https://swr.vercel.app](https://swr.vercel.app)

</details>

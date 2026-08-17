---
title: Use SWR for Automatic Deduplication
impact: MEDIUM-HIGH
impactDescription: automatic deduplication
tags: client, swr, deduplication, data-fetching
---

> **anthonyl.im override (wins):** This app has no SWR. Do **not** add `swr`. Put `/api` calls in a `*Api.ts` module (`requestJson` / `fetchApi`). Overlapping loaders use a **per-loader** `useRef` sequence guard (latest-request-wins) so a slower older response cannot overwrite a newer one. That is stale-response suppression, not SWR-style request coalescing. See [`effect-ts`](../../effect-ts/SKILL.md) and [`../SKILL.md`](../SKILL.md). Live example: `frontend/src/pages/Korea/Places.tsx` (`loadSeq`).

## Latest-request-wins (not SWR)

**Incorrect (no guard, each instance fetches and every response commits):**

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

**Correct in this repo:** keep the sequence counter on the loader (a `useRef` in the hook/component), not a shared module `let seq`. Two loaders must not share one counter.

```tsx
function TripList({ getToken }: { getToken: () => Promise<string | null> }) {
  const [trips, setTrips] = useState<Trip[]>([])
  const loadSeq = useRef(0)

  async function refresh() {
    const seq = ++loadSeq.current
    const data = await listTrips(getToken)
    if (seq !== loadSeq.current) return
    setTrips(data)
  }
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

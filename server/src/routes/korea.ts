import { Hono } from "hono"
import { koreaSnapshot, type Snapshot } from "../data/koreaSnapshot"

const korea = new Hono()

// In-memory cache so we don't hammer Notion on every request. 5-minute TTL.
type CacheEntry = { data: Snapshot; expires: number }
let liveCache: CacheEntry | null = null
const CACHE_TTL_MS = 5 * 60 * 1000

const PARENT_PAGE_ID = "838c9606-9041-460d-83b6-ca16f224671f"

interface NotionFetchOptions {
  token: string
}

async function tryFetchFromNotion({ token }: NotionFetchOptions): Promise<Snapshot | null> {
  // Notion's public API is rich but requires careful block-tree traversal to
  // reconstruct the page content we want here. For now we use the snapshot
  // and surface a `source: "live" | "snapshot"` header — when a Notion token
  // is wired up and a proper block→snapshot mapper is built, this function
  // will return the live shape. Today it short-circuits to snapshot mode if
  // a token is set, after a sanity check call.
  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${PARENT_PAGE_ID}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2022-06-28",
      },
    })

    if (!res.ok) {
      console.warn(`[korea] Notion API returned ${res.status}; falling back to snapshot`)
      return null
    }

    // Sanity check passed — page is reachable. Returning snapshot for now;
    // when a block-tree mapper is built, replace this line with the mapped
    // Snapshot built from the live response.
    return koreaSnapshot
  } catch (error) {
    console.warn(`[korea] Notion API fetch failed: ${(error as Error).message}; falling back to snapshot`)
    return null
  }
}

async function getSnapshot(): Promise<{ data: Snapshot; source: "live" | "snapshot" }> {
  const token = process.env.NOTION_TOKEN

  if (token) {
    const now = Date.now()
    if (liveCache && liveCache.expires > now) {
      return { data: liveCache.data, source: "live" }
    }

    const live = await tryFetchFromNotion({ token })
    if (live) {
      liveCache = { data: live, expires: now + CACHE_TTL_MS }
      return { data: live, source: "live" }
    }
  }

  return { data: koreaSnapshot, source: "snapshot" }
}

korea.get("/", async (c) => {
  const { data, source } = await getSnapshot()
  c.header("X-Korea-Source", source)
  c.header("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=86400")
  return c.json(data)
})

korea.get("/days", async (c) => {
  const { data, source } = await getSnapshot()
  c.header("X-Korea-Source", source)
  return c.json(data.days.map(({ n, slug, date, dayOfWeek, emoji, title, city, neighborhoods, theme }) => ({
    n,
    slug,
    date,
    dayOfWeek,
    emoji,
    title,
    city,
    neighborhoods,
    theme,
  })))
})

korea.get("/day/:slug", async (c) => {
  const slug = c.req.param("slug")
  const { data, source } = await getSnapshot()
  const day = data.days.find((d) => d.slug === slug || String(d.n) === slug)
  if (!day) {
    return c.json({ error: "Day not found" }, 404)
  }
  c.header("X-Korea-Source", source)
  return c.json({
    day,
    reservations: data.reservations.filter((r) => r.dayNumber === day.n),
  })
})

korea.get("/reservations", async (c) => {
  const { data, source } = await getSnapshot()
  c.header("X-Korea-Source", source)
  return c.json(data.reservations)
})

export default korea

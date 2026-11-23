import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import * as Tabs from "@radix-ui/react-tabs"
import { layout } from "@/styles/common.stylex"
import { sx } from "@/styles/merge"
import { ws as s } from "../workspace.stylex"
import { OVERVIEW_TABS, readOverviewTab, type OverviewTab } from "./overviewTab"
import { clippedEnds, scrollBehavior, type Clipped } from "./scroll"

const FADE = { none: null, start: s.tabsFadeStart, end: s.tabsFadeEnd, both: s.tabsFadeBoth } as const
/** How far past the end fade the open tab is brought, so its label reads whole. */
const CLEAR = 40

export interface TabBadge {
  text: string
  label: string
}

/**
 * The overview's sections. Only the open tab is mounted, so a panel's code
 * and data load the first time someone opens it.
 */
export function OverviewTabs({
  tab,
  onTab,
  badges,
  only,
  render,
}: {
  tab: OverviewTab
  onTab: (tab: OverviewTab) => void
  /** A count beside a tab label: `text` is shown ("3"), `label` is read ("3 left"). */
  badges?: Partial<Record<OverviewTab, TabBadge>>
  /** The tabs to offer, in their usual order; all of them when absent. */
  only?: readonly OverviewTab[]
  render: (tab: OverviewTab) => ReactNode
}) {
  const tabs = only ? OVERVIEW_TABS.filter((t) => only.includes(t.id)) : OVERVIEW_TABS
  const listRef = useRef<HTMLDivElement>(null)
  const [clipped, setClipped] = useState<Clipped>("none")
  const placed = useRef(false)

  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    const measure = () => setClipped(clippedEnds(el))
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [tabs.length])

  // A phone shows four tabs; the open one is scrolled clear of the fade.
  useEffect(() => {
    const el = listRef.current
    const on = el?.querySelector<HTMLElement>('[role="tab"][data-state="active"]')
    if (!el || !on) return
    const start = on.offsetLeft - CLEAR
    const end = on.offsetLeft + on.offsetWidth + CLEAR - el.clientWidth
    const left = el.scrollLeft > start ? start : el.scrollLeft < end ? end : null
    if (left !== null) el.scrollTo({ left: Math.max(0, left), behavior: placed.current ? scrollBehavior() : "auto" })
    placed.current = true
  }, [tab])

  return (
    <Tabs.Root value={tab} onValueChange={(v) => onTab(readOverviewTab(v))} activationMode="manual">
      <Tabs.List
        ref={listRef}
        {...sx(s.tabs, FADE[clipped], "trips-glass-tabs")}
        aria-label="Trip overview"
        onScroll={(event) => setClipped(clippedEnds(event.currentTarget))}
      >
        {tabs.map((t) => {
          const badge = badges?.[t.id]
          return (
            <Tabs.Trigger key={t.id} value={t.id} {...sx(s.tab, tab === t.id && s.tabOn)}>
              {t.label}
              {badge && (
                <>
                  <span aria-hidden {...sx(s.tabBadge)}>
                    {badge.text}
                  </span>
                  <span {...sx(layout.srOnly)}> {badge.label}</span>
                </>
              )}
            </Tabs.Trigger>
          )
        })}
      </Tabs.List>
      {tabs.map((t) => (
        <Tabs.Content key={t.id} value={t.id} {...sx(s.tabPanel)}>
          {tab === t.id && render(t.id)}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  )
}

import type { ReactNode } from "react"
import * as Tabs from "@radix-ui/react-tabs"
import { sx } from "@/styles/merge"
import { ws as s } from "../workspace.stylex"
import { OVERVIEW_TABS, readOverviewTab, type OverviewTab } from "./overviewTab"

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
  /** A short count beside a tab label ("3 left"); omitted when absent. */
  badges?: Partial<Record<OverviewTab, string>>
  /** The tabs to offer, in their usual order; all of them when absent. */
  only?: readonly OverviewTab[]
  render: (tab: OverviewTab) => ReactNode
}) {
  const tabs = only ? OVERVIEW_TABS.filter((t) => only.includes(t.id)) : OVERVIEW_TABS
  return (
    <Tabs.Root value={tab} onValueChange={(v) => onTab(readOverviewTab(v))} activationMode="manual">
      <Tabs.List {...sx(s.tabs)} aria-label="Trip overview">
        {tabs.map((t) => (
          <Tabs.Trigger key={t.id} value={t.id} {...sx(s.tab, tab === t.id && s.tabOn)}>
            {t.label}
            {badges?.[t.id] && <span {...sx(s.tabBadge)}>{badges[t.id]}</span>}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {tabs.map((t) => (
        <Tabs.Content key={t.id} value={t.id} {...sx(s.tabPanel)}>
          {tab === t.id && render(t.id)}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  )
}

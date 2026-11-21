import type { ReactNode } from "react"
import * as Tabs from "@radix-ui/react-tabs"
import { layout } from "@/styles/common.stylex"
import { sx } from "@/styles/merge"
import { ws as s } from "../workspace.stylex"
import { OVERVIEW_TABS, readOverviewTab, type OverviewTab } from "./overviewTab"

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
  return (
    <Tabs.Root value={tab} onValueChange={(v) => onTab(readOverviewTab(v))} activationMode="manual">
      <Tabs.List {...sx(s.tabs)} aria-label="Trip overview">
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

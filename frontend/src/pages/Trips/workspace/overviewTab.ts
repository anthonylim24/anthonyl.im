export type OverviewTab = "itinerary" | "wishlist" | "budget" | "checklist" | "essentials"

export const OVERVIEW_TABS: readonly { id: OverviewTab; label: string }[] = [
  { id: "itinerary", label: "Itinerary" },
  { id: "wishlist", label: "Wishlist" },
  { id: "budget", label: "Budget" },
  { id: "checklist", label: "Checklist" },
  { id: "essentials", label: "Essentials" },
]

/** `?tab=` to a tab; anything unknown is the itinerary. */
export function readOverviewTab(value: string | null): OverviewTab {
  return OVERVIEW_TABS.find((t) => t.id === value)?.id ?? "itinerary"
}

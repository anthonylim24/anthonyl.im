import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { SuggestionsPanel } from "../editor/SuggestionsPanel"
import type { EnhancementRun } from "../types"

const dayOptions = [{ id: "day-1", label: "Fri · Jul 10" }]

function makeRun(overrides: Partial<EnhancementRun> = {}): EnhancementRun {
  return {
    id: "run-1",
    tripId: "trip-1",
    scope: "trip",
    status: "complete",
    summary: "Solid plan.",
    outcome: "no_adds_needed",
    outcomeReason: "Day 1 already has lunch, dinner, and five clustered stops.",
    suggestions: [],
    appliedSuggestionIds: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("SuggestionsPanel", () => {
  it("shows the outcome reason when no places were added", () => {
    render(
      <SuggestionsPanel run={makeRun()} dayOptions={dayOptions} onApply={vi.fn()} onDismiss={vi.fn()} />,
    )
    expect(screen.getByText(/already has lunch, dinner/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /apply/i })).not.toBeInTheDocument()
  })

  it("marks auto-applied adds and leaves edits reviewable", () => {
    const onApply = vi.fn()
    render(
      <SuggestionsPanel
        run={makeRun({
          outcome: "added_places",
          outcomeReason: "Added a late lunch near Senso-ji.",
          appliedSuggestionIds: ["sug-add"],
          suggestions: [
            {
              id: "sug-add",
              kind: "add",
              dayId: "day-1",
              title: "Add lunch",
              detail: "No meals on day 1.",
              confidence: "high",
              proposedItem: {
                id: "it-new",
                kind: "place",
                title: "Ichiran",
                status: "needs_review",
                createdBy: "ai",
              },
            },
            {
              id: "sug-edit",
              kind: "edit",
              dayId: "day-1",
              itemId: "it-a",
              title: "Start earlier",
              detail: "Beat the crowds.",
              confidence: "high",
            },
          ],
        })}
        dayOptions={dayOptions}
        onApply={onApply}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByText("Added a late lunch near Senso-ji.")).toBeInTheDocument()
    expect(screen.getByText("added")).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: /accept: start earlier/i })).toBeInTheDocument()
    expect(screen.queryByRole("checkbox", { name: /accept: add lunch/i })).not.toBeInTheDocument()
  })
})

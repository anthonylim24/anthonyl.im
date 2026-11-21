import { describe, expect, it } from "vitest"
import { makeItem, makeTrip } from "../../__tests__/tripFixtures"
import { itineraryText } from "../itineraryText"
import { printTrip } from "./printFixture"

describe("itineraryText: plain", () => {
  it("reads like a message: header, days, a time column, headings, To schedule, empty days", () => {
    expect(itineraryText(printTrip(), { format: "plain" })).toBe(
      [
        "Lisbon Long Weekend",
        "Jul 10 – 12, 2026 · 3 days",
        "Lisbon",
        "",
        "Fri, Jul 10 · Day 1 · Lisbon — Arrival",
        "10:40        TP 238 · EWR → LIS · Lisbon Airport · Booked · Conf ABC123",
        "             Alameda das Comunidades Portuguesas",
        "",
        "Evening",
        "19:30–21:00  Dinner at Ramiro",
        "             Av. Almirante Reis 1",
        "-            Miradouro da Graça",
        "-            Buy a Viva Viagem card",
        "-            Find a fado bar",
        "",
        "To schedule",
        "-            Time Out Market",
        "             Av. 24 de Julho 49",
        "-            Sintra day tour · Conf SNT-77",
        "",
        "Sat, Jul 11 · Day 2 · Lisbon",
        "Nothing planned yet",
        "",
        "Sun, Jul 12 · Day 3 · Lisbon — Belém",
        "09:00  Pastéis de Belém",
        "       R. de Belém 84",
      ].join("\n"),
    )
  })

  it("leaves notes out unless asked, then adds the description, day notes and stop notes", () => {
    const trip = printTrip()
    const short = itineraryText(trip, { format: "plain" })
    expect(short).not.toContain("Tiles, tarts")
    expect(short).not.toContain("garlic prawns")
    expect(short).not.toContain("Taxi rank")

    const full = itineraryText(trip, { format: "plain", includeNotes: true }).split("\n")
    expect(full.slice(0, 4)).toEqual(["Lisbon Long Weekend", "Jul 10 – 12, 2026 · 3 days", "Lisbon", "Tiles, tarts and the 28 tram."])
    expect(full).toContain("Taxi rank is outside arrivals.")
    // Stop notes sit under the address, in the stop's indent.
    const dinner = full.indexOf("19:30–21:00  Dinner at Ramiro")
    expect(full.slice(dinner + 1, dinner + 3)).toEqual(["             Av. Almirante Reis 1", "             Order the garlic prawns."])
  })

  it("uses a bullet column when a day has no times, and skips blank notes and headings", () => {
    const trip = makeTrip({
      days: [
        {
          id: "d",
          date: "2026-07-10",
          items: [
            makeItem({ id: "a", title: "Castle" }),
            makeItem({ id: "blank", kind: "note", title: "  " }),
            makeItem({ id: "h", kind: "section", title: "" }),
            makeItem({ id: "b", title: "", location: { name: "Alfama", source: "user" } }),
          ],
        },
      ],
      endDate: "2026-07-10",
    })
    expect(itineraryText(trip, { format: "plain" }).split("\n").slice(4)).toEqual(["Fri, Jul 10 · Day 1 · Lisbon", "-  Castle", "-  Alfama"])
  })

  it("says a day of headings only is empty", () => {
    const trip = makeTrip({
      endDate: "2026-07-10",
      days: [{ id: "d", date: "2026-07-10", items: [makeItem({ kind: "section", title: "Morning" })] }],
    })
    expect(itineraryText(trip, { format: "plain" })).toMatch(/Day 1 · Lisbon\nNothing planned yet$/)
  })

  it("names the day's city only when the trip says which one", () => {
    const trip = makeTrip({ destinations: ["Lisbon", "Porto"] })
    const text = itineraryText(trip, { format: "plain" })
    expect(text).toContain("Fri, Jul 10 · Day 1\n")
    expect(text).not.toContain("Day 1 · Lisbon")
  })
})

describe("itineraryText: markdown", () => {
  it("uses headings, bullet lists, bold times and code-set confirmations", () => {
    expect(itineraryText(printTrip(), { format: "markdown" })).toBe(
      [
        "# Lisbon Long Weekend",
        "",
        "Jul 10 – 12, 2026 · 3 days  ",
        "Lisbon",
        "",
        "## Fri, Jul 10 · Day 1 · Lisbon — Arrival",
        "",
        "- **10:40** TP 238 · EWR → LIS · Lisbon Airport · Booked · Conf `ABC123`  ",
        "  Alameda das Comunidades Portuguesas",
        "",
        "### Evening",
        "",
        "- **19:30–21:00** Dinner at Ramiro  ",
        "  Av. Almirante Reis 1",
        "- Miradouro da Graça",
        "- Buy a Viva Viagem card",
        "- Find a fado bar",
        "",
        "### To schedule",
        "",
        "- Time Out Market  ",
        "  Av. 24 de Julho 49",
        "- Sintra day tour · Conf `SNT-77`",
        "",
        "## Sat, Jul 11 · Day 2 · Lisbon",
        "",
        "_Nothing planned yet_",
        "",
        "## Sun, Jul 12 · Day 3 · Lisbon — Belém",
        "",
        "- **09:00** Pastéis de Belém  ",
        "  R. de Belém 84",
      ].join("\n"),
    )
  })

  it("escapes what the traveller wrote so it can't become formatting", () => {
    const trip = makeTrip({
      name: "Tiles *and* tarts",
      endDate: "2026-07-10",
      days: [
        {
          id: "d",
          date: "2026-07-10",
          items: [
            makeItem({ id: "a", title: "Bar_do_Rio [rooftop]", notes: "# not a heading\n- not a list\n1. Take the metro", time: "18:00" }),
            makeItem({ id: "b", kind: "reservation", title: "Ferry", reservation: { type: "transit", status: "confirmed", confirmation: "A`B" } }),
            makeItem({ id: "c", title: "1. Pack light" }),
            makeItem({ id: "d", title: "# Laundry" }),
          ],
        },
      ],
    })
    const text = itineraryText(trip, { format: "markdown", includeNotes: true })
    expect(text).toContain("# Tiles \\*and\\* tarts")
    expect(text).toContain("- **18:00** Bar\\_do\\_Rio \\[rooftop\\]  \n  \\# not a heading  \n  \\- not a list  \n  1\\. Take the metro")
    // A code span can't hold a backtick: the code is escaped text instead.
    expect(text).toContain("- Ferry · Conf A\\`B")
    // An untimed title opens the list item: it must not nest a list or a heading.
    expect(text).toContain("\n- 1\\. Pack light\n- \\# Laundry")
  })
})

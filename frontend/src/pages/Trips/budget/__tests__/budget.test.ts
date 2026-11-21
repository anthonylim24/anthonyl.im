import { describe, expect, it } from "vitest"
import { makeItem, makeTrip } from "../../__tests__/tripFixtures"
import type { TripExpense, TripPerson } from "../../types"
import {
  balances,
  budgetSummary,
  cleanExpense,
  costCategory,
  currencyChoices,
  defaultCurrency,
  formatAmountInput,
  formatMoney,
  localCurrency,
  memberPersonId,
  minorDigits,
  missingMembers,
  newExpense,
  parseAmount,
  peopleFor,
  personLabel,
  settleUp,
  type Balance,
} from "../budget"

// Intl separates some symbols from the figure with a (narrow) no-break space.
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, " ")

function expense(overrides: Partial<TripExpense> = {}): TripExpense {
  return {
    id: "ex-1",
    title: "Lunch",
    amount: 10,
    currency: "EUR",
    category: "food",
    createdAt: "2026-07-10T12:00:00.000Z",
    ...overrides,
  }
}

describe("formatMoney", () => {
  it("drops decimals on whole amounts and keeps both digits otherwise", () => {
    expect(formatMoney(1200, "EUR")).toBe("€1,200")
    expect(formatMoney(12.5, "EUR")).toBe("€12.50")
    expect(formatMoney(0.1 + 0.2, "USD")).toBe("$0.30")
  })

  it("never shows decimals for yen, won, dong or rupiah", () => {
    expect(formatMoney(3200, "JPY")).toBe("¥3,200")
    expect(formatMoney(42000.4, "KRW")).toBe("₩42,000")
    expect(plain(formatMoney(150000, "VND"))).toBe("₫150,000")
    expect(plain(formatMoney(99999.9, "IDR"))).toBe("Rp 100,000")
    expect(minorDigits("IDR")).toBe(0)
    expect(minorDigits("KWD")).toBe(3)
  })

  it("shortens large totals only when asked, and only from 10,000", () => {
    expect(formatMoney(1_250_000, "KRW", { compact: true })).toBe("₩1.3M")
    expect(formatMoney(12_400, "EUR", { compact: true })).toBe("€12.4K")
    expect(formatMoney(950, "EUR", { compact: true })).toBe("€950")
    expect(formatMoney(1_250_000, "KRW")).toBe("₩1,250,000")
  })

  it("still reads as money for a code Intl rejects", () => {
    expect(formatMoney(12, "E1")).toBe("12 E1")
  })

  it("formats an amount for editing without a symbol", () => {
    expect(formatAmountInput(1200.5, "USD")).toBe("1,200.50")
    expect(formatAmountInput(42000, "KRW")).toBe("42,000")
  })
})

describe("parseAmount", () => {
  it.each([
    ["1,200.50", "USD", 1200.5],
    ["1.200,50", "EUR", 1200.5],
    ["1200,5", "EUR", 1200.5],
    ["12,50", "EUR", 12.5],
    ["1,200", "USD", 1200],
    ["1.200.000", "EUR", 1200000],
    ["1 200", "EUR", 1200],
    ["€12", "EUR", 12],
    ["12 EUR", "EUR", 12],
    [".5", "USD", 0.5],
    ["12.", "USD", 12],
    ["1.2", "USD", 1.2],
    ["1.200", "USD", 1.2],
    ["1.200", "KRW", 1200],
    ["42000", "KRW", 42000],
    ["12.345", "USD", 12.35],
    ["0", "USD", 0],
  ])("reads %s (%s) as %s", (text, currency, expected) => {
    expect(parseAmount(text, currency)).toBe(expected)
  })

  it.each(["", "   ", "abc", "-5", "1.2.3", "1,2,3", "1,2.3,4", "2000000000"])("rejects %j", (text) => {
    expect(parseAmount(text, "USD")).toBeNull()
  })
})

describe("currencies", () => {
  it("guesses the destination's currency from the time zone", () => {
    const at = (timezone: string, destinations: string[] = []) => localCurrency({ timezone, destinations })
    expect(at("Asia/Seoul")).toBe("KRW")
    expect(at("Asia/Tokyo")).toBe("JPY")
    expect(at("Europe/Lisbon")).toBe("EUR")
    expect(at("Europe/Paris")).toBe("EUR")
    expect(at("Europe/London")).toBe("GBP")
    expect(at("America/New_York")).toBe("USD")
    expect(at("Australia/Sydney")).toBe("AUD")
  })

  it("falls back to the destinations, then USD", () => {
    expect(localCurrency({ timezone: "UTC", destinations: ["Hoi An, Vietnam"] })).toBe("VND")
    expect(localCurrency({ timezone: "UTC", destinations: ["Santa Fe, New Mexico"] })).toBe("USD")
    expect(localCurrency({ timezone: "UTC", destinations: ["Atlantis"] })).toBeNull()
    expect(defaultCurrency({ timezone: "UTC", destinations: ["Atlantis"] })).toBe("USD")
  })

  it("lets the budget's currency win", () => {
    expect(defaultCurrency({ timezone: "Asia/Seoul", destinations: ["Seoul"], budget: { currency: "USD" } })).toBe("USD")
  })

  it("offers codes the trip uses that the list lacks", () => {
    const codes = currencyChoices("COP", "EUR", undefined, "bad").map((c) => c.code)
    expect(codes).toContain("COP")
    expect(codes.filter((c) => c === "EUR")).toHaveLength(1)
    expect(codes).not.toContain("bad")
  })
})

describe("costCategory", () => {
  it("files hotels, travel and meals under their lines", () => {
    expect(costCategory(makeItem({ kind: "reservation", reservation: { type: "hotel", status: "confirmed" } }))).toBe("lodging")
    expect(costCategory(makeItem({ kind: "reservation", reservation: { type: "flight", status: "confirmed" } }))).toBe("transport")
    expect(costCategory(makeItem({ kind: "reservation", reservation: { type: "transit", status: "confirmed" } }))).toBe("transport")
    expect(costCategory(makeItem({ kind: "reservation", reservation: { type: "meal", status: "confirmed" } }))).toBe("food")
    expect(costCategory(makeItem({ location: { name: "Café", category: "cafe", source: "user" } }))).toBe("food")
    expect(costCategory(makeItem({ location: { name: "Museum", category: "museum", source: "user" } }))).toBe("activities")
    expect(costCategory(makeItem())).toBe("activities")
  })
})

describe("budgetSummary", () => {
  const hotel = makeItem({
    id: "hotel",
    kind: "reservation",
    title: "Hotel",
    reservation: { type: "hotel", status: "confirmed" },
    cost: { amount: 300, currency: "EUR" },
  })
  const tour = makeItem({ id: "tour", title: "Tour", cost: { amount: 8000, currency: "JPY" } })
  const trip = makeTrip({
    budget: { currency: "EUR", total: 500 },
    days: [
      { id: "day-1", date: "2026-07-10", items: [hotel] },
      { id: "day-2", date: "2026-07-11", items: [tour] },
    ],
    expenses: [
      expense({ id: "ex-1", amount: 40, category: "food", date: "2026-07-11" }),
      expense({ id: "ex-2", amount: 3200, currency: "JPY", category: "shopping", date: "2026-07-10" }),
    ],
  })

  it("totals in the budget currency with rates", () => {
    const summary = budgetSummary(trip, { JPY: 160 })
    expect(summary.currency).toBe("EUR")
    expect(summary.planned).toBe(350)
    expect(summary.spent).toBe(60)
    expect(summary.outstanding).toBe(350)
    expect(summary.total).toBe(500)
    expect(summary.remaining).toBe(90)
    expect(summary.unconverted).toEqual([])
    expect(summary.byCategory).toEqual([
      { category: "lodging", planned: 300, spent: 0 },
      { category: "food", planned: 0, spent: 40 },
      { category: "activities", planned: 50, spent: 0 },
      { category: "shopping", planned: 0, spent: 20 },
    ])
    expect(summary.byDay).toEqual([
      { dayId: "day-1", planned: 300, spent: 20 },
      { dayId: "day-2", planned: 50, spent: 40 },
    ])
  })

  it("leaves out amounts it can't convert and names their currencies", () => {
    const summary = budgetSummary(trip)
    expect(summary.planned).toBe(300)
    expect(summary.spent).toBe(40)
    expect(summary.unconverted).toEqual(["JPY"])
  })

  it("stops counting a stop's cost as outstanding once an expense pays for it", () => {
    const paid = { ...trip, expenses: [...(trip.expenses ?? []), expense({ id: "ex-3", amount: 310, itemId: "hotel", category: "lodging" })] }
    const summary = budgetSummary(paid, { JPY: 160 })
    expect(summary.outstanding).toBe(50)
    expect(summary.spent).toBe(370)
    expect(summary.remaining).toBe(80)
    expect(summary.byDay[0]).toEqual({ dayId: "day-1", planned: 300, spent: 330 })
  })

  it("goes negative when over budget", () => {
    const summary = budgetSummary({ ...trip, budget: { currency: "EUR", total: 300 } }, { JPY: 160 })
    expect(summary.remaining).toBe(-110)
  })

  it("has no total or remaining without a budget", () => {
    const summary = budgetSummary(makeTrip())
    expect(summary).toMatchObject({ currency: "EUR", planned: 0, spent: 0, outstanding: 0, byCategory: [] })
    expect(summary.total).toBeUndefined()
    expect(summary.remaining).toBeUndefined()
  })
})

describe("people", () => {
  const trip = makeTrip({
    ownerId: "u1",
    collaborators: [
      { userId: "u2", role: "editor", name: "Mina" },
      { userId: "u3", role: "viewer" },
    ],
  })

  it("derives the party from the owner and collaborators with stable ids", () => {
    const people = peopleFor(trip, { id: "u1", name: "Anthony" })
    expect(people).toEqual([
      { id: memberPersonId("u1"), name: "Anthony", userId: "u1" },
      { id: memberPersonId("u2"), name: "Mina", userId: "u2" },
      { id: memberPersonId("u3"), name: "Traveller 3", userId: "u3" },
    ])
    // Same ids for another viewer: expenses keep pointing at the same people.
    expect(peopleFor(trip, { id: "u2", name: "Mina" }).map((p) => p.id)).toEqual(people.map((p) => p.id))
  })

  it("calls an unnamed owner the trip owner, and never stores 'You'", () => {
    const people = peopleFor(trip, { id: null, name: null })
    expect(people[0].name).toBe("Trip owner")
    expect(people.map((p) => p.name)).not.toContain("You")
  })

  it("says 'You' on screen for the viewer only", () => {
    const people = peopleFor(trip, { id: "u2", name: "Mina" })
    expect(people.map((p) => personLabel(p, { id: "u2", name: "Mina" }))).toEqual(["Trip owner", "You", "Traveller 3"])
    expect(personLabel(people[1], { id: null, name: null })).toBe("Mina")
  })

  it("uses the saved party once there is one, and finds members it lacks", () => {
    const party: TripPerson[] = [{ id: memberPersonId("u1"), name: "Anthony", userId: "u1" }, { id: "p-1", name: "Sam" }]
    const saved = { ...trip, party }
    expect(peopleFor(saved, { id: "u1", name: "Anthony" })).toBe(party)
    expect(missingMembers(saved, { id: "u1", name: "Anthony" }).map((p) => p.name)).toEqual(["Mina", "Traveller 3"])
    expect(missingMembers(trip, { id: "u1", name: "Anthony" })).toEqual([])
  })
})

describe("splitting", () => {
  const people: TripPerson[] = [
    { id: "a", name: "Anthony" },
    { id: "b", name: "Sam" },
    { id: "c", name: "Mina" },
  ]

  it("shares an expense equally between everyone by default", () => {
    const trip = makeTrip({ budget: { currency: "EUR" }, expenses: [expense({ amount: 90, paidBy: "a" })] })
    const result = balances(trip, {}, people)
    expect(result).toEqual([
      { personId: "a", paid: 90, share: 30, net: 60 },
      { personId: "b", paid: 0, share: 30, net: -30 },
      { personId: "c", paid: 0, share: 30, net: -30 },
    ])
    expect(settleUp(result, "EUR")).toEqual([
      { from: "b", to: "a", amount: 30 },
      { from: "c", to: "a", amount: 30 },
    ])
  })

  it("splits only between the people named, converts, and skips what it can't place", () => {
    const trip = makeTrip({
      budget: { currency: "EUR" },
      expenses: [
        expense({ id: "1", amount: 16000, currency: "JPY", paidBy: "b", splitWith: ["b", "c"] }),
        expense({ id: "2", amount: 50 }), // no payer
        expense({ id: "3", amount: 50, paidBy: "gone" }), // payer no longer on the trip
        expense({ id: "4", amount: 900, currency: "VND", paidBy: "a" }), // no rate
      ],
    })
    const result = balances(trip, { JPY: 160 }, people)
    expect(result.find((b) => b.personId === "b")).toMatchObject({ paid: 100, share: 50, net: 50 })
    expect(result.find((b) => b.personId === "c")).toMatchObject({ paid: 0, share: 50, net: -50 })
    expect(result.find((b) => b.personId === "a")).toMatchObject({ paid: 0, share: 0, net: 0 })
    expect(result.reduce((sum, b) => sum + b.net, 0)).toBeCloseTo(0, 9)
  })

  it("rounds to the minor unit and never moves less than one", () => {
    const thirds = balances(makeTrip({ budget: { currency: "EUR" }, expenses: [expense({ amount: 10, paidBy: "a" })] }), {}, people)
    const transfers = settleUp(thirds, "EUR")
    expect(transfers).toEqual([
      { from: "b", to: "a", amount: 3.33 },
      { from: "c", to: "a", amount: 3.33 },
    ])
    const won = settleUp(
      [
        { personId: "a", paid: 0, share: 0, net: 100.4 },
        { personId: "b", paid: 0, share: 0, net: -100.4 },
        { personId: "c", paid: 0, share: 0, net: 0.3 },
        { personId: "d", paid: 0, share: 0, net: -0.3 },
      ],
      "KRW",
    )
    expect(won).toEqual([{ from: "b", to: "a", amount: 100 }])
  })

  it("pairs off matching debts and stays within one fewer transfer than people", () => {
    const list: Balance[] = [
      { personId: "a", paid: 0, share: 0, net: 10 },
      { personId: "b", paid: 0, share: 0, net: -10 },
      { personId: "c", paid: 0, share: 0, net: 5 },
      { personId: "d", paid: 0, share: 0, net: -5 },
    ]
    expect(settleUp(list, "EUR")).toEqual([
      { from: "b", to: "a", amount: 10 },
      { from: "d", to: "c", amount: 5 },
    ])
    const many: Balance[] = [40, -15, -15, 25, -35].map((net, i) => ({ personId: `p${i}`, paid: 0, share: 0, net }))
    const transfers = settleUp(many, "USD")
    expect(transfers.length).toBeLessThanOrEqual(many.length - 1)
    // Every balance ends at zero.
    const after = new Map(many.map((b) => [b.personId, Math.round(b.net * 100)]))
    for (const t of transfers) {
      after.set(t.from, (after.get(t.from) ?? 0) + Math.round(t.amount * 100))
      after.set(t.to, (after.get(t.to) ?? 0) - Math.round(t.amount * 100))
    }
    expect([...after.values()].every((v) => v === 0)).toBe(true)
  })

  it("needs nothing when everyone is square", () => {
    expect(settleUp([{ personId: "a", paid: 5, share: 5, net: 0 }], "EUR")).toEqual([])
  })

  /** Every balance after the transfers, in minor units: all zero when settled. */
  const after = (list: readonly Balance[], transfers: readonly { from: string; to: string; amount: number }[]) => {
    const left = new Map(list.map((b) => [b.personId, Math.round(b.net * 100)]))
    for (const t of transfers) {
      left.set(t.from, (left.get(t.from) ?? 0) + Math.round(t.amount * 100))
      left.set(t.to, (left.get(t.to) ?? 0) - Math.round(t.amount * 100))
    }
    return [...left.values()]
  }
  const nets = (values: number[]): Balance[] => values.map((net, i) => ({ personId: `p${i}`, paid: 0, share: 0, net }))

  it("finds the fewest transfers where paying the largest debt first would take more", () => {
    // Owed 6 and 4; owing 4, 3 and 3. Largest-first takes four transfers; two groups settle in three.
    const list: Balance[] = [
      { personId: "a", paid: 0, share: 0, net: 6 },
      { personId: "b", paid: 0, share: 0, net: 4 },
      { personId: "c", paid: 0, share: 0, net: -4 },
      { personId: "d", paid: 0, share: 0, net: -3 },
      { personId: "e", paid: 0, share: 0, net: -3 },
    ]
    expect(settleUp(list, "EUR")).toEqual([
      { from: "d", to: "a", amount: 3 },
      { from: "e", to: "a", amount: 3 },
      { from: "c", to: "b", amount: 4 },
    ])
  })

  it("is exact for a dozen people, with any order of balances", () => {
    // Five groups shuffled among twelve: {9, −5, −4}, {7, −7}, {6, −3, −3}, {2, −2}, {1, −1}. Five people
    // are owed, so five groups is the most there can be: 12 − 5 = 7 transfers.
    const list = nets([-5, 6, -3, 7, 1, -4, -2, 9, -7, 2, -3, -1])
    const transfers = settleUp(list, "USD")
    expect(after(list, transfers).every((v) => v === 0)).toBe(true)
    expect(transfers).toHaveLength(7)
  })

  it("still settles everyone past the exact limit, in at most one fewer transfer than people", () => {
    const list = nets([50, -10, -10, -10, -10, -10, 30, -5, -5, -5, -5, -5, -5, 20, -10, -10])
    expect(list.reduce((sum, b) => sum + b.net, 0)).toBe(0)
    const transfers = settleUp(list, "USD")
    expect(after(list, transfers).every((v) => v === 0)).toBe(true)
    expect(transfers.length).toBeLessThanOrEqual(list.length - 1)
  })
})

describe("newExpense", () => {
  it("stamps an id and a time and keeps it inside the server's limits", () => {
    const made = newExpense(
      { title: `  ${"x".repeat(250)}  `, amount: 12.345, currency: "eur", category: "food", date: "not a date", splitWith: [] },
      new Date("2026-07-10T09:00:00Z"),
    )
    expect(made.id).toMatch(/^ex-[0-9a-f]{8}$/)
    expect(made.createdAt).toBe("2026-07-10T09:00:00.000Z")
    expect(made.title).toHaveLength(200)
    expect(made.amount).toBe(12.35)
    expect(made.currency).toBe("EUR")
    expect(made).not.toHaveProperty("date")
    expect(made).not.toHaveProperty("splitWith")
  })

  it("clamps amounts and falls back from a malformed code", () => {
    expect(cleanExpense(expense({ amount: -4, currency: "e" }))).toMatchObject({ amount: 0, currency: "USD" })
    expect(cleanExpense(expense({ amount: 5e12 })).amount).toBe(1_000_000_000)
  })
})

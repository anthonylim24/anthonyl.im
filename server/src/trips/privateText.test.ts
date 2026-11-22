import { describe, expect, test } from "bun:test"
import { fromModel, redactPrivate } from "./privateText"

describe("redactPrivate", () => {
  test("a booking code in brackets after the flights is hidden; the flight numbers stay", () => {
    const text = "Flights: UA 893 · Mon May 18 10:40 AM PDT → ICN / KE018 back (QXRT7B)"
    expect(redactPrivate(text)).toBe("Flights: UA 893 · Mon May 18 10:40 AM PDT → ICN / KE018 back ([code])")
  })

  test("labelled codes are hidden, whatever their shape", () => {
    expect(redactPrivate("Confirmation: 88123456")).toBe("Confirmation: [code]")
    expect(redactPrivate("booking ref ABC123 for two")).toBe("booking ref [code] for two")
    expect(redactPrivate("PNR abcd1e")).toBe("PNR [code]")
    expect(redactPrivate("Reservation #H-55102, pay at the desk")).toBe("Reservation #[code], pay at the desk")
    expect(redactPrivate("Passport no. M12345678")).toBe("Passport no. [code]")
    expect(redactPrivate("Booking ID: HOTELX")).toBe("Booking ID: [code]")
  })

  test("words after a label are not codes", () => {
    for (const text of [
      "Booking confirmed with the hotel",
      "Reservation at Mingles for 7pm",
      "Ticket booth opens at 9",
      "Order the tasting menu",
      "Refined dining, conf call at 3",
    ]) {
      expect(redactPrivate(text)).toBe(text)
    }
  })

  test("emails and phone numbers are hidden", () => {
    expect(redactPrivate("Host: minji.park@example.co.kr, call +82 10 1234 5678")).toBe("Host: [email], call [number]")
    expect(redactPrivate("Front desk 02-123-4567 or 010-9876-5432")).toBe("Front desk [number] or [number]")
    expect(redactPrivate("US line (415) 555-0134")).toBe("US line [number]")
    expect(redactPrivate("Card 4111 1111 1111 1111 on file")).toBe("Card [number] on file")
  })

  test("dates, times, prices, train numbers and street numbers stay", () => {
    for (const text of [
      "2026-05-18 to 2026-05-22",
      "Open 10:00-22:00, closed Mondays",
      "About 45,000 KRW for two, 1200 yen tip",
      "KTX101 from Seoul at 08:00, seat 12A",
      "Flight OZ1085 lands at 14:05",
      "Sejong-daero 110, Jung-gu, gate 3",
      "Day 2: Bukchon, then Insadong",
    ]) {
      expect(redactPrivate(text)).toBe(text)
    }
  })
})

describe("fromModel", () => {
  test("drops model text that repeats a placeholder, keeps the rest", () => {
    expect(fromModel("Show [code] at the desk")).toBeUndefined()
    expect(fromModel("Email [email] for the key")).toBeUndefined()
    expect(fromModel("Order the [number] set")).toBeUndefined()
    expect(fromModel("Order the lunch set [A]")).toBe("Order the lunch set [A]")
    expect(fromModel(undefined)).toBeUndefined()
  })
})

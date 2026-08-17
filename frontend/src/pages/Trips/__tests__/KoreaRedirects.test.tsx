import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import {
  KoreaCatchRedirect,
  KoreaDayRedirect,
  KoreaIndexRedirect,
  KoreaIngestRedirect,
  KoreaPlacesRedirect,
  TripEditRedirect,
} from "../KoreaRedirects"

function Landing({ label }: { label: string }) {
  const loc = useLocation()
  return (
    <div>
      <p>{label}</p>
      <p>{`${loc.pathname}${loc.search}${loc.hash}`}</p>
    </div>
  )
}

describe("Korea and editor redirects", () => {
  it("sends /korea to the seeded trip", () => {
    render(
      <MemoryRouter initialEntries={["/korea"]}>
        <Routes>
          <Route path="/korea" element={<KoreaIndexRedirect />} />
          <Route path="/trips/:tripId" element={<Landing label="korea trip" />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText("korea trip")).toBeInTheDocument()
  })

  it("maps a Korea day slug onto the seeded trip day", () => {
    render(
      <MemoryRouter initialEntries={["/korea/day/day-3"]}>
        <Routes>
          <Route path="/korea/day/:slug" element={<KoreaDayRedirect />} />
          <Route path="/trips/:tripId/day/:dayId" element={<Landing label="korea day" />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText("korea day")).toBeInTheDocument()
  })

  it("maps /korea/places onto the seeded trip places library", () => {
    render(
      <MemoryRouter initialEntries={["/korea/places"]}>
        <Routes>
          <Route path="/korea/places" element={<KoreaPlacesRedirect />} />
          <Route path="/trips/:tripId/places" element={<Landing label="korea places" />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText("korea places")).toBeInTheDocument()
  })

  it("opens Instagram ingest on the living document", () => {
    render(
      <MemoryRouter initialEntries={["/korea/ingest"]}>
        <Routes>
          <Route path="/korea/ingest" element={<KoreaIngestRedirect />} />
          <Route path="/trips/:tripId" element={<Landing label="korea ingest" />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText("korea ingest")).toBeInTheDocument()
    expect(screen.getByText("/trips/korea-2026?ingest=1#trip-ingest")).toBeInTheDocument()
  })

  it("folds unknown /korea paths onto the seeded trip", () => {
    render(
      <MemoryRouter initialEntries={["/korea/missing"]}>
        <Routes>
          <Route path="/korea/*" element={<KoreaCatchRedirect />} />
          <Route path="/trips/:tripId" element={<Landing label="korea catch" />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText("korea catch")).toBeInTheDocument()
  })

  it("folds /edit into the living document and keeps hash plus query", () => {
    render(
      <MemoryRouter initialEntries={["/trips/tokyo/edit?ingest=1#day-2"]}>
        <Routes>
          <Route path="/trips/:tripId/edit" element={<TripEditRedirect />} />
          <Route path="/trips/:tripId" element={<Landing label="living trip" />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText("living trip")).toBeInTheDocument()
    expect(screen.getByText("/trips/tokyo?ingest=1#day-2")).toBeInTheDocument()
  })
})

import { describe, expect, it } from "vitest"
import { copyBannerText, copyTime, leftUnsavedText } from "../bannerText"

const now = new Date(2026, 4, 12, 18, 0).getTime()
const at = new Date(2026, 4, 12, 15, 12).getTime()

describe("the offline banner", () => {
  it("says nothing while everything is live", () => {
    expect(copyBannerText({ shown: null, mode: "live", online: true, now })).toBeNull()
  })

  it("says why, what and from when", () => {
    const time = copyTime(at, now)
    expect(time).toMatch(/3:12/)
    expect(copyBannerText({ shown: { what: "trip", savedAt: at, unsaved: false }, mode: "live", online: false, now })).toBe(
      `Offline · showing your saved copy from ${time}. Nothing can be changed until it’s back.`,
    )
    expect(copyBannerText({ shown: { what: "list", savedAt: at, unsaved: false }, mode: "live", online: true, now })).toBe(
      `Can’t reach the server · showing your saved list of trips from ${time}. Nothing can be changed until it’s back.`,
    )
    expect(copyBannerText({ shown: { what: "trip", savedAt: at, unsaved: true }, mode: "copy", online: true, now })).toBe(
      `Sign-in isn’t loading · showing your saved copy from ${time}, with edits made here that aren’t saved yet. Nothing can be changed until it’s back.`,
    )
    expect(copyBannerText({ shown: null, mode: "copy", online: false, now })).toBe(
      "Offline · showing what’s saved on this device. Nothing can be changed until it’s back.",
    )
  })

  it("gives the date for a copy from another day", () => {
    expect(copyTime(new Date(2026, 4, 3, 15, 12).getTime(), now)).toMatch(/3/)
    expect(copyTime(new Date(2026, 4, 3, 15, 12).getTime(), now)).not.toBe(copyTime(at, now))
  })

  it("says edits left behind are kept, and where", () => {
    expect(leftUnsavedText("서울 2026", "there was no connection", true)).toBe(
      "Your last edits to “서울 2026” aren’t saved yet: there was no connection. They’re kept on this device and will save when you open the trip again.",
    )
    expect(leftUnsavedText("  ", "the server had a problem", false)).toBe("Your last edits to this trip couldn’t be saved: the server had a problem.")
  })
})

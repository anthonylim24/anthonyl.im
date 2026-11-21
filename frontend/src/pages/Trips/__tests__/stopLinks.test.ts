import { describe, expect, it } from "vitest"
import { LIMITS } from "../limits"
import { normalizeLink, stopLink, withLink } from "../workspace/stopLinks"

describe("stopLink", () => {
  it("names the sites people know, else shows the host", () => {
    expect(stopLink("https://www.instagram.com/p/C0ffee123/")).toEqual({ href: "https://www.instagram.com/p/C0ffee123/", label: "Instagram" })
    expect(stopLink("https://maps.google.com/?cid=1")?.label).toBe("Google Maps")
    expect(stopLink("https://www.google.com/maps/place/Senso-ji")?.label).toBe("Google Maps")
    expect(stopLink("https://maps.app.goo.gl/abc")?.label).toBe("Google Maps")
    expect(stopLink("https://maps.apple.com/?q=Louvre")?.label).toBe("Apple Maps")
    expect(stopLink("https://naver.me/xyz")?.label).toBe("Naver Map")
    expect(stopLink("https://tabelog.com/en/tokyo/A1301/")?.label).toBe("tabelog.com")
    expect(stopLink("https://www.google.com/search?q=ramen")?.label).toBe("google.com")
  })

  it("never makes anything but an https link clickable", () => {
    for (const bad of [
      "http://example.com/menu",
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox",
      "file:///etc/passwd",
      "ftp://example.com",
      "not a link",
      "",
      "https://localhost/admin",
      "https://user:secret@example.com/",
      "//example.com/x",
    ]) {
      expect(stopLink(bad), bad).toBeNull()
    }
  })
})

describe("normalizeLink", () => {
  it("adds https:// to a bare address and keeps an https one", () => {
    expect(normalizeLink("tabelog.com/en/tokyo")).toBe("https://tabelog.com/en/tokyo")
    expect(normalizeLink("  https://www.instagram.com/reel/abc/  ")).toBe("https://www.instagram.com/reel/abc/")
  })

  it("refuses anything that is not an https web address", () => {
    for (const bad of [
      "http://example.com",
      "javascript:alert(1)",
      "javascript://example.com/%0aalert(1)",
      "data:text/html,hi",
      "mailto:someone@example.com",
      "tel:+81312345678",
      "two words.com",
      "nodot",
      "",
      "   ",
      `https://example.com/${"a".repeat(LIMITS.link)}`,
    ]) {
      expect(normalizeLink(bad), bad).toBeNull()
    }
  })
})

describe("withLink", () => {
  it("adds a link once, and not past the limit", () => {
    expect(withLink(undefined, "https://a.com/")).toEqual(["https://a.com/"])
    expect(withLink(["https://a.com/"], "https://a.com/")).toEqual(["https://a.com/"])
    const full = Array.from({ length: LIMITS.links }, (_, i) => `https://a.com/${i}`)
    expect(withLink(full, "https://b.com/")).toHaveLength(LIMITS.links)
  })
})

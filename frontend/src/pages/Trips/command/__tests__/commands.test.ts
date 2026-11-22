import { describe, expect, it } from "vitest"
import { foldText, searchCommands, type Command, type CommandGroup } from "../commands"
import { formatShortcut, isApplePlatform, spokenShortcut } from "../keys"

const make = (title: string, group: CommandGroup = "Actions", extra: Partial<Command> = {}): Command => ({
  id: `${group}:${title}`,
  title,
  group,
  run: () => {},
  ...extra,
})

const titles = (commands: Command[], query: string, limit?: number) =>
  searchCommands(commands, query, limit).flatMap((group) => group.commands.map((command) => command.title))

describe("searchCommands ranking", () => {
  it("ranks exact, then prefix, word start and substring", () => {
    const commands = [
      make("Skatepark"), // substring
      make("Big park"), // word start
      make("Parking garage"), // prefix
      make("Park"), // exact
      make("Museum"), // no match
    ]
    expect(titles(commands, "park")).toEqual(["Park", "Parking garage", "Big park", "Skatepark"])
  })

  it("falls back to letters in order, but only when nothing matches better", () => {
    expect(titles([make("Gyeongbokgung Palace", "Stops"), make("Museum")], "gbg")).toEqual(["Gyeongbokgung Palace"])
    // "Trip details" holds p…a…l; next to a real "pal" it is noise, and would sit above it.
    const commands = [make("Trip details"), make("Export to calendar"), make("Gyeongbokgung Palace", "Stops")]
    expect(titles(commands, "pal")).toEqual(["Gyeongbokgung Palace"])
    expect(titles([make("Trip details"), make("Export to calendar")], "pal")).toEqual(["Trip details", "Export to calendar"])
  })

  it("drops a scattered multi-word match next to a real one", () => {
    const commands = [make("Day 2 · Wed May 27", "Days"), make("Gwangjang Market", "Stops", { subtitle: "Day 1 · 12:00" })]
    expect(titles(commands, "day 2")).toEqual(["Day 2 · Wed May 27"])
  })

  it("keeps the given order between equal matches, with disabled rows last", () => {
    const commands = [make("Share trip", "Actions", { disabled: true }), make("Share day"), make("Share link")]
    expect(titles(commands, "share")).toEqual(["Share day", "Share link", "Share trip"])
  })

  it("finds commands by keyword and subtitle, below the same match in a title", () => {
    const commands = [
      make("Gyeongbokgung Palace", "Stops", { subtitle: "Day 4 · 10:00" }),
      make("Export to calendar", "Actions", { keywords: ["ics", "ical"] }),
      make("Day 4 · Thu May 28", "Days"),
    ]
    expect(titles(commands, "ics")).toEqual(["Export to calendar"])
    expect(titles(commands, "day 4")).toEqual(["Day 4 · Thu May 28", "Gyeongbokgung Palace"])
  })

  it("matches every word of a query wherever each one is", () => {
    expect(titles([make("Gyeongbokgung Palace", "Stops")], "palace gyeong")).toEqual(["Gyeongbokgung Palace"])
    expect(titles([make("Gyeongbokgung Palace", "Stops")], "palace busan")).toEqual([])
  })

  it("ignores case and accents on both sides", () => {
    const commands = [make("Café A Brasileira", "Stops"), make("Castelo de São Jorge", "Stops"), make("Cafe Central", "Stops")]
    expect(titles(commands, "CAFE")).toEqual(["Café A Brasileira", "Cafe Central"])
    expect(titles(commands, "café")).toEqual(["Café A Brasileira", "Cafe Central"])
    expect(titles(commands, "sao jorge")).toEqual(["Castelo de São Jorge"])
    expect(titles([make("Øresund Bridge"), make("Straße")], "oresund")).toEqual(["Øresund Bridge"])
    expect(titles([make("Øresund Bridge"), make("Straße")], "strasse")).toEqual(["Straße"])
  })

  it("finds Hangul and CJK inside a name, and keeps up with a syllable mid-composition", () => {
    const commands = [make("경복궁", "Stops"), make("광장시장", "Stops"), make("東京タワー", "Stops")]
    expect(titles(commands, "복궁")).toEqual(["경복궁"])
    expect(titles(commands, "경복궁")).toEqual(["경복궁"])
    // A Korean IME shows "겨" on the way to "경".
    expect(titles(commands, "겨")).toEqual(["경복궁"])
    // A lone initial finds every name whose first syllable starts with it.
    expect(titles(commands, "ㄱ")).toEqual(["경복궁", "광장시장"])
    expect(titles(commands, "京タ")).toEqual(["東京タワー"])
  })

  it("does not match Hangul by scattered letters", () => {
    // In jamo, "경궁" is a subsequence of "경복궁"; it must not count.
    expect(titles([make("경복궁", "Stops")], "경궁")).toEqual([])
    expect(titles([make("광장시장", "Stops")], "광시")).toEqual([])
  })

  it("does not treat one letter as a scattered match", () => {
    expect(titles([make("Palace")], "z")).toEqual([])
    expect(titles([make("Palace")], "pc")).toEqual(["Palace"])
  })
})

describe("searchCommands across keystrokes", () => {
  it("ranks the same commands the same way on every search", () => {
    const commands = [make("Skatepark"), make("Big park"), make("Parking garage"), make("Park"), make("Café Ébène", "Stops")]
    const first = ["p", "pa", "par", "park", "cafe ebene"].map((query) => titles(commands, query))
    const again = ["p", "pa", "par", "park", "cafe ebene"].map((query) => titles(commands, query))
    expect(again).toEqual(first)
    expect(first[3]).toEqual(["Park", "Parking garage", "Big park", "Skatepark"])
    expect(first[4]).toEqual(["Café Ébène"])
  })

  it("matches a rebuilt command by its new text", () => {
    const before = make("Day 1 · Tokyo", "Days")
    expect(titles([before], "kyoto")).toEqual([])
    const after = make("Day 1 · Kyoto", "Days")
    expect(titles([after], "kyoto")).toEqual(["Day 1 · Kyoto"])
    expect(titles([before], "tokyo")).toEqual(["Day 1 · Tokyo"])
  })
})

describe("searchCommands grouping", () => {
  const commands = [
    make("Match the system theme", "Settings"),
    make("Gyeongbokgung Palace", "Stops"),
    make("Day 1 · Fri Jul 10", "Days"),
    make("All trips", "Go to"),
    make("Share trip", "Actions"),
    make("Lisbon Long Weekend", "Trips"),
  ]

  it("keeps a fixed group order, whatever matched best", () => {
    const groups = searchCommands(
      [make("Use dark theme", "Settings"), make("Dark sky reserve", "Stops"), make("Darken the map", "Actions")],
      "dark",
    )
    expect(groups.map((group) => group.group)).toEqual(["Actions", "Stops", "Settings"])
  })

  it("shows actions, places to go and days for an empty query, never stops", () => {
    const groups = searchCommands(commands, "  ")
    expect(groups.map((group) => group.group)).toEqual(["Actions", "Go to", "Days", "Trips", "Settings"])
    expect(groups.flatMap((group) => group.commands.map((command) => command.title))).not.toContain("Gyeongbokgung Palace")
  })

  it("shows stops once searched for", () => {
    expect(searchCommands(commands, "palace").map((group) => group.group)).toEqual(["Stops"])
  })

  it("caps each group", () => {
    const many = Array.from({ length: 20 }, (_, i) => make(`Stop ${i + 1}`, "Stops"))
    const groups = searchCommands([...many, make("Stop sharing", "Actions")], "stop", 5)
    expect(groups.map((group) => [group.group, group.commands.length])).toEqual([
      ["Actions", 1],
      ["Stops", 5],
    ])
  })
})

describe("foldText", () => {
  it("lowercases, strips Latin accents and collapses spaces", () => {
    expect(foldText("  Ślęża   Mountain ")).toBe("sleza mountain")
    expect(foldText("ＴＯＫＹＯ")).toBe("tokyo")
  })

  it("keeps Japanese voiced marks apart", () => {
    expect(foldText("が")).not.toBe(foldText("か"))
  })
})

describe("keys", () => {
  it("draws ⌘ on Apple platforms and Ctrl elsewhere, modifiers in each platform's order", () => {
    expect(formatShortcut(["mod", "k"], true)).toEqual(["⌘", "K"])
    expect(formatShortcut(["mod", "k"], false)).toEqual(["Ctrl", "K"])
    expect(formatShortcut(["mod", "shift", "z"], true)).toEqual(["⇧", "⌘", "Z"])
    expect(formatShortcut(["shift", "mod", "z"], false)).toEqual(["Ctrl", "Shift", "Z"])
    expect(formatShortcut(["alt", "up"], true)).toEqual(["⌥", "↑"])
    expect(formatShortcut(["alt", "down"], false)).toEqual(["Alt", "↓"])
    expect(formatShortcut(["?"], false)).toEqual(["?"])
  })

  it("speaks shortcuts as words", () => {
    expect(spokenShortcut(["mod", "k"], true)).toBe("Command K")
    expect(spokenShortcut(["mod", "k"], false)).toBe("Control K")
    expect(spokenShortcut(["alt", "up"], true)).toBe("Option Up arrow")
    expect(spokenShortcut(["?"], true)).toBe("Question mark")
  })

  it("recognises Apple platforms", () => {
    expect(isApplePlatform({ platform: "MacIntel" })).toBe(true)
    expect(isApplePlatform({ userAgentData: { platform: "macOS" } })).toBe(true)
    expect(isApplePlatform({ platform: "", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" })).toBe(true)
    expect(isApplePlatform({ userAgentData: { platform: "Windows" }, platform: "Win32" })).toBe(false)
    expect(isApplePlatform({ platform: "Linux x86_64" })).toBe(false)
    expect(isApplePlatform(undefined)).toBe(false)
  })
})

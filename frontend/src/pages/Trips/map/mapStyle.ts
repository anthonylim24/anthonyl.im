import type { StyleSpecification } from "maplibre-gl"

// The Trips basemap: a quiet chart drawn from OpenFreeMap's OpenMapTiles
// vector tiles (no API key). Two palettes, one layer list. Land is the
// background colour; water, parks, roads, buildings and labels sit on top.

interface Palette {
  space: string
  land: string
  water: string
  green: string
  sand: string
  road: string
  roadMajor: string
  roadCasing: string
  rail: string
  boundary: string
  building: string
  buildingTop: string
  label: string
  labelMuted: string
  labelWater: string
  halo: string
  horizon: string
}

const LIGHT: Palette = {
  space: "#f1f0eb",
  land: "#e9e7df",
  water: "#c3d5dc",
  green: "#d9e3d0",
  sand: "#ece6d4",
  road: "#f7f6f1",
  roadMajor: "#ffffff",
  roadCasing: "#d5d2c8",
  rail: "#cfccc2",
  boundary: "#a9a69c",
  building: "#dedbd1",
  buildingTop: "#f6f4ee",
  label: "#22262b",
  labelMuted: "#6c7178",
  labelWater: "#5f8494",
  halo: "rgba(241,240,235,0.9)",
  horizon: "#dfe9ee",
}

const DARK: Palette = {
  space: "#0b0d10",
  land: "#20262d",
  water: "#0b1118",
  green: "#17211d",
  sand: "#1a1c1c",
  road: "#252a31",
  roadMajor: "#323842",
  roadCasing: "#0f1216",
  rail: "#2a2f36",
  boundary: "#4a505a",
  building: "#232930",
  buildingTop: "#39414b",
  label: "#b9b7b1",
  labelMuted: "#7b8089",
  labelWater: "#4f7183",
  halo: "rgba(11,13,16,0.6)",
  horizon: "#1b2a3a",
}

const NAME = ["coalesce", ["get", "name_en"], ["get", "name:latin"], ["get", "name"]] as const
const REGULAR = ["Noto Sans Regular"]
const BOLD = ["Noto Sans Bold"]
const ITALIC = ["Noto Sans Italic"]

export function mapPalette(dark: boolean): Palette {
  return dark ? DARK : LIGHT
}

export function buildMapStyle(dark: boolean, opts: { labels?: boolean } = {}): StyleSpecification {
  const labels = opts.labels !== false
  const p = mapPalette(dark)
  const road = (
    id: string,
    classes: string[],
    color: string,
    width: [number, number][],
    minzoom: number,
    extra: unknown[] = [],
  ) => ({
    id,
    type: "line" as const,
    source: "omt",
    "source-layer": "transportation",
    minzoom,
    filter: ["all", ["match", ["get", "class"], classes, true, false], ...extra] as never,
    layout: { "line-cap": "round" as const, "line-join": "round" as const },
    paint: {
      "line-color": color,
      "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], ...width.flat()] as never,
    },
  })
  const place = (
    id: string,
    classes: string[],
    size: [number, number][],
    opts: { minzoom?: number; maxzoom?: number; font?: string[]; color?: string; upper?: boolean; spacing?: number; padding?: number } = {},
  ) => ({
    id,
    type: "symbol" as const,
    source: "omt",
    "source-layer": "place",
    minzoom: opts.minzoom ?? 0,
    maxzoom: opts.maxzoom ?? 24,
    filter: ["match", ["get", "class"], classes, true, false] as never,
    layout: {
      "text-field": NAME as never,
      "text-font": opts.font ?? REGULAR,
      "text-size": ["interpolate", ["linear"], ["zoom"], ...size.flat()] as never,
      "text-transform": (opts.upper ? "uppercase" : "none") as "uppercase" | "none",
      "text-letter-spacing": opts.spacing ?? 0,
      "text-max-width": 8,
      "text-padding": opts.padding ?? 2,
      "symbol-sort-key": ["coalesce", ["get", "rank"], 50] as never,
    },
    paint: {
      "text-color": opts.color ?? p.label,
      "text-halo-color": p.halo,
      "text-halo-width": 1.4,
    },
  })

  const style: StyleSpecification = {
    version: 8,
    projection: { type: "globe" },
    sky: {
      "sky-color": p.space,
      "horizon-color": p.horizon,
      "fog-color": p.space,
      "sky-horizon-blend": 0.6,
      "horizon-fog-blend": 0.7,
      "fog-ground-blend": 0.4,
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, dark ? 0.9 : 0.6, 5, dark ? 0.6 : 0.35, 7, 0],
    },
    light: { anchor: "viewport", position: [1.4, 210, 38], intensity: dark ? 0.35 : 0.5, color: "#ffffff" },
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      omt: {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
        attribution:
          '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      },
    },
    layers: [
      { id: "land", type: "background", paint: { "background-color": p.land } },
      {
        id: "green",
        type: "fill",
        source: "omt",
        "source-layer": "landcover",
        filter: ["match", ["get", "class"], ["wood", "grass", "farmland"], true, false],
        paint: { "fill-color": p.green, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 2, 0.35, 9, 0.7] },
      },
      {
        id: "sand",
        type: "fill",
        source: "omt",
        "source-layer": "landcover",
        filter: ["==", ["get", "class"], "sand"],
        paint: { "fill-color": p.sand },
      },
      { id: "park", type: "fill", source: "omt", "source-layer": "park", paint: { "fill-color": p.green } },
      { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": p.water } },
      {
        id: "waterway",
        type: "line",
        source: "omt",
        "source-layer": "waterway",
        minzoom: 8,
        paint: { "line-color": p.water, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 16, 4] },
      },
      {
        id: "boundary-state",
        type: "line",
        source: "omt",
        "source-layer": "boundary",
        minzoom: 4,
        filter: ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
        paint: { "line-color": p.boundary, "line-width": 0.6, "line-dasharray": [2, 3], "line-opacity": 0.5 },
      },
      {
        id: "boundary-country",
        type: "line",
        source: "omt",
        "source-layer": "boundary",
        filter: ["all", ["<=", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
        paint: {
          "line-color": p.boundary,
          "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.5, 8, 1.4],
          "line-opacity": 0.75,
        },
      },
      {
        id: "building",
        type: "fill",
        source: "omt",
        "source-layer": "building",
        minzoom: 12.5,
        maxzoom: 14,
        paint: { "fill-color": p.building, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 12.5, 0, 13.2, 0.9] },
      },
      road("road-path", ["path", "track"], p.roadCasing, [[14, 0.4], [18, 2]], 14),
      road("road-minor-case", ["minor", "service"], p.roadCasing, [[12, 0.6], [16, 7], [19, 22]], 12),
      road("road-major-case", ["primary", "secondary", "tertiary", "trunk"], p.roadCasing, [[8, 0.8], [13, 4.5], [16, 13], [19, 34]], 8),
      road("road-motorway-case", ["motorway"], p.roadCasing, [[5, 0.8], [10, 3], [14, 8], [18, 30]], 5),
      {
        id: "rail",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        minzoom: 10,
        filter: ["match", ["get", "class"], ["rail", "transit"], true, false],
        paint: { "line-color": p.rail, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 16, 2] },
      },
      road("road-minor", ["minor", "service"], p.road, [[12, 0.2], [16, 5], [19, 18]], 12),
      road("road-major", ["primary", "secondary", "tertiary", "trunk"], p.roadMajor, [[8, 0.3], [13, 3], [16, 10], [19, 28]], 8),
      road("road-motorway", ["motorway"], p.roadMajor, [[5, 0.4], [10, 2], [14, 6], [18, 24]], 5),
      {
        id: "building-3d",
        type: "fill-extrusion",
        source: "omt",
        "source-layer": "building",
        minzoom: 13.2,
        filter: ["!", ["has", "hide_3d"]],
        paint: {
          "fill-extrusion-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "render_height"], 6],
            0,
            p.building,
            90,
            p.buildingTop,
          ],
          "fill-extrusion-height": [
            "interpolate",
            ["linear"],
            ["zoom"],
            13.2,
            0,
            14.2,
            ["coalesce", ["get", "render_height"], 6],
          ],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": dark ? 0.92 : 0.9,
          "fill-extrusion-vertical-gradient": true,
        },
      },
      {
        id: "water-label",
        type: "symbol",
        source: "omt",
        "source-layer": "water_name",
        filter: ["==", ["geometry-type"], "Point"],
        layout: {
          "text-field": NAME as never,
          "text-font": ITALIC,
          "text-size": ["interpolate", ["linear"], ["zoom"], 1, 10, 6, 13],
          "text-letter-spacing": 0.12,
          "text-max-width": 6,
        },
        paint: { "text-color": p.labelWater, "text-halo-color": p.halo, "text-halo-width": 0.6 },
      },
      {
        id: "road-label",
        type: "symbol",
        source: "omt",
        "source-layer": "transportation_name",
        minzoom: 14.5,
        layout: {
          "symbol-placement": "line",
          "text-field": NAME as never,
          "text-font": REGULAR,
          "text-size": 10.5,
          "text-letter-spacing": 0.04,
        },
        paint: { "text-color": p.labelMuted, "text-halo-color": p.halo, "text-halo-width": 1.2 },
      },
      place("place-hood", ["suburb", "neighbourhood", "quarter"], [[11, 9.5], [15, 12]], {
        minzoom: 11,
        color: p.labelMuted,
        upper: true,
        spacing: 0.1,
      }),
      place("place-town", ["town", "village"], [[7, 10], [13, 14]], { minzoom: 8, color: p.labelMuted }),
      // City names bow out once you are inside the city: the pins say where you are.
      place("place-city", ["city"], [[3, 10.5], [8, 15], [12, 18]], { minzoom: 3, maxzoom: 12.5, font: BOLD }),
      place("place-state", ["state"], [[4, 9.5], [7, 12]], {
        minzoom: 4,
        maxzoom: 8,
        color: p.labelMuted,
        upper: true,
        spacing: 0.14,
      }),
      place("place-country", ["country"], [[1, 8.5], [5, 13]], {
        maxzoom: 7,
        color: p.labelMuted,
        upper: true,
        spacing: 0.18,
        padding: 14,
      }),
    ],
  }
  if (!labels) style.layers = style.layers.filter((layer) => layer.type !== "symbol")
  return style
}
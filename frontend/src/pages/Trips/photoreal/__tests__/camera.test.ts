import { describe, expect, it } from "vitest"
import {
  angleDelta,
  arcLift,
  arcPoints,
  cameraPosition,
  chooseBearing,
  DEG,
  fitDistance,
  flightSeconds,
  headingBetween,
  MIN_DISTANCE,
  mixPose,
  overviewBearing,
  stopDistance,
  toLocal,
  type Frame,
  type Pose,
  type Vec2,
} from "../camera"

const LISBON = { lat: 38.7223, lng: -9.1393 }
const frame: Frame = { tanV: Math.tan(20 * DEG), aspect: 16 / 10, marginX: 0.8, marginTop: 0.8, marginBottom: 0.8 }

/** Project a ground point through a pose; returns NDC relative to the optical centre. */
function project(point: Vec2, pose: Pose, f: Frame): { x: number; y: number } {
  const cam = cameraPosition(pose)
  const forward = { x: -Math.sin(pose.bearing), z: Math.cos(pose.bearing) }
  const right = { x: -Math.cos(pose.bearing), z: -Math.sin(pose.bearing) }
  const view = { x: forward.x * Math.sin(pose.tilt), y: -Math.cos(pose.tilt), z: forward.z * Math.sin(pose.tilt) }
  const up = { x: forward.x * Math.cos(pose.tilt), y: Math.sin(pose.tilt), z: forward.z * Math.cos(pose.tilt) }
  const d = { x: point.x - cam.x, y: pose.y - cam.y, z: point.z - cam.z }
  const depth = d.x * view.x + d.y * view.y + d.z * view.z
  return {
    x: (d.x * right.x + d.z * right.z) / (depth * f.tanV * f.aspect),
    y: (d.x * up.x + d.y * up.y + d.z * up.z) / (depth * f.tanV),
  }
}

describe("toLocal", () => {
  it("puts north on +Z and east on -X, in metres", () => {
    const north = toLocal(LISBON, { lat: LISBON.lat + 0.01, lng: LISBON.lng })
    expect(north.x).toBeCloseTo(0, 6)
    expect(north.z).toBeGreaterThan(1105)
    expect(north.z).toBeLessThan(1115)
    const east = toLocal(LISBON, { lat: LISBON.lat, lng: LISBON.lng + 0.01 })
    expect(east.z).toBeCloseTo(0, 6)
    expect(east.x).toBeLessThan(-860)
    expect(east.x).toBeGreaterThan(-880)
  })
})

describe("bearings", () => {
  it("measures headings clockwise from north", () => {
    const origin = { x: 0, z: 0 }
    expect(headingBetween(origin, { x: 0, z: 100 })).toBeCloseTo(0)
    expect(headingBetween(origin, { x: -100, z: 0 })).toBeCloseTo(Math.PI / 2)
    expect(headingBetween(origin, { x: 100, z: 0 })).toBeCloseTo(-Math.PI / 2)
  })

  it("takes the short way round", () => {
    expect(angleDelta(170 * DEG, -170 * DEG)).toBeCloseTo(20 * DEG)
    expect(angleDelta(-170 * DEG, 170 * DEG)).toBeCloseTo(-20 * DEG)
  })

  it("keeps the bearing while the way onward is in front", () => {
    expect(chooseBearing(10 * DEG, 80 * DEG)).toBe(10 * DEG)
    expect(chooseBearing(10 * DEG, null)).toBe(10 * DEG)
  })

  it("turns to the direction of travel when the next stop would be behind", () => {
    expect(chooseBearing(0, 170 * DEG)).toBeCloseTo(170 * DEG)
    expect(chooseBearing(20 * DEG, -150 * DEG)).toBeCloseTo(-150 * DEG)
  })
})

describe("cameraPosition", () => {
  it("looks straight down with no tilt", () => {
    const at = cameraPosition({ x: 5, y: 10, z: 7, distance: 400, bearing: 1, tilt: 0 })
    expect(at.x).toBeCloseTo(5)
    expect(at.y).toBeCloseTo(410)
    expect(at.z).toBeCloseTo(7)
  })

  it("sits south of the target when looking north", () => {
    const at = cameraPosition({ x: 0, y: 0, z: 0, distance: 400, bearing: 0, tilt: 45 * DEG })
    expect(at.x).toBeCloseTo(0)
    expect(at.z).toBeLessThan(0)
    expect(at.y).toBeCloseTo(at.z * -1)
  })
})

describe("fitDistance", () => {
  const points: Vec2[] = [
    { x: -900, z: 300 },
    { x: 700, z: -400 },
    { x: 100, z: 800 },
    { x: -200, z: -650 },
  ]

  it("never comes closer than the minimum", () => {
    expect(fitDistance([{ x: 0, z: 0 }], { x: 0, z: 0 }, 0, 46 * DEG, frame)).toBe(MIN_DISTANCE)
  })

  it.each([
    [0, 46],
    [70, 46],
    [-140, 54],
    [25, 2],
  ])("frames every point inside the margins (bearing %i°, tilt %i°)", (bearing, tilt) => {
    const target = { x: 0, z: 0 }
    const distance = fitDistance(points, target, bearing * DEG, tilt * DEG, frame)
    const pose: Pose = { x: 0, y: 0, z: 0, distance, bearing: bearing * DEG, tilt: tilt * DEG }
    let tightest = 0
    for (const point of points) {
      const ndc = project(point, pose, frame)
      expect(Math.abs(ndc.x)).toBeLessThanOrEqual(frame.marginX + 1e-6)
      expect(Math.abs(ndc.y)).toBeLessThanOrEqual(frame.marginTop + 1e-6)
      tightest = Math.max(tightest, Math.abs(ndc.x) / frame.marginX, Math.abs(ndc.y) / frame.marginTop)
    }
    // …and no looser than it has to be: something touches a margin.
    expect(tightest).toBeGreaterThan(0.999)
  })

  it("backs off for a narrower free area", () => {
    const wide = fitDistance(points, { x: 0, z: 0 }, 0, 46 * DEG, frame)
    const narrow = fitDistance(points, { x: 0, z: 0 }, 0, 46 * DEG, { ...frame, marginX: 0.4 })
    expect(narrow).toBeGreaterThan(wide)
  })
})

describe("overviewBearing", () => {
  const eastWest: Vec2[] = [
    { x: -1000, z: 0 },
    { x: 0, z: 30 },
    { x: 1000, z: -20 },
  ]
  const northSouth: Vec2[] = eastWest.map((p) => ({ x: p.z, z: p.x }))

  it("keeps north up when the day already runs across a wide screen", () => {
    expect(Math.abs(overviewBearing(eastWest, false))).toBeLessThan(5 * DEG)
  })

  it("turns a north-south day sideways on a wide screen", () => {
    expect(Math.abs(overviewBearing(northSouth, false))).toBeGreaterThan(85 * DEG)
  })

  it("lays a north-south day up the screen on a phone", () => {
    expect(Math.abs(overviewBearing(northSouth, true))).toBeLessThan(5 * DEG)
  })

  it("looks north when every stop shares one spot", () => {
    const stacked: Vec2[] = [
      { x: 120, z: -40 },
      { x: 120, z: -40 },
      { x: 120, z: -40 },
    ]
    expect(overviewBearing(stacked, false)).toBe(0)
    expect(overviewBearing(stacked, true)).toBe(0)
  })

  it("never looks more than a quarter turn away from north", () => {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI
      const line = [-800, 0, 800].map((t) => ({ x: Math.cos(angle) * t, z: Math.sin(angle) * t }))
      expect(Math.abs(overviewBearing(line, false))).toBeLessThanOrEqual(Math.PI / 2 + 1e-9)
    }
  })

  it("leaves a round cluster and a single stop facing north", () => {
    expect(overviewBearing([{ x: 0, z: 0 }], false)).toBe(0)
    expect(
      overviewBearing(
        [
          { x: 100, z: 0 },
          { x: -100, z: 0 },
          { x: 0, z: 100 },
          { x: 0, z: -100 },
        ],
        false,
      ),
    ).toBe(0)
  })
})

describe("flights", () => {
  it("sits 250–450 m back from a stop", () => {
    expect(stopDistance(40)).toBe(250)
    expect(stopDistance(300)).toBeCloseTo(330)
    expect(stopDistance(5000)).toBe(450)
    expect(stopDistance(null)).toBeGreaterThanOrEqual(250)
  })

  it("takes longer for longer hops, within reason", () => {
    expect(flightSeconds(0)).toBeCloseTo(1.5)
    expect(flightSeconds(900)).toBeGreaterThan(flightSeconds(200))
    expect(flightSeconds(1e7)).toBe(3.4)
  })

  it("starts and ends exactly on the poses, lifting in between on a long hop", () => {
    const from: Pose = { x: 0, y: 0, z: 0, distance: 300, bearing: 170 * DEG, tilt: 54 * DEG }
    const to: Pose = { x: 1500, y: 20, z: 400, distance: 320, bearing: -170 * DEG, tilt: 54 * DEG }
    expect(mixPose(from, to, 0, 0)).toEqual(from)
    const end = mixPose(from, to, 1, 1)
    expect(end.x).toBe(to.x)
    expect(end.distance).toBeCloseTo(to.distance)
    expect(angleDelta(end.bearing, to.bearing)).toBeCloseTo(0)
    const mid = mixPose(from, to, 0.5, 0.5)
    expect(mid.distance).toBeGreaterThan(600)
    // Bearing crosses south the short way, not all the way round through north.
    expect(Math.abs(angleDelta(mid.bearing, Math.PI))).toBeLessThan(1 * DEG)
  })

  it("does not lift when only zooming in on the spot", () => {
    const from: Pose = { x: 0, y: 0, z: 0, distance: 4000, bearing: 0, tilt: 14 * DEG }
    const to: Pose = { ...from, distance: 1500, tilt: 46 * DEG }
    expect(mixPose(from, to, 0.5, 0.5).distance).toBeCloseTo(2750)
  })
})

describe("route arcs", () => {
  it("clears rooftops on a short leg and stays shallow on a long one", () => {
    expect(arcLift(60)).toBe(12)
    expect(arcLift(1000)).toBeCloseTo(60)
    expect(arcLift(20_000)).toBe(180)
  })

  it("runs end to end with its apex in the middle", () => {
    const a = { x: 0, y: 10, z: 0 }
    const b = { x: 400, y: 30, z: 300 }
    const pts = arcPoints(a, b, 8)
    expect(pts.length).toBe(27)
    expect(pts.slice(0, 3)).toEqual([0, 10, 0])
    expect(pts.slice(-3)).toEqual([400, 30, 300])
    expect(pts[4 * 3 + 1]).toBeCloseTo(20 + arcLift(500))
  })
})

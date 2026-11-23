import { Fragment, type CSSProperties } from "react"
import { motion, type TargetAndTransition, type Transition } from "motion/react"
import { sx } from "@/styles/merge"
import { c } from "./changes.stylex"
import { hourLabel, type Ribbon, type RibbonBlock, type Slot } from "./ribbon"

// One day's ribbon: the BEFORE layout first, then, after a beat, every
// block travels to its AFTER layout. Transform and opacity only; nothing
// here takes input. Under reduced motion it starts at AFTER, ghosts placed.

/** Ruler labels sit above the blocks; one lane is a block plus its gap. */
const LABEL_H = 18
const BLOCK_H = 12
const PITCH = 16
const NOTE_H = 14
/** Below this the hour labels collide: the frame scrolls instead. */
const MIN_PX_PER_HOUR = 24

/** The repo's spring (`--trips-spring`, cubic-bezier(0.34, 1.4, 0.64, 1)) overshoots about 12%; so does this. */
const SPRING = { type: "spring", stiffness: 240, damping: 17 } as const
const EASE_OUT = [0.16, 1, 0.3, 1] as const
const RETIMED_GHOST = 0.35
const LEFT_GHOST = 0.55

interface Motion {
  initial: TargetAndTransition | false
  animate: TargetAndTransition
  transition: Transition
}

export function DayRibbon({ ribbon, delay, reduce }: { ribbon: Ribbon; delay: number; reduce: boolean }) {
  const span = ribbon.end - ribbon.start
  const pct = (minutes: number) => ((minutes - ribbon.start) / span) * 100
  const notes = ribbon.blocks.some((block) => block.note !== null)
  const height = LABEL_H + ribbon.lanes * PITCH + (notes ? NOTE_H : 0)
  const last = ribbon.hours[ribbon.hours.length - 1]

  return (
    // Out of the tab order: Chrome makes a scroller with nothing focusable in it a tab stop, and this one is hidden from assistive tech.
    <div {...sx(c.frame)} aria-hidden="true" tabIndex={-1}>
      <div {...sx(c.track)} style={{ minWidth: `${(span / 60) * MIN_PX_PER_HOUR}px`, height }}>
        {ribbon.hours.map((hour) => (
          <Fragment key={hour}>
            <span {...sx(c.hourLine)} style={{ left: `${pct(hour)}%`, top: LABEL_H - 4 }} />
            {hour % 180 === 0 && (
              <span
                {...sx(c.hourLabel)}
                // The ends keep their label inside the frame.
                style={{ left: `${pct(hour)}%`, translate: hour === ribbon.start ? "0" : hour === last ? "-100%" : "-50%" }}
              >
                {hourLabel(hour)}
              </span>
            )}
          </Fragment>
        ))}
        {ribbon.blocks.map((block) => (
          <Block key={block.id} block={block} pct={pct} delay={delay} reduce={reduce} />
        ))}
      </div>
    </div>
  )
}

function box(slot: Slot, pct: (minutes: number) => number): CSSProperties {
  return {
    left: `${pct(slot.start)}%`,
    width: `max(6px, ${pct(slot.end) - pct(slot.start)}%)`,
    top: LABEL_H + slot.lane * PITCH,
    height: BLOCK_H,
  }
}

function blockMotion(block: RibbonBlock, pct: (minutes: number) => number, delay: number): Motion {
  const { from, to } = block
  switch (block.motion) {
    case "travel": {
      // The block sits at its AFTER slot; it starts at BEFORE by a translate in
      // its own width (so no measuring) and a stretch from its left edge.
      const width = pct(to!.end) - pct(to!.start)
      return {
        initial: {
          x: `${((pct(from!.start) - pct(to!.start)) / width) * 100}%`,
          y: (from!.lane - to!.lane) * PITCH,
          scaleX: (pct(from!.end) - pct(from!.start)) / width,
        },
        animate: { x: "0%", y: 0, scaleX: 1 },
        transition: { ...SPRING, delay },
      }
    }
    case "enter":
      return { initial: { y: -14, scale: 0.6, opacity: 0 }, animate: { y: 0, scale: 1, opacity: 1 }, transition: { ...SPRING, delay } }
    case "rise":
      return { initial: { y: 10, opacity: 0 }, animate: { y: 0, opacity: 1 }, transition: { duration: 0.36, ease: EASE_OUT, delay } }
    case "remove":
      return { initial: { scale: 1, opacity: 1 }, animate: { scale: 0.4, opacity: 0 }, transition: { duration: 0.26, ease: EASE_OUT, delay } }
    case "leave":
      return { initial: { y: 0, opacity: 1 }, animate: { y: 10, opacity: 0 }, transition: { duration: 0.26, ease: EASE_OUT, delay } }
    case "still":
      return { initial: false, animate: {}, transition: {} }
  }
}

function Block({ block, pct, delay, reduce }: { block: RibbonBlock; pct: (minutes: number) => number; delay: number; reduce: boolean }) {
  const home = block.to ?? block.from
  if (!home) return null
  const gone = block.motion === "remove" || block.motion === "leave"
  // A block only nudged to another lane by its neighbours keeps no ghost: its time didn't change.
  const retimed = block.motion === "travel" && block.from && block.to && (block.from.start !== block.to.start || block.from.end !== block.to.end)
  const ghost = block.from && (retimed || gone) ? block.from : null
  const ghostTo = block.motion === "travel" ? RETIMED_GHOST : LEFT_GHOST
  const move = blockMotion(block, pct, delay)
  const settle = { duration: 0.4, ease: EASE_OUT, delay: delay + 0.08 }
  return (
    <>
      {ghost && (
        <motion.span
          {...sx(c.ghost, block.motion === "remove" && c.struck)}
          style={box(ghost, pct)}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: ghostTo }}
          transition={settle}
        />
      )}
      {ghost && block.note && (
        <motion.span
          {...sx(c.note)}
          style={{ left: `${pct(ghost.start)}%`, top: LABEL_H + ghost.lane * PITCH + BLOCK_H + 3 }}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={settle}
        >
          {block.note}
        </motion.span>
      )}
      {!(reduce && gone) && (
        <span {...sx(c.slot)} style={box(home, pct)}>
          <motion.span
            {...sx(c.block, block.tone === "marked" && c.blockMarked, block.tone === "added" && c.blockAdded)}
            initial={reduce ? false : move.initial}
            animate={move.animate}
            transition={move.transition}
          />
        </span>
      )}
    </>
  )
}

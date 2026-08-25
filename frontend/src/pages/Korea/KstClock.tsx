import { sx } from '@/styles/merge'
import { kstClock } from './KstClock.stylex'
import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

// Compact display of the current Asia/Seoul wall-clock time — surfaces the
// "what time is it where the trip is" context when you're planning from
// somewhere else. Hidden below md so the tree nav stays readable on mobile.

function format(): { time: string; date: string } {
  const now = new Date()
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(now)
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(now)
  return { time, date }
}

export function KstClock() {
  const reduce = useReducedMotion()
  const [{ time, date }, setNow] = useState(() => format())

  useEffect(() => {
    const id = setInterval(() => setNow(format()), 30_000)
    return () => clearInterval(id)
  }, [])

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: 0.4 }}
      title={`${date}, ${time} KST in Seoul`}
      {...sx(kstClock.sc3877837)}
    >
      <span aria-hidden>🇰🇷</span>
      <span {...sx(kstClock.saa60077c)}>{time}</span>
      <span {...sx(kstClock.s5e96a87d)}>KST</span>
    </motion.div>
  )
}

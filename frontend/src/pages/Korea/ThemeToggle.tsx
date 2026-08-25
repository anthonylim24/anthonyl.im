import { sx } from '@/styles/merge'
import type { StyleXStyles } from '@stylexjs/stylex'
import { themeToggle } from './ThemeToggle.stylex'
import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { Moon, Sun, Monitor } from "lucide-react"
import { applyTheme, getInitialTheme, persistTheme, type Theme } from "./koreaUtils"

const ORDER: Theme[] = ["system", "light", "dark"]

const labels: Record<Theme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
}

const icons: Record<Theme, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
}

export function ThemeToggle({ style }: { style?: StyleXStyles } = {}) {
  const reduce = useReducedMotion()
  const [theme, setTheme] = useState<Theme>("system")

  useEffect(() => {
    const initial = getInitialTheme()
    setTheme(initial)
    applyTheme(initial)

    if (initial !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => applyTheme("system")
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  const Icon = icons[theme]
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]

  function cycle() {
    setTheme(next)
    persistTheme(next)
    applyTheme(next)
  }

  return (
    <motion.button
      type="button"
      onClick={cycle}
      title={`Theme: ${labels[theme]} (click for ${labels[next]})`}
      aria-label={`Theme: ${labels[theme]} (click for ${labels[next]})`}
      whileTap={reduce ? undefined : { scale: 0.9, rotate: -10 }}
      {...sx(themeToggle.button, style)}
    >
      <Icon {...sx(themeToggle.scd3f3ccd)} />
    </motion.button>
  )
}

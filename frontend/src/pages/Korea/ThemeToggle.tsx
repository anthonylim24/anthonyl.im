import { useEffect, useState } from "react"
import { motion } from "motion/react"
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

export function ThemeToggle() {
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
      whileTap={{ scale: 0.9, rotate: -10 }}
      whileHover={{ scale: 1.06 }}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-300/70 bg-white text-stone-700 transition hover:border-rose-300 hover:text-rose-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-rose-700 dark:hover:text-rose-200"
    >
      <Icon className="h-4 w-4" />
    </motion.button>
  )
}

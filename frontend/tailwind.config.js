import { fontFamily } from "tailwindcss/defaultTheme";
import { colors } from "./src/lib/colors";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: `#${colors.muted}`,
        input: `#${colors.muted}`,
        ring: `#${colors.primary}`,
        background: `#${colors.background}`,
        foreground: `#${colors.foreground}`,
        primary: {
          DEFAULT: `#${colors.primary}`,
          foreground: `#${colors.background}`,
        },
        secondary: {
          DEFAULT: `#${colors.muted}`,
          foreground: `#${colors.foreground}`,
        },
        muted: {
          DEFAULT: `#${colors.muted}`,
          foreground: `#${colors["muted-foreground"]}`,
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", ...fontFamily.sans],
      },
    },
  },
  plugins: ["tailwindcss-animate"],
}


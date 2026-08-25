/** Shared easing curves — mirror index.css :root tokens. */
export const easings = {
  decel: 'cubic-bezier(0.33, 0, 0, 1)',
  springSmooth: 'cubic-bezier(0.33, 0, 0, 1)',
  outExpo: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const

/** shadcn HSL tokens exposed as CSS variables (set in index.css). */
export const shadcn = {
  background: 'hsl(var(--background))',
  foreground: 'hsl(var(--foreground))',
  card: 'hsl(var(--card))',
  cardForeground: 'hsl(var(--card-foreground))',
  popover: 'hsl(var(--popover))',
  popoverForeground: 'hsl(var(--popover-foreground))',
  primary: 'hsl(var(--primary))',
  primaryForeground: 'hsl(var(--primary-foreground))',
  secondary: 'hsl(var(--secondary))',
  secondaryForeground: 'hsl(var(--secondary-foreground))',
  muted: 'hsl(var(--muted))',
  mutedForeground: 'hsl(var(--muted-foreground))',
  accent: 'hsl(var(--accent))',
  accentForeground: 'hsl(var(--accent-foreground))',
  destructive: 'hsl(var(--destructive))',
  destructiveForeground: 'hsl(var(--destructive-foreground))',
  border: 'hsl(var(--border))',
  input: 'hsl(var(--input))',
  ring: 'hsl(var(--ring))',
  radius: 'var(--radius)',
} as const

/** BreathFlow semantic tokens (scoped under .breathwork in index.css). */
export const bw = {
  canvas: 'var(--bw-canvas)',
  surface: 'var(--bw-surface)',
  text: 'var(--bw-text)',
  textSecondary: 'var(--bw-text-secondary)',
  textTertiary: 'var(--bw-text-tertiary)',
  textFaint: 'var(--bw-text-faint)',
  accent: 'var(--bw-accent)',
  accentLight: 'var(--bw-accent-light)',
  accentSubtle: 'var(--bw-accent-subtle)',
  accentForeground: 'var(--bw-accent-foreground)',
  success: 'var(--bw-success)',
  destructive: 'var(--bw-destructive)',
  destructiveBorder: 'var(--bw-destructive-border)',
  destructiveSubtle: 'var(--bw-destructive-subtle)',
  destructiveHover: 'var(--bw-destructive-hover)',
  border: 'var(--bw-border)',
  borderSubtle: 'var(--bw-border-subtle)',
  hover: 'var(--bw-hover)',
  active: 'var(--bw-active)',
} as const

/** Trips timetable tokens (scoped under .trips in index.css). */
export const trips = {
  canvas: 'var(--trips-canvas)',
  surface: 'var(--trips-surface)',
  ink: 'var(--trips-ink)',
  inkSecondary: 'var(--trips-ink-secondary)',
  inkTertiary: 'var(--trips-ink-tertiary)',
  accent: 'var(--trips-accent)',
  accentInk: 'var(--trips-accent-ink)',
  rail: 'var(--trips-rail)',
  border: 'var(--trips-border)',
  scrim: 'var(--trips-scrim)',
  fieldRadius: 'var(--trips-field-radius)',
  radius: 'var(--trips-radius)',
} as const

/** Chatbot tokens (scoped under .chatbot-shadow / .chatbot-dark). */
export const chat = {
  bg: 'var(--chat-bg)',
  text: 'var(--chat-text)',
  bright: 'var(--chat-bright)',
  accent: 'var(--chat-accent)',
  mid: 'var(--chat-mid)',
  line: 'var(--chat-line)',
  footer: 'var(--chat-footer)',
  placeholder: 'var(--chat-placeholder)',
} as const

# Mobile Adaptation — Design Decisions

## Paper Artboard
- **Name**: "BreathFlow - Mobile Flow"
- **Located in**: Breathwork.paper file, artboard `60-0`, positioned right of the desktop flow artboard
- **Target device**: 390×844 (iPhone 14/15 standard)

## Layout Strategy
- Single-column vertical flow
- Bottom tab navigation (Home, Breathe, Progress, Settings) replaces top nav
- All interactive targets ≥ 44×44px
- Primary actions anchored in thumb zone (bottom 1/3 of screen)

## Screen-by-Screen Decisions

### 1. Home Dashboard
- Stats: 3 compact chips (Level, Streak, Total) instead of hero metric cards
- Techniques: horizontal scroll carousel showing 2 cards, swipe for more
- XP progress bar: full-width, always visible
- Bottom tab nav with active state indicator

### 2. Session Setup
- Full-screen sheet (not inline panel)
- "Begin Session" CTA pinned to bottom (44px height, indigo fill)
- Round controls: centered with large ± buttons (32px circular targets)
- Science explanation truncated, expandable on tap
- Pattern visualization: centered pill showing timing

### 3. Active Breathing (Core Experience)
- Orb fills ~60% of viewport (immersive)
- Phase label ("INHALE") top-center, uppercase, indigo accent
- Countdown number centered in orb (28px bold)
- Round progress ("Round 2 of 4") below orb
- Controls (Pause/Stop) bottom-center, 44px circular buttons
- Stop button: red destructive styling
- Haptic feedback on phase transitions
- Wake Lock API prevents screen sleep

### 4. Progress Page
- Level badge with ring indicator at top
- Activity heatmap: 7-column grid (fits 390px)
- Achievements: horizontal scroll strip (32px badge icons)
- Personal bests: key-value list with dividers
- Session history: infinite scroll list

### 5. Settings Page
- Account section: Google sign-in card at top
- iOS-style toggle rows (Dark Mode, Sound, Haptics)
- Volume slider with percentage label
- Orb theme: swipeable color picker (circles)
- Data section: Export JSON + destructive "Clear all data" (requires confirm sheet)

## Mobile-Specific Technical Notes

### Touch & Interaction
- All touch targets ≥ 44×44px
- Swipe gestures: technique carousel, dismiss bottom sheets
- Haptic feedback on breathing phase changes
- Long-press orb for quick technique switch

### Performance
- Wake Lock API prevents screen sleep during sessions
- GPU-only animations (transform, opacity) — no background-position animation
- prefers-reduced-motion: pause orb, show static phase indicator
- Offline-first with service worker

### Accessibility
- aria-live regions for phase changes
- VoiceOver announcements: "Inhale, 3 seconds remaining"
- Remove user-scalable=no from viewport meta (WCAG 1.4.4)
- Dynamic Type support via CSS clamp()
- Screen reader: orb is a button with role and aria-label

## Design Tokens (Mobile)
- Font scale: 28/18/16/14/12/10px
- Section gaps: 24px
- Group gaps: 12–16px
- Element gaps: 6–8px
- Fonts: Space Grotesk (headings, 600–700), Inter (body, 400–500)

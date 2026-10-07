import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { animate, motion, useInView, useScroll, useTransform, type MotionValue } from 'motion/react'
import * as Tabs from '@radix-ui/react-tabs'
import {
  Braces,
  FilePen,
  FlaskConical,
  GitPullRequest,
  ListChecks,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { sx } from '@/styles/merge'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import {
  AGENT_TASK,
  BENCHMARKS,
  CODE,
  DIFF,
  FEATURED_PAPER,
  STREAM_OUTPUT,
  TRACE,
  type Product,
  type TraceStep,
} from './content'
import { art, bench, chart, clock, code, sec, trace } from './landing.stylex'

const EASE = [0.16, 1, 0.3, 1] as const

/** Fade + rise into view once. Content is never hidden from assistive tech. */
export function Reveal({
  children,
  delay = 0,
  as = 'div',
  xstyle,
}: {
  children: ReactNode
  delay?: number
  as?: 'div' | 'li'
  xstyle?: Parameters<typeof sx>[0]
}) {
  const Tag = as === 'li' ? motion.li : motion.div
  return (
    <Tag
      {...sx(xstyle)}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.9, ease: EASE, delay }}
    >
      {children}
    </Tag>
  )
}

/* ── Thesis: words ink in as you scroll ─────────────────────────── */

function Word({ progress, range, children }: { progress: MotionValue<number>; range: [number, number]; children: string }) {
  const opacity = useTransform(progress, range, [0.16, 1])
  return <motion.span style={{ opacity }}>{children} </motion.span>
}

export function ScrollWords({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.5'] })
  const words = text.split(' ')
  return (
    <p ref={ref} {...sx(sec.thesis)}>
      {words.map((w, i) => (
        <Word key={i} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]}>
          {w}
        </Word>
      ))}
    </p>
  )
}

/* ── Counter ─────────────────────────────────────────────────────── */

export function Counter({ value, suffix = '', decimals = 0 }: { value: number; suffix?: string; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const reduced = useReducedMotion()
  const fmt = useMemo(
    () => new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    [decimals],
  )
  const [shown, setShown] = useState(reduced ? value : 0)
  useEffect(() => {
    if (!inView || reduced) {
      if (reduced) setShown(value)
      return
    }
    const controls = animate(0, value, { duration: 1.8, ease: EASE, onUpdate: setShown })
    return () => controls.stop()
  }, [inView, reduced, value])
  return (
    <span ref={ref}>
      {fmt.format(shown)}
      {suffix}
    </span>
  )
}

/* ── Agent trace: a run replays while on screen ─────────────────── */

const TRACE_ICON: Record<TraceStep['kind'], typeof Search> = {
  plan: ListChecks,
  tool: Search,
  edit: FilePen,
  test: FlaskConical,
  verify: ShieldCheck,
  done: GitPullRequest,
}

function clockText(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function AgentTrace() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { amount: 0.3 })
  const reduced = useReducedMotion()
  const [step, setStep] = useState(0)
  const shownStep = reduced ? TRACE.length : step

  useEffect(() => {
    if (reduced || !inView) return
    const delay = step >= TRACE.length ? 5200 : TRACE[step].ms
    const id = window.setTimeout(() => setStep((s) => (s >= TRACE.length ? 0 : s + 1)), delay)
    return () => window.clearTimeout(id)
  }, [step, inView, reduced])

  const revealed = TRACE.slice(0, shownStep)
  const done = shownStep >= TRACE.length
  const elapsed = revealed.reduce((a, s) => a + s.ms * 0.036, 0)
  const tools = revealed.filter((s) => s.kind !== 'plan').length * 4 + (shownStep > 0 ? 1 : 0)
  const tokens = Math.round(shownStep * 46.3)
  const diffLines = revealed.some((s) => s.kind === 'edit') ? DIFF.length : 0

  return (
    <div ref={ref} {...sx(trace.window)}>
      <div {...sx(trace.bar)}>
        <span {...sx(trace.barTitle)}>lim-agents · run 7f3a2c · billing-service</span>
        <span {...sx(trace.status, done && trace.statusDone)} role="status" aria-live="polite">
          <span {...sx(trace.statusDot, done ? trace.statusDotDone : trace.statusDotLive)} />
          {done ? 'Ready for review' : 'Running'}
        </span>
      </div>
      <div {...sx(trace.task)}>
        <span {...sx(trace.taskLabel)}>Task</span>
        <p {...sx(trace.taskText)}>{AGENT_TASK}</p>
      </div>
      <div {...sx(trace.body)}>
        <ol {...sx(trace.list)} aria-label="Agent steps">
          {TRACE.map((s, i) => {
            const Icon = TRACE_ICON[s.kind]
            const reached = i < shownStep
            const active = i === shownStep - 1 && !done
            return (
              <motion.li
                key={s.label + i}
                {...sx(trace.row, s.kind === 'done' && trace.rowDone)}
                aria-hidden={!reached}
                initial={false}
                animate={{ opacity: reached ? 1 : 0.22, x: reached ? 0 : -6 }}
                transition={{ duration: 0.5, ease: EASE }}
              >
                <span {...sx(trace.icon, s.kind === 'verify' && trace.iconVerify, s.kind === 'done' && trace.iconDone)}>
                  <Icon size={14} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <span {...sx(trace.rowLabel)}>{s.label}</span>
                <span {...sx(trace.rowDetail)}>{s.detail}</span>
                {active && <span {...sx(trace.scan)} aria-hidden="true" />}
              </motion.li>
            )
          })}
        </ol>
        <div {...sx(trace.diff)} aria-label="Diff preview">
          <span {...sx(trace.diffTitle)}>billing/charge.ts</span>
          <pre {...sx(trace.diffPre)}>
            {DIFF.slice(0, diffLines).map((l, i) => (
              <motion.span
                key={i}
                {...sx(trace.diffLine, l.t === 'add' && trace.diffAdd, l.t === 'del' && trace.diffDel)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.07 }}
              >
                {l.t === 'add' ? '+ ' : l.t === 'del' ? '− ' : '  '}
                {l.s}
                {'\n'}
              </motion.span>
            ))}
            {diffLines === 0 && <span {...sx(trace.diffEmpty)}>Waiting for the first edit…</span>}
          </pre>
        </div>
      </div>
      <dl {...sx(trace.stats)}>
        <div {...sx(trace.stat)}>
          <dt {...sx(trace.statK)}>Elapsed</dt>
          <dd {...sx(trace.statV)}>{clockText(elapsed)}</dd>
        </div>
        <div {...sx(trace.stat)}>
          <dt {...sx(trace.statK)}>Tool calls</dt>
          <dd {...sx(trace.statV)}>{tools}</dd>
        </div>
        <div {...sx(trace.stat)}>
          <dt {...sx(trace.statK)}>Tokens</dt>
          <dd {...sx(trace.statV)}>{tokens}k</dd>
        </div>
        <div {...sx(trace.stat)}>
          <dt {...sx(trace.statK)}>Verifier</dt>
          <dd {...sx(trace.statV)}>{done ? '9 / 9 pass' : shownStep > 5 ? '1 fix applied' : '—'}</dd>
        </div>
      </dl>
    </div>
  )
}

/* ── Code window with typed sample + streamed output ────────────── */

const TOKEN = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`|\b(?:import|from|const|new|await|for|of|async|def|in|print|True)\b|\b\d+\b|#.*$|\/\/.*$)/gm

function highlight(src: string) {
  const out: ReactNode[] = []
  let last = 0
  for (const m of src.matchAll(TOKEN)) {
    const i = m.index ?? 0
    if (i > last) out.push(src.slice(last, i))
    const t = m[0]
    const kind = /^["'`]/.test(t) ? code.tStr : /^\d/.test(t) ? code.tNum : /^(#|\/\/)/.test(t) ? code.tCom : code.tKey
    out.push(
      <span key={i} {...sx(kind)}>
        {t}
      </span>,
    )
    last = i + t.length
  }
  if (last < src.length) out.push(src.slice(last))
  return out
}

type Lang = keyof typeof CODE
const LANGS: { id: Lang; label: string }[] = [
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'curl', label: 'cURL' },
]

export function CodeWindow() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.4 })
  const reduced = useReducedMotion()
  const [lang, setLang] = useState<Lang>('typescript')
  const [typed, setTyped] = useState(0)
  const [lines, setLines] = useState(0)
  const full = CODE[lang]
  const finished = reduced || typed >= CODE.typescript.length

  useEffect(() => {
    if (!inView || reduced || typed >= CODE.typescript.length) return
    const id = window.setTimeout(() => setTyped((n) => Math.min(CODE.typescript.length, n + 3)), 16)
    return () => window.clearTimeout(id)
  }, [inView, reduced, typed])

  useEffect(() => {
    if (!finished || lines >= STREAM_OUTPUT.length) return
    const id = window.setTimeout(() => setLines((n) => n + 1), reduced ? 0 : 520)
    return () => window.clearTimeout(id)
  }, [finished, lines, reduced])

  // Only the first tab types itself; switching shows the full sample.
  const visible = lang === 'typescript' && !finished ? full.slice(0, typed) : full

  return (
    <div ref={ref} {...sx(code.window)}>
      <Tabs.Root value={lang} onValueChange={(v) => setLang(v as Lang)}>
        <div {...sx(code.bar)}>
          <Tabs.List {...sx(code.tabs)} aria-label="SDK language">
            {LANGS.map((l) => (
              <Tabs.Trigger key={l.id} value={l.id} {...sx(code.tab)}>
                {l.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <Braces size={15} strokeWidth={1.6} aria-hidden="true" {...sx(code.barIcon)} />
        </div>
        {LANGS.map((l) => (
          <Tabs.Content key={l.id} value={l.id} {...sx(code.content)}>
            <pre {...sx(code.pre)}>
              <code>{highlight(l.id === lang ? visible : CODE[l.id])}</code>
              {l.id === lang && !finished && <span {...sx(code.caret)} aria-hidden="true" />}
            </pre>
          </Tabs.Content>
        ))}
      </Tabs.Root>
      <div {...sx(code.output)} aria-live="polite">
        <span {...sx(code.outputLabel)}>stream</span>
        {STREAM_OUTPUT.slice(0, lines).map((l) => (
          <motion.div
            key={l}
            {...sx(code.outLine, l.startsWith('done') && code.outDone)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            {l}
          </motion.div>
        ))}
      </div>
    </div>
  )
}

/* ── Benchmarks ─────────────────────────────────────────────────── */

export function BenchmarkBars() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.3 })
  return (
    <div ref={ref} {...sx(bench.wrap)}>
      <div {...sx(bench.legend)} aria-hidden="true">
        <span {...sx(bench.key)}>
          <span {...sx(bench.swatch, bench.swatchNow)} /> Lim 3 Atlas
        </span>
        <span {...sx(bench.key)}>
          <span {...sx(bench.swatch, bench.swatchPrev)} /> Lim 2.5 Atlas
        </span>
      </div>
      <ul {...sx(bench.list)}>
        {BENCHMARKS.map((b, i) => (
          <li key={b.name} {...sx(bench.row)}>
            <div {...sx(bench.label)}>
              <span {...sx(bench.name)}>{b.name}</span>
              <span {...sx(bench.note)}>{b.note}</span>
            </div>
            <div {...sx(bench.bars)}>
              <div {...sx(bench.track)}>
                <motion.span
                  {...sx(bench.fill, bench.fillNow)}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: inView ? b.now / 100 : 0 }}
                  transition={{ duration: 1.4, ease: EASE, delay: 0.1 + i * 0.08 }}
                />
              </div>
              <span {...sx(bench.value)} aria-hidden="true">{b.now.toFixed(1)}%</span>
              <div {...sx(bench.track, bench.trackPrev)}>
                <motion.span
                  {...sx(bench.fill, bench.fillPrev)}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: inView ? b.prev / 100 : 0 }}
                  transition={{ duration: 1.4, ease: EASE, delay: 0.2 + i * 0.08 }}
                />
              </div>
              <span {...sx(bench.value, bench.valuePrev)} aria-hidden="true">{b.prev.toFixed(1)}%</span>
            </div>
            <span {...sx(bench.sr)}>
              {`${b.name}: Lim 3 Atlas ${b.now}%, Lim 2.5 Atlas ${b.prev}%`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── Featured paper chart ────────────────────────────────────────── */

export function VerifierChart() {
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.5 })
  const W = 560
  const H = 280
  const pad = { l: 44, r: 64, t: 18, b: 38 }
  const max = 25
  const { baseline, guided } = FEATURED_PAPER.series
  const x = (i: number) => pad.l + (i / (baseline.length - 1)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b)
  const path = (s: number[]) => s.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const lastI = baseline.length - 1
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      {...sx(chart.svg)}
      role="img"
      aria-label="Silent failure rate by task length. Baseline rises to 23.8% at 40 steps; verifier-guided decoding rises to 11.2%."
    >
      {[0, 5, 10, 15, 20, 25].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} {...sx(chart.grid)} />
          <text x={pad.l - 10} y={y(v) + 4} textAnchor="end" {...sx(chart.axis)}>
            {v}%
          </text>
        </g>
      ))}
      {baseline.map((_, i) => (
        <text key={i} x={x(i)} y={H - 12} textAnchor="middle" {...sx(chart.axis)}>
          {(i + 1) * 5}
        </text>
      ))}
      <motion.path
        d={path(baseline)}
        {...sx(chart.base)}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: inView ? 1 : 0 }}
        transition={{ duration: 1.6, ease: EASE }}
      />
      <motion.path
        d={path(guided)}
        {...sx(chart.guided)}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: inView ? 1 : 0 }}
        transition={{ duration: 1.6, ease: EASE, delay: 0.35 }}
      />
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: inView ? 1 : 0 }} transition={{ delay: 1.5 }}>
        <circle cx={x(lastI)} cy={y(baseline[lastI])} r={4} {...sx(chart.dotBase)} />
        <text x={x(lastI) + 10} y={y(baseline[lastI]) + 4} {...sx(chart.endLabel)}>
          23.8%
        </text>
        <circle cx={x(lastI)} cy={y(guided[lastI])} r={4} {...sx(chart.dotGuided)} />
        <text x={x(lastI) + 10} y={y(guided[lastI]) + 4} {...sx(chart.endLabel, chart.endGuided)}>
          11.2%
        </text>
      </motion.g>
      <text x={pad.l} y={H - 0} {...sx(chart.axisTitle)}>
        task length (steps)
      </text>
    </svg>
  )
}

/* ── Office clocks ───────────────────────────────────────────────── */

export function OfficeClock({ city, tz }: { city: string; tz: string }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const parts = useMemo(
    () => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false }),
    [tz],
  )
  const label = useMemo(
    () => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }),
    [tz],
  )
  const p = Object.fromEntries(parts.formatToParts(now).map((x) => [x.type, x.value]))
  const h = Number(p.hour) % 24
  const m = Number(p.minute)
  const s = Number(p.second)
  const hourDeg = ((h % 12) + m / 60) * 30
  const minDeg = (m + s / 60) * 6
  return (
    <div {...sx(clock.wrap)}>
      <svg viewBox="0 0 48 48" {...sx(clock.face)} aria-hidden="true">
        <circle cx="24" cy="24" r="22" {...sx(clock.ring)} />
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1="24" y1="4.5" x2="24" y2={i % 3 === 0 ? 8.5 : 6.5} transform={`rotate(${i * 30} 24 24)`} {...sx(clock.tick)} />
        ))}
        <line x1="24" y1="24" x2="24" y2="13" transform={`rotate(${hourDeg} 24 24)`} {...sx(clock.hour)} />
        <line x1="24" y1="24" x2="24" y2="8.5" transform={`rotate(${minDeg} 24 24)`} {...sx(clock.minute)} />
        <circle cx="24" cy="24" r="1.8" {...sx(clock.pin)} />
      </svg>
      <div>
        <div {...sx(clock.city)}>{city}</div>
        <div {...sx(clock.time)}>
          <time>{label.format(now)}</time>
        </div>
      </div>
    </div>
  )
}

/* ── Product illustrations (pure SVG/CSS loops) ──────────────────── */

export function ProductArt({ kind }: { kind: Product['art'] }) {
  switch (kind) {
    case 'chat':
      return (
        <div {...sx(art.box, art.chat)} aria-hidden="true">
          <span {...sx(art.bubble, art.bubbleUser)}>What did Anthony ship last year?</span>
          <span {...sx(art.bubble, art.bubbleBot)}>
            Three products — a trip planner with a 3D map, a breathwork app, and me.
          </span>
          <span {...sx(art.bubble, art.bubbleBot, art.typing)}>
            <span {...sx(art.dot)} />
            <span {...sx(art.dot, art.dot2)} />
            <span {...sx(art.dot, art.dot3)} />
          </span>
        </div>
      )
    case 'route':
      return (
        <div {...sx(art.box)} aria-hidden="true">
          <svg viewBox="0 0 240 120" {...sx(art.svg)}>
            <path d="M0 92 C40 70 60 104 98 84 S150 30 186 44 S226 28 240 18" {...sx(art.contour)} />
            <path d="M0 64 C46 44 70 74 110 58 S170 8 240 6" {...sx(art.contour)} />
            <path d="M28 88 C70 96 84 40 124 50 S176 82 212 30" {...sx(art.route)} />
            <circle cx="28" cy="88" r="5" {...sx(art.pin)} />
            <circle cx="124" cy="50" r="5" {...sx(art.pin, art.pinMid)} />
            <circle cx="212" cy="30" r="5" {...sx(art.pin, art.pinEnd)} />
          </svg>
        </div>
      )
    case 'breath':
      return (
        <div {...sx(art.box, art.center)} aria-hidden="true">
          <span {...sx(art.breathHalo)} />
          <span {...sx(art.breathOrb)} />
          <span {...sx(art.breathLabel)}>inhale · 4</span>
        </div>
      )
    case 'terminal':
      return (
        <div {...sx(art.box, art.term)} aria-hidden="true">
          <span {...sx(art.termLine)}>$ lim agents run --repo billing</span>
          <span {...sx(art.termLine, art.termDim)}>plan ✓ · edits 3 · tests 214/214</span>
          <span {...sx(art.termLine, art.termOk)}>
            opened #4812<span {...sx(art.cursor)} />
          </span>
        </div>
      )
    case 'api':
      return (
        <div {...sx(art.box, art.center)} aria-hidden="true">
          <span {...sx(art.apiBrace)}>{'{'}</span>
          <span {...sx(art.apiTrack)}>
            <span {...sx(art.apiPacket)} />
            <span {...sx(art.apiPacket, art.apiPacket2)} />
            <span {...sx(art.apiPacket, art.apiPacket3)} />
          </span>
          <span {...sx(art.apiBrace)}>{'}'}</span>
        </div>
      )
  }
}

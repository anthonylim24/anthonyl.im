import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { MotionConfig, motion } from 'motion/react'
import { ArrowRight, ArrowUpRight, Menu, X } from 'lucide-react'
import { sx } from '@/styles/merge'
import { useFavicon } from '@/hooks/useFavicon'
import { syncThemeColor } from '@/lib/themeColor'
import { HeroCanvas } from './HeroCanvas'
import {
  AgentTrace,
  BenchmarkBars,
  CodeWindow,
  Counter,
  OfficeClock,
  ProductArt,
  Reveal,
  ScrollWords,
  VerifierChart,
} from './parts'
import {
  CUSTOMERS,
  FEATURED_PAPER,
  FOOTER,
  MODELS,
  NAV,
  OFFICES,
  PAPERS,
  PILLARS,
  PLATFORM_FEATURES,
  PRICING,
  PRODUCTS,
  QUOTES,
  ROLES,
  SAFETY,
  SAFETY_POINTS,
  THESIS,
} from './content'
import { brand, btn, foot, hero, nav, page, sec } from './landing.stylex'

const EASE = [0.16, 1, 0.3, 1] as const
const TITLE = 'anthonyl.im — Applied intelligence lab'
const BONE = '#EDE8DF'

/** Routes go through the router (preview basename), hashes and URLs stay native. */
function SmartLink({ href, children, ...rest }: { href: string; children: ReactNode } & Omit<ComponentProps<'a'>, 'href'>) {
  if (href.startsWith('/')) {
    return (
      <Link to={href} {...rest}>
        {children}
      </Link>
    )
  }
  const external = /^https?:/.test(href)
  return (
    <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})} {...rest}>
      {children}
    </a>
  )
}

function Wordmark({ onInk = false }: { onInk?: boolean }) {
  return (
    <span {...sx(brand.mark, onInk && brand.onInk)}>
      <svg viewBox="0 0 24 24" {...sx(brand.glyph)} aria-hidden="true">
        <path d="M12 2.5c4.6 4.4 7 8 7 11.2a7 7 0 0 1-14 0C5 10.5 7.4 6.9 12 2.5Z" {...sx(brand.drop)} />
        <path d="M9 14.5a3.2 3.2 0 0 0 3 3" {...sx(brand.shine)} />
      </svg>
      <span>
        anthonyl<span {...sx(brand.dot, onInk && brand.dotOnInk)}>.</span>im
      </span>
    </span>
  )
}

function Kicker({ children, onInk = false }: { children: ReactNode; onInk?: boolean }) {
  return <p {...sx(sec.kicker, onInk && sec.kickerOnInk)}>{children}</p>
}

function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header {...sx(nav.bar, (scrolled || open) && nav.barSolid)}>
      <div {...sx(nav.inner)}>
        <a href="#top" {...sx(nav.home)} aria-label="anthonyl.im home">
          <Wordmark />
        </a>
        <nav aria-label="Primary" {...sx(nav.links)}>
          {NAV.map((l) => (
            <a key={l.href} href={l.href} {...sx(nav.link)}>
              {l.label}
            </a>
          ))}
        </nav>
        <div {...sx(nav.actions)}>
          <a href="#careers" {...sx(nav.link, nav.secondary)}>
            Careers
          </a>
          <Link to="/chatbot" {...sx(btn.base, btn.primary, btn.small)}>
            Talk to Lim
          </Link>
          <button
            type="button"
            {...sx(nav.menuBtn)}
            aria-expanded={open}
            aria-controls="landing-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="landing-menu" aria-label="Mobile" {...sx(nav.sheet)}>
          {[...NAV, { label: 'Careers', href: '#careers' }].map((l) => (
            <a key={l.href} href={l.href} {...sx(nav.sheetLink)} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  )
}

function Hero() {
  const ref = useRef<HTMLElement>(null)
  const lines = ['Intelligence you can', 'hold to account.']
  return (
    <section ref={ref} id="top" {...sx(hero.section)} aria-labelledby="hero-title">
      <HeroCanvas hostRef={ref} />
      <div {...sx(page.container, hero.content)}>
        <motion.a
          href="#models"
          {...sx(hero.announce)}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE, delay: 0.05 }}
        >
          <span {...sx(hero.announceTag)}>New</span>
          Lim 3 Atlas is generally available
          <ArrowRight size={14} aria-hidden="true" />
        </motion.a>
        <h1 id="hero-title" {...sx(hero.title)}>
          {lines.map((l, i) => (
            <span key={l} {...sx(hero.lineMask)}>
              <motion.span
                {...sx(hero.line)}
                initial={{ y: '108%' }}
                animate={{ y: '0%' }}
                transition={{ duration: 1.1, ease: EASE, delay: 0.12 + i * 0.09 }}
              >
                {l}
              </motion.span>
            </span>
          ))}
        </h1>
        <motion.p
          {...sx(hero.lede)}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.4 }}
        >
          anthonyl.im is an applied AI lab. We train frontier models and the agents that put them to work — agents that
          plan before they act, stay inside the bounds you set, and verify every step before it ships.
        </motion.p>
        <motion.div
          {...sx(hero.ctas)}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.52 }}
        >
          <Link to="/chatbot" {...sx(btn.base, btn.primary)}>
            Talk to Lim <ArrowRight size={16} aria-hidden="true" {...sx(btn.arrow)} />
          </Link>
          <a href="#research" {...sx(btn.base, btn.ghost)}>
            Read the research
          </a>
        </motion.div>
      </div>
      <div {...sx(page.container, hero.foot)}>
        <p {...sx(hero.status)}>
          <span {...sx(hero.statusDot)} aria-hidden="true" />
          All systems operational
          <span {...sx(hero.statusSep)} aria-hidden="true">/</span>
          <span {...sx(hero.statusDim)}>2.41M requests per minute · p50 318 ms</span>
        </p>
        <p {...sx(hero.hint)} aria-hidden="true">
          Drag the glass. Tap to poke it.
        </p>
      </div>
    </section>
  )
}

const LOGO_STYLE = {
  heavy: sec.logoHeavy,
  spaced: sec.logoSpaced,
  lower: sec.logoLower,
  italic: sec.logoItalic,
  wide: sec.logoWide,
} as const

function Customers() {
  const row = [...CUSTOMERS, ...CUSTOMERS]
  return (
    <section id="customers" {...sx(sec.ink, sec.customers)} aria-label="Customers">
      <div {...sx(page.container)}>
        <p {...sx(sec.customersLabel)}>Deployed in production at teams like</p>
      </div>
      <div {...sx(sec.marquee)}>
        <ul {...sx(sec.marqueeTrack)}>
          {row.map((c, i) => (
            <li
              key={`${c.name}-${i}`}
              {...sx(sec.logo, LOGO_STYLE[c.style])}
              aria-hidden={i >= CUSTOMERS.length ? true : undefined}
            >
              {c.name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Approach() {
  return (
    <section {...sx(sec.ink, sec.pad)} aria-labelledby="approach-title">
      <div {...sx(page.container)}>
        <Kicker onInk>Our approach</Kicker>
        <h2 id="approach-title" {...sx(page.srOnly)}>
          Our approach
        </h2>
        <ScrollWords text={THESIS} />
        <ol {...sx(sec.pillars)}>
          {PILLARS.map((p, i) => (
            <Reveal key={p.n} as="li" delay={i * 0.08}>
              <div {...sx(sec.pillar)}>
                <span {...sx(sec.pillarN)}>{p.n}</span>
                <h3 {...sx(sec.pillarTitle)}>{p.title}</h3>
                <p {...sx(sec.pillarBody)}>{p.body}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}

function Agents() {
  return (
    <section id="agents" {...sx(sec.ink, sec.padBottom)} aria-labelledby="agents-title">
      <div {...sx(page.container)}>
        <div {...sx(sec.splitHead)}>
          <div>
            <Kicker onInk>Lim Agents · Beta</Kicker>
            <h2 id="agents-title" {...sx(sec.h2, sec.h2OnInk)}>
              From request to reviewed pull request.
            </h2>
          </div>
          <p {...sx(sec.lede, sec.ledeOnInk)}>
            A real run, replayed. The agent plans, edits, tests, and catches its own mistake before a human ever sees
            the diff.
          </p>
        </div>
        <Reveal>
          <AgentTrace />
        </Reveal>
      </div>
    </section>
  )
}

function Models() {
  return (
    <section id="models" {...sx(sec.bone, sec.pad)} aria-labelledby="models-title">
      <div {...sx(page.container)}>
        <div {...sx(sec.splitHead)}>
          <div>
            <Kicker>Models</Kicker>
            <h2 id="models-title" {...sx(sec.h2)}>
              The Lim 3 family.
            </h2>
          </div>
          <p {...sx(sec.lede)}>
            One architecture at three sizes, trained together so prompts, tools, and evals carry from the data centre
            to the device in your pocket.
          </p>
        </div>
        <ul {...sx(sec.models)}>
          {MODELS.map((m, i) => (
            <Reveal key={m.name} as="li" delay={i * 0.08}>
              <article {...sx(sec.model, i === 0 && sec.modelLead)}>
                <div {...sx(sec.modelHead)}>
                  <span {...sx(sec.modelTier, i === 0 && sec.modelTierLead)}>{m.tier}</span>
                  <h3 {...sx(sec.modelName)}>{m.name}</h3>
                </div>
                <p {...sx(sec.modelBlurb, i === 0 && sec.modelBlurbLead)}>{m.blurb}</p>
                <dl {...sx(sec.specs)}>
                  {m.specs.map((s) => (
                    <div key={s.k} {...sx(sec.spec, i === 0 && sec.specLead)}>
                      <dt {...sx(sec.specK, i === 0 && sec.specKLead)}>{s.k}</dt>
                      <dd {...sx(sec.specV)}>{s.v}</dd>
                    </div>
                  ))}
                </dl>
                <p {...sx(sec.price, i === 0 && sec.priceLead)}>{m.price}</p>
              </article>
            </Reveal>
          ))}
        </ul>

        <div id="benchmarks" {...sx(sec.benchHead)}>
          <h3 {...sx(sec.h3)}>A generational step, measured.</h3>
          <p {...sx(sec.small)}>
            Pass@1, averaged over five runs. Methodology in the{' '}
            <a href="#paper-system-card" {...sx(sec.inlineLink)}>
              Lim 3 System Card
            </a>
            .
          </p>
        </div>
        <BenchmarkBars />
      </div>
    </section>
  )
}

function Products() {
  return (
    <section id="products" {...sx(sec.boneDeep, sec.pad)} aria-labelledby="products-title">
      <div {...sx(page.container)}>
        <div {...sx(sec.splitHead)}>
          <div>
            <Kicker>Products</Kicker>
            <h2 id="products-title" {...sx(sec.h2)}>
              Put it to work.
            </h2>
          </div>
          <p {...sx(sec.lede)}>
            Three are live on this site right now. Open one — they are the same models and agent stack we sell.
          </p>
        </div>
        <ul {...sx(sec.products)}>
          {PRODUCTS.map((p, i) => (
            <Reveal
              key={p.id}
              as="li"
              delay={(i % 3) * 0.08}
              xstyle={i < 3 ? sec.productThird : i === PRODUCTS.length - 1 ? sec.productLast : sec.productHalf}
            >
              <article {...sx(sec.product)}>
                <ProductArt kind={p.art} />
                <div {...sx(sec.productMeta)}>
                  <h3 {...sx(sec.productName)}>{p.name}</h3>
                  <span {...sx(sec.pill, p.status === 'Live' && sec.pillLive)}>
                    {p.status === 'Live' && <span {...sx(sec.pillDot)} aria-hidden="true" />}
                    {p.status}
                  </span>
                </div>
                <p {...sx(sec.productBlurb)}>{p.blurb}</p>
                <SmartLink href={p.href} {...sx(sec.productCta)}>
                  {p.cta}
                  {p.internal ? <ArrowUpRight size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
                </SmartLink>
              </article>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Platform() {
  return (
    <section id="platform" {...sx(sec.ink, sec.pad)} aria-labelledby="platform-title">
      <div {...sx(page.container)}>
        <div {...sx(sec.platformGrid)}>
          <div>
            <Kicker onInk>Platform</Kicker>
            <h2 id="platform-title" {...sx(sec.h2, sec.h2OnInk)}>
              One API. Every capability.
            </h2>
            <p {...sx(sec.lede, sec.ledeOnInk, sec.ledeBelow)}>
              The same endpoints that run Lim Agents in production, with SDKs for TypeScript and Python and a 99.99%
              uptime SLA.
            </p>
            <ul {...sx(sec.features)}>
              {PLATFORM_FEATURES.map((f) => (
                <li key={f.title} {...sx(sec.feature)}>
                  <span {...sx(sec.featureTitle)}>{f.title}</span>
                  <span {...sx(sec.featureBody)}>{f.body}</span>
                </li>
              ))}
            </ul>
          </div>
          <Reveal>
            <CodeWindow />
          </Reveal>
        </div>
        <div {...sx(sec.pricing)}>
          <h3 {...sx(sec.h3, sec.h3OnInk)}>Pricing, per million tokens</h3>
          <table {...sx(sec.table)}>
            <thead>
              <tr>
                <th scope="col" {...sx(sec.th)}>
                  Model
                </th>
                <th scope="col" {...sx(sec.th, sec.num)}>
                  Input
                </th>
                <th scope="col" {...sx(sec.th, sec.num)}>
                  Cached input
                </th>
                <th scope="col" {...sx(sec.th, sec.num)}>
                  Output
                </th>
              </tr>
            </thead>
            <tbody>
              {PRICING.map((r) => (
                <tr key={r.model}>
                  <th scope="row" {...sx(sec.td, sec.tdModel)}>
                    {r.model}
                  </th>
                  <td {...sx(sec.td, sec.num)}>{r.input}</td>
                  <td {...sx(sec.td, sec.num)}>{r.cached}</td>
                  <td {...sx(sec.td, sec.num)}>{r.output}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function Research() {
  return (
    <section id="research" {...sx(sec.bone, sec.pad)} aria-labelledby="research-title">
      <div {...sx(page.container)}>
        <Kicker>Research</Kicker>
        <h2 id="research-title" {...sx(sec.h2, sec.h2Wide)}>
          Published, reproducible, and occasionally humbling.
        </h2>
        <Reveal>
          <article {...sx(sec.featured)}>
            <div {...sx(sec.featuredText)}>
              <p {...sx(sec.meta)}>
                {FEATURED_PAPER.date} · {FEATURED_PAPER.area}
              </p>
              <h3 {...sx(sec.featuredTitle)}>{FEATURED_PAPER.title}</h3>
              <p {...sx(sec.body)}>{FEATURED_PAPER.body}</p>
              <div {...sx(sec.legendRow)} aria-hidden="true">
                <span {...sx(sec.legendKey)}>
                  <span {...sx(sec.legendLine)} /> Baseline
                </span>
                <span {...sx(sec.legendKey)}>
                  <span {...sx(sec.legendLine, sec.legendLineUltra)} /> Verifier-guided
                </span>
              </div>
            </div>
            <figure {...sx(sec.featuredFig)}>
              <VerifierChart />
              <figcaption {...sx(sec.small)}>Silent failure rate vs. task length, 1,200 held-out tasks.</figcaption>
            </figure>
          </article>
        </Reveal>
        <ul {...sx(sec.papers)}>
          {PAPERS.map((p) => (
            <li key={p.id} id={p.id} {...sx(sec.paperItem)}>
              <details {...sx(sec.paper)}>
                <summary {...sx(sec.paperSummary)}>
                  <span {...sx(sec.paperDate)}>{p.date}</span>
                  <span {...sx(sec.paperArea)}>{p.area}</span>
                  <span {...sx(sec.paperTitle)}>{p.title}</span>
                  <span {...sx(sec.paperToggle)} aria-hidden="true">
                    <span {...sx(sec.paperBar)} />
                    <span {...sx(sec.paperBar, sec.paperBarV)} />
                  </span>
                </summary>
                <p {...sx(sec.paperAbstract)}>{p.abstract}</p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Safety() {
  return (
    <section id="safety" {...sx(sec.ultra, sec.pad)} aria-labelledby="safety-title">
      <div {...sx(page.container)}>
        <Kicker onInk>Safety</Kicker>
        <h2 id="safety-title" {...sx(sec.h2, sec.h2OnInk, sec.h2Wide)}>
          Capability and control, shipped together.
        </h2>
        <dl {...sx(sec.safetyStats)}>
          {SAFETY.map((s) => (
            <div key={s.label} {...sx(sec.safetyStat)}>
              <dt {...sx(page.srOnly)}>{s.label}</dt>
              <dd {...sx(sec.safetyValue)}>
                <Counter value={s.value} suffix={s.suffix} />
              </dd>
              <dd {...sx(sec.safetyLabel)}>{s.label}</dd>
            </div>
          ))}
        </dl>
        <div {...sx(sec.safetyFoot)}>
          <ul {...sx(sec.safetyPoints)}>
            {SAFETY_POINTS.map((p) => (
              <li key={p} {...sx(sec.safetyPoint)}>
                {p}
              </li>
            ))}
          </ul>
          <a href="#paper-system-card" {...sx(btn.base, btn.onUltra)}>
            Read the Lim 3 System Card <ArrowRight size={16} aria-hidden="true" {...sx(btn.arrow)} />
          </a>
        </div>
      </div>
    </section>
  )
}

function Voices() {
  return (
    <section {...sx(sec.bone, sec.pad)} aria-labelledby="voices-title">
      <div {...sx(page.container)}>
        <Kicker>In production</Kicker>
        <h2 id="voices-title" {...sx(sec.h2)}>
          What teams hand off now.
        </h2>
        <ul {...sx(sec.quotes)}>
          {QUOTES.map((q, i) => (
            <Reveal key={q.name} as="li" delay={i * 0.08}>
              <figure {...sx(sec.quote)}>
                <blockquote {...sx(sec.quoteText)}>“{q.quote}”</blockquote>
                <figcaption {...sx(sec.quoteBy)}>
                  <span {...sx(sec.quoteName)}>{q.name}</span>
                  <span {...sx(sec.quoteRole)}>{q.role}</span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Company() {
  return (
    <section id="company" {...sx(sec.paperBg, sec.pad)} aria-labelledby="company-title">
      <div {...sx(page.container)}>
        <div {...sx(sec.companyGrid)}>
          <div>
            <Kicker>Company</Kicker>
            <h2 id="company-title" {...sx(sec.h2)}>
              A small lab with a long horizon.
            </h2>
            <p {...sx(sec.body, sec.bodyLarge)}>
              Founded in 2024, anthonyl.im is 72 people across San Francisco, New York, and Seoul. Researchers ship
              product, engineers publish, and everyone is on call for what they build.
            </p>
            <div {...sx(sec.clocks)}>
              {OFFICES.map((o) => (
                <OfficeClock key={o.city} city={o.city} tz={o.tz} />
              ))}
            </div>
          </div>
          <div id="careers">
            <h3 {...sx(sec.h3)}>Open roles</h3>
            <ul {...sx(sec.roles)}>
              {ROLES.map((r) => (
                <li key={r.title} {...sx(sec.role)}>
                  <span {...sx(sec.roleTitle)}>{r.title}</span>
                  <span {...sx(sec.roleMeta)}>
                    {r.team} · {r.place}
                  </span>
                </li>
              ))}
            </ul>
            <Link to="/chatbot" {...sx(btn.base, btn.ghost, sec.rolesCta)}>
              Ask Lim about the team <ArrowRight size={16} aria-hidden="true" {...sx(btn.arrow)} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

function Closing() {
  return (
    <section {...sx(sec.ink, sec.closing)} aria-labelledby="closing-title">
      <div {...sx(page.container, sec.closingInner)}>
        <h2 id="closing-title" {...sx(sec.closingTitle)}>
          Start with a{' '}
          <span {...sx(sec.closingMark)}>
            conversation.
            <svg viewBox="0 0 400 24" preserveAspectRatio="none" {...sx(sec.closingStroke)} aria-hidden="true">
              <motion.path
                d="M4 16 C80 6 160 20 230 12 S350 6 396 14"
                {...sx(sec.closingPath)}
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true, amount: 0.8 }}
                transition={{ duration: 1.4, ease: EASE, delay: 0.2 }}
              />
            </svg>
          </span>
        </h2>
        <div {...sx(hero.ctas, sec.closingCtas)}>
          <Link to="/chatbot" {...sx(btn.base, btn.primary)}>
            Talk to Lim <ArrowRight size={16} aria-hidden="true" {...sx(btn.arrow)} />
          </Link>
          <a href="#platform" {...sx(btn.base, btn.ghostOnInk)}>
            Explore the platform
          </a>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer {...sx(foot.wrap)}>
      <div {...sx(page.container)}>
        <div {...sx(foot.grid)}>
          <div {...sx(foot.brandCol)}>
            <Wordmark onInk />
            <p {...sx(foot.tag)}>Frontier models and agents that check their work.</p>
          </div>
          {FOOTER.map((col) => (
            <nav key={col.title} aria-label={col.title} {...sx(foot.col)}>
              <h2 {...sx(foot.colTitle)}>{col.title}</h2>
              <ul {...sx(foot.list)}>
                {col.links.map((l) => (
                  <li key={l.label}>
                    <SmartLink href={l.href} {...sx(foot.link)}>
                      {l.label}
                    </SmartLink>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div {...sx(foot.legal)}>
          <p>© 2026 anthonyl.im</p>
          <p {...sx(foot.legalNote)}>
            A design study: the models, metrics, customers, papers, and roles on this page are illustrative. Lim,
            Concierge, and BreathFlow are real and live.
          </p>
          <p {...sx(foot.legalNote)}>
            3D glass and film grain use{' '}
            <a href="https://threejs-blocks.com" target="_blank" rel="noreferrer" {...sx(foot.inlineLink)}>
              Three.js Blocks
            </a>{' '}
            under the{' '}
            <a
              href="https://polyformproject.org/licenses/noncommercial/1.0.0"
              target="_blank"
              rel="noreferrer"
              {...sx(foot.inlineLink)}
            >
              PolyForm Noncommercial 1.0.0
            </a>{' '}
            license. Required Notice: Copyright (c) 2025-2026 ロリンジャー株式会社 (Rohlinger K.K.), doing business as
            Three.js Blocks (https://threejs-blocks.com).
          </p>
        </div>
      </div>
    </footer>
  )
}

export function Landing() {
  useFavicon()

  useEffect(() => {
    const previous = document.title
    document.title = TITLE
    syncThemeColor('light', { light: BONE, dark: BONE })
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <div {...sx('landing', page.root)}>
        <a href="#main" {...sx(page.skip)}>
          Skip to content
        </a>
        <Nav />
        <main id="main">
          <Hero />
          <Customers />
          <Approach />
          <Agents />
          <Models />
          <Products />
          <Platform />
          <Research />
          <Safety />
          <Voices />
          <Company />
          <Closing />
        </main>
        <Footer />
      </div>
    </MotionConfig>
  )
}

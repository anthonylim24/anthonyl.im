/**
 * Landing copy + illustrative data. anthonyl.im is presented as an applied AI
 * lab; the model family, metrics, customers, papers and roles are mock data
 * (disclosed in the footer). Lim, Concierge and BreathFlow are the real apps
 * on this site and link to their live routes.
 */

export type NavLink = { label: string; href: string }

export const NAV: NavLink[] = [
  { label: 'Research', href: '#research' },
  { label: 'Models', href: '#models' },
  { label: 'Products', href: '#products' },
  { label: 'Platform', href: '#platform' },
  { label: 'Safety', href: '#safety' },
  { label: 'Company', href: '#company' },
]

export const CUSTOMERS = [
  { name: 'Northwind', style: 'heavy' },
  { name: 'HALCYON BIO', style: 'spaced' },
  { name: 'meridian health', style: 'lower' },
  { name: 'Corvid', style: 'italic' },
  { name: 'KESTREL', style: 'wide' },
  { name: 'Atlas Grid', style: 'heavy' },
  { name: 'fieldstone', style: 'lower' },
  { name: 'LUMEN PAY', style: 'spaced' },
  { name: 'Tessera', style: 'italic' },
  { name: 'ARDENT', style: 'wide' },
  { name: 'Basalt', style: 'heavy' },
  { name: 'orchard&co', style: 'lower' },
] as const

export const THESIS =
  'Most AI guesses, then hopes. Ours drafts a plan, acts inside the bounds you set, and checks its own work before anything reaches you. It changes what you can safely hand off.'

export const PILLARS = [
  {
    n: '01',
    title: 'Plan',
    body: 'Every task starts as an explicit plan you can read, edit, or veto before a single tool runs.',
  },
  {
    n: '02',
    title: 'Act',
    body: 'Tools execute in scoped sandboxes with budgets, permissions, and a full audit trail.',
  },
  {
    n: '03',
    title: 'Verify',
    body: 'An independent verifier grades each step. Anything that fails is rolled back, not shipped.',
  },
]

export type TraceStep = {
  kind: 'plan' | 'tool' | 'edit' | 'test' | 'verify' | 'done'
  label: string
  detail: string
  ms: number
}

export const AGENT_TASK =
  'Migrate billing from the legacy charges API to payment intents. Keep the suite green and open a PR.'

export const TRACE: TraceStep[] = [
  { kind: 'plan', label: 'Plan', detail: 'Map 14 call sites → migrate to intents → backfill idempotency keys → run suite', ms: 900 },
  { kind: 'tool', label: 'search_code', detail: '"charges.create" — 14 matches in 9 files', ms: 700 },
  { kind: 'edit', label: 'edit', detail: 'billing/charge.ts  +42 −31', ms: 900 },
  { kind: 'edit', label: 'edit', detail: 'billing/refunds.ts  +18 −22', ms: 700 },
  { kind: 'test', label: 'run_tests', detail: 'billing/**  — 211 passed · 3 failed', ms: 1100 },
  { kind: 'verify', label: 'verifier', detail: '3 failures share a missing confirm: true on capture', ms: 1000 },
  { kind: 'edit', label: 'edit', detail: 'billing/capture.ts  +3 −1', ms: 600 },
  { kind: 'test', label: 'run_tests', detail: 'billing/**  — 214 passed', ms: 1000 },
  { kind: 'done', label: 'open_pr', detail: '#4812 Migrate billing to payment intents — ready for review', ms: 1400 },
]

export const DIFF = [
  { t: 'ctx', s: 'export async function charge(order: Order) {' },
  { t: 'del', s: '  const res = await pay.charges.create({' },
  { t: 'add', s: '  const intent = await pay.paymentIntents.create({' },
  { t: 'ctx', s: '    amount: order.totalCents,' },
  { t: 'ctx', s: '    currency: order.currency,' },
  { t: 'add', s: '    idempotencyKey: `order_${order.id}`,' },
  { t: 'add', s: '    confirm: true,' },
  { t: 'ctx', s: '  })' },
] as const

export type Model = {
  name: string
  tier: string
  blurb: string
  specs: { k: string; v: string }[]
  price: string
}

export const MODELS: Model[] = [
  {
    name: 'Lim 3 Atlas',
    tier: 'Frontier',
    blurb: 'Our most capable model, for long-horizon reasoning, agentic coding, and research synthesis.',
    specs: [
      { k: 'Context', v: '2M tokens' },
      { k: 'Max output', v: '128K' },
      { k: 'Time to first token', v: '0.9 s' },
    ],
    price: '$6 in · $24 out / M tokens',
  },
  {
    name: 'Lim 3 Swift',
    tier: 'Real-time',
    blurb: 'Near-frontier quality at conversational speed. Built for voice and high-volume agents.',
    specs: [
      { k: 'Context', v: '400K tokens' },
      { k: 'Throughput', v: '240 tok/s' },
      { k: 'Time to first token', v: '180 ms' },
    ],
    price: '$0.80 in · $3.20 out / M tokens',
  },
  {
    name: 'Lim 3 Pocket',
    tier: 'On-device',
    blurb: 'A 3B-parameter model that runs entirely on the device in your hand. Private by construction.',
    specs: [
      { k: 'Context', v: '128K tokens' },
      { k: 'Footprint', v: '1.9 GB (int4)' },
      { k: 'Weights', v: 'Open, Apache-2.0' },
    ],
    price: 'Free to run',
  },
]

export const BENCHMARKS = [
  { name: 'SWE-bench Verified', note: 'Agentic coding', now: 78.4, prev: 64.1 },
  { name: 'GPQA Diamond', note: 'Graduate-level science', now: 84.7, prev: 76.2 },
  { name: 'τ²-bench Retail', note: 'Tool use', now: 81.9, prev: 69.0 },
  { name: 'Terminal-Bench 2.0', note: 'Command line', now: 57.2, prev: 41.0 },
  { name: 'MMMU', note: 'Multimodal reasoning', now: 79.3, prev: 72.5 },
  { name: 'ARC-AGI-2', note: 'Novel reasoning', now: 31.6, prev: 12.8 },
]

export type Product = {
  id: string
  name: string
  status: 'Live' | 'Beta' | 'GA'
  blurb: string
  cta: string
  href: string
  internal: boolean
  art: 'chat' | 'route' | 'breath' | 'terminal' | 'api'
}

export const PRODUCTS: Product[] = [
  {
    id: 'lim',
    name: 'Lim',
    status: 'Live',
    blurb: 'Our conversational model, grounded in a curated record of one engineer’s work. Ask what shipped, why, and how.',
    cta: 'Talk to Lim',
    href: '/chatbot',
    internal: true,
    art: 'chat',
  },
  {
    id: 'concierge',
    name: 'Concierge',
    status: 'Live',
    blurb: 'Trip planning that does the legwork: one line becomes a day-by-day plan with geocoded places, weather, and travel legs — then fly through it in photoreal 3D.',
    cta: 'Plan a trip',
    href: '/trips',
    internal: true,
    art: 'route',
  },
  {
    id: 'breathflow',
    name: 'BreathFlow',
    status: 'Live',
    blurb: 'Guided breathwork with research-cited protocols and an orb paced to your cadence.',
    cta: 'Take a breath',
    href: '/breathwork',
    internal: true,
    art: 'breath',
  },
  {
    id: 'agents',
    name: 'Lim Agents',
    status: 'Beta',
    blurb: 'Background agents for engineering teams. They plan, edit, test, and open the pull request — you review.',
    cta: 'See an agent run',
    href: '#agents',
    internal: false,
    art: 'terminal',
  },
  {
    id: 'platform',
    name: 'Lim Platform',
    status: 'GA',
    blurb: 'One API for reasoning, tool use, memory, and evals, with the same models we run in production.',
    cta: 'Read the API',
    href: '#platform',
    internal: false,
    art: 'api',
  },
]

export const PLATFORM_FEATURES = [
  { title: 'Streaming', body: 'Server-sent tokens, tool calls and plans as they form.' },
  { title: 'Tool use', body: 'Typed tools with budgets, timeouts and dry-run mode.' },
  { title: 'Structured output', body: 'JSON Schema in, guaranteed-valid JSON out.' },
  { title: 'Memory', body: 'Per-user memory with retention you control.' },
  { title: 'Batch', body: '50% off for workloads that can wait 24 hours.' },
  { title: 'Evals', body: 'Grade prompts and agents against your own test sets.' },
]

export const CODE = {
  typescript: `import { Lim } from "@anthonyl.im/sdk";

const lim = new Lim();

const run = await lim.agents.run({
  model: "lim-3-atlas",
  task: "Reconcile March invoices against the ledger",
  tools: ["sql", "sheets"],
  verify: true,
});

for await (const event of run.stream()) {
  console.log(event.type, event.summary);
}`,
  python: `from anthonylim import Lim

lim = Lim()

run = lim.agents.run(
    model="lim-3-atlas",
    task="Reconcile March invoices against the ledger",
    tools=["sql", "sheets"],
    verify=True,
)

for event in run.stream():
    print(event.type, event.summary)`,
  curl: `curl https://api.anthonyl.im/v1/agents/runs \\
  -H "Authorization: Bearer $LIM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "lim-3-atlas",
    "task": "Reconcile March invoices against the ledger",
    "tools": ["sql", "sheets"],
    "verify": true,
    "stream": true
  }'`,
} as const

export const STREAM_OUTPUT = [
  'plan      4 steps · est. 3m 10s',
  'tool      sql.query  → 1,284 invoices',
  'tool      sheets.read → ledger!A2:H9120',
  'verify    totals match within $0.00',
  'done      7 mismatches flagged · report.csv',
]

export const PRICING = [
  { model: 'Lim 3 Atlas', input: '$6.00', cached: '$0.60', output: '$24.00' },
  { model: 'Lim 3 Swift', input: '$0.80', cached: '$0.08', output: '$3.20' },
  { model: 'Lim 3 Pocket', input: 'On-device', cached: '—', output: 'Free' },
]

export type Paper = {
  id: string
  date: string
  area: string
  title: string
  abstract: string
}

export const FEATURED_PAPER = {
  date: 'September 2026',
  area: 'Agents',
  title: 'Verifier-guided decoding halves silent failures in long-horizon agents',
  body: 'Agents rarely fail loudly. They drift: one plausible-but-wrong step compounds into a confident, wrong result. We train a separate verifier to score every intermediate step and let the policy backtrack when the score drops. On 40-step tasks, silent failures fall from 23.8% to 11.2% at a 9% latency cost.',
  series: {
    baseline: [1.2, 2.8, 4.9, 7.6, 10.4, 13.9, 17.2, 20.6, 23.8],
    guided: [0.9, 1.7, 2.6, 3.8, 5.0, 6.4, 7.9, 9.5, 11.2],
  },
}

export const PAPERS: Paper[] = [
  {
    id: 'paper-system-card',
    date: 'Sep 2026',
    area: 'Safety',
    title: 'Lim 3 System Card',
    abstract:
      'Capability and safety evaluations for the Lim 3 family, including 38,000 hours of external red-teaming, autonomy and cyber-uplift thresholds, and the deployment safeguards each model shipped with.',
  },
  {
    id: 'paper-sparse-intent',
    date: 'Aug 2026',
    area: 'Interpretability',
    title: 'Sparse intent features: reading an agent’s plan before it runs',
    abstract:
      'Dictionary learning on the residual stream recovers features that predict an agent’s next tool call 1.8 seconds before it is emitted, letting a monitor pause risky actions without reading chain-of-thought.',
  },
  {
    id: 'paper-speculative-tools',
    date: 'Jul 2026',
    area: 'Efficiency',
    title: 'Speculative tool calls: 2.3× faster agents at equal accuracy',
    abstract:
      'A small draft model predicts likely tool calls and executes them in read-only sandboxes ahead of the main policy. Accepted speculations save a full round-trip; rejected ones are discarded with no side effects.',
  },
  {
    id: 'paper-reversible',
    date: 'Jun 2026',
    area: 'Safety',
    title: 'Reversible by default: transactional sandboxes for autonomous agents',
    abstract:
      'We describe the copy-on-write filesystem, network journaling and API compensation layer that let every Lim Agents action be replayed or undone for 30 days.',
  },
  {
    id: 'paper-calibration',
    date: 'Apr 2026',
    area: 'Evals',
    title: 'Knowing when to ask: calibration in agentic settings',
    abstract:
      'A benchmark of 2,400 ambiguous tasks that measures whether an agent asks a clarifying question at the right moment, and the training recipe that moved Lim from 41% to 77% appropriate escalations.',
  },
  {
    id: 'paper-pocket',
    date: 'Feb 2026',
    area: 'On-device',
    title: 'Pocket: distilling a 3B model that keeps its reasoning',
    abstract:
      'Multi-teacher distillation with plan-level supervision yields a 3B model that matches our previous-generation 70B model on tool-use benchmarks while running at 38 tok/s on a laptop CPU.',
  },
]

export const SAFETY = [
  { value: 38000, suffix: '+', label: 'hours of external red-teaming before Lim 3 Atlas shipped' },
  { value: 100, suffix: '%', label: 'of agent actions logged, replayable, and reversible for 30 days' },
  { value: 0, suffix: '', label: 'customer prompts used for training — by default and by contract' },
]

export const SAFETY_POINTS = [
  'Capability thresholds are set before training starts, not after results come in.',
  'Every frontier release ships with a public system card and third-party evals.',
  'Agents inherit your permissions — never more — and spend only the budget you grant.',
]

export const QUOTES = [
  {
    quote: 'We gave Lim Agents our flakiest service. Two weeks later it had the best test coverage in the company.',
    name: 'Priya Raman',
    role: 'VP Engineering, Tessera',
  },
  {
    quote: 'Swift resolves most of our support volume end to end — and it knows exactly when to hand a customer to a person.',
    name: 'Marcus Hale',
    role: 'Head of Customer Experience, Lumen Pay',
  },
  {
    quote: 'Pocket runs on field tablets with no connectivity at all. A year ago that simply wasn’t possible.',
    name: 'Dr. Elena Sørensen',
    role: 'CTO, Halcyon Bio',
  },
]

export const OFFICES = [
  { city: 'San Francisco', tz: 'America/Los_Angeles' },
  { city: 'New York', tz: 'America/New_York' },
  { city: 'Seoul', tz: 'Asia/Seoul' },
]

export const ROLES = [
  { title: 'Research Engineer, Agents', team: 'Research', place: 'San Francisco · Seoul' },
  { title: 'Inference Engineer, Kernels', team: 'Infrastructure', place: 'San Francisco' },
  { title: 'Member of Technical Staff, Safety', team: 'Safety', place: 'San Francisco' },
  { title: 'Product Designer, Platform', team: 'Design', place: 'New York · Remote' },
  { title: 'Developer Advocate', team: 'Go-to-market', place: 'Seoul' },
]

export const FOOTER: { title: string; links: NavLink[] }[] = [
  {
    title: 'Products',
    links: [
      { label: 'Lim', href: '/chatbot' },
      { label: 'Concierge', href: '/trips' },
      { label: 'BreathFlow', href: '/breathwork' },
      { label: 'Lim Agents', href: '#agents' },
      { label: 'Platform', href: '#platform' },
    ],
  },
  {
    title: 'Research',
    links: [
      { label: 'Publications', href: '#research' },
      { label: 'Lim 3 System Card', href: '#paper-system-card' },
      { label: 'Benchmarks', href: '#benchmarks' },
      { label: 'Safety', href: '#safety' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '#company' },
      { label: 'Careers', href: '#careers' },
      { label: 'Customers', href: '#customers' },
      { label: 'Source on GitHub', href: 'https://github.com/anthonylim24/anthonyl.im' },
    ],
  },
]

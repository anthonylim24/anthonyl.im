// The server refuses a save it can't store with `400 { error, issues }`,
// where `issues` are zod's (path + code). This turns that answer into one
// sentence a traveller can act on ("The title of a stop on day 3 is too
// long."), never a pipeline message or a JSON path.

interface Issue {
  path: readonly (string | number)[]
  code: string
  origin?: string
  maximum?: number
  message?: string
}

const FIELD_WORDS: Record<string, string> = {
  title: "title",
  name: "name",
  notes: "notes",
  journal: "journal",
  city: "city",
  emoji: "emoji",
  time: "start time",
  endTime: "end time",
  confirmation: "confirmation number",
  contact: "contact",
  url: "link",
  links: "links",
  address: "address",
  provider: "provider",
  number: "booking number",
  from: "departure place",
  to: "arrival place",
  seat: "seat",
  terminal: "terminal",
  endDate: "end date",
  text: "text",
  amount: "amount",
  currency: "currency",
  date: "date",
  body: "note",
  neighborhoods: "neighbourhoods",
  callouts: "notes",
}

const word = (field: string | number | undefined) => (typeof field === "string" ? (FIELD_WORDS[field] ?? null) : null)

/** The last named field in a path, skipping array indexes and the records that hold it. */
function lastField(rest: readonly (string | number)[]): string | null {
  for (let i = rest.length - 1; i >= 0; i--) {
    const w = word(rest[i])
    if (w) return w
  }
  return null
}

function where(path: readonly (string | number)[]): string {
  const [head, index, ...rest] = path
  const nth = typeof index === "number" ? index + 1 : null
  const of = (thing: string) => {
    const field = lastField(rest)
    return field ? `The ${field} of ${thing}` : capitalise(thing)
  }
  switch (head) {
    case "name":
      return "The trip name"
    case "slug":
      return "The trip’s link name"
    case "description":
      return "The trip description"
    case "destinations":
      return nth ? "A destination" : "The list of destinations"
    case "tags":
      return nth ? "A tag" : "The list of tags"
    case "timezone":
      return "The trip’s time zone"
    case "startDate":
    case "endDate":
      return "The trip’s dates"
    case "budget":
      return "The budget"
    case "appearance":
      return "The trip’s look"
    case "days": {
      if (!nth) return "The list of days"
      const [field, itemIndex, ...itemRest] = rest
      if (field === "items") {
        if (typeof itemIndex !== "number") return `The list of stops on day ${nth}`
        const itemField = lastField(itemRest)
        return itemField ? `The ${itemField} of a stop on day ${nth}` : `A stop on day ${nth}`
      }
      const dayField = word(field)
      return dayField ? `Day ${nth}’s ${dayField}` : `Day ${nth}`
    }
    case "ideas":
      return nth ? of("an idea") : "The list of ideas"
    case "expenses":
      return nth ? of("an expense") : "The list of expenses"
    case "checklist":
      return nth ? of("a checklist item") : "The checklist"
    case "party":
      return nth ? of("someone in the party") : "The list of travellers"
    default:
      return "Part of this trip"
  }
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function problem(issue: Issue): string {
  const many = issue.origin === "array"
  switch (issue.code) {
    case "too_big":
      return many
        ? `has too many entries${issue.maximum ? ` (${issue.maximum} at most)` : ""}`
        : `is too long${issue.maximum ? ` (${issue.maximum.toLocaleString("en")} characters at most)` : ""}`
    case "too_small":
      return many ? "needs at least one entry" : "can’t be empty"
    case "invalid_format":
    case "invalid_string":
      return "isn’t in a form the server accepts"
    case "custom":
      return issue.message ? `can’t be saved: ${issue.message}` : "isn’t valid"
    default:
      return "isn’t valid"
  }
}

function isIssue(value: unknown): value is Issue {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  return Array.isArray(v.path) && typeof v.code === "string"
}

/** Server phrases that are not zod issues, in the traveller's words. */
const PLAIN: Record<string, string> = {
  "endDate must be on or after startDate": "The trip can’t end before it starts.",
}

/** One sentence for a refused save, from the server's 400 body (anything at all). */
export function describeRefusal(body: unknown): string {
  const b = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {}
  const issues = Array.isArray(b.issues) ? b.issues.filter(isIssue) : []
  const first = issues[0]
  if (first) {
    const more = issues.length - 1
    return `${where(first.path)} ${problem(first)}${more > 0 ? `, and ${more === 1 ? "one other thing needs" : `${more} other things need`} fixing` : ""}.`
  }
  const raw = typeof b.message === "string" && b.message ? b.message : typeof b.error === "string" ? b.error : ""
  if (raw && PLAIN[raw]) return PLAIN[raw]
  return raw && raw !== "invalid update" ? `The server couldn’t store this change (${raw}).` : "The server couldn’t store this change."
}

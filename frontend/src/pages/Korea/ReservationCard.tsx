import { motion, useReducedMotion } from "motion/react"
import { MapPin, Phone, ExternalLink } from "lucide-react"
import type { Reservation } from "./types"
import { statusMeta, typeMeta, formatDate } from "./koreaTheme"
import { mapsSearchUrl, tokenize } from "./linkify"
import { LinkifiedText } from "./LinkifiedText"
import { Time } from "./Time"

interface ReservationCardProps {
  reservation: Reservation
  index?: number
  compact?: boolean
}

const STATUS_TIPS: Record<string, string> = {
  confirmed: "Booking is locked in.",
  tentative: "Soft hold or weather-dependent — confirm before relying on it.",
  pending: "Not booked yet — needs action.",
}

function detectContactKind(contact: string): "phone" | "email" | "url" | "other" {
  if (/^\+?\d[\d\s-]{6,}/.test(contact)) return "phone"
  if (/@/.test(contact)) return "email"
  if (/\b(catch table|naver|http|www\.|\.com|\.kr)/i.test(contact)) return "url"
  return "other"
}

function urlForContact(contact: string): string | null {
  const cleaned = contact.split("·")[0].trim()
  if (/^https?:\/\//i.test(cleaned)) return cleaned
  const phoneMatch = cleaned.match(/\+82[\s-]?\d[\d\s-]+/)
  if (phoneMatch) return `tel:${phoneMatch[0].replace(/[\s-]/g, "")}`
  if (/@/.test(cleaned)) return `mailto:${cleaned.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? cleaned}`
  if (/catch table/i.test(cleaned)) return "https://www.catchtable.co.kr/"
  if (/\b(\w[\w-]+\.[a-z]{2,})\b/i.test(cleaned)) {
    const match = cleaned.match(/\b(\w[\w-]+\.[a-z]{2,})\b/i)
    return match ? `https://${match[0]}` : null
  }
  return null
}

export function ReservationCard({ reservation, index = 0, compact = false }: ReservationCardProps) {
  const reduce = useReducedMotion()
  const s = statusMeta[reservation.status]
  const t = typeMeta[reservation.type]

  const mapHref = reservation.address ? mapsSearchUrl(reservation.address) : null
  const contactHref = reservation.contact ? urlForContact(reservation.contact) : null
  const contactKind = reservation.contact ? detectContactKind(reservation.contact) : "other"

  // Has any address or content that the linkifier might surface
  const subtitleHasLinks = reservation.subtitle ? tokenize(reservation.subtitle).some((s) => s.kind === "link") : false
  void subtitleHasLinks // currently unused; reserved for future "smart" badge

  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ type: "spring", stiffness: 380, damping: 28, delay: reduce ? 0 : index * 0.04 }}
      whileHover={reduce ? undefined : { y: -2, transition: { type: "spring", stiffness: 500, damping: 30 } }}
      className={
        "group relative overflow-hidden rounded-2xl border border-stone-200 bg-white/80 p-4 shadow-sm backdrop-blur transition dark:border-stone-800 dark:bg-stone-900/60 " +
        (compact ? "sm:p-3" : "")
      }
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-xl shadow-inner dark:bg-stone-800"
        >
          {t.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="min-w-0 break-words text-sm font-semibold text-stone-900 dark:text-stone-100">
              <LinkifiedText>{reservation.title}</LinkifiedText>
            </h3>
            <span
              title={STATUS_TIPS[reservation.status]}
              className={"shrink-0 cursor-help rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider " + s.chip}
            >
              {s.label}
            </span>
          </div>
          {(reservation.time || reservation.date) && (
            <p className="mt-1 font-mono text-xs text-stone-500 dark:text-stone-400">
              {formatDate(reservation.date)}
              {reservation.time ? (
                <>
                  {" · "}
                  <Time value={reservation.time} />
                </>
              ) : null}
            </p>
          )}
          {reservation.subtitle && !compact && (
            <p className="mt-1.5 text-sm text-stone-700 dark:text-stone-300">
              <LinkifiedText>{reservation.subtitle}</LinkifiedText>
            </p>
          )}

          {/* Chip row: address, phone/url. One chip style — ink on stone
              with rose hover. Maps and Call/Book read as the same kind
              of affordance because they are. */}
          {!compact && (mapHref || contactHref) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {mapHref && (
                <a
                  href={mapHref}
                  target="_blank"
                  rel="noreferrer"
                  title={`Open in Google Maps: ${reservation.address}`}
                  className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-medium text-stone-800 transition hover:border-stone-300 hover:text-rose-700 dark:border-stone-800 dark:bg-stone-900/60 dark:text-stone-200 dark:hover:border-stone-700 dark:hover:text-rose-300"
                >
                  <MapPin className="h-3 w-3" aria-hidden /> Maps
                </a>
              )}
              {contactHref && (
                <a
                  href={contactHref}
                  target={contactKind === "phone" || contactKind === "email" ? undefined : "_blank"}
                  rel={contactKind === "phone" || contactKind === "email" ? undefined : "noreferrer"}
                  title={reservation.contact}
                  className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-medium text-stone-800 transition hover:border-stone-300 hover:text-rose-700 dark:border-stone-800 dark:bg-stone-900/60 dark:text-stone-200 dark:hover:border-stone-700 dark:hover:text-rose-300"
                >
                  {contactKind === "phone" ? (
                    <>
                      <Phone className="h-3 w-3" aria-hidden /> Call
                    </>
                  ) : contactKind === "email" ? (
                    <>
                      <ExternalLink className="h-3 w-3" aria-hidden /> Email
                    </>
                  ) : (
                    <>
                      <ExternalLink className="h-3 w-3" aria-hidden /> Book
                    </>
                  )}
                </a>
              )}
            </div>
          )}

          {/* Sub-details below the chip row */}
          {reservation.address && !compact && (
            <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
              <span aria-hidden>📍 </span>
              <LinkifiedText>{reservation.address}</LinkifiedText>
            </p>
          )}
          {reservation.contact && !compact && (
            <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
              <span aria-hidden>{contactKind === "phone" ? "☎️ " : "🔗 "}</span>
              <LinkifiedText>{reservation.contact}</LinkifiedText>
            </p>
          )}
          {reservation.notes && !compact && (
            <p className="mt-2 rounded-md bg-stone-50 px-2.5 py-1.5 text-xs italic text-stone-600 dark:bg-stone-800/60 dark:text-stone-400">
              <LinkifiedText>{reservation.notes}</LinkifiedText>
            </p>
          )}
        </div>
      </div>
    </motion.article>
  )
}

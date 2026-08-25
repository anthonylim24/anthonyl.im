import { sx } from '@/styles/merge'
import { reservationCard } from './ReservationCard.stylex'
import { motion, useReducedMotion } from "motion/react"
import { useFineHover } from "@/hooks/useFineHover"
import { MapPin, Phone, ExternalLink } from "lucide-react"
import type { Reservation } from "./types"
import { statusMeta, typeMeta, formatDate } from "./koreaTheme"
import { mapsSearchUrl } from "./linkify"
import { LinkifiedText } from "./LinkifiedText"
import { Time } from "./Time"
import { SmartEntity } from "./SmartEntity"
import { reservationEntityType } from "./entityForReservation"

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
  const fineHover = useFineHover()
  const s = statusMeta[reservation.status]
  const t = typeMeta[reservation.type]

  const mapHref = reservation.address ? mapsSearchUrl(reservation.address) : null
  const contactHref = reservation.contact ? urlForContact(reservation.contact) : null
  const contactKind = reservation.contact ? detectContactKind(reservation.contact) : "other"

  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ type: "spring", stiffness: 380, damping: 28, delay: reduce ? 0 : index * 0.04 }}
      whileHover={reduce || !fineHover ? undefined : { y: -2, transition: { type: "spring", stiffness: 500, damping: 30 } }}
      {...sx(reservationCard.article, compact ? reservationCard.articleCompact : undefined)}
    >
      <div {...sx(reservationCard.se99caeca)}>
        <div
          aria-hidden
          {...sx(reservationCard.s47bb6bc2)}
        >
          {t.icon}
        </div>
        <div {...sx(reservationCard.se30fd43e)}>
          <div {...sx(reservationCard.s790ac3cd)}>
            <h3 {...sx(reservationCard.seadad39)}>
              <SmartEntity name={reservation.title} type={reservationEntityType(reservation.type)} />
            </h3>
            <span
              title={STATUS_TIPS[reservation.status]}
              {...sx(reservationCard.statusChip, s.chip)}
            >
              {s.label}
            </span>
          </div>
          {(reservation.time || reservation.date) && (
            <p {...sx(reservationCard.saa27cff6)}>
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
            <p {...sx(reservationCard.s366347f2)}>
              <LinkifiedText>{reservation.subtitle}</LinkifiedText>
            </p>
          )}

          {/* Chip row: address, phone/url. One chip style — ink on stone
              with rose hover. Maps and Call/Book read as the same kind
              of affordance because they are. */}
          {!compact && (mapHref || contactHref) && (
            <div {...sx(reservationCard.s6ce983c5)}>
              {mapHref && (
                <a
                  href={mapHref}
                  target="_blank"
                  rel="noreferrer"
                  title={`Open in Google Maps: ${reservation.address}`}
                  {...sx(reservationCard.s28fabddc)}
                >
                  <MapPin {...sx(reservationCard.scd31254b)} aria-hidden /> Maps
                </a>
              )}
              {contactHref && (
                <a
                  href={contactHref}
                  target={contactKind === "phone" || contactKind === "email" ? undefined : "_blank"}
                  rel={contactKind === "phone" || contactKind === "email" ? undefined : "noreferrer"}
                  title={reservation.contact}
                  {...sx(reservationCard.s28fabddc)}
                >
                  {contactKind === "phone" ? (
                    <>
                      <Phone {...sx(reservationCard.scd31254b)} aria-hidden /> Call
                    </>
                  ) : contactKind === "email" ? (
                    <>
                      <ExternalLink {...sx(reservationCard.scd31254b)} aria-hidden /> Email
                    </>
                  ) : (
                    <>
                      <ExternalLink {...sx(reservationCard.scd31254b)} aria-hidden /> Book
                    </>
                  )}
                </a>
              )}
            </div>
          )}

          {/* Sub-details below the chip row */}
          {reservation.address && !compact && (
            <p {...sx(reservationCard.sbdc28cf0)}>
              <span aria-hidden>📍 </span>
              <LinkifiedText>{reservation.address}</LinkifiedText>
            </p>
          )}
          {reservation.contact && !compact && (
            <p {...sx(reservationCard.s44aff51)}>
              <span aria-hidden>{contactKind === "phone" ? "☎️ " : "🔗 "}</span>
              <LinkifiedText>{reservation.contact}</LinkifiedText>
            </p>
          )}
          {reservation.notes && !compact && (
            <p {...sx(reservationCard.sf49ca63e)}>
              <LinkifiedText>{reservation.notes}</LinkifiedText>
            </p>
          )}
        </div>
      </div>
    </motion.article>
  )
}

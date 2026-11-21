import { BedDouble, Receipt, ShoppingBag, Ticket, TrainFront, UtensilsCrossed, type LucideIcon } from "lucide-react"
import type { ExpenseCategory } from "../types"

/** One glyph per budget line, from the same set the itinerary uses for stops. */
export const CATEGORY_ICON: Record<ExpenseCategory, LucideIcon> = {
  lodging: BedDouble,
  transport: TrainFront,
  food: UtensilsCrossed,
  activities: Ticket,
  shopping: ShoppingBag,
  other: Receipt,
}

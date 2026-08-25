import { Link } from "react-router-dom"
import { sx } from "@/lib/utils"
import { siteNotFound } from "@/styles/chatbot.stylex"

/** Unknown top-level routes. Keep the parchment chatbot register. */
export function SiteNotFound() {
  return (
    <div {...sx(siteNotFound.root, 'chatbot-shadow')}>
      <p {...sx(siteNotFound.code)}>404</p>
      <h1 {...sx(siteNotFound.title)}>This page is not here.</h1>
      <p {...sx(siteNotFound.body)}>
        The address does not match a page on anthonyl.im.
      </p>
      <div {...sx(siteNotFound.actions)}>
        <Link to="/" {...sx(siteNotFound.primaryLink)}>
          Ask Anthony
        </Link>
        <Link to="/breathwork" {...sx(siteNotFound.secondaryLink)}>
          BreathFlow
        </Link>
      </div>
    </div>
  )
}

import { sx } from '@/styles/merge'
import { koreaNotFound } from './KoreaNotFound.stylex'
import { Link } from "react-router-dom"

/** Unknown Korea dossier addresses: send the reader to /trips/korea-2026. */
export function KoreaNotFound() {
  return (
    <div {...sx(koreaNotFound.s2e91b32d)}>
      <p {...sx(koreaNotFound.sd3c7a9db)}>
        404
      </p>
      <h1
        {...sx(koreaNotFound.s617533bf)}
        style={{ fontFamily: "'Cormorant Garamond', serif" }}
      >
        This page is not in the dossier.
      </h1>
      <p {...sx(koreaNotFound.s4267326f)}>
        The address does not match a Korea trip page. The dossier lives at
        /trips/korea-2026.
      </p>
      <Link
        to="/trips/korea-2026"
        {...sx(koreaNotFound.s69a0ee2d)}
      >
        Back to overview
      </Link>
    </div>
  )
}

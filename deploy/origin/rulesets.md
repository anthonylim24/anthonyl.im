# Origin required checks

Origin required checks match on the installing app plus the suite `key` and optionally the run `key`. Display `name` is ignored.

Configure **Settings → Rules and Protections** on the Origin-hosted repo:

| Field | Value |
| --- | --- |
| Branch | `main` |
| Required check key | `pr-gate` |
| Suite key (if asked) | `anthonyl-im-ci` |

Do **not** require `preview` or `deploy`. A droplet blip must not block merge.

GitHub stays on `.github/branch-protection.json` (`pr-gate`, `enforce_admins: true`) until you fully leave GitHub.

# igPlaces Eval Harness

Accuracy evaluation for the Instagram place extraction pipeline.

## Running the eval

```bash
bun run server/src/igPlaces/eval/run.ts
```

Requires `GROQ_API_KEY` and `GOOGLE_MAPS_API_KEY` in your environment. `KAKAO_REST_API_KEY` is optional (falls back to Google-only geocoding).

Prints a table of extraction precision/recall, category accuracy, and geo accuracy (within 100 m) per fixture, plus a TOTAL row.

## Regression contract

The TOTAL row must not drop more than **5 percentage points** vs the prior baseline on any of the four metrics (`ext-P`, `ext-R`, `cat`, `geo`). Record the baseline in this file after each intentional improvement.

| baseline | ext-P | ext-R | cat  | geo  |
|----------|-------|-------|------|------|
| initial  | —     | —     | —    | —    |

## Adding a fixture

1. Capture post data: `bun run server/src/igPlaces/cli.ts <instagram-url> --dry-run`
2. Save the printed JSON as `fixtures/<NN>-<slug>/input.json`
3. Hand-label the expected places as `fixtures/<NN>-<slug>/expected.json` (see schema below)
4. Run `bun run server/src/igPlaces/eval/run.ts` to verify the scores look reasonable
5. Commit both files

### expected.json schema

```json
{
  "places": [
    {
      "name": "string (Korean or English, verbatim from post)",
      "is_subject": true,
      "category": "cafe | restaurant | bar | shopping | activity | hotel | landmark | other",
      "lat": 37.0000,
      "lng": 127.0000
    }
  ]
}
```

## Coverage targets

Aim for ≥10 fixtures covering:
- Geotagged post, single cafe (fixture 01 — done)
- Untagged post, single restaurant — name-only geocoding
- Multi-place listicle ("Top 5 Seoul cafes")
- Silent reel — overlay text only (no audio/transcript)
- Audio-only mention — no text overlay, no location tag
- Mixed Korean/English code-switch caption
- Passing mention only (is_subject=false)
- No-place post (expected: empty `places` array)
- Carousel of N images — multi-frame OCR
- Busan side-street with ambiguous name

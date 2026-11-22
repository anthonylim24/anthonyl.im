# Bundle splitting

Source of truth: `frontend/vite.config.ts`.

`vite.config.ts` uses `codeSplitting` (Rolldown; formerly `advancedChunks`) to keep initial load fast:

| Chunk | Contents | Why |
|-------|----------|-----|
| `three-core` | `three.core.js` | Shared by the photoreal 3D view and every WebGPU scene |
| `three` | three.js WebGL build + loaders + OrbitControls | Only loaded by the photoreal 3D view |
| `three-webgpu` | `three/webgpu` + `three/tsl` + TSL addons + `three-blocks` | Lazy WebGPU scenes: landing hero, Lim, BreathFlow bloom |
| `tiles3d` | 3d-tiles-renderer | Only loaded by the photoreal 3D view |
| `maplibre` | maplibre-gl + `@maplibre/*` + `@mapbox/*` | Every Trips map. Lazy: loads with the first map (`map/engine.ts`), not with the route. ≈ 1.07 MB / 290 kB gzip |
| `react-vendor` | react + react-dom + scheduler | Stable cache |
| `motion` | motion/framer-motion | Shared; split so no route drags it in through a three.js chunk |
| `effect` | effect + `@effect/*` | Frontend I/O runtime |
| `tslib` | tslib helpers | Shared by `supabase` and `radix` (react-remove-scroll). Ungrouped, Rolldown put them in `supabase`, so a Radix dialog downloaded Supabase too |
| `supabase` | @supabase/* | Auth + sync |
| `router` | react-router | Routing |
| `radix` | @radix-ui/* | UI primitives |
| `state` | zustand | State |
| `icons` | lucide-react | Icons |
| `markdown` | react-markdown + remark | Chatbot + trip concierge |
| `photoreal` | `pages/Trips/photoreal/` except `available.ts` | Photoreal 3D view, opened from a Trips day menu. `tiles3d` loads behind it only when there is a tiles key |

Not named in `codeSplitting`, but kept lazy on purpose: `GlassLayer` (`pages/Trips/glass/`, ≈ 16 kB / 7 kB gzip) holds the Liquid Glass look's refraction engine, light and WebGL2 wallpaper. `TripsLayout` loads it through `lazyRetry` only while the look is on, so the atlas never downloads it; no route entry module may import from `glass/` except `look.ts`, `LookToggle.tsx` and `glass.css`.

Chunk size warning ceiling is 1100 kB (intentional — `maplibre` is the largest chunk at ≈ 1.07 MB; it and `three` are lazily loaded and cached by SW).

## The entry

Every route is a `lazyRetry` import in `AppRoutes.tsx`, Landing included, so `dist/index.html` preloads only what every app needs: `react-vendor`, `router`, `effect` (`lib/telemetry.ts`) and the entry itself. `scripts/check-entry-preloads.mjs` runs after `vite build` and fails the build if the modulepreload list names `motion`, `radix`, `supabase`, `maplibre`, `three*`, `tiles3d` or `photoreal`; it also prints the entry's size.

| Entry JS (modulepreloads + `index-*.js`) | Files | Raw | Gzip |
|---|---|---|---|
| Before (Landing static in the route table) | 9 | 1003.5 kB | 309.2 kB |
| After (Landing lazy, `tslib` group) | 5 | 460.6 kB | 146.4 kB |

Before, `/` preloaded `motion` (59 kB gz), `supabase` (54 kB gz), `radix` (17 kB gz) and `icons` (10.5 kB gz) through the landing page's static import.

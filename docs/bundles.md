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
| `supabase` | @supabase/* | Auth + sync |
| `router` | react-router | Routing |
| `radix` | @radix-ui/* | UI primitives |
| `state` | zustand | State |
| `icons` | lucide-react | Icons |
| `markdown` | react-markdown + remark | Chatbot + trip concierge |
| `photoreal` | `pages/Trips/photoreal/` except `available.ts` | Photoreal 3D view, opened from a Trips day menu. `tiles3d` loads behind it only when there is a tiles key |

Chunk size warning ceiling is 1100 kB (intentional — `maplibre` is the largest chunk at ≈ 1.07 MB; it and `three` are lazily loaded and cached by SW).

---

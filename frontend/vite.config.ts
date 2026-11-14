import path from "path"
import react from "@vitejs/plugin-react"
import stylex from "@stylexjs/unplugin"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    stylex.vite({
      importSources: [
        "@stylexjs/stylex",
        "stylex",
        { from: "@/styles/merge", as: "stylex" },
      ],
      // The plugin's default looks for a literal `index.css`, which never
      // matches hashed output, then falls back to the first CSS asset — a lazy
      // route chunk once routes ship their own CSS. Pin it to the entry sheet.
      cssInjectionTarget: (file: string) => /(^|\/)index-[^/]*\.css$/.test(file),
      useCSSLayers: {
        before: ["reset", "base"],
        after: ["utilities"],
        prefix: "stylex",
      },
    }),
    react(),
  ],
  base: (() => {
    const raw = process.env.VITE_BASE?.trim()
    if (!raw || raw === "/") return "/"
    return raw.endsWith("/") ? raw : `${raw}/`
  })(),
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    // Three.js is ~600 kB on its own and is the dominant cost of the
    // /korea Map Mode chunk. The chunk is already lazy-loaded (only
    // downloaded when a user opens Map Mode), and we split it into its
    // own chunk so it can be cached independently of our Map Mode glue
    // code. We lift the warning ceiling to 650 kB to silence the noise
    // for that one intentionally-large vendor chunk.
    // The "three" chunk also carries the GLTF / DRACO / KTX2 loaders
    // + OrbitControls used by Map Mode's photorealistic tiles scene.
    // MapLibre (the Trips maps) is the largest lazy vendor chunk at ~1.07 MB
    // (~290 kB gzip); the ceiling sits just above it.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        // Rolldown's codeSplitting (formerly advancedChunks) replaces
        // manualChunks. Groups force a split even when a chunk has a
        // single importer (rolldown otherwise merges single-importer
        // chunks back into their parent). Higher priority wins when
        // multiple groups match the same module.
        codeSplitting: {
          groups: [
            // three.core is shared; the WebGL build (photoreal 3D view) and the
            // WebGPU/TSL build + three-blocks (landing hero) never load together.
            { name: 'three-core', test: /[\\/]node_modules[\\/]three[\\/]build[\\/]three\.core/, priority: 102 },
            {
              name: 'three-webgpu',
              test: /[\\/]node_modules[\\/](three[\\/](build[\\/]three\.(webgpu|tsl)|examples[\\/]jsm[\\/]tsl)|three-blocks)[\\/.]/,
              priority: 101,
            },
            { name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/, priority: 100 },
            // 3DTilesRendererJS only loads when the photoreal 3D view opens
            // with a tiles key.
            { name: 'tiles3d', test: /[\\/]node_modules[\\/]3d-tiles-renderer[\\/]/, priority: 95, includeDependenciesRecursively: false },
            // MapLibre draws every Trips map; it loads with the first map, not
            // with the Trips shell. The MLT/style-spec deps ride along.
            { name: 'maplibre', test: /[\\/]node_modules[\\/](maplibre-gl|@maplibre|@mapbox)[\\/]/, priority: 94 },
            { name: 'react-vendor', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 90 },
            // motion/react is shared by many routes; its own group keeps it
            // from being buried in a chunk that static-imports three.js.
            { name: 'motion', test: /[\\/]node_modules[\\/](motion|framer-motion)[\\/]/, priority: 85 },
            { name: 'effect', test: /[\\/]node_modules[\\/](effect|@effect)[\\/]/, priority: 82 },
            { name: 'supabase', test: /[\\/]node_modules[\\/]@supabase[\\/]/, priority: 80 },
            { name: 'router', test: /[\\/]node_modules[\\/]react-router/, priority: 70 },
            { name: 'radix', test: /[\\/]node_modules[\\/]@radix-ui[\\/]/, priority: 60 },
            { name: 'state', test: /[\\/]node_modules[\\/]zustand[\\/]/, priority: 50 },
            { name: 'icons', test: /[\\/]node_modules[\\/]lucide-react[\\/]/, priority: 40 },
            // Shared by the homepage chatbot and the trip concierge.
            { name: 'markdown', test: /[\\/]node_modules[\\/](react-markdown|remark-gfm|remark-parse|remark-rehype|unified)[\\/]/, priority: 38 },
            // The photoreal 3D view ("Fly the day"). `available.ts` is left
            // out: the workspace imports it eagerly, and it must not drag
            // this chunk (and three.js behind it) into the Trips route.
            {
              name: 'photoreal',
              test: /[\\/]pages[\\/]Trips[\\/]photoreal[\\/](?!available)/,
              priority: 30,
              // Only these files: the atlas primitives, meta and geo they
              // import are shared with the workspace and must stay out.
              includeDependenciesRecursively: false,
            },
          ],
        },
      }
    }
  },
  server: {
    proxy: {
      "/api": {
        // A second checkout can run its API on another port: API_PROXY_TARGET=http://localhost:3099
        target: process.env.API_PROXY_TARGET ?? "http://localhost:3000",
        changeOrigin: true
      }
    }
  }
})

import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Three.js is ~600 kB on its own and is the dominant cost of the
    // /korea Map Mode chunk. The chunk is already lazy-loaded (only
    // downloaded when a user opens Map Mode), and we split it into its
    // own chunk so it can be cached independently of our Map Mode glue
    // code. We lift the warning ceiling to 650 kB to silence the noise
    // for that one intentionally-large vendor chunk.
    // The "three" chunk now also carries the GLTF / DRACO / KTX2
    // loaders + OrbitControls used by the Detailed-3D scene. It's
    // still gz<200 KB and is cached aggressively under our service
    // worker contract — lift the noisy warning ceiling.
    chunkSizeWarningLimit: 720,
    rollupOptions: {
      output: {
        // Rolldown's advancedChunks is the modern replacement for
        // manualChunks. Groups force a split even when a chunk has a
        // single importer (rolldown otherwise merges single-importer
        // chunks back into their parent). Higher priority wins when
        // multiple groups match the same module.
        advancedChunks: {
          groups: [
            { name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/, priority: 100 },
            // 3DTilesRendererJS only loads when the Detailed-3D debug
            // toggle is on — keep it in its own chunk so the default
            // Map Mode bundle stays slim.
            { name: 'tiles3d', test: /[\\/]node_modules[\\/]3d-tiles-renderer[\\/]/, priority: 95 },
            { name: 'react-vendor', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 90 },
            // motion/react is used by both Places (text-only) and MapMode
            // (heavy 3D). Without this group, rolldown buries motion inside
            // the korea-map chunk, which static-imports three.js (~685 KB).
            // The Places page would then drag in 800 KB+ of 3D code it
            // never renders. Splitting motion out keeps Places lean.
            { name: 'motion', test: /[\\/]node_modules[\\/](motion|framer-motion)[\\/]/, priority: 85 },
            { name: 'supabase', test: /[\\/]node_modules[\\/]@supabase[\\/]/, priority: 80 },
            { name: 'router', test: /[\\/]node_modules[\\/]react-router/, priority: 70 },
            { name: 'radix', test: /[\\/]node_modules[\\/]@radix-ui[\\/]/, priority: 60 },
            { name: 'state', test: /[\\/]node_modules[\\/]zustand[\\/]/, priority: 50 },
            { name: 'icons', test: /[\\/]node_modules[\\/]lucide-react[\\/]/, priority: 40 },
            { name: 'korea-map', test: /[\\/]pages[\\/]Korea[\\/]MapMode/, priority: 30 },
          ],
        },
      }
    }
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true
      }
    }
  }
})

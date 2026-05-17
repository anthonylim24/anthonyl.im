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
    chunkSizeWarningLimit: 650,
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
            { name: 'react-vendor', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 90 },
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

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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/scheduler/')) {
            return 'react-vendor';
          }
          if (id.includes('@supabase/')) {
            return 'supabase';
          }
          if (id.includes('react-router')) {
            return 'router';
          }
          if (id.includes('@radix-ui/')) {
            return 'radix';
          }
          if (id.includes('zustand')) {
            return 'state';
          }
          if (id.includes('lucide-react')) {
            return 'icons';
          }
          // Three.js is heavy and only used by /korea Map Mode. Splitting it
          // into its own chunk keeps the rest of the app's bundles tight and
          // lets the Map Mode lazy-import pull just the renderer.
          if (id.includes('/node_modules/three/')) {
            return 'three';
          }
          // Korea route's static data + components — keep them together so
          // browsing /korea is one cohesive chunk download instead of many
          // tiny waterfall requests.
          if (id.includes('/pages/Korea/MapMode')) {
            return 'korea-map';
          }
        }
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

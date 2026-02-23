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
          if (id.includes('@clerk/')) {
            return 'clerk';
          }
          if (id.includes('@supabase/')) {
            return 'supabase';
          }
          if (id.includes('/motion/') || id.includes('framer-motion')) {
            return 'motion';
          }
          if (id.includes('react-router')) {
            return 'router';
          }
          if (id.includes('recharts') || id.includes('/d3-') || id.includes('victory-vendor')) {
            return 'recharts';
          }
          if (
            id.includes('react-markdown') || id.includes('remark') ||
            id.includes('rehype') || id.includes('unified') ||
            id.includes('micromark') || id.includes('/mdast') || id.includes('/hast')
          ) {
            return 'markdown';
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
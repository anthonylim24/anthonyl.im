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
        // Manual chunks for better caching and smaller initial bundle
        manualChunks: {
          // Heavy visualization library - separate chunk
          recharts: ['recharts'],
          // Markdown rendering - loaded only for chat
          markdown: ['react-markdown', 'remark-gfm', 'rehype-highlight'],
          // Radix UI components - separate chunk for dialogs/tabs
          radix: [
            '@radix-ui/react-dialog',
            '@radix-ui/react-tabs',
            '@radix-ui/react-progress',
            '@radix-ui/react-slot'
          ],
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
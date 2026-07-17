import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
// HTTPS is required so getUserMedia / getDisplayMedia work when opening via LAN IP
// (http://192.168.x.x is not a secure context — the browser never shows the permission prompt).
export default defineConfig({
  plugins: [react(), basicSsl()],
  build: {
    // Suppress size warning for the unavoidable three.js vendor chunk (~531 kB).
    // App entry stays small via manualChunks + lazy WorldView.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('three')) return 'three'
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('\\react\\')) {
            return 'react'
          }
          return 'vendor'
        },
      },
    },
  },
  server: {
    host: true,
    proxy: {
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:3001',
      },
    },
  },
  preview: {
    host: true,
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:3001',
      },
    },
  },
})

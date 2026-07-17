import os from 'node:os'
import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

function lanHosts(): string[] {
  const hosts = new Set<string>(['localhost', '127.0.0.1', '::1'])
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      const family = String(net.family)
      if (family === 'IPv4' || family === '4') hosts.add(net.address)
      if (family === 'IPv6' || family === '6') hosts.add(net.address)
    }
  }
  return [...hosts]
}

// Default: HTTPS (basicSsl) so getUserMedia works on LAN IPs.
// Funnel: VITE_DEV_HTTPS=0 → plain HTTP for Tailscale Funnel to terminate TLS
// with a publicly trusted cert (https://*.ts.net).
const useDevHttps = process.env.VITE_DEV_HTTPS !== '0'

const plugins: PluginOption[] = [react()]
if (useDevHttps) {
  plugins.push(
    basicSsl({
      name: 'trueid-office',
      domains: lanHosts(),
    }),
  )
}

export default defineConfig({
  plugins,
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
    // Bind IPv4 explicitly — IPv6-only listen can break HTTPS on LAN IPs (TLS EOF).
    host: '0.0.0.0',
    // Allow Tailscale / LAN hostnames when opening via IP or MagicDNS.
    allowedHosts: true,
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
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
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

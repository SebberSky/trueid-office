import os from 'node:os'
import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { APP_BASE_PATH } from './shared/appPath.ts'

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

function stripOfficePrefix(path: string): string {
  if (path === APP_BASE_PATH || path.startsWith(`${APP_BASE_PATH}/`)) {
    const rest = path.slice(APP_BASE_PATH.length)
    return rest.length > 0 ? rest : '/'
  }
  return path
}

/**
 * Funnel `--set-path=/office` forwards `/office/...` as `/...` to Vite.
 * Keep proxies for both stripped and prefixed paths.
 */
function backendProxy() {
  return {
    '/ws': {
      target: 'http://127.0.0.1:3001',
      changeOrigin: true,
      ws: true,
    },
    '/api': {
      target: 'http://127.0.0.1:3001',
      changeOrigin: true,
    },
    [`${APP_BASE_PATH}/ws`]: {
      target: 'http://127.0.0.1:3001',
      changeOrigin: true,
      ws: true,
      rewrite: stripOfficePrefix,
    },
    [`${APP_BASE_PATH}/api`]: {
      target: 'http://127.0.0.1:3001',
      changeOrigin: true,
      rewrite: stripOfficePrefix,
    },
  }
}

// Default: HTTPS (basicSsl) so getUserMedia works on LAN IPs.
// Set VITE_DEV_HTTPS=0 for plain HTTP if needed.
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
  // Relative base: Funnel strips /office so Vite sees `/` — absolute `/office/` 302-loops.
  base: './',
  plugins,
  build: {
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
    allowedHosts: true,
    proxy: backendProxy(),
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: backendProxy(),
  },
})

import os from 'node:os'
import { defineConfig, type Plugin, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { APP_BASE_PATH, APP_BASE_URL } from './shared/appPath.ts'

const APP_BASE = APP_BASE_PATH

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
  if (path === APP_BASE || path.startsWith(`${APP_BASE}/`)) {
    const rest = path.slice(APP_BASE.length)
    return rest.length > 0 ? rest : '/'
  }
  return path
}

function backendProxy() {
  return {
    [`${APP_BASE}/ws`]: {
      target: 'http://127.0.0.1:3001',
      changeOrigin: true,
      ws: true,
      rewrite: stripOfficePrefix,
    },
    [`${APP_BASE}/api`]: {
      target: 'http://127.0.0.1:3001',
      changeOrigin: true,
      rewrite: stripOfficePrefix,
    },
  }
}

/** Prefix absolute root URLs so Funnel /office can load Vite client scripts. */
function mountAbsoluteUrls(): Plugin {
  return {
    name: 'mount-absolute-urls',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html
          .replace(/(href|src)="\/(?!\/|office\/)/g, `$1="${APP_BASE}/`)
          .replace(/(href|src)='\/(?!\/|office\/)/g, `$1='${APP_BASE}/`)
          .replace(/(from )(["'])\/(?!\/|office\/)/g, `$1$2${APP_BASE}/`)
      },
    },
  }
}

const useDevHttps = process.env.VITE_DEV_HTTPS !== '0'

const plugins: PluginOption[] = [react(), mountAbsoluteUrls()]
if (useDevHttps) {
  plugins.push(
    basicSsl({
      name: 'trueid-office',
      domains: lanHosts(),
    }),
  )
}

export default defineConfig({
  base: APP_BASE_URL,
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

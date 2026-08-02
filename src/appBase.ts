import { APP_BASE_PATH } from '../shared/appPath'

/** Funnel mount from the browser path (`/office`), or `/office` in tests. */
export function mountPrefix(): string {
  if (typeof window === 'undefined') return APP_BASE_PATH
  const path = window.location.pathname
  if (path === '/office' || path.startsWith('/office/')) return '/office'
  // Local vite without Funnel path
  return ''
}

/** Public base with trailing slash (`/office/` or `/` on plain localhost). */
export function appBaseUrl(): string {
  const mount = mountPrefix()
  return mount ? `${mount}/` : '/'
}

/** Join path onto the Funnel mount (`api/health` → `/office/api/health`). */
export function appUrl(path: string): string {
  const clean = path.replace(/^\/+/, '')
  const base = appBaseUrl()
  if (!clean) return base
  return `${base}${clean}`
}

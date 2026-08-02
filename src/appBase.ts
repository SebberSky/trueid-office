import { APP_BASE_PATH, APP_BASE_URL } from '../shared/appPath'

/** Always `/office` for Funnel public URLs. */
export function mountPrefix(): string {
  return APP_BASE_PATH
}

export function appBaseUrl(): string {
  return APP_BASE_URL
}

/** Join path onto `/office/` (`api/health` → `/office/api/health`). */
export function appUrl(path: string): string {
  const clean = path.replace(/^\/+/, '')
  if (!clean) return APP_BASE_URL
  return `${APP_BASE_URL}${clean}`
}

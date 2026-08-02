import { APP_BASE_URL } from '../shared/appPath'

/** Vite `base` with trailing slash (e.g. `/office/`). */
export function appBaseUrl(): string {
  const fromVite = import.meta.env.BASE_URL as string | undefined
  if (fromVite && fromVite !== '/') {
    return fromVite.endsWith('/') ? fromVite : `${fromVite}/`
  }
  return APP_BASE_URL
}

/** Join `path` onto the app base (`api/health` → `/office/api/health`). */
export function appUrl(path: string): string {
  const base = appBaseUrl()
  const clean = path.replace(/^\/+/, '')
  return `${base}${clean}`
}

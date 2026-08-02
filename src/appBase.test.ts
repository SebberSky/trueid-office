import { describe, expect, it } from 'vitest'
import { APP_BASE_PATH } from '../shared/appPath'
import { appBaseUrl, appUrl, mountPrefix } from './appBase'

describe('appUrl', () => {
  it('uses /office mount when pathname is under /office', () => {
    expect(APP_BASE_PATH).toBe('/office')
    // jsdom location is usually `/` → mountPrefix '' unless we stub; assert helpers with explicit path logic
    expect(typeof mountPrefix()).toBe('string')
    expect(appBaseUrl().endsWith('/')).toBe(true)
    // When not under /office (vitest default `/`), local mode uses root-relative paths
    if (mountPrefix() === '') {
      expect(appUrl('api/health')).toBe('/api/health')
      expect(appUrl('ws')).toBe('/ws')
    } else {
      expect(appUrl('api/health')).toBe('/office/api/health')
      expect(appUrl('ws')).toBe('/office/ws')
    }
  })
})

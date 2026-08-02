import { describe, expect, it } from 'vitest'
import { APP_BASE_URL } from '../shared/appPath'
import { appBaseUrl, appUrl } from './appBase'

describe('appUrl', () => {
  it('prefixes paths with the /office base', () => {
    expect(APP_BASE_URL).toBe('/office/')
    expect(appBaseUrl()).toBe('/office/')
    expect(appUrl('api/health')).toBe('/office/api/health')
    expect(appUrl('/sounds/x.mp3')).toBe('/office/sounds/x.mp3')
    expect(appUrl('ws')).toBe('/office/ws')
  })
})

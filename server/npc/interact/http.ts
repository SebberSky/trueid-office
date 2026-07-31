/**
 * Low-level outbound request layer shared by every NPC data provider
 * (Google Sheet, generic HTTP JSON, future sources). One place owns
 * timeouts, error wrapping, TTL caching and in-flight dedupe.
 */

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export type ApiRequestConfig = {
  url: string
  /** Any HTTP verb — defaults to GET. */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD'
  headers?: Record<string, string>
  /** Objects are JSON-encoded with a `Content-Type: application/json` default. */
  body?: string | Record<string, unknown>
  timeoutMs?: number
  /**
   * Cache TTL for the parsed response. Defaults to 60s for GET and 0
   * (no cache) for mutating verbs.
   */
  cacheTtlMs?: number
}

export type RequestOptions = {
  fetchImpl?: FetchLike
  now?: () => number
  /** Test override — takes precedence over `config.cacheTtlMs`. */
  ttlMs?: number
  timeoutMs?: number
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

const DEFAULT_TIMEOUT_MS = 5_000
const DEFAULT_GET_TTL_MS = 60_000
const MAX_REDIRECTS = 5

type CacheEntry = { value: unknown; at: number }

// Keys derive from static script configs, so both maps stay small.
const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<unknown>>()

function bodyInit(body: ApiRequestConfig['body']): string | undefined {
  if (body === undefined) return undefined
  return typeof body === 'string' ? body : JSON.stringify(body)
}

function isPrivateIpv4(hostname: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
  if (!m) return false
  const octets = m.slice(1).map(Number)
  if (octets.some((n) => n > 255)) return true
  const [a, b] = octets as [number, number, number, number]
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  return false
}

/**
 * Extract an embedded IPv4 from IPv4-mapped IPv6 (`::ffff:127.0.0.1` or
 * `::ffff:7f00:1`). Returns null when the host is not that form.
 */
export function ipv4FromMappedIpv6(hostname: string): string | null {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host)
  if (dotted) return dotted[1]!
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host)
  if (!hex) return null
  const hi = Number.parseInt(hex[1]!, 16)
  const lo = Number.parseInt(hex[2]!, 16)
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return true
  }
  if (host.includes(':')) {
    // IPv6 literals — block loopback, link-local, unique-local.
    if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true
    if (host.startsWith('fe80:') || /^(fc|fd)[0-9a-f]{0,2}:/i.test(host)) return true
    // IPv4-mapped IPv6 (`::ffff:127.0.0.1`) must use the same private rules.
    const mapped = ipv4FromMappedIpv6(host)
    if (mapped && isPrivateIpv4(mapped)) return true
  }
  return isPrivateIpv4(host)
}

/**
 * Outbound safety for script-configured URLs: HTTPS only, no credentials,
 * and no private/link-local/metadata hosts. Redirects are followed manually
 * so each hop is re-checked (Google Sheet CSV export 307s to googleusercontent).
 */
export function assertSafeOutboundUrl(raw: string): URL {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch (err) {
    throw new ApiRequestError('api url is invalid', undefined, err)
  }
  if (parsed.protocol !== 'https:') {
    throw new ApiRequestError(`api url must use https (got ${parsed.protocol})`)
  }
  if (parsed.username || parsed.password) {
    throw new ApiRequestError('api url must not include credentials')
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw new ApiRequestError(`api host is not allowed (${parsed.hostname || 'empty'})`)
  }
  return parsed
}

function cacheKey(config: ApiRequestConfig): string {
  return [
    config.method ?? 'GET',
    config.url,
    bodyInit(config.body) ?? '',
    JSON.stringify(config.headers ?? {}),
  ].join('\u0000')
}

function effectiveTtl(config: ApiRequestConfig, options: RequestOptions): number {
  if (options.ttlMs !== undefined) return options.ttlMs
  if (config.cacheTtlMs !== undefined) return config.cacheTtlMs
  return (config.method ?? 'GET') === 'GET' ? DEFAULT_GET_TTL_MS : 0
}

/** One raw request — no cache. Throws `ApiRequestError` for any failure. */
export async function requestText(
  config: ApiRequestConfig,
  options: RequestOptions = {},
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init))
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  const body = bodyInit(config.body)
  const headers: Record<string, string> = { ...config.headers }
  if (typeof config.body === 'object' && config.body !== null && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  try {
    let url = assertSafeOutboundUrl(config.url).toString()
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const isFirst = hop === 0
      const res = await fetchImpl(url, {
        // After a redirect, drop method/body/auth so a public host cannot
        // bounce a privileged POST into another origin.
        method: isFirst ? (config.method ?? 'GET') : 'GET',
        headers: isFirst ? headers : {},
        body: isFirst ? body : undefined,
        signal: controller.signal,
        redirect: 'manual',
      })

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location')
        if (!location) {
          throw new ApiRequestError('api redirect missing location', res.status)
        }
        url = assertSafeOutboundUrl(new URL(location, url).toString()).toString()
        continue
      }

      if (!res.ok) {
        throw new ApiRequestError(`api responded ${res.status}`, res.status)
      }
      return await res.text()
    }
    throw new ApiRequestError('api redirect limit exceeded')
  } catch (err) {
    if (err instanceof ApiRequestError) throw err
    throw new ApiRequestError('api request failed', undefined, err)
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Cached request with a parse step. The parsed value is cached so all
 * callers of the same request share one object; concurrent callers share
 * one in-flight fetch. Non-cacheable requests (TTL 0) always hit the network.
 */
export async function requestCached<T>(
  config: ApiRequestConfig,
  parse: (text: string) => T,
  options: RequestOptions = {},
): Promise<T> {
  const ttl = effectiveTtl(config, options)
  if (ttl <= 0) {
    return parse(await requestText(config, options))
  }

  const now = options.now ?? Date.now
  const key = cacheKey(config)

  const cached = cache.get(key)
  if (cached && now() - cached.at < ttl) return cached.value as T

  const pending = inFlight.get(key)
  if (pending) return pending as Promise<T>

  const request = requestText(config, options)
    .then((text) => {
      const value = parse(text)
      cache.set(key, { value, at: now() })
      return value
    })
    .finally(() => {
      inFlight.delete(key)
    })

  inFlight.set(key, request)
  return request
}

/** Test seam — drops cached responses and in-flight requests. */
export function resetApiCache(): void {
  cache.clear()
  inFlight.clear()
}

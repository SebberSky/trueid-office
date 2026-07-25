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

type CacheEntry = { value: unknown; at: number }

// Keys derive from static script configs, so both maps stay small.
const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<unknown>>()

function bodyInit(body: ApiRequestConfig['body']): string | undefined {
  if (body === undefined) return undefined
  return typeof body === 'string' ? body : JSON.stringify(body)
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
    const res = await fetchImpl(config.url, {
      method: config.method ?? 'GET',
      headers,
      body,
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new ApiRequestError(`api responded ${res.status}`, res.status)
    }
    return await res.text()
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

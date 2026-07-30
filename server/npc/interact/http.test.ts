import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiRequestError,
  assertSafeOutboundUrl,
  requestCached,
  requestText,
  resetApiCache,
  type ApiRequestConfig,
} from './http'
import { fetchHttpApiVars, getPath, httpApiVars } from './httpApi'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, text: async () => JSON.stringify(body) } as Response
}

beforeEach(() => {
  resetApiCache()
})

describe('assertSafeOutboundUrl', () => {
  it('allows public https URLs', () => {
    expect(assertSafeOutboundUrl('https://api.example.com/v1').hostname).toBe('api.example.com')
  })

  it('rejects non-https, credentials, and private hosts', () => {
    expect(() => assertSafeOutboundUrl('http://api.example.com')).toThrow(/https/)
    expect(() => assertSafeOutboundUrl('https://user:pass@api.example.com')).toThrow(/credentials/)
    expect(() => assertSafeOutboundUrl('https://localhost/x')).toThrow(/not allowed/)
    expect(() => assertSafeOutboundUrl('https://127.0.0.1/x')).toThrow(/not allowed/)
    expect(() => assertSafeOutboundUrl('https://10.0.0.5/x')).toThrow(/not allowed/)
    expect(() => assertSafeOutboundUrl('https://192.168.1.1/x')).toThrow(/not allowed/)
    expect(() => assertSafeOutboundUrl('https://169.254.169.254/latest')).toThrow(/not allowed/)
    expect(() => assertSafeOutboundUrl('https://[::1]/')).toThrow(/not allowed/)
  })

  it('blocks private hosts before fetch runs', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: 1 }))
    await expect(
      requestText({ url: 'https://127.0.0.1/secret' }, { fetchImpl }),
    ).rejects.toThrow(/not allowed/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('passes redirect: manual to the fetch implementation', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: 1 }))
    await requestText({ url: 'https://api.test/data' }, { fetchImpl })
    expect(fetchImpl.mock.calls[0]![1].redirect).toBe('manual')
  })

  it('follows a safe HTTPS redirect and re-validates the next host', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: false,
        status: 307,
        headers: { get: (name: string) => (name === 'location' ? 'https://cdn.test/file.csv' : null) },
        text: async () => '',
      } as Response)
      .mockResolvedValueOnce(jsonResponse({ ok: 1 }))

    const text = await requestText({ url: 'https://api.test/export' }, { fetchImpl })
    expect(JSON.parse(text)).toEqual({ ok: 1 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl.mock.calls[1]![0]).toBe('https://cdn.test/file.csv')
    expect(fetchImpl.mock.calls[1]![1].method).toBe('GET')
  })

  it('rejects a redirect into a private host', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 302,
      headers: { get: (name: string) => (name === 'location' ? 'https://127.0.0.1/secret' : null) },
      text: async () => '',
    }) as Response)

    await expect(requestText({ url: 'https://api.test/export' }, { fetchImpl })).rejects.toThrow(
      /not allowed/,
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('resolves relative Location against the previous URL', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: false,
        status: 302,
        headers: { get: (name: string) => (name === 'location' ? '/next.csv' : null) },
        text: async () => '',
      } as Response)
      .mockResolvedValueOnce(jsonResponse({ ok: 1 }))

    await requestText({ url: 'https://api.test/export' }, { fetchImpl })
    expect(fetchImpl.mock.calls[1]![0]).toBe('https://api.test/next.csv')
  })

  it('rejects redirects with no Location and caps hop count', async () => {
    const missing = vi.fn(async () => ({
      ok: false,
      status: 302,
      headers: { get: () => null },
      text: async () => '',
    }) as Response)
    await expect(requestText({ url: 'https://api.test/a' }, { fetchImpl: missing })).rejects.toThrow(
      /missing location/,
    )

    const looping = vi.fn(async () => ({
      ok: false,
      status: 307,
      headers: { get: (name: string) => (name === 'location' ? 'https://api.test/loop' : null) },
      text: async () => '',
    }) as Response)
    await expect(requestText({ url: 'https://api.test/start' }, { fetchImpl: looping })).rejects.toThrow(
      /redirect limit/,
    )
    expect(looping.mock.calls.length).toBe(6)
  })
})

describe('requestText', () => {
  it('defaults to GET with no body', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: 1 }))
    await requestText({ url: 'https://api.test/data' }, { fetchImpl })

    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://api.test/data')
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
  })

  it('sends any method, JSON-encodes object bodies and sets Content-Type', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: 1 }))
    await requestText(
      {
        url: 'https://api.test/report',
        method: 'POST',
        body: { range: 'monthly' },
        headers: { Authorization: 'Bearer x' },
      },
      { fetchImpl },
    )

    const [, init] = fetchImpl.mock.calls[0]!
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"range":"monthly"}')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer x',
      'Content-Type': 'application/json',
    })
  })

  it('keeps a caller-provided Content-Type and string body verbatim', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: 1 }))
    await requestText(
      {
        url: 'https://api.test/form',
        method: 'PUT',
        body: 'a=1&b=2',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
      { fetchImpl },
    )

    const [, init] = fetchImpl.mock.calls[0]!
    expect(init.body).toBe('a=1&b=2')
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/x-www-form-urlencoded',
    })
  })

  it('throws a typed error with the HTTP status', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 503))
    const err = await requestText({ url: 'https://api.test' }, { fetchImpl }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiRequestError)
    expect(err.status).toBe(503)
  })

  it('wraps aborts and transport failures', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    })
    await expect(
      requestText({ url: 'https://api.test' }, { fetchImpl, timeoutMs: 5 }),
    ).rejects.toThrow('api request failed')
  })
})

describe('requestCached', () => {
  const config: ApiRequestConfig = { url: 'https://api.test/data' }

  it('caches GET by default and shares parsed values', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ n: 1 }))
    const parse = (text: string) => JSON.parse(text) as { n: number }

    const a = await requestCached(config, parse, { fetchImpl })
    const b = await requestCached(config, parse, { fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })

  it('does not cache mutating verbs unless cacheTtlMs is set', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ n: 1 }))
    const post: ApiRequestConfig = { url: 'https://api.test', method: 'POST' }

    await requestCached(post, JSON.parse, { fetchImpl })
    await requestCached(post, JSON.parse, { fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(2)

    const cachedPost: ApiRequestConfig = { ...post, cacheTtlMs: 60_000 }
    await requestCached(cachedPost, JSON.parse, { fetchImpl })
    await requestCached(cachedPost, JSON.parse, { fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('keys the cache by method, url, body and headers', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ n: 1 }))
    const ttl = { ttlMs: 60_000 }
    await requestCached({ url: 'https://api.test' }, JSON.parse, { fetchImpl, ...ttl })
    await requestCached(
      { url: 'https://api.test', method: 'POST', body: { a: 1 } },
      JSON.parse,
      { fetchImpl, ...ttl },
    )
    await requestCached(
      { url: 'https://api.test', method: 'POST', body: { a: 2 } },
      JSON.parse,
      { fetchImpl, ...ttl },
    )
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('expires entries after the TTL', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ n: 1 }))
    let now = 1_000
    const options = { fetchImpl, now: () => now, ttlMs: 60_000 }

    await requestCached(config, JSON.parse, options)
    now += 60_001
    await requestCached(config, JSON.parse, options)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('getPath', () => {
  const json = { report: { months: [{ name: 'Jan', mrr: 2310000 }], total: 6 } }

  it('walks objects and array indices', () => {
    expect(getPath(json, 'report.total')).toBe(6)
    expect(getPath(json, 'report.months.0.name')).toBe('Jan')
  })

  it('returns undefined for missing paths', () => {
    expect(getPath(json, 'report.missing.deep')).toBeUndefined()
    expect(getPath(json, 'report.months.5.name')).toBeUndefined()
    expect(getPath(json, 'report.total.beyond')).toBeUndefined()
  })
})

describe('httpApiVars', () => {
  const json = {
    company: 'TrueID',
    report: {
      months: [
        { name: 'Jan', active: 210000 },
        { name: 'Feb', active: 224600 },
      ],
    },
  }

  it('maps dot-path fields to placeholders', () => {
    const vars = httpApiVars(json, {
      url: 'https://api.test',
      fields: { company: 'company', latest: 'report.months.1.active', missing: 'nope' },
    })
    expect(vars.company).toBe('TrueID')
    expect(vars.latest).toBe('224600')
    expect(vars.missing).toBe('')
  })

  it('renders {rows} from an array path with per-item templates', () => {
    const vars = httpApiVars(json, {
      url: 'https://api.test',
      rowsPath: 'report.months',
      rowsTemplate: '{index}. {name}: {active}',
    })
    expect(vars.rows).toBe('1. Jan: 210000\n2. Feb: 224600')
    expect(vars.rowCount).toBe('2')
  })

  it('exposes primitive items as {value} and tolerates non-arrays', () => {
    const list = httpApiVars(['a', 'b'], {
      url: 'https://api.test',
      rowsTemplate: '{index}) {value}',
    })
    expect(list.rows).toBe('1) a\n2) b')

    const notArray = httpApiVars(json, {
      url: 'https://api.test',
      rowsPath: 'company',
      rowsTemplate: '{value}',
    })
    expect(notArray.rows).toBe('')
    expect(notArray.rowCount).toBe('0')
  })
})

describe('fetchHttpApiVars', () => {
  it('fetches with the configured method and maps the response', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: { active: 302300, month: 'Jun' } }),
    )
    const vars = await fetchHttpApiVars(
      {
        url: 'https://api.test/subscribers',
        method: 'POST',
        body: { period: 'latest' },
        fields: { month: 'data.month', active: 'data.active' },
      },
      { fetchImpl },
    )
    expect(vars.month).toBe('Jun')
    expect(vars.active).toBe('302300')
    expect(fetchImpl.mock.calls[0]![1].method).toBe('POST')
  })

  it('propagates a typed error on invalid JSON', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => 'not json',
    }) as Response)
    await expect(
      fetchHttpApiVars({ url: 'https://api.test' }, { fetchImpl }),
    ).rejects.toThrow()
  })
})

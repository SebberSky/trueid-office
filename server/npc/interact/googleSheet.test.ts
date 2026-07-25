import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  csvExportUrl,
  fetchSheetVars,
  loadSheetTable,
  parseCsv,
  resetSheetCache,
  sheetVars,
  toTable,
  type GoogleSheetSourceConfig,
} from './googleSheet'

const CSV = [
  'Month,New Subscribers,Net Growth,MRR (USD)',
  'Jan,"18,500","13,300","2,310,000"',
  'Feb,"20,200","14,600","2,470,600"',
  'Mar,"23,400","17,300","2,660,900"',
].join('\n')

const config: GoogleSheetSourceConfig = {
  sheetId: 'sheet-1',
  fields: { month: 'Month', growth: 'Net Growth', mrr: 'MRR (USD)' },
}

function csvResponse(body = CSV, ok = true, status = 200): Response {
  return { ok, status, text: async () => body } as Response
}

beforeEach(() => {
  resetSheetCache()
})

describe('parseCsv', () => {
  it('keeps commas inside quoted fields', () => {
    const rows = parseCsv(CSV)
    expect(rows[0]).toEqual(['Month', 'New Subscribers', 'Net Growth', 'MRR (USD)'])
    expect(rows[1]).toEqual(['Jan', '18,500', '13,300', '2,310,000'])
  })

  it('handles escaped quotes, CRLF and blank lines', () => {
    const rows = parseCsv('a,b\r\n"say ""hi""",2\r\n\r\n')
    expect(rows).toEqual([
      ['a', 'b'],
      ['say "hi"', '2'],
    ])
  })
})

describe('toTable', () => {
  it('keys data rows by trimmed header', () => {
    const table = toTable(parseCsv(CSV))
    expect(table.headers).toContain('MRR (USD)')
    expect(table.rows).toHaveLength(3)
    expect(table.rows[0]!['Month']).toBe('Jan')
  })

  it('returns empty for empty input', () => {
    expect(toTable([])).toEqual({ headers: [], rows: [] })
  })
})

describe('sheetVars', () => {
  const table = toTable(parseCsv(CSV))

  it('defaults to the last row and maps field aliases', () => {
    const vars = sheetVars(table, config)
    expect(vars.month).toBe('Mar')
    expect(vars.mrr).toBe('2,660,900')
    expect(vars['Net Growth']).toBe('17,300')
    expect(vars.rowCount).toBe('3')
  })

  it('selects first row and numeric index', () => {
    expect(sheetVars(table, { ...config, row: 'first' }).month).toBe('Jan')
    expect(sheetVars(table, { ...config, row: 1 }).month).toBe('Feb')
    expect(sheetVars(table, { ...config, row: 99 }).month).toBe('')
  })

  it('renders {rows} from aliases using the per-row template', () => {
    const vars = sheetVars(table, { ...config, rowsTemplate: '{month}: {growth}' })
    expect(vars.rows).toBe('Jan: 13,300\nFeb: 14,600\nMar: 17,300')
  })

  it('omits {rows} when no template is configured', () => {
    expect(sheetVars(table, config).rows).toBeUndefined()
  })
})

describe('csvExportUrl', () => {
  it('targets the CSV export endpoint and passes gid', () => {
    expect(csvExportUrl(config)).toBe(
      'https://docs.google.com/spreadsheets/d/sheet-1/export?format=csv',
    )
    expect(csvExportUrl({ ...config, gid: '42' })).toContain('&gid=42')
  })
})

describe('loadSheetTable caching', () => {
  it('serves cached tables within the TTL and refetches after it', async () => {
    const fetchImpl = vi.fn(async () => csvResponse())
    let now = 1_000
    const options = { fetchImpl, now: () => now, ttlMs: 60_000 }

    await loadSheetTable(config, options)
    await loadSheetTable(config, options)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    now += 60_001
    await loadSheetTable(config, options)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('shares one request between concurrent callers', async () => {
    const fetchImpl = vi.fn(async () => csvResponse())
    const [a, b] = await Promise.all([
      loadSheetTable(config, { fetchImpl }),
      loadSheetTable(config, { fetchImpl }),
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })

  it('caches per sheet and gid', async () => {
    const fetchImpl = vi.fn(async () => csvResponse())
    await loadSheetTable(config, { fetchImpl })
    await loadSheetTable({ ...config, gid: '7' }, { fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('does not cache failures and surfaces a typed error', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csvResponse('', false, 500))
      .mockResolvedValueOnce(csvResponse())

    await expect(loadSheetTable(config, { fetchImpl })).rejects.toThrow('api responded 500')
    const table = await loadSheetTable(config, { fetchImpl })
    expect(table.rows).toHaveLength(3)
  })

  it('wraps transport failures', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('socket hang up')
    })
    await expect(loadSheetTable(config, { fetchImpl })).rejects.toThrow('api request failed')
  })
})

describe('fetchSheetVars', () => {
  it('returns template-ready vars', async () => {
    const fetchImpl = vi.fn(async () => csvResponse())
    const vars = await fetchSheetVars(config, { fetchImpl })
    expect(vars.month).toBe('Mar')
    expect(vars.growth).toBe('17,300')
  })
})

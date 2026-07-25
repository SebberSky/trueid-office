import { applyTemplate } from './dialogue'
import { requestCached, resetApiCache, type RequestOptions } from './http'

/** Per-node config for `source: { type: 'api', provider: 'google-sheet' }`. */
export type GoogleSheetSourceConfig = {
  sheetId: string
  /** Worksheet gid — omit for the first sheet. */
  gid?: string
  /** Which data row feeds the single-row placeholders. Defaults to `'last'`. */
  row?: 'last' | 'first' | number
  /** Placeholder name → column header, e.g. `{ mrr: 'MRR (USD)' }`. */
  fields?: Record<string, string>
  /** Per-row line for the `{rows}` block, e.g. `'{month}: {active}'`. */
  rowsTemplate?: string
  /**
   * Reserved for private sheets — read from env, never inlined in a script.
   * Not implemented yet; public CSV export only.
   */
  apiKeyEnv?: string
}

export type SheetTable = {
  headers: string[]
  rows: Record<string, string>[]
}

/** Parse CSV with quoted fields (embedded commas, newlines and `""` escapes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (quoted) {
      if (char !== '"') {
        field += char
        continue
      }
      if (text[i + 1] === '"') {
        field += '"'
        i++
        continue
      }
      quoted = false
      continue
    }
    if (char === '"') {
      quoted = true
      continue
    }
    if (char === ',') {
      row.push(field)
      field = ''
      continue
    }
    if (char === '\n' || char === '\r') {
      // Treat CRLF as one break; skip the paired LF.
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      rows.push(row)
      row = []
      continue
    }
    field += char
  }

  row.push(field)
  rows.push(row)

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

/** Header row + trimmed data rows keyed by header. */
export function toTable(cells: string[][]): SheetTable {
  const [headerRow, ...dataRows] = cells
  if (!headerRow) return { headers: [], rows: [] }
  const headers = headerRow.map((h) => h.trim())
  const rows = dataRows.map((cells) => {
    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? '').trim()
    })
    return row
  })
  return { headers, rows }
}

export function csvExportUrl(config: GoogleSheetSourceConfig): string {
  const gid = config.gid ? `&gid=${encodeURIComponent(config.gid)}` : ''
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
    config.sheetId,
  )}/export?format=csv${gid}`
}

function pickRow(table: SheetTable, which: GoogleSheetSourceConfig['row']): Record<string, string> {
  if (table.rows.length === 0) return {}
  if (typeof which === 'number') return table.rows[which] ?? {}
  if (which === 'first') return table.rows[0]!
  return table.rows[table.rows.length - 1]!
}

/**
 * Row vars keyed by both the raw column header and the script's field aliases,
 * so templates can use `{Month}` or a mapped `{month}`.
 */
function rowVars(
  row: Record<string, string>,
  fields: GoogleSheetSourceConfig['fields'],
): Record<string, string> {
  const vars: Record<string, string> = { ...row }
  for (const [placeholder, header] of Object.entries(fields ?? {})) {
    vars[placeholder] = row[header] ?? ''
  }
  return vars
}

/**
 * Flat template vars for a node: the selected row's fields plus
 * `{rows}` (when `rowsTemplate` is set) and `{rowCount}`.
 */
export function sheetVars(
  table: SheetTable,
  config: GoogleSheetSourceConfig,
): Record<string, string> {
  const vars = rowVars(pickRow(table, config.row), config.fields)

  if (config.rowsTemplate) {
    vars.rows = table.rows
      .map((row) => applyTemplate(config.rowsTemplate!, rowVars(row, config.fields)))
      .join('\n')
  }
  vars.rowCount = String(table.rows.length)

  return vars
}

/** Cached sheet read via the shared request layer (TTL + in-flight dedupe). */
export async function loadSheetTable(
  config: GoogleSheetSourceConfig,
  options: RequestOptions = {},
): Promise<SheetTable> {
  return requestCached(
    { url: csvExportUrl(config) },
    (text) => toTable(parseCsv(text)),
    options,
  )
}

/** Sheet-backed template vars for a dialogue node. */
export async function fetchSheetVars(
  config: GoogleSheetSourceConfig,
  options: RequestOptions = {},
): Promise<Record<string, string>> {
  return sheetVars(await loadSheetTable(config, options), config)
}

/** Test seam — kept for existing tests; clears the shared request cache. */
export const resetSheetCache = resetApiCache

import { applyTemplate } from './dialogue'
import {
  requestCached,
  type ApiRequestConfig,
  type RequestOptions,
} from './http'

/**
 * Per-node config for `source: { type: 'api', provider: 'http' }`.
 * Points at any JSON endpoint with any HTTP method; dot-paths map
 * response fields into `{placeholder}` template vars.
 */
export type HttpApiSourceConfig = ApiRequestConfig & {
  /** Placeholder name → dot path into the JSON, e.g. `{ city: 'address.city' }`. */
  fields?: Record<string, string>
  /** Dot path to an array rendered into `{rows}` (one line per item). */
  rowsPath?: string
  /** Per-item line for `{rows}`; primitives are exposed as `{value}`. */
  rowsTemplate?: string
}

/** Walk a dot path (`a.b.0.c`) through objects and arrays. */
export function getPath(value: unknown, path: string): unknown {
  let current = value
  for (const segment of path.split('.')) {
    if (current === null || current === undefined) return undefined
    if (Array.isArray(current)) {
      current = current[Number(segment)]
      continue
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment]
      continue
    }
    return undefined
  }
  return current
}

/** Dialogue-safe string: primitives verbatim, missing → '', structures as JSON. */
function asText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** Template vars for one array item: object props flat, primitives as {value}. */
function itemVars(item: unknown, index: number): Record<string, string> {
  const vars: Record<string, string> = { value: asText(item), index: String(index + 1) }
  if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
    for (const [key, value] of Object.entries(item)) {
      vars[key] = asText(value)
    }
  }
  return vars
}

/** Flat template vars from a parsed JSON response, per the node config. */
export function httpApiVars(
  json: unknown,
  config: HttpApiSourceConfig,
): Record<string, string> {
  const vars: Record<string, string> = {}

  for (const [placeholder, path] of Object.entries(config.fields ?? {})) {
    vars[placeholder] = asText(getPath(json, path))
  }

  if (config.rowsPath !== undefined || config.rowsTemplate !== undefined) {
    const items = config.rowsPath === undefined ? json : getPath(json, config.rowsPath)
    const list = Array.isArray(items) ? items : []
    vars.rows = config.rowsTemplate
      ? list.map((item, i) => applyTemplate(config.rowsTemplate!, itemVars(item, i))).join('\n')
      : list.map(asText).join('\n')
    vars.rowCount = String(list.length)
  }

  return vars
}

/** JSON-backed template vars for a dialogue node (any URL, any method). */
export async function fetchHttpApiVars(
  config: HttpApiSourceConfig,
  options: RequestOptions = {},
): Promise<Record<string, string>> {
  const json = await requestCached(config, (text) => JSON.parse(text) as unknown, options)
  return httpApiVars(json, config)
}

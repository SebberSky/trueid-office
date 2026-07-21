import type { ReactNode } from 'react'
import { normalizeChatUrl } from './types'

const URL_FIND = /https?:\/\/[^\s]+/gi

/** Split plain text into text + clickable http(s) links. */
export function linkifyText(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  const re = new RegExp(URL_FIND.source, 'gi')
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const raw = match[0]
    const href = normalizeChatUrl(raw)
    const used = href ? raw.replace(/[),.!?;:'"]+$/g, '') : raw
    if (match.index > last) nodes.push(text.slice(last, match.index))
    if (href) {
      nodes.push(
        <a
          key={`u-${match.index}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="chat__link"
          onClick={(e) => e.stopPropagation()}
        >
          {used}
        </a>,
      )
      last = match.index + used.length
      // Keep trailing punctuation as plain text when we stripped it from the link.
      if (used.length < raw.length) {
        nodes.push(raw.slice(used.length))
        last = match.index + raw.length
      }
    } else {
      nodes.push(raw)
      last = match.index + raw.length
    }
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes.length > 0 ? nodes : [text]
}

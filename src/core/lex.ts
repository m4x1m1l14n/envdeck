import type { Diagnostic, EnvFile } from './types'

/**
 * A logical line of a dotenv file. Multi-line quoted values collapse into a
 * single `assign` line spanning `line..endLine`.
 */
export type LexLine =
  | { kind: 'blank'; line: number }
  | { kind: 'comment'; text: string; line: number }
  | {
      kind: 'assign'
      key: string
      value: string
      /** Text after a trailing `#` on the same line, if any. */
      comment?: string
      line: number
      endLine: number
    }

export interface LexResult {
  lines: LexLine[]
  diagnostics: Diagnostic[]
}

const KEY_RE = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*/

const ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' }

/** Split dotenv text into blank, comment and assignment lines. */
export function lex(text: string): LexResult {
  const raw = text.replace(/^﻿/, '').split(/\r?\n/)
  // A trailing newline produces one empty element we do not want to report as a line.
  if (raw.length > 0 && raw[raw.length - 1] === '') raw.pop()

  const lines: LexLine[] = []
  const diagnostics: Diagnostic[] = []

  for (let i = 0; i < raw.length; i++) {
    const lineNo = i + 1
    const source = raw[i] ?? ''
    const trimmed = source.trim()

    if (trimmed === '') {
      lines.push({ kind: 'blank', line: lineNo })
      continue
    }

    if (trimmed.startsWith('#')) {
      lines.push({ kind: 'comment', text: trimmed.slice(1).replace(/^ /, ''), line: lineNo })
      continue
    }

    const m = KEY_RE.exec(trimmed)
    if (!m) {
      diagnostics.push({
        severity: 'error',
        line: lineNo,
        message: `Cannot parse line: expected KEY=value, got "${truncate(trimmed)}"`,
      })
      continue
    }

    const key = m[1] as string
    let rest = trimmed.slice(m[0].length)
    const quote = rest[0]

    if (quote === '"' || quote === "'" || quote === '`') {
      // Quoted value, possibly spanning multiple physical lines.
      let value = ''
      let j = 1
      let closed = false
      let endIndex = i
      for (;;) {
        while (j < rest.length) {
          const ch = rest[j] as string
          if (quote === '"' && ch === '\\' && j + 1 < rest.length) {
            const next = rest[j + 1] as string
            value += ESCAPES[next] ?? `\\${next}`
            j += 2
            continue
          }
          if (ch === quote) {
            closed = true
            break
          }
          value += ch
          j++
        }
        if (closed || endIndex + 1 >= raw.length) break
        endIndex++
        value += '\n'
        rest = raw[endIndex] ?? ''
        j = 0
      }

      if (!closed) {
        diagnostics.push({
          severity: 'error',
          line: lineNo,
          key,
          message: `Unterminated ${quote} quoted value for ${key}`,
        })
        lines.push({ kind: 'assign', key, value, line: lineNo, endLine: endIndex + 1 })
        i = endIndex
        continue
      }

      const after = rest.slice(j + 1).trim()
      let comment: string | undefined
      if (after.startsWith('#')) {
        comment = after.slice(1).trim()
      } else if (after !== '') {
        diagnostics.push({
          severity: 'warning',
          line: endIndex + 1,
          key,
          message: `Ignoring unexpected text after quoted value of ${key}: "${truncate(after)}"`,
        })
      }
      lines.push({ kind: 'assign', key, value, comment, line: lineNo, endLine: endIndex + 1 })
      i = endIndex
      continue
    }

    // Unquoted: a `#` preceded by whitespace starts an inline comment.
    const hash = rest.search(/\s#/)
    let comment: string | undefined
    if (hash >= 0) {
      comment = rest.slice(hash).trim().slice(1).trim()
      rest = rest.slice(0, hash)
    } else if (rest.startsWith('#')) {
      comment = rest.slice(1).trim()
      rest = ''
    }
    lines.push({ kind: 'assign', key, value: rest.trim(), comment, line: lineNo, endLine: lineNo })
  }

  return { lines, diagnostics }
}

/** Parse a plain `.env` file into ordered entries (duplicates are kept). */
export function parseEnv(text: string): EnvFile {
  const { lines, diagnostics } = lex(text)
  const entries = lines.flatMap((l) =>
    l.kind === 'assign' ? [{ key: l.key, value: l.value, line: l.line }] : [],
  )
  const seen = new Map<string, number>()
  for (const e of entries) {
    const first = seen.get(e.key)
    if (first !== undefined) {
      diagnostics.push({
        severity: 'warning',
        line: e.line,
        key: e.key,
        message: `Duplicate key ${e.key} (first defined on line ${first}); the last value wins`,
      })
    } else {
      seen.set(e.key, e.line)
    }
  }
  return { entries, diagnostics }
}

/** Collapse entries into a key → value map (last occurrence wins, like dotenv loaders). */
export function envToMap(file: EnvFile): Map<string, string> {
  const map = new Map<string, string>()
  for (const e of file.entries) map.set(e.key, e.value)
  return map
}

/** Quote a value only when needed so it round-trips through `lex`. */
export function formatValue(value: string): string {
  if (value === '') return ''
  const needsQuotes = /[\s#"'`\\]/.test(value) || value !== value.trim()
  if (!needsQuotes) return value
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
  return `"${escaped}"`
}

function truncate(s: string, n = 40): string {
  return s.length > n ? `${s.slice(0, n)}…` : s
}

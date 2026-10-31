/**
 * Tokenizer for decorator comment lines such as
 *
 *   # @required @sensitive @type=string(minLength=32, pattern="^[a-f0-9]+$")
 *
 * Supports `@flag`, `@name=value`, `@name="quoted value"` and `@name(args)`.
 */

export interface Decorator {
  name: string
  /** Raw value (quotes removed for quoted values), or null for bare flags. */
  value: string | null
}

export interface DecoratorLineResult {
  decorators: Decorator[]
  errors: string[]
}

export interface CallExpr {
  name: string
  positional: string[]
  named: Record<string, string>
}

const NAME_RE = /[A-Za-z_][A-Za-z0-9_]*/y

export function isDecoratorLine(text: string): boolean {
  return /^@[A-Za-z_]/.test(text.trim())
}

export function parseDecoratorLine(text: string): DecoratorLineResult {
  const decorators: Decorator[] = []
  const errors: string[] = []
  const s = text
  let i = 0

  while (i < s.length) {
    const ch = s[i] as string
    if (/\s/.test(ch)) {
      i++
      continue
    }
    // Trailing comment after decorators.
    if (ch === '#') break
    if (ch !== '@') {
      const end = s.slice(i).search(/\s/)
      const junk = end < 0 ? s.slice(i) : s.slice(i, i + end)
      errors.push(`Unexpected text "${junk}" in decorator line`)
      i = end < 0 ? s.length : i + end
      continue
    }
    i++
    NAME_RE.lastIndex = i
    const nm = NAME_RE.exec(s)
    if (!nm) {
      errors.push('Expected decorator name after "@"')
      continue
    }
    const name = nm[0]
    i += name.length

    if (s[i] === '=') {
      const r = readValue(s, i + 1)
      if (r.error) errors.push(`@${name}: ${r.error}`)
      decorators.push({ name, value: r.value })
      i = r.end
    } else if (s[i] === '(') {
      const r = readBalanced(s, i)
      if (r.error) errors.push(`@${name}: ${r.error}`)
      decorators.push({ name, value: r.inner })
      i = r.end
    } else {
      decorators.push({ name, value: null })
    }
  }

  return { decorators, errors }
}

function readValue(s: string, start: number): { value: string; end: number; error?: string } {
  const q = s[start]
  if (q === '"' || q === "'") {
    let out = ''
    let i = start + 1
    while (i < s.length) {
      const ch = s[i] as string
      // Only an escaped quote is unescaped; other backslashes stay literal so regexes read naturally.
      if (ch === '\\' && s[i + 1] === q) {
        out += q
        i += 2
        continue
      }
      if (ch === q) return { value: out, end: i + 1 }
      out += ch
      i++
    }
    return { value: out, end: s.length, error: 'unterminated quoted value' }
  }

  let i = start
  let depth = 0
  let quote: string | null = null
  while (i < s.length) {
    const ch = s[i] as string
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === '(') {
      depth++
    } else if (ch === ')') {
      depth--
    } else if (depth === 0 && /\s/.test(ch)) {
      break
    }
    i++
  }
  const error = depth !== 0 || quote ? 'unbalanced parentheses or quotes' : undefined
  return { value: s.slice(start, i), end: i, error }
}

function readBalanced(s: string, open: number): { inner: string; end: number; error?: string } {
  let depth = 0
  let quote: string | null = null
  for (let i = open; i < s.length; i++) {
    const ch = s[i] as string
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return { inner: s.slice(open + 1, i), end: i + 1 }
    }
  }
  return { inner: s.slice(open + 1), end: s.length, error: 'unbalanced parentheses' }
}

/** Split a comma separated argument list, respecting quotes and nested parentheses. */
export function splitArgs(inner: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote: string | null = null
  let cur = ''
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i] as string
    if (quote) {
      cur += ch
      if (ch === '\\' && i + 1 < inner.length) {
        cur += inner[++i]
      } else if (ch === quote) {
        quote = null
      }
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim() !== '') out.push(cur.trim())
  return out
}

export function unquote(s: string): string {
  const t = s.trim()
  const q = t[0]
  if ((q === '"' || q === "'") && t.length >= 2 && t[t.length - 1] === q) {
    return t.slice(1, -1).split(`\\${q}`).join(q)
  }
  return t
}

/** Parse `name` or `name(a, b, key=value)` into a call expression. */
export function parseCallExpr(expr: string): CallExpr | null {
  const t = expr.trim()
  const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([\s\S]*)\))?$/.exec(t)
  if (!m) return null
  const positional: string[] = []
  const named: Record<string, string> = {}
  if (m[2] !== undefined) {
    for (const arg of splitArgs(m[2])) {
      const kv = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]*)$/.exec(arg)
      if (kv && !/^["']/.test(arg)) named[kv[1] as string] = unquote(kv[2] as string)
      else positional.push(unquote(arg))
    }
  }
  return { name: m[1] as string, positional, named }
}

/** Quote a decorator/argument value when it would otherwise be ambiguous. */
export function quoteArg(value: string): string {
  if (/^[A-Za-z0-9_.:/+@%?&~-]+$/.test(value)) return value
  return `"${value.replace(/"/g, '\\"')}"`
}

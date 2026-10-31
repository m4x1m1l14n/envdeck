import type { ReactNode } from 'react'

interface CodeViewProps {
  text: string
  /** Keys whose values are replaced with dots. */
  maskKeys?: Set<string>
  className?: string
  label: string
  /** Wrap long lines instead of scrolling horizontally. */
  wrap?: boolean
}

/** Read-only dotenv viewer with line numbers and EnvDeck-aware highlighting. */
export function CodeView({ text, maskKeys, className, label, wrap }: CodeViewProps) {
  const lines = text.replace(/\n$/, '').split('\n')
  return (
    <pre
      aria-label={label}
      className={`overflow-auto font-mono text-[12px] leading-[1.7] ${className ?? ''}`}
      tabIndex={0}
    >
      <code className="grid grid-cols-[auto_1fr]">
        {lines.map((line, i) => (
          <Row key={i} n={i + 1} line={line} maskKeys={maskKeys} wrap={wrap} />
        ))}
      </code>
    </pre>
  )
}

function Row({ n, line, maskKeys, wrap }: { n: number; line: string; maskKeys?: Set<string>; wrap?: boolean }) {
  return (
    <>
      <span className="select-none border-r border-line pr-3 pl-2 text-right text-faint">{n}</span>
      <span className={`pr-4 pl-3 ${wrap ? 'break-all whitespace-pre-wrap' : 'whitespace-pre'}`}>{highlight(line, maskKeys)}</span>
    </>
  )
}

function highlight(line: string, maskKeys?: Set<string>): ReactNode {
  const trimmed = line.trimStart()
  if (trimmed === '') return ' '
  if (trimmed.startsWith('#')) {
    const body = trimmed.slice(1)
    if (/@group\b/.test(body)) {
      return <span className="font-semibold text-accent-2 text-glow">{line}</span>
    }
    if (/^[\s━─=\-]{3,}$/.test(body)) return <span className="text-accent-2/60">{line}</span>
    if (/^\s*@/.test(body)) {
      return (
        <span className="text-faint">
          #
          {body.split(/(@[A-Za-z_]+)(=(?:"[^"]*"|[^\s(]+(?:\((?:"[^"]*"|[^)])*\))?))?/g).map((part, i) => {
            if (part === undefined || part === '') return null
            if (part.startsWith('@')) return <span key={i} className="text-accent-2">{part}</span>
            if (part.startsWith('=')) return <span key={i} className="text-warn">{part}</span>
            return <span key={i}>{part}</span>
          })}
        </span>
      )
    }
    return <span className="text-muted italic">{line}</span>
  }
  const m = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/.exec(line)
  if (!m) return <span className="text-bad">{line}</span>
  const [, pre, key, eq, value] = m as unknown as [string, string, string, string, string]
  const masked = maskKeys?.has(key) && value !== ''
  return (
    <>
      {pre}
      <span className="text-accent">{key}</span>
      <span className="text-faint">{eq}</span>
      {masked ? <span className="text-faint">••••••••</span> : <span className="text-fg">{value}</span>}
    </>
  )
}

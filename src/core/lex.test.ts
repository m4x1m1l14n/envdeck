import { describe, expect, it } from 'vitest'
import { envToMap, formatValue, lex, parseEnv } from './lex'

describe('lex', () => {
  it('classifies blank, comment and assignment lines', () => {
    const { lines, diagnostics } = lex('# hello\n\nFOO=bar\n')
    expect(diagnostics).toEqual([])
    expect(lines).toEqual([
      { kind: 'comment', text: 'hello', line: 1 },
      { kind: 'blank', line: 2 },
      { kind: 'assign', key: 'FOO', value: 'bar', comment: undefined, line: 3, endLine: 3 },
    ])
  })

  it('handles export prefix, spaces around = and CRLF', () => {
    const { lines } = lex('export FOO = bar\r\nBAZ=qux\r\n')
    expect(lines.map((l) => (l.kind === 'assign' ? [l.key, l.value] : null))).toEqual([
      ['FOO', 'bar'],
      ['BAZ', 'qux'],
    ])
  })

  it('strips inline comments only when preceded by whitespace', () => {
    const { lines } = lex('A=abc # note\nB=abc#def\nC=#only-comment')
    const values = lines.map((l) => (l.kind === 'assign' ? [l.value, l.comment] : null))
    expect(values).toEqual([
      ['abc', 'note'],
      ['abc#def', undefined],
      ['', 'only-comment'],
    ])
  })

  it('parses double quoted values with escapes', () => {
    const { lines } = lex('A="line1\\nline2 \\"q\\" \\\\ # not comment" # real comment')
    const a = lines[0]
    expect(a).toMatchObject({ kind: 'assign', value: 'line1\nline2 "q" \\ # not comment', comment: 'real comment' })
  })

  it('keeps single quoted values literal', () => {
    const { lines } = lex("A='raw \\n $HOME'")
    expect(lines[0]).toMatchObject({ value: 'raw \\n $HOME' })
  })

  it('supports multi-line double quoted values', () => {
    const text = 'KEY="-----BEGIN-----\nabc\n-----END-----"\nNEXT=1'
    const { lines, diagnostics } = lex(text)
    expect(diagnostics).toEqual([])
    expect(lines[0]).toMatchObject({ key: 'KEY', value: '-----BEGIN-----\nabc\n-----END-----', line: 1, endLine: 3 })
    expect(lines[1]).toMatchObject({ key: 'NEXT', line: 4 })
  })

  it('reports unterminated quotes', () => {
    const { diagnostics } = lex('A="oops\nB=1')
    expect(diagnostics[0]).toMatchObject({ severity: 'error', key: 'A' })
  })

  it('reports lines that are not assignments', () => {
    const { diagnostics, lines } = lex('just text\n1BAD=x\nOK=1')
    expect(diagnostics.map((d) => d.line)).toEqual([1, 2])
    expect(lines).toHaveLength(1)
  })

  it('strips a UTF-8 BOM', () => {
    expect(lex('\uFEFFA=1').lines[0]).toMatchObject({ key: 'A' })
  })
})

describe('parseEnv', () => {
  it('keeps duplicates and warns about them; last value wins in the map', () => {
    const env = parseEnv('A=1\nB=2\nA=3\n')
    expect(env.entries.map((e) => e.key)).toEqual(['A', 'B', 'A'])
    expect(env.diagnostics).toHaveLength(1)
    expect(env.diagnostics[0]).toMatchObject({ severity: 'warning', key: 'A', line: 3 })
    expect(envToMap(env).get('A')).toBe('3')
  })
})

describe('formatValue', () => {
  it.each([
    ['', ''],
    ['simple', 'simple'],
    ['postgres://u:p@h:5432/db?ssl=true', 'postgres://u:p@h:5432/db?ssl=true'],
    ['has space', '"has space"'],
    ['a#b', '"a#b"'],
    ['quote"d', '"quote\\"d"'],
    ['multi\nline', '"multi\\nline"'],
    [' padded', '" padded"'],
    ['C:\\path', '"C:\\\\path"'],
  ])('formats %j as %j', (input, expected) => {
    expect(formatValue(input)).toBe(expected)
  })

  it.each(['', 'x', 'a b', 'a#b', 'q"q', "s'q", 'multi\nline\n', 'tab\there', 'back\\slash', ' lead', 'trail '])(
    'round-trips %j through lex',
    (value) => {
      const { lines } = lex(`K=${formatValue(value)}`)
      expect(lines[0]).toMatchObject({ kind: 'assign', value })
    },
  )
})

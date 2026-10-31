import { describe, expect, it } from 'vitest'
import { isDecoratorLine, parseCallExpr, parseDecoratorLine, splitArgs, unquote } from './decorators'

describe('parseDecoratorLine', () => {
  it('parses flags and key=value pairs', () => {
    const { decorators, errors } = parseDecoratorLine('@required @sensitive @type=url')
    expect(errors).toEqual([])
    expect(decorators).toEqual([
      { name: 'required', value: null },
      { name: 'sensitive', value: null },
      { name: 'type', value: 'url' },
    ])
  })

  it('keeps call expressions with spaces and quotes intact', () => {
    const { decorators } = parseDecoratorLine('@type=string(minLength=8, pattern="^[a-z ]+$") @optional')
    expect(decorators).toEqual([
      { name: 'type', value: 'string(minLength=8, pattern="^[a-z ]+$")' },
      { name: 'optional', value: null },
    ])
  })

  it('unquotes quoted values', () => {
    const { decorators } = parseDecoratorLine('@example="hello world" @docs=\'https://x.dev\'')
    expect(decorators).toEqual([
      { name: 'example', value: 'hello world' },
      { name: 'docs', value: 'https://x.dev' },
    ])
  })

  it('supports @name(args) form', () => {
    expect(parseDecoratorLine('@docs("Guide", https://x.dev)').decorators).toEqual([
      { name: 'docs', value: '"Guide", https://x.dev' },
    ])
  })

  it('stops at a trailing comment', () => {
    expect(parseDecoratorLine('@required # because reasons').decorators).toEqual([
      { name: 'required', value: null },
    ])
  })

  it('reports junk and unbalanced input', () => {
    expect(parseDecoratorLine('@required junk').errors).toHaveLength(1)
    expect(parseDecoratorLine('@type=string(minLength=1').errors).toHaveLength(1)
  })
})

describe('helpers', () => {
  it('detects decorator lines', () => {
    expect(isDecoratorLine('  @required')).toBe(true)
    expect(isDecoratorLine('email me @ home')).toBe(false)
  })

  it('splits arguments respecting quotes and parens', () => {
    expect(splitArgs('a, "b, c", f(x, y), k="v,w"')).toEqual(['a', '"b, c"', 'f(x, y)', 'k="v,w"'])
  })

  it('unquotes only matching quotes and escaped quotes', () => {
    expect(unquote('"a \\"b\\" \\d"')).toBe('a "b" \\d')
    expect(unquote("'x'")).toBe('x')
    expect(unquote('"mismatch\'')).toBe('"mismatch\'')
  })

  it('parses call expressions', () => {
    expect(parseCallExpr('enum(a, "b c", d)')).toEqual({ name: 'enum', positional: ['a', 'b c', 'd'], named: {} })
    expect(parseCallExpr('integer(min=1, max=10)')).toEqual({
      name: 'integer',
      positional: [],
      named: { min: '1', max: '10' },
    })
    expect(parseCallExpr('boolean')).toEqual({ name: 'boolean', positional: [], named: {} })
    expect(parseCallExpr('not valid(')).toBeNull()
  })
})

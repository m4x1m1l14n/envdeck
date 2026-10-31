import { describe, expect, it } from 'vitest'
import { describeType, formatTypeSpec, parseTypeSpec } from './typespec'
import type { TypeSpec } from './types'

describe('parseTypeSpec', () => {
  it('parses simple types and aliases', () => {
    expect(parseTypeSpec('boolean').type).toEqual({ name: 'boolean' })
    expect(parseTypeSpec('int').type).toEqual({ name: 'integer' })
    expect(parseTypeSpec('bool').type).toEqual({ name: 'boolean' })
    expect(parseTypeSpec('URL').type).toEqual({ name: 'url' })
  })

  it('parses string constraints', () => {
    const { type, warnings } = parseTypeSpec('string(minLength=8, maxLength=64, pattern="^[a-z]+\\d*$", startsWith=sk_)')
    expect(warnings).toEqual([])
    expect(type).toEqual({ name: 'string', minLength: 8, maxLength: 64, pattern: '^[a-z]+\\d*$', startsWith: 'sk_' })
  })

  it('parses numeric ranges', () => {
    expect(parseTypeSpec('number(min=0.5, max=2)').type).toEqual({ name: 'number', min: 0.5, max: 2 })
    expect(parseTypeSpec('port(min=1024)').type).toEqual({ name: 'port', min: 1024 })
  })

  it('treats varlock-style number(isInt=true) as integer', () => {
    expect(parseTypeSpec('number(isInt=true, min=1)').type).toEqual({ name: 'integer', min: 1 })
  })

  it('parses enums with quoted values', () => {
    expect(parseTypeSpec('enum(a, "b c", d)').type).toEqual({ name: 'enum', values: ['a', 'b c', 'd'] })
  })

  it('parses url protocols', () => {
    expect(parseTypeSpec('url(protocols="https, wss:")').type).toEqual({ name: 'url', protocols: ['https', 'wss'] })
  })

  it('warns about unknown types, options and bad values', () => {
    expect(parseTypeSpec('mystery').warnings[0]).toMatch(/Unknown type/)
    expect(parseTypeSpec('mystery').type).toEqual({ name: 'string' })
    expect(parseTypeSpec('integer(foo=1)').warnings[0]).toMatch(/unknown option "foo"/)
    expect(parseTypeSpec('integer(min=abc)').warnings[0]).toMatch(/not a number/)
    expect(parseTypeSpec('integer(min=5, max=1)').warnings[0]).toMatch(/greater than max/)
    expect(parseTypeSpec('string(pattern="[")').warnings[0]).toMatch(/not a valid regular expression/)
    expect(parseTypeSpec('enum()').warnings[0]).toMatch(/no values/)
  })
})

describe('formatTypeSpec', () => {
  const cases: TypeSpec[] = [
    { name: 'string' },
    { name: 'string', minLength: 1, maxLength: 5, pattern: '^"x"\\d$', startsWith: 'a b', endsWith: 'z' },
    { name: 'integer', min: 1, max: 10 },
    { name: 'number', min: -1.5 },
    { name: 'port' },
    { name: 'enum', values: ['dev', 'prod env', 'x,y'] },
    { name: 'url', protocols: ['http', 'https'] },
    { name: 'boolean' },
    { name: 'json' },
  ]

  it.each(cases)('round-trips %j', (type) => {
    const { type: parsed, warnings } = parseTypeSpec(formatTypeSpec(type))
    expect(warnings).toEqual([])
    expect(parsed).toEqual(type)
  })

  it('formats canonically', () => {
    expect(formatTypeSpec({ name: 'integer', min: 1, max: 10 })).toBe('integer(min=1, max=10)')
    expect(formatTypeSpec({ name: 'enum', values: ['a', 'b c'] })).toBe('enum(a, "b c")')
  })
})

describe('describeType', () => {
  it('summarises constraints', () => {
    expect(describeType({ name: 'integer', min: 1, max: 100 })).toBe('integer · 1–100')
    expect(describeType({ name: 'string', minLength: 32, maxLength: 32 })).toBe('string · len 32')
    expect(describeType({ name: 'enum', values: ['a', 'b'] })).toBe('enum · a | b')
  })
})

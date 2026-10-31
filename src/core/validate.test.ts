import { describe, expect, it } from 'vitest'
import { validateValue } from './validate'
import type { TypeSpec } from './types'

const req = (type: TypeSpec) => ({ required: true, type })
const codes = (type: TypeSpec, value: string | undefined, required = true) =>
  validateValue({ required, type }, value).map((i) => i.code)

describe('validateValue', () => {
  it('reports missing required values; ignores unset optional ones', () => {
    expect(codes({ name: 'string' }, undefined)).toEqual(['missing'])
    expect(codes({ name: 'string' }, '')).toEqual(['missing'])
    expect(codes({ name: 'integer', min: 5 }, '', false)).toEqual([])
  })

  it('checks string length (in code points), pattern and affixes', () => {
    const t: TypeSpec = { name: 'string', minLength: 3, maxLength: 5, pattern: '^[a-z🚀]+$', startsWith: 'a', endsWith: 'z' }
    expect(codes(t, 'abz')).toEqual([])
    expect(codes(t, '🚀🚀z')).toEqual(['startsWith'])
    expect(codes(t, 'az')).toEqual(['minLength'])
    expect(codes(t, 'abcdefz')).toEqual(['maxLength'])
    expect(codes(t, 'aB1z')).toEqual(['pattern'])
  })

  it.each([
    ['number', '1.5', []],
    ['number', '-2e3', []],
    ['number', '.5', []],
    ['number', 'abc', ['type']],
    ['number', '1,5', ['type']],
    ['integer', '42', []],
    ['integer', '4.2', ['type']],
    ['port', '8080', []],
    ['port', '0', ['min']],
    ['port', '70000', ['max']],
    ['boolean', 'TRUE', []],
    ['boolean', 'off', []],
    ['boolean', 'maybe', ['type']],
    ['email', 'a@b.co', []],
    ['email', 'a@b', ['type']],
    ['uuid', '123e4567-e89b-12d3-a456-426614174000', []],
    ['uuid', 'nope', ['type']],
    ['json', '{"a":[1]}', []],
    ['json', '{a:1}', ['type']],
    ['url', 'https://x.dev/path', []],
    ['url', 'not a url', ['type']],
  ] as const)('%s %j → %j', (name, value, expected) => {
    expect(codes({ name } as TypeSpec, value)).toEqual(expected)
  })

  it('checks numeric bounds', () => {
    expect(codes({ name: 'integer', min: 1, max: 10 }, '0')).toEqual(['min'])
    expect(codes({ name: 'integer', min: 1, max: 10 }, '11')).toEqual(['max'])
    expect(codes({ name: 'number', min: 0.5 }, '0.4')).toEqual(['min'])
    expect(codes({ name: 'port', min: 1024 }, '80')).toEqual(['min'])
  })

  it('checks enums exactly', () => {
    const t: TypeSpec = { name: 'enum', values: ['dev', 'prod'] }
    expect(codes(t, 'dev')).toEqual([])
    expect(codes(t, 'DEV')).toEqual(['enum'])
  })

  it('checks url protocols', () => {
    const t: TypeSpec = { name: 'url', protocols: ['postgres', 'postgresql'] }
    expect(codes(t, 'postgres://u@h/db')).toEqual([])
    expect(codes(t, 'mysql://u@h/db')).toEqual(['protocol'])
  })

  it('produces readable messages', () => {
    expect(validateValue(req({ name: 'integer', min: 1 }), '0')[0]?.message).toBe('Must be ≥ 1')
    expect(validateValue(req({ name: 'string', minLength: 4 }), 'ab')[0]?.message).toBe(
      'Must be at least 4 characters (got 2)',
    )
  })
})

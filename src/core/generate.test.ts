import { describe, expect, it } from 'vitest'
import { auditEnv } from './audit'
import { generateEnv, normalizeEnv } from './generate'
import { parseEnv } from './lex'
import { parseSchema } from './schema'

const { schema } = parseSchema(`
# @required
APP=demo

# @group Db

# @required @sensitive
DB_URL=

# Pool size
# @optional @type=integer
POOL=10

# @group Empty

`)

describe('generateEnv', () => {
  it('writes canonical order with group headings', () => {
    expect(generateEnv(schema, { POOL: '5', DB_URL: 'postgres://x', APP: 'my app' })).toBe(
      ['APP="my app"', '', '# ━━━ Db ━━━', 'DB_URL=postgres://x', 'POOL=5', ''].join('\n'),
    )
  })

  it('supports comment levels', () => {
    expect(generateEnv(schema, { APP: 'a' }, { comments: 'none' })).toBe('APP=a\n\nDB_URL=\nPOOL=\n')
    expect(generateEnv(schema, { APP: 'a' }, { comments: 'full' })).toContain('# Pool size\nPOOL=')
  })

  it('can omit unset optional values but always keeps required ones', () => {
    expect(generateEnv(schema, {}, { includeUnsetOptional: false, comments: 'none' })).toBe('APP=\n\nDB_URL=\n')
  })

  it('accepts a Map of values', () => {
    expect(generateEnv(schema, new Map([['APP', 'x']]), { comments: 'none' })).toMatch(/^APP=x\n/)
  })
})

describe('normalizeEnv', () => {
  const messy = parseEnv('POOL=3\nLEGACY=1\nAPP=old\nAPP=new\n')

  it('reorders, dedupes, adds missing keys and keeps extras at the end', () => {
    expect(normalizeEnv(schema, messy)).toBe(
      ['APP=new', '', '# ━━━ Db ━━━', 'DB_URL=', 'POOL=3', '', '# ━━━ Not in schema ━━━', 'LEGACY=1', ''].join('\n'),
    )
  })

  it('can drop extras and fill defaults', () => {
    const out = normalizeEnv(schema, parseEnv('APP=x\n'), { keepExtras: false, fillDefaults: true, comments: 'none' })
    expect(out).toBe('APP=x\n\nDB_URL=\nPOOL=10\n')
  })

  it('produces a file without order drift or duplicates', () => {
    const result = auditEnv(schema, parseEnv(normalizeEnv(schema, messy)))
    expect(result.orderDrift).toBe(false)
    expect(result.duplicates).toEqual([])
  })
})

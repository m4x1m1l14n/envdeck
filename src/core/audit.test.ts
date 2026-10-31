import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { auditEnv } from './audit'
import { parseEnv } from './lex'
import { parseSchema } from './schema'

const read = (name: string) => readFileSync(fileURLToPath(new URL(`../../examples/${name}`, import.meta.url)), 'utf8')
const { schema } = parseSchema(read('.env.example'))

describe('auditEnv', () => {
  it('passes the staging example', () => {
    const result = auditEnv(schema, parseEnv(read('.env.staging')))
    expect(result.passed).toBe(true)
    expect(result.clean).toBe(true)
    expect(result.orderDrift).toBe(false)
    expect(result.counts).toEqual({ ok: 7, missing: 0, invalid: 0, unset: 4, extra: 0 })
  })

  it('finds every kind of drift in the production example', () => {
    const result = auditEnv(schema, parseEnv(read('.env.production')))
    const byKey = Object.fromEntries(result.rows.map((r) => [r.key, r]))

    expect(result.passed).toBe(false)
    expect(result.clean).toBe(false)
    expect(result.orderDrift).toBe(true)
    expect(result.duplicates).toEqual(['PORT'])
    expect(result.counts).toEqual({ ok: 4, missing: 0, invalid: 3, unset: 4, extra: 1 })

    expect(byKey.DATABASE_URL).toMatchObject({ status: 'invalid', issues: ['Protocol must be postgres or postgresql (got mysql)'] })
    expect(byKey.JWT_SECRET?.status).toBe('invalid')
    expect(byKey.DB_POOL_SIZE).toMatchObject({ status: 'invalid', issues: ['Must be ≤ 100'] })
    expect(byKey.PORT).toMatchObject({ status: 'ok', value: '8443', line: 10 })
    expect(byKey.PORT?.warnings[0]).toMatch(/Defined 2 times/)
    expect(byKey.LEGACY_REDIS_HOST).toMatchObject({ status: 'extra', value: 'redis.prod' })
  })

  it('lists schema rows in canonical order followed by extras', () => {
    const result = auditEnv(schema, parseEnv('ZZZ=1\nPORT=1\n'))
    expect(result.rows.map((r) => r.key).slice(0, 3)).toEqual(['NODE_ENV', 'LOG_LEVEL', 'PORT'])
    expect(result.rows.at(-1)?.key).toBe('ZZZ')
  })

  it('distinguishes missing required from unset optional, and present-but-empty', () => {
    const result = auditEnv(schema, parseEnv('NODE_ENV=\n'))
    const nodeEnv = result.rows.find((r) => r.key === 'NODE_ENV')
    expect(nodeEnv).toMatchObject({ status: 'missing', present: true, issues: [] })
    expect(result.rows.find((r) => r.key === 'LOG_LEVEL')).toMatchObject({ status: 'unset', present: false })
  })

  it('does not report order drift for a subset in the right order', () => {
    expect(auditEnv(schema, parseEnv('NODE_ENV=dev\nJWT_TTL=1\n')).orderDrift).toBe(false)
    expect(auditEnv(schema, parseEnv('JWT_TTL=1\nNODE_ENV=dev\n')).orderDrift).toBe(true)
  })

  it('warns when a sensitive value equals its example default', () => {
    const { schema: s } = parseSchema('# @sensitive\nAPI_KEY=changeme\n')
    const row = auditEnv(s, parseEnv('API_KEY=changeme\n')).rows[0]
    expect(row?.warnings[0]).toMatch(/still the example value/)
  })
})

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { canonicalOrder, parseSchema, serializeSchema } from './schema'
import type { EnvSchema } from './types'

const example = readFileSync(fileURLToPath(new URL('../../examples/.env.example', import.meta.url)), 'utf8')

describe('parseSchema', () => {
  it('parses the bundled example without diagnostics', () => {
    const { schema, diagnostics } = parseSchema(example)
    expect(diagnostics).toEqual([])
    expect(schema.description).toBe('Acme API — environment schema.')
    expect(schema.groups.map((g) => g.name)).toEqual(['Server', 'Database', 'Auth'])
    expect(schema.groups[0]?.description).toBe('HTTP server settings')
    expect(schema.variables.map((v) => [v.key, v.group])).toEqual([
      ['NODE_ENV', null],
      ['LOG_LEVEL', null],
      ['PORT', 'Server'],
      ['PUBLIC_URL', 'Server'],
      ['WORKER_COUNT', 'Server'],
      ['DATABASE_URL', 'Database'],
      ['DB_POOL_SIZE', 'Database'],
      ['DB_SSL', 'Database'],
      ['JWT_SECRET', 'Auth'],
      ['JWT_TTL', 'Auth'],
      ['ADMIN_EMAIL', 'Auth'],
    ])
    const jwt = schema.variables.find((v) => v.key === 'JWT_SECRET')
    expect(jwt).toMatchObject({
      required: true,
      sensitive: true,
      default: '',
      description: 'Secret used to sign JWTs. Generate with: openssl rand -hex 32',
      type: { name: 'string', minLength: 64, maxLength: 64, pattern: '^[a-f0-9]+$' },
    })
    expect(schema.variables.find((v) => v.key === 'PUBLIC_URL')).toMatchObject({
      example: 'https://api.acme.dev',
      type: { name: 'url', protocols: ['http', 'https'] },
    })
  })

  it('treats un-annotated variables as required strings', () => {
    const { schema } = parseSchema('FOO=bar\nBAZ=\n')
    expect(schema.variables).toMatchObject([
      { key: 'FOO', required: true, type: { name: 'string' }, default: 'bar', line: 1 },
      { key: 'BAZ', required: true, default: '', line: 2 },
    ])
  })

  it('honours @defaultRequired=false in the header', () => {
    const { schema } = parseSchema('# My app\n# @defaultRequired=false\n\nA=1\n# @required\nB=2\n')
    expect(schema.description).toBe('My app')
    expect(schema.defaultRequired).toBe(false)
    expect(schema.variables.map((v) => v.required)).toEqual([false, true])
  })

  it('accepts several group header styles', () => {
    const text = [
      '# ━━━ @group Database ━━━',
      '',
      'A=1',
      '',
      '# --- @group "Message Queue" ---',
      'B=2',
      '',
      '# @group=Cache',
      '# Cache description',
      '',
      'C=3',
    ].join('\n')
    const { schema } = parseSchema(text)
    expect(schema.groups).toEqual([
      { name: 'Database', description: '' },
      { name: 'Message Queue', description: '' },
      { name: 'Cache', description: 'Cache description' },
    ])
    expect(schema.variables.map((v) => v.group)).toEqual(['Database', 'Message Queue', 'Cache'])
  })

  it('gives comment lines after an unclosed group header to the following variable', () => {
    const { schema } = parseSchema('# @group Db\n# The URL\n# @optional\nDB=x\n')
    expect(schema.groups).toEqual([{ name: 'Db', description: '' }])
    expect(schema.variables[0]).toMatchObject({ group: 'Db', description: 'The URL', required: false })
  })

  it('merges repeated group headers into one group', () => {
    const { schema } = parseSchema('# @group A\n\nX=1\n\n# @group B\n\nY=1\n\n# @group A\n\nZ=1\n')
    expect(schema.groups.map((g) => g.name)).toEqual(['A', 'B'])
    expect(canonicalOrder(schema).map((v) => v.key)).toEqual(['X', 'Z', 'Y'])
  })

  it('reads decorators from an inline comment', () => {
    const { schema } = parseSchema('PORT=3000 # @optional @type=port\n')
    expect(schema.variables[0]).toMatchObject({ required: false, type: { name: 'port' } })
  })

  it('keeps multi-line descriptions and drops detached comments', () => {
    const text = '# Header\n\n# floating note\n\n# Line one\n#\n# Line three\nA=1\n'
    const { schema } = parseSchema(text)
    expect(schema.description).toBe('Header')
    expect(schema.variables[0]?.description).toBe('Line one\n\nLine three')
  })

  it('reports duplicates, unknown decorators and conflicting flags', () => {
    const text = '# @required @optional @frobnicate\nA=1\nA=2\n'
    const { schema, diagnostics } = parseSchema(text)
    expect(schema.variables).toHaveLength(1)
    const messages = diagnostics.map((d) => d.message)
    expect(messages.some((m) => /both @required and @optional/.test(m))).toBe(true)
    expect(messages.some((m) => /Unknown decorator @frobnicate/.test(m))).toBe(true)
    expect(diagnostics.find((d) => /Duplicate/.test(d.message))).toMatchObject({ severity: 'error', line: 3 })
  })

  it('warns when a sensitive variable has a committed value or a default breaks its rules', () => {
    const { diagnostics } = parseSchema('# @sensitive\nSECRET=hunter2\n# @type=integer\nN=abc\n')
    expect(diagnostics.map((d) => d.key)).toEqual(['SECRET', 'N'])
  })

  it('parses @docs in both forms', () => {
    const { schema } = parseSchema('# @docs=https://a.dev\nA=\n# @docs("Guide", https://b.dev)\nB=\n')
    expect(schema.variables.map((v) => v.docs)).toEqual(['https://a.dev', 'https://b.dev'])
  })
})

describe('serializeSchema', () => {
  it('leaves the bundled (canonical) example byte-for-byte unchanged', () => {
    expect(serializeSchema(parseSchema(example).schema)).toBe(example)
  })

  it('is stable: serialize(parse(serialize(x))) === serialize(x)', () => {
    const once = serializeSchema(parseSchema(example).schema)
    const twice = serializeSchema(parseSchema(once).schema)
    expect(twice).toBe(once)
  })

  it('round-trips the schema model', () => {
    const { schema } = parseSchema(example)
    const reparsed = parseSchema(serializeSchema(schema))
    expect(reparsed.diagnostics).toEqual([])
    const strip = (s: EnvSchema) => ({ ...s, variables: s.variables.map(({ line: _line, ...v }) => v) })
    expect(strip(reparsed.schema)).toEqual(strip(schema))
  })

  it('writes ungrouped variables first and groups in order', () => {
    const schema: EnvSchema = {
      description: '',
      defaultRequired: true,
      groups: [{ name: 'G', description: 'Group G' }],
      variables: [
        { key: 'IN_G', description: '', group: 'G', required: true, sensitive: false, type: { name: 'string' }, default: '', line: 0 },
        {
          key: 'TOP',
          description: 'Top level',
          group: null,
          required: false,
          sensitive: true,
          type: { name: 'integer', min: 1 },
          default: 'a b',
          example: '42',
          line: 0,
        },
      ],
    }
    expect(serializeSchema(schema)).toMatchInlineSnapshot(`
      "# Top level
      # @optional @sensitive @type=integer(min=1) @example=42
      TOP="a b"

      # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      # @group G
      # Group G
      # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      # @required @type=string
      IN_G=
      "
    `)
  })

  it('writes the header and non-default defaultRequired', () => {
    const out = serializeSchema({ description: 'Hello\nWorld', defaultRequired: false, groups: [], variables: [] })
    expect(out).toBe('# Hello\n# World\n# @defaultRequired=false\n')
    expect(parseSchema(out).schema).toMatchObject({ description: 'Hello\nWorld', defaultRequired: false })
  })

  it('does not lose empty groups', () => {
    const out = serializeSchema({ description: '', defaultRequired: true, groups: [{ name: 'Empty', description: '' }], variables: [] })
    expect(parseSchema(out).schema.groups).toEqual([{ name: 'Empty', description: '' }])
  })
})

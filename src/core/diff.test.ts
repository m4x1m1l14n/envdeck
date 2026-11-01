import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { diffSchemas, suggestRenames } from './diff'
import { parseSchema } from './schema'

const example = readFileSync(fileURLToPath(new URL('../../examples/.env.example', import.meta.url)), 'utf8')
const parse = (text: string) => parseSchema(text).schema

describe('diffSchemas', () => {
  it('reports no difference for the same file', () => {
    const d = diffSchemas(parse(example), parse(example))
    expect(d.identical).toBe(true)
    expect(d).toMatchObject({ added: [], removed: [], changed: [], header: false, reordered: false })
  })

  it('ignores formatting-only differences', () => {
    const a = parse('# @required @type=port\nPORT=3000\n')
    const b = parse('PORT=3000 # @type=port   @required\n')
    expect(diffSchemas(a, b).identical).toBe(true)
  })

  it('finds added, removed and changed variables', () => {
    const before = parse(['# Port', '# @optional @type=port', 'PORT=3000', '', 'OLD_FLAG=1', ''].join('\n'))
    const after = parse(
      ['# HTTP port', '# @required @type=port(min=1024)', 'PORT=8080', '', '# @optional @type=email', 'ADMIN_EMAIL=', ''].join('\n'),
    )
    const d = diffSchemas(before, after)
    expect(d.identical).toBe(false)
    expect(d.added.map((v) => v.key)).toEqual(['ADMIN_EMAIL'])
    expect(d.removed.map((v) => v.key)).toEqual(['OLD_FLAG'])
    expect(d.changed).toHaveLength(1)
    expect(d.changed[0]?.key).toBe('PORT')
    expect(d.changed[0]?.fields).toEqual(['type', 'required', 'default', 'description'])
  })

  it('tracks moves between groups, group changes and the header', () => {
    const before = parse(
      ['# Header', '', '# @group A', '# first', '', 'X=1', '', '# @group B', '', 'Y=2', ''].join('\n'),
    )
    const after = parse(
      ['# @defaultRequired=false', '', '# @group A', '# first, edited', '', '# @group C', '', 'X=1', 'Y=2', ''].join('\n'),
    )
    const d = diffSchemas(before, after)
    expect(d.header).toBe(true)
    expect(d.groups).toEqual({ added: ['C'], removed: ['B'], changed: ['A'] })
    expect(d.changed.map((c) => [c.key, c.fields])).toEqual([
      ['X', ['required', 'group']],
      ['Y', ['required', 'group']],
    ])
  })

  it('detects reordering of variables and groups', () => {
    expect(diffSchemas(parse('A=\nB=\n'), parse('B=\nA=\n')).reordered).toBe(true)
    const g = (first: string, second: string) =>
      parse([`# @group ${first}`, '', `${first}_X=`, '', `# @group ${second}`, '', `${second}_X=`, ''].join('\n'))
    const d = diffSchemas(g('P', 'Q'), g('Q', 'P'))
    expect(d.reordered).toBe(true)
    expect(d.identical).toBe(false)
    // Adding a variable in the middle is not a reorder.
    expect(diffSchemas(parse('A=\nC=\n'), parse('A=\nB=\nC=\n')).reordered).toBe(false)
  })

  it('suggests one-to-one renames with the same type, group and sensitivity', () => {
    const before = parse(['# @type=integer', 'TTL=60', '', '# @sensitive', 'TOKEN=', '', 'A=', 'B=', ''].join('\n'))
    const after = parse(['# @type=integer', 'TTL_SECONDS=60', '', 'TOKEN_V2=', '', 'C=', 'D=', ''].join('\n'))
    // TTL → TTL_SECONDS matches; TOKEN lost @sensitive; A/B vs C/D/TOKEN_V2 are ambiguous.
    expect(suggestRenames(diffSchemas(before, after))).toEqual({ TTL_SECONDS: 'TTL' })
  })
})

import { describe, expect, it } from 'vitest'
import {
  addGroup,
  moveGroup,
  moveVariable,
  newVariable,
  removeGroup,
  removeVariable,
  updateGroup,
  upsertVariable,
  validateKey,
} from './ops'
import { canonicalOrder } from './schema'
import { emptySchema, type EnvSchema } from './types'

function build(): EnvSchema {
  let s = emptySchema()
  s = upsertVariable(s, newVariable('A', null))
  s = upsertVariable(s, newVariable('B', 'G1'))
  s = upsertVariable(s, newVariable('C', 'G1'))
  s = upsertVariable(s, newVariable('D', 'G2'))
  return s
}

const keys = (s: EnvSchema) => canonicalOrder(s).map((v) => v.key)

describe('schema ops', () => {
  it('validates keys', () => {
    const s = build()
    expect(validateKey(s, '')).toMatch(/required/)
    expect(validateKey(s, '1X')).toMatch(/letters/)
    expect(validateKey(s, 'A')).toMatch(/already exists/)
    expect(validateKey(s, 'A', 'A')).toBeNull()
    expect(validateKey(s, 'NEW_KEY')).toBeNull()
  })

  it('creates groups on demand when upserting', () => {
    const s = build()
    expect(s.groups.map((g) => g.name)).toEqual(['G1', 'G2'])
    expect(keys(s)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('renames a variable in place', () => {
    const s = upsertVariable(build(), { ...newVariable('B2', 'G1') }, 'B')
    expect(keys(s)).toEqual(['A', 'B2', 'C', 'D'])
  })

  it('moves a variable to the end of another group', () => {
    const s = upsertVariable(build(), newVariable('B', 'G2'), 'B')
    expect(keys(s)).toEqual(['A', 'C', 'D', 'B'])
  })

  it('moves variables within their group only', () => {
    let s = build()
    s = moveVariable(s, 'C', -1)
    expect(keys(s)).toEqual(['A', 'C', 'B', 'D'])
    expect(moveVariable(s, 'C', -1)).toBe(s)
    expect(moveVariable(s, 'D', 1)).toBe(s)
  })

  it('removes variables', () => {
    expect(keys(removeVariable(build(), 'C'))).toEqual(['A', 'B', 'D'])
  })

  it('adds, renames, reorders and removes groups', () => {
    let s = addGroup(build(), 'G3')
    expect(addGroup(s, 'G3')).toBe(s)
    s = updateGroup(s, 'G1', { name: 'Core', description: 'core stuff' })
    expect(s.groups[0]).toEqual({ name: 'Core', description: 'core stuff' })
    expect(s.variables.filter((v) => v.group === 'Core').map((v) => v.key)).toEqual(['B', 'C'])
    s = moveGroup(s, 'G2', -1)
    expect(keys(s)).toEqual(['A', 'D', 'B', 'C'])
    const ungrouped = removeGroup(s, 'Core')
    expect(ungrouped.variables.find((v) => v.key === 'B')?.group).toBeNull()
    expect(keys(removeGroup(s, 'Core', true))).toEqual(['A', 'D'])
  })
})

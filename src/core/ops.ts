/**
 * Immutable schema editing operations used by the designer UI.
 */
import type { EnvSchema, VariableDef } from './types'

export const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

export function validateKey(schema: EnvSchema, key: string, ignoreKey?: string): string | null {
  if (key === '') return 'Name is required'
  if (!KEY_RE.test(key)) return 'Use letters, digits and underscores; must not start with a digit'
  if (key !== ignoreKey && schema.variables.some((v) => v.key === key)) return `${key} already exists`
  return null
}

export function newVariable(key: string, group: string | null): VariableDef {
  return {
    key,
    description: '',
    group,
    required: true,
    sensitive: false,
    type: { name: 'string' },
    default: '',
    line: 0,
  }
}

/** Insert or replace a variable. When `originalKey` is given, the variable keeps its position. */
export function upsertVariable(schema: EnvSchema, v: VariableDef, originalKey?: string): EnvSchema {
  const groups = ensureGroup(schema.groups, v.group)
  const idx = schema.variables.findIndex((x) => x.key === (originalKey ?? v.key))
  if (idx < 0) return { ...schema, groups, variables: [...schema.variables, v] }

  const prev = schema.variables[idx] as VariableDef
  const variables = [...schema.variables]
  if (prev.group === v.group) {
    variables[idx] = v
  } else {
    // Moving to another group: append at the end of that group.
    variables.splice(idx, 1)
    variables.push(v)
  }
  return { ...schema, groups, variables }
}

export function removeVariable(schema: EnvSchema, key: string): EnvSchema {
  return { ...schema, variables: schema.variables.filter((v) => v.key !== key) }
}

/** Move a variable up (-1) or down (+1) within its group. */
export function moveVariable(schema: EnvSchema, key: string, delta: -1 | 1): EnvSchema {
  const idx = schema.variables.findIndex((v) => v.key === key)
  if (idx < 0) return schema
  const group = (schema.variables[idx] as VariableDef).group
  let j = idx + delta
  while (j >= 0 && j < schema.variables.length && (schema.variables[j] as VariableDef).group !== group) j += delta
  if (j < 0 || j >= schema.variables.length) return schema
  const variables = [...schema.variables]
  ;[variables[idx], variables[j]] = [variables[j] as VariableDef, variables[idx] as VariableDef]
  return { ...schema, variables }
}

export function addGroup(schema: EnvSchema, name: string, description = ''): EnvSchema {
  if (schema.groups.some((g) => g.name === name)) return schema
  return { ...schema, groups: [...schema.groups, { name, description }] }
}

export function updateGroup(schema: EnvSchema, name: string, next: { name: string; description: string }): EnvSchema {
  return {
    ...schema,
    groups: schema.groups.map((g) => (g.name === name ? { ...next } : g)),
    variables: schema.variables.map((v) => (v.group === name ? { ...v, group: next.name } : v)),
  }
}

/** Remove a group. Its variables become ungrouped unless `deleteVariables` is set. */
export function removeGroup(schema: EnvSchema, name: string, deleteVariables = false): EnvSchema {
  return {
    ...schema,
    groups: schema.groups.filter((g) => g.name !== name),
    variables: deleteVariables
      ? schema.variables.filter((v) => v.group !== name)
      : schema.variables.map((v) => (v.group === name ? { ...v, group: null } : v)),
  }
}

export function moveGroup(schema: EnvSchema, name: string, delta: -1 | 1): EnvSchema {
  const idx = schema.groups.findIndex((g) => g.name === name)
  const j = idx + delta
  if (idx < 0 || j < 0 || j >= schema.groups.length) return schema
  const groups = [...schema.groups]
  ;[groups[idx], groups[j]] = [groups[j]!, groups[idx]!]
  return { ...schema, groups }
}

function ensureGroup(groups: EnvSchema['groups'], name: string | null): EnvSchema['groups'] {
  if (name === null || groups.some((g) => g.name === name)) return groups
  return [...groups, { name, description: '' }]
}

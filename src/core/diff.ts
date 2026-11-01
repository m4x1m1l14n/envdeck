import { canonicalOrder } from './schema'
import { formatTypeSpec } from './typespec'
import type { EnvSchema, VariableDef } from './types'

export type VariableField = 'type' | 'required' | 'sensitive' | 'default' | 'group' | 'description' | 'example' | 'docs'

export const VARIABLE_FIELDS: readonly VariableField[] = [
  'type',
  'required',
  'sensitive',
  'default',
  'group',
  'description',
  'example',
  'docs',
]

export interface VariableChange {
  key: string
  fields: VariableField[]
  before: VariableDef
  after: VariableDef
}

export interface SchemaDiff {
  /** Variables only in `after`, in its canonical order. */
  added: VariableDef[]
  /** Variables only in `before`, in its canonical order. */
  removed: VariableDef[]
  /** Variables in both whose definition differs, in `after` order. */
  changed: VariableChange[]
  groups: {
    added: string[]
    removed: string[]
    /** Groups in both whose description differs. */
    changed: string[]
  }
  /** File header description or `@defaultRequired` differs. */
  header: boolean
  /** Variables present in both appear in a different canonical order. */
  reordered: boolean
  /** No difference that would change the serialized schema. */
  identical: boolean
}

function fieldValue(v: VariableDef, field: VariableField): string {
  switch (field) {
    case 'type':
      return formatTypeSpec(v.type)
    case 'required':
    case 'sensitive':
      return String(v[field])
    case 'group':
      return v.group ?? ''
    default:
      return v[field] ?? ''
  }
}

/** Compare two schemas, e.g. the stored one and a re-imported `.env.example`. */
export function diffSchemas(before: EnvSchema, after: EnvSchema): SchemaDiff {
  const beforeVars = canonicalOrder(before)
  const afterVars = canonicalOrder(after)
  const beforeByKey = new Map(beforeVars.map((v) => [v.key, v]))
  const afterKeys = new Set(afterVars.map((v) => v.key))

  const added = afterVars.filter((v) => !beforeByKey.has(v.key))
  const removed = beforeVars.filter((v) => !afterKeys.has(v.key))

  const changed: VariableChange[] = []
  for (const v of afterVars) {
    const prev = beforeByKey.get(v.key)
    if (!prev) continue
    const fields = VARIABLE_FIELDS.filter((f) => fieldValue(prev, f) !== fieldValue(v, f))
    if (fields.length > 0) changed.push({ key: v.key, fields, before: prev, after: v })
  }

  const beforeGroups = new Map(before.groups.map((g) => [g.name, g]))
  const afterGroups = new Set(after.groups.map((g) => g.name))
  const groups = {
    added: after.groups.filter((g) => !beforeGroups.has(g.name)).map((g) => g.name),
    removed: before.groups.filter((g) => !afterGroups.has(g.name)).map((g) => g.name),
    changed: after.groups
      .filter((g) => {
        const prev = beforeGroups.get(g.name)
        return prev !== undefined && prev.description !== g.description
      })
      .map((g) => g.name),
  }

  const header = before.description !== after.description || before.defaultRequired !== after.defaultRequired

  const common = (vars: VariableDef[], other: Set<string>) => vars.map((v) => v.key).filter((k) => other.has(k))
  const commonBefore = common(beforeVars, afterKeys)
  const commonAfter = common(afterVars, new Set(beforeByKey.keys()))
  const commonGroups = (names: string[], other: Set<string>) => names.filter((n) => other.has(n))
  const groupOrderBefore = commonGroups(before.groups.map((g) => g.name), afterGroups)
  const groupOrderAfter = commonGroups(after.groups.map((g) => g.name), new Set(beforeGroups.keys()))
  const reordered =
    commonBefore.join('\n') !== commonAfter.join('\n') || groupOrderBefore.join('\n') !== groupOrderAfter.join('\n')

  const identical =
    added.length === 0 &&
    removed.length === 0 &&
    changed.length === 0 &&
    groups.added.length === 0 &&
    groups.removed.length === 0 &&
    groups.changed.length === 0 &&
    !header &&
    !reordered

  return { added, removed, changed, groups, header, reordered, identical }
}

/**
 * Pair removed and added variables that look like renames: same type, group
 * and sensitivity, matched one-to-one. Returns `{ newKey: oldKey }`.
 */
export function suggestRenames(diff: Pick<SchemaDiff, 'added' | 'removed'>): Record<string, string> {
  const signature = (v: VariableDef) => [formatTypeSpec(v.type), v.group ?? '', v.sensitive].join('\u0000')
  const renames: Record<string, string> = {}
  for (const a of diff.added) {
    const candidates = diff.removed.filter((r) => signature(r) === signature(a))
    if (candidates.length !== 1) continue
    const [r] = candidates as [VariableDef]
    if (diff.added.filter((x) => signature(x) === signature(r)).length === 1) renames[a.key] = r.key
  }
  return renames
}

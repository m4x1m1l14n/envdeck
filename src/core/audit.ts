import { envToMap } from './lex'
import { canonicalOrder } from './schema'
import { validateValue } from './validate'
import type { EnvFile, EnvSchema, VariableDef } from './types'

/**
 * - `ok`: set and valid
 * - `missing`: required but not set (or empty)
 * - `invalid`: set but breaks a rule
 * - `unset`: optional and not set — fine, reported for visibility
 * - `extra`: present in the env file but not declared in the schema
 */
export type AuditStatus = 'ok' | 'missing' | 'invalid' | 'unset' | 'extra'

export const AUDIT_STATUSES: readonly AuditStatus[] = ['ok', 'missing', 'invalid', 'unset', 'extra']

export interface AuditRow {
  key: string
  status: AuditStatus
  /** Effective value (last occurrence) when present in the env file. */
  value?: string
  /** Whether the key appears in the env file at all (even with an empty value). */
  present: boolean
  issues: string[]
  /** Non-fatal notes, e.g. duplicates or a sensitive value left at its example. */
  warnings: string[]
  def?: VariableDef
  /** Line of the effective assignment in the env file. */
  line?: number
}

export interface AuditResult {
  /** Schema variables in canonical order, followed by extras in file order. */
  rows: AuditRow[]
  counts: Record<AuditStatus, number>
  duplicates: string[]
  /** True when the declared keys appear in a different order than the schema. */
  orderDrift: boolean
  /** No missing or invalid values. */
  passed: boolean
  /** Passed, and also no extras and no duplicates. */
  clean: boolean
}

export function auditEnv(schema: EnvSchema, env: EnvFile): AuditResult {
  const values = envToMap(env)
  const lastLine = new Map<string, number>()
  const occurrences = new Map<string, number>()
  for (const e of env.entries) {
    lastLine.set(e.key, e.line)
    occurrences.set(e.key, (occurrences.get(e.key) ?? 0) + 1)
  }
  const duplicates = [...occurrences].filter(([, n]) => n > 1).map(([k]) => k)

  const ordered = canonicalOrder(schema)
  const declared = new Set(ordered.map((v) => v.key))
  const rows: AuditRow[] = []

  for (const def of ordered) {
    const value = values.get(def.key)
    const present = values.has(def.key)
    const issues = validateValue(def, value)
    let status: AuditStatus
    if (issues.some((i) => i.code === 'missing')) status = 'missing'
    else if (issues.length > 0) status = 'invalid'
    else if (value === undefined || value === '') status = 'unset'
    else status = 'ok'

    const warnings: string[] = []
    if ((occurrences.get(def.key) ?? 0) > 1) {
      warnings.push(`Defined ${occurrences.get(def.key)} times; the last value wins`)
    }
    if (def.sensitive && value !== undefined && value !== '' && def.default !== '' && value === def.default) {
      warnings.push('Sensitive value is still the example value from the schema')
    }

    rows.push({
      key: def.key,
      status,
      value,
      present,
      issues: status === 'missing' ? [] : issues.map((i) => i.message),
      warnings,
      def,
      line: lastLine.get(def.key),
    })
  }

  const extrasSeen = new Set<string>()
  for (const e of env.entries) {
    if (declared.has(e.key) || extrasSeen.has(e.key)) continue
    extrasSeen.add(e.key)
    rows.push({
      key: e.key,
      status: 'extra',
      value: values.get(e.key),
      present: true,
      issues: [],
      warnings: (occurrences.get(e.key) ?? 0) > 1 ? [`Defined ${occurrences.get(e.key)} times`] : [],
      line: lastLine.get(e.key),
    })
  }

  const counts = { ok: 0, missing: 0, invalid: 0, unset: 0, extra: 0 } as Record<AuditStatus, number>
  for (const r of rows) counts[r.status]++

  const passed = counts.missing === 0 && counts.invalid === 0
  return {
    rows,
    counts,
    duplicates,
    orderDrift: hasOrderDrift(ordered, env),
    passed,
    clean: passed && counts.extra === 0 && duplicates.length === 0,
  }
}

function hasOrderDrift(ordered: VariableDef[], env: EnvFile): boolean {
  const rank = new Map(ordered.map((v, i) => [v.key, i]))
  const seen = new Set<string>()
  let prev = -1
  for (const e of env.entries) {
    const r = rank.get(e.key)
    if (r === undefined || seen.has(e.key)) continue
    seen.add(e.key)
    if (r < prev) return true
    prev = r
  }
  return false
}

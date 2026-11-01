import { canonicalOrder, validateValue, type EnvFile, type EnvSchema } from '../../core'
import { effectiveValue, type Environment } from '../store'

/** Values for every schema variable: typed value or the schema default. */
export function effectiveValues(schema: EnvSchema, env: Pick<Environment, 'values'>): Record<string, string> {
  return Object.fromEntries(canonicalOrder(schema).map((v) => [v.key, effectiveValue(env.values, v.key, v.default)]))
}

/** Stored keys that the schema no longer declares (e.g. after a rename). */
export function strayKeys(schema: EnvSchema, env: Pick<Environment, 'values'>): string[] {
  const declared = new Set(schema.variables.map((v) => v.key))
  return Object.keys(env.values).filter((k) => !declared.has(k))
}

/** View a stored environment as an env file, so it can be audited like any other. */
export function environmentAsFile(schema: EnvSchema, env: Pick<Environment, 'values'>): EnvFile {
  const values = effectiveValues(schema, env)
  const entries = Object.entries(values)
    .filter(([, v]) => v !== '')
    .map(([key, value], i) => ({ key, value, line: i + 1 }))
  const stray = strayKeys(schema, env).map((key, i) => ({ key, value: env.values[key] ?? '', line: entries.length + i + 1 }))
  return { entries: [...entries, ...stray], diagnostics: [] }
}

/** Number of variables that are missing or invalid in this environment. */
export function problemCount(schema: EnvSchema, env: Pick<Environment, 'values'>): number {
  const values = effectiveValues(schema, env)
  return schema.variables.filter((v) => validateValue(v, values[v.key]).length > 0).length
}

/** Move stored values to new keys. `renames` maps new key → old key; keys without a stored value are skipped. */
export function renameValues(values: Record<string, string>, renames: Record<string, string>): Record<string, string> {
  const next = { ...values }
  for (const [to, from] of Object.entries(renames)) {
    if (!Object.prototype.hasOwnProperty.call(values, from)) continue
    next[to] = values[from] as string
    delete next[from]
  }
  return next
}

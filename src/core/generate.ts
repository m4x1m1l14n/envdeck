import { envToMap, formatValue } from './lex'
import type { EnvFile, EnvSchema, VariableDef } from './types'

export interface GenerateOptions {
  /**
   * - `none`: only KEY=value lines
   * - `groups`: group headings as comments (default)
   * - `full`: group headings and variable descriptions
   */
  comments?: 'none' | 'groups' | 'full'
  /** Write `KEY=` for optional variables without a value (default true). */
  includeUnsetOptional?: boolean
  /** Keys not in the schema, written at the end under their own heading. */
  extras?: { key: string; value: string }[]
}

const RULE = '━'.repeat(3)

/**
 * Generate a `.env` file from a schema and a value map. Variables are always
 * written in canonical schema order so every environment's file looks the same.
 */
export function generateEnv(
  schema: EnvSchema,
  values: Record<string, string> | Map<string, string>,
  options: GenerateOptions = {},
): string {
  const { comments = 'groups', includeUnsetOptional = true, extras = [] } = options
  const get = (k: string) => (values instanceof Map ? values.get(k) : values[k])
  const out: string[] = []

  const section = (title: string | null, vars: VariableDef[]) => {
    const lines: string[] = []
    for (const v of vars) {
      const value = get(v.key) ?? ''
      if (value === '' && !v.required && !includeUnsetOptional) continue
      if (comments === 'full' && v.description) {
        lines.push(...v.description.split('\n').map((l) => (l.trim() ? `# ${l}` : '#')))
      }
      lines.push(`${v.key}=${formatValue(value)}`)
    }
    if (lines.length === 0) return
    if (out.length > 0) out.push('')
    if (title !== null && comments !== 'none') out.push(`# ${RULE} ${title} ${RULE}`)
    out.push(...lines)
  }

  const groupNames = new Set(schema.groups.map((g) => g.name))
  section(
    null,
    schema.variables.filter((v) => v.group === null || !groupNames.has(v.group)),
  )
  for (const g of schema.groups) {
    section(
      g.name,
      schema.variables.filter((v) => v.group === g.name),
    )
  }

  if (extras.length > 0) {
    if (out.length > 0) out.push('')
    if (comments !== 'none') out.push(`# ${RULE} Not in schema ${RULE}`)
    for (const e of extras) out.push(`${e.key}=${formatValue(e.value)}`)
  }

  return out.length > 0 ? `${out.join('\n')}\n` : ''
}

export interface NormalizeOptions extends Omit<GenerateOptions, 'extras'> {
  /** Keep keys that are not in the schema (default true). */
  keepExtras?: boolean
  /** Fill missing keys with the schema default value (default false). */
  fillDefaults?: boolean
}

/**
 * Rewrite an existing env file into canonical order: declared keys follow the
 * schema, missing keys are added (empty or with defaults), duplicates collapse
 * to their effective value and unknown keys move to the end.
 */
export function normalizeEnv(schema: EnvSchema, env: EnvFile, options: NormalizeOptions = {}): string {
  const { keepExtras = true, fillDefaults = false, ...rest } = options
  const map = envToMap(env)
  const declared = new Set(schema.variables.map((v) => v.key))
  const values = new Map<string, string>()
  for (const v of schema.variables) {
    const current = map.get(v.key)
    values.set(v.key, current !== undefined && current !== '' ? current : fillDefaults ? v.default : (current ?? ''))
  }
  const extras: { key: string; value: string }[] = []
  if (keepExtras) {
    for (const [key, value] of map) if (!declared.has(key)) extras.push({ key, value })
  }
  return generateEnv(schema, values, { ...rest, extras })
}

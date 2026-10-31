import type { TypeSpec, VariableDef } from './types'

export type IssueCode =
  | 'missing'
  | 'type'
  | 'min'
  | 'max'
  | 'minLength'
  | 'maxLength'
  | 'pattern'
  | 'startsWith'
  | 'endsWith'
  | 'enum'
  | 'protocol'

export interface ValueIssue {
  code: IssueCode
  message: string
}

const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/
const INTEGER_RE = /^[+-]?\d+$/
const BOOLEAN_RE = /^(true|false|1|0|yes|no|on|off)$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const BOOLEAN_VALUES = ['true', 'false', '1', '0', 'yes', 'no', 'on', 'off']

/**
 * Validate a raw string value against a variable definition.
 * `undefined` and the empty string both count as "not set".
 */
export function validateValue(
  def: Pick<VariableDef, 'required' | 'type'>,
  value: string | undefined,
): ValueIssue[] {
  if (value === undefined || value === '') {
    return def.required ? [{ code: 'missing', message: 'Required value is not set' }] : []
  }
  return checkType(def.type, value)
}

function checkType(type: TypeSpec, value: string): ValueIssue[] {
  const issues: ValueIssue[] = []
  switch (type.name) {
    case 'string': {
      const len = [...value].length
      if (type.minLength !== undefined && len < type.minLength) {
        issues.push({ code: 'minLength', message: `Must be at least ${type.minLength} characters (got ${len})` })
      }
      if (type.maxLength !== undefined && len > type.maxLength) {
        issues.push({ code: 'maxLength', message: `Must be at most ${type.maxLength} characters (got ${len})` })
      }
      if (type.pattern !== undefined) {
        let re: RegExp | null = null
        try {
          re = new RegExp(type.pattern)
        } catch {
          // Invalid patterns are reported when parsing the schema.
        }
        if (re && !re.test(value)) {
          issues.push({ code: 'pattern', message: `Must match /${type.pattern}/` })
        }
      }
      if (type.startsWith !== undefined && !value.startsWith(type.startsWith)) {
        issues.push({ code: 'startsWith', message: `Must start with "${type.startsWith}"` })
      }
      if (type.endsWith !== undefined && !value.endsWith(type.endsWith)) {
        issues.push({ code: 'endsWith', message: `Must end with "${type.endsWith}"` })
      }
      break
    }
    case 'number':
    case 'integer':
    case 'port': {
      const isInt = type.name !== 'number'
      if (!(isInt ? INTEGER_RE : NUMBER_RE).test(value.trim())) {
        const what = type.name === 'number' ? 'a number' : type.name === 'port' ? 'a port number' : 'an integer'
        issues.push({ code: 'type', message: `Must be ${what}` })
        break
      }
      const n = Number(value)
      const min = type.min ?? (type.name === 'port' ? 1 : undefined)
      const max = type.max ?? (type.name === 'port' ? 65535 : undefined)
      if (min !== undefined && n < min) issues.push({ code: 'min', message: `Must be ≥ ${min}` })
      if (max !== undefined && n > max) issues.push({ code: 'max', message: `Must be ≤ ${max}` })
      break
    }
    case 'boolean':
      if (!BOOLEAN_RE.test(value.trim())) {
        issues.push({ code: 'type', message: 'Must be a boolean (true/false, 1/0, yes/no, on/off)' })
      }
      break
    case 'enum':
      if (!type.values.includes(value)) {
        issues.push({ code: 'enum', message: `Must be one of: ${type.values.join(', ')}` })
      }
      break
    case 'url': {
      let url: URL | null = null
      try {
        url = new URL(value)
      } catch {
        issues.push({ code: 'type', message: 'Must be a valid URL' })
      }
      if (url && type.protocols && type.protocols.length > 0) {
        const proto = url.protocol.replace(/:$/, '').toLowerCase()
        if (!type.protocols.includes(proto)) {
          issues.push({ code: 'protocol', message: `Protocol must be ${type.protocols.join(' or ')} (got ${proto})` })
        }
      }
      break
    }
    case 'email':
      if (!EMAIL_RE.test(value)) issues.push({ code: 'type', message: 'Must be a valid email address' })
      break
    case 'uuid':
      if (!UUID_RE.test(value)) issues.push({ code: 'type', message: 'Must be a UUID' })
      break
    case 'json':
      try {
        JSON.parse(value)
      } catch {
        issues.push({ code: 'type', message: 'Must be valid JSON' })
      }
      break
  }
  return issues
}

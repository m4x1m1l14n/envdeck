import { parseCallExpr, quoteArg } from './decorators'
import { TYPE_NAMES, type TypeName, type TypeSpec } from './types'

const ALIASES: Record<string, TypeName> = {
  int: 'integer',
  str: 'string',
  bool: 'boolean',
  float: 'number',
}

/** Parse the value of a `@type=` decorator. Returns warnings for anything ignored. */
export function parseTypeSpec(expr: string): { type: TypeSpec; warnings: string[] } {
  const warnings: string[] = []
  const call = parseCallExpr(expr)
  if (!call) {
    return { type: { name: 'string' }, warnings: [`Invalid type expression "${expr}", using string`] }
  }

  const rawName = call.name.toLowerCase()
  let name = (ALIASES[rawName] ?? rawName) as TypeName
  if (!TYPE_NAMES.includes(name)) {
    return { type: { name: 'string' }, warnings: [`Unknown type "${call.name}", using string`] }
  }

  const { named, positional } = call
  const used = new Set<string>()
  const num = (k: string): number | undefined => {
    const v = named[k]
    if (v === undefined) return undefined
    used.add(k)
    const n = Number(v)
    if (v.trim() === '' || !Number.isFinite(n)) {
      warnings.push(`${name}: ${k}=${v} is not a number`)
      return undefined
    }
    return n
  }
  const str = (k: string): string | undefined => {
    const v = named[k]
    if (v !== undefined) used.add(k)
    return v
  }

  // varlock compatibility: number(isInt=true) is an integer.
  if (name === 'number' && named.isInt !== undefined) {
    used.add('isInt')
    if (named.isInt === 'true') name = 'integer'
  }

  let type: TypeSpec
  switch (name) {
    case 'string':
      type = clean({
        name,
        minLength: num('minLength'),
        maxLength: num('maxLength'),
        pattern: str('pattern'),
        startsWith: str('startsWith'),
        endsWith: str('endsWith'),
      })
      if (type.pattern !== undefined) {
        try {
          new RegExp(type.pattern)
        } catch {
          warnings.push(`string: pattern "${type.pattern}" is not a valid regular expression`)
          delete type.pattern
        }
      }
      break
    case 'number':
    case 'integer':
    case 'port':
      type = clean({ name, min: num('min'), max: num('max') })
      break
    case 'enum': {
      const values = positional.filter((v) => v !== '')
      if (values.length === 0) warnings.push('enum: no values given')
      type = { name, values }
      positional.length = 0
      break
    }
    case 'url': {
      const p = str('protocols')
      type = clean({
        name,
        protocols: p
          ?.split(/[,|\s]+/)
          .map((x) => x.trim().replace(/:$/, '').toLowerCase())
          .filter(Boolean),
      })
      break
    }
    default:
      type = { name }
  }

  for (const k of Object.keys(named)) {
    if (!used.has(k)) warnings.push(`${name}: unknown option "${k}"`)
  }
  if (positional.length > 0) warnings.push(`${name}: unexpected arguments ${positional.join(', ')}`)
  if ('min' in type && 'max' in type && type.min !== undefined && type.max !== undefined && type.min > type.max) {
    warnings.push(`${name}: min (${type.min}) is greater than max (${type.max})`)
  }
  if (
    type.name === 'string' &&
    type.minLength !== undefined &&
    type.maxLength !== undefined &&
    type.minLength > type.maxLength
  ) {
    warnings.push(`string: minLength (${type.minLength}) is greater than maxLength (${type.maxLength})`)
  }

  return { type, warnings }
}

/** Format a type spec back into its canonical `@type=` value. */
export function formatTypeSpec(type: TypeSpec): string {
  const args: string[] = []
  switch (type.name) {
    case 'string':
      if (type.minLength !== undefined) args.push(`minLength=${type.minLength}`)
      if (type.maxLength !== undefined) args.push(`maxLength=${type.maxLength}`)
      if (type.pattern !== undefined) args.push(`pattern="${type.pattern.replace(/"/g, '\\"')}"`)
      if (type.startsWith !== undefined) args.push(`startsWith=${quoteArg(type.startsWith)}`)
      if (type.endsWith !== undefined) args.push(`endsWith=${quoteArg(type.endsWith)}`)
      break
    case 'number':
    case 'integer':
    case 'port':
      if (type.min !== undefined) args.push(`min=${type.min}`)
      if (type.max !== undefined) args.push(`max=${type.max}`)
      break
    case 'enum':
      args.push(...type.values.map(quoteArg))
      break
    case 'url':
      if (type.protocols && type.protocols.length > 0) {
        args.push(`protocols=${quoteArg(type.protocols.join(','))}`)
      }
      break
  }
  return args.length > 0 ? `${type.name}(${args.join(', ')})` : type.name
}

/** Human readable summary of the constraints, e.g. "int · 1–100". */
export function describeType(type: TypeSpec): string {
  const parts: string[] = [type.name]
  switch (type.name) {
    case 'string': {
      const { minLength: a, maxLength: b } = type
      if (a !== undefined && b !== undefined) parts.push(a === b ? `len ${a}` : `len ${a}–${b}`)
      else if (a !== undefined) parts.push(`len ≥ ${a}`)
      else if (b !== undefined) parts.push(`len ≤ ${b}`)
      if (type.pattern) parts.push(`/${type.pattern}/`)
      if (type.startsWith) parts.push(`${type.startsWith}…`)
      if (type.endsWith) parts.push(`…${type.endsWith}`)
      break
    }
    case 'number':
    case 'integer':
    case 'port': {
      const { min: a, max: b } = type
      if (a !== undefined && b !== undefined) parts.push(`${a}–${b}`)
      else if (a !== undefined) parts.push(`≥ ${a}`)
      else if (b !== undefined) parts.push(`≤ ${b}`)
      break
    }
    case 'enum':
      parts.push(type.values.join(' | '))
      break
    case 'url':
      if (type.protocols?.length) parts.push(type.protocols.join('/'))
      break
  }
  return parts.join(' · ')
}

/** Drop keys whose value is undefined so specs compare and serialize cleanly. */
function clean<T extends object>(obj: T): T {
  for (const k of Object.keys(obj) as (keyof T)[]) {
    if (obj[k] === undefined) delete obj[k]
  }
  return obj
}

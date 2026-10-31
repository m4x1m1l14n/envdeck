import { isDecoratorLine, parseDecoratorLine, parseCallExpr, quoteArg, unquote } from './decorators'
import { formatValue, lex, type LexLine } from './lex'
import { formatTypeSpec, parseTypeSpec } from './typespec'
import { validateValue } from './validate'
import type { Diagnostic, EnvSchema, GroupDef, SchemaParseResult, VariableDef } from './types'

type CommentLine = Extract<LexLine, { kind: 'comment' }>

/** A comment line made only of decoration characters, e.g. `# ----` or `# ━━━━`. */
const RULE_RE = /^[\s\-=_*~#+━─═┄┈•·]{3,}$/
const GROUP_RE = /@group(?:\s*=\s*|\s+)(.+)$/
const DECORATION_TRIM_RE = /^[\s\-=_*~#+━─═┄┈•·]+|[\s\-=_*~#+━─═┄┈•·]+$/g

const RULE = '━'.repeat(48)

const KNOWN_VARIABLE_DECORATORS = new Set([
  'required',
  'optional',
  'sensitive',
  'secret',
  'type',
  'example',
  'docs',
])

function isRule(c: CommentLine): boolean {
  return RULE_RE.test(c.text)
}

function groupName(c: CommentLine): string | null {
  if (!c.text.includes('@group')) return null
  const m = GROUP_RE.exec(c.text)
  if (!m) return null
  const name = unquote((m[1] as string).replace(DECORATION_TRIM_RE, ''))
  return name === '' ? null : name
}

/** Parse an annotated `.env.example` into a schema. */
export function parseSchema(text: string): SchemaParseResult {
  const { lines, diagnostics } = lex(text)
  const schema: EnvSchema = { description: '', defaultRequired: true, groups: [], variables: [] }
  const seenKeys = new Map<string, number>()
  let currentGroup: string | null = null
  let block: CommentLine[] = []
  let headerDone = false

  const ensureGroup = (name: string, description: string) => {
    const existing = schema.groups.find((g) => g.name === name)
    if (existing) {
      if (description && !existing.description) existing.description = description
    } else {
      schema.groups.push({ name, description })
    }
    currentGroup = name
  }

  /**
   * Consume group headers in a comment block. Returns the comment lines that
   * remain for the following variable (if any).
   */
  const consumeGroups = (lines: CommentLine[], attached: boolean): CommentLine[] => {
    let idx = lines.findIndex((c) => groupName(c) !== null)
    if (idx < 0) return lines
    let rest = lines
    while (idx >= 0) {
      const name = groupName(rest[idx] as CommentLine) as string
      const after = rest.slice(idx + 1)
      const ruleAt = after.findIndex((c) => isRule(c) || groupName(c) !== null)
      let descLines: CommentLine[]
      if (ruleAt >= 0) {
        descLines = after.slice(0, ruleAt)
        rest = isRule(after[ruleAt] as CommentLine) ? after.slice(ruleAt + 1) : after.slice(ruleAt)
      } else if (attached) {
        // No closing rule: the comment lines belong to the variable below.
        descLines = []
        rest = after
      } else {
        descLines = after
        rest = []
      }
      ensureGroup(name, joinDescription(descLines.filter((c) => !isDecoratorLine(c.text))))
      idx = rest.findIndex((c) => groupName(c) !== null)
    }
    return rest
  }

  const flushDetached = () => {
    if (block.length === 0) return
    const hasGroup = block.some((c) => groupName(c) !== null)
    if (!headerDone && !hasGroup && schema.variables.length === 0) {
      parseHeader(block, schema, diagnostics)
    } else if (hasGroup) {
      consumeGroups(block, false)
    }
    // Any other free-standing comment is not part of the schema and is dropped.
    headerDone = true
    block = []
  }

  for (const line of lines) {
    if (line.kind === 'comment') {
      block.push(line)
      continue
    }
    if (line.kind === 'blank') {
      flushDetached()
      continue
    }

    // Assignment: the comment block directly above documents this variable.
    headerDone = true
    const doc = consumeGroups(block, true)
    block = []

    const docLines = doc.filter((c) => !isRule(c))
    if (line.comment) docLines.push({ kind: 'comment', text: line.comment, line: line.line })

    const v = buildVariable(line.key, line.value, line.line, docLines, currentGroup, schema, diagnostics)

    const first = seenKeys.get(v.key)
    if (first !== undefined) {
      diagnostics.push({
        severity: 'error',
        line: line.line,
        key: v.key,
        message: `Duplicate variable ${v.key} (first defined on line ${first})`,
      })
      continue
    }
    seenKeys.set(v.key, line.line)
    schema.variables.push(v)
  }
  flushDetached()

  for (const v of schema.variables) lintVariable(v, diagnostics)

  diagnostics.sort((a, b) => a.line - b.line)
  return { schema, diagnostics }
}

function parseHeader(block: CommentLine[], schema: EnvSchema, diagnostics: Diagnostic[]) {
  const descLines: CommentLine[] = []
  for (const c of block) {
    if (isRule(c)) continue
    if (!isDecoratorLine(c.text)) {
      descLines.push(c)
      continue
    }
    const { decorators, errors } = parseDecoratorLine(c.text)
    for (const e of errors) diagnostics.push({ severity: 'warning', line: c.line, message: e })
    for (const d of decorators) {
      if (d.name === 'defaultRequired') {
        schema.defaultRequired = d.value === null || d.value === 'true'
      } else {
        diagnostics.push({
          severity: 'warning',
          line: c.line,
          message: `Unknown header decorator @${d.name}`,
        })
      }
    }
  }
  schema.description = joinDescription(descLines)
}

function buildVariable(
  key: string,
  value: string,
  line: number,
  docLines: CommentLine[],
  group: string | null,
  schema: EnvSchema,
  diagnostics: Diagnostic[],
): VariableDef {
  const v: VariableDef = {
    key,
    description: '',
    group,
    required: schema.defaultRequired,
    sensitive: false,
    type: { name: 'string' },
    default: value,
    line,
  }
  const desc: CommentLine[] = []
  let requiredSet: { value: boolean; line: number } | null = null

  for (const c of docLines) {
    if (!isDecoratorLine(c.text)) {
      desc.push(c)
      continue
    }
    const { decorators, errors } = parseDecoratorLine(c.text)
    for (const e of errors) diagnostics.push({ severity: 'warning', line: c.line, key, message: e })
    for (const d of decorators) {
      const flag = d.value === null || d.value === 'true'
      switch (d.name) {
        case 'required':
        case 'optional': {
          const req = d.name === 'required' ? flag : !flag
          if (requiredSet && requiredSet.value !== req) {
            diagnostics.push({
              severity: 'warning',
              line: c.line,
              key,
              message: `${key} is marked both @required and @optional; the last one wins`,
            })
          }
          requiredSet = { value: req, line: c.line }
          v.required = req
          break
        }
        case 'sensitive':
        case 'secret':
          v.sensitive = flag
          break
        case 'type': {
          if (!d.value) {
            diagnostics.push({ severity: 'warning', line: c.line, key, message: '@type needs a value' })
            break
          }
          const { type, warnings } = parseTypeSpec(d.value)
          v.type = type
          for (const w of warnings) diagnostics.push({ severity: 'warning', line: c.line, key, message: w })
          break
        }
        case 'example':
          if (d.value !== null) v.example = d.value
          break
        case 'docs': {
          // Accept both @docs=url and @docs("label", url) — the URL is the last argument.
          const call = d.value ? parseCallExpr(`docs(${d.value})`) : null
          const url = call?.positional.at(-1) ?? (d.value ? unquote(d.value) : undefined)
          if (url) v.docs = url
          break
        }
        default:
          if (!KNOWN_VARIABLE_DECORATORS.has(d.name)) {
            diagnostics.push({
              severity: 'warning',
              line: c.line,
              key,
              message: `Unknown decorator @${d.name}`,
            })
          }
      }
    }
  }
  v.description = joinDescription(desc)
  return v
}

function lintVariable(v: VariableDef, diagnostics: Diagnostic[]) {
  if (v.sensitive && v.default !== '') {
    diagnostics.push({
      severity: 'warning',
      line: v.line,
      key: v.key,
      message: `${v.key} is @sensitive but has a value in the example file; leave it empty`,
    })
  }
  if (v.default !== '') {
    for (const issue of validateValue(v, v.default)) {
      diagnostics.push({
        severity: 'warning',
        line: v.line,
        key: v.key,
        message: `Default value of ${v.key} does not pass its own rules: ${issue.message}`,
      })
    }
  }
}

function joinDescription(lines: CommentLine[]): string {
  return lines
    .map((c) => c.text.trimEnd())
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
}

/** The order variables appear in a canonical file: ungrouped first, then groups in order. */
export function canonicalOrder(schema: EnvSchema): VariableDef[] {
  const out = schema.variables.filter((v) => v.group === null || !schema.groups.some((g) => g.name === v.group))
  for (const g of schema.groups) out.push(...schema.variables.filter((v) => v.group === g.name))
  return out
}

export function decoratorLine(v: VariableDef): string {
  const parts = [v.required ? '@required' : '@optional']
  if (v.sensitive) parts.push('@sensitive')
  parts.push(`@type=${formatTypeSpec(v.type)}`)
  if (v.example !== undefined && v.example !== '') parts.push(`@example=${quoteArg(v.example)}`)
  if (v.docs) parts.push(`@docs=${quoteArg(v.docs)}`)
  return parts.join(' ')
}

function commentLines(text: string): string[] {
  if (!text) return []
  return text.split('\n').map((l) => (l.trim() === '' ? '#' : `# ${l}`))
}

export function groupHeader(group: GroupDef): string[] {
  return [`# ${RULE}`, `# @group ${group.name}`, ...commentLines(group.description), `# ${RULE}`]
}

/** Serialize a schema into a canonical, annotated `.env.example`. */
export function serializeSchema(schema: EnvSchema): string {
  const out: string[] = []
  const header = commentLines(schema.description)
  if (!schema.defaultRequired) header.push('# @defaultRequired=false')
  if (header.length > 0) out.push(...header, '')

  const writeVar = (v: VariableDef) => {
    out.push(...commentLines(v.description), `# ${decoratorLine(v)}`, `${v.key}=${formatValue(v.default)}`, '')
  }

  const groupNames = new Set(schema.groups.map((g) => g.name))
  for (const v of schema.variables) {
    if (v.group === null || !groupNames.has(v.group)) writeVar(v)
  }
  for (const g of schema.groups) {
    out.push(...groupHeader(g), '')
    for (const v of schema.variables) if (v.group === g.name) writeVar(v)
  }

  while (out.length > 0 && out[out.length - 1] === '') out.pop()
  return `${out.join('\n')}\n`
}

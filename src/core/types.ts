/**
 * Core data model for EnvDeck.
 *
 * The annotated `.env.example` is the single source of truth. Parsing it yields
 * an `EnvSchema`; serializing an `EnvSchema` yields a canonical `.env.example`.
 */

export type TypeName =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'enum'
  | 'url'
  | 'email'
  | 'port'
  | 'uuid'
  | 'json'

export const TYPE_NAMES: readonly TypeName[] = [
  'string',
  'number',
  'integer',
  'boolean',
  'enum',
  'url',
  'email',
  'port',
  'uuid',
  'json',
]

export interface StringType {
  name: 'string'
  minLength?: number
  maxLength?: number
  pattern?: string
  startsWith?: string
  endsWith?: string
}

export interface NumberType {
  name: 'number' | 'integer' | 'port'
  min?: number
  max?: number
}

export interface EnumType {
  name: 'enum'
  values: string[]
}

export interface UrlType {
  name: 'url'
  protocols?: string[]
}

export interface SimpleType {
  name: 'boolean' | 'email' | 'uuid' | 'json'
}

export type TypeSpec = StringType | NumberType | EnumType | UrlType | SimpleType

export interface VariableDef {
  key: string
  /** Free-form description, may span several lines. */
  description: string
  /** Group name, or null for variables before the first group header. */
  group: string | null
  required: boolean
  sensitive: boolean
  type: TypeSpec
  /** The value written in `.env.example` — acts as default / placeholder. */
  default: string
  /** Example shown as a hint when filling in a value. */
  example?: string
  /** Link to documentation. */
  docs?: string
  /** 1-based line of the `KEY=value` assignment in the source (0 when built in the UI). */
  line: number
}

export interface GroupDef {
  name: string
  description: string
}

export interface EnvSchema {
  /** File-level description from the header block. */
  description: string
  /** Whether variables without @required/@optional are required. Defaults to true. */
  defaultRequired: boolean
  groups: GroupDef[]
  variables: VariableDef[]
}

export type Severity = 'error' | 'warning'

export interface Diagnostic {
  severity: Severity
  line: number
  message: string
  key?: string
}

export interface SchemaParseResult {
  schema: EnvSchema
  diagnostics: Diagnostic[]
}

export interface EnvEntry {
  key: string
  value: string
  line: number
}

export interface EnvFile {
  entries: EnvEntry[]
  diagnostics: Diagnostic[]
}

export function emptySchema(): EnvSchema {
  return { description: '', defaultRequired: true, groups: [], variables: [] }
}

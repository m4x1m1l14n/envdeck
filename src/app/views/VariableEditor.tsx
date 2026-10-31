import { useMemo, useState, type ReactNode } from 'react'
import { Trash2, X } from 'lucide-react'
import {
  decoratorLine,
  formatValue,
  newVariable,
  removeVariable,
  TYPE_NAMES,
  upsertVariable,
  validateKey,
  validateValue,
  type TypeName,
  type TypeSpec,
  type VariableDef,
} from '../../core'
import { CodeView } from '../components/CodeView'
import { Button, Field, Modal, Segmented, Switch } from '../components/ui'
import { useSchema, useStore } from '../store'

const NEW_GROUP = '__new__'
const NO_GROUP = '__none__'

/** Default constraint shape when switching to a type. */
function blankType(name: TypeName, prev: TypeSpec): TypeSpec {
  if (name === prev.name) return prev
  switch (name) {
    case 'enum':
      return { name, values: [] }
    case 'string':
    case 'number':
    case 'integer':
    case 'port':
    case 'url':
      return { name } as TypeSpec
    default:
      return { name }
  }
}

function toNum(s: string): number | undefined {
  if (s.trim() === '') return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

interface Props {
  variable: VariableDef | null
  initialGroup: string | null
  onClose(): void
}

export function VariableEditor({ variable, initialGroup, onClose }: Props) {
  const schema = useSchema()
  const commit = useStore((s) => s.commit)
  const [v, setV] = useState<VariableDef>(() => variable ?? newVariable('', initialGroup))
  const [newGroup, setNewGroup] = useState('')
  const [groupChoice, setGroupChoice] = useState<string>(v.group ?? NO_GROUP)
  const [touched, setTouched] = useState(false)

  const patch = (p: Partial<VariableDef>) => setV((cur) => ({ ...cur, ...p }))
  const patchType = (p: Partial<TypeSpec>) => setV((cur) => ({ ...cur, type: { ...cur.type, ...p } as TypeSpec }))

  const keyError = validateKey(schema, v.key, variable?.key)
  const groupName = groupChoice === NEW_GROUP ? newGroup.trim() : groupChoice === NO_GROUP ? null : groupChoice
  const groupError = groupChoice === NEW_GROUP && groupName === '' ? 'Enter a group name' : null
  const defaultIssues = useMemo(() => (v.default === '' ? [] : validateValue(v, v.default)), [v])
  const final: VariableDef = { ...v, group: groupName }
  const canSave = !keyError && !groupError

  const save = () => {
    setTouched(true)
    if (!canSave) return
    commit(upsertVariable(schema, cleanType(final), variable?.key))
    onClose()
  }

  const preview = [
    ...(final.description ? final.description.split('\n').map((l) => (l.trim() ? `# ${l}` : '#')) : []),
    `# ${decoratorLine(cleanType(final))}`,
    `${final.key || 'KEY'}=${formatValue(final.default)}`,
  ].join('\n')

  return (
    <Modal
      open
      wide
      kicker={variable ? 'Edit variable' : 'New variable'}
      title={variable ? variable.key : 'Define variable'}
      onClose={onClose}
      footer={
        <>
          {variable && (
            <Button
              variant="danger"
              icon={<Trash2 size={14} />}
              className="mr-auto"
              onClick={() => {
                commit(removeVariable(schema, variable.key))
                onClose()
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={touched && !canSave}>
            {variable ? 'Save' : 'Add variable'}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="var-key" error={touched || v.key ? keyError : null} hint="UPPER_SNAKE_CASE">
              <input
                id="var-key"
                className="input font-mono uppercase"
                autoComplete="off"
                spellCheck={false}
                value={v.key}
                aria-invalid={!!(touched && keyError)}
                placeholder="DATABASE_URL"
                onChange={(e) => patch({ key: e.target.value.toUpperCase().replace(/[\s-]+/g, '_') })}
              />
            </Field>
            <Field label="Group" htmlFor="var-group" error={touched ? groupError : null}>
              <div className="flex gap-2">
                <select id="var-group" className="input" value={groupChoice} onChange={(e) => setGroupChoice(e.target.value)}>
                  <option value={NO_GROUP}>— Ungrouped —</option>
                  {schema.groups.map((g) => (
                    <option key={g.name} value={g.name}>
                      {g.name}
                    </option>
                  ))}
                  <option value={NEW_GROUP}>+ New group…</option>
                </select>
                {groupChoice === NEW_GROUP && (
                  <input
                    aria-label="New group name"
                    className="input"
                    autoFocus
                    placeholder="Group name"
                    value={newGroup}
                    onChange={(e) => setNewGroup(e.target.value)}
                  />
                )}
              </div>
            </Field>
          </div>

          <Field label="Description" htmlFor="var-desc">
            <textarea
              id="var-desc"
              rows={2}
              className="input resize-y"
              value={v.description}
              placeholder="What is this for? How do I get a value?"
              onChange={(e) => patch({ description: e.target.value })}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Switch
              checked={v.required}
              onChange={(required) => patch({ required })}
              label="Required"
              description="Missing value fails validation"
            />
            <Switch
              checked={v.sensitive}
              onChange={(sensitive) => patch({ sensitive })}
              label="Sensitive"
              description="Masked in the UI; keep it out of the example"
            />
          </div>

          <Field label="Type">
            <Segmented
              ariaLabel="Type"
              size="sm"
              value={v.type.name}
              options={TYPE_NAMES.map((t) => ({ value: t, label: t }))}
              onChange={(name) => setV((cur) => ({ ...cur, type: blankType(name, cur.type) }))}
            />
          </Field>

          <TypeOptions type={v.type} patchType={patchType} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Default value"
              htmlFor="var-default"
              error={defaultIssues[0]?.message ?? null}
              hint={v.sensitive ? 'Leave empty for secrets' : 'Written into .env.example'}
            >
              <ValueInput id="var-default" v={v} value={v.default} onChange={(d) => patch({ default: d })} />
            </Field>
            <Field label="Example" htmlFor="var-example" hint="Shown as a hint when composing">
              <input id="var-example" className="input font-mono" value={v.example ?? ''} onChange={(e) => patch({ example: e.target.value || undefined })} />
            </Field>
          </div>

          <Field label="Docs URL" htmlFor="var-docs">
            <input id="var-docs" className="input font-mono" type="url" placeholder="https://…" value={v.docs ?? ''} onChange={(e) => patch({ docs: e.target.value || undefined })} />
          </Field>
          <button type="submit" className="hidden" />
        </div>

        <aside className="flex flex-col gap-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Writes</div>
          <div className="border border-line bg-surface py-2">
            <CodeView label="Variable preview" text={preview} wrap />
          </div>
          <p className="text-xs text-faint">
            Annotations are plain comments, so any dotenv loader still reads this file.
          </p>
        </aside>
      </form>
    </Modal>
  )
}

/** Drop empty constraint fields before saving. */
function cleanType(v: VariableDef): VariableDef {
  const t = { ...v.type } as Record<string, unknown>
  for (const k of Object.keys(t)) {
    if (t[k] === undefined || t[k] === '' || (Array.isArray(t[k]) && k === 'protocols' && (t[k] as unknown[]).length === 0)) delete t[k]
  }
  return { ...v, type: t as unknown as TypeSpec }
}

function TypeOptions({ type, patchType }: { type: TypeSpec; patchType(p: Partial<TypeSpec>): void }) {
  switch (type.name) {
    case 'string':
      return (
        <Grid>
          <NumField label="Min length" value={type.minLength} onChange={(minLength) => patchType({ minLength })} />
          <NumField label="Max length" value={type.maxLength} onChange={(maxLength) => patchType({ maxLength })} />
          <TextField label="Pattern (regex)" mono value={type.pattern} onChange={(pattern) => patchType({ pattern })} placeholder="^[a-z0-9]+$" error={regexError(type.pattern)} wide />
          <TextField label="Starts with" mono value={type.startsWith} onChange={(startsWith) => patchType({ startsWith })} placeholder="sk_" />
          <TextField label="Ends with" mono value={type.endsWith} onChange={(endsWith) => patchType({ endsWith })} />
        </Grid>
      )
    case 'number':
    case 'integer':
    case 'port':
      return (
        <Grid>
          <NumField label="Min" value={type.min} onChange={(min) => patchType({ min })} placeholder={type.name === 'port' ? '1' : ''} />
          <NumField label="Max" value={type.max} onChange={(max) => patchType({ max })} placeholder={type.name === 'port' ? '65535' : ''} />
        </Grid>
      )
    case 'enum':
      return <EnumValues values={type.values} onChange={(values) => patchType({ values })} />
    case 'url':
      return (
        <Grid>
          <TextField
            label="Allowed protocols"
            mono
            wide
            placeholder="https, postgres"
            value={type.protocols?.join(', ')}
            onChange={(p) =>
              patchType({
                protocols: p
                  ?.split(/[,\s|]+/)
                  .map((x) => x.replace(/:$/, '').toLowerCase())
                  .filter(Boolean),
              })
            }
          />
        </Grid>
      )
    default:
      return null
  }
}

function regexError(pattern?: string): string | null {
  if (!pattern) return null
  try {
    new RegExp(pattern)
    return null
  } catch (e) {
    return (e as Error).message
  }
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 border-l-2 border-accent/40 pl-4 sm:grid-cols-2">{children}</div>
}

function NumField({ label, value, onChange, placeholder }: { label: string; value?: number; onChange(n?: number): void; placeholder?: string }) {
  const [raw, setRaw] = useState(value?.toString() ?? '')
  const id = `num-${label.replace(/\W+/g, '-').toLowerCase()}`
  const bad = raw.trim() !== '' && toNum(raw) === undefined
  return (
    <Field label={label} htmlFor={id} error={bad ? 'Not a number' : null}>
      <input
        id={id}
        className="input font-mono"
        inputMode="decimal"
        value={raw}
        placeholder={placeholder}
        aria-invalid={bad}
        onChange={(e) => {
          setRaw(e.target.value)
          onChange(toNum(e.target.value))
        }}
      />
    </Field>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  mono,
  error,
  wide,
}: {
  label: string
  value?: string
  onChange(v?: string): void
  placeholder?: string
  mono?: boolean
  error?: string | null
  wide?: boolean
}) {
  const id = `txt-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <Field label={label} htmlFor={id} error={error} className={wide ? 'sm:col-span-2' : undefined}>
      <input
        id={id}
        className={`input ${mono ? 'font-mono' : ''}`}
        value={value ?? ''}
        placeholder={placeholder}
        aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
      />
    </Field>
  )
}

function EnumValues({ values, onChange }: { values: string[]; onChange(v: string[]): void }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const parts = draft.split(',').map((s) => s.trim()).filter((s) => s && !values.includes(s))
    if (parts.length) onChange([...values, ...parts])
    setDraft('')
  }
  return (
    <div className="border-l-2 border-accent/40 pl-4">
      <Field label="Allowed values" htmlFor="enum-add" hint="Enter or comma to add" error={values.length === 0 ? 'Add at least one value' : null}>
        <div className="flex flex-wrap items-center gap-1.5 border border-line bg-surface-2 p-1.5">
          {values.map((val) => (
            <span key={val} className="inline-flex items-center gap-1 border border-accent/50 bg-accent/10 px-2 py-0.5 font-mono text-xs text-accent">
              {val}
              <button type="button" aria-label={`Remove ${val}`} className="cursor-pointer hover:text-bad" onClick={() => onChange(values.filter((x) => x !== val))}>
                <X size={11} />
              </button>
            </span>
          ))}
          <input
            id="enum-add"
            className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 font-mono text-sm outline-none"
            value={draft}
            placeholder="development"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                add()
              } else if (e.key === 'Backspace' && draft === '' && values.length) {
                onChange(values.slice(0, -1))
              }
            }}
            onBlur={add}
          />
        </div>
      </Field>
    </div>
  )
}

/** Input adapted to the variable's type: select for enum/boolean, text otherwise. */
export function ValueInput({
  id,
  v,
  value,
  onChange,
  invalid,
  reveal = true,
  placeholder,
}: {
  id: string
  v: Pick<VariableDef, 'type' | 'required' | 'sensitive' | 'key'>
  value: string
  onChange(value: string): void
  invalid?: boolean
  reveal?: boolean
  placeholder?: string
}) {
  if (v.type.name === 'enum' || v.type.name === 'boolean') {
    const options = v.type.name === 'enum' ? v.type.values : ['true', 'false']
    const known = options.includes(value) || value === ''
    return (
      <select id={id} className="input font-mono" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid}>
        <option value="">{v.required ? '— select —' : '— unset —'}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {!known && <option value={value}>{value}</option>}
      </select>
    )
  }
  if (v.type.name === 'json') {
    return (
      <textarea id={id} rows={3} spellCheck={false} className="input resize-y font-mono text-xs" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} />
    )
  }
  return (
    <input
      id={id}
      className="input font-mono"
      type={v.sensitive && !reveal ? 'password' : 'text'}
      autoComplete="off"
      spellCheck={false}
      inputMode={v.type.name === 'integer' || v.type.name === 'port' ? 'numeric' : v.type.name === 'number' ? 'decimal' : undefined}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={invalid}
    />
  )
}

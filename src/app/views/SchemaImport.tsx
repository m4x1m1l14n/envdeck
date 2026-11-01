import { useMemo, useState, type ReactNode } from 'react'
import { ArrowRight, CircleCheck, FileUp, Minus, Pencil, Plus, TriangleAlert } from 'lucide-react'
import {
  diffSchemas,
  formatTypeSpec,
  parseSchema,
  suggestRenames,
  validateValue,
  type EnvSchema,
  type VariableChange,
  type VariableDef,
  type VariableField,
} from '../../core'
import { toast } from '../components/Toaster'
import { Button, Chip, cx, Modal } from '../components/ui'
import { effectiveValues, problemCount, renameValues, strayKeys } from '../lib/project'
import { useActiveProject, useStore, type Environment } from '../store'

export interface PendingImport {
  name: string
  text: string
}

const FIELD_LABELS: Record<VariableField, string> = {
  type: 'type',
  required: 'required',
  sensitive: 'sensitive',
  default: 'default',
  group: 'group',
  description: 'description',
  example: 'example',
  docs: 'docs',
}

/** Environments whose current value for `v` fails validation under `v`. */
function failing(envs: Environment[], schema: EnvSchema, v: VariableDef): Environment[] {
  return envs.filter((e) => validateValue(v, effectiveValues(schema, e)[v.key]).length > 0)
}

const envList = (envs: Environment[]) => envs.map((e) => e.name).join(', ')

/** Review what re-importing a `.env.example` changes before replacing the project's schema. */
export function SchemaImportModal({ pending, onClose }: { pending: PendingImport; onClose(): void }) {
  const project = useActiveProject()
  const importSchemaText = useStore((s) => s.importSchemaText)
  const setEnvValues = useStore((s) => s.setEnvValues)
  const before = project?.schema
  const envs = project?.environments ?? []

  const parsed = useMemo(() => parseSchema(pending.text), [pending.text])
  const diff = useMemo(() => (before ? diffSchemas(before, parsed.schema) : null), [before, parsed.schema])
  const errors = parsed.diagnostics.filter((d) => d.severity === 'error')
  // new key → old key, for values to carry over to a renamed variable
  const [renames, setRenames] = useState<Record<string, string>>(() => (diff ? suggestRenames(diff) : {}))
  const setRename = (to: string, from: string) =>
    setRenames((r) => {
      const { [to]: _, ...rest } = r
      return from === '' ? rest : { ...rest, [to]: from }
    })

  if (!before || !diff) return null
  const after = parsed.schema
  const envsAfter = envs.map((e) => ({ ...e, values: renameValues(e.values, renames) }))
  const renamedTo = new Map(Object.entries(renames).map(([to, from]) => [from, to]))
  const holds = (e: Environment, key: string) => Object.prototype.hasOwnProperty.call(e.values, key)

  const apply = () => {
    importSchemaText(pending.text)
    let moved = 0
    for (const e of envs) {
      const keys = Object.values(renames).filter((from) => holds(e, from))
      if (keys.length === 0) continue
      setEnvValues(e.id, renameValues(e.values, renames))
      moved += keys.length
    }
    const what = moved > 0 ? `, moved ${moved} value${moved === 1 ? '' : 's'}` : ''
    toast(
      errors.length > 0
        ? `Updated schema from ${pending.name} with ${errors.length} error(s) — see Issues`
        : `Updated schema from ${pending.name}${what}`,
      errors.length > 0 ? 'warn' : 'ok',
    )
    onClose()
  }

  const counts = [
    { n: diff.added.length, label: 'added', tone: 'text-ok' },
    { n: diff.changed.length, label: 'changed', tone: 'text-accent' },
    { n: diff.removed.length, label: 'removed', tone: 'text-bad' },
  ]

  const otherChanges = [
    ...diff.groups.added.map((g) => `New group ${g}`),
    ...diff.groups.removed.map((g) => `Group ${g} removed`),
    ...diff.groups.changed.map((g) => `Group ${g} description changed`),
    ...(diff.header ? ['File header changed'] : []),
    ...(diff.reordered ? ['Variables or groups reordered'] : []),
  ]

  return (
    <Modal
      open
      wide
      kicker={`Update schema · ${pending.name}`}
      title="Review changes"
      onClose={onClose}
      footer={
        diff.identical ? (
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" icon={<FileUp size={14} />} onClick={apply}>
              Apply changes
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-5" data-testid="schema-import">
        {diff.identical ? (
          <div className="flex items-center gap-3 border border-ok/40 bg-ok/5 px-4 py-3 text-sm">
            <CircleCheck size={18} className="shrink-0 text-ok" />
            <span>
              No changes — <span className="font-mono">{pending.name}</span> matches the schema of <strong>{project?.name}</strong>.
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs uppercase tracking-[0.15em]">
            {counts.map((c) => (
              <span key={c.label} className={c.n > 0 ? c.tone : 'text-faint'}>
                <span className="text-lg font-bold">{c.n}</span> {c.label}
              </span>
            ))}
            {otherChanges.length > 0 && (
              <span className="text-[11px] tracking-normal text-muted normal-case">{otherChanges.join(' · ')}</span>
            )}
          </div>
        )}

        {errors.length > 0 && (
          <Notice tone="bad">
            {errors.length} parse error(s) in {pending.name}: {errors.slice(0, 3).map((e) => `line ${e.line}: ${e.message}`).join('; ')}
            {errors.length > 3 && '…'}
          </Notice>
        )}

        {diff.added.length > 0 && (
          <Section title="Added" icon={<Plus size={14} />} tone="text-ok">
            {diff.added.map((v) => {
              const needs = failing(envsAfter, after, v)
              const from = renames[v.key] ?? ''
              const options = diff.removed.filter((r) => r.key === from || !renamedTo.has(r.key))
              return (
                <Row key={v.key} keyName={v.key} def={v}>
                  {envs.length > 0 && options.length > 0 && (
                    <label className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted">
                      renamed from
                      <select
                        aria-label={`${v.key} renamed from`}
                        value={from}
                        onChange={(e) => setRename(v.key, e.target.value)}
                        className="input w-auto! py-0.5! pr-6! pl-1.5! font-mono text-xs!"
                      >
                        <option value="">— new variable —</option>
                        {options.map((r) => (
                          <option key={r.key} value={r.key}>
                            {r.key}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {from !== '' && envs.some((e) => holds(e, from)) ? (
                    <Impact tone="ok">Values move from {from}</Impact>
                  ) : needs.length > 0 ? (
                    <Impact tone="warn">Needs a value in {envList(needs)}</Impact>
                  ) : envs.length > 0 && v.default !== '' ? (
                    <Impact>Environments get the default</Impact>
                  ) : null}
                </Row>
              )
            })}
          </Section>
        )}

        {diff.changed.length > 0 && (
          <Section title="Changed" icon={<Pencil size={13} />} tone="text-accent">
            {diff.changed.map((c) => (
              <ChangedRow key={c.key} change={c} envs={envs} before={before} after={after} />
            ))}
          </Section>
        )}

        {diff.removed.length > 0 && (
          <Section title="Removed" icon={<Minus size={14} />} tone="text-bad">
            {diff.removed.map((v) => {
              const holding = envs.filter((e) => holds(e, v.key))
              const to = renamedTo.get(v.key)
              return (
                <Row key={v.key} keyName={v.key} def={v} struck>
                  {to ? (
                    <Impact tone="ok">Renamed to {to}</Impact>
                  ) : (
                    holding.length > 0 && <Impact tone="warn">Value kept and flagged in {envList(holding)}</Impact>
                  )}
                </Row>
              )
            })}
          </Section>
        )}

        {diff.added.length > 0 && diff.removed.length > 0 && envs.length > 0 && Object.keys(renames).length < Math.min(diff.added.length, diff.removed.length) && (
          <Notice tone="muted">
            Renamed a variable? Pick the old name under <em>renamed from</em> and its stored values move to the new key in every
            environment.
          </Notice>
        )}

        {!diff.identical && envs.length > 0 && (
          <EnvironmentImpact envs={envs} envsAfter={envsAfter} before={before} after={after} />
        )}
      </div>
    </Modal>
  )
}

function Section({ title, icon, tone, children }: { title: string; icon: ReactNode; tone: string; children: ReactNode }) {
  return (
    <section>
      <h3 className={cx('mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em]', tone)}>
        {icon}
        {title}
      </h3>
      <ul className="divide-y divide-line border border-line bg-surface">{children}</ul>
    </section>
  )
}

function Row({ keyName, def, struck, children }: { keyName: string; def: VariableDef; struck?: boolean; children?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2" data-testid={`diff-${keyName}`}>
      <span className={cx('font-mono text-sm font-semibold break-all', struck && 'text-muted line-through')}>{keyName}</span>
      <Chip tone={def.required ? 'accent2' : 'muted'}>{def.required ? 'req' : 'opt'}</Chip>
      <Chip verbatim>{formatTypeSpec(def.type)}</Chip>
      {def.group && <span className="text-xs text-faint">in {def.group}</span>}
      {children && <span className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-1">{children}</span>}
    </li>
  )
}

function fieldText(v: VariableDef, field: VariableField): string {
  switch (field) {
    case 'type':
      return formatTypeSpec(v.type)
    case 'required':
      return v.required ? 'required' : 'optional'
    case 'sensitive':
      return v.sensitive ? 'sensitive' : 'not sensitive'
    case 'group':
      return v.group ?? '(no group)'
    case 'default':
      return v.default === '' ? '(empty)' : v.sensitive ? '••••' : v.default
    default:
      return ''
  }
}

function ChangedRow({
  change,
  envs,
  before,
  after,
}: {
  change: VariableChange
  envs: Environment[]
  before: EnvSchema
  after: EnvSchema
}) {
  const brokenBefore = new Set(failing(envs, before, change.before).map((e) => e.id))
  const broken = failing(envs, after, change.after).filter((e) => !brokenBefore.has(e.id))
  const textOnly: VariableField[] = ['description', 'example', 'docs']
  const detailed = change.fields.filter((f) => !textOnly.includes(f))
  const updated = change.fields.filter((f) => textOnly.includes(f))
  return (
    <li className="flex flex-col gap-1.5 px-3 py-2" data-testid={`diff-${change.key}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-sm font-semibold break-all">{change.key}</span>
        {updated.length > 0 && <span className="text-xs text-muted">{updated.map((f) => FIELD_LABELS[f]).join(', ')} updated</span>}
        {broken.length > 0 && (
          <span className="ml-auto">
            <Impact tone="bad">Becomes invalid in {envList(broken)}</Impact>
          </span>
        )}
      </div>
      {detailed.length > 0 && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          {detailed.map((f) => (
            <div key={f} className="contents">
              <dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-faint">{FIELD_LABELS[f]}</dt>
              <dd className="flex min-w-0 flex-wrap items-center gap-1.5 font-mono [overflow-wrap:anywhere]">
                <span className="text-muted line-through decoration-bad/60">{fieldText(change.before, f)}</span>
                <ArrowRight size={12} className="shrink-0 text-faint" />
                <span className="text-fg">{fieldText(change.after, f)}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  )
}

function EnvironmentImpact({
  envs,
  envsAfter,
  before,
  after,
}: {
  envs: Environment[]
  envsAfter: Environment[]
  before: EnvSchema
  after: EnvSchema
}) {
  return (
    <section>
      <h3 className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Environments after applying</h3>
      <ul className="flex flex-wrap gap-2">
        {envs.map((e, i) => {
          const was = problemCount(before, e)
          const next = envsAfter[i] ?? e
          const now = problemCount(after, next)
          const stray = strayKeys(after, next).length
          const ok = now === 0 && stray === 0
          return (
            <li
              key={e.id}
              data-testid={`impact-${e.name}`}
              className={cx('flex items-center gap-2 border px-3 py-1.5 text-xs', ok ? 'border-ok/40' : 'border-warn/50')}
            >
              <span className="font-semibold">{e.name}</span>
              <span className={cx('font-mono', now > 0 ? 'text-warn' : 'text-ok')}>
                {was !== now ? `${was} → ${now}` : now} {now === 1 ? 'problem' : 'problems'}
              </span>
              {stray > 0 && <span className="font-mono text-muted">· {stray} unused</span>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const IMPACT_TONES = { muted: 'text-muted', ok: 'text-ok', warn: 'text-warn', bad: 'text-bad' }

function Impact({ tone = 'muted', children }: { tone?: keyof typeof IMPACT_TONES; children: ReactNode }) {
  return <span className={cx('text-xs', IMPACT_TONES[tone])}>{children}</span>
}

function Notice({ tone, children }: { tone: 'bad' | 'muted'; children: ReactNode }) {
  return (
    <div
      className={cx(
        'flex items-start gap-2 border px-3 py-2 text-xs',
        tone === 'bad' ? 'border-bad/50 bg-bad/5 text-bad' : 'border-line bg-surface text-muted',
      )}
    >
      <TriangleAlert size={14} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

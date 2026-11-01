import { useMemo, useState } from 'react'
import {
  CircleCheck,
  CircleDashed,
  CircleX,
  Copy,
  CopyPlus,
  Dices,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileInput,
  KeyRound,
  Lock,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react'
import {
  canonicalOrder,
  describeType,
  envToMap,
  generateEnv,
  parseEnv,
  validateValue,
  type VariableDef,
} from '../../core'
import { CodeView } from '../components/CodeView'
import { toast } from '../components/Toaster'
import { Button, Chip, Confirm, cx, EmptyHint, Field, IconButton, Modal, Panel, Segmented, Switch } from '../components/ui'
import { copyText, readFiles, saveTextFile } from '../lib/files'
import { effectiveValues, problemCount, strayKeys } from '../lib/project'
import { generateSecret } from '../lib/secrets'
import { defaultFileName, useActiveProject, useStore, type Environment, type Project } from '../store'
import { ValueInput } from './VariableEditor'

type FieldState = 'ok' | 'missing' | 'invalid' | 'unset'

const PRESETS = ['development', 'staging', 'production']

const CAN_GENERATE = (v: VariableDef) => v.type.name === 'uuid' || (v.type.name === 'string' && v.sensitive)

export function EnvironmentsView() {
  const project = useActiveProject() as Project
  const activeEnvId = useStore((s) => s.activeEnvId)
  const setActiveEnv = useStore((s) => s.setActiveEnv)
  const setView = useStore((s) => s.setView)
  const setRememberSecrets = useStore((s) => s.setRememberSecrets)
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<FieldFilter>({ query: '', attention: false, hideDefaults: false })

  const schema = project.schema
  const env = project.environments.find((e) => e.id === activeEnvId) ?? project.environments[0] ?? null

  if (schema.variables.length === 0) {
    return (
      <Panel>
        <EmptyHint icon={<KeyRound size={28} />} title="No variables yet">
          Define variables in <strong>Design</strong> first — each environment is a form generated from the schema.
          <div className="mt-4">
            <Button variant="primary" onClick={() => setView('design')}>
              Go to Design
            </Button>
          </div>
        </EmptyHint>
      </Panel>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel kicker={project.name} title="Environments" accent bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          {project.environments.map((e) => {
            const problems = problemCount(schema, e)
            const active = e.id === env?.id
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => setActiveEnv(e.id)}
                aria-pressed={active}
                data-testid={`env-tab-${e.name}`}
                className={cx(
                  'clip-corner-sm flex items-center gap-2 border px-3 py-2 text-left transition-colors cursor-pointer',
                  active ? 'border-accent bg-accent/10 glow' : 'border-line-strong bg-surface-2 hover:border-accent/60',
                )}
              >
                <span className={cx('h-2 w-2', problems === 0 ? 'bg-ok shadow-[0_0_6px_var(--ok)]' : 'bg-bad shadow-[0_0_6px_var(--bad)]')} />
                <span className="text-sm font-bold uppercase tracking-[0.12em]">{e.name}</span>
                <span className="font-mono text-[10px] text-muted">{problems === 0 ? 'ready' : `${problems} to fix`}</span>
              </button>
            )
          })}
          <Button size="sm" variant={project.environments.length === 0 ? 'primary' : 'secondary'} icon={<Plus size={13} />} onClick={() => setAdding(true)}>
            Environment
          </Button>
        </div>
        <div className="flex flex-wrap items-start gap-3 border-t border-line px-4 py-3">
          <Switch
            checked={project.rememberSecrets}
            onChange={(v) => {
              setRememberSecrets(project.id, v)
              toast(v ? 'Secrets will be stored in this browser' : 'Secrets now stay in memory only', v ? 'warn' : 'info')
            }}
            label="Remember secrets in this browser"
            description={
              project.rememberSecrets
                ? 'Sensitive values are saved unencrypted in localStorage. Use only on a machine you trust.'
                : 'Sensitive values stay in memory and are cleared on reload. Other values are saved.'
            }
          />
          {project.rememberSecrets && (
            <span className="flex items-center gap-1.5 text-xs text-warn">
              <ShieldAlert size={14} /> stored in plain text
            </span>
          )}
        </div>
      </Panel>

      {env ? (
        <EnvironmentEditor key={env.id} project={project} env={env} filter={filter} onFilter={setFilter} />
      ) : (
        <Panel>
          <EmptyHint icon={<KeyRound size={28} />} title="No environments yet">
            Add one per deployment target. Values persist in this browser between visits.
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {PRESETS.map((name) => (
                <Button key={name} size="sm" icon={<Plus size={13} />} onClick={() => useStore.getState().addEnvironment({ name })}>
                  {name}
                </Button>
              ))}
            </div>
          </EmptyHint>
        </Panel>
      )}

      {adding && <AddEnvironmentModal project={project} onClose={() => setAdding(false)} />}
    </div>
  )
}

function AddEnvironmentModal({ project, onClose }: { project: Project; onClose(): void }) {
  const addEnvironment = useStore((s) => s.addEnvironment)
  const [name, setName] = useState('')
  const [fileName, setFileName] = useState('')
  const [copyFrom, setCopyFrom] = useState('')
  const taken = project.environments.some((e) => e.name === name.trim())
  const valid = name.trim() !== '' && !taken
  const add = () => {
    if (!valid) return
    const src = project.environments.find((e) => e.id === copyFrom)
    addEnvironment({ name, fileName: fileName || undefined, values: src ? { ...src.values } : {} })
    onClose()
  }
  return (
    <Modal
      open
      kicker={project.name}
      title="Add environment"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} onClick={add}>
            Add
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <Field label="Name" htmlFor="env-name" error={taken ? 'An environment with this name exists' : null}>
          <input id="env-name" className="input" value={name} placeholder="production" onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.filter((p) => !project.environments.some((e) => e.name === p)).map((p) => (
            <button key={p} type="button" className="cursor-pointer" onClick={() => setName(p)}>
              <Chip tone={name === p ? 'accent' : 'muted'}>{p}</Chip>
            </button>
          ))}
        </div>
        <Field label="File name" htmlFor="env-file" hint="Used when saving">
          <input id="env-file" className="input font-mono" value={fileName} placeholder={defaultFileName(name || 'name')} onChange={(e) => setFileName(e.target.value)} />
        </Field>
        {project.environments.length > 0 && (
          <Field label="Start from" htmlFor="env-copy">
            <select id="env-copy" className="input" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
              <option value="">Schema defaults</option>
              {project.environments.map((e) => (
                <option key={e.id} value={e.id}>
                  Copy of {e.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}

interface FieldFilter {
  query: string
  /** Only missing or invalid values. */
  attention: boolean
  /** Hide optional variables still at their schema default. */
  hideDefaults: boolean
}

function EnvironmentEditor({
  project,
  env,
  filter,
  onFilter,
}: {
  project: Project
  env: Environment
  filter: FieldFilter
  onFilter(f: FieldFilter): void
}) {
  const schema = project.schema
  const setValue = useStore((s) => s.setEnvValue)
  const setValues = useStore((s) => s.setEnvValues)
  const updateEnvironment = useStore((s) => s.updateEnvironment)
  const duplicateEnvironment = useStore((s) => s.duplicateEnvironment)
  const removeEnvironment = useStore((s) => s.removeEnvironment)
  const removeEnvKeys = useStore((s) => s.removeEnvKeys)

  const { comments, includeUnsetOptional: includeUnset } = useStore((s) => s.envOutput)
  const setEnvOutput = useStore((s) => s.setEnvOutput)
  const [maskOutput, setMaskOutput] = useState(true)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Fields edited since the filter last changed stay visible, so a row does not vanish while you type in it.
  const [pinned, setPinned] = useState<Set<string>>(new Set())
  const changeFilter = (f: FieldFilter) => {
    setPinned(new Set())
    onFilter(f)
  }

  const ordered = useMemo(() => canonicalOrder(schema), [schema])
  const effective = useMemo(() => effectiveValues(schema, env), [schema, env])
  const stray = useMemo(() => strayKeys(schema, env), [schema, env])
  const states = useMemo(() => fieldStates(ordered, effective), [ordered, effective])
  const output = useMemo(
    () => generateEnv(schema, effective, { comments, includeUnsetOptional: includeUnset }),
    [schema, effective, comments, includeUnset],
  )
  const sensitiveKeys = useMemo(() => new Set(ordered.filter((v) => v.sensitive).map((v) => v.key)), [ordered])

  const required = ordered.filter((v) => v.required)
  const requiredDone = required.filter((v) => states.get(v.key)?.state === 'ok').length
  const invalid = [...states.values()].filter((s) => s.state === 'invalid').length
  const missing = [...states.values()].filter((s) => s.state === 'missing').length
  const ready = invalid === 0 && missing === 0
  const pct = required.length === 0 ? 100 : Math.round((requiredDone / required.length) * 100)

  const loadEnv = async (files: FileList | null) => {
    const f = files?.[0]
    if (!f) return
    const [{ name, text }] = (await readFiles([f])) as [{ name: string; text: string }]
    const map = envToMap(parseEnv(text))
    const next: Record<string, string> = Object.fromEntries(map)
    // Keys absent from the file are explicitly empty, so defaults do not mask what is really there.
    for (const v of ordered) if (!(v.key in next)) next[v.key] = ''
    setValues(env.id, next)
    const extra = [...map.keys()].filter((k) => !ordered.some((v) => v.key === k)).length
    toast(`Loaded ${name} into ${env.name}${extra ? ` — ${extra} key(s) not in schema` : ''}`, extra ? 'warn' : 'ok')
  }

  const generateMissing = () => {
    const targets = ordered.filter((v) => CAN_GENERATE(v) && !effective[v.key])
    for (const v of targets) setValue(env.id, v.key, generateSecret(v.type))
    toast(targets.length ? `Generated ${targets.length} secret(s)` : 'No empty secrets to generate', targets.length ? 'ok' : 'info')
  }

  const needsAttention = (v: VariableDef) => {
    const st = states.get(v.key)?.state
    return st === 'missing' || st === 'invalid'
  }
  const untouchedOptional = (v: VariableDef) => !v.required && !needsAttention(v) && (effective[v.key] ?? '') === v.default
  const q = filter.query.trim().toLowerCase()
  const visible = (v: VariableDef) =>
    pinned.has(v.key) ||
    ((q === '' || v.key.toLowerCase().includes(q) || v.description.toLowerCase().includes(q)) &&
      (!filter.attention || needsAttention(v)) &&
      (!filter.hideDefaults || !untouchedOptional(v)))
  const attentionCount = ordered.filter(needsAttention).length
  const hiddenDefaults = ordered.filter(untouchedOptional).length
  const shown = ordered.filter(visible).length
  const filtering = q !== '' || filter.attention || filter.hideDefaults

  const groupNames = new Set(schema.groups.map((g) => g.name))
  const sections = [
    { name: null as string | null, description: '', vars: ordered.filter((v) => v.group === null || !groupNames.has(v.group)) },
    ...schema.groups.map((g) => ({ name: g.name as string | null, description: g.description, vars: ordered.filter((v) => v.group === g.name) })),
  ]
    .map((s) => ({ ...s, vars: s.vars.filter(visible) }))
    .filter((s) => s.vars.length > 0)

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,480px)]">
      <div className="flex min-w-0 flex-col gap-6">
        <Panel
          kicker="Environment"
          title={env.name}
          actions={
            <>
              <IconButton label={`Duplicate ${env.name}`} onClick={() => duplicateEnvironment(env.id)}>
                <CopyPlus size={15} />
              </IconButton>
              <IconButton label={`Delete ${env.name}`} tone="danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={15} />
              </IconButton>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Name" htmlFor="env-edit-name">
                <input id="env-edit-name" className="input w-44" value={env.name} onChange={(e) => updateEnvironment(env.id, { name: e.target.value })} />
              </Field>
              <Field label="File name" htmlFor="env-edit-file">
                <input id="env-edit-file" className="input w-48 font-mono" value={env.fileName} onChange={(e) => updateEnvironment(env.id, { fileName: e.target.value })} />
              </Field>
              <label className="contents">
                <span className="clip-corner-sm inline-flex h-10 cursor-pointer items-center gap-2 border border-line-strong bg-surface-3 px-4 text-xs font-semibold uppercase tracking-[0.12em] hover:border-accent hover:text-accent">
                  <FileInput size={14} /> Load .env
                </span>
                <input type="file" className="hidden" data-testid="env-load" onChange={(e) => void loadEnv(e.target.files).then(() => (e.target.value = ''))} />
              </label>
              <Button icon={<Dices size={14} />} onClick={generateMissing}>
                Generate secrets
              </Button>
              <Button
                variant="ghost"
                icon={<RotateCcw size={14} />}
                onClick={() => {
                  setValues(env.id, {})
                  toast('Reset to schema defaults', 'info')
                }}
              >
                Defaults
              </Button>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between font-mono text-[11px] uppercase tracking-wider">
                <span className="text-muted">
                  Required <span className="text-fg">{requiredDone}</span>/{required.length}
                </span>
                <span className="flex gap-3">
                  {missing > 0 && <span className="text-bad">{missing} missing</span>}
                  {invalid > 0 && <span className="text-bad">{invalid} invalid</span>}
                  {ready && <span className="text-ok text-glow">● ready</span>}
                </span>
              </div>
              <div className="flex h-2 gap-[2px]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Required values filled">
                {Array.from({ length: 30 }, (_, i) => (
                  <span
                    key={i}
                    className={cx(
                      'flex-1 transition-colors',
                      i < Math.round((pct / 100) * 30) ? (ready ? 'bg-ok shadow-[0_0_6px_var(--ok)]' : 'bg-accent shadow-[0_0_6px_var(--accent)]') : 'bg-surface-3',
                    )}
                  />
                ))}
              </div>
            </div>

            {stray.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border border-warn/50 bg-warn/10 px-3 py-2 text-xs">
                <span className="text-warn">
                  {stray.length} stored key(s) are not in the schema:
                </span>
                {stray.map((k) => (
                  <Chip key={k} tone="warn" verbatim>
                    {k}
                  </Chip>
                ))}
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => removeEnvKeys(env.id, stray)}>
                  Remove
                </Button>
              </div>
            )}
          </div>
        </Panel>

        <div className="sticky top-16 z-30">
          <Panel bodyClassName="p-0">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <label className="relative min-w-[14rem] flex-1">
                <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
                <input
                  className="input pl-9"
                  placeholder="Filter by name or description…"
                  value={filter.query}
                  onChange={(e) => changeFilter({ ...filter, query: e.target.value })}
                  aria-label="Filter values"
                />
              </label>
              <Segmented
                ariaLabel="Show"
                size="sm"
                value={filter.attention ? 'attention' : 'all'}
                onChange={(v) => changeFilter({ ...filter, attention: v === 'attention' })}
                options={[
                  { value: 'all', label: 'All' },
                  {
                    value: 'attention',
                    label: (
                      <>
                        Needs attention
                        <span className={cx('px-1 text-[9px]', attentionCount ? 'bg-bad text-white' : 'bg-ok text-[#05060b]')}>{attentionCount}</span>
                      </>
                    ),
                    title: 'Only missing or invalid values',
                  },
                ]}
              />
              <Switch
                checked={filter.hideDefaults}
                onChange={(hideDefaults) => changeFilter({ ...filter, hideDefaults })}
                label="Hide untouched optionals"
                description={`${hiddenDefaults} optional at default`}
              />
            </div>
            {filtering && (
              <div className="flex items-center justify-between border-t border-line px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted">
                <span>
                  Showing {shown} of {ordered.length}
                </span>
                <button type="button" className="cursor-pointer hover:text-accent" onClick={() => changeFilter({ query: '', attention: false, hideDefaults: false })}>
                  Clear filters
                </button>
              </div>
            )}
          </Panel>
        </div>

        {sections.length === 0 && (
          <Panel>
            <EmptyHint icon={<CircleCheck size={26} />} title={filter.attention && attentionCount === 0 ? 'All set' : 'No matches'}>
              {filter.attention && attentionCount === 0
                ? 'Nothing in this environment needs your attention.'
                : 'No variables match the current filters.'}
            </EmptyHint>
          </Panel>
        )}

        {sections.map((s) => (
          <Panel key={s.name ?? '__ungrouped'} kicker={s.name ? 'Group' : undefined} title={s.name ?? 'General'} bodyClassName="p-0">
            {s.description && <p className="border-b border-line px-4 py-2 text-xs text-muted [overflow-wrap:anywhere]">{s.description}</p>}
            <ul>
              {s.vars.map((v) => (
                <ValueField
                  key={v.key}
                  v={v}
                  value={effective[v.key] ?? ''}
                  state={states.get(v.key)!}
                  revealed={revealed.has(v.key)}
                  onReveal={() =>
                    setRevealed((r) => {
                      const n = new Set(r)
                      if (n.has(v.key)) n.delete(v.key)
                      else n.add(v.key)
                      return n
                    })
                  }
                  onChange={(val) => {
                    if (filtering && !pinned.has(v.key)) setPinned((p) => new Set(p).add(v.key))
                    setValue(env.id, v.key, val)
                  }}
                />
              ))}
            </ul>
          </Panel>
        ))}
      </div>

      <div className="xl:sticky xl:top-24 xl:self-start">
        <Panel
          accent
          kicker="Output"
          title={env.fileName || '.env'}
          actions={
            <>
              <IconButton label={maskOutput ? 'Show secrets in preview' : 'Mask secrets in preview'} onClick={() => setMaskOutput((m) => !m)}>
                {maskOutput ? <EyeOff size={15} /> : <Eye size={15} />}
              </IconButton>
              <IconButton label="Copy .env" onClick={async () => toast((await copyText(output)) ? `Copied ${env.fileName}` : 'Clipboard unavailable')}>
                <Copy size={15} />
              </IconButton>
              <Button
                variant="primary"
                size="sm"
                icon={<Download size={14} />}
                onClick={async () => {
                  const r = await saveTextFile(env.fileName || '.env', output)
                  if (r !== 'cancelled') toast(r === 'saved' ? `Saved ${env.fileName}` : `Downloaded ${env.fileName}`)
                  if (!ready) toast(`${missing + invalid} value(s) still need attention`, 'warn')
                }}
              >
                Save
              </Button>
            </>
          }
          bodyClassName="p-0"
        >
          <div className="flex flex-wrap items-center gap-4 border-b border-line px-4 py-3">
            <Segmented
              ariaLabel="Comments"
              size="sm"
              value={comments}
              onChange={(c) => setEnvOutput({ comments: c })}
              options={[
                { value: 'none', label: 'Bare' },
                { value: 'groups', label: 'Groups' },
                { value: 'full', label: 'Docs' },
              ]}
            />
            <Switch checked={includeUnset} onChange={(v) => setEnvOutput({ includeUnsetOptional: v })} label="Empty optionals" />
          </div>
          <CodeView label="Generated .env" text={output || '# (empty)\n'} maskKeys={maskOutput ? sensitiveKeys : undefined} className="max-h-[65vh] py-3" />
          {!ready && (
            <div className="border-t border-line px-4 py-2 text-xs text-warn">
              {missing + invalid} value(s) need attention before this file passes validation.
            </div>
          )}
        </Panel>
      </div>

      {confirmDelete && (
        <Confirm
          title={`Delete ${env.name}?`}
          message={<>All values stored for this environment are removed from this browser. This cannot be undone.</>}
          confirmLabel="Delete environment"
          onConfirm={() => {
            removeEnvironment(env.id)
            toast(`Deleted ${env.name}`, 'info')
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

function fieldStates(ordered: VariableDef[], effective: Record<string, string>) {
  const m = new Map<string, { state: FieldState; message?: string }>()
  for (const v of ordered) {
    const value = effective[v.key]
    const issues = validateValue(v, value)
    if (issues[0]?.code === 'missing') m.set(v.key, { state: 'missing' })
    else if (issues.length) m.set(v.key, { state: 'invalid', message: issues.map((i) => i.message).join(' · ') })
    else m.set(v.key, { state: value ? 'ok' : 'unset' })
  }
  return m
}

const STATE_ICON = {
  ok: <CircleCheck size={16} className="text-ok" />,
  missing: <CircleDashed size={16} className="text-bad" />,
  invalid: <CircleX size={16} className="text-bad" />,
  unset: <CircleDashed size={16} className="text-faint" />,
}

function ValueField({
  v,
  value,
  state,
  revealed,
  onReveal,
  onChange,
}: {
  v: VariableDef
  value: string
  state: { state: FieldState; message?: string }
  revealed: boolean
  onReveal(): void
  onChange(v: string): void
}) {
  const id = `value-${v.key}`
  const showError = state.state === 'invalid' || state.state === 'missing'
  return (
    <li className="flex flex-col gap-2 border-t border-line/60 px-4 py-4 first:border-t-0" data-testid={`field-${v.key}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {STATE_ICON[state.state]}
        <label htmlFor={id} className="font-mono text-sm font-semibold break-all text-accent">
          {v.key}
        </label>
        {v.sensitive && <Lock size={12} className="text-warn" aria-label="sensitive" />}
        {v.required ? <Chip tone="accent2">req</Chip> : <Chip>opt</Chip>}
        <Chip tone="accent" verbatim>
          {describeType(v.type)}
        </Chip>
        {!v.required && value === v.default && <Chip title="Same as the schema default">default</Chip>}
        {v.docs && (
          <a href={v.docs} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[10px] text-muted hover:text-accent">
            docs <ExternalLink size={10} />
          </a>
        )}
      </div>
      {v.description && <Description text={v.description} />}
      <div className="flex gap-1">
        <div className="min-w-0 flex-1">
          <ValueInput id={id} v={v} value={value} reveal={revealed} invalid={showError} placeholder={v.example ?? (v.default || undefined)} onChange={onChange} />
        </div>
        {v.sensitive && v.type.name !== 'enum' && v.type.name !== 'boolean' && (
          <IconButton label={revealed ? `Hide ${v.key}` : `Reveal ${v.key}`} className="h-[38px] w-9" onClick={onReveal}>
            {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
          </IconButton>
        )}
        {CAN_GENERATE(v) && (
          <IconButton label={`Generate ${v.key}`} className="h-[38px] w-9" onClick={() => onChange(generateSecret(v.type))}>
            <Dices size={15} />
          </IconButton>
        )}
      </div>
      {(showError || v.example) && (
        <p className={cx('text-xs', showError ? 'text-bad' : 'text-faint')}>
          {state.state === 'missing' ? 'Required' : state.state === 'invalid' ? state.message : `e.g. ${v.example}`}
        </p>
      )}
    </li>
  )
}

const LONG_DESCRIPTION = 160

/** Variable description: full width, `code` spans, long text collapsed to two lines. */
function Description({ text }: { text: string }) {
  const long = text.length > LONG_DESCRIPTION || text.split('\n').length > 2
  const [open, setOpen] = useState(false)
  return (
    <div className="text-xs leading-relaxed text-muted">
      <p className={cx('whitespace-pre-line [overflow-wrap:anywhere]', long && !open && 'line-clamp-2')}>
        {text.split(/(`[^`]+`)/g).map((part, i) =>
          part.startsWith('`') && part.endsWith('`') && part.length > 2 ? (
            <code key={i} className="border border-line bg-surface-3/60 px-1 font-mono text-[11px] text-fg">
              {part.slice(1, -1)}
            </code>
          ) : (
            part
          ),
        )}
      </p>
      {long && (
        <button type="button" className="mt-0.5 cursor-pointer font-mono text-[10px] uppercase tracking-wider text-accent hover:underline" onClick={() => setOpen((o) => !o)}>
          {open ? 'Less' : 'More'}
        </button>
      )}
    </div>
  )
}


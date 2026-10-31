import { Fragment, useMemo, useState } from 'react'
import {
  ArrowDownUp,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Download,
  Eye,
  EyeOff,
  FileWarning,
  FolderPlus,
  Lock,
  PencilLine,
  Radar,
  Trash2,
  X,
} from 'lucide-react'
import {
  auditEnv,
  canonicalOrder,
  describeType,
  envToMap,
  normalizeEnv,
  parseEnv,
  type AuditResult,
  type AuditRow,
  type AuditStatus,
  type Diagnostic,
  type VariableDef,
} from '../../core'
import { FileDrop } from '../components/FileDrop'
import { toast } from '../components/Toaster'
import { Button, Chip, cx, EmptyHint, Field, IconButton, Modal, Panel, Segmented, Switch, type Tone } from '../components/ui'
import { saveTextFile } from '../lib/files'
import { environmentAsFile } from '../lib/project'
import { useActiveProject, useSchema, useStore, type AuditFile } from '../store'

type Filter = 'all' | 'problems' | 'diverging'

interface Audited {
  /** A stored project environment, or a file dropped into Audit. */
  source: 'project' | 'file'
  file: AuditFile
  envId?: string
  assignments: number
  result: AuditResult
  rows: Map<string, AuditRow>
  diagnostics: Diagnostic[]
}

const STATUS_META: Record<AuditStatus, { label: string; tone: Tone; symbol: string; cls: string }> = {
  ok: { label: 'ok', tone: 'ok', symbol: '✓', cls: 'text-ok' },
  missing: { label: 'missing', tone: 'bad', symbol: '✗', cls: 'text-bad' },
  invalid: { label: 'invalid', tone: 'bad', symbol: '!', cls: 'text-bad' },
  unset: { label: 'unset', tone: 'muted', symbol: '–', cls: 'text-faint' },
  extra: { label: 'extra', tone: 'accent2', symbol: '+', cls: 'text-accent-2' },
}

export function AuditView() {
  const schema = useSchema()
  const project = useActiveProject()
  const files = useStore((s) => s.auditFiles)
  const addFiles = useStore((s) => s.addAuditFiles)
  const removeFile = useStore((s) => s.removeAuditFile)
  const clearFiles = useStore((s) => s.clearAuditFiles)
  const importSchemaText = useStore((s) => s.importSchemaText)
  const addEnvironment = useStore((s) => s.addEnvironment)
  const setActiveEnv = useStore((s) => s.setActiveEnv)
  const setView = useStore((s) => s.setView)

  const [filter, setFilter] = useState<Filter>('all')
  const [showValues, setShowValues] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [pasting, setPasting] = useState(false)
  const [includeProject, setIncludeProject] = useState(true)

  const ordered = useMemo(() => canonicalOrder(schema), [schema])
  const environments = project?.environments
  const audited: Audited[] = useMemo(() => {
    const fromProject: Audited[] = includeProject
      ? (environments ?? []).map((e) => {
          const env = environmentAsFile(schema, e)
          const result = auditEnv(schema, env)
          return {
            source: 'project',
            envId: e.id,
            file: { id: `env:${e.id}`, name: e.name, text: '' },
            assignments: env.entries.length,
            result,
            rows: new Map(result.rows.map((r) => [r.key, r])),
            diagnostics: [],
          }
        })
      : []
    const fromFiles: Audited[] = files.map((file) => {
      const env = parseEnv(file.text)
      const result = auditEnv(schema, env)
      return {
        source: 'file',
        file,
        assignments: env.entries.length,
        result,
        rows: new Map(result.rows.map((r) => [r.key, r])),
        diagnostics: env.diagnostics,
      }
    })
    return [...fromProject, ...fromFiles]
  }, [files, schema, environments, includeProject])

  const extras = useMemo(() => {
    const keys: string[] = []
    for (const a of audited) for (const r of a.result.rows) if (r.status === 'extra' && !keys.includes(r.key)) keys.push(r.key)
    return keys
  }, [audited])

  if (ordered.length === 0) {
    return (
      <Panel kicker="Audit" title="Load a schema first">
        <div className="grid gap-6 md:grid-cols-2">
          <EmptyHint icon={<Radar size={28} />} title="Nothing to audit against">
            The audit compares env files against your <code className="font-mono">.env.example</code> schema. Drop it here, or build one
            in Design.
          </EmptyHint>
          <FileDrop
            title="Drop .env.example"
            hint="becomes the workspace schema"
            onFiles={(fs) => {
              const f = fs[0]
              if (!f) return
              importSchemaText(f.text)
              toast(`Loaded schema from ${f.name}`)
            }}
            testId="audit-schema"
          />
        </div>
      </Panel>
    )
  }

  const isProblem = (key: string) =>
    audited.some((a) => {
      const r = a.rows.get(key)
      return r && (r.status === 'missing' || r.status === 'invalid' || r.status === 'extra' || r.warnings.length > 0)
    })
  const isDiverging = (key: string) => {
    const seen = new Set(audited.map((a) => {
      const r = a.rows.get(key)
      return r ? `${r.status}\u0000${r.value ?? ''}` : 'absent'
    }))
    return seen.size > 1
  }
  const visible = (key: string) =>
    filter === 'all' || (filter === 'problems' ? isProblem(key) : isDiverging(key))

  const groupNames = new Set(schema.groups.map((g) => g.name))
  const sections: { title: string | null; vars: VariableDef[] }[] = [
    { title: null, vars: ordered.filter((v) => v.group === null || !groupNames.has(v.group)) },
    ...schema.groups.map((g) => ({ title: g.name, vars: ordered.filter((v) => v.group === g.name) })),
  ]

  const toggle = (key: string) =>
    setExpanded((e) => {
      const n = new Set(e)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })

  const openEnvironment = (envId: string) => {
    setActiveEnv(envId)
    setView('environments')
  }

  /** Store a dropped file as a project environment so it can be fixed and kept. */
  const addAsEnvironment = (a: Audited) => {
    const name = a.file.name.replace(/^\.env\.?/, '') || 'local'
    const id = addEnvironment({ name, fileName: a.file.name, values: Object.fromEntries(envToMap(parseEnv(a.file.text))) })
    removeFile(a.file.id)
    if (id) {
      toast(`Added ${a.file.name} as environment "${name}"`)
      openEnvironment(id)
    }
  }

  const colCount = 2 + audited.length

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <Panel kicker="Audit" title="Environments" accent>
          <div className="flex flex-col gap-3">
            <FileDrop
              multiple
              title="Drop .env files"
              hint={
                <>
                  .env, .env.staging, .env.production…
                  <br />
                  <span className="text-faint">Tip: ⌘⇧. shows hidden files in the macOS picker</span>
                </>
              }
              onFiles={(fs) => {
                addFiles(fs)
                toast(`Added ${fs.length} file(s)`)
              }}
              testId="audit-files"
            />
            <div className="flex gap-2">
              <Button size="sm" icon={<ClipboardPaste size={13} />} onClick={() => setPasting(true)} className="flex-1">
                Paste
              </Button>
              <Button size="sm" variant="ghost" icon={<X size={13} />} disabled={files.length === 0} onClick={clearFiles}>
                Clear
              </Button>
            </div>
            <Switch
              checked={includeProject}
              onChange={setIncludeProject}
              label="Include project environments"
              description={`${project?.environments.length ?? 0} stored in ${project?.name ?? 'this project'}`}
            />
            <p className="text-xs text-faint">
              Comparing against the project schema · {ordered.length} variables. Dropped files stay in memory only.
            </p>
          </div>
        </Panel>

        {audited.length === 0 ? (
          <Panel>
            <EmptyHint icon={<Radar size={28} />} title="Awaiting signal">
              Add environments to the project, or drop env files pulled from servers. Each is checked for missing and invalid values, unknown keys, duplicates and order drift — and
              compared side by side.
            </EmptyHint>
          </Panel>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {audited.map((a) => (
              <EnvCard
                key={a.file.id}
                a={a}
                onRemove={() => removeFile(a.file.id)}
                onOpen={() => (a.envId ? openEnvironment(a.envId) : addAsEnvironment(a))}
                onSync={async () => {
                  const out = normalizeEnv(schema, parseEnv(a.file.text))
                  const r = await saveTextFile(a.file.name, out)
                  if (r !== 'cancelled') toast(`Synced ${a.file.name} to schema order`)
                }}
              />
            ))}
          </div>
        )}
      </div>

      {audited.length > 0 && (
        <Panel
          kicker="Matrix"
          title="Variables × environments"
          actions={
            <>
              <Segmented
                ariaLabel="Filter rows"
                size="sm"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'problems', label: 'Problems' },
                  { value: 'diverging', label: 'Diverging', title: 'Rows whose value or status differs between environments' },
                ]}
              />
              <IconButton label={showValues ? 'Hide values' : 'Show values'} onClick={() => setShowValues((s) => !s)}>
                {showValues ? <EyeOff size={15} /> : <Eye size={15} />}
              </IconButton>
            </>
          }
          bodyClassName="p-0"
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" data-testid="audit-matrix">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                  <th className="sticky left-0 z-10 bg-surface px-4 py-3 font-normal">Variable</th>
                  <th className="px-3 py-3 font-normal">Rule</th>
                  {audited.map((a) => (
                    <th key={a.file.id} className="px-3 py-3 font-normal">
                      <span className={cx('font-semibold', a.result.passed ? 'text-ok' : 'text-bad')}>{a.file.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sections.map((s) => {
                  const vars = s.vars.filter((v) => visible(v.key))
                  if (vars.length === 0) return null
                  return (
                    <Fragment key={s.title ?? '__ungrouped'}>
                      {s.title && (
                        <tr>
                          <td colSpan={colCount} className="bg-surface-2/70 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-accent-2">
                            {s.title}
                          </td>
                        </tr>
                      )}
                      {vars.map((v) => (
                        <MatrixRow key={v.key} k={v.key} def={v} audited={audited} showValues={showValues} expanded={expanded.has(v.key)} onToggle={() => toggle(v.key)} colCount={colCount} />
                      ))}
                    </Fragment>
                  )
                })}
                {extras.length > 0 && filter !== 'diverging' && (
                  <>
                    <tr>
                      <td colSpan={colCount} className="bg-surface-2/70 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-warn">
                        Not in schema
                      </td>
                    </tr>
                    {extras.map((k) => (
                      <MatrixRow key={k} k={k} audited={audited} showValues={showValues} expanded={expanded.has(k)} onToggle={() => toggle(k)} colCount={colCount} />
                    ))}
                  </>
                )}
                {extras.length > 0 && filter === 'diverging' &&
                  extras.filter(isDiverging).map((k) => (
                    <MatrixRow key={k} k={k} audited={audited} showValues={showValues} expanded={expanded.has(k)} onToggle={() => toggle(k)} colCount={colCount} />
                  ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-4 border-t border-line px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted">
            {(Object.keys(STATUS_META) as AuditStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className={cx('font-bold', STATUS_META[s].cls)}>{STATUS_META[s].symbol}</span> {STATUS_META[s].label}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="font-bold text-warn">⚠</span> warning
            </span>
          </div>
        </Panel>
      )}

      {pasting && (
        <PasteModal
          onClose={() => setPasting(false)}
          onAdd={(name, text) => {
            addFiles([{ name, text }])
            setPasting(false)
          }}
        />
      )}
    </div>
  )
}

function EnvCard({ a, onRemove, onOpen, onSync }: { a: Audited; onRemove(): void; onOpen(): void; onSync(): void }) {
  const { result } = a
  const n = result.counts
  const total = Math.max(1, result.rows.length)
  const parseErrors = a.diagnostics.filter((d) => d.severity === 'error')
  const segments: [AuditStatus, string][] = [
    ['ok', 'bg-ok'],
    ['unset', 'bg-faint'],
    ['extra', 'bg-accent-2'],
    ['invalid', 'bg-bad'],
    ['missing', 'bg-bad/60'],
  ]
  return (
    <div className={cx('panel animate-rise', !result.passed && 'panel-accent')} data-testid={`env-card-${a.file.name}`}>
      <div className="panel-inner flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-mono text-sm font-semibold">{a.file.name}</div>
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">{a.source === 'project' ? `project env · ${a.assignments} values` : `file · ${a.assignments} assignments`}</div>
          </div>
          <span
            className={cx(
              'clip-corner-sm px-2.5 py-1 text-xs font-bold tracking-[0.2em]',
              result.passed ? 'bg-ok text-[#05060b]' : 'bg-bad text-white',
            )}
          >
            {result.passed ? 'PASS' : 'FAIL'}
          </span>
        </div>

        <div className="flex h-1.5 overflow-hidden bg-surface-3">
          {segments.map(([s, cls]) => (n[s] > 0 ? <span key={s} className={cls} style={{ width: `${(n[s] / total) * 100}%` }} /> : null))}
        </div>

        <div className="grid grid-cols-5 gap-1 text-center font-mono">
          {(['ok', 'missing', 'invalid', 'unset', 'extra'] as AuditStatus[]).map((s) => (
            <div key={s}>
              <div className={cx('text-lg font-semibold', n[s] > 0 ? STATUS_META[s].cls : 'text-faint')}>{n[s]}</div>
              <div className="text-[9px] uppercase tracking-wider text-muted">{s}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {result.orderDrift && (
            <Chip tone="warn" title="Keys are not in schema order">
              <ArrowDownUp size={9} /> order drift
            </Chip>
          )}
          {result.duplicates.length > 0 && (
            <Chip tone="warn" title={result.duplicates.join(', ')}>
              {result.duplicates.length} duplicate
            </Chip>
          )}
          {parseErrors.length > 0 && (
            <Chip tone="bad" title={parseErrors.map((d) => `L${d.line}: ${d.message}`).join('\n')}>
              <FileWarning size={9} /> {parseErrors.length} parse error
            </Chip>
          )}
          {result.clean && !result.orderDrift && <Chip tone="ok">clean</Chip>}
        </div>

        <div className="mt-auto flex items-center gap-1 border-t border-line pt-2">
          {a.source === 'file' ? (
            <>
              <Button size="sm" variant="ghost" icon={<Download size={13} />} onClick={onSync} title="Reorder to schema, dedupe, add missing keys">
                Sync
              </Button>
              <Button size="sm" variant="ghost" icon={<FolderPlus size={13} />} onClick={onOpen} title="Store this file as a project environment">
                Add to project
              </Button>
              <IconButton label={`Remove ${a.file.name}`} tone="danger" className="ml-auto" onClick={onRemove}>
                <Trash2 size={14} />
              </IconButton>
            </>
          ) : (
            <Button size="sm" variant="ghost" icon={<PencilLine size={13} />} onClick={onOpen} title="Edit values in Environments">
              Edit values
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function MatrixRow({
  k,
  def,
  audited,
  showValues,
  expanded,
  onToggle,
  colCount,
}: {
  k: string
  def?: VariableDef
  audited: Audited[]
  showValues: boolean
  expanded: boolean
  onToggle(): void
  colCount: number
}) {
  return (
    <>
      <tr className="group cursor-pointer border-b border-line/50 hover:bg-accent/[0.04]" onClick={onToggle} data-testid={`row-${k}`}>
        <td className="sticky left-0 z-10 bg-surface px-4 py-2 group-hover:bg-surface-2">
          <span className="flex items-center gap-1.5 font-mono text-[13px]">
            {expanded ? <ChevronDown size={13} className="text-muted" /> : <ChevronRight size={13} className="text-faint" />}
            <span className={def ? 'text-accent' : 'text-warn'}>{k}</span>
            {def?.sensitive && <Lock size={11} className="text-warn" />}
          </span>
        </td>
        <td className="px-3 py-2 whitespace-nowrap">
          {def ? (
            <span className="flex items-center gap-1.5">
              {def.required ? <Chip tone="accent2">req</Chip> : <Chip>opt</Chip>}
              <span className="font-mono text-[11px] text-muted">{describeType(def.type)}</span>
            </span>
          ) : (
            <span className="font-mono text-[11px] text-faint">—</span>
          )}
        </td>
        {audited.map((a) => {
          const r = a.rows.get(k)
          return (
            <td key={a.file.id} className="px-3 py-2" title={r ? [...r.issues, ...r.warnings].join('\n') || STATUS_META[r.status].label : 'absent'}>
              {r ? <Cell r={r} masked={!!def?.sensitive} showValues={showValues} /> : <span className="text-faint">·</span>}
            </td>
          )
        })}
      </tr>
      {expanded && (
        <tr className="border-b border-line/50 bg-surface-2/50">
          <td colSpan={colCount} className="px-4 py-3">
            {def?.description && <p className="mb-2 text-xs text-muted">{def.description}</p>}
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {audited.map((a) => {
                const r = a.rows.get(k)
                return (
                  <div key={a.file.id} className="border border-line bg-surface px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-xs font-semibold">{a.file.name}</span>
                      {r ? <Chip tone={STATUS_META[r.status].tone}>{STATUS_META[r.status].label}</Chip> : <Chip>absent</Chip>}
                    </div>
                    {r?.present && (
                      <div className="mt-1 font-mono text-[11px] break-all text-fg">
                        <span className="text-faint">{r.line ? `L${r.line} ` : ''}</span>
                        {def?.sensitive && !showValues ? '••••••••' : r.value === '' ? <span className="text-faint">(empty)</span> : r.value}
                      </div>
                    )}
                    {r?.issues.map((i) => (
                      <div key={i} className="mt-1 text-xs text-bad">
                        {i}
                      </div>
                    ))}
                    {r?.warnings.map((w) => (
                      <div key={w} className="mt-1 text-xs text-warn">
                        ⚠ {w}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function Cell({ r, masked, showValues }: { r: AuditRow; masked: boolean; showValues: boolean }) {
  const meta = STATUS_META[r.status]
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className={cx('w-3 text-center font-mono font-bold', meta.cls)}>{meta.symbol}</span>
      {r.warnings.length > 0 && <span className="text-warn">⚠</span>}
      {showValues && r.present && (
        <span className="max-w-[18rem] truncate font-mono text-[11px] text-muted">
          {masked ? '••••••' : r.value === '' ? '(empty)' : r.value}
        </span>
      )}
      {!showValues && (r.status === 'invalid' || r.status === 'missing') && (
        <span className="max-w-[16rem] truncate text-[11px] text-bad">{r.status === 'missing' ? 'missing' : r.issues[0]}</span>
      )}
    </span>
  )
}

function PasteModal({ onClose, onAdd }: { onClose(): void; onAdd(name: string, text: string): void }) {
  const [name, setName] = useState('.env')
  const [text, setText] = useState('')
  return (
    <Modal
      open
      kicker="Audit"
      title="Paste env file"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={text.trim() === ''} onClick={() => onAdd(name.trim() || '.env', text)}>
            Add
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" htmlFor="paste-name">
          <input id="paste-name" className="input font-mono" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Contents" htmlFor="paste-text">
          <textarea id="paste-text" rows={12} spellCheck={false} className="input resize-y font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={'NODE_ENV=production\nPORT=8080'} />
        </Field>
      </div>
    </Modal>
  )
}

import { useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  FileCode2,
  FolderPlus,
  Lock,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  TriangleAlert,
  Layers,
  ExternalLink,
  Bot,
} from 'lucide-react'
import agentGuide from '../../../docs/agents/ENVDECK.md?raw'
import {
  addGroup,
  describeType,
  moveGroup,
  moveVariable,
  parseSchema,
  removeGroup,
  removeVariable,
  serializeSchema,
  updateGroup,
  type Diagnostic,
  type EnvSchema,
  type GroupDef,
  type VariableDef,
} from '../../core'
import { CodeView } from '../components/CodeView'
import { FileDrop } from '../components/FileDrop'
import { toast } from '../components/Toaster'
import { Button, Chip, cx, EmptyHint, Field, IconButton, Modal, Panel, Segmented } from '../components/ui'
import { exampleSchemaText as exampleText } from '../lib/example'
import { copyText, saveTextFile } from '../lib/files'
import { useSchema, useStore } from '../store'
import { VariableEditor } from './VariableEditor'

type OutputTab = 'preview' | 'source' | 'issues'

export function DesignView() {
  const schema = useSchema()
  const commit = useStore((s) => s.commit)
  const importSchemaText = useStore((s) => s.importSchemaText)
  const importDiagnostics = useStore((s) => s.importDiagnostics)

  const [editing, setEditing] = useState<{ variable: VariableDef | null; group: string | null } | null>(null)
  const [groupModal, setGroupModal] = useState<{ group: GroupDef | null } | null>(null)
  const [query, setQuery] = useState('')

  const text = useMemo(() => serializeSchema(schema), [schema])
  const lint = useMemo(() => parseSchema(text).diagnostics, [text])

  const isEmpty = schema.variables.length === 0 && schema.groups.length === 0

  const doImport = (source: string, label: string) => {
    const diags = importSchemaText(source)
    const errors = diags.filter((d) => d.severity === 'error').length
    toast(
      errors > 0 ? `Imported ${label} with ${errors} error(s) — see Issues` : `Imported ${label}`,
      errors > 0 ? 'warn' : 'ok',
    )
  }

  if (isEmpty) {
    return (
      <EmptyDesign
        onNew={() => setEditing({ variable: null, group: null })}
        onExample={() => doImport(exampleText, 'example schema')}
        onImport={(t, name) => doImport(t, name)}
        editor={
          editing && (
            <VariableEditor
              variable={editing.variable}
              initialGroup={editing.group}
              onClose={() => setEditing(null)}
            />
          )
        }
      />
    )
  }

  const q = query.trim().toLowerCase()
  const matches = (v: VariableDef) =>
    q === '' || v.key.toLowerCase().includes(q) || v.description.toLowerCase().includes(q)

  const groupNames = new Set(schema.groups.map((g) => g.name))
  const ungrouped = schema.variables.filter((v) => (v.group === null || !groupNames.has(v.group)) && matches(v))
  const sections: { group: GroupDef | null; vars: VariableDef[] }[] = [
    ...(ungrouped.length > 0 || q === '' ? [{ group: null, vars: ungrouped }] : []),
    ...schema.groups.map((g) => ({ group: g, vars: schema.variables.filter((v) => v.group === g.name && matches(v)) })),
  ].filter((s) => s.group !== null || s.vars.length > 0)

  const stats = {
    total: schema.variables.length,
    required: schema.variables.filter((v) => v.required).length,
    sensitive: schema.variables.filter((v) => v.sensitive).length,
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[230px_minmax(0,1fr)_minmax(0,480px)]">
      <GroupsPanel
        schema={schema}
        onAdd={() => setGroupModal({ group: null })}
        onEdit={(g) => setGroupModal({ group: g })}
        onMove={(g, d) => commit(moveGroup(schema, g.name, d))}
        onDelete={(g) => {
          commit(removeGroup(schema, g.name))
          toast(`Removed group ${g.name} — ⌘Z to undo`, 'info')
        }}
      />

      <div className="flex min-w-0 flex-col gap-6">
        <HeaderPanel description={schema.description} onChange={(description) => commit({ ...schema, description })} />

        <Panel
          kicker="Schema"
          title={
            <span className="flex items-center gap-3">
              Variables
              <span className="font-mono text-[10px] tracking-wider text-muted normal-case">
                {stats.total} total · {stats.required} required · {stats.sensitive} sensitive
              </span>
            </span>
          }
          actions={
            <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setEditing({ variable: null, group: null })}>
              Variable
            </Button>
          }
          bodyClassName="p-0"
        >
          <div className="border-b border-line px-4 py-3">
            <label className="relative block">
              <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
              <input
                className="input pl-9"
                placeholder="Filter by name or description…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Filter variables"
              />
            </label>
          </div>
          <div className="flex flex-col">
            {sections.map(({ group, vars }) => (
              <section key={group?.name ?? '__ungrouped'} id={group ? `group-${slug(group.name)}` : 'group-ungrouped'} className="border-b border-line last:border-b-0">
                <div className="flex items-center gap-3 bg-surface-2/60 px-4 py-2">
                  <Layers size={14} className={group ? 'text-accent-2' : 'text-faint'} />
                  <div className="min-w-0 flex-1">
                    <span className={cx('text-xs font-bold uppercase tracking-[0.2em]', group ? 'text-accent-2' : 'text-muted')}>
                      {group ? group.name : 'Ungrouped'}
                    </span>
                    {group?.description && <span className="ml-3 truncate text-xs text-muted">{group.description}</span>}
                  </div>
                  <span className="font-mono text-[10px] text-faint">{vars.length}</span>
                  <IconButton label={`Add variable to ${group?.name ?? 'ungrouped'}`} onClick={() => setEditing({ variable: null, group: group?.name ?? null })}>
                    <Plus size={15} />
                  </IconButton>
                </div>
                {vars.length === 0 ? (
                  <div className="px-4 py-4 text-xs text-faint">{q ? 'No matches.' : 'No variables yet.'}</div>
                ) : (
                  <ul>
                    {vars.map((v) => (
                      <VariableRow
                        key={v.key}
                        v={v}
                        onEdit={() => setEditing({ variable: v, group: v.group })}
                        onMove={(d) => commit(moveVariable(schema, v.key, d))}
                        onDelete={() => {
                          commit(removeVariable(schema, v.key))
                          toast(`Removed ${v.key} — ⌘Z to undo`, 'info')
                        }}
                        lint={lint.filter((d) => d.key === v.key)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </Panel>
      </div>

      <OutputPanel text={text} lint={lint} importDiagnostics={importDiagnostics} onApply={(t) => doImport(t, 'source')} />

      {editing && <VariableEditor variable={editing.variable} initialGroup={editing.group} onClose={() => setEditing(null)} />}
      {groupModal && (
        <GroupModal
          group={groupModal.group}
          schema={schema}
          onClose={() => setGroupModal(null)}
          onSave={(next) => {
            commit(groupModal.group ? updateGroup(schema, groupModal.group.name, next) : addGroup(schema, next.name, next.description))
            setGroupModal(null)
          }}
        />
      )}
    </div>
  )
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function VariableRow({
  v,
  onEdit,
  onMove,
  onDelete,
  lint,
}: {
  v: VariableDef
  onEdit(): void
  onMove(d: -1 | 1): void
  onDelete(): void
  lint: Diagnostic[]
}) {
  return (
    <li className="group relative border-t border-line/60 first:border-t-0 hover:bg-accent/[0.04]" data-testid={`var-${v.key}`}>
      <span className="absolute top-0 bottom-0 left-0 w-[2px] bg-transparent transition-colors group-hover:bg-accent" />
      <div className="flex items-start gap-3 px-4 py-3">
        <button type="button" onClick={onEdit} aria-label={`Open ${v.key}`} className="min-w-0 flex-1 text-left cursor-pointer">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-accent">{v.key}</span>
            {v.required ? <Chip tone="accent2">required</Chip> : <Chip>optional</Chip>}
            {v.sensitive && (
              <Chip tone="warn">
                <Lock size={9} /> sensitive
              </Chip>
            )}
            <Chip tone="accent" verbatim>
              {describeType(v.type)}
            </Chip>
            {lint.length > 0 && (
              <span title={lint.map((d) => d.message).join('\n')} className="text-warn">
                <TriangleAlert size={14} />
              </span>
            )}
          </div>
          {v.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{v.description}</p>}
          {(v.default !== '' || v.example) && (
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-faint">
              {v.default !== '' && (
                <span>
                  default <span className="text-fg">{v.sensitive ? '••••••' : v.default}</span>
                </span>
              )}
              {v.example && (
                <span>
                  example <span className="text-fg">{v.example}</span>
                </span>
              )}
            </div>
          )}
        </button>
        <div className="flex shrink-0 items-center opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {v.docs && (
            <a href={v.docs} target="_blank" rel="noreferrer" title="Open docs" className="inline-flex h-8 w-8 items-center justify-center text-muted hover:text-accent">
              <ExternalLink size={14} />
            </a>
          )}
          <IconButton label={`Move ${v.key} up`} onClick={() => onMove(-1)}>
            <ArrowUp size={15} />
          </IconButton>
          <IconButton label={`Move ${v.key} down`} onClick={() => onMove(1)}>
            <ArrowDown size={15} />
          </IconButton>
          <IconButton label={`Edit ${v.key}`} onClick={onEdit}>
            <Pencil size={14} />
          </IconButton>
          <IconButton label={`Delete ${v.key}`} tone="danger" onClick={onDelete}>
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>
    </li>
  )
}

function GroupsPanel({
  schema,
  onAdd,
  onEdit,
  onMove,
  onDelete,
}: {
  schema: EnvSchema
  onAdd(): void
  onEdit(g: GroupDef): void
  onMove(g: GroupDef, d: -1 | 1): void
  onDelete(g: GroupDef): void
}) {
  const groupNames = new Set(schema.groups.map((g) => g.name))
  const ungroupedCount = schema.variables.filter((v) => v.group === null || !groupNames.has(v.group)).length
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="flex flex-col gap-6">
      <Panel
        kicker="Structure"
        title="Groups"
        actions={
          <IconButton label="Add group" onClick={onAdd}>
            <FolderPlus size={16} />
          </IconButton>
        }
        bodyClassName="p-2"
      >
        <ul className="flex flex-col">
          <li>
            <button type="button" onClick={() => jump('group-ungrouped')} className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs uppercase tracking-wider text-muted hover:text-fg cursor-pointer">
              <span>Ungrouped</span>
              <span className="font-mono text-faint">{ungroupedCount}</span>
            </button>
          </li>
          {schema.groups.map((g, i) => (
            <li key={g.name} className="group flex items-center">
              <button type="button" onClick={() => jump(`group-${slug(g.name)}`)} className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wider hover:text-accent-2 cursor-pointer">
                <span className="truncate">{g.name}</span>
                <span className="font-mono text-faint">{schema.variables.filter((v) => v.group === g.name).length}</span>
              </button>
              <div className="hidden group-hover:flex group-focus-within:flex">
                <IconButton label={`Move group ${g.name} up`} className="h-7 w-6" disabled={i === 0} onClick={() => onMove(g, -1)}>
                  <ArrowUp size={13} />
                </IconButton>
                <IconButton label={`Move group ${g.name} down`} className="h-7 w-6" disabled={i === schema.groups.length - 1} onClick={() => onMove(g, 1)}>
                  <ArrowDown size={13} />
                </IconButton>
                <IconButton label={`Edit group ${g.name}`} className="h-7 w-6" onClick={() => onEdit(g)}>
                  <Pencil size={12} />
                </IconButton>
                <IconButton label={`Delete group ${g.name}`} className="h-7 w-6" tone="danger" onClick={() => onDelete(g)}>
                  <Trash2 size={12} />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
        {schema.groups.length === 0 && <p className="px-2 py-2 text-xs text-faint">Group related variables — Database, Auth, Mail…</p>}
      </Panel>

    </div>
  )
}

function HeaderPanel({ description, onChange }: { description: string; onChange(description: string): void }) {
  return (
    <Panel kicker="File" title="Header" bodyClassName="p-3">
      <textarea
        key={description}
        defaultValue={description}
        onBlur={(e) => e.target.value !== description && onChange(e.target.value)}
        rows={2}
        className="input resize-y font-mono text-xs"
        placeholder="Comment written at the top of .env.example — what this file is for, where to get values…"
        aria-label="File header comment"
      />
    </Panel>
  )
}

function OutputPanel({
  text,
  lint,
  importDiagnostics,
  onApply,
}: {
  text: string
  lint: Diagnostic[]
  importDiagnostics: Diagnostic[]
  onApply(text: string): void
}) {
  const [tab, setTab] = useState<OutputTab>('preview')
  const [draft, setDraft] = useState<string | null>(null)
  const draftDiagnostics = useMemo(() => (draft === null ? [] : parseSchema(draft).diagnostics), [draft])
  const issues = [...importDiagnostics.map((d) => ({ ...d, source: 'last import' })), ...lint.map((d) => ({ ...d, source: 'schema' }))]
  const fileInput = useRef<HTMLInputElement>(null)

  const tabs: { value: OutputTab; label: React.ReactNode }[] = [
    { value: 'preview', label: 'Preview' },
    { value: 'source', label: 'Source' },
    {
      value: 'issues',
      label: (
        <>
          Issues
          {issues.length > 0 && <span className="bg-warn px-1 text-[9px] text-[#05060b]">{issues.length}</span>}
        </>
      ),
    },
  ]

  return (
    <div className="xl:sticky xl:top-24 xl:self-start">
      <Panel
        accent
        kicker="Output"
        title=".env.example"
        actions={
          <>
            <IconButton
              label="Copy .env.example"
              onClick={async () => toast((await copyText(text)) ? 'Copied .env.example' : 'Clipboard unavailable', 'ok')}
            >
              <Copy size={15} />
            </IconButton>
            <IconButton
              label="Import .env.example"
              onClick={() => fileInput.current?.click()}
            >
              <FileCode2 size={15} />
            </IconButton>
            <IconButton
              label="Save AI agent guide (ENVDECK.md)"
              onClick={async () => {
                const r = await saveTextFile('ENVDECK.md', agentGuide)
                if (r !== 'cancelled') toast('Saved ENVDECK.md — commit it next to .env.example')
              }}
            >
              <Bot size={15} />
            </IconButton>
            <Button
              variant="primary"
              size="sm"
              icon={<Download size={14} />}
              onClick={async () => {
                const r = await saveTextFile('.env.example', text)
                if (r !== 'cancelled') toast(r === 'saved' ? 'Saved .env.example' : 'Downloaded .env.example')
              }}
            >
              Export
            </Button>
          </>
        }
        bodyClassName="p-0"
      >
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          data-testid="import-schema"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) onApply(await f.text())
            e.target.value = ''
          }}
        />
        <div className="flex items-center justify-between border-b border-line px-4 py-2">
          <Segmented ariaLabel="Output view" size="sm" value={tab} options={tabs} onChange={(t) => {
            if (t === 'source') setDraft(text)
            setTab(t)
          }} />
        </div>

        {tab === 'preview' && <CodeView label=".env.example preview" text={text} className="max-h-[70vh] py-3" />}

        {tab === 'source' && (
          <div className="flex flex-col gap-3 p-4">
            <textarea
              aria-label=".env.example source"
              spellCheck={false}
              value={draft ?? text}
              onChange={(e) => setDraft(e.target.value)}
              className="input min-h-[50vh] resize-y font-mono text-[12px] leading-relaxed"
            />
            <DiagnosticList diagnostics={draftDiagnostics} empty="Parses cleanly." />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setDraft(text)} disabled={draft === null || draft === text}>
                Revert
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={draft === null || draft === text}
                onClick={() => {
                  if (draft !== null) {
                    onApply(draft)
                    setTab('preview')
                  }
                }}
              >
                Apply
              </Button>
            </div>
          </div>
        )}

        {tab === 'issues' && (
          <div className="p-4">
            <DiagnosticList diagnostics={issues} empty="No issues. The schema is consistent." withSource />
          </div>
        )}
      </Panel>
    </div>
  )
}

export function DiagnosticList({
  diagnostics,
  empty,
  withSource,
}: {
  diagnostics: (Diagnostic & { source?: string })[]
  empty: string
  withSource?: boolean
}) {
  if (diagnostics.length === 0) return <p className="text-xs text-ok">✓ {empty}</p>
  return (
    <ul className="flex max-h-64 flex-col gap-1.5 overflow-auto">
      {diagnostics.map((d, i) => (
        <li key={i} className="flex gap-2 text-xs">
          <span className={cx('font-mono uppercase', d.severity === 'error' ? 'text-bad' : 'text-warn')}>
            {d.severity === 'error' ? 'err' : 'warn'}
          </span>
          <span className="font-mono text-faint">L{d.line}</span>
          <span className="text-fg">{d.message}</span>
          {withSource && d.source && <span className="ml-auto text-faint">{d.source}</span>}
        </li>
      ))}
    </ul>
  )
}

function GroupModal({
  group,
  schema,
  onClose,
  onSave,
}: {
  group: GroupDef | null
  schema: EnvSchema
  onClose(): void
  onSave(g: GroupDef): void
}) {
  const [name, setName] = useState(group?.name ?? '')
  const [description, setDescription] = useState(group?.description ?? '')
  const trimmed = name.trim()
  const error =
    trimmed === ''
      ? 'Name is required'
      : trimmed !== group?.name && schema.groups.some((g) => g.name === trimmed)
        ? 'A group with this name exists'
        : null
  const save = () => !error && onSave({ name: trimmed, description: description.trim() })

  return (
    <Modal
      open
      kicker={group ? 'Edit group' : 'New group'}
      title={group ? group.name : 'Create group'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!!error} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Field label="Name" htmlFor="group-name" error={name !== '' ? error : null}>
          <input id="group-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Database" />
        </Field>
        <Field label="Description" htmlFor="group-desc">
          <input id="group-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}

function EmptyDesign({
  onNew,
  onExample,
  onImport,
  editor,
}: {
  onNew(): void
  onExample(): void
  onImport(text: string, name: string): void
  editor: React.ReactNode
}) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 py-6">
      <div className="text-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.35em] text-accent-2">// boot sequence</div>
        <h1 className="mt-3 text-4xl font-bold uppercase tracking-[0.12em] sm:text-5xl">
          One schema. <span className="text-accent text-glow">Every env.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-muted">
          Your annotated <code className="font-mono text-fg">.env.example</code> is the single source of truth — types, rules, groups and
          docs live in comments. Design it here, compose <code className="font-mono text-fg">.env</code> files from it, and audit every
          environment for drift.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Panel kicker="01" title="From scratch" className="h-full">
          <div className="flex h-full flex-col gap-4">
            <p className="text-sm text-muted">Start with an empty schema and add your first variable.</p>
            <Button variant="primary" icon={<Plus size={14} />} onClick={onNew} className="mt-auto">
              New variable
            </Button>
          </div>
        </Panel>
        <Panel kicker="02" title="Import" className="h-full">
          <FileDrop compact title="Drop .env.example" hint="or click to browse" onFiles={(fs) => fs[0] && onImport(fs[0].text, fs[0].name)} testId="empty-import" />
        </Panel>
        <Panel kicker="03" title="Example" className="h-full">
          <div className="flex h-full flex-col gap-4">
            <p className="text-sm text-muted">Load a demo schema with groups, types and rules to explore.</p>
            <Button icon={<Sparkles size={14} />} onClick={onExample} className="mt-auto">
              Load example
            </Button>
          </div>
        </Panel>
      </div>
      <EmptyHint icon={<FileCode2 size={22} />} title="Tip">
        Plain, un-annotated <code className="font-mono">.env.example</code> files work too — every variable is imported as a required
        string, ready to refine.
      </EmptyHint>
      {editor}
    </div>
  )
}

import { useRef, useState } from 'react'
import { ArchiveRestore, CopyPlus, Download, FolderOpen, HardDrive, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { parseSchema } from '../../core'
import { AgentGuidePanel } from '../components/AgentGuide'
import { FileDrop } from '../components/FileDrop'
import { toast } from '../components/Toaster'
import { Button, Confirm, cx, Field, IconButton, Modal, Panel, Segmented } from '../components/ui'
import { exampleProject } from '../lib/example'
import { saveTextFile } from '../lib/files'
import { problemCount } from '../lib/project'
import { exportProject, parseProjectBackup, useStore, type Project } from '../store'

export function ProjectsView() {
  const projects = useStore((s) => s.projects)
  const activeId = useStore((s) => s.activeProjectId)
  const createProject = useStore((s) => s.createProject)
  const openProject = useStore((s) => s.openProject)
  const duplicateProject = useStore((s) => s.duplicateProject)
  const deleteProject = useStore((s) => s.deleteProject)

  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState<Project | null>(null)
  const backupInput = useRef<HTMLInputElement>(null)

  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)

  const restore = async (file: File | undefined) => {
    if (!file) return
    try {
      const p = parseProjectBackup(await file.text())
      createProject({ name: p.name, schema: p.schema, environments: p.environments, rememberSecrets: p.rememberSecrets })
      toast(`Restored ${p.name}`)
    } catch (e) {
      toast((e as Error).message, 'warn')
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.35em] text-accent-2">// workspace</div>
          <h1 className="mt-2 text-3xl font-bold uppercase tracking-[0.12em] sm:text-4xl">
            One schema. <span className="text-accent text-glow">Every env.</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            A project holds one <code className="font-mono text-fg">.env.example</code> schema and the environments built from it —
            development, staging, production…
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<ArchiveRestore size={14} />} onClick={() => backupInput.current?.click()}>
            Restore backup
          </Button>
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
            New project
          </Button>
          <input
            ref={backupInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            data-testid="restore-backup"
            onChange={(e) => void restore(e.target.files?.[0]).then(() => (e.target.value = ''))}
          />
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Panel kicker="01" title="Start a project">
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted">Create an empty project, or import an existing .env.example.</p>
              <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
                New project
              </Button>
            </div>
          </Panel>
          <Panel kicker="02" title="Explore the example">
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted">A demo API with grouped, typed variables and three environments — one of them drifted.</p>
              <Button
                icon={<Sparkles size={14} />}
                onClick={() => {
                  createProject(exampleProject())
                  toast('Created example project')
                }}
              >
                Load example project
              </Button>
            </div>
          </Panel>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((p) => (
            <ProjectCard
              key={p.id}
              p={p}
              active={p.id === activeId}
              onOpen={(view) => openProject(p.id, view)}
              onRename={() => setRenaming(p)}
              onDuplicate={() => {
                duplicateProject(p.id)
                toast(`Duplicated ${p.name}`)
              }}
              onBackup={async () => {
                const r = await saveTextFile(`${slug(p.name)}.envdeck.json`, exportProject(p))
                if (r !== 'cancelled') toast('Backup saved — it contains your values, keep it private', 'warn')
              }}
              onDelete={() => setDeleting(p)}
            />
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <AgentGuidePanel />
        <StorageNote />
      </div>

      {creating && <NewProjectModal onClose={() => setCreating(false)} />}
      {renaming && <RenameModal project={renaming} onClose={() => setRenaming(null)} />}
      {deleting && (
        <Confirm
          title={`Delete ${deleting.name}?`}
          message={
            <>
              The schema and all {deleting.environments.length} environment(s) are removed from this browser. This cannot be undone —
              save a backup first if you may need it.
            </>
          }
          confirmLabel="Delete project"
          onConfirm={() => {
            deleteProject(deleting.id)
            toast(`Deleted ${deleting.name}`, 'info')
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
function ago(ts: number): string {
  const s = Math.round((ts - Date.now()) / 1000)
  const abs = Math.abs(s)
  if (abs < 60) return rtf.format(s, 'second')
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour')
  return rtf.format(Math.round(s / 86400), 'day')
}

function ProjectCard({
  p,
  active,
  onOpen,
  onRename,
  onDuplicate,
  onBackup,
  onDelete,
}: {
  p: Project
  active: boolean
  onOpen(view: 'design' | 'environments' | 'audit'): void
  onRename(): void
  onDuplicate(): void
  onBackup(): void
  onDelete(): void
}) {
  return (
    <div className={cx('panel animate-rise', active && 'panel-accent')} data-testid={`project-${p.name}`}>
      <div className="panel-inner flex flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={() => onOpen('design')} className="min-w-0 text-left cursor-pointer">
            <div className="truncate text-lg font-bold uppercase tracking-[0.12em] hover:text-accent">{p.name}</div>
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">
              {p.schema.variables.length} vars · {p.schema.groups.length} groups · updated {ago(p.updatedAt)}
            </div>
          </button>
          {active && <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent text-glow">● open</span>}
        </div>

        <div className="flex min-h-7 flex-wrap gap-1.5">
          {p.environments.length === 0 && <span className="text-xs text-faint">No environments yet</span>}
          {p.environments.map((e) => {
            const problems = problemCount(p.schema, e)
            return (
              <span
                key={e.id}
                title={problems ? `${problems} value(s) to fix` : 'ready'}
                className="inline-flex items-center gap-1.5 border border-line-strong bg-surface-2 px-2 py-0.5 font-mono text-[11px]"
              >
                <span className={cx('h-1.5 w-1.5', problems ? 'bg-bad' : 'bg-ok')} />
                {e.name}
              </span>
            )
          })}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-1 border-t border-line pt-3">
          <Button size="sm" variant="primary" icon={<FolderOpen size={13} />} onClick={() => onOpen('design')}>
            Open
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onOpen('environments')}>
            Envs
          </Button>
          <div className="ml-auto flex">
            <IconButton label={`Rename ${p.name}`} onClick={onRename}>
              <Pencil size={14} />
            </IconButton>
            <IconButton label={`Duplicate ${p.name}`} onClick={onDuplicate}>
              <CopyPlus size={14} />
            </IconButton>
            <IconButton label={`Back up ${p.name}`} onClick={onBackup}>
              <Download size={14} />
            </IconButton>
            <IconButton label={`Delete ${p.name}`} tone="danger" onClick={onDelete}>
              <Trash2 size={14} />
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  )
}

type Start = 'empty' | 'import' | 'example'

function NewProjectModal({ onClose }: { onClose(): void }) {
  const createProject = useStore((s) => s.createProject)
  const [name, setName] = useState('')
  const [start, setStart] = useState<Start>('empty')
  const [imported, setImported] = useState<{ name: string; text: string } | null>(null)

  const canCreate = start !== 'import' || imported !== null
  const create = () => {
    if (!canCreate) return
    if (start === 'example') {
      const ex = exampleProject()
      createProject({ ...ex, name: name.trim() || ex.name })
    } else if (start === 'import' && imported) {
      const { schema, diagnostics } = parseSchema(imported.text)
      createProject({ name: name.trim() || 'Imported project', schema })
      const errors = diagnostics.filter((d) => d.severity === 'error').length
      if (errors) toast(`${imported.name} has ${errors} error(s) — see Issues in Design`, 'warn')
    } else {
      createProject({ name: name.trim() || 'Untitled project' })
    }
    onClose()
  }

  return (
    <Modal
      open
      kicker="Workspace"
      title="New project"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canCreate} onClick={create}>
            Create
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          create()
        }}
      >
        <Field label="Name" htmlFor="project-name">
          <input id="project-name" className="input" value={name} placeholder="Billing service" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Start from">
          <Segmented
            ariaLabel="Start from"
            value={start}
            onChange={setStart}
            options={[
              { value: 'empty', label: 'Empty' },
              { value: 'import', label: 'Import .env.example' },
              { value: 'example', label: 'Example' },
            ]}
          />
        </Field>
        {start === 'import' && (
          <FileDrop
            compact
            title={imported ? imported.name : 'Drop .env.example'}
            hint={imported ? 'Click to choose another file' : 'or click to browse'}
            onFiles={(fs) => {
              const f = fs[0]
              if (!f) return
              setImported(f)
            }}
            testId="new-project-import"
          />
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}

function RenameModal({ project, onClose }: { project: Project; onClose(): void }) {
  const renameProject = useStore((s) => s.renameProject)
  const [name, setName] = useState(project.name)
  const save = () => {
    if (!name.trim()) return
    renameProject(project.id, name)
    onClose()
  }
  return (
    <Modal
      open
      kicker="Project"
      title="Rename"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!name.trim()} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Field label="Name" htmlFor="rename-project">
          <input id="rename-project" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}

function StorageNote() {
  return (
    <Panel kicker="Storage" title="Where your data lives" bodyClassName="p-4">
      <div className="flex gap-4">
        <HardDrive size={22} className="mt-0.5 shrink-0 text-accent" />
        <ul className="flex flex-col gap-1.5 text-sm text-muted">
          <li>
            Projects, schemas and environment values are saved in this browser's <code className="font-mono text-fg">localStorage</code>
            . Nothing is sent to a server.
          </li>
          <li>
            Values of <span className="text-warn">@sensitive</span> variables stay in memory only, unless you turn on{' '}
            <em>Remember secrets</em> for a project — then they are stored unencrypted.
          </li>
          <li>Clearing site data removes everything. Use backups to move projects between browsers or machines.</li>
        </ul>
      </div>
    </Panel>
  )
}

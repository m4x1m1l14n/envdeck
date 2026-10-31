import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { emptySchema, parseSchema, type Diagnostic, type EnvSchema } from '../core'

export type View = 'projects' | 'design' | 'environments' | 'audit'
export type Theme = 'dark' | 'light'

/** A named set of values for one deployment target, e.g. "production". */
export interface Environment {
  id: string
  name: string
  /** File name used when saving, e.g. `.env.production`. */
  fileName: string
  /** Values typed or loaded; schema keys absent here fall back to the schema default. */
  values: Record<string, string>
}

export interface Project {
  id: string
  name: string
  schema: EnvSchema
  environments: Environment[]
  /** Persist values of @sensitive variables in browser storage. Off by default. */
  rememberSecrets: boolean
  createdAt: number
  updatedAt: number
}

/** A file dropped into Audit; lives in memory only. */
export interface AuditFile {
  id: string
  name: string
  text: string
}

const HISTORY_LIMIT = 100

export interface State {
  view: View
  theme: Theme
  projects: Project[]
  activeProjectId: string | null
  activeEnvId: string | null
  /** Diagnostics from the last import of schema text. */
  importDiagnostics: Diagnostic[]
  /** Undo history of the active project's schema (not persisted). */
  past: EnvSchema[]
  future: EnvSchema[]
  auditFiles: AuditFile[]

  setView(view: View): void
  setTheme(theme: Theme): void

  createProject(input: {
    name: string
    schema?: EnvSchema
    environments?: Omit<Environment, 'id'>[]
    rememberSecrets?: boolean
  }): string
  openProject(id: string, view?: View): void
  renameProject(id: string, name: string): void
  duplicateProject(id: string): string | null
  deleteProject(id: string): void
  setRememberSecrets(id: string, remember: boolean): void

  /** Apply an edit to the active project's schema and record it for undo. */
  commit(next: EnvSchema): void
  /** Replace the active schema from `.env.example` text (undoable). */
  importSchemaText(text: string): Diagnostic[]
  undo(): void
  redo(): void

  addEnvironment(input: { name: string; fileName?: string; values?: Record<string, string> }): string | null
  updateEnvironment(id: string, patch: Partial<Pick<Environment, 'name' | 'fileName'>>): void
  duplicateEnvironment(id: string): string | null
  removeEnvironment(id: string): void
  setActiveEnv(id: string): void
  setEnvValue(envId: string, key: string, value: string): void
  setEnvValues(envId: string, values: Record<string, string>): void
  removeEnvKeys(envId: string, keys: string[]): void

  addAuditFiles(files: Omit<AuditFile, 'id'>[]): void
  removeAuditFile(id: string): void
  clearAuditFiles(): void
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function defaultFileName(envName: string): string {
  const slug = envName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug ? `.env.${slug}` : '.env'
}

/** Pick a name not already used, e.g. "staging (2)". */
export function uniqueName(name: string, taken: string[]): string {
  if (!taken.includes(name)) return name
  let n = 2
  while (taken.includes(`${name} (${n})`)) n++
  return `${name} (${n})`
}

function initialTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

let auditSeq = 1

export const useStore = create<State>()(
  persist<State, [], [], PersistedState>(
    (set, get) => {
      /** Update the active project (or a given one) immutably and bump updatedAt. */
      const updateProject = (id: string | null, fn: (p: Project) => Project) => {
        if (!id) return
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...fn(p), updatedAt: Date.now() } : p)),
        }))
      }
      const active = () => get().projects.find((p) => p.id === get().activeProjectId) ?? null
      const updateEnv = (envId: string, fn: (e: Environment) => Environment) =>
        updateProject(get().activeProjectId, (p) => ({
          ...p,
          environments: p.environments.map((e) => (e.id === envId ? fn(e) : e)),
        }))

      return {
        view: 'projects',
        theme: initialTheme(),
        projects: [],
        activeProjectId: null,
        activeEnvId: null,
        importDiagnostics: [],
        past: [],
        future: [],
        auditFiles: [],

        setView: (view) => set({ view }),
        setTheme: (theme) => set({ theme }),

        createProject: ({ name, schema, environments = [], rememberSecrets = false }) => {
          const now = Date.now()
          const project: Project = {
            id: newId(),
            name: uniqueName(name.trim() || 'Untitled project', get().projects.map((p) => p.name)),
            schema: schema ?? emptySchema(),
            environments: environments.map((e) => ({ ...e, id: newId() })),
            rememberSecrets,
            createdAt: now,
            updatedAt: now,
          }
          set((s) => ({ projects: [...s.projects, project] }))
          get().openProject(project.id, 'design')
          return project.id
        },

        openProject: (id, view) => {
          const p = get().projects.find((x) => x.id === id)
          if (!p) return
          set({
            activeProjectId: id,
            activeEnvId: p.environments[0]?.id ?? null,
            past: [],
            future: [],
            importDiagnostics: [],
            auditFiles: [],
            ...(view ? { view } : {}),
          })
        },

        renameProject: (id, name) => updateProject(id, (p) => ({ ...p, name: name.trim() || p.name })),

        duplicateProject: (id) => {
          const src = get().projects.find((p) => p.id === id)
          if (!src) return null
          const now = Date.now()
          const copy: Project = {
            ...structuredClone(src),
            id: newId(),
            name: uniqueName(`${src.name} copy`, get().projects.map((p) => p.name)),
            environments: src.environments.map((e) => ({ ...structuredClone(e), id: newId() })),
            createdAt: now,
            updatedAt: now,
          }
          set((s) => ({ projects: [...s.projects, copy] }))
          return copy.id
        },

        deleteProject: (id) =>
          set((s) => {
            const projects = s.projects.filter((p) => p.id !== id)
            if (s.activeProjectId !== id) return { projects }
            return { projects, activeProjectId: null, activeEnvId: null, past: [], future: [], view: 'projects' }
          }),

        setRememberSecrets: (id, remember) => updateProject(id, (p) => ({ ...p, rememberSecrets: remember })),

        commit: (next) => {
          const p = active()
          if (!p || next === p.schema) return
          set({ past: [...get().past, p.schema].slice(-HISTORY_LIMIT), future: [] })
          updateProject(p.id, (x) => ({ ...x, schema: next }))
        },

        importSchemaText: (text) => {
          const { schema, diagnostics } = parseSchema(text)
          get().commit(schema)
          set({ importDiagnostics: diagnostics })
          return diagnostics
        },

        undo: () => {
          const p = active()
          const prev = get().past.at(-1)
          if (!p || !prev) return
          set({ past: get().past.slice(0, -1), future: [p.schema, ...get().future] })
          updateProject(p.id, (x) => ({ ...x, schema: prev }))
        },

        redo: () => {
          const p = active()
          const [next, ...rest] = get().future
          if (!p || !next) return
          set({ past: [...get().past, p.schema], future: rest })
          updateProject(p.id, (x) => ({ ...x, schema: next }))
        },

        addEnvironment: ({ name, fileName, values = {} }) => {
          const p = active()
          if (!p) return null
          const finalName = uniqueName(name.trim() || 'environment', p.environments.map((e) => e.name))
          const env: Environment = { id: newId(), name: finalName, fileName: fileName?.trim() || defaultFileName(finalName), values }
          updateProject(p.id, (x) => ({ ...x, environments: [...x.environments, env] }))
          set({ activeEnvId: env.id })
          return env.id
        },

        updateEnvironment: (id, patch) => updateEnv(id, (e) => ({ ...e, ...patch })),

        duplicateEnvironment: (id) => {
          const p = active()
          const src = p?.environments.find((e) => e.id === id)
          if (!p || !src) return null
          return get().addEnvironment({ name: `${src.name} copy`, values: { ...src.values } })
        },

        removeEnvironment: (id) => {
          const p = active()
          if (!p) return
          const remaining = p.environments.filter((e) => e.id !== id)
          updateProject(p.id, (x) => ({ ...x, environments: remaining }))
          if (get().activeEnvId === id) set({ activeEnvId: remaining[0]?.id ?? null })
        },

        setActiveEnv: (id) => set({ activeEnvId: id }),

        setEnvValue: (envId, key, value) => updateEnv(envId, (e) => ({ ...e, values: { ...e.values, [key]: value } })),
        setEnvValues: (envId, values) => updateEnv(envId, (e) => ({ ...e, values })),
        removeEnvKeys: (envId, keys) =>
          updateEnv(envId, (e) => ({
            ...e,
            values: Object.fromEntries(Object.entries(e.values).filter(([k]) => !keys.includes(k))),
          })),

        addAuditFiles: (files) =>
          set((s) => ({ auditFiles: [...s.auditFiles, ...files.map((f) => ({ ...f, id: `f${auditSeq++}` }))] })),
        removeAuditFile: (id) => set((s) => ({ auditFiles: s.auditFiles.filter((f) => f.id !== id) })),
        clearAuditFiles: () => set({ auditFiles: [] }),
      }
    },
    {
      name: 'envdeck',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: persistedState,
      migrate: migrateState,
    },
  ),
)

export type PersistedState = Pick<State, 'view' | 'theme' | 'projects' | 'activeProjectId' | 'activeEnvId'>

/**
 * What goes to localStorage: projects and UI preferences. Values of @sensitive
 * variables are dropped unless the project opted in with `rememberSecrets`.
 * Audit files and undo history are never stored.
 */
export function persistedState(s: PersistedState): PersistedState {
  return {
    view: s.view,
    theme: s.theme,
    activeProjectId: s.activeProjectId,
    activeEnvId: s.activeEnvId,
    projects: s.projects.map((p) => (p.rememberSecrets ? p : withoutSecrets(p))),
  }
}

export function withoutSecrets(p: Project): Project {
  const sensitive = new Set(p.schema.variables.filter((v) => v.sensitive).map((v) => v.key))
  if (sensitive.size === 0) return p
  return {
    ...p,
    environments: p.environments.map((e) => ({
      ...e,
      values: Object.fromEntries(Object.entries(e.values).filter(([k]) => !sensitive.has(k))),
    })),
  }
}

/** Upgrade older persisted shapes. v1 had a single schema and no projects. */
export function migrateState(persisted: unknown, version: number): PersistedState {
  const old = (persisted ?? {}) as Record<string, unknown>
  if (version < 2) {
    const schema = old.schema as EnvSchema | undefined
    const hasSchema = !!schema && (schema.variables.length > 0 || schema.groups.length > 0)
    const now = Date.now()
    const project: Project | null = hasSchema
      ? {
          id: newId(),
          name: 'My project',
          schema: schema!,
          environments: [],
          rememberSecrets: false,
          createdAt: now,
          updatedAt: now,
        }
      : null
    return {
      view: project ? 'design' : 'projects',
      theme: (old.theme as Theme) ?? initialTheme(),
      projects: project ? [project] : [],
      activeProjectId: project?.id ?? null,
      activeEnvId: null,
    }
  }
  return old as unknown as PersistedState
}

/** The active project, or null. */
export function useActiveProject(): Project | null {
  return useStore((s) => s.projects.find((p) => p.id === s.activeProjectId) ?? null)
}

const EMPTY = emptySchema()
/** Schema of the active project (an empty schema when none is open). */
export function useSchema(): EnvSchema {
  return useStore((s) => s.projects.find((p) => p.id === s.activeProjectId)?.schema ?? EMPTY)
}

/** Effective value: what the user typed, or the schema default. */
export function effectiveValue(values: Record<string, string>, key: string, fallback: string): string {
  return Object.prototype.hasOwnProperty.call(values, key) ? (values[key] as string) : fallback
}

// ── Backups ──────────────────────────────────────────────────────

export const BACKUP_FORMAT = 'envdeck-project'

export function exportProject(p: Project): string {
  const { id: _id, ...rest } = p
  return `${JSON.stringify({ format: BACKUP_FORMAT, version: 1, project: rest }, null, 2)}\n`
}

/** Parse a backup file; throws with a readable message when it is not one. */
export function parseProjectBackup(text: string): Omit<Project, 'id'> {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Not a JSON file')
  }
  const d = data as { format?: string; project?: Partial<Project> }
  const p = d.project
  if (d.format !== BACKUP_FORMAT || !p || typeof p.name !== 'string' || !p.schema || !Array.isArray(p.environments)) {
    throw new Error('Not an EnvDeck project backup')
  }
  return {
    name: p.name,
    schema: p.schema,
    environments: p.environments.map((e) => ({ ...e, id: newId(), values: { ...(e.values ?? {}) } })),
    rememberSecrets: !!p.rememberSecrets,
    createdAt: p.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  }
}

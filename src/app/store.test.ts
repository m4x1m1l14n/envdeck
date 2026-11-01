// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { parseSchema } from '../core'
import { environmentAsFile, problemCount, strayKeys } from './lib/project'
import {
  defaultFileName,
  exportProject,
  migrateState,
  parseProjectBackup,
  persistedState,
  uniqueName,
  useStore,
  type Project,
} from './store'

const { schema } = parseSchema(`
# @required
APP_NAME=demo

# @required @sensitive @type=string(minLength=8)
API_KEY=

# @optional @type=integer
WORKERS=2
`)

const initial = useStore.getState()

beforeEach(() => {
  localStorage.clear()
  useStore.setState({ ...initial, projects: [], activeProjectId: null, activeEnvId: null, past: [], future: [] }, true)
})

const state = () => useStore.getState()
const active = () => state().projects.find((p) => p.id === state().activeProjectId) as Project

describe('projects', () => {
  it('creates, opens, renames, duplicates and deletes projects', () => {
    const id = state().createProject({ name: 'Billing', schema })
    expect(state().activeProjectId).toBe(id)
    expect(state().view).toBe('design')

    state().renameProject(id, 'Billing API')
    expect(active().name).toBe('Billing API')

    const copy = state().duplicateProject(id) as string
    const dup = state().projects.find((p) => p.id === copy)!
    expect(dup.name).toBe('Billing API copy')
    expect(dup.schema).toEqual(active().schema)

    state().deleteProject(id)
    expect(state().activeProjectId).toBeNull()
    expect(state().view).toBe('projects')
    expect(state().projects.map((p) => p.id)).toEqual([copy])
  })

  it('keeps project names unique', () => {
    state().createProject({ name: 'App' })
    state().createProject({ name: 'App' })
    expect(state().projects.map((p) => p.name)).toEqual(['App', 'App (2)'])
  })

  it('records schema edits per project with undo/redo, and resets history on switch', () => {
    const a = state().createProject({ name: 'A' })
    state().commit(schema)
    expect(active().schema.variables).toHaveLength(3)
    state().undo()
    expect(active().schema.variables).toHaveLength(0)
    state().redo()
    expect(active().schema.variables).toHaveLength(3)

    state().createProject({ name: 'B' })
    expect(state().past).toEqual([])
    state().openProject(a)
    expect(active().name).toBe('A')
  })
})

describe('environments', () => {
  beforeEach(() => {
    state().createProject({ name: 'P', schema })
  })

  it('adds environments with default file names and switches to them', () => {
    const id = state().addEnvironment({ name: 'production' })!
    expect(active().environments[0]).toMatchObject({ id, name: 'production', fileName: '.env.production', values: {} })
    expect(state().activeEnvId).toBe(id)
  })

  it('edits, duplicates and removes environments', () => {
    const id = state().addEnvironment({ name: 'staging' })!
    state().setEnvValue(id, 'APP_NAME', 'stg')
    state().updateEnvironment(id, { fileName: '.env.stg' })
    const copy = state().duplicateEnvironment(id)!
    const envs = active().environments
    expect(envs.map((e) => e.name)).toEqual(['staging', 'staging copy'])
    expect(envs[1]?.values).toEqual({ APP_NAME: 'stg' })

    state().removeEnvironment(copy)
    expect(active().environments.map((e) => e.id)).toEqual([id])
    expect(state().activeEnvId).toBe(id)
  })

  it('removes stray keys', () => {
    const id = state().addEnvironment({ name: 'dev', values: { APP_NAME: 'x', OLD_KEY: '1' } })!
    expect(strayKeys(active().schema, active().environments[0]!)).toEqual(['OLD_KEY'])
    state().removeEnvKeys(id, ['OLD_KEY'])
    expect(active().environments[0]?.values).toEqual({ APP_NAME: 'x' })
  })
})

describe('persistence', () => {
  const project = (rememberSecrets: boolean): Project => ({
    id: 'p1',
    name: 'P',
    schema,
    rememberSecrets,
    createdAt: 0,
    updatedAt: 0,
    environments: [{ id: 'e1', name: 'prod', fileName: '.env.prod', values: { APP_NAME: 'app', API_KEY: 'super-secret' } }],
  })
  const base = { view: 'design' as const, theme: 'dark' as const, activeProjectId: 'p1', activeEnvId: 'e1' }

  it('drops sensitive values unless the project opts in', () => {
    const off = persistedState({ ...base, projects: [project(false)] })
    expect(off.projects[0]?.environments[0]?.values).toEqual({ APP_NAME: 'app' })
    const on = persistedState({ ...base, projects: [project(true)] })
    expect(on.projects[0]?.environments[0]?.values).toEqual({ APP_NAME: 'app', API_KEY: 'super-secret' })
  })

  it('remembers the generated .env output settings', () => {
    const envOutput = { comments: 'none' as const, includeUnsetOptional: false }
    expect(persistedState({ ...base, envOutput, projects: [] }).envOutput).toEqual(envOutput)
  })

  it('never writes secrets, audit files or history to localStorage', () => {
    state().createProject({ name: 'P', schema })
    const env = state().addEnvironment({ name: 'prod' })!
    state().setEnvValue(env, 'API_KEY', 'super-secret')
    state().setEnvValue(env, 'APP_NAME', 'visible')
    state().addAuditFiles([{ name: '.env', text: 'X=from-audit-file' }])
    const stored = localStorage.getItem('envdeck') ?? ''
    expect(stored).toContain('visible')
    expect(stored).not.toContain('super-secret')
    expect(stored).not.toContain('from-audit-file')
    expect(stored).not.toContain('"past"')
  })

  it('migrates the v1 single-schema state into a project', () => {
    const migrated = migrateState({ view: 'compose', theme: 'light', schema, composeTarget: '.env' }, 1)
    expect(migrated.theme).toBe('light')
    expect(migrated.view).toBe('design')
    expect(migrated.projects).toHaveLength(1)
    expect(migrated.projects[0]).toMatchObject({ name: 'My project', schema, environments: [] })
    expect(migrated.activeProjectId).toBe(migrated.projects[0]?.id)
  })

  it('migrates an empty v1 state to no projects', () => {
    const migrated = migrateState({ theme: 'dark', schema: { description: '', defaultRequired: true, groups: [], variables: [] } }, 1)
    expect(migrated.projects).toEqual([])
    expect(migrated.view).toBe('projects')
  })
})

describe('backups', () => {
  it('round-trips a project', () => {
    state().createProject({ name: 'Backup me', schema })
    state().addEnvironment({ name: 'prod', values: { APP_NAME: 'x' } })
    const restored = parseProjectBackup(exportProject(active()))
    expect(restored.name).toBe('Backup me')
    expect(restored.schema).toEqual(schema)
    expect(restored.environments[0]).toMatchObject({ name: 'prod', values: { APP_NAME: 'x' } })
    expect(restored.environments[0]?.id).not.toBe(active().environments[0]?.id)
  })

  it('rejects files that are not backups', () => {
    expect(() => parseProjectBackup('nope')).toThrow('Not a JSON file')
    expect(() => parseProjectBackup('{"format":"other"}')).toThrow('Not an EnvDeck project backup')
  })
})

describe('helpers', () => {
  it('builds file names and unique names', () => {
    expect(defaultFileName('Production EU')).toBe('.env.production-eu')
    expect(defaultFileName('')).toBe('.env')
    expect(uniqueName('a', ['a', 'a (2)'])).toBe('a (3)')
  })

  it('audits stored environments using defaults for untouched keys', () => {
    const env = { values: { API_KEY: 'short', LEGACY: '1' } }
    expect(problemCount(schema, env)).toBe(1)
    expect(environmentAsFile(schema, env).entries.map((e) => [e.key, e.value])).toEqual([
      ['APP_NAME', 'demo'],
      ['API_KEY', 'short'],
      ['WORKERS', '2'],
      ['LEGACY', '1'],
    ])
  })
})

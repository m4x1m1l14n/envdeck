import { Moon, Sun, ShieldCheck, Undo2, Redo2 } from 'lucide-react'
import { useStore, type View } from '../store'
import { cx, IconButton } from './ui'

const TABS: { view: View; n: string; label: string; hint: string }[] = [
  { view: 'projects', n: '00', label: 'Projects', hint: 'Your projects in this browser' },
  { view: 'design', n: '01', label: 'Design', hint: 'Build the .env.example schema' },
  { view: 'environments', n: '02', label: 'Environments', hint: 'Fill in values per environment and save .env files' },
  { view: 'audit', n: '03', label: 'Audit', hint: 'Compare environments and .env files against the schema' },
]

export function Header() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const projects = useStore((s) => s.projects)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const openProject = useStore((s) => s.openProject)

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Logo />
          <div className="leading-tight">
            <div className="glitch text-xl font-bold tracking-[0.22em]" data-text="ENVDECK">
              ENV<span className="text-accent text-glow">DECK</span>
            </div>
            <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
              <ShieldCheck size={11} className="text-ok" /> local only · nothing leaves this tab
            </div>
          </div>
        </div>

        <nav aria-label="Views" className="order-3 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto">
          {TABS.map((t) => {
            const active = t.view === view
            const needsProject = t.view !== 'projects' && !activeProjectId
            return (
              <button
                key={t.view}
                type="button"
                disabled={needsProject}
                title={needsProject ? 'Open a project first' : undefined}
                aria-current={active ? 'page' : undefined}
                onClick={() => setView(t.view)}
                className={cx(
                  'relative flex items-baseline gap-2 px-4 py-2 text-sm font-bold uppercase tracking-[0.18em] whitespace-nowrap transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-35',
                  active ? 'text-fg' : 'text-muted hover:text-fg',
                )}
              >
                <span className={cx('font-mono text-[10px]', active ? 'text-accent-2' : 'text-faint')}>{t.n}</span>
                {t.label}
                <span className="sr-only"> — {t.hint}</span>
                <span
                  className={cx(
                    'absolute right-2 bottom-0 left-2 h-[2px] transition-all',
                    active ? 'bg-accent shadow-[0_0_10px_var(--accent)]' : 'bg-transparent',
                  )}
                />
              </button>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          {projects.length > 0 && (
            <select
              aria-label="Active project"
              className="input mr-2 h-9 w-auto max-w-[14rem] py-1 font-mono text-xs"
              value={activeProjectId ?? ''}
              onChange={(e) => (e.target.value ? openProject(e.target.value, view === 'projects' ? 'design' : undefined) : undefined)}
            >
              {!activeProjectId && <option value="">— choose project —</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <IconButton label="Undo schema change (⌘Z)" disabled={!canUndo} onClick={undo}>
            <Undo2 size={17} />
          </IconButton>
          <IconButton label="Redo schema change (⌘⇧Z)" disabled={!canRedo} onClick={redo}>
            <Redo2 size={17} />
          </IconButton>
          <div className="mx-2 h-6 w-px bg-line" />
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            className="clip-corner-sm flex h-9 items-center gap-2 border border-line-strong bg-surface-2 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted transition-colors hover:border-accent hover:text-accent cursor-pointer"
          >
            {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
            {theme}
          </button>
        </div>
      </div>
    </header>
  )
}

function Logo() {
  return (
    <svg width="38" height="38" viewBox="0 0 64 64" aria-hidden="true" className="drop-shadow-[0_0_8px_color-mix(in_srgb,var(--accent)_50%,transparent)]">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <path d="M4 4h44l12 12v44H16L4 48z" fill="var(--surface-2)" stroke="url(#logo-g)" strokeWidth="3" />
      <path d="M18 20h20M18 32h14M18 44h22" stroke="url(#logo-g)" strokeWidth="5" />
      <rect x="44" y="40" width="6" height="8" fill="var(--accent-3)" className="animate-pulse-dot" />
    </svg>
  )
}

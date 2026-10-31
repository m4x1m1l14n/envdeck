import { useEffect } from 'react'
import { Header } from './components/Header'
import { Toaster } from './components/Toaster'
import { useStore } from './store'
import { AuditView } from './views/AuditView'
import { DesignView } from './views/DesignView'
import { EnvironmentsView } from './views/EnvironmentsView'
import { ProjectsView } from './views/ProjectsView'

export function App() {
  const storedView = useStore((s) => s.view)
  const hasProject = useStore((s) => s.projects.some((p) => p.id === s.activeProjectId))
  // Project views need an open project; fall back to the project list.
  const view = hasProject ? storedView : 'projects'
  const theme = useStore((s) => s.theme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Undo / redo schema edits, unless the user is typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      e.preventDefault()
      const { undo, redo } = useStore.getState()
      if (e.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6">
        {view === 'projects' && <ProjectsView />}
        {view === 'design' && <DesignView />}
        {view === 'environments' && <EnvironmentsView />}
        {view === 'audit' && <AuditView />}
      </main>
      <footer className="border-t border-line py-4 text-center font-mono text-[10px] uppercase tracking-[0.25em] text-faint">
        EnvDeck · schema-driven env files · runs entirely in your browser
      </footer>
      <Toaster />
    </div>
  )
}

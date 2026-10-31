import { create } from 'zustand'
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import { cx } from './ui'

type ToastTone = 'ok' | 'warn' | 'info'
interface Toast {
  id: number
  tone: ToastTone
  message: string
}

const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }))
let seq = 0

export function toast(message: string, tone: ToastTone = 'ok') {
  const id = ++seq
  useToasts.setState((s) => ({ toasts: [...s.toasts, { id, tone, message }].slice(-4) }))
  setTimeout(() => useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3200)
}

const ICONS = { ok: CheckCircle2, warn: AlertTriangle, info: Info }
const TONES = { ok: 'border-ok text-ok', warn: 'border-warn text-warn', info: 'border-accent text-accent' }

export function Toaster() {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex flex-col items-end gap-2">
      {toasts.map((t) => {
        const Icon = ICONS[t.tone]
        return (
          <div
            key={t.id}
            className={cx(
              'clip-corner-sm animate-rise flex items-center gap-2 border-l-2 bg-surface-2 px-4 py-2.5 text-sm shadow-lg backdrop-blur',
              TONES[t.tone],
            )}
          >
            <Icon size={16} />
            <span className="text-fg">{t.message}</span>
          </div>
        )
      })}
    </div>
  )
}

import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { X } from 'lucide-react'

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
export { cx }

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-on-accent hover:brightness-110 hover:shadow-[0_0_18px_color-mix(in_srgb,var(--accent)_60%,transparent)]',
  secondary:
    'bg-surface-3 text-fg border border-line-strong hover:border-accent hover:text-accent',
  ghost: 'text-muted hover:text-accent hover:bg-surface-3',
  danger: 'bg-transparent text-bad border border-bad/60 hover:bg-bad hover:text-on-accent',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  icon?: ReactNode
}

export function Button({ variant = 'secondary', size = 'md', icon, className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        'clip-corner-sm inline-flex items-center justify-center gap-2 font-semibold uppercase tracking-[0.12em] transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-none cursor-pointer select-none whitespace-nowrap',
        size === 'sm' ? 'h-8 px-3 text-[11px]' : 'h-10 px-4 text-xs',
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  tone?: 'default' | 'danger'
}

export function IconButton({ label, tone = 'default', className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-8 w-8 items-center justify-center text-muted transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed',
        tone === 'danger' ? 'hover:text-bad' : 'hover:text-accent',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

interface PanelProps {
  title?: ReactNode
  kicker?: string
  actions?: ReactNode
  accent?: boolean
  className?: string
  bodyClassName?: string
  children: ReactNode
}

export function Panel({ title, kicker, actions, accent, className, bodyClassName, children }: PanelProps) {
  return (
    <section className={cx('panel', accent && 'panel-accent', className)}>
      <div className="panel-inner flex flex-col">
        {(title || actions) && (
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              {kicker && <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-accent-2">{kicker}</div>}
              {title && <h2 className="truncate text-sm font-bold uppercase tracking-[0.18em]">{title}</h2>}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
          </header>
        )}
        <div className={cx('min-h-0 flex-1', bodyClassName ?? 'p-4')}>{children}</div>
      </div>
    </section>
  )
}

export type Tone = 'accent' | 'accent2' | 'ok' | 'bad' | 'warn' | 'muted' | 'yellow'

const CHIP_TONES: Record<Tone, string> = {
  accent: 'text-accent border-accent/50 bg-accent/10',
  accent2: 'text-accent-2 border-accent-2/50 bg-accent-2/10',
  ok: 'text-ok border-ok/50 bg-ok/10',
  bad: 'text-bad border-bad/50 bg-bad/10',
  warn: 'text-warn border-warn/50 bg-warn/10',
  muted: 'text-muted border-line-strong bg-surface-3/60',
  yellow: 'text-on-accent border-accent-3 bg-accent-3 dark:text-[#05060b]',
}

export function Chip({
  tone = 'muted',
  children,
  title,
  className,
  verbatim,
}: {
  tone?: Tone
  children: ReactNode
  title?: string
  className?: string
  /** Keep the text's case (for values like regexes or enum members). */
  verbatim?: boolean
}) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1 border px-1.5 py-[1px] font-mono text-[10px] font-semibold tracking-wider whitespace-nowrap',
        !verbatim && 'uppercase',
        CHIP_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

interface SegmentedProps<T extends string> {
  value: T
  options: { value: NoInfer<T>; label: ReactNode; title?: string }[]
  onChange(value: NoInfer<T>): void
  size?: 'sm' | 'md'
  ariaLabel: string
  className?: string
}

export function Segmented<T extends string>({ value, options, onChange, size = 'md', ariaLabel, className }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cx('inline-flex flex-wrap border border-line bg-surface-2 p-0.5', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider transition-colors cursor-pointer',
              size === 'sm' ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-[11px]',
              active ? 'bg-accent text-on-accent' : 'text-muted hover:text-fg',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange(v: boolean): void; label: string; description?: string }) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 select-none">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-5 w-9 shrink-0 border transition-colors cursor-pointer',
          checked ? 'border-accent bg-accent/20 glow' : 'border-line-strong bg-surface-2',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-3.5 w-3.5 transition-all',
            checked ? 'left-[18px] bg-accent' : 'left-0.5 bg-faint',
          )}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-xs font-semibold uppercase tracking-wider">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
    </label>
  )
}

export function Field({ label, hint, error, children, htmlFor, className }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-bad">{error}</p> : hint ? <p className="text-xs text-faint">{hint}</p> : null}
    </div>
  )
}

interface ModalProps {
  open: boolean
  title: ReactNode
  kicker?: string
  onClose(): void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

export function Modal({ open, title, kicker, onClose, children, footer, wide }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} className={cx('panel panel-accent animate-rise w-full', wide ? 'max-w-4xl' : 'max-w-xl')}>
        <div className="panel-inner flex flex-col" style={{ background: 'var(--surface-2)' }}>
          <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              {kicker && <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-accent-2">{kicker}</div>}
              <h2 className="text-base font-bold uppercase tracking-[0.15em]">{title}</h2>
            </div>
            <IconButton label="Close" onClick={onClose}>
              <X size={18} />
            </IconButton>
          </header>
          <div className="px-5 py-5">{children}</div>
          {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4">{footer}</footer>}
        </div>
      </div>
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="border border-line-strong bg-surface-3 px-1 font-mono text-[10px] text-muted">{children}</kbd>
}

export function EmptyHint({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="text-accent opacity-80">{icon}</div>
      <div className="text-sm font-bold uppercase tracking-[0.2em]">{title}</div>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  )
}

interface ConfirmProps {
  title: string
  message: ReactNode
  confirmLabel: string
  onConfirm(): void
  onClose(): void
}

/** Confirmation dialog for destructive actions that cannot be undone. */
export function Confirm({ title, message, confirmLabel, onConfirm, onClose }: ConfirmProps) {
  return (
    <Modal
      open
      kicker="Confirm"
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-muted">{message}</div>
    </Modal>
  )
}

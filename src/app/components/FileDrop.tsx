import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Upload } from 'lucide-react'
import { readFiles } from '../lib/files'
import { cx } from './ui'

interface FileDropProps {
  multiple?: boolean
  onFiles(files: { name: string; text: string }[]): void
  title: string
  hint?: ReactNode
  compact?: boolean
  testId?: string
}

export function FileDrop({ multiple, onFiles, title, hint, compact, testId }: FileDropProps) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const handle = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    onFiles(await readFiles(list))
    if (input.current) input.current.value = ''
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        void handle(e.dataTransfer.files)
      }}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          input.current?.click()
        }
      }}
      role="button"
      tabIndex={0}
      className={cx(
        'group flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed text-center transition-all',
        compact ? 'px-4 py-4' : 'px-6 py-10',
        over ? 'border-accent bg-accent/10 glow' : 'border-line-strong hover:border-accent hover:bg-accent/5',
      )}
    >
      <Upload size={compact ? 18 : 26} className={cx('transition-colors', over ? 'text-accent' : 'text-muted group-hover:text-accent')} />
      <div className="text-xs font-bold uppercase tracking-[0.2em]">{title}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
      <input
        ref={input}
        data-testid={testId}
        type="file"
        multiple={multiple}
        className="hidden"
        onChange={(e) => void handle(e.target.files)}
      />
    </div>
  )
}

/**
 * Accept a file dropped anywhere on the page while `enabled`. Returns whether a
 * file is being dragged over the window, for showing an overlay.
 */
export function useWindowFileDrop(enabled: boolean, onFile: (file: { name: string; text: string }) => void): boolean {
  const [dragging, setDragging] = useState(false)
  const handler = useRef(onFile)
  handler.current = onFile

  useEffect(() => {
    if (!enabled) return
    let depth = 0
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth++
      setDragging(true)
    }
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      const files = e.dataTransfer?.files
      if (files && files.length > 0) void readFiles([files[0] as File]).then(([f]) => f && handler.current(f))
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
      setDragging(false)
    }
  }, [enabled])

  return dragging
}

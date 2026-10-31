interface SaveFilePickerWindow {
  showSaveFilePicker?: (options: {
    suggestedName?: string
    types?: { description: string; accept: Record<string, string[]> }[]
  }) => Promise<{ createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }> }>
}

export type SaveResult = 'saved' | 'downloaded' | 'cancelled'

/**
 * Save text to a file. Uses the File System Access API where available (so
 * dotfiles like `.env` keep their name), otherwise falls back to a download.
 */
export async function saveTextFile(name: string, text: string): Promise<SaveResult> {
  const w = window as unknown as SaveFilePickerWindow
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({ suggestedName: name })
      const writable = await handle.createWritable()
      await writable.write(text)
      await writable.close()
      return 'saved'
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled'
      // Some browsers reject dotfile names in suggestedName — fall back to a download.
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export async function readFiles(list: FileList | File[]): Promise<{ name: string; text: string }[]> {
  return Promise.all([...list].map(async (f) => ({ name: f.name, text: await f.text() })))
}

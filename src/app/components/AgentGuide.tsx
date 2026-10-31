import { create } from 'zustand'
import { Bot, Check, Copy, Download, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import agentGuide from '../../../docs/agents/ENVDECK.md?raw'
import { copyText, saveTextFile } from '../lib/files'
import { AGENT_GUIDE_URL } from '../lib/links'
import { toast } from './Toaster'
import { Button, cx, Modal, Panel } from './ui'

export const AGENT_GUIDE_FILE = 'ENVDECK.md'

/** Line to add to AGENTS.md / CLAUDE.md / .cursorrules so agents pick up the guide. */
export const AGENT_SNIPPET =
  'Environment variables follow the rules in ENVDECK.md. Read it before adding, renaming or removing any env var.'

const useGuide = create<{ open: boolean }>(() => ({ open: false }))
export const openAgentGuide = () => useGuide.setState({ open: true })

async function copyGuide() {
  toast((await copyText(agentGuide)) ? `Copied ${AGENT_GUIDE_FILE} to clipboard` : 'Clipboard unavailable', 'ok')
}

async function downloadGuide() {
  const r = await saveTextFile(AGENT_GUIDE_FILE, agentGuide)
  if (r !== 'cancelled') toast(`Saved ${AGENT_GUIDE_FILE} — put it next to .env.example`)
}

/** The three actions: copy, download, view on GitHub. */
export function AgentGuideActions({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size={size} variant="primary" icon={<Copy size={14} />} onClick={copyGuide}>
        Copy guide
      </Button>
      <Button size={size} icon={<Download size={14} />} onClick={downloadGuide}>
        Download {AGENT_GUIDE_FILE}
      </Button>
      <a
        href={AGENT_GUIDE_URL}
        target="_blank"
        rel="noreferrer"
        className={cx(
          'clip-corner-sm inline-flex items-center gap-2 border border-line-strong bg-surface-3 font-semibold uppercase tracking-[0.12em] text-fg transition-colors hover:border-accent hover:text-accent',
          size === 'sm' ? 'h-8 px-3 text-[11px]' : 'h-10 px-4 text-xs',
        )}
      >
        <ExternalLink size={14} /> View on GitHub
      </a>
    </div>
  )
}

function SnippetCopy() {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-stretch border border-line bg-surface">
      <code className="min-w-0 flex-1 px-3 py-2 font-mono text-xs break-words text-fg">{AGENT_SNIPPET}</code>
      <button
        type="button"
        aria-label="Copy snippet"
        title="Copy snippet"
        className="flex w-10 shrink-0 cursor-pointer items-center justify-center border-l border-line text-muted hover:text-accent"
        onClick={async () => {
          if (await copyText(AGENT_SNIPPET)) {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }
        }}
      >
        {copied ? <Check size={15} className="text-ok" /> : <Copy size={15} />}
      </button>
    </div>
  )
}

/** Mounted once in App; opened from anywhere with `openAgentGuide()`. */
export function AgentGuideModal() {
  const open = useGuide((s) => s.open)
  if (!open) return null
  return (
    <Modal open wide kicker="For coding agents" title="AI agent guide" onClose={() => useGuide.setState({ open: false })}>
      <div className="flex flex-col gap-5">
        <p className="text-sm text-muted">
          <code className="font-mono text-fg">{AGENT_GUIDE_FILE}</code> teaches AI coding agents (Claude Code, Cursor, Copilot, Codex…)
          to keep your <code className="font-mono text-fg">.env.example</code> in EnvDeck format: declare every variable, never commit
          secrets, never touch real <code className="font-mono text-fg">.env</code> files, pick the narrowest type and flag breaking
          renames.
        </p>
        <ol className="flex flex-col gap-3 text-sm">
          <li className="flex gap-3">
            <Step n={1} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <span>
                Save <code className="font-mono text-accent">{AGENT_GUIDE_FILE}</code> next to your{' '}
                <code className="font-mono">.env.example</code>.
              </span>
              <AgentGuideActions size="sm" />
            </div>
          </li>
          <li className="flex gap-3">
            <Step n={2} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <span>
                Point your agent at it — add this line to <code className="font-mono">AGENTS.md</code>,{' '}
                <code className="font-mono">CLAUDE.md</code> or <code className="font-mono">.cursorrules</code>:
              </span>
              <SnippetCopy />
            </div>
          </li>
        </ol>
        <div>
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Preview</div>
          <pre
            aria-label="Agent guide preview"
            tabIndex={0}
            className="max-h-[40vh] overflow-auto border border-line bg-surface p-4 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-fg"
          >
            {agentGuide}
          </pre>
        </div>
      </div>
    </Modal>
  )
}

function Step({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-accent-2/60 font-mono text-xs text-accent-2">{n}</span>
  )
}

/** Card for the Projects page. */
export function AgentGuidePanel() {
  return (
    <Panel kicker="AI agents" title="Keep agents on-format" bodyClassName="p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Bot size={22} className="mt-0.5 shrink-0 text-accent" />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <p className="text-sm text-muted">
            Drop <code className="font-mono text-fg">{AGENT_GUIDE_FILE}</code> into your repo so coding agents follow the schema rules
            when they add or change environment variables.{' '}
            <button type="button" className="cursor-pointer text-accent underline-offset-2 hover:underline" onClick={openAgentGuide}>
              How to set it up
            </button>
          </p>
          <AgentGuideActions size="sm" />
        </div>
      </div>
    </Panel>
  )
}

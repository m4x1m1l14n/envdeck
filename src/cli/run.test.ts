import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { EXIT_FAIL, EXIT_OK, EXIT_USAGE, run, type CliIO } from './run'

const example = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../examples/${name}`, import.meta.url)), 'utf8')

function memoryIO(files: Record<string, string>) {
  const fs = new Map(Object.entries(files))
  let stdout = ''
  let stderr = ''
  const io: CliIO = {
    readFile: (p) => {
      const v = fs.get(p)
      if (v === undefined) throw new Error(`ENOENT ${p}`)
      return v
    },
    writeFile: (p, c) => void fs.set(p, c),
    exists: (p) => fs.has(p),
    stdout: (t) => void (stdout += t),
    stderr: (t) => void (stderr += t),
    color: false,
  }
  return { io, fs, out: () => stdout, err: () => stderr }
}

const base = {
  '.env.example': example('.env.example'),
  '.env.staging': example('.env.staging'),
  '.env.production': example('.env.production'),
}

describe('cli', () => {
  it('prints help and version', () => {
    const m = memoryIO({})
    expect(run(['--help'], m.io)).toBe(EXIT_OK)
    expect(m.out()).toContain('Usage')
    expect(run(['-v'], m.io)).toBe(EXIT_OK)
    expect(m.out()).toMatch(/\d+\.\d+\.\d+\n$/)
  })

  it('fails with usage errors', () => {
    expect(run([], memoryIO({}).io)).toBe(EXIT_USAGE)
    expect(run(['bogus'], memoryIO({}).io)).toBe(EXIT_USAGE)
    expect(run(['check', '--nope'], memoryIO({}).io)).toBe(EXIT_USAGE)
    const m = memoryIO({})
    expect(run(['check'], m.io)).toBe(EXIT_USAGE)
    expect(m.err()).toContain('File not found: .env.example')
  })

  describe('check', () => {
    it('passes a valid env file', () => {
      const m = memoryIO(base)
      expect(run(['check', '.env.staging'], m.io)).toBe(EXIT_OK)
      expect(m.out()).toContain('PASS')
    })

    it('fails and explains problems without leaking values', () => {
      const m = memoryIO(base)
      expect(run(['check', '.env.production'], m.io)).toBe(EXIT_FAIL)
      const out = m.out()
      expect(out).toContain('FAIL')
      expect(out).toMatch(/DATABASE_URL\s+invalid\s+Protocol must be postgres or postgresql/)
      expect(out).toMatch(/LEGACY_REDIS_HOST\s+extra/)
      expect(out).toContain('order drift')
      expect(out).not.toContain('redis.prod')
      expect(out).not.toContain('changeme')
    })

    it('checks several files and fails if any fails', () => {
      const m = memoryIO(base)
      expect(run(['check', '.env.staging', '.env.production'], m.io)).toBe(EXIT_FAIL)
      expect(m.out().match(/◆ envdeck/g)).toHaveLength(2)
    })

    it('--strict also fails on extras and order drift', () => {
      const files = { ...base, '.env': 'NODE_ENV=development\nPORT=1\nPUBLIC_URL=http://x\nDATABASE_URL=postgres://x\nJWT_SECRET=' + 'a'.repeat(64) + '\nEXTRA=1\n' }
      expect(run(['check'], memoryIO(files).io)).toBe(EXIT_OK)
      expect(run(['check', '--strict'], memoryIO(files).io)).toBe(EXIT_FAIL)
    })

    it('--json prints a report without values', () => {
      const m = memoryIO(base)
      expect(run(['check', '--json', '.env.production'], m.io)).toBe(EXIT_FAIL)
      const report = JSON.parse(m.out())
      expect(report.ok).toBe(false)
      expect(report.files[0].counts.invalid).toBe(3)
      expect(report.files[0].orderDrift).toBe(true)
      expect(m.out()).not.toContain('redis.prod')
    })

    it('uses a custom schema path', () => {
      const m = memoryIO({ 'schema.env': '# @type=integer\nN=1\n', '.env': 'N=x\n' })
      expect(run(['check', '-s', 'schema.env'], m.io)).toBe(EXIT_FAIL)
      expect(m.out()).toContain('Must be an integer')
    })

    it('fails when the schema has errors', () => {
      const m = memoryIO({ '.env.example': 'A=1\nA=2\n', '.env': 'A=1\n' })
      expect(run(['check'], m.io)).toBe(EXIT_FAIL)
      expect(m.err()).toContain('Duplicate variable A')
    })
  })

  describe('fmt', () => {
    it('prints, checks and writes the canonical schema', () => {
      const messy = { '.env.example': '# @group Db\n\n#@optional   @type=int\nPOOL=5\n' }
      let m = memoryIO(messy)
      expect(run(['fmt'], m.io)).toBe(EXIT_OK)
      expect(m.out()).toContain('# @optional @type=integer\nPOOL=5')

      m = memoryIO(messy)
      expect(run(['fmt', '--check'], m.io)).toBe(EXIT_FAIL)

      m = memoryIO(messy)
      expect(run(['fmt', '-w'], m.io)).toBe(EXIT_OK)
      expect(m.out()).toContain('formatted')
      expect(run(['fmt', '--check'], m.io)).toBe(EXIT_OK)
    })

    it('leaves an already formatted example untouched', () => {
      const m = memoryIO(base)
      run(['fmt', '-w'], m.io)
      const once = m.fs.get('.env.example')
      run(['fmt', '-w'], m.io)
      expect(m.fs.get('.env.example')).toBe(once)
      expect(m.out()).toContain('unchanged')
    })
  })

  describe('sync', () => {
    it('reorders an env file and fixes drift', () => {
      const m = memoryIO(base)
      expect(run(['sync', '.env.production', '-w'], m.io)).toBe(EXIT_OK)
      const synced = m.fs.get('.env.production') as string
      expect(synced.indexOf('NODE_ENV=')).toBeLessThan(synced.indexOf('JWT_TTL='))
      expect(synced).toContain('LEGACY_REDIS_HOST=redis.prod')
      expect(synced.match(/^PORT=/gm)).toHaveLength(1)

      const after = memoryIO({ ...base, '.env.production': synced })
      run(['check', '--json', '.env.production'], after.io)
      const report = JSON.parse(after.out())
      expect(report.files[0].orderDrift).toBe(false)
      expect(report.files[0].duplicates).toEqual([])
    })

    it('can drop extras and fill defaults', () => {
      const m = memoryIO(base)
      run(['sync', '.env.production', '--drop-extras', '--fill-defaults'], m.io)
      expect(m.out()).not.toContain('LEGACY_REDIS_HOST')
      expect(m.out()).toContain('LOG_LEVEL=info')
    })

    it('creates a new env file from the schema', () => {
      const m = memoryIO(base)
      expect(run(['sync', '.env.local', '-w', '--fill-defaults'], m.io)).toBe(EXIT_OK)
      expect(m.fs.get('.env.local')).toContain('PORT=3000')
    })

    it('requires exactly one file', () => {
      expect(run(['sync'], memoryIO(base).io)).toBe(EXIT_USAGE)
    })
  })
})

import { parseArgs } from 'node:util'
import {
  auditEnv,
  normalizeEnv,
  parseEnv,
  parseSchema,
  serializeSchema,
  type AuditResult,
  type Diagnostic,
} from '../core'
import pkg from '../../package.json'

export interface CliIO {
  readFile(path: string): string
  writeFile(path: string, content: string): void
  exists(path: string): boolean
  stdout(text: string): void
  stderr(text: string): void
  color: boolean
}

export const EXIT_OK = 0
export const EXIT_FAIL = 1
export const EXIT_USAGE = 2

const VERSION = pkg.version

const HELP = `envdeck ${VERSION} — schema-driven .env management

Usage
  envdeck check [env files...]   Validate env files against the schema (default: .env)
  envdeck fmt                    Rewrite the schema file in canonical form
  envdeck sync <env file>        Reorder an env file to match the schema

Options
  -s, --schema <file>   Schema file (default: .env.example)
      --strict          check: also fail on unknown keys, duplicates and order drift
      --json            check: print a machine-readable report
  -w, --write           fmt/sync: write the result back instead of printing it
      --check           fmt: exit 1 if the file is not formatted
      --drop-extras     sync: remove keys that are not in the schema
      --fill-defaults   sync: fill missing values with schema defaults
  -h, --help            Show this help
  -v, --version         Show version

Values are never printed, so it is safe to run check in CI logs.
`

class UsageError extends Error {}

export function run(argv: string[], io: CliIO): number {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        schema: { type: 'string', short: 's', default: '.env.example' },
        strict: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        write: { type: 'boolean', short: 'w', default: false },
        check: { type: 'boolean', default: false },
        'drop-extras': { type: 'boolean', default: false },
        'fill-defaults': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false },
      },
    })
  } catch (e) {
    io.stderr(`${(e as Error).message}\n\n${HELP}`)
    return EXIT_USAGE
  }

  const { values: opts, positionals } = parsed
  if (opts.version) {
    io.stdout(`${VERSION}\n`)
    return EXIT_OK
  }
  const [command, ...files] = positionals
  if (opts.help || !command) {
    io.stdout(HELP)
    return opts.help ? EXIT_OK : EXIT_USAGE
  }

  const c = colors(io.color)
  try {
    switch (command) {
      case 'check':
        return check(io, c, opts.schema, files.length > 0 ? files : ['.env'], opts.strict, opts.json)
      case 'fmt':
        return fmt(io, c, opts.schema, opts.write, opts.check)
      case 'sync': {
        if (files.length !== 1) throw new UsageError('sync expects exactly one env file')
        return sync(io, c, opts.schema, files[0] as string, {
          write: opts.write,
          dropExtras: opts['drop-extras'],
          fillDefaults: opts['fill-defaults'],
        })
      }
      default:
        throw new UsageError(`Unknown command "${command}"`)
    }
  } catch (e) {
    if (e instanceof UsageError) {
      io.stderr(`${c.red('error')} ${e.message}\n\n${HELP}`)
    } else {
      io.stderr(`${c.red('error')} ${(e as Error).message}\n`)
    }
    return EXIT_USAGE
  }
}

function read(io: CliIO, path: string): string {
  if (!io.exists(path)) throw new Error(`File not found: ${path}`)
  return io.readFile(path)
}

function loadSchema(io: CliIO, c: Colors, path: string) {
  const result = parseSchema(read(io, path))
  printDiagnostics(io, c, path, result.diagnostics)
  return result
}

function printDiagnostics(io: CliIO, c: Colors, path: string, diagnostics: Diagnostic[]) {
  for (const d of diagnostics) {
    const tag = d.severity === 'error' ? c.red('error') : c.yellow('warn ')
    io.stderr(`${tag} ${c.dim(`${path}:${d.line}`)} ${d.message}\n`)
  }
}

function check(io: CliIO, c: Colors, schemaPath: string, files: string[], strict: boolean, json: boolean): number {
  const { schema, diagnostics } = json ? parseSchema(read(io, schemaPath)) : loadSchema(io, c, schemaPath)
  const schemaErrors = diagnostics.filter((d) => d.severity === 'error').length
  const reports: { file: string; result: AuditResult; ok: boolean; diagnostics: Diagnostic[] }[] = []

  for (const file of files) {
    const env = parseEnv(read(io, file))
    const result = auditEnv(schema, env)
    const parseErrors = env.diagnostics.filter((d) => d.severity === 'error').length
    const ok = (strict ? result.clean && !result.orderDrift : result.passed) && parseErrors === 0
    reports.push({ file, result, ok, diagnostics: env.diagnostics })
  }

  const allOk = schemaErrors === 0 && reports.every((r) => r.ok)

  if (json) {
    io.stdout(
      `${JSON.stringify(
        {
          schema: schemaPath,
          ok: allOk,
          schemaDiagnostics: diagnostics,
          files: reports.map(({ file, result, ok, diagnostics: d }) => ({
            file,
            ok,
            counts: result.counts,
            orderDrift: result.orderDrift,
            duplicates: result.duplicates,
            diagnostics: d,
            // Values are deliberately omitted.
            rows: result.rows.map(({ key, status, present, issues, warnings, line }) => ({
              key,
              status,
              present,
              issues,
              warnings,
              line,
            })),
          })),
        },
        null,
        2,
      )}\n`,
    )
    return allOk ? EXIT_OK : EXIT_FAIL
  }

  for (const { file, result, ok, diagnostics: d } of reports) {
    io.stdout(`\n${c.bold(c.cyan('◆ envdeck'))} ${c.bold(file)} ${c.dim(`vs ${schemaPath}`)}\n`)
    // Duplicate-key warnings are shown per row below; only print hard parse errors here.
    printDiagnostics(io, c, file, d.filter((x) => x.severity === 'error'))
    const width = Math.max(8, ...result.rows.map((r) => r.key.length))
    for (const r of result.rows) {
      const key = r.key.padEnd(width)
      switch (r.status) {
        case 'missing':
          io.stdout(`  ${c.red('✖')} ${key}  ${c.red('missing')}   required value is not set\n`)
          break
        case 'invalid':
          io.stdout(`  ${c.red('✖')} ${key}  ${c.red('invalid')}   ${r.issues.join('; ')}\n`)
          break
        case 'extra':
          io.stdout(`  ${strict ? c.red('✖') : c.yellow('!')} ${key}  ${c.yellow('extra')}     not declared in schema\n`)
          break
      }
      for (const w of r.warnings) {
        io.stdout(`  ${c.yellow('⚠')} ${key}  ${c.yellow('warning')}   ${w}\n`)
      }
    }
    if (result.orderDrift) {
      io.stdout(
        `  ${strict ? c.red('✖') : c.yellow('↕')} ${c.yellow('order drift')}: keys are not in schema order (run envdeck sync ${file} -w)\n`,
      )
    }
    const n = result.counts
    const summary = [
      c.green(`${n.ok} ok`),
      (n.missing ? c.red : c.dim)(`${n.missing} missing`),
      (n.invalid ? c.red : c.dim)(`${n.invalid} invalid`),
      c.dim(`${n.unset} unset`),
      (n.extra ? c.yellow : c.dim)(`${n.extra} extra`),
    ].join(c.dim(' · '))
    io.stdout(`  ${summary}  ${ok ? c.green(c.bold('PASS')) : c.red(c.bold('FAIL'))}\n`)
  }
  if (schemaErrors > 0) io.stdout(`\n${c.red(`Schema ${schemaPath} has ${schemaErrors} error(s)`)}\n`)
  return allOk ? EXIT_OK : EXIT_FAIL
}

function fmt(io: CliIO, c: Colors, schemaPath: string, write: boolean, checkOnly: boolean): number {
  const source = read(io, schemaPath)
  const { schema, diagnostics } = loadSchema(io, c, schemaPath)
  if (diagnostics.some((d) => d.severity === 'error')) {
    io.stderr(`${c.red('error')} refusing to format ${schemaPath} while it has errors\n`)
    return EXIT_FAIL
  }
  const out = serializeSchema(schema)
  if (checkOnly) {
    if (out === source) return EXIT_OK
    io.stderr(`${schemaPath} is not formatted (run envdeck fmt -w)\n`)
    return EXIT_FAIL
  }
  if (write) {
    if (out !== source) io.writeFile(schemaPath, out)
    io.stdout(`${out === source ? 'unchanged' : 'formatted'} ${schemaPath}\n`)
  } else {
    io.stdout(out)
  }
  return EXIT_OK
}

function sync(
  io: CliIO,
  c: Colors,
  schemaPath: string,
  file: string,
  o: { write: boolean; dropExtras: boolean; fillDefaults: boolean },
): number {
  const { schema } = loadSchema(io, c, schemaPath)
  const source = io.exists(file) ? io.readFile(file) : ''
  const env = parseEnv(source)
  if (env.diagnostics.some((d) => d.severity === 'error')) {
    printDiagnostics(io, c, file, env.diagnostics)
    io.stderr(`${c.red('error')} refusing to rewrite ${file} while it has parse errors\n`)
    return EXIT_FAIL
  }
  const out = normalizeEnv(schema, env, { keepExtras: !o.dropExtras, fillDefaults: o.fillDefaults })
  if (o.write) {
    if (out !== source) io.writeFile(file, out)
    io.stdout(`${out === source ? 'unchanged' : 'synced'} ${file}\n`)
  } else {
    io.stdout(out)
  }
  return EXIT_OK
}

type Paint = (s: string) => string
interface Colors {
  red: Paint
  green: Paint
  yellow: Paint
  cyan: Paint
  dim: Paint
  bold: Paint
}

function colors(enabled: boolean): Colors {
  const wrap =
    (open: number, close: number): Paint =>
    (s) =>
      enabled ? `\u001b[${open}m${s}\u001b[${close}m` : s
  return {
    red: wrap(31, 39),
    green: wrap(32, 39),
    yellow: wrap(33, 39),
    cyan: wrap(36, 39),
    dim: wrap(2, 22),
    bold: wrap(1, 22),
  }
}

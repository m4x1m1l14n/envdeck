import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { run } from './run'

const code = run(process.argv.slice(2), {
  readFile: (p) => readFileSync(resolve(p), 'utf8'),
  writeFile: (p, content) => writeFileSync(resolve(p), content),
  exists: (p) => existsSync(resolve(p)),
  stdout: (t) => process.stdout.write(t),
  stderr: (t) => process.stderr.write(t),
  color: Boolean(process.stdout.isTTY) && !process.env.NO_COLOR,
})
process.exitCode = code

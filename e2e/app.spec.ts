import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

const example = (name: string) => readFileSync(fileURLToPath(new URL(`../examples/${name}`, import.meta.url)))

const nav = (page: Page, name: 'Projects' | 'Design' | 'Environments' | 'Audit') =>
  page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: new RegExp(`^\\d+\\s*${name}\\b`) }).click()

/** Fresh page with the example project (schema + development/staging/production). */
async function loadExampleProject(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load example project' }).click()
  await expect(page.getByTestId('var-NODE_ENV')).toBeVisible()
}

async function newEmptyProject(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'New project' }).first().click()
  await page.getByRole('dialog').getByLabel('Name').fill(name)
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
})

test('designs a variable from scratch and writes annotated output', async ({ page }) => {
  await newEmptyProject(page, 'Billing')
  await page.getByRole('button', { name: 'New variable' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill('db pool size')
  await expect(dialog.getByLabel('Name')).toHaveValue('DB_POOL_SIZE')
  await dialog.getByLabel('Group').selectOption('__new__')
  await dialog.getByLabel('New group name').fill('Database')
  await dialog.getByLabel('Description').fill('Connections per worker')
  await dialog.getByRole('radio', { name: 'integer' }).click()
  await dialog.getByLabel('Min', { exact: true }).fill('1')
  await dialog.getByLabel('Max', { exact: true }).fill('50')
  await dialog.getByLabel('Default value').fill('99')
  await expect(dialog.getByText('Must be ≤ 50')).toBeVisible()
  await dialog.getByLabel('Default value').fill('10')
  await dialog.getByRole('switch', { name: /Required/ }).click()
  await dialog.getByRole('button', { name: 'Add variable' }).click()

  const preview = page.getByLabel('.env.example preview')
  await expect(preview).toContainText('# @group Database')
  await expect(preview).toContainText('# Connections per worker')
  await expect(preview).toContainText('# @optional @type=integer(min=1, max=50)')
  await expect(preview).toContainText('DB_POOL_SIZE=10')

  // The file header sits above the schema and ends up at the top of the file.
  await page.getByLabel('File header comment').fill('Billing service env')
  await page.getByLabel('Filter variables').click()
  await expect(preview).toContainText('# Billing service env')

  // Undo removes the header, then the variable; redo brings the variable back.
  await page.getByRole('button', { name: /Undo/ }).click()
  await page.getByRole('button', { name: /Undo/ }).click()
  await expect(page.getByRole('button', { name: 'New variable' })).toBeVisible()
  await page.getByRole('button', { name: /Redo/ }).click()
  await expect(page.getByTestId('var-DB_POOL_SIZE')).toBeVisible()
})

test('imports a schema into a new project and edits its source', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New project' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill('Imported')
  await dialog.getByRole('radio', { name: 'Import .env.example' }).click()
  await dialog.getByTestId('new-project-import').setInputFiles({ name: '.env.example', mimeType: 'text/plain', buffer: example('.env.example') })
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByTestId('var-JWT_SECRET')).toBeVisible()

  await page.getByRole('radio', { name: 'Source' }).click()
  await page.getByLabel('.env.example source').fill('# @group Mail\n\n# @optional @type=email\nSMTP_FROM=\n')
  await expect(page.getByText('Parses cleanly.')).toBeVisible()
  await page.getByRole('button', { name: 'Apply' }).click()

  await expect(page.getByTestId('var-SMTP_FROM')).toBeVisible()
  await expect(page.getByTestId('var-JWT_SECRET')).toHaveCount(0)
})

test('fills an environment and generates a valid .env', async ({ page }) => {
  await loadExampleProject(page)
  await nav(page, 'Environments')
  await page.getByTestId('env-tab-development').click()

  await expect(page.getByText('2 missing')).toBeVisible()
  await page.getByLabel('DATABASE_URL').first().fill('mysql://nope')
  await expect(page.getByText('Protocol must be postgres or postgresql (got mysql)')).toBeVisible()
  await page.getByLabel('DATABASE_URL').first().fill('postgres://app@localhost/app')
  await page.getByRole('button', { name: 'Generate JWT_SECRET' }).click()
  await expect(page.getByText('● ready')).toBeVisible()
  await expect(page.getByTestId('env-tab-development')).toContainText('ready')

  const output = page.getByLabel('Generated .env')
  await expect(output).toContainText('NODE_ENV=development')
  await expect(output).toContainText('# ━━━ Database ━━━')
  await expect(output).not.toContainText('postgres://app@localhost/app')
  await page.getByRole('button', { name: 'Show secrets in preview' }).click()
  await expect(output).toContainText('DATABASE_URL=postgres://app@localhost/app')
})

test('adds, loads, duplicates and deletes environments', async ({ page }) => {
  await newEmptyProject(page, 'Envs')
  await page.getByTestId('empty-import').setInputFiles({ name: '.env.example', mimeType: 'text/plain', buffer: example('.env.example') })
  await expect(page.getByTestId('var-PORT')).toBeVisible()
  await nav(page, 'Environments')

  await page.getByRole('button', { name: 'staging' }).click()
  await expect(page.getByTestId('env-tab-staging')).toBeVisible()
  await page.getByTestId('env-load').setInputFiles({ name: '.env.staging', mimeType: 'text/plain', buffer: example('.env.staging') })
  await expect(page.getByLabel('PORT', { exact: true })).toHaveValue('8080')
  await expect(page.getByText('● ready')).toBeVisible()

  await page.getByRole('button', { name: 'Duplicate staging' }).click()
  await expect(page.getByTestId('env-tab-staging copy')).toBeVisible()
  await page.getByRole('button', { name: 'Delete staging copy' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete environment' }).click()
  await expect(page.getByTestId('env-tab-staging copy')).toHaveCount(0)

  // Environment values survive a reload.
  await page.reload()
  await nav(page, 'Environments')
  await expect(page.getByLabel('PORT', { exact: true })).toHaveValue('8080')
})

test('audits project environments and dropped files side by side', async ({ page }) => {
  await loadExampleProject(page)
  await nav(page, 'Audit')

  await expect(page.getByTestId('env-card-staging')).toContainText('PASS')
  await expect(page.getByTestId('env-card-production')).toContainText('FAIL')

  await page.getByTestId('audit-files').setInputFiles([{ name: '.env.production', mimeType: 'text/plain', buffer: example('.env.production') }])
  const file = page.getByTestId('env-card-.env.production')
  await expect(file).toContainText('FAIL')
  await expect(file).toContainText('order drift')
  await expect(file).toContainText('1 duplicate')

  const matrix = page.getByTestId('audit-matrix')
  await expect(matrix.getByTestId('row-LEGACY_REDIS_HOST')).toBeVisible()
  await expect(matrix.getByTestId('row-DB_POOL_SIZE')).toContainText('Must be ≤ 100')

  await page.getByRole('radio', { name: 'Problems' }).click()
  await expect(matrix.getByTestId('row-NODE_ENV')).toHaveCount(0)
  await matrix.getByTestId('row-DATABASE_URL').click()
  await expect(matrix).toContainText('Protocol must be postgres or postgresql (got mysql)')
  await expect(matrix).not.toContainText('mysql://acme@db.prod')

  // A dropped file can be stored as a project environment.
  await file.getByRole('button', { name: 'Add to project' }).click()
  await expect(page.getByTestId('env-tab-production (2)')).toBeVisible()
})

test('manages projects: rename, duplicate, delete, switch', async ({ page }) => {
  await loadExampleProject(page)
  await nav(page, 'Projects')

  await page.getByRole('button', { name: 'Rename Acme API (example)' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill('Acme')
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('project-Acme')).toBeVisible()

  await page.getByRole('button', { name: 'Duplicate Acme' }).click()
  await expect(page.getByTestId('project-Acme copy')).toBeVisible()
  await page.getByLabel('Active project').selectOption({ label: 'Acme copy' })
  await expect(page.getByTestId('var-NODE_ENV')).toBeVisible()

  await nav(page, 'Projects')
  await page.getByRole('button', { name: 'Delete Acme copy' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete project' }).click()
  await expect(page.getByTestId('project-Acme copy')).toHaveCount(0)
  await expect(page.getByTestId('project-Acme')).toBeVisible()
})

test('persists projects and plain values but not secrets by default', async ({ page }) => {
  await loadExampleProject(page)
  await page.getByRole('button', { name: 'Switch to light theme' }).click()
  await nav(page, 'Environments')
  await page.getByTestId('env-tab-development').click()
  await page.getByLabel('DATABASE_URL').first().fill('postgres://secret@host/db')
  await page.getByLabel('PUBLIC_URL').first().fill('https://dev.example.test')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await nav(page, 'Environments')
  await page.getByTestId('env-tab-development').click()
  await expect(page.getByLabel('PUBLIC_URL').first()).toHaveValue('https://dev.example.test')
  await expect(page.getByLabel('DATABASE_URL').first()).toHaveValue('')
  let stored = await page.evaluate(() => localStorage.getItem('envdeck') ?? '')
  expect(stored).not.toContain('postgres://secret@host/db')

  // Opting in keeps secrets across reloads.
  await page.getByRole('switch', { name: /Remember secrets/ }).click()
  await page.getByLabel('DATABASE_URL').first().fill('postgres://secret@host/db')
  await page.reload()
  await nav(page, 'Environments')
  await page.getByTestId('env-tab-development').click()
  await expect(page.getByLabel('DATABASE_URL').first()).toHaveValue('postgres://secret@host/db')
  stored = await page.evaluate(() => localStorage.getItem('envdeck') ?? '')
  expect(stored).toContain('postgres://secret@host/db')
})

test('shares the AI agent guide: copy, snippet, download, GitHub link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  // Force the download fallback; the native save dialog cannot be driven headlessly.
  await page.addInitScript(() => {
    ;(window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker = undefined
  })
  await page.goto('/')
  const guide = readFileSync(fileURLToPath(new URL('../docs/agents/ENVDECK.md', import.meta.url)), 'utf8')

  await page.getByRole('button', { name: /Agent guide/ }).click()
  const dialog = page.getByRole('dialog', { name: 'AI agent guide' })
  await expect(dialog.getByLabel('Agent guide preview')).toContainText('EnvDeck schema rules')
  await expect(dialog.getByRole('link', { name: 'View on GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/m4x1m1l14n/envdeck/blob/main/docs/agents/ENVDECK.md',
  )

  await dialog.getByRole('button', { name: 'Copy guide' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(guide)

  await dialog.getByRole('button', { name: 'Copy snippet' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('ENVDECK.md')

  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download ENVDECK.md' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('ENVDECK.md')
  expect(readFileSync(await file.path(), 'utf8')).toBe(guide)

  // The same actions are on the Projects page.
  await page.keyboard.press('Escape')
  await expect(page.getByText('Keep agents on-format')).toBeVisible()
})

test('filters environment values: search, needs attention, hide untouched optionals', async ({ page }) => {
  await loadExampleProject(page)
  await nav(page, 'Environments')
  await page.getByTestId('env-tab-development').click()
  const fields = page.locator('[data-testid^="field-"]')
  await expect(fields).toHaveCount(11)

  await page.getByLabel('Filter values').fill('jwt')
  await expect(fields).toHaveCount(2)
  await page.getByLabel('Filter values').fill('')

  // development is missing DATABASE_URL and JWT_SECRET.
  await page.getByRole('radio', { name: /Needs attention/ }).click()
  await expect(fields).toHaveCount(2)
  await expect(page.getByTestId('field-DATABASE_URL')).toBeVisible()

  // A row being fixed stays visible while you type, even once it is valid.
  await page.getByLabel('DATABASE_URL').first().fill('postgres://app@localhost/app')
  await expect(page.getByTestId('field-DATABASE_URL')).toBeVisible()
  await page.getByRole('button', { name: 'Generate JWT_SECRET' }).click()
  await page.getByRole('radio', { name: /^All/ }).click()
  await page.getByRole('radio', { name: /Needs attention/ }).click()
  await expect(page.getByText('Nothing in this environment needs your attention.')).toBeVisible()

  await page.getByRole('radio', { name: /^All/ }).click()
  await page.getByRole('switch', { name: /Hide untouched optionals/ }).click()
  // LOG_LEVEL, WORKER_COUNT, DB_POOL_SIZE, DB_SSL, JWT_TTL, ADMIN_EMAIL are optional and untouched.
  await expect(fields).toHaveCount(5)
  await expect(page.getByTestId('field-LOG_LEVEL')).toHaveCount(0)
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(fields).toHaveCount(11)
})

test('edits a group from its section header', async ({ page }) => {
  await loadExampleProject(page)
  await page.getByRole('button', { name: 'Edit group Server' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Description').fill('HTTP server settings, ports and public URLs used by every worker process in the cluster')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('#group-server')).toContainText('used by every worker process in the cluster')
})

test('re-imports a changed .env.example with a preview and carries renamed values over', async ({ page }) => {
  await loadExampleProject(page)
  const updated = example('.env.example')
    .toString()
    .replace('max=100)\nDB_POOL_SIZE=10', 'max=15)\nDB_POOL_SIZE=10')
    .replace('JWT_TTL=', 'JWT_EXPIRES_IN=')
  await page.getByTestId('import-schema').setInputFiles({ name: '.env.example', mimeType: 'text/plain', buffer: Buffer.from(updated) })

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByTestId('diff-DB_POOL_SIZE')).toContainText('Becomes invalid in staging')
  await expect(dialog.getByLabel('JWT_EXPIRES_IN renamed from')).toHaveValue('JWT_TTL')
  await expect(dialog.getByTestId('diff-JWT_TTL')).toContainText('Renamed to JWT_EXPIRES_IN')
  await dialog.getByRole('button', { name: 'Apply changes' }).click()

  await expect(page.getByTestId('var-JWT_EXPIRES_IN')).toBeVisible()
  await expect(page.getByTestId('var-JWT_TTL')).toHaveCount(0)
  await nav(page, 'Environments')
  await page.getByTestId('env-tab-staging').click()
  await expect(page.getByLabel('JWT_EXPIRES_IN')).toHaveValue('3600')
})

test('accepts a .env.example dropped anywhere on Design', async ({ page }) => {
  await loadExampleProject(page)
  const text = example('.env.example').toString()
  await page.evaluate((t) => {
    const dt = new DataTransfer()
    dt.items.add(new File([t], '.env.example', { type: 'text/plain' }))
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }))
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
  }, text)
  await expect(page.getByRole('dialog')).toContainText('No changes')
})

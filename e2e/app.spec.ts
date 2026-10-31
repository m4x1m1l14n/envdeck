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

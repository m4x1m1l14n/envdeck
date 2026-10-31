import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { envdeck: 'src/cli/bin.ts' },
  outDir: 'dist-cli',
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
})

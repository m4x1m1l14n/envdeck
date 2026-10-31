# AGENTS.md — working on EnvDeck itself

EnvDeck is a static web app (React + Vite) plus a small CLI that share one dependency-free core.

## Layout

- `src/core/` — pure TypeScript, no DOM, no runtime deps: lexer, decorator parser, schema parse/serialize,
  validation, audit, env generation, schema edit ops. **All format logic lives here.**
- `src/cli/` — `envdeck` command; `run(argv, io)` is pure and unit-tested with an in-memory IO.
- `src/app/` — React UI. State in `store.ts` (zustand + persist). Views: Projects, Design, Environments, Audit.
- `e2e/` — Playwright specs. `examples/` — demo schema + drifted env files used by tests.
- `docs/agents/ENVDECK.md` — the steering file users copy into *their* projects. Keep it in sync with the
  format whenever the parser/serializer changes.

## Commands

```bash
npm test           # Vitest unit tests (core + CLI + store)
npm run test:e2e   # Playwright (first run: npx playwright install chromium)
npm run typecheck
npm run build      # static site → dist/ (relative base, deployable to any sub-path)
```

## Rules

- Format changes go in `src/core` first, with tests; `serializeSchema(parseSchema(x))` must stay stable and
  `examples/.env.example` must remain byte-for-byte canonical (there is a test).
- Never persist values of `@sensitive` variables unless the project has "remember secrets" enabled.
- Never print env values in CLI output.
- The app must work offline with no network requests after load.

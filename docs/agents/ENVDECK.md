# Environment variables — EnvDeck schema rules

This project manages environment variables with **EnvDeck**. The annotated `.env.example` is the
**single source of truth** for every variable the application reads. Follow these rules whenever you add,
change, rename or remove an environment variable — in code, config, Docker/compose files, CI or docs.

## Golden rules

1. **Every variable the code reads must be declared in `.env.example`.** If you add `process.env.FOO`,
   `os.environ["FOO"]`, `env("FOO")`, etc., add `FOO` to `.env.example` in the same change.
2. **Never put real secrets in `.env.example`.** Variables marked `@sensitive` must have an empty value.
3. **Never edit `.env`, `.env.local`, `.env.production` or other real env files** unless the user asks you to.
   They are not committed and may hold live credentials. Tell the user which values they need to set instead.
4. **Keep the file canonical** (format below). If the `envdeck` CLI is available, run
   `envdeck fmt -w` after editing and `envdeck check` to validate local env files.
5. **Removing or renaming a variable is a breaking change for deployed environments.** Say so in your
   summary and list the environments/files the user must update.

## Format

`.env.example` is a normal dotenv file. Metadata lives in comments directly above each variable
(no blank line between the comments and the variable).

```bash
# <File description: what this file is, where to get values>

# <Description of an ungrouped variable>
# @required @type=enum(development, staging, production)
NODE_ENV=development

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# @group Database
# <Optional group description>
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Primary Postgres connection string
# @required @sensitive @type=url(protocols="postgres,postgresql")
DATABASE_URL=

# Connection pool size
# @optional @type=integer(min=1, max=100)
DB_POOL_SIZE=10
```

Structure, in this order:

1. Optional **file header**: comment block at the top followed by a blank line.
2. **Ungrouped variables** (rare — prefer a group).
3. **Groups**, each starting with a header block: a rule line of `━` (48 chars), `# @group <Name>`,
   optional description lines, a closing rule line, then a blank line.
4. Each **variable block** is:
   - zero or more description lines (`# text`),
   - exactly one decorator line,
   - the `KEY=value` line,
   - one blank line.

The decorator line is always written in this order:

```
# @required|@optional [@sensitive] @type=<type> [@example=<value>] [@docs=<url>]
```

## Decorators

| Decorator | Use |
| --- | --- |
| `@required` | The app cannot start without it. |
| `@optional` | The app has a fallback; empty is fine. |
| `@sensitive` | Credentials, tokens, keys, connection strings with passwords. Value must be empty in `.env.example`. |
| `@type=…` | Always set it. See the types table below. |
| `@example=…` | A realistic, non-secret example (quote it if it contains spaces). |
| `@docs=https://…` | Where to obtain or learn about the value. |

## Types

| Type | Options | Example |
| --- | --- | --- |
| `string` | `minLength`, `maxLength`, `pattern="<js regex>"`, `startsWith`, `endsWith` | `@type=string(minLength=32)` |
| `integer` | `min`, `max` | `@type=integer(min=1, max=64)` |
| `number` | `min`, `max` | `@type=number(min=0, max=1)` |
| `port` | `min`, `max` (default 1–65535) | `@type=port` |
| `boolean` | — | accepts true/false, 1/0, yes/no, on/off |
| `enum` | values | `@type=enum(debug, info, warn, error)` |
| `url` | `protocols="a,b"` | `@type=url(protocols="https")` |
| `email` | — | `@type=email` |
| `uuid` | — | `@type=uuid` |
| `json` | — | `@type=json` |

Pick the **narrowest** type that is true: a port is `port`, not `string`; a fixed set of values is `enum`;
a feature flag is `boolean`; a hex secret gets `string(minLength=…, pattern="^[a-f0-9]+$")`.

## Values

- The value in `.env.example` is the **default** used for local development. It must pass its own
  `@type` rules.
- Quote values with spaces, `#`, quotes or backslashes using double quotes: `GREETING="hello world"`.
- Use an empty value for anything sensitive or environment-specific: `API_KEY=`.

## Naming

- `UPPER_SNAKE_CASE`, letters/digits/underscores, not starting with a digit.
- Prefix by subsystem so related variables group naturally: `DB_`, `REDIS_`, `SMTP_`, `S3_`, `AUTH_`.
- Put the variable in the group of its subsystem; create a new group only when none fits.

## Checklist for a change

- [ ] Variable declared in the right group, with a one-line description.
- [ ] `@required`/`@optional` chosen deliberately; `@sensitive` on every secret.
- [ ] Narrowest `@type` with sensible constraints; default value passes them.
- [ ] No real secret committed.
- [ ] Code, Docker/compose, CI and docs reference the same name.
- [ ] Summary tells the user which deployed environments need new or changed values.

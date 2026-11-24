# Revime

Source code of **Revime**, a French repair marketplace. Clients publish a repair request, repairers send
competing offers, the client compares them and chooses by paying. One account, two modes (client and
réparateur).

## What is in this repository

An npm workspaces monorepo. Node 24 or later.

| Folder | What it is | Where it runs |
|---|---|---|
| `apps/api` | NestJS 11 API: Prisma 7 on Supabase Postgres, Better Auth, Zod validation, Stripe, Twilio, Resend, Boxtal | Render (`api.revime.fr`) |
| `apps/mobile` | Expo app (expo-router, TanStack Query), iOS and Android, both modes | EAS Build, App Store, Google Play |
| `apps/admin` | Next.js 16 admin dashboard | Vercel |
| `apps/site` | Next.js public site: home page, the legal documents, the account-deletion page | Vercel (optional) |
| `packages/shared` | Code shared by the API and the apps: Zod schemas, DTOs, error messages, offer and payment logic | built into the others |
| `packages/tokens` | Design tokens (colours, typography) from the Revime brand charter | built into the others |
| `assets/originals` | The original notification sounds and legal PDFs the app's files were made from | reference only |
| `scripts` | `extract_legal_docs.py`, which turns the legal PDFs into the app's legal texts | run by hand |

`packages/shared` and `packages/tokens` resolve through a `dist/` folder that is not committed. They build on
`npm ci`; after changing one, run `npm run build -w @revime/shared` (or `@revime/tokens`) before typechecking
the apps.

## Install

```bash
npm ci
npm exec -w @revime/api -- prisma generate
```

Each app reads its settings from a `.env` file next to its `package.json`. Copy the matching `.env.example`
and fill in the values. The example files hold only names and harmless defaults; real keys are kept in the
hosting dashboards (Render, Vercel, EAS) and must never be committed.

## Run locally

```bash
npm run start:dev -w @revime/api      # the API, on the PORT in apps/api/.env
npm run dev -w @revime/admin          # the admin dashboard
npm run dev -w @revime/site           # the public site
npm run start -w @revime/mobile       # the app, through Expo
```

The mobile app has native modules (photos, payments, push), so it runs in a development build or an EAS
build, not in Expo Go.

## The database

There is no separate local database: `DATABASE_URL` points at the Supabase database you configure.

- Migrations live in `apps/api/prisma/migrations`, are written by hand and are applied with
  `prisma migrate deploy` only (the API runs it on every start). Do not use `migrate dev`,
  `migrate reset` or `db push` against a database that holds real data.
- Every new table gets row-level security that denies all access, in the same migration.

## Tests

Run these before every push. They are the checks CI runs, plus the app and package suites:

```bash
npm run typecheck
npm run test -w @revime/admin
npm run test:unit -w @revime/api     # several minutes
npm run test -w @revime/mobile
npm run test -w @revime/shared
npm run test -w @revime/site
```

Do not run a bare `npm test` at the root. It also runs the API's integration tests (`*.int.spec.ts`), which
write to the database in `DATABASE_URL`. Run those only against a database meant for testing.

## Deploy

- **API (Render).** Builds from `main` with `npm ci --include=dev && npm run build -w @revime/shared && npm run build -w @revime/api`
  and starts with `npm run start:prod -w @revime/api`; health check `/api/v1/health`. `render.yaml` describes
  the service, but the values that are live are the ones set in the Render dashboard.
- **Admin dashboard (Vercel).** Built from the repository root by `vercel.json` (tokens, shared, then
  `apps/admin`), with `API_URL` set to the API.
- **Mobile (EAS).** Build profiles and store submission settings are in `apps/mobile/eas.json`. The store
  build must carry the Stripe live publishable key (`pk_live_`), not the test one.

## GitHub Actions

| Workflow | What it does | Secret it needs |
|---|---|---|
| `ci.yml` | typecheck, build and unit tests on every push | none |
| `reconcile.yml` | calls the API's scheduled jobs every six hours (payments, payouts, clean-ups) | `CRON_SECRET`, the same value as on the API |
| `keepalive.yml` | a daily database ping that stops a free Supabase project from pausing; not needed on a paid plan | `DATABASE_URL` |

GitHub turns off scheduled workflows after 60 days without activity in the repository. If that happens,
turn them back on from the Actions tab: without `reconcile.yml`, the scheduled jobs stop.

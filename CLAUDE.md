# Maitama Congregation Secretary System — notes for Claude

Private congregation record-keeping app. Read `README.md` first for what the
app does and how the parts fit together. This file is what is not obvious from
the code.

## Stack and layout
- Next.js 15 (App Router, server actions), React 19, TypeScript, Tailwind.
- Prisma 6 on Supabase Postgres. `prisma/schema.prisma` is the source of truth.
- Deployed on Vercel from GitHub `main`; every push redeploys. Build runs
  `prisma generate && prisma migrate deploy && next build`.
- `.env` (git-ignored) holds `DATABASE_URL` (transaction pooler, port 6543,
  `?pgbouncer=true`), `DIRECT_URL` (session pooler, 5432), `SESSION_SECRET`.
  Never commit it. The same values live in Vercel → Settings → Environment
  Variables.

## Rules that must not be broken
- **Migrations are additive only.** Never drop or rename a column or table.
  New migration: edit the schema, then
  `npx prisma migrate diff --from-schema-datamodel <old> --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/NNNN_name/migration.sql`,
  then `npx prisma migrate deploy`. Vercel applies it again on deploy (no-op).
- Every page and every server action checks permission via `requirePermission`
  / `guard` from `src/lib/auth.ts`. Permissions live in `src/lib/rbac.ts`.
- Read-only accounts never receive contact details (see `publisher:readContact`).
- Judicial matters are out of scope by design.
- Personal data of real people: keep it out of logs, commits, and chat.

## Conventions
- Pages are server components; forms are small `"use client"` components using
  `useActionState`. Actions return `{ error?, errors?, ok? }`.
- Validation schemas: `src/lib/validation.ts` (zod). `fieldErrors()` maps
  zod issues to `{ field: message }`.
- Every write calls `recordAudit(...)` and `revalidatePath(...)`.
- **Do not rely on a submit button's `name`/`value` reaching the action.** It
  does not with this React/Next version. Use a hidden input set on click
  (see `bookings/decision-form.tsx`) or one form per button (`boe/page.tsx`).
- Service years run September–August and are named for the year they end in:
  `src/lib/service-year.ts`.
- A report's category is `pioneerStatusUsed` on the report, not the
  publisher's current standing. Auxiliary pioneer hours count in the month
  served. `src/lib/analysis.ts` is the one place totals are computed; use it
  rather than re-summing.
- PDFs: built-in layouts in `src/lib/pdf/*.ts` on `pdf-lib` via `kit.ts`.
  When an official form is uploaded (Accounts → Official forms) exports are
  written onto it by **field position**, not field name: `src/lib/pdf/fill.ts`
  and `fields.ts`. The S-21 reader (`src/lib/import-s21.ts`) uses the same
  geometry. If a real form misfills, compare with the "field check" download.
- Import parsers (`src/lib/import.ts`, `import-reports.ts`) never touch the
  database; matching and duplicate checks happen in the actions.

## Running locally
```
npm ci
npx prisma generate
npm run dev          # http://localhost:3000
npx tsc --noEmit     # typecheck
npx next build       # what Vercel runs (set dummy DATABASE_URL etc. if offline)
```
Seed (idempotent, needs SEED_ADMIN_EMAIL/PASSWORD in .env): `npx prisma db seed`.

## Things a future change is likely to touch
- Add a nav item: `src/app/(app)/nav.tsx` + a permission in `rbac.ts`.
- New export: a builder in `src/lib/pdf/`, a route under `src/app/api/exports/`,
  a button on the page, gated by `export:run`.
- Hall rooms are rows in `HallResource` (currently Hall A, Hall B), not code.
- Departments for ministerial assignments are rows in `Privilege`; assignments
  carry a `role` (overseer/assistant/servant/assignee).

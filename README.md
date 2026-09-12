# Maitama Congregation Secretary System

A private web application for congregation record keeping: publisher records,
field service reports, meeting attendance, Kingdom Hall scheduling and the
elders' action list. Built with Next.js and PostgreSQL, deployed on Vercel.

Every page requires a signed-in account. Nothing in this system is public.

---

## Before you start

You need three things:

1. A **PostgreSQL database**. [Neon](https://neon.tech) and
   [Supabase](https://supabase.com) both have free tiers that suit a
   congregation's volume.
2. A **GitHub account**, to hold the code.
3. A **Vercel account**, to host it.

---

## Running it on your own machine first

```bash
npm install
cp .env.example .env       # then fill in the values
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

Open http://localhost:3000 and sign in with the email and password you put in
`SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`. Change that password immediately
from **Accounts → Your password**.

### The environment values

| Name | What it is |
| --- | --- |
| `DATABASE_URL` | Pooled Postgres connection string. |
| `DIRECT_URL` | Direct, non-pooled connection. Prisma Migrate needs this on Neon and Supabase. |
| `SESSION_SECRET` | At least 32 random characters. Generate with `openssl rand -base64 48`. |
| `SEED_ADMIN_EMAIL` | The first administrator's email. |
| `SEED_ADMIN_PASSWORD` | Their first password, at least 12 characters. |

Never commit `.env`. It is already in `.gitignore`.

---

## Putting it on Vercel

```bash
git init
git add .
git commit -m "Maitama Congregation Secretary System"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/mcss-app.git
git push -u origin main
```

Then in Vercel: **Add New → Project**, import the repository, and add all five
environment variables under **Settings → Environment Variables** before the
first deploy. Vercel's build command already runs `prisma generate` and
`prisma migrate deploy`, so the database schema is created on the first build.

After the first successful deploy, seed the administrator once:

```bash
npx vercel env pull .env.production.local
npx dotenv -e .env.production.local -- npm run db:seed
```

Or run `npm run db:seed` locally with your production `DATABASE_URL`.

---

## Who can do what

Access is set per account under **Accounts**. Give people the narrowest level
that lets them work.

| Level | Can do |
| --- | --- |
| Secretary / Coordinator | Everything, including imports and creating accounts. |
| Elder | Reads all records; edits reports, attendance, bookings and elders' items. |
| Ministerial servant | Edits reports, attendance and bookings. No elders' items. |
| Read only | Rosters, attendance and the hall calendar. No contact details. |

Permissions live in `src/lib/rbac.ts`. They are checked on the server in every
page and every action, not just hidden in the interface.

---

## How the parts fit together

**Publishers** hold bio-data, appointment, pioneer standing and contact
details. Changing someone's service group writes a row to the transfer log,
whether the change is made on the record or through the transfer form.

**Field service** is entered a month at a time on one sheet. Only pioneers
have an hours box; for everyone else it is disabled, because publishers report
participation and Bible studies rather than hours. A row left untouched stays
marked "not reported" rather than being saved as a nil report, so the overview
can tell the difference between someone who reported nothing and someone who
has not reported.

**Attendance** takes one count per meeting per day, in the hall and by video.
Entering the same date twice corrects the earlier figure instead of creating a
second row. The monthly averages are what the S-88 shows.

**Kingdom Hall** bookings are checked per room, not per building, so the
Hall A and Hall B can be in use at the same time. A clashing
request is still saved as pending with the overlap shown; the block happens at
approval, and is re-checked then in case the calendar changed in between.

**Import** reads a pasted spreadsheet, matches column headings loosely
("Surname", "Last Name" and "Family Name" all work), flags names already on
file, and shows you everything before writing. The whole batch lands or none of
it does.

**Exports** produce S-21 publisher cards, the S-88 attendance record and a
per-group field service analysis as PDFs, generated on the server and
downloaded directly.

---

## Keeping the records safe

These are personal records of real people, and Nigeria's Data Protection Act
applies to them.

- Sessions are signed JSON web tokens in an httpOnly cookie and last eight
  hours. `SESSION_SECRET` is what makes them unforgeable; if it ever leaks,
  change it, which signs everybody out.
- Passwords are hashed with bcrypt at cost 12. They are never stored or logged
  in readable form.
- Every change is written to an audit log, visible under **Accounts**.
- Read-only accounts never receive phone numbers, emails or addresses; those
  fields are left out of the query result, not merely hidden.
- Judicial matters do not belong in this system. The elders' tracker is for
  practical action items only.
- Take a database backup before any large import. Neon and Supabase both
  provide point-in-time restore.

---

## Project layout

```
src/
├── app/
│   ├── (app)/              pages behind sign-in
│   │   ├── dashboard/      reporting status and what needs attention
│   │   ├── publishers/     records, S-21 ledger, transfers
│   │   ├── groups/         rosters, overseers, assistants
│   │   ├── reports/        monthly sheet and service year summary
│   │   ├── attendance/     meeting counts and S-88 figures
│   │   ├── bookings/       hall calendar and conflict checking
│   │   ├── boe/            elders' action items
│   │   ├── import/         spreadsheet import
│   │   └── settings/       accounts and audit log
│   ├── api/exports/        PDF generation
│   └── login/
├── components/             shared interface pieces
├── lib/
│   ├── prisma.ts           single database client
│   ├── session.ts          cookie sessions
│   ├── rbac.ts             permission matrix
│   ├── validation.ts       zod schemas for every form
│   ├── bookings.ts         overlap detection
│   ├── import.ts           header matching and row parsing
│   └── pdf/                S-21, S-88 and group analysis
└── middleware.ts
```

Mutations are Next.js server actions, not REST endpoints, so the permission
check and the write sit in the same function. The only API routes are the PDF
downloads and a health check.

---

## Everyday jobs

**Start of the month.** Open **Field service**, pick the month that has just
ended, and work down the sheet. The overview shows who is still missing.

**After each meeting.** Open **Attendance** and record the two counts.

**End of the service year.** Download the S-88 from **Attendance**, and each
publisher's S-21 from their record.

**Someone moves group.** Open their record, use "Move to another group". The
history stays on both the publisher and the receiving group.

**Someone moves away.** Set their standing to "Transferred out" rather than
deleting, so their service history survives.

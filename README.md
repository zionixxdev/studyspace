# StudySpace

A production-minded study collaboration platform. Students message each other,
join communities, share PDFs and images from one central Google Drive account,
annotate the same document together in real time, run private study rooms,
organise tasks and deadlines, and track focused study time — all in a
distraction-free, installable PWA.

Built with **React + TypeScript + Vite + Tailwind CSS** on the front end, a
**Node/Express + TypeScript** API for privileged work, **Supabase** (Auth,
Postgres with Row Level Security, Realtime) for identity and application data,
and **Google Drive** for file storage.

> This is a real, working scaffold, not a mockup. Authentication is genuine,
> permissions are enforced in Postgres and re-checked in the API, and features
> that need external configuration say so instead of pretending to work. See
> [Honest status](#honest-status) for exactly what has and has not been verified.

---

## Features

- **Auth & onboarding** — email/password signup with verification, login,
  logout, session restoration, password reset, protected routes, profile
  completion, account deletion.
- **Messaging** — one-to-one and group conversations, persistent history with
  keyset pagination, real-time delivery, replies, editing, soft deletion, emoji
  reactions, read receipts, unread counts, typing indicators, muting.
- **People & social** — search by name/username, follow, friend requests
  (accept/reject/cancel), blocking, reporting, privacy settings.
- **Communities** — public and private groups with roles
  (owner/admin/moderator/member), join/leave, invitation links and direct
  invitations, announcements, shared files, group chat, moderation tools.
- **Files** — upload PDFs, images and documents to a **single central Google
  Drive account**; list, preview, download, rename, archive, delete and share
  with a user, conversation, community or study room; per-user quota and
  storage usage; resumable, idempotent uploads.
- **PDF study workspace** — PDF.js viewer with page navigation, zoom, fit-to-width
  and full-screen, plus persistent annotations (highlight, underline, rectangle,
  ellipse, freehand, text note) in normalised coordinates.
- **Image study workspace** — zoom/pan image viewer with the same annotation
  toolset, sharing the annotation infrastructure without coupling the viewers.
- **Study rooms** — private, permission-controlled rooms with a shared
  document, shared annotations, room chat, participant presence and roles.
- **Tasks & planner** — personal and shared tasks, deadlines, priorities,
  subjects, completion history, upcoming-deadline views.
- **Focus timer** — configurable focus/break sessions, pause/resume, session
  history and daily/weekly statistics, with timestamp-based duration so a
  suspended tab cannot inflate it.
- **Notifications** — in-app notifications for messages, requests, invitations,
  mentions and reminders, with read/unread state and preferences.
- **Search** — permission-aware search across people, communities, messages,
  files and rooms.
- **PWA** — installable, offline fallback, safe caching of static assets only.

## Architecture

```
Browser ──(Supabase anon key, RLS)──────────────▶ Supabase (Auth · Postgres+RLS · Realtime)
   │
   └──(Bearer access token)──▶ StudySpace API ──▶ Google Drive (central owner account)
                                (Node/Express)  └▶ Supabase (service role, privileged)
```

Trust boundaries are strict:

- The **browser** ships only the Supabase anon key and the API base URL. It never
  sees the service-role key, Google OAuth secret or refresh token.
- The **API** verifies the Supabase access token, derives the user id from the
  verified identity, and re-checks every permission before touching Drive or the
  database with its service-role client.
- **RLS** is a real boundary: a leaked anon key still cannot read another user's
  rows.
- A **Drive file id is never authorization.** Every preview, download, edit and
  delete is checked against our own access-control records.

## Repository layout

```
studyspace/
├── apps/
│   ├── web/            React + Vite front end (the PWA)
│   └── api/            Node/Express API (Google Drive, privileged ops)
├── packages/
│   └── shared/         Types, constants and Zod schemas used by both
├── supabase/
│   ├── migrations/     0001_init · 0002_rls · 0003_functions
│   └── tests/          rls_policies.sql — cross-user access assertions
├── tests/
│   ├── integration/    live-Supabase + Drive tests (opt-in)
│   └── e2e/            Playwright journeys
├── docs/
│   ├── SETUP.md        from-scratch setup
│   └── SECURITY.md     trust boundaries, access control, secrets
├── .github/workflows/  CI (type-check, lint, tests, build, RLS tests)
├── DEPLOYMENT.md
└── .env.example
```

## Prerequisites

- Node.js ≥ 20
- A Supabase project (free tier is fine)
- A Google Cloud project with the Drive API enabled and an OAuth client
- (Optional) the Supabase CLI for local development

## Local setup

```bash
npm install
cp .env.example .env.local        # frontend values
cp .env.example apps/api/.env     # backend values (fill the secrets)
```

Then follow **[docs/SETUP.md](docs/SETUP.md)** to create the Supabase schema and
mint the Google Drive refresh token.

```bash
# Run the database migrations (Supabase CLI)
supabase link --project-ref YOUR-REF
supabase db push

# Start both apps
npm run dev          # web  → http://localhost:5173
npm run dev:api      # api  → http://localhost:8787
```

If the Supabase env vars are missing, the web app shows a setup screen instead
of faking a login.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Web dev server |
| `npm run dev:api` | API dev server (tsx watch) |
| `npm run build` | Build shared → api → web |
| `npm run typecheck` | TypeScript check across all workspaces |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (shared, api, web) |
| `npm run test:e2e` | Playwright journeys |

## Honest status

Verification is graded, because "it builds" is not "it works".

**Verified in this environment**

- `supabase/migrations/*.sql` — all 487 statements parse as valid PostgreSQL
  (checked with `pglast`).
- `packages/shared` and `apps/api` — type-check cleanly under `strict` +
  `noUncheckedIndexedAccess`.
- `apps/web` — type-checks cleanly (with `pdfjs-dist` stubbed, see below).
- Unit tests for `utils`, annotation geometry and the Zod schemas — **14 passing**.

**Written but not executed here** (the sandbox has no Supabase/Google
credentials, and a 2 GB memory cap that blocks a full `npm install`):

- The end-to-end upload → Drive → share → download path.
- RLS assertions in `supabase/tests/rls_policies.sql` (need a live database).
- Realtime delivery, and the Playwright suite.
- The production `vite build` and the API's Google Drive calls
  (`googleapis`'s type surface exceeds the sandbox heap, so the Drive module was
  type-checked against a local stub — CI runs the real check).

**Requires external credentials before it works at all**

- Supabase project + keys; Google Cloud OAuth client, refresh token and Drive
  root folder.

**Deliberately not implemented** (documented rather than faked)

- Exporting annotated PDFs with annotations burned in — annotations are stored
  separately, and downloads return the original file.
- Email/push notification delivery — the in-app channel is the reliable one.
- Voice/video in study rooms.

## Security

See **[docs/SECURITY.md](docs/SECURITY.md)** for the trust model, the access
control matrix, secret management and the account-deletion policy.

## Deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)**.

## License

MIT — see [LICENSE](LICENSE).

# Deployment

StudySpace ships as a **single container** that serves both the API and the
built frontend. One image, one URL, no CORS to configure. It can also be split
(static frontend + API elsewhere) — see [Splitting the two](#splitting-the-two).

## Deploying to AntiDeploy

AntiDeploy builds anything with a Dockerfile, and this repo has one at the root.
The important thing to understand first:

> **AntiDeploy reads your repository's default branch.** If the code is still on
> a feature branch, the platform sees an empty repo and reports
> *"We couldn't identify what this is"* with *0 files read*. Merge the branch
> into `main` first.

### Steps

1. **Merge the scaffold into `main`.** AntiDeploy builds from `main`.
2. **Create the app** and point it at `zionixxdev/studyspace`. It will detect the
   `Dockerfile` and build it.
3. **Skip AntiDeploy's database step.** StudySpace's database is Supabase, not a
   local one — AntiDeploy's "create your tables" step is not needed. Apply the
   schema to Supabase instead (`docs/SETUP.md`).
4. **Set these environment variables** in the AntiDeploy dashboard:

   | Variable | Required | Notes |
   | --- | --- | --- |
   | `SUPABASE_URL` | **yes** | `https://<ref>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | **yes** | secret; server-only |
   | `SUPABASE_ANON_KEY` | **yes** | public; served to the browser |
   | `PORT` | usually set by the platform | the app reads it automatically |
   | `GOOGLE_CLIENT_ID` | for files | |
   | `GOOGLE_CLIENT_SECRET` | for files | secret |
   | `GOOGLE_REDIRECT_URI` | for files | the deployed callback URL |
   | `GOOGLE_REFRESH_TOKEN` | for files | secret; mint once, see `docs/SETUP.md` |
   | `GOOGLE_DRIVE_ROOT_FOLDER_ID` | for files | |

   The server **starts without** the Google variables — it just disables uploads
   and sharing, and the Files screen says so plainly rather than offering a
   button that fails. Add them when you have completed the Drive setup.

5. **Set the health check path** to `/api/health`. The container also declares a
   `HEALTHCHECK`, but the platform's own check is what gates the deploy.
6. **Point Supabase Auth at your URL.** In Supabase → Authentication → URL
   Configuration, set the Site URL and redirect URLs to the deployed origin, so
   confirmation and password-reset links come back to the right place.
7. **Smoke-test** using the checklist at the bottom of this file.

### The two warnings AntiDeploy raises

**"Data loss: Uploaded files will be lost."** — Not applicable here. StudySpace
stores files in **Google Drive**, not on the app's disk. The only thing written
locally is a temporary staging file during an upload, which is deleted as soon
as the bytes reach Drive. You do **not** need the S3 bucket it offers.

**"Exposed: Check your Supabase Row Level Security."** — Correct in general, and
worth taking seriously. It cannot see your policies from the outside, so it
warns by default. StudySpace's migrations **do** enable RLS on every table
(`supabase/migrations/0002_rls.sql`). The catch is that they must actually be
applied — an empty Supabase project has no tables *and* no policies. Run
`supabase db push` (or paste the three migration files in order) before sharing
the URL, and confirm with `supabase test db`, which asserts that cross-user
reads are denied.

### Booting without credentials

The server starts even when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are
unset, and serves a setup screen that names exactly which variables are missing.
This keeps a hosting platform from entering a restart loop. It is not a silent
success:

- `GET /api/health` (liveness) returns `ok` — the process is up.
- `GET /api/health/ready` (readiness) returns **503** with
  `{"database":"not_configured"}` until Supabase is configured.
- `GET /api/v1/config` reports `features.db: false`, and the UI shows the setup
  screen instead of a login form.

### Why no build-time secrets

The frontend reads its Supabase configuration from `GET /api/v1/config` at
runtime rather than from `VITE_*` variables compiled into the bundle. That means
the same image works in every environment, and changing a key never requires a
rebuild. `VITE_*` values still work as a fallback for static-only hosting.

## Splitting the two

If you would rather host the frontend statically (CDN) and the API separately:

```bash
npm ci
npm run build:web     # → apps/web/dist   (deploy as static, SPA fallback on)
npm run build:api     # → apps/api/dist   (run: node apps/api/dist/index.js)
```

Then set `VITE_API_BASE_URL=https://api.your-domain.example/api/v1` at web build
time, set `ALLOWED_ORIGINS` on the API to the exact frontend origin, and set
`SERVE_WEB_DIR` to nothing so the API does not try to serve a frontend it does
not have.

## Environment variables (full list)

See `.env.example`. Required to boot: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`. Required for the browser to authenticate:
`SUPABASE_ANON_KEY`. Everything else is optional or Drive-related.

The API validates its environment at boot and exits with a message naming the
missing variable, so a misconfiguration fails loudly rather than silently.

## Storage quotas

The central Drive account's quota is a hard ceiling shared with the owner's other
Google storage. StudySpace tracks per-user usage in Supabase and returns
`507 storage_limit` / `507 drive_quota_exceeded` with a clear message rather than
failing silently. Monitor usage and raise `LIMITS.PER_USER_STORAGE_BYTES` only
after checking the account's real headroom.

## Rollback

- **App** — redeploy the previous image/revision from the platform.
- **Database** — migrations are forward-only by convention. For a bad migration,
  ship a compensating migration rather than a destructive down-migration; keep a
  recent `supabase db dump` before applying schema changes.

## Post-deploy smoke test

1. `GET /api/health` returns `{"status":"ok"}`.
2. `GET /api/health/ready` returns `{"status":"ready"}`.
3. `GET /api/v1/config` returns your Supabase URL and `features.drive`.
4. The app loads at `/` and shows the login screen (not the setup screen).
5. Register a throwaway account and sign in.
6. Upload a small PDF; confirm the row reaches `upload_state = completed`.
7. Share it with a second account; confirm the second account can download it.
8. Confirm a **third** account gets `403` for the same file id — this is the
   check that proves the access-control model actually holds.
9. Open the PDF, add an annotation, reload, and confirm it persists.
10. Confirm the app installs as a PWA and the offline page appears with the
    network off.

## Free-tier reality check

This stack runs on free tiers, but "free" is not "unlimited". Supabase projects
pause after inactivity and have row/bandwidth caps; the central Drive account's
15 GB is shared with the owner's other Google data; the container may cold-start.
Review current limits before promising a zero-cost, always-on deployment.

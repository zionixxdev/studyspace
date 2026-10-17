# Deployment

StudySpace has two deployable pieces: the **static web app** and the **API**
(which needs a persistent Node process and outbound HTTPS to Google). They can
live on the same platform or different ones.

## 1. Verify the hosting platform first

Before choosing an architecture, confirm what the target actually supports. The
original brief named **AntiDeploy**; verify its current capabilities rather than
assuming them:

- [ ] Static Vite frontend hosting
- [ ] Node.js process execution (persistent)
- [ ] Environment variables / server secrets
- [ ] HTTPS on a custom domain
- [ ] SPA fallback (all routes → `index.html`)
- [ ] Request body size and execution time limits (affects uploads)
- [ ] Outbound HTTPS to `googleapis.com`
- [ ] Scheduled/background jobs

**Do not assume that a successful frontend deploy means the backend works.**
If the platform is static-only, deploy the API elsewhere (see below).

## 2. Frontend

```bash
npm ci
npm run build:web        # → apps/web/dist
```

Set the build-time variables:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_API_BASE_URL=https://api.your-domain.example/api/v1
```

Configure an SPA fallback so deep links (`/messages/123`) serve `index.html`.
The service worker caches **static assets only** — never API responses,
messages, signed URLs or PDFs.

## 3. Backend

```bash
npm ci
npm run build:api        # → apps/api/dist
node apps/api/dist/index.js
```

Required secrets (see `.env.example`): `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_DRIVE_ROOT_FOLDER_ID`,
`FRONTEND_ORIGIN`, `ALLOWED_ORIGINS`, `PORT`.

Good fits for the API on a free tier: Fly.io, Render, Railway or Cloudflare
Workers (with a Node compatibility layer). Each has different cold-start and
body-size behaviour — check upload limits against `LIMITS.MAX_FILE_BYTES`.

### Health checks

- `GET /api/health` — liveness (cheap)
- `GET /api/health/ready` — readiness (verifies the database)

Point the platform's health check at `/api/health`.

## 4. Supabase

```bash
supabase link --project-ref YOUR-REF
supabase db push
```

Then set the Auth **Site URL** and redirect URLs to the deployed frontend origin
so confirmation and reset links point at the right place.

## 5. Google OAuth redirects

Add the production callback to the OAuth client's authorised redirect URIs:

```
https://api.your-domain.example/api/v1/oauth/google/callback
```

The refresh token itself is portable across environments — you do **not** need
to re-consent unless the owner revokes access.

## 6. CORS

Set `ALLOWED_ORIGINS` to the exact frontend origin(s), comma-separated, no
trailing slash. A mismatch produces a browser CORS error even when the API is
healthy.

## 7. Storage quotas

The central Drive account's quota is a hard ceiling shared with the owner's other
Google storage. StudySpace tracks per-user usage in Supabase and returns
`507 storage_limit` / `507 drive_quota_exceeded` with a clear message rather than
failing silently. Monitor usage and raise `LIMITS.PER_USER_STORAGE_BYTES` only
after checking the account's real headroom.

## 8. Post-deploy smoke test

1. `GET /api/health` returns `{"status":"ok"}`.
2. `GET /api/health/ready` returns `{"status":"ready"}`.
3. Register a throwaway account and sign in.
4. Upload a small PDF; confirm the row reaches `upload_state = completed`.
5. Share it with a second account; confirm the second account can download it.
6. Confirm a **third** account gets `403` for the same file id.
7. Open the PDF, add an annotation, reload, and confirm it persists.
8. Confirm the app installs as a PWA and the offline page appears with the
   network off.

## 9. Rollback

- **Frontend** — redeploy the previous build (platform-specific "rollback").
- **API** — redeploy the previous image/revision.
- **Database** — migrations are forward-only by convention. For a bad migration,
  ship a compensating migration rather than a destructive down-migration; keep a
  recent logical backup (`supabase db dump`) before applying schema changes.

## Free-tier reality check

This stack runs on free tiers, but "free" is not "unlimited". Supabase projects
pause after inactivity and have row/bandwidth caps; the central Drive account's
15 GB is shared with the owner's other Google data; the API host may cold-start.
Review current limits before promising a zero-cost, always-on deployment.

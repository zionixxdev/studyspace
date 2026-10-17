# Setup

Everything needed to run StudySpace from scratch. Budget about 30 minutes,
mostly waiting on Google's OAuth screens.

## 1. Supabase

1. Create a project at <https://supabase.com/dashboard>. Note the **project
   URL**, the **anon public key** and the **service-role key** (Settings → API).
2. Apply the schema. Either use the CLI:

   ```bash
   supabase link --project-ref YOUR-PROJECT-REF
   supabase db push          # applies supabase/migrations/*.sql in order
   ```

   or paste `supabase/migrations/0001_init.sql`, then `0002_rls.sql`, then
   `0003_functions.sql` into the SQL editor **in that order**.
3. Confirm RLS is on: in the Table Editor every table should show "RLS enabled".
4. (Optional) Enable email confirmation under Authentication → Providers, and
   set the Site URL and redirect URLs to your app origin
   (`http://localhost:5173` in development).

### Verify the policies

```bash
supabase test db       # runs supabase/tests/rls_policies.sql
```

That script creates throwaway users and proves that cross-user reads are denied.
Run it against a scratch project, never production.

## 2. Google Drive (central storage)

StudySpace stores **every** uploaded file in one owner-controlled Google
account, inside a single folder. Students never connect their own Drive.

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a
   project and enable the **Google Drive API**.
2. Configure the OAuth consent screen (External, Testing is fine). Add the
   account that will own the files as a **test user**.
3. Create an **OAuth client ID** of type *Web application*. Add the redirect URI
   `http://localhost:8787/api/v1/oauth/google/callback` (and your production
   equivalent).
4. Mint a refresh token **once**, as the owner:

   ```bash
   # Uses the same client id/secret from your .env
   node -e "
   const {google}=require('googleapis');
   const o=new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET,process.env.GOOGLE_REDIRECT_URI);
   console.log(o.generateAuthUrl({access_type:'offline',prompt:'consent',scope:['https://www.googleapis.com/auth/drive.file']}));
   "
   ```

   Open the printed URL as the owner, approve, then exchange the `code`:

   ```bash
   node -e "
   const {google}=require('googleapis');
   const o=new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET,process.env.GOOGLE_REDIRECT_URI);
   o.getToken('PASTE_CODE_FROM_REDIRECT_URL').then(r=>console.log(r.tokens.refresh_token));
   "
   ```

5. Put the refresh token in the **backend** `.env` as `GOOGLE_REFRESH_TOKEN`.
6. Create a Drive folder for the app and set `GOOGLE_DRIVE_ROOT_FOLDER_ID` to its
   id (the last path segment of the folder's URL). If you leave it blank the API
   creates a `StudySpace` folder on first upload.

The `drive.file` scope is intentionally narrow: the app can only see and manage
files it created itself.

## 3. Environment files

```bash
cp .env.example .env.local        # apps/web reads VITE_* from here
cp .env.example apps/api/.env     # the API reads the secrets
```

Fill in:

| Variable | Where | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | frontend | public |
| `VITE_SUPABASE_ANON_KEY` | frontend | public; protected by RLS |
| `VITE_API_BASE_URL` | frontend | `/api/v1` in dev |
| `SUPABASE_URL` | backend | |
| `SUPABASE_SERVICE_ROLE_KEY` | backend | **secret** |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | backend | **secret** |
| `GOOGLE_REDIRECT_URI` | backend | |
| `GOOGLE_REFRESH_TOKEN` | backend | **secret** |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | backend | |
| `FRONTEND_ORIGIN` / `ALLOWED_ORIGINS` | backend | CORS |

The API validates these at boot and exits with a specific message if any are
missing, so a misconfiguration fails loudly rather than silently.

## 4. Run

```bash
npm install
npm run dev:api     # http://localhost:8787  (health: /api/health)
npm run dev         # http://localhost:5173
```

## 5. Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Setup screen instead of the login form | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` missing or not restarted |
| API exits immediately on start | a required variable is missing; the message names it |
| 502 `drive_auth_revoked` on upload | the refresh token is wrong or the owner revoked access |
| 507 `drive_quota_exceeded` | the central Drive account is full |
| 403 on a file you can see in the list | the grant expired or was revoked — refresh |
| CORS error in the browser | `ALLOWED_ORIGINS` does not include the exact frontend origin |

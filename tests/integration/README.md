# Integration tests

These tests exercise the parts that unit tests cannot: real Supabase
(Postgres + RLS + Auth) and the Google Drive integration. They are deliberately
kept out of the default `npm test` run because they need credentials.

## What they cover

| Area | Assertion |
| --- | --- |
| Auth | A signed-in user receives a valid session; an invalid token is rejected with 401. |
| RLS | User B cannot read user A's private group, files or conversations (mirrors `supabase/tests/rls_policies.sql`). |
| Uploads | `pending → uploading → completed` transitions persist; a retried request with the same idempotency key does not create a second file. |
| File sharing | A grant makes the file readable; revoking it takes effect immediately. |
| Realtime | A message insert is delivered to a subscribed member and not to a non-member. |
| Google Drive | Upload → download → delete round-trips against a dedicated test folder. |

## Running them

```bash
export SUPABASE_TEST_URL=...            # a SCRATCH project, never production
export SUPABASE_TEST_SERVICE_ROLE_KEY=...
export GOOGLE_TEST_FOLDER_ID=...        # a throwaway folder in the central account
npm run test:integration
```

> Run these only against an isolated Supabase project and a throwaway Drive
> folder. The suite creates and deletes real rows and real Drive files.

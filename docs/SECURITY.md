# Security model

Security is treated as a core feature. This document records the trust
boundaries, the access-control decisions, and the policies for files,
credentials and account deletion.

## Trust boundaries

```
┌─────────────┐   anon key + RLS      ┌────────────────────────────┐
│   Browser   │──────────────────────▶│ Supabase (Auth/DB/Realtime)│
│  (untrusted)│                       └────────────────────────────┘
└──────┬──────┘
       │ Bearer access token
       ▼
┌──────────────────────────────────────────────────────────────────┐
│ StudySpace API  (trusted)                                         │
│  · verifies the Supabase JWT                                      │
│  · re-checks every permission                                     │
│  · holds the service-role key and Google credentials              │
└───────────────┬──────────────────────────────┬────────────────────┘
                │ service role                 │ OAuth2 (refresh token)
                ▼                              ▼
        ┌───────────────┐            ┌──────────────────┐
        │  Supabase DB  │            │  Google Drive    │
        └───────────────┘            │ (central account)│
                                     └──────────────────┘
```

**The browser is never trusted.** It may hold only the Supabase anon key and
public configuration. Any identity, role, membership or permission it sends is
ignored; the API derives all of that from the verified token.

## What each layer enforces

| Layer | Responsibility |
| --- | --- |
| RLS (Postgres) | Stops a leaked anon key from reading another user's rows. Policies use `SECURITY DEFINER` helpers so they never recurse. |
| API | The authoritative gate. Uses the service-role client, so it re-applies every rule itself before acting. |
| Google Drive | Least-privilege `drive.file` scope; files are private by default and never given public links. |

RLS is a boundary, not a substitute for backend authorization — the two are
independent and both must pass.

## Access-control decisions

### File access

A file is accessible when the caller is the **owner**, or holds a **live,
unexpired, unrevoked grant** whose scope they currently belong to:

- `scope = 'user'` → the specific user
- `scope = 'conversation'` → a member of that conversation
- `scope = 'group'` → a member of that community
- `scope = 'room'` → a member of that study room

`public.can_access_file()` encodes this in SQL; `resolveFileAccess()` mirrors it
in the API. **A Drive file id is never sufficient.** Knowing the id grants
nothing; every preview, download, edit and delete is checked first.

### Community roles

| Role | May |
| --- | --- |
| owner | everything, including transferring/deleting the community |
| admin | manage settings and members, grant member/moderator |
| moderator | designated moderation actions |
| member | use member features |

Privilege is written only by `SECURITY DEFINER` RPCs. A client cannot set its own
role or membership; the functions reject self-escalation explicitly.

### Blocking

`are_blocked()` is checked before starting a conversation, sending a friend
request, or inviting someone to a room. Because it runs server-side, a blocked
user cannot bypass it by calling the API directly.

## Credential management

| Secret | Lives in | Never |
| --- | --- | --- |
| Supabase anon key | browser | — (safe by design) |
| Supabase service-role key | API env | browser, logs, bundles |
| Google client secret | API env | browser, logs |
| Google refresh token | API env | browser, logs, DB |

- Secrets are read from environment variables at boot and validated; the server
  exits with a specific message if any are missing.
- The logger **redacts** `authorization`, `cookie`, `access_token`,
  `refresh_token`, `password`, and the Google/Supabase secrets.
- Error responses never include stack traces or secret values in production.
- No secret is ever prefixed `VITE_` — that would embed it in the bundle.

## Invitation tokens

Invitation tokens are 32 random bytes, base64url-encoded, unique in the database,
and carry an expiry, a use limit and a status. Accepting an invitation re-checks
status, expiry, remaining uses and (for direct invitations) the intended
recipient. Revocation and expiry are enforced at read time as well as write time.

## Upload safety

- MIME type and size are validated against an allow-list before a byte reaches
  Drive.
- Uploads stream to a temp file and then to Drive, so large files are not
  buffered in memory.
- An idempotency key scopes retries to the owner, so a retried upload does not
  create a second file.
- A failed upload leaves no orphan: the file row is marked `failed`.
- The content endpoint streams through the API with
  `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store` — no
  permanent public link is ever created.

## Account deletion

Deleting an account:

1. removes the user's owned Drive files (best-effort, so a Drive hiccup does not
   strand the account),
2. writes an audit event,
3. deletes the auth user, which cascades to the profile and everything that
   references it.

The UI requires typing `DELETE` to confirm, because the action is irreversible.

## Auditing

Sensitive actions (file upload/delete, role changes, community creation, account
deletion) are recorded in `audit_events` — append-only and unreadable from the
browser. Metadata never contains secrets or private message bodies.

## Reporting a vulnerability

Open a private security advisory on the repository rather than a public issue.

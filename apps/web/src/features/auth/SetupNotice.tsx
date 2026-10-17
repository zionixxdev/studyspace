import { Settings2, ServerCog } from 'lucide-react';
import { configCameFromApi, runtimeFeatures } from '@/lib/env';

/**
 * Shown when the app has no usable Supabase configuration. We refuse to fake a
 * login — this is the honest state. The message differs depending on whether
 * the API answered (fix server env vars) or not (local .env file).
 */
export function SetupNotice() {
  const serverSide = configCameFromApi || !runtimeFeatures.db;

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="glass max-w-lg rounded-2xl p-6 shadow-glass">
        <div className="flex items-center gap-3">
          {serverSide ? (
            <ServerCog className="h-6 w-6 text-brand-500" aria-hidden="true" />
          ) : (
            <Settings2 className="h-6 w-6 text-brand-500" aria-hidden="true" />
          )}
          <h1 className="text-xl font-semibold">StudySpace needs configuration</h1>
        </div>

        {serverSide ? (
          <>
            <p className="mt-3 text-sm text-content-muted">
              The server is running, but it has no Supabase credentials, so authentication and data
              cannot work yet. Set these <strong>environment variables on the host</strong> (not in
              this repo), then redeploy or restart the app:
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              <li><code className="rounded bg-surface-muted px-1">SUPABASE_URL</code></li>
              <li><code className="rounded bg-surface-muted px-1">SUPABASE_SERVICE_ROLE_KEY</code></li>
              <li><code className="rounded bg-surface-muted px-1">SUPABASE_ANON_KEY</code></li>
            </ul>
            <p className="mt-3 text-sm text-content-muted">
              Then apply the SQL in <code className="rounded bg-surface-muted px-1">supabase/migrations</code>{' '}
              to your Supabase project so the tables and Row Level Security exist. See{' '}
              <strong>docs/SETUP.md</strong>.
            </p>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-content-muted">
              This build is missing its Supabase credentials, so authentication and data cannot work
              yet. Create a <code className="rounded bg-surface-muted px-1">.env.local</code> from{' '}
              <code className="rounded bg-surface-muted px-1">.env.example</code> and set:
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              <li><code className="rounded bg-surface-muted px-1">VITE_SUPABASE_URL</code></li>
              <li><code className="rounded bg-surface-muted px-1">VITE_SUPABASE_ANON_KEY</code></li>
              <li><code className="rounded bg-surface-muted px-1">VITE_API_BASE_URL</code></li>
            </ul>
            <p className="mt-3 text-sm text-content-muted">
              Then run the migrations in{' '}
              <code className="rounded bg-surface-muted px-1">supabase/migrations</code> and restart
              the dev server. See <strong>docs/SETUP.md</strong>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

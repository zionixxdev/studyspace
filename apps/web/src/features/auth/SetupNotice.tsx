import { Settings2 } from 'lucide-react';

/**
 * Shown when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing. We refuse
 * to fake a login — this is the honest state.
 */
export function SetupNotice() {
  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="glass max-w-lg rounded-2xl p-6 shadow-glass">
        <div className="flex items-center gap-3">
          <Settings2 className="h-6 w-6 text-brand-500" aria-hidden="true" />
          <h1 className="text-xl font-semibold">StudySpace needs configuration</h1>
        </div>
        <p className="mt-3 text-sm text-content-muted">
          This build is missing its Supabase credentials, so authentication and data cannot work yet.
          Create a <code className="rounded bg-surface-muted px-1">.env.local</code> from{' '}
          <code className="rounded bg-surface-muted px-1">.env.example</code> and set:
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          <li>
            <code className="rounded bg-surface-muted px-1">VITE_SUPABASE_URL</code>
          </li>
          <li>
            <code className="rounded bg-surface-muted px-1">VITE_SUPABASE_ANON_KEY</code>
          </li>
          <li>
            <code className="rounded bg-surface-muted px-1">VITE_API_BASE_URL</code>
          </li>
        </ul>
        <p className="mt-3 text-sm text-content-muted">
          Then run the migrations in <code className="rounded bg-surface-muted px-1">supabase/migrations</code>{' '}
          and restart the dev server. See <strong>docs/SETUP.md</strong> for the full walkthrough.
        </p>
      </div>
    </div>
  );
}

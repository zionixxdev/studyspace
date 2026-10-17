/**
 * Runtime configuration.
 *
 * The app fetches its public Supabase config from the API at start-up rather
 * than baking it in at build time. This is what lets one container image be
 * deployed anywhere without rebuilding, and it keeps working when the app is
 * served from a service-worker cache (the fetch happens at runtime, not build).
 *
 * Falls back to build-time VITE_* values when the API is unreachable, so local
 * development and static-only hosting still work.
 */
export interface RuntimeConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  apiBaseUrl?: string;
  features?: { drive?: boolean };
}

declare global {
  interface Window {
    __STUDYSPACE__?: RuntimeConfig;
  }
}

export async function loadRuntimeConfig(): Promise<void> {
  if (typeof window === 'undefined' || window.__STUDYSPACE__) return;

  const base = import.meta.env.VITE_API_BASE_URL || '/api/v1';
  try {
    const res = await fetch(`${base}/config`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return;
    const cfg = (await res.json()) as Partial<RuntimeConfig> & { features?: { drive?: boolean } };
    window.__STUDYSPACE__ = {
      supabaseUrl: cfg.supabaseUrl ?? undefined,
      supabaseAnonKey: cfg.supabaseAnonKey ?? undefined,
      apiBaseUrl: cfg.apiBaseUrl ?? undefined,
      features: cfg.features,
    };
  } catch {
    // Offline, or the API is not up yet: fall back to build-time values.
  }
}

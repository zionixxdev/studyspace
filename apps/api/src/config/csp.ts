/**
 * Content-Security-Policy for the single-container deployment.
 *
 * The SPA is served from this origin but talks to Supabase directly from the
 * browser, so the policy must explicitly allow that origin for `connect-src`
 * (REST + Auth) and `wss:` (Realtime). Helmet's default policy has no
 * `connect-src`, so it falls back to `default-src 'self'` and the browser blocks
 * every Supabase request with "Failed to fetch".
 *
 * Dependency-free so it can be unit-tested in isolation.
 */
export interface CspDirectives {
  [directive: string]: string[];
}

export function buildCspDirectives(supabaseUrl?: string | null): CspDirectives {
  let httpOrigin: string | null = null;
  if (supabaseUrl) {
    try {
      httpOrigin = new URL(supabaseUrl).origin;
    } catch {
      httpOrigin = null;
    }
  }
  const wsOrigin = httpOrigin ? httpOrigin.replace(/^http/, 'ws') : null;

  const connectSrc = ["'self'", ...(httpOrigin ? [httpOrigin] : []), ...(wsOrigin ? [wsOrigin] : [])];

  return {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    fontSrc: ["'self'", 'https:', 'data:'],
    formAction: ["'self'"],
    frameAncestors: ["'self'"],
    // Avatars and study images may be served from Supabase or Drive.
    imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
    objectSrc: ["'none'"],
    scriptSrc: ["'self'"],
    scriptSrcAttr: ["'none'"],
    styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
    connectSrc,
    // pdf.js loads its worker as a bundled asset / blob.
    workerSrc: ["'self'", 'blob:'],
    manifestSrc: ["'self'"],
    upgradeInsecureRequests: [],
  };
}

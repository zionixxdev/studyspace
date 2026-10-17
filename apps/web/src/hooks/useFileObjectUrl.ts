import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';

/**
 * Fetches a file's bytes through the authorized API endpoint and exposes them as
 * a blob: URL. This keeps the Supabase access token in the Authorization header
 * (which <img>/pdf.js cannot send) instead of putting a credential in the URL.
 * The object URL is revoked on cleanup so we do not leak memory.
 */
export function useFileObjectUrl(fileId: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fileId) return;
    let revoked = false;
    let objectUrl: string | null = null;

    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const res = await fetch(`${env.VITE_API_BASE_URL}/files/${fileId}/content`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error('You do not have access to this file');
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (revoked) URL.revokeObjectURL(objectUrl);
        else setUrl(objectUrl);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load the file');
      }
    })();

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [fileId]);

  return { url, error };
}

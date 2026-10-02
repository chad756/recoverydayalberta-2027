// =============================================================================
// Supabase connection (browser)
// =============================================================================
// The two values below are read from environment variables when the site is
// built:
//   - On your computer: from the file .env.local (never committed to Git).
//   - On GitHub:        from the repository secrets VITE_SUPABASE_URL and
//                       VITE_SUPABASE_ANON_KEY (see README.md).
//
// The anon / publishable key is the ONLY Supabase key allowed in the browser.
// It is safe to be public because Row Level Security (Phase 2) decides what
// each user can see. NEVER put the service_role / secret key here.
// =============================================================================

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** true when both values were provided at build time. */
export const isSupabaseConfigured = Boolean(url && anonKey);

// Safety net: refuse to run if someone pasted a secret key by mistake.
function looksLikeSecretKey(key) {
  if (!key) return false;
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.role === 'service_role';
    } catch {
      return false;
    }
  }
  return false;
}

if (looksLikeSecretKey(anonKey)) {
  throw new Error(
    'VITE_SUPABASE_ANON_KEY is a SECRET key. Use the anon / publishable key instead, and rotate the secret key in Supabase now.',
  );
}

/** The shared Supabase client, or null if the site was built without keys. */
export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/**
 * Quick health check used by the admin page "System check".
 * Calls Supabase Auth's public health endpoint with the anon key.
 * Returns { ok: boolean, message: string }.
 */
export async function checkSupabaseConnection() {
  if (!isSupabaseConfigured) {
    return { ok: false, message: 'Supabase is not configured (missing URL or anon key at build time).' };
  }
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/health`, {
      headers: { apikey: anonKey },
    });
    if (res.ok) return { ok: true, message: 'Connected to Supabase.' };
    if (res.status === 401) return { ok: false, message: 'Supabase rejected the anon key (401). Check the key.' };
    return { ok: false, message: `Supabase answered with status ${res.status}. The project may be paused.` };
  } catch {
    return { ok: false, message: 'Could not reach Supabase. Check the URL, your internet connection, or whether the project is paused.' };
  }
}

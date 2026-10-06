// Supabase implementation of the data layer (see api.js).
import { supabase, isSupabaseConfigured, checkSupabaseConnection } from './supabase.js';

export const isConfigured = isSupabaseConfigured;
const url = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function need() {
  if (!supabase) throw new Error('The site is not connected to Supabase yet (missing keys at build time).');
  return supabase;
}

/** Turn database errors into plain-language messages. */
function friendly(error) {
  const msg = error?.message || String(error);
  if (/JWT expired|invalid JWT|not authenticated/i.test(msg)) return new Error('Your login has expired. Please log in again.');
  if (/row-level security|permission denied/i.test(msg)) return new Error('You don’t have permission to do that.');
  if (/duplicate key/i.test(msg)) return new Error('That already exists.');
  if (/violates check constraint/i.test(msg)) return new Error('One of the values isn’t allowed. Please check the form.');
  if (/Failed to fetch|NetworkError/i.test(msg)) return new Error('Could not reach the server. Check your internet connection and try again.');
  return new Error(msg);
}

async function run(promise) {
  const { data, error } = await promise;
  if (error) throw friendly(error);
  return data;
}

export const api = {
  async list(table, q = {}) {
    let x = need().from(table).select(q.select || '*');
    for (const [k, v] of Object.entries(q.eq || {})) x = v === null ? x.is(k, null) : x.eq(k, v);
    for (const [k, v] of Object.entries(q.in || {})) x = x.in(k, v.length ? v : ['00000000-0000-0000-0000-000000000000']);
    for (const [k, v] of Object.entries(q.neq || {})) x = x.neq(k, v);
    if (q.order) x = x.order(q.order, { ascending: q.asc !== false });
    x = x.limit(q.limit || 5000);
    return run(x);
  },
  async get(table, id, key = 'id') {
    return run(need().from(table).select('*').eq(key, id).maybeSingle());
  },
  async insert(table, row) {
    return run(need().from(table).insert(row).select());
  },
  async update(table, match, patch) {
    let x = need().from(table).update(patch);
    for (const [k, v] of Object.entries(match)) x = x.eq(k, v);
    return run(x.select());
  },
  async upsert(table, rows, onConflict) {
    return run(need().from(table).upsert(rows, onConflict ? { onConflict } : undefined).select());
  },
  async remove(table, match) {
    let x = need().from(table).delete();
    for (const [k, v] of Object.entries(match)) x = x.eq(k, v);
    return run(x);
  },
  async rpc(name, args = {}) {
    return run(need().rpc(name, args));
  },
  async fn(name, body = {}) {
    const { data, error } = await need().functions.invoke(name, { body });
    if (error) {
      let msg = error.message;
      try { msg = (await error.context.json()).error || msg; } catch { /* keep message */ }
      throw new Error(msg);
    }
    return data;
  },
  async pdf(kind, id) {
    const { data } = await need().auth.getSession();
    const res = await fetch(`${url}/functions/v1/document-pdf?${kind}=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${data.session?.access_token}`, apikey: anonKey },
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not create the PDF.');
    const cd = res.headers.get('Content-Disposition') || '';
    return { blob: await res.blob(), filename: (cd.match(/filename="([^"]+)"/) || [])[1] || `${kind}.pdf` };
  },
  async upload(bucket, path, file) {
    return run(need().storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false }));
  },
  async removeFile(bucket, path) {
    return run(need().storage.from(bucket).remove([path]));
  },
  async signedUrl(bucket, path, seconds = 120) {
    const d = await run(need().storage.from(bucket).createSignedUrl(path, seconds));
    return d.signedUrl;
  },
  health: checkSupabaseConnection,

  auth: {
    async session() { return (await need().auth.getSession()).data.session; },
    async user() { return (await need().auth.getUser()).data.user; },
    async signIn(email, password) {
      const { data, error } = await need().auth.signInWithPassword({ email, password });
      if (error) throw new Error(/Email not confirmed/i.test(error.message)
        ? 'Please confirm your email first. Check your inbox for the link we sent.'
        : /Invalid login/i.test(error.message) ? 'That email and password don’t match.' : error.message);
      return data;
    },
    async signUp(email, password, fullName, redirectTo) {
      const { data, error } = await need().auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: redirectTo } });
      if (error) throw new Error(error.message);
      return data;
    },
    async signOut() { await need().auth.signOut(); },
    async sendReset(email, redirectTo) {
      const { error } = await need().auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw new Error(error.message);
    },
    async updatePassword(password) {
      const { error } = await need().auth.updateUser({ password });
      if (error) throw new Error(error.message);
    },
    onChange(cb) { return need().auth.onAuthStateChange((event, session) => cb(event, session)); },
    // ---- two-factor (authenticator app) ----
    async aal() {
      const { data, error } = await need().auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) throw error;
      return data; // { currentLevel, nextLevel }
    },
    async factors() {
      const { data, error } = await need().auth.mfa.listFactors();
      if (error) throw error;
      return data.totp || [];
    },
    async enroll() {
      const { data, error } = await need().auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
      if (error) throw new Error(error.message);
      return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
    },
    async verify(factorId, code) {
      const { error } = await need().auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw new Error('That code didn’t work. Check the time on your phone and try the newest code.');
    },
    async unenroll(factorId) { await need().auth.mfa.unenroll({ factorId }); },
  },
};

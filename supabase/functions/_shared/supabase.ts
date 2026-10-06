// Shared helpers for every Edge Function.
// Secrets come from Supabase → Edge Functions → Secrets (never from the repo):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (provided automatically)
//   RESEND_API_KEY, PAYMENT_WEBHOOK_SECRET, INBOUND_EMAIL_SECRET, CRON_SECRET, SITE_URL
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { settingsMap } from './rules.js';

export const env = (name: string, fallback = ''): string => Deno.env.get(name) ?? fallback;

/** Only the site's own address may call the browser-facing functions. */
export function corsHeaders(req: Request): Record<string, string> {
  const allowed = env('ALLOWED_ORIGINS', '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get('origin') ?? '';
  const allow = allowed.length === 0 || allowed.includes(origin) ? origin || '*' : allowed[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Vary': 'Origin',
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

/** Service-role client: bypasses RLS. Use only after checking who is calling. */
export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Client that acts as the signed-in caller (RLS applies). */
export function userClient(req: Request): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function decodeJwt(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')));
  } catch { return {}; }
}

export type Caller = { id: string; email: string; role: string; orgId: string | null; aal: string };

/** Verify the caller's login and load their profile. Throws on failure. */
export async function getCaller(req: Request): Promise<Caller> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Please log in.');
  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'Your login has expired. Please log in again.');
  const { data: profile } = await admin.from('profiles').select('role, organization_id, disabled').eq('id', data.user.id).single();
  if (!profile || profile.disabled) throw new HttpError(403, 'This account is disabled.');
  const claims = decodeJwt(token);
  return { id: data.user.id, email: data.user.email ?? '', role: profile.role, orgId: profile.organization_id, aal: String(claims.aal ?? 'aal1') };
}

export async function requireStaff(req: Request, roles = ['admin', 'finance', 'super_admin']): Promise<Caller> {
  const c = await getCaller(req);
  if (!roles.includes(c.role)) throw new HttpError(403, 'Staff only.');
  const settings = await loadSettings(adminClient());
  if (settings.security?.require_staff_mfa !== false && c.aal !== 'aal2') {
    throw new HttpError(403, 'Please sign in with two-factor authentication.');
  }
  return c;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// deno-lint-ignore no-explicit-any
export async function loadSettings(admin: SupabaseClient): Promise<Record<string, any>> {
  const { data } = await admin.from('settings').select('key, value');
  return settingsMap(data ?? []);
}

/** Run a handler with CORS + friendly errors. */
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
    try {
      return await handler(req);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      return json(req, { error: e instanceof HttpError ? e.message : 'Something went wrong. Please try again.' }, status);
    }
  });
}

/** Everything needed to draw an invoice or receipt. */
export async function loadInvoiceBundle(admin: SupabaseClient, invoiceId: string) {
  const [inv, lines, pays, refs, rec] = await Promise.all([
    admin.from('invoices').select('*').eq('id', invoiceId).single(),
    admin.from('invoice_lines').select('*').eq('invoice_id', invoiceId).order('sort'),
    admin.from('payments').select('*').eq('invoice_id', invoiceId).eq('voided', false).order('paid_at'),
    admin.from('refunds').select('*').eq('invoice_id', invoiceId),
    admin.from('receipts').select('*').eq('invoice_id', invoiceId),
  ]);
  if (inv.error || !inv.data) throw new HttpError(404, 'Invoice not found.');
  return { invoice: inv.data, lines: lines.data ?? [], payments: pays.data ?? [], refunds: refs.data ?? [], receipts: rec.data ?? [] };
}

let logoCache: Uint8Array | null = null;
/** The Last Door logo is served by the website itself (public/images/lastdoor-logo.jpg). */
export async function loadLogo(siteUrl: string): Promise<Uint8Array | undefined> {
  if (logoCache) return logoCache;
  try {
    const res = await fetch(new URL('images/lastdoor-logo.jpg', siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`));
    if (!res.ok) return undefined;
    logoCache = new Uint8Array(await res.arrayBuffer());
    return logoCache;
  } catch { return undefined; }
}

export function siteUrl(settings: Record<string, any>): string {
  const u = env('SITE_URL') || settings.site?.url || 'https://recoverydayalberta.com/';
  return u.endsWith('/') ? u : `${u}/`;
}

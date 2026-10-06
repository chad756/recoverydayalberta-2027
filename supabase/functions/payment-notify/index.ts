// =============================================================================
// payment-notify — webhook from the Last Door payment portal (Major Tom)
// =============================================================================
// Major Tom's site POSTs JSON after each successful event payment:
//   { "reference": "2027CD001", "amount": "100.00", "payer_name": "...",
//     "payer_email": "...", "organization": "...", "paid_at": "2027-06-02T15:04:05Z",
//     "payment_id": "pi_..." }
// Header:  X-RDA-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256>
//   v1 = HMAC_SHA256(PAYMENT_WEBHOOK_SECRET, "<t>.<raw body>")
// Rejected if the signature is wrong or older than 5 minutes. Duplicates
// (same payment_id) are ignored. Deploy with:  --no-verify-jwt
// =============================================================================
import { adminClient, env, json, loadSettings, serve } from '../_shared/supabase.ts';
import { processIncoming } from '../_shared/payments.ts';
import { parseMoney } from '../_shared/rules.js';

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function verify(secret: string, header: string, raw: string, nowSec = Math.floor(Date.now() / 1000)) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=')));
  const t = Number(parts.t);
  if (!secret || !t || !parts.v1) return false;
  if (Math.abs(nowSec - t) > 300) return false;
  return safeEqual(await hmacHex(secret, `${t}.${raw}`), String(parts.v1).toLowerCase());
}

serve(async (req) => {
  if (req.method !== 'POST') return json(req, { error: 'POST only' }, 405);
  const raw = await req.text();
  if (!(await verify(env('PAYMENT_WEBHOOK_SECRET'), req.headers.get('x-rda-signature') ?? '', raw))) {
    return json(req, { error: 'Invalid or expired signature.' }, 401);
  }
  const b = JSON.parse(raw);
  const amount = parseMoney(b.amount ?? b.amount_cad ?? '');
  const admin = adminClient();
  const result = await processIncoming(admin, await loadSettings(admin), {
    source: 'webhook', external_id: b.payment_id ?? b.stripe_payment_id ?? null, reference: b.reference ?? b.invoice ?? null,
    amount_cents: Number.isNaN(amount) ? 0 : amount, payer_name: b.payer_name ?? null, payer_email: b.payer_email ?? null,
    organization: b.organization ?? null, paid_at: b.paid_at ?? null, raw: b,
  });
  return json(req, result);
});

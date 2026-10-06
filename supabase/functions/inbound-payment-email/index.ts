// =============================================================================
// inbound-payment-email — fallback when the payment portal can only send email
// =============================================================================
// Point an inbound-email service (Resend Inbound or Postmark Inbound) for
// payments@recoverydayalberta.com at:
//   https://<project>.supabase.co/functions/v1/inbound-payment-email?key=<INBOUND_EMAIL_SECRET>
// The function reads the invoice number (2027CD###) and the amount ($100.00)
// from the email subject/body. Anything unclear goes to the Unmatched queue.
// Deploy with:  --no-verify-jwt
// =============================================================================
import { adminClient, env, json, loadSettings, serve } from '../_shared/supabase.ts';
import { processIncoming } from '../_shared/payments.ts';
import { normalizeInvoiceNumber, parseMoney } from '../_shared/rules.js';

serve(async (req) => {
  const key = new URL(req.url).searchParams.get('key') ?? '';
  if (!env('INBOUND_EMAIL_SECRET') || key !== env('INBOUND_EMAIL_SECRET')) return json(req, { error: 'Forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  // Resend inbound: {data:{subject,text,html,from,message_id}} · Postmark: {Subject,TextBody,From,MessageID}
  const d = b.data ?? b;
  const subject = String(d.subject ?? d.Subject ?? '');
  const text = String(d.text ?? d.TextBody ?? d.html ?? d.HtmlBody ?? '').replace(/<[^>]+>/g, ' ');
  const all = `${subject}\n${text}`;
  const admin = adminClient();
  const settings = await loadSettings(admin);
  const ref = normalizeInvoiceNumber(all, settings.invoice?.prefix ?? '2027CD', settings.invoice?.digits ?? 3);
  const amountMatch = all.match(/(?:amount|total|paid)[^$\d]{0,20}\$?\s*([\d,]+\.\d{2})/i) ?? all.match(/\$\s*([\d,]+\.\d{2})/);
  const amount = amountMatch ? parseMoney(amountMatch[1]) : 0;
  const emailMatch = all.match(/(?:email|e-mail)[:\s]+([^\s<>]+@[^\s<>]+)/i);
  const result = await processIncoming(admin, settings, {
    source: 'email', external_id: String(d.message_id ?? d.MessageID ?? '') || null, reference: ref,
    amount_cents: amount || 0, payer_email: emailMatch?.[1] ?? null, raw: { subject, text: text.slice(0, 4000) },
  });
  return json(req, result);
});

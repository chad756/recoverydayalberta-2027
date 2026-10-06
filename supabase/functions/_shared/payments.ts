// One pipeline for every automatic payment notification (webhook, inbound email).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { invoiceState, matchPayment, todayInEdmonton } from './rules.js';
import { emailReceipt } from './documents.ts';

export type Incoming = {
  source: 'webhook' | 'email';
  external_id: string | null;
  reference: string | null;
  amount_cents: number;
  payer_name?: string | null;
  payer_email?: string | null;
  organization?: string | null;
  paid_at?: string | null;
  raw: unknown;
};

// deno-lint-ignore no-explicit-any
export async function processIncoming(admin: SupabaseClient, settings: Record<string, any>, p: Incoming) {
  if (p.external_id) {
    const { data: dup } = await admin.from('payment_notifications').select('id').eq('external_id', p.external_id).maybeSingle();
    if (dup) return { status: 'duplicate' };
  }
  const { data: invoices } = await admin.from('invoices').select('*').eq('status', 'sent');
  const ids = (invoices ?? []).map((i) => i.id);
  const { data: pays } = ids.length ? await admin.from('payments').select('*').in('invoice_id', ids).eq('voided', false) : { data: [] };
  const states: Record<string, ReturnType<typeof invoiceState>> = {};
  for (const inv of invoices ?? []) states[inv.id] = invoiceState(inv, (pays ?? []).filter((x) => x.invoice_id === inv.id), []);
  const prefix = settings.invoice?.prefix ?? '2027CD';
  const digits = settings.invoice?.digits ?? 3;
  // deno-lint-ignore no-explicit-any
  const m: any = matchPayment({ reference: p.reference, amountCents: p.amount_cents, email: p.payer_email }, invoices ?? [], states, prefix, digits);

  const { data: note, error } = await admin.from('payment_notifications').insert({
    source: p.source, external_id: p.external_id, reference: p.reference, amount_cents: p.amount_cents,
    payer_name: p.payer_name, payer_email: p.payer_email, organization: p.organization,
    paid_at: p.paid_at, raw: p.raw, status: 'unmatched', reason: m.reason, invoice_id: m.invoice?.id ?? null,
  }).select().single();
  if (error) { if (error.code === '23505') return { status: 'duplicate' }; throw error; }

  if (m.status !== 'matched' || !m.invoice) return { status: 'unmatched', reason: m.reason };

  const { data: receiptNo, error: payErr } = await admin.rpc('record_payment', { p: {
    invoice_id: m.invoice.id, amount_cents: p.amount_cents, method: 'card', received_label: 'Paid Visa LD',
    paid_at: (p.paid_at ?? '').slice(0, 10) || todayInEdmonton(), reference: p.external_id ?? p.reference,
    source: p.source, external_id: p.external_id, payer_name: p.payer_name, payer_email: p.payer_email, needs_review: true,
  } });
  if (payErr) {
    await admin.from('payment_notifications').update({ reason: payErr.message }).eq('id', note.id);
    return { status: 'unmatched', reason: payErr.message };
  }
  if (!receiptNo) return { status: 'duplicate' };
  const { data: payment } = await admin.from('payments').select('id').eq('invoice_id', m.invoice.id)
    .order('created_at', { ascending: false }).limit(1).single();
  await admin.from('payment_notifications').update({ status: 'matched', payment_id: payment?.id }).eq('id', note.id);
  if (payment) { try { await emailReceipt(admin, settings, payment.id); } catch (e) { console.error('receipt email', e); } }
  return { status: 'matched', invoice: m.invoice.number, receipt: receiptNo };
}

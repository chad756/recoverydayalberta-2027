// Invoice / receipt PDFs and the emails that carry them.
import * as PDFLib from 'npm:pdf-lib@1.17.1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { buildPdf, documentData } from './pdf.js';
import { fileSafe, invoiceState, longDate, money } from './rules.js';
import { HttpError, loadInvoiceBundle, loadLogo, siteUrl } from './supabase.ts';
import { button, esc, layout, sendEmail } from './email.ts';

// deno-lint-ignore no-explicit-any
type Settings = Record<string, any>;

export async function invoicePdf(admin: SupabaseClient, settings: Settings, invoiceId: string) {
  const b = await loadInvoiceBundle(admin, invoiceId);
  const bytes = await buildPdf(PDFLib, documentData({ ...b, settings }), await loadLogo(siteUrl(settings)));
  return { bytes, filename: `${b.invoice.number}-${fileSafe(b.invoice.bill_name)}.pdf`, bundle: b };
}

export async function receiptPdf(admin: SupabaseClient, settings: Settings, paymentId: string) {
  const { data: payment } = await admin.from('payments').select('*').eq('id', paymentId).single();
  if (!payment) throw new HttpError(404, 'Payment not found.');
  const { data: receipt } = await admin.from('receipts').select('*').eq('payment_id', paymentId).single();
  if (!receipt) throw new HttpError(404, 'Receipt not found.');
  const b = await loadInvoiceBundle(admin, payment.invoice_id);
  // amounts "to date" = payments up to and including this one
  const upTo = b.payments.filter((p: { paid_at: string; created_at: string }) =>
    p.paid_at < payment.paid_at || (p.paid_at === payment.paid_at && p.created_at <= payment.created_at));
  const bytes = await buildPdf(PDFLib, documentData({ ...b, payments: upTo, settings, payment, receipt }), await loadLogo(siteUrl(settings)));
  return { bytes, filename: `${receipt.number}-${fileSafe(b.invoice.bill_name)}.pdf`, bundle: b, receipt, payment };
}

function from(settings: Settings) {
  return { from: settings.emails?.from ?? 'Recovery Day Alberta <noreply@recoverydayalberta.com>', replyTo: settings.emails?.reply_to };
}

export async function emailInvoice(admin: SupabaseClient, settings: Settings, invoiceId: string, resend = false) {
  const { bytes, filename, bundle } = await invoicePdf(admin, settings, invoiceId);
  const inv = bundle.invoice;
  const st = invoiceState(inv, bundle.payments, bundle.refunds);
  const portal = `${siteUrl(settings)}portal/#/invoices`;
  const dueLine = inv.deposit_cents > 0 && inv.deposit_cents < inv.total_cents
    ? `<p>Your deposit of <strong>${esc(money(st.deposit_owing_cents))}</strong> is due now to hold your space. The balance is due by <strong>${esc(longDate(inv.balance_due))}</strong>.</p>`
    : `<p>The full amount of <strong>${esc(money(st.owing_cents))}</strong> is due by <strong>${esc(longDate(inv.balance_due))}</strong>.</p>`;
  const html = layout(resend ? `Invoice #${inv.number} (copy)` : `You're accepted – invoice #${inv.number}`,
    `<p>Hello ${esc(inv.bill_contact || inv.bill_name)},</p>
     ${resend ? '' : '<p>Thank you for applying. Your application for Recovery Day Alberta has been <strong>accepted</strong>. Your invoice is attached.</p>'}
     <p>Invoice total: <strong>${esc(money(inv.total_cents))}</strong> (no GST).</p>${dueLine}
     ${button(portal, 'View and pay in your portal')}
     <p style="font-size:14px">Pay by credit card through the Last Door payment portal (the Pay Now button in your portal fills in the form for you), or by cheque payable to Last Door Recovery Society. ${esc(String(settings.pay_link?.help ?? '').replace('{invoice}', inv.number))}</p>`,
    settings.emails?.signature);
  await sendEmail({ ...from(settings), to: inv.bill_email, subject: `Recovery Day Alberta – Invoice #${inv.number}`, html,
    attachments: [{ filename, content: bytes }] });
}

export async function emailReceipt(admin: SupabaseClient, settings: Settings, paymentId: string) {
  const { bytes, filename, bundle, receipt, payment } = await receiptPdf(admin, settings, paymentId);
  const inv = bundle.invoice;
  const st = invoiceState(inv, bundle.payments, bundle.refunds);
  const html = layout(`Payment received – receipt ${receipt.number}`,
    `<p>Hello ${esc(inv.bill_contact || inv.bill_name)},</p>
     <p>Thank you. We received <strong>${esc(money(payment.amount_cents))}</strong> on ${esc(longDate(payment.paid_at))} for invoice #${esc(inv.number)}. Your receipt is attached.</p>
     <p>Balance owing: <strong>${esc(money(st.owing_cents))}</strong>${st.owing_cents > 0 ? ` (due by ${esc(longDate(inv.balance_due))})` : ' – paid in full'}.</p>`,
    settings.emails?.signature);
  await sendEmail({ ...from(settings), to: inv.bill_email, subject: `Recovery Day Alberta – Receipt ${receipt.number}`, html,
    attachments: [{ filename, content: bytes }] });
  await admin.from('receipts').update({ emailed_at: new Date().toISOString() }).eq('id', receipt.id);
}

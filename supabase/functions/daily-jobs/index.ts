// =============================================================================
// daily-jobs — run once a day by the GitHub Action "Daily jobs"
// =============================================================================
// Header: x-cron-secret: <CRON_SECRET>.  Deploy with: --no-verify-jwt
//  1. Invoice reminders: deposit (7 days after sending, if unpaid), balance
//     (7 days and 1 day before the balance due date), overdue (day after).
//     Each reminder is sent once. Releasing a booth is always a manual decision.
//  2. Privacy retention: removes old compliance documents and volunteer records.
//  3. Keeps the free Supabase project awake.
// =============================================================================
import { adminClient, env, json, loadSettings, serve, siteUrl } from '../_shared/supabase.ts';
import { button, esc, layout, sendEmail } from '../_shared/email.ts';
import { addDays, buildPayLink, invoiceState, longDate, money, todayInEdmonton } from '../_shared/rules.js';

serve(async (req) => {
  if (!env('CRON_SECRET') || req.headers.get('x-cron-secret') !== env('CRON_SECRET')) return json(req, { error: 'Forbidden' }, 403);
  const admin = adminClient();
  const settings = await loadSettings(admin);
  const today = todayInEdmonton();
  const r = settings.reminders ?? {};
  const sender = { from: settings.emails?.from, replyTo: settings.emails?.reply_to };
  const report: Record<string, unknown> = { today, reminders: [] as string[] };

  if (r.enabled !== false) {
    const { data: invoices } = await admin.from('invoices').select('*').eq('status', 'sent');
    for (const inv of invoices ?? []) {
      const { data: pays } = await admin.from('payments').select('*').eq('invoice_id', inv.id).eq('voided', false);
      const st = invoiceState(inv, pays ?? [], [], today);
      if (st.owing_cents <= 0) continue;
      const done = new Set(String(inv.last_reminder ?? '').split(',').filter(Boolean));
      let kind: string | null = null;
      if (inv.balance_due && today > addDays(inv.balance_due, (r.overdue_after_days ?? 1) - 1) && !done.has('overdue')) kind = 'overdue';
      else for (const d of (r.balance_before_days ?? [7, 1]) as number[]) {
        if (inv.balance_due && today >= addDays(inv.balance_due, -d) && today <= inv.balance_due && !done.has(`balance_${d}`)) { kind = `balance_${d}`; break; }
      }
      if (!kind && st.deposit_owing_cents > 0 && inv.issue_date && today >= addDays(inv.issue_date, r.deposit_after_days ?? 7) && !done.has('deposit')) kind = 'deposit';
      if (!kind) continue;
      const amount = kind === 'deposit' ? st.deposit_owing_cents : st.owing_cents;
      const link = buildPayLink(settings.pay_link?.template, { invoice: inv.number, amountCents: amount, org: inv.bill_name, name: inv.bill_contact, email: inv.bill_email });
      const title = kind === 'overdue' ? `Invoice #${inv.number} is overdue` : kind === 'deposit' ? `Deposit reminder – invoice #${inv.number}` : `Balance reminder – invoice #${inv.number}`;
      await sendEmail({ ...sender, from: sender.from ?? 'Recovery Day Alberta <noreply@recoverydayalberta.com>', to: inv.bill_email, subject: `Recovery Day Alberta – ${title}`,
        html: layout(title, `<p>Hello ${esc(inv.bill_contact || inv.bill_name)},</p>
          <p>${kind === 'deposit' ? 'This is a friendly reminder that the deposit to hold your space has not been received yet.'
            : kind === 'overdue' ? `The balance on your invoice was due on ${esc(longDate(inv.balance_due))}. Please pay as soon as possible or contact us.`
            : `Your balance is due on ${esc(longDate(inv.balance_due))}.`}</p>
          <p>Amount due: <strong>${esc(money(amount))}</strong></p>${button(link, 'Pay now')}
          ${button(`${siteUrl(settings)}portal/#/invoices`, 'Open your portal')}
          <p style="font-size:14px">Already paid? Thank you – payments can take a day or two to show. You can tell us in your portal ("I've paid, but it's not showing").</p>`,
          settings.emails?.signature) });
      done.add(kind);
      await admin.from('invoices').update({ last_reminder: [...done].join(',') }).eq('id', inv.id);
      (report.reminders as string[]).push(`${inv.number}:${kind}`);
    }
  }

  const { data: ret, error } = await admin.rpc('run_retention');
  if (!error && ret?.document_paths?.length) {
    await admin.storage.from('vendor-docs').remove(ret.document_paths);
  }
  report.retention = error ? error.message : ret;
  return json(req, report);
});

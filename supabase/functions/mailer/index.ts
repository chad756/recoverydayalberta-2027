// =============================================================================
// mailer — every email the website asks for (called with the user's login)
// =============================================================================
// POST { action, ... } with the Authorization header of the signed-in user.
//   application_submitted {application_id}   vendor → confirmation + staff notice
//   cancel_requested      {application_id}   vendor → staff notice
//   decision              {application_id}   admin  → declined / waitlisted / changes requested
//   send_invoice          {invoice_id}       admin/finance → marks SENT, emails PDF + pay link
//   resend_invoice        {invoice_id}
//   send_receipt          {payment_id}       admin/finance
//   refund_confirmation   {refund_id}        admin/finance
//   publish_schedule      {city_id}          admin → publishes drafts, emails each volunteer
// =============================================================================
import { adminClient, getCaller, HttpError, json, loadSettings, requireStaff, serve, siteUrl } from '../_shared/supabase.ts';
import { button, esc, layout, sendEmail } from '../_shared/email.ts';
import { emailInvoice, emailReceipt } from '../_shared/documents.ts';
import { APPLICATION_STATUS_LABELS, clock, longDate, money, shortDate, todayInEdmonton } from '../_shared/rules.js';

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const body = await req.json().catch(() => ({}));
  const admin = adminClient();
  const settings = await loadSettings(admin);
  const sender = { from: settings.emails?.from ?? 'Recovery Day Alberta <noreply@recoverydayalberta.com>', replyTo: settings.emails?.reply_to };
  const staffInbox = settings.emails?.staff_inbox ?? 'community@lastdoor.org';
  const sig = settings.emails?.signature ?? '';
  const site = siteUrl(settings);

  async function loadApp(id: string) {
    const { data: app } = await admin.from('applications').select('*').eq('id', id).single();
    if (!app) throw new HttpError(404, 'Application not found.');
    const { data: org } = await admin.from('organizations').select('*').eq('id', app.organization_id).single();
    const { data: items } = await admin.from('application_items').select('*').eq('application_id', id);
    const { data: cities } = await admin.from('cities').select('id, name');
    const { data: products } = await admin.from('products').select('code, name');
    const cityName = (c: string) => cities?.find((x) => x.id === c)?.name ?? c;
    const prodName = (c: string) => products?.find((x) => x.code === c)?.name ?? c;
    const summary = (items ?? []).map((i) => `<li>${esc(prodName(i.product_code))}${i.sub_type ? ` (${esc(i.sub_type)})` : ''} – Recovery Day ${esc(cityName(i.city_id))}</li>`).join('');
    return { app, org, items: items ?? [], summary };
  }

  switch (body.action) {
    case 'application_submitted':
    case 'cancel_requested': {
      const caller = await getCaller(req);
      const { app, org, summary } = await loadApp(body.application_id);
      if (app.organization_id !== caller.orgId && !['admin', 'super_admin'].includes(caller.role)) throw new HttpError(403, 'Not your application.');
      if (body.action === 'application_submitted') {
        await sendEmail({ ...sender, to: org.contact_email, subject: 'We received your Recovery Day Alberta application',
          html: layout('Application received', `<p>Hello ${esc(org.contact_name || org.legal_name)},</p>
            <p>Thank you for applying to Recovery Day Alberta. We received your application for:</p><ul>${summary}</ul>
            <p>Our team will review it and email you. If it's accepted, you'll receive your invoice by email and in your portal.</p>
            ${button(`${site}portal/`, 'Open your portal')}`, sig) });
      }
      await sendEmail({ ...sender, to: staffInbox,
        subject: body.action === 'application_submitted' ? `New application: ${org.legal_name}` : `Cancellation requested: ${org.legal_name}`,
        html: layout(body.action === 'application_submitted' ? 'New vendor / sponsor application' : 'Cancellation requested',
          `<p><strong>${esc(org.legal_name)}</strong></p><ul>${summary}</ul>
           ${app.cancel_reason ? `<p>Reason: ${esc(app.cancel_reason)}</p>` : ''}
           ${button(`${site}admin/#/applications/${app.id}`, 'Open in admin')}`, '') });
      return json(req, { ok: true });
    }

    case 'decision': {
      await requireStaff(req, ['admin', 'super_admin']);
      const { app, org, summary } = await loadApp(body.application_id);
      const label = APPLICATION_STATUS_LABELS[app.status as keyof typeof APPLICATION_STATUS_LABELS] ?? app.status;
      const messages: Record<string, string> = {
        declined: 'Thank you for your interest in Recovery Day Alberta. Unfortunately we are not able to accept your application this year.',
        waitlisted: 'Thank you for applying. Your application is on our waitlist. We will email you as soon as a space opens up.',
        changes_requested: 'Thank you for applying. We need a few changes before we can review your application. Please open your portal, update it and submit it again.',
        under_review: 'Your application is now under review.',
        cancelled: 'Your application has been cancelled.',
      };
      if (!messages[app.status]) throw new HttpError(400, 'Accepted applications are emailed with their invoice (Approve & Send).');
      await sendEmail({ ...sender, to: org.contact_email, subject: `Recovery Day Alberta application: ${label}`,
        html: layout(`Application ${label.toLowerCase()}`, `<p>Hello ${esc(org.contact_name || org.legal_name)},</p><p>${esc(messages[app.status])}</p>
          <ul>${summary}</ul>${app.decision_reason ? `<p><strong>Note from our team:</strong> ${esc(app.decision_reason)}</p>` : ''}
          ${button(`${site}portal/`, 'Open your portal')}`, sig) });
      return json(req, { ok: true });
    }

    case 'send_invoice':
    case 'resend_invoice': {
      await requireStaff(req, ['admin', 'finance', 'super_admin']);
      const { data: inv } = await admin.from('invoices').select('*').eq('id', body.invoice_id).single();
      if (!inv) throw new HttpError(404, 'Invoice not found.');
      if (inv.status === 'draft') {
        if (!inv.bill_email) throw new HttpError(400, 'This invoice has no email address.');
        if (inv.total_cents <= 0) throw new HttpError(400, 'This invoice total is $0.00.');
        await admin.from('invoices').update({ status: 'sent', issue_date: todayInEdmonton(), sent_at: new Date().toISOString() }).eq('id', inv.id);
      } else if (inv.status !== 'sent') throw new HttpError(400, `This invoice is ${inv.status}.`);
      await emailInvoice(admin, settings, inv.id, body.action === 'resend_invoice' || inv.status === 'sent');
      return json(req, { ok: true });
    }

    case 'send_receipt': {
      await requireStaff(req, ['admin', 'finance', 'super_admin']);
      await emailReceipt(admin, settings, body.payment_id);
      return json(req, { ok: true });
    }

    case 'refund_confirmation': {
      await requireStaff(req, ['admin', 'finance', 'super_admin']);
      const { data: ref } = await admin.from('refunds').select('*').eq('id', body.refund_id).single();
      if (!ref) throw new HttpError(404, 'Refund not found.');
      const { data: inv } = await admin.from('invoices').select('*').eq('id', ref.invoice_id).single();
      await sendEmail({ ...sender, to: inv.bill_email, subject: `Recovery Day Alberta – cancellation and refund for #${inv.number}`,
        html: layout('Cancellation confirmed', `<p>Hello ${esc(inv.bill_contact || inv.bill_name)},</p>
          <p>Your booking on invoice #${esc(inv.number)} has been cancelled.</p>
          <p>Refund: <strong>${esc(money(ref.amount_cents))}</strong>. ${ref.amount_cents > 0 ? 'Last Door finance will send it to you using your original payment method.' : 'Under our cancellation policy, no refund is due.'}</p>`, sig) });
      return json(req, { ok: true });
    }

    case 'publish_schedule': {
      await requireStaff(req, ['admin', 'super_admin']);
      const { data: city } = await admin.from('cities').select('*').eq('id', body.city_id).single();
      if (!city) throw new HttpError(404, 'City not found.');
      const { data: shifts } = await admin.from('shifts').select('*').eq('city_id', city.id);
      const shiftIds = (shifts ?? []).map((s) => s.id);
      const { data: asg } = await admin.from('assignments').select('*').in('shift_id', shiftIds).in('status', ['draft', 'published']);
      const now = new Date().toISOString();
      await admin.from('assignments').update({ status: 'published' }).in('shift_id', shiftIds).eq('status', 'draft');
      const byVol = new Map<string, typeof asg>();
      for (const a of asg ?? []) { if (!a.notified_at || a.status === 'draft') { byVol.set(a.volunteer_id, [...(byVol.get(a.volunteer_id) ?? []), a]); } }
      let sent = 0;
      for (const [volId, list] of byVol) {
        const { data: v } = await admin.from('volunteers').select('name, email, access_token').eq('id', volId).single();
        if (!v) continue;
        const rows = (list ?? []).map((a) => shifts!.find((s) => s.id === a.shift_id)!).sort((a, b) => (a.start_min ?? 0) - (b.start_min ?? 0))
          .map((s) => `<li><strong>${esc(s.zone)}</strong>: ${esc(s.duties || s.label)} – ${esc(clock(s.start_min))} to ${esc(clock(s.end_min))}</li>`).join('');
        const link = `${site}volunteer/shifts/?t=${v.access_token}`;
        await sendEmail({ ...sender, to: v.email, subject: `Your Recovery Day ${city.name} volunteer shift`,
          html: layout(`Your volunteer shift – Recovery Day ${city.name}`, `<p>Hi ${esc(v.name)},</p>
            <p>Thank you for volunteering on <strong>${esc(city.event_date ? longDate(city.event_date) : shortDate(null))}</strong>. Here is your schedule:</p><ul>${rows}</ul>
            <p>Check in at: <strong>${esc(city.checkin_location || 'the Information Table')}</strong>, 15 minutes before your shift.</p>
            ${button(link, 'Confirm or tell us you can\'t make it')}
            <p style="font-size:14px">This link is private to you. Please don't forward it.</p>`, sig) });
        await admin.from('assignments').update({ notified_at: now }).in('id', (list ?? []).map((a) => a.id));
        sent++;
      }
      return json(req, { ok: true, emailed: sent });
    }
  }
  throw new HttpError(400, 'Unknown action.');
});

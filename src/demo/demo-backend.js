// =============================================================================
// DEMO BACKEND (preview only) — an in-memory copy of the database
// =============================================================================
// Used only when the site is built with VITE_DEMO=true. It copies the real
// rules (Row Level Security, the database functions, invoice and refund maths)
// so the preview behaves like the live site. Every page starts fresh with the
// sample data below. Nothing is saved and no emails are sent.
// All people and organizations below are fictional.
// =============================================================================
import seed from './seed.json';
import siteMapUrl from './site-map.svg?url';
import * as R from '../../supabase/functions/_shared/rules.js';
import { documentData, buildPdf } from '../../supabase/functions/_shared/pdf.js';

export const isConfigured = true;

const uid = () => (globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(16).slice(2)}-${Date.now()}`);
const now = () => new Date().toISOString();
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const today = R.todayInEdmonton();

// ---- Who is "logged in" (decided by the page you open) ----------------------
const path = location.pathname;
const pageRole = /\/admin\//.test(path) ? 'super_admin' : /\/portal\//.test(path) ? 'vendor' : null;
const IDS = { vendorUser: 'u-vendor', adminUser: 'u-admin', org1: 'o-prairie' };

// ---- Sample data ------------------------------------------------------------
const db = {
  settings: clone(seed.settings),
  cities: clone(seed.cities).map((c) => ({ ...c, event_date: { edmonton: '2027-09-11', calgary: '2027-09-18', 'red-deer': '2027-09-25' }[c.id] ?? c.event_date })),
  products: clone(seed.products),
  shifts: clone(seed.shifts).map((s) => ({ ...s, id: uid() })),
  counters: [],
  organizations: [], profiles: [], applications: [], application_items: [], documents: [],
  invoices: [], invoice_lines: [], payments: [], payment_notifications: [], payment_reports: [],
  refunds: [], receipts: [], site_maps: [], booths: [], announcements: [], volunteers: [],
  assignments: [], declines: [], audit_log: [],
};
const files = new Map(); // storage path → Blob / URL
const outbox = [];       // emails the real site would send
export const demoOutbox = outbox;

function setting(key) { return db.settings.find((s) => s.key === key)?.value ?? {}; }
function S() { return R.settingsMap(db.settings); }
function counter(name) {
  let c = db.counters.find((x) => x.name === name);
  if (!c) db.counters.push((c = { name, value: 0 }));
  return ++c.value;
}
function audit(action, table, row_id, before, after) {
  db.audit_log.unshift({ id: db.audit_log.length + 1, at: now(), actor: me()?.id, actor_email: me()?.email, action, table_name: table, row_id, before: clone(before), after: clone(after) });
}

function addOrg(o) { const org = { id: uid(), created_at: now(), updated_at: now(), directory_opt_in: false, file_number: null, ...o }; db.organizations.push(org); return org; }
function addApp(org, status, items, extra = {}) {
  const app = {
    id: uid(), organization_id: org.id, event_year: 2027, status, payment_method: 'card',
    terms_accepted_at: now(), policy_accepted_at: now(), comms_consent_at: now(), media_consent_at: now(), marketing_opt_in_at: null,
    submitted_at: status === 'draft' ? null : now(), created_at: now(), updated_at: now(), notes_to_organizers: '', ...extra,
  };
  db.applications.push(app);
  for (const it of items) db.application_items.push({ id: uid(), application_id: app.id, tents: 0, tables: 0, chair_pairs: 0, power_needed: false, personal_services: false, sheet_extra: {}, created_at: now(), ...it });
  return app;
}
function invoiceFor(app, status, payments = []) {
  const org = db.organizations.find((o) => o.id === app.organization_id);
  if (!org.file_number) org.file_number = counter('file_number:2027');
  const items = db.application_items.filter((i) => i.application_id === app.id);
  const d = R.buildInvoiceDraft({ items, products: db.products, cities: db.cities, settings: S(), issueDate: today });
  const id = rpcImpl.create_invoice({ p_invoice: { organization_id: org.id, application_id: app.id, total_cents: d.total_cents, deposit_cents: d.deposit_cents, balance_due: d.balance_due }, p_lines: d.lines }, true);
  const inv = db.invoices.find((i) => i.id === id);
  if (status === 'sent') Object.assign(inv, { status: 'sent', issue_date: R.addDays(today, -12), sent_at: now() });
  for (const p of payments) rpcImpl.record_payment({ p: { invoice_id: id, ...p } }, true);
  return inv;
}

// ---- Row Level Security (same rules as 002_security.sql) --------------------
let currentUserId = pageRole === 'vendor' ? IDS.vendorUser : pageRole ? IDS.adminUser : null;
function me() { return db.profiles.find((p) => p.id === currentUserId) || null; }
const isStaff = () => ['admin', 'finance', 'super_admin'].includes(me()?.role);

function visible(table, rows) {
  const p = me();
  if (isStaff()) {
    return rows; // staff see everything (audit log included)
  }
  const org = p?.organization_id;
  const myApps = new Set(db.applications.filter((a) => a.organization_id === org).map((a) => a.id));
  const myInv = new Set(db.invoices.filter((i) => i.organization_id === org && i.status !== 'draft').map((i) => i.id));
  const myItems = new Set(db.application_items.filter((i) => myApps.has(i.application_id)).map((i) => i.id));
  const acceptedCities = new Set(db.application_items.filter((i) => myApps.has(i.application_id) && db.applications.find((a) => a.id === i.application_id)?.status === 'accepted').map((i) => i.city_id));
  switch (table) {
    case 'settings': return rows.filter((r) => r.is_public);
    case 'cities': case 'products': case 'announcements': return rows;
    case 'profiles': return rows.filter((r) => r.id === p?.id);
    case 'organizations': return rows.filter((r) => r.id === org);
    case 'applications': return rows.filter((r) => r.organization_id === org);
    case 'application_items': return rows.filter((r) => myApps.has(r.application_id)).map((r) => ({ ...r, sheet_extra: {} }));
    case 'documents': case 'payment_reports': return rows.filter((r) => r.organization_id === org);
    case 'invoices': return rows.filter((r) => myInv.has(r.id)).map((r) => ({ ...r, sheet_extra: {}, notes: null }));
    case 'invoice_lines': case 'payments': case 'refunds': case 'receipts': return rows.filter((r) => myInv.has(r.invoice_id));
    case 'booths': return rows.filter((r) => r.application_item_id && myItems.has(r.application_item_id));
    case 'site_maps': return rows.filter((r) => acceptedCities.has(r.city_id));
    default: return [];
  }
}
function canWrite(table, row) {
  const p = me();
  if (!p) return false;
  if (isStaff()) {
    if (table === 'settings') return p.role === 'super_admin';
    if (['payments', 'receipts', 'refunds'].includes(table)) return false; // only through functions
    return true;
  }
  const org = p.organization_id;
  if (table === 'applications') return row.organization_id === org && ['draft', 'changes_requested'].includes(row.status ?? 'draft');
  if (table === 'application_items') {
    const a = db.applications.find((x) => x.id === row.application_id);
    return a?.organization_id === org && ['draft', 'changes_requested'].includes(a.status);
  }
  if (table === 'documents') return row.organization_id === org;
  if (table === 'payment_reports') return row.organization_id === org;
  return false;
}

function filterRows(rows, q = {}) {
  let out = rows;
  for (const [k, v] of Object.entries(q.eq || {})) out = out.filter((r) => (v === null ? r[k] == null : r[k] === v));
  for (const [k, v] of Object.entries(q.neq || {})) out = out.filter((r) => r[k] !== v);
  for (const [k, v] of Object.entries(q.in || {})) out = out.filter((r) => v.includes(r[k]));
  if (q.order) {
    const k = q.order; const dir = q.asc === false ? -1 : 1;
    out = [...out].sort((a, b) => (a[k] ?? '') > (b[k] ?? '') ? dir : (a[k] ?? '') < (b[k] ?? '') ? -dir : 0);
  }
  return out.slice(0, q.limit || 5000);
}
const tick = () => new Promise((r) => setTimeout(r, 60));
function fail(msg) { throw new Error(msg); }

// ---- Database functions (mirror 003_functions.sql) ---------------------------
const finOk = () => ['admin', 'finance', 'super_admin'].includes(me()?.role);
const adminOk = () => ['admin', 'super_admin'].includes(me()?.role);
const superOk = () => me()?.role === 'super_admin';

const rpcImpl = {
  create_my_organization({ p }) {
    const prof = me(); if (!prof) fail('Please log in first.');
    let org = db.organizations.find((o) => o.id === prof.organization_id);
    if (!org) { org = addOrg({ legal_name: p.legal_name || 'New organization', created_by: prof.id }); prof.organization_id = org.id; }
    for (const k of ['legal_name', 'display_name', 'org_type', 'gst_number', 'website', 'socials', 'description', 'contact_name', 'contact_email', 'contact_phone', 'billing_name', 'billing_email', 'street', 'city', 'province', 'postal_code']) {
      if (k === 'legal_name') { if ((p.legal_name || '').trim()) org.legal_name = p.legal_name.trim(); } else org[k] = p[k] ?? null;
    }
    org.directory_opt_in = !!p.directory_opt_in; org.updated_at = now();
    return org.id;
  },
  submit_application({ p_app }) {
    const a = db.applications.find((x) => x.id === p_app);
    if (!a || a.organization_id !== me()?.organization_id) fail('Application not found.');
    if (!['draft', 'changes_requested'].includes(a.status)) fail('This application was already submitted.');
    const o = db.organizations.find((x) => x.id === a.organization_id);
    if (!o.legal_name || !o.contact_email || !o.street || !o.postal_code) fail('Please complete your organization, contact and mailing address first.');
    if (!db.application_items.some((i) => i.application_id === a.id)) fail('Please choose at least one city and product.');
    if (!a.terms_accepted_at || !a.policy_accepted_at || !a.comms_consent_at) fail('Please accept the vendor terms, the cancellation policy and event communications.');
    a.status = 'submitted'; a.submitted_at = now();
  },
  request_cancellation({ p_app, p_reason }) {
    const a = db.applications.find((x) => x.id === p_app);
    if (!a || (a.organization_id !== me()?.organization_id && !adminOk())) fail('Application not found.');
    if (['cancelled', 'declined'].includes(a.status)) fail('This application is already closed.');
    a.status = a.status === 'draft' ? 'cancelled' : 'cancel_requested'; a.cancel_reason = (p_reason || '').slice(0, 2000);
  },
  decide_application({ p_app, p_status, p_reason }) {
    if (!adminOk()) fail('Admins only (with two-factor sign-in).');
    const a = db.applications.find((x) => x.id === p_app); if (!a) fail('Application not found.');
    let file = null;
    if (p_status === 'accepted') {
      const o = db.organizations.find((x) => x.id === a.organization_id);
      if (!o.file_number) o.file_number = counter('file_number:2027');
      file = o.file_number;
    }
    const before = clone(a);
    Object.assign(a, { status: p_status, decision_reason: p_reason ?? null, decided_at: now(), decided_by: me().id });
    audit('update', 'applications', a.id, before, a);
    return file;
  },
  create_invoice({ p_invoice, p_lines }, seeding = false) {
    if (!seeding && !finOk()) fail('Admin or Finance only (with two-factor sign-in).');
    const o = db.organizations.find((x) => x.id === p_invoice.organization_id); if (!o) fail('Organization not found.');
    if (p_invoice.application_id && db.invoices.some((i) => i.application_id === p_invoice.application_id && ['draft', 'sent'].includes(i.status))) fail('This application already has an open invoice.');
    const s = setting('invoice');
    const num = `${s.prefix}${String(counter(`invoice:${s.prefix}`) + (s.start_number ?? 1) - 1).padStart(s.digits ?? 3, '0')}`;
    const inv = { id: uid(), number: num, organization_id: o.id, application_id: p_invoice.application_id || null, event_year: 2027, status: 'draft', issue_date: null,
      bill_name: o.legal_name, bill_contact: o.billing_name || o.contact_name, bill_email: o.billing_email || o.contact_email,
      bill_address: [o.street, [o.city, o.province].filter(Boolean).join(', '), o.postal_code].filter(Boolean).join('\n'),
      total_cents: p_invoice.total_cents || 0, deposit_cents: p_invoice.deposit_cents || 0, balance_due: p_invoice.balance_due || null, notes: p_invoice.notes || null,
      sheet_extra: {}, created_at: now(), updated_at: now(), last_reminder: null };
    db.invoices.push(inv);
    (p_lines || []).forEach((l, i) => db.invoice_lines.push({ id: uid(), invoice_id: inv.id, sort: l.sort ?? i, line_type: l.line_type, product_code: l.product_code ?? null, city_id: l.city_id || null, description: l.description, detail: l.detail ?? null, quantity: l.quantity ?? 1, amount_cents: Number(l.amount_cents) }));
    if (!seeding) audit('insert', 'invoices', inv.id, null, inv);
    return inv.id;
  },
  save_draft_invoice({ p_id, p_invoice, p_lines }) {
    if (!finOk()) fail('Admin or Finance only.');
    const inv = db.invoices.find((i) => i.id === p_id); if (inv?.status !== 'draft') fail('Only drafts can be edited.');
    const before = clone(inv);
    db.invoice_lines = db.invoice_lines.filter((l) => l.invoice_id !== p_id);
    (p_lines || []).forEach((l, i) => db.invoice_lines.push({ id: uid(), invoice_id: p_id, sort: l.sort ?? i, line_type: l.line_type, product_code: l.product_code ?? null, city_id: l.city_id || null, description: l.description, detail: l.detail ?? null, quantity: l.quantity ?? 1, amount_cents: Number(l.amount_cents) }));
    inv.total_cents = db.invoice_lines.filter((l) => l.invoice_id === p_id).reduce((s, l) => s + l.amount_cents, 0);
    for (const k of ['deposit_cents', 'balance_due', 'notes', 'bill_name', 'bill_contact', 'bill_email', 'bill_address']) if (p_invoice?.[k] != null && p_invoice[k] !== '') inv[k] = p_invoice[k];
    audit('update', 'invoices', inv.id, before, inv);
  },
  record_payment({ p }, seeding = false) {
    if (!seeding && !finOk()) fail('Finance or Admin only.');
    const i = db.invoices.find((x) => x.id === p.invoice_id); if (!i) fail('Invoice not found.');
    if (!seeding && i.status !== 'sent') fail(`Invoice ${i.number} is ${i.status}; payments can only be recorded on sent invoices.`);
    if (p.external_id && db.payments.some((x) => x.external_id === p.external_id)) return null;
    const paid = db.payments.filter((x) => x.invoice_id === i.id && !x.voided).reduce((s, x) => s + x.amount_cents, 0);
    if (Number(p.amount_cents) > i.total_cents - paid) fail(`Amount is more than the balance owing on ${i.number}.`);
    if (!(Number(p.amount_cents) > 0)) fail('Amount must be more than $0.');
    const pay = { id: uid(), invoice_id: i.id, amount_cents: Number(p.amount_cents), method: p.method || 'other', received_label: p.received_label || 'Paid', paid_at: p.paid_at || today,
      reference: p.reference ?? null, source: p.source || 'manual', external_id: p.external_id ?? null, payer_name: p.payer_name ?? null, payer_email: p.payer_email ?? null,
      needs_review: !!p.needs_review, voided: false, recorded_by: me()?.id, created_at: now() };
    db.payments.push(pay);
    const num = `R-2027-${String(counter('receipt:2027')).padStart(4, '0')}`;
    db.receipts.push({ id: uid(), number: num, payment_id: pay.id, invoice_id: i.id, issued_at: now(), emailed_at: null });
    if (!seeding) audit('insert', 'payments', pay.id, null, pay);
    return num;
  },
  void_payment({ p_payment, p_reason }) {
    if (!finOk()) fail('Finance or Admin only.');
    if (!(p_reason || '').trim()) fail('A reason is required.');
    const p = db.payments.find((x) => x.id === p_payment); const before = clone(p);
    Object.assign(p, { voided: true, void_reason: p_reason }); audit('update', 'payments', p.id, before, p);
  },
  record_refund({ p }) {
    if (!finOk()) fail('Finance or Admin only.');
    const i = db.invoices.find((x) => x.id === p.invoice_id); if (!i) fail('Invoice not found.');
    const paid = db.payments.filter((x) => x.invoice_id === i.id && !x.voided).reduce((s, x) => s + x.amount_cents, 0);
    if (p.amount_cents > paid) fail('Refund is more than what was paid.');
    if (p.amount_cents !== p.calculated_cents && !(p.override_note || '').trim()) fail('Please add a note explaining why the refund differs from the calculated amount.');
    const r = { id: uid(), invoice_id: i.id, amount_cents: p.amount_cents, calculated_cents: p.calculated_cents, override_note: p.override_note || null, reason: p.reason || null, cancel_date: p.cancel_date || today, refunded_at: p.refunded_at || null, recorded_by: me().id, created_at: now() };
    db.refunds.push(r); i.status = 'cancelled';
    if (i.application_id) {
      const a = db.applications.find((x) => x.id === i.application_id); if (a) a.status = 'cancelled';
      const items = new Set(db.application_items.filter((x) => x.application_id === i.application_id).map((x) => x.id));
      db.booths.forEach((b) => { if (items.has(b.application_item_id)) b.application_item_id = null; });
    }
    audit('insert', 'refunds', r.id, null, r);
    return r.id;
  },
  volunteer_signup({ p }) {
    if (!p.comms_consent) fail('Please agree to be contacted about your volunteer shifts.');
    if (!p.is_adult && !p.age_14_plus) fail("Volunteers under 14 can't sign up on their own. Please have a parent or guardian contact community@lastdoor.org.");
    if (!p.is_adult && !(p.guardian_name && p.guardian_contact && p.guardian_consent)) fail('Volunteers under 18 need a parent or guardian name, contact and consent.');
    if (!(p.cities || []).length) fail('Please choose at least one city.');
    let n = 0;
    for (const c of p.cities) {
      db.volunteers = db.volunteers.filter((v) => !(v.email === p.email.toLowerCase() && v.city_id === c && !db.assignments.some((a) => a.volunteer_id === v.id)));
      db.volunteers.push({ id: uid(), city_id: c, event_year: 2027, name: p.name.trim(), email: p.email.trim().toLowerCase(), phone: p.phone, is_adult: !!p.is_adult, age_14_plus: !!(p.is_adult || p.age_14_plus),
        guardian_name: p.guardian_name || null, guardian_contact: p.guardian_contact || null, guardian_consent_at: p.guardian_consent ? now() : null,
        preferences: p.preferences || [], availability: p.availability || 'all_day', experience: p.experience || null, returning_volunteer: !!p.returning, other_festivals: !!p.other_festivals,
        group_name: p.group_name || null, group_size: p.group_size ? Number(p.group_size) : null, tshirt_size: p.tshirt_size || null, emergency_name: p.emergency_name || null, emergency_phone: p.emergency_phone || null,
        accessibility: p.accessibility || null, comms_consent_at: now(), media_consent_at: p.media_consent ? now() : null, marketing_opt_in_at: p.marketing_opt_in ? now() : null, status: 'active', access_token: uid(), created_at: now() });
      n++;
    }
    return n;
  },
  volunteer_portal({ p_token }) {
    const v = db.volunteers.find((x) => x.access_token === p_token && x.status === 'active'); if (!v) return null;
    const c = db.cities.find((x) => x.id === v.city_id);
    const shifts = db.assignments.filter((a) => a.volunteer_id === v.id && ['published', 'confirmed'].includes(a.status))
      .map((a) => { const s = db.shifts.find((x) => x.id === a.shift_id); return { id: a.id, zone: s.zone, label: s.label, duties: s.duties, start_min: s.start_min, end_min: s.end_min, status: a.status }; })
      .sort((a, b) => (a.start_min ?? 0) - (b.start_min ?? 0));
    return { name: v.name, city: c.name, event_date: c.event_date, checkin_location: c.checkin_location, shifts };
  },
  volunteer_respond({ p_token, p_assignment, p_answer }) {
    const v = db.volunteers.find((x) => x.access_token === p_token && x.status === 'active');
    const a = db.assignments.find((x) => x.id === p_assignment && x.volunteer_id === v?.id);
    if (!v || !a) fail('Shift not found.');
    if (p_answer === 'confirm') a.status = 'confirmed';
    else if (p_answer === 'decline') { db.declines.push({ shift_id: a.shift_id, volunteer_id: v.id, created_at: now() }); db.assignments = db.assignments.filter((x) => x.id !== a.id); }
    else fail('Unknown answer.');
  },
  save_schedule({ p_city, p_assignments }) {
    if (!adminOk()) fail('Admins only.');
    const cityShifts = new Set(db.shifts.filter((s) => s.city_id === p_city).map((s) => s.id));
    db.assignments = db.assignments.filter((a) => !(cityShifts.has(a.shift_id) && !a.locked && a.status === 'draft'));
    let n = 0;
    for (const x of p_assignments) {
      if (db.assignments.some((a) => a.shift_id === x.shift_id)) continue;
      db.assignments.push({ id: uid(), shift_id: x.shift_id, volunteer_id: x.volunteer_id, status: 'draft', locked: false, updated_at: now() }); n++;
    }
    return n;
  },
  export_my_data() {
    const org = me()?.organization_id;
    const apps = db.applications.filter((a) => a.organization_id === org);
    const invs = db.invoices.filter((i) => i.organization_id === org && i.status !== 'draft');
    return {
      profile: me(), organization: db.organizations.find((o) => o.id === org),
      applications: apps.map((a) => ({ ...a, items: db.application_items.filter((i) => i.application_id === a.id).map(({ sheet_extra, ...i }) => i) })),
      invoices: invs.map(({ sheet_extra, ...i }) => i),
      payments: db.payments.filter((p) => invs.some((i) => i.id === p.invoice_id)).map(({ recorded_by, ...p }) => p),
      documents: db.documents.filter((d) => d.organization_id === org).map((d) => ({ type: d.doc_type, file: d.file_name, status: d.status, uploaded_at: d.uploaded_at })),
    };
  },
  delete_volunteer_data({ p_email }) {
    if (!superOk()) fail('Super Admin only.');
    const ids = new Set(db.volunteers.filter((v) => v.email.toLowerCase() === p_email.trim().toLowerCase()).map((v) => v.id));
    db.volunteers = db.volunteers.filter((v) => !ids.has(v.id));
    db.assignments = db.assignments.filter((a) => !ids.has(a.volunteer_id));
    return ids.size;
  },
  start_new_year({ p_year }) {
    if (!superOk()) fail('Super Admin only.');
    setting('event').year = p_year;
    Object.assign(setting('invoice'), { prefix: `${p_year}CD`, start_number: 1 });
    db.cities.forEach((c) => { c.event_date = null; });
  },
};

// ---- Edge Functions (emails are only recorded in the demo outbox) -----------
function mail(to, subject) { outbox.push({ to, subject, at: now() }); return { ok: true, demo: true, note: `Demo: an email "${subject}" would be sent to ${to}.` }; }

async function processIncomingDemo(p) {
  if (p.external_id && db.payment_notifications.some((n) => n.external_id === p.external_id)) return { status: 'duplicate' };
  const sent = db.invoices.filter((i) => i.status === 'sent');
  const states = Object.fromEntries(sent.map((i) => [i.id, R.invoiceState(i, db.payments.filter((x) => x.invoice_id === i.id), [])]));
  const s = setting('invoice');
  const m = R.matchPayment({ reference: p.reference, amountCents: p.amount_cents, email: p.payer_email }, sent, states, s.prefix, s.digits);
  const note = { id: uid(), source: p.source, external_id: p.external_id, reference: p.reference, amount_cents: p.amount_cents, payer_name: p.payer_name, payer_email: p.payer_email, organization: p.organization, paid_at: now(), raw: {}, status: 'unmatched', reason: m.reason ?? null, invoice_id: m.invoice?.id ?? null, received_at: now() };
  db.payment_notifications.unshift(note);
  if (m.status !== 'matched') return { status: 'unmatched', reason: m.reason };
  const receipt = rpcImpl.record_payment({ p: { invoice_id: m.invoice.id, amount_cents: p.amount_cents, method: 'card', received_label: 'Paid Visa LD', paid_at: today, reference: p.external_id, source: p.source, external_id: p.external_id, payer_name: p.payer_name, payer_email: p.payer_email, needs_review: true } }, true);
  note.status = 'matched'; note.payment_id = db.payments.at(-1).id;
  mail(m.invoice.bill_email, `Receipt ${receipt}`);
  return { status: 'matched', invoice: m.invoice.number, receipt };
}

const fnImpl = {
  async mailer(body) {
    switch (body.action) {
      case 'application_submitted': case 'cancel_requested': return mail(setting('emails').staff_inbox || 'community@lastdoor.org', body.action === 'application_submitted' ? 'New application' : 'Cancellation requested');
      case 'decision': { const a = db.applications.find((x) => x.id === body.application_id); const o = db.organizations.find((x) => x.id === a.organization_id); return mail(o.contact_email, `Application ${R.APPLICATION_STATUS_LABELS[a.status]}`); }
      case 'send_invoice': case 'resend_invoice': {
        if (!finOk()) fail('Staff only.');
        const inv = db.invoices.find((x) => x.id === body.invoice_id);
        if (inv.status === 'draft') { if (inv.total_cents <= 0) fail('This invoice total is $0.00.'); const b = clone(inv); Object.assign(inv, { status: 'sent', issue_date: today, sent_at: now() }); audit('update', 'invoices', inv.id, b, inv); }
        return mail(inv.bill_email, `Invoice #${inv.number} (PDF attached)`);
      }
      case 'send_receipt': { const p = db.payments.find((x) => x.id === body.payment_id); const i = db.invoices.find((x) => x.id === p.invoice_id); return mail(i.bill_email, 'Receipt (PDF attached)'); }
      case 'refund_confirmation': { const r = db.refunds.find((x) => x.id === body.refund_id); const i = db.invoices.find((x) => x.id === r.invoice_id); return mail(i.bill_email, 'Cancellation and refund confirmation'); }
      case 'publish_schedule': {
        const ids = new Set(db.shifts.filter((s) => s.city_id === body.city_id).map((s) => s.id));
        const vols = new Set();
        db.assignments.forEach((a) => { if (ids.has(a.shift_id) && (a.status === 'draft' || !a.notified_at)) { a.status = a.status === 'draft' ? 'published' : a.status; a.notified_at = now(); vols.add(a.volunteer_id); } });
        vols.forEach((v) => mail(db.volunteers.find((x) => x.id === v)?.email, 'Your volunteer shift'));
        return { ok: true, emailed: vols.size, demo: true };
      }
    }
    fail('Unknown action.');
  },
  async 'demo-payment'(body) { return processIncomingDemo({ source: 'webhook', ...body }); },
};

let logoBytes = null;
async function logo() {
  if (logoBytes) return logoBytes;
  const base = document.querySelector('meta[name="rda-base"]')?.content || '/';
  const res = await fetch(new URL(`${base}images/lastdoor-logo.jpg`, location.href));
  logoBytes = new Uint8Array(await res.arrayBuffer());
  return logoBytes;
}

// ---- Public interface (same as backend-supabase.js) --------------------------
export const api = {
  demo: true,
  async list(table, q = {}) { await tick(); return clone(filterRows(visible(table, db[table] || []), q)); },
  async get(table, id, key = 'id') { await tick(); return clone(visible(table, db[table] || []).find((r) => r[key] === id) ?? null); },
  async insert(table, row) {
    await tick();
    const rows = (Array.isArray(row) ? row : [row]).map((r) => ({ id: uid(), created_at: now(), ...r }));
    for (const r of rows) {
      if (table === 'applications') Object.assign(r, { status: r.status || 'draft', event_year: 2027, updated_at: now() });
      if (table === 'documents') Object.assign(r, { status: 'pending', uploaded_at: now() });
      if (table === 'payment_reports') Object.assign(r, { status: 'open', created_by: me()?.id });
      if (!canWrite(table, r)) fail('You don’t have permission to do that.');
      if (table === 'application_items' && db.application_items.some((x) => x.application_id === r.application_id && x.city_id === r.city_id && x.product_code === r.product_code)) fail('That already exists.');
      if (table === 'booths' && db.booths.some((x) => x.city_id === r.city_id && x.label === r.label)) fail('That booth number is already on this map.');
      db[table].push(r); if (isStaff()) audit('insert', table, r.id, null, r);
    }
    return clone(rows);
  },
  async update(table, match, patch) {
    await tick();
    const rows = filterRows(db[table], { eq: match });
    for (const r of rows) {
      const reviewOnly = table === 'payments' && finOk() && Object.keys(patch).every((k) => k === 'needs_review');
      if (!reviewOnly && !canWrite(table, r)) fail('You don’t have permission to do that.');
      if (!isStaff() && table === 'applications' && patch.status) fail('You don’t have permission to do that.');
      if (table === 'booths' && patch.application_item_id && db.booths.some((b) => b.id !== r.id && b.application_item_id === patch.application_item_id)) fail('That vendor already has a booth on this map.');
      const before = clone(r); Object.assign(r, patch, r.updated_at ? { updated_at: now() } : {});
      if (isStaff()) audit('update', table, r.id ?? r.key, before, r);
    }
    return clone(rows);
  },
  async upsert(table, rows, onConflict = 'id') {
    const out = [];
    for (const row of Array.isArray(rows) ? rows : [rows]) {
      const ex = db[table].find((r) => r[onConflict] === row[onConflict]);
      out.push(...(ex ? await api.update(table, { [onConflict]: row[onConflict] }, row) : await api.insert(table, row)));
    }
    return out;
  },
  async remove(table, match) {
    await tick();
    if (['invoices', 'payments', 'receipts', 'refunds', 'audit_log'].includes(table)) fail('Financial records can’t be deleted. Cancel or void them instead.');
    const rows = filterRows(db[table], { eq: match });
    for (const r of rows) if (!canWrite(table, r)) fail('You don’t have permission to do that.');
    db[table] = db[table].filter((r) => !rows.includes(r));
    if (table === 'applications') db.application_items = db.application_items.filter((i) => !rows.some((a) => a.id === i.application_id));
    rows.forEach((r) => isStaff() && audit('delete', table, r.id, r, null));
  },
  async rpc(name, args = {}) {
    await tick();
    const f = rpcImpl[name]; if (!f) fail(`Unknown function ${name}`);
    return clone(f(clone(args)));
  },
  async fn(name, body = {}) { await tick(); const f = fnImpl[name]; if (!f) fail(`Unknown function ${name}`); return f(clone(body)); },
  async pdf(kind, id) {
    const PDFLib = await import('pdf-lib');
    const settings = S();
    let bundle; let filename;
    if (kind === 'invoice') {
      const invoice = visible('invoices', db.invoices).find((i) => i.id === id) || (isStaff() && db.invoices.find((i) => i.id === id));
      if (!invoice) fail('Invoice not found.');
      bundle = { invoice, lines: db.invoice_lines.filter((l) => l.invoice_id === id).sort((a, b) => a.sort - b.sort), payments: db.payments.filter((p) => p.invoice_id === id && !p.voided), refunds: db.refunds.filter((r) => r.invoice_id === id), settings };
      filename = `${invoice.number}-${R.fileSafe(invoice.bill_name)}.pdf`;
    } else {
      const payment = db.payments.find((p) => p.id === id); const receipt = db.receipts.find((r) => r.payment_id === id);
      const invoice = db.invoices.find((i) => i.id === payment?.invoice_id);
      if (!payment || !visible('payments', [payment]).length) fail('Receipt not found.');
      const upTo = db.payments.filter((p) => p.invoice_id === invoice.id && !p.voided && (p.paid_at < payment.paid_at || (p.paid_at === payment.paid_at && p.created_at <= payment.created_at)));
      bundle = { invoice, lines: db.invoice_lines.filter((l) => l.invoice_id === invoice.id), payments: upTo, refunds: [], settings, payment, receipt };
      filename = `${receipt.number}-${R.fileSafe(invoice.bill_name)}.pdf`;
    }
    const bytes = await buildPdf(PDFLib, documentData(bundle), await logo());
    return { blob: new Blob([bytes], { type: 'application/pdf' }), filename };
  },
  async upload(bucket, p, file) {
    await tick();
    if (file.size > 10 * 1024 * 1024) fail('Files must be 10 MB or smaller.');
    files.set(`${bucket}/${p}`, file); return { path: p };
  },
  async removeFile(bucket, p) { files.delete(`${bucket}/${p}`); },
  async signedUrl(bucket, p) {
    const f = files.get(`${bucket}/${p}`);
    if (!f) fail('This is sample data – there is no real file to open in the demo.');
    return typeof f === 'string' ? f : URL.createObjectURL(f);
  },
  async health() { return { ok: true, message: 'Demo mode – using built-in sample data (no Supabase connection).' }; },
  auth: {
    async session() { return currentUserId ? { user: { id: currentUserId, email: me().email } } : null; },
    async user() { return currentUserId ? { id: currentUserId, email: me().email, email_confirmed_at: now() } : null; },
    async signIn() { return {}; },
    async signUp() { return { user: { id: 'new' } }; },
    async signOut() { currentUserId = null; },
    async sendReset() {},
    async updatePassword() {},
    onChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    async aal() { return { currentLevel: 'aal2', nextLevel: 'aal2' }; },
    async factors() { return [{ id: 'demo-factor', status: 'verified', friendly_name: 'Demo authenticator' }]; },
    async enroll() { return { id: 'demo', qr: '', secret: 'DEMO' }; },
    async verify() {},
    async unenroll() {},
    /** Demo only: switch between the sample admin and finance accounts. */
    useRole(role) { const p = db.profiles.find((x) => x.role === role); if (p) currentUserId = p.id; },
  },
};

// ---- Sample data (runs last, once everything above is defined) -----------
(function seedSample() {
  const prairie = addOrg({ id: IDS.org1, legal_name: 'Prairie Roots Wellness', display_name: 'Prairie Roots Wellness', org_type: 'health_service', contact_name: 'Jordan Demo', contact_email: 'jordan@example.com', contact_phone: '403-555-0101', street: '100 Example Ave SW', city: 'Calgary', province: 'AB', postal_code: 'T2P 0A1', website: 'https://example.com', description: 'Counselling and wellness services (sample organization).', directory_opt_in: true });
  const northern = addOrg({ legal_name: 'Northern Lights Recovery Collective', org_type: 'non_profit', contact_name: 'Sam Example', contact_email: 'sam@example.org', contact_phone: '780-555-0144', street: '20 Sample St', city: 'Edmonton', province: 'AB', postal_code: 'T5J 0A1' });
  const bakehouse = addOrg({ legal_name: 'Bow River Bakehouse', org_type: 'food_truck', contact_name: 'Alex Sample', contact_email: 'alex@example.net', contact_phone: '403-555-0177', street: '5 Demo Rd', city: 'Calgary', province: 'AB', postal_code: 'T2E 0A1' });
  const summit = addOrg({ legal_name: 'Summit Health Partners', org_type: 'business', contact_name: 'Riley Placeholder', contact_email: 'riley@example.com', contact_phone: '587-555-0190', street: '900 Fictional Blvd', city: 'Edmonton', province: 'AB', postal_code: 'T5K 0A1' });
  const makers = addOrg({ legal_name: 'Red Deer Makers Guild', org_type: 'artisan', contact_name: 'Casey Test', contact_email: 'casey@example.ca', contact_phone: '403-555-0122', street: '3 Example Cres', city: 'Red Deer', province: 'AB', postal_code: 'T4N 0A1' });
  const coffee = addOrg({ legal_name: 'Hope Street Coffee', org_type: 'food_truck', contact_name: 'Morgan Sample', contact_email: 'morgan@example.com', contact_phone: '403-555-0133', street: '77 Demo Way', city: 'Calgary', province: 'AB', postal_code: 'T2R 0A1' });
  const chinook = addOrg({ legal_name: 'Chinook Family Services', org_type: 'mutual_support', contact_name: 'Taylor Example', contact_email: 'taylor@example.org', contact_phone: '403-555-0155', street: '12 Placeholder Ave', city: 'Red Deer', province: 'AB', postal_code: 'T4P 0A1' });

  db.profiles.push(
    { id: IDS.vendorUser, email: 'jordan@example.com', full_name: 'Jordan Demo', role: 'vendor', organization_id: prairie.id, disabled: false, created_at: now() },
    { id: IDS.adminUser, email: 'admin@example.com', full_name: 'Demo Admin', role: 'super_admin', organization_id: null, disabled: false, created_at: now() },
    { id: 'u-fin', email: 'finance@example.com', full_name: 'Demo Finance', role: 'finance', organization_id: null, disabled: false, created_at: now() },
  );

  const a1 = addApp(prairie, 'accepted', [{ city_id: 'calgary', product_code: 'vendor_booth', sub_type: 'Healthcare Provider', tents: 1, tables: 1, chair_pairs: 1 }]);
  addApp(northern, 'submitted', [{ city_id: 'edmonton', product_code: 'vendor_booth', sub_type: 'Non-profit', tables: 1, chair_pairs: 1 }], { notes_to_organizers: 'We would love a spot near the Information Table.' });
  const a3 = addApp(bakehouse, 'under_review', [{ city_id: 'calgary', product_code: 'food_truck', truck_length_ft: 22, truck_width_ft: 8, power_needed: true, power_amps: 30, ahs_decal_number: 'AHS-DEMO-1', fire_decal_number: 'FD-DEMO-1' }]);
  const a4 = addApp(summit, 'accepted', [{ city_id: 'edmonton', product_code: 'stage_sponsor' }, { city_id: 'calgary', product_code: 'stage_sponsor' }]);
  addApp(makers, 'waitlisted', [{ city_id: 'red-deer', product_code: 'artisan', tables: 1 }]);
  const a6 = addApp(coffee, 'accepted', [{ city_id: 'calgary', product_code: 'food_truck', truck_length_ft: 18, truck_width_ft: 8 }]);
  addApp(chinook, 'submitted', [{ city_id: 'red-deer', product_code: 'mutual_support', tables: 1, chair_pairs: 1 }]);

  invoiceFor(a1, 'sent', [{ amount_cents: 10000, method: 'card', received_label: 'Deposit paid', paid_at: R.addDays(today, -10), reference: 'pi_demo_001', source: 'webhook', needs_review: true }]);
  invoiceFor(a4, 'draft');
  invoiceFor(a6, 'sent', [{ amount_cents: 40000, method: 'cheque', received_label: 'Paid Chq LD', paid_at: R.addDays(today, -5), reference: 'Cheque 1042', source: 'manual' }]);

  const doc = (org, app, type, name, status = 'pending', city = 'calgary') => db.documents.push({ id: uid(), organization_id: org.id, application_id: app.id, city_id: city, doc_type: type, storage_path: `${org.id}/${type}-${name}`, file_name: name, mime_type: 'application/pdf', size_bytes: 120000, status, uploaded_at: now() });
  doc(prairie, a1, 'logo', 'prairie-roots-logo.png', 'approved');
  doc(bakehouse, a3, 'food_vendor_notification', 'ahs-notification.pdf');
  doc(bakehouse, a3, 'fire_decal', 'fire-decal.jpg');

  db.payment_notifications.push({ id: uid(), source: 'webhook', external_id: 'pi_demo_unmatched', reference: 'Recovery day booth', amount_cents: 60000, payer_name: 'N. Lights', payer_email: 'sam@example.org', organization: 'Northern Lights', paid_at: now(), raw: {}, status: 'unmatched', reason: 'No invoice number in the payment.', received_at: now() });
  const inv1 = db.invoices.find((i) => i.application_id === a1.id);
  db.payment_reports.push({ id: uid(), invoice_id: inv1.id, organization_id: prairie.id, paid_on: R.addDays(today, -1), amount_cents: 20000, payer_email: 'jordan@example.com', note: 'Paid part of the balance by credit card yesterday.', status: 'open', created_by: IDS.vendorUser, created_at: now() });

  db.site_maps.push({ city_id: 'calgary', storage_path: 'calgary/demo-map.svg', mime_type: 'image/svg+xml', updated_at: now() });
  files.set('site-maps/calgary/demo-map.svg', siteMapUrl);
  const item1 = db.application_items.find((i) => i.application_id === a1.id);
  const item6 = db.application_items.find((i) => i.application_id === a6.id);
  [['C-10', 30, 20], ['C-11', 38, 20], ['C-12', 46, 20, item1.id], ['C-13', 54, 20], ['C-14', 62, 20], ['C-20', 30, 72], ['C-21', 38, 72], ['FT-1', 12, 64, item6.id], ['FT-2', 12, 80]]
    .forEach(([label, x, y, item]) => db.booths.push({ id: uid(), city_id: 'calgary', label, x_pct: x, y_pct: y, size: label.startsWith('FT') ? '30x10' : '10x10', booth_type: label.startsWith('FT') ? 'food_truck' : 'health_retail', zone: label.startsWith('FT') ? 'Food trucks' : 'Block A', application_item_id: item ?? null, created_at: now() }));

  db.announcements.push({ id: uid(), title: 'Welcome to the 2027 vendor portal', body: 'Applications are open for Edmonton, Calgary and Red Deer. Load-in details will be posted here in August.', city_id: null, published_at: now() });

  // Fictional volunteers so the scheduler has something to work with
  const first = ['Avery', 'Blake', 'Cameron', 'Dakota', 'Emerson', 'Finley', 'Harper', 'Jesse', 'Kendall', 'Logan', 'Marley', 'Noel', 'Oakley', 'Parker', 'Quinn', 'Reese', 'Sawyer', 'Tatum', 'Wren', 'Rowan'];
  const last = ['Sample', 'Example', 'Demo', 'Test', 'Placeholder'];
  const prefSets = [['early_setup', 'morning_setup'], ['parking'], ['kids_zone'], ['info_table'], ['waste', 'teardown'], ['anything'], ['road_greeter'], ['backstage'], ['dolly', 'teardown'], ['kids_zone', 'info_table']];
  const avail = ['all_day', 'morning', 'afternoon', 'all_day'];
  let n = 0;
  for (const city of ['calgary', 'edmonton', 'red-deer']) {
    const count = city === 'calgary' ? 34 : 18;
    for (let i = 0; i < count; i++, n++) {
      const name = `${first[n % first.length]} ${last[(n * 7) % last.length]}`;
      db.volunteers.push({ id: uid(), city_id: city, event_year: 2027, name, email: `${name.toLowerCase().replace(' ', '.')}${n}@example.com`, phone: `403-555-${String(1000 + n).slice(-4)}`,
        is_adult: n % 11 !== 0, age_14_plus: true, guardian_name: n % 11 === 0 ? 'Parent Example' : null, guardian_contact: n % 11 === 0 ? 'parent@example.com' : null,
        preferences: prefSets[n % prefSets.length], availability: avail[n % avail.length], experience: n % 3 ? 'yes' : 'no', returning_volunteer: n % 4 === 0,
        other_festivals: false, group_name: city === 'calgary' && i < 3 ? 'Demo Church Group' : null, group_size: null, tshirt_size: ['S', 'M', 'L', 'XL'][n % 4],
        emergency_name: 'Emergency Contact', emergency_phone: '403-555-0000', accessibility: null, comms_consent_at: now(), media_consent_at: n % 2 ? now() : null,
        marketing_opt_in_at: null, status: 'active', access_token: uid(), created_at: now() });
    }
  }
  // A sample published schedule for Red Deer so the volunteer shift page can be tried
  const rd = db.shifts.filter((s) => s.city_id === 'red-deer');
  const res = R.autoSchedule(rd, db.volunteers.filter((v) => v.city_id === 'red-deer'), []);
  for (const a of res.assignments) db.assignments.push({ id: uid(), ...a, status: 'published', locked: false, notified_at: now(), updated_at: now() });
  db.audit_log.length = 0;
})();

export const demoVolunteerToken = (() => {
  const a = db.assignments[0];
  return a ? db.volunteers.find((v) => v.id === a.volunteer_id)?.access_token : null;
})();

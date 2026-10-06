// Admin → Announcements · Settings & users (Super Admin) · Audit log
import { api, isDemo } from '../lib/api.js';
import { $, html, raw, toast, showError, busy, formDialog, confirmDialog, table, field, badge } from '../lib/ui.js';
import { reference, R } from '../lib/data.js';
import { ROLE_LABELS } from '../lib/session.js';
import { ctx } from './context.js';

// ---- Announcements ----------------------------------------------------------
export async function announcements() {
  const { ref } = ctx;
  const list = await api.list('announcements', { order: 'published_at', asc: false });
  ctx.show(html`<h1 class="h2">Announcements</h1>
    <p>Shown in every vendor’s portal (or only to vendors in one city).</p>
    <form id="ann" class="stack narrow" novalidate>
      ${field({ label: 'Title', name: 'title', required: true, attrs: 'maxlength="200"' })}
      ${field({ label: 'Message', name: 'body', type: 'textarea', rows: 5, required: true, attrs: 'maxlength="4000"' })}
      ${field({ label: 'Who sees it', name: 'city', type: 'select', options: [['', 'Everyone'], ...ref.cities.map((c) => [c.id, `${c.name} vendors only`])] })}
      <button class="button button--primary" type="submit">Post announcement</button></form>
    ${table(list, [
      { label: 'Title', cell: (a) => a.title },
      { label: 'For', cell: (a) => (a.city_id ? ref.city(a.city_id)?.name : 'Everyone') },
      { label: 'Posted', cell: (a) => R.dateTime(a.published_at) },
      { label: 'Delete', cell: (a) => html`<button class="button button--text" data-del="${a.id}">Delete<span class="sr-only"> ${a.title}</span></button>` },
    ], { caption: 'Announcements', empty: 'No announcements yet.' })}`, 'Announcements');
  $('#ann').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (!f.checkValidity()) return showError(new Error('Please add a title and message.'));
    await busy(e.submitter, async () => { await api.insert('announcements', { title: f.title.value, body: f.body.value, city_id: f.city.value || null, created_by: ctx.me.user.id }); toast('Posted.'); announcements(); });
  });
  ctx.view.onclick = async (e) => {
    const b = e.target.closest('[data-del]');
    if (!b || !(await confirmDialog('Delete announcement', 'Delete this announcement?', { submit: 'Delete', danger: true }))) return;
    try { await api.remove('announcements', { id: b.dataset.del }); announcements(); } catch (ex) { showError(ex); }
  };
}

// ---- Settings (Super Admin) -------------------------------------------------
const SPEC_DEFAULT = /SPEC DEFAULT/;
export async function settings() {
  const ref = await reference(true);
  ctx.ref = ref;
  const profiles = await api.list('profiles', { order: 'email' });
  const staff = profiles.filter((p) => p.role !== 'vendor');
  ctx.show(html`<h1 class="h2">Settings &amp; users</h1>
    <p class="notice">Changes here affect new invoices, emails and the public site straight away. Every change is written to the audit log.</p>
    <h2 class="h3">Festival dates and places</h2>
    ${table(ref.cities, [
      { label: 'City', cell: (c) => c.name },
      { label: 'Date', cell: (c) => (c.event_date ? R.longDate(c.event_date) : badge('pending', 'Not set')) },
      { label: 'Venue', cell: (c) => c.venue || '—' },
      { label: 'Edit', cell: (c) => html`<button class="button button--text" data-city="${c.id}">Edit<span class="sr-only"> ${c.name}</span></button>` },
    ], { caption: 'Cities' })}
    <h2 class="h3">Products and prices</h2>
    ${table(ref.products, [
      { label: 'Product', cell: (p) => p.name },
      { label: 'Type', cell: (p) => p.kind },
      { label: 'Price', cell: (p) => R.money(p.price_cents), cls: 'num' },
      { label: 'Edit', cell: (p) => html`<button class="button button--text" data-product="${p.code}">Edit<span class="sr-only"> ${p.name}</span></button>` },
    ], { caption: 'Products' })}
    <h2 class="h3">Rules and text</h2>
    <p class="hint">Advanced: each setting is stored as JSON. Items marked “SPEC DEFAULT – CONFIRM” are waiting for a decision.</p>
    ${table(ref.settingsRows, [
      { label: 'Setting', cell: (s) => html`<code>${s.key}</code>${SPEC_DEFAULT.test(s.description || '') ? html` ${badge('pending', 'Confirm')}` : ''}` },
      { label: 'What it does', cell: (s) => s.description || '' },
      { label: 'Edit', cell: (s) => html`<button class="button button--text" data-setting="${s.key}">Edit<span class="sr-only"> ${s.key}</span></button>` },
    ], { caption: 'Settings' })}
    <h2 class="h3">Staff accounts</h2>
    <p>To add staff: invite them in Supabase (Authentication → Users → Invite), then set their role here. They must set up two-factor sign-in the first time they log in.</p>
    ${table(staff, [
      { label: 'Email', cell: (p) => p.email },
      { label: 'Name', cell: (p) => p.full_name || '' },
      { label: 'Role', cell: (p) => ROLE_LABELS[p.role] },
      { label: 'Status', cell: (p) => (p.disabled ? badge('bad', 'Disabled') : badge('ok', 'Active')) },
      { label: 'Edit', cell: (p) => html`<button class="button button--text" data-user="${p.id}">Change<span class="sr-only"> ${p.email}</span></button>` },
    ], { caption: 'Staff' })}
    <form id="promote" class="filters" novalidate>${field({ label: 'Give an existing account a staff role (email)', name: 'email', type: 'email' })}<button class="button button--outline" type="submit">Find account</button></form>
    <h2 class="h3">Privacy tools</h2>
    <form id="del-vol" class="filters" novalidate>${field({ label: 'Delete all data for a volunteer (email)', name: 'email', type: 'email', required: true })}<button class="button button--danger" type="submit">Delete volunteer data</button></form>
    <p class="hint">Vendor data: financial records must be kept for 7 years. To remove a vendor’s other data, email the privacy officer.</p>
    <h2 class="h3">New festival year</h2>
    <p>Starts the next year: keeps prices, products and shift templates, sets the invoice prefix (e.g. 2028CD) back to 001 and clears the dates. Do this after the year’s books are closed.</p>
    <button class="button button--outline" id="new-year">Start ${Number(ref.settings.event?.year) + 1}</button>`, 'Settings');

  ctx.view.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    try {
      if (b.dataset.city) {
        const c = ref.city(b.dataset.city);
        const v = await formDialog({ title: `Recovery Day ${c.name}`, submit: 'Save', wide: true, body: html`<div class="field-grid">
          ${field({ label: 'Event date', name: 'event_date', type: 'date', value: c.event_date })}
          ${field({ label: 'Start time', name: 'start_time', value: c.start_time })}${field({ label: 'End time', name: 'end_time', value: c.end_time })}
          ${field({ label: 'Venue', name: 'venue', value: c.venue })}${field({ label: 'Address', name: 'address', value: c.address })}
          ${field({ label: 'Load-in', name: 'load_in', value: c.load_in })}${field({ label: 'Entry street', name: 'entry_street', value: c.entry_street })}
          ${field({ label: 'Parking', name: 'parking', value: c.parking })}${field({ label: 'Volunteer check-in spot', name: 'checkin_location', value: c.checkin_location })}</div>` });
        if (!v) return;
        await api.update('cities', { id: c.id }, { ...v, event_date: v.event_date || null });
        toast('Saved. The portals use it now. The public pages update overnight (or run the “Deploy site” Action on GitHub to update them now).');
        return settings();
      }
      if (b.dataset.product) {
        const p = ref.product(b.dataset.product);
        const v = await formDialog({ title: p.name, submit: 'Save', body: html`
          ${field({ label: 'Name', name: 'name', value: p.name, required: true })}
          ${field({ label: 'Price ($, no GST)', name: 'price', value: R.plainAmount(p.price_cents), required: true })}
          ${field({ label: 'Invoice label ({sub} = booth type)', name: 'invoice_label', value: p.invoice_label })}
          ${field({ label: 'Description', name: 'description', type: 'textarea', value: p.description })}
          ${field({ label: 'Available', name: 'active', type: 'select', value: String(p.active !== false), options: [['true', 'Yes'], ['false', 'No (hidden from the application)']] })}` });
        if (!v) return;
        const cents = R.parseMoney(v.price);
        if (Number.isNaN(cents)) throw new Error('Please enter a price like 600.00');
        await api.update('products', { code: p.code }, { name: v.name, price_cents: cents, invoice_label: v.invoice_label, description: v.description, active: v.active === 'true' });
        toast('Saved. New invoices use the new price; sent invoices don’t change.');
        return settings();
      }
      if (b.dataset.setting) {
        const s = ref.settingsRows.find((x) => x.key === b.dataset.setting);
        const v = await formDialog({ title: `Setting: ${s.key}`, submit: 'Save', wide: true, body: html`<p class="hint">${s.description}</p>
          ${field({ label: 'Value (JSON)', name: 'value', type: 'textarea', rows: 14, value: JSON.stringify(s.value, null, 2), attrs: 'spellcheck="false" class="code"' })}` });
        if (!v) return;
        let value;
        try { value = JSON.parse(v.value); } catch { throw new Error('That isn’t valid JSON. Check for missing commas or quotes.'); }
        await api.update('settings', { key: s.key }, { value, updated_by: ctx.me.user.id, updated_at: new Date().toISOString() });
        toast('Setting saved.');
        return settings();
      }
      if (b.dataset.user) return editUser(profiles.find((p) => p.id === b.dataset.user));
      if (b.id === 'new-year') {
        const next = Number(ref.settings.event?.year) + 1;
        if (!(await confirmDialog(`Start ${next}`, `Switch the site to ${next}? Invoice numbers restart at ${next}CD001 and all festival dates are cleared.`, { submit: `Start ${next}`, danger: true }))) return;
        await api.rpc('start_new_year', { p_year: next });
        toast(`Now set up for ${next}. Enter the new dates above.`);
        return settings();
      }
    } catch (ex) { showError(ex); }
  };
  $('#promote').addEventListener('submit', async (e) => {
    e.preventDefault();
    const p = profiles.find((x) => (x.email || '').toLowerCase() === e.target.email.value.trim().toLowerCase());
    if (!p) return showError(new Error('No account with that email. Invite them in Supabase first.'));
    editUser(p);
  });
  $('#del-vol').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = e.target.email.value.trim();
    if (!email) return;
    if (!(await confirmDialog('Delete volunteer data', `Permanently delete every sign-up and shift for ${email}? This can’t be undone.`, { submit: 'Delete', danger: true }))) return;
    try { const n = await api.rpc('delete_volunteer_data', { p_email: email }); toast(`${n} record${n === 1 ? '' : 's'} deleted.`); e.target.reset(); } catch (ex) { showError(ex); }
  });
}

async function editUser(p) {
  const v = await formDialog({ title: p.email, submit: 'Save', body: html`
    ${field({ label: 'Role', name: 'role', type: 'select', value: p.role, options: Object.entries(ROLE_LABELS) })}
    ${field({ label: 'Account', name: 'disabled', type: 'select', value: String(!!p.disabled), options: [['false', 'Active'], ['true', 'Disabled (can’t log in to the portals)']] })}
    <p class="hint">Finance can see invoices and payments only. Admin can do everything except settings and users. Super Admin can do everything.</p>` });
  if (!v) return;
  if (p.id === ctx.me.user.id && v.role !== 'super_admin') return showError(new Error('You can’t remove your own Super Admin role. Ask another Super Admin.'));
  try { await api.update('profiles', { id: p.id }, { role: v.role, disabled: v.disabled === 'true' }); toast('Saved.'); settings(); } catch (e) { showError(e); }
}

// ---- Audit log --------------------------------------------------------------
export async function audit() {
  const list = await api.list('audit_log', { order: 'at', asc: false, limit: 300 });
  const diff = (a) => {
    if (!a.before || !a.after) return a.action === 'insert' ? 'Created' : 'Deleted';
    const keys = Object.keys(a.after).filter((k) => !['updated_at'].includes(k) && JSON.stringify(a.before[k]) !== JSON.stringify(a.after[k]));
    return keys.map((k) => `${k}: ${short(a.before[k])} → ${short(a.after[k])}`).join('; ') || 'No visible change';
  };
  ctx.show(html`<h1 class="h2">Audit log</h1><p>The last 300 changes to applications, invoices, payments, receipts, booths, settings and schedules. Entries can’t be edited or deleted.</p>
    ${table(list, [
      { label: 'When', cell: (a) => R.dateTime(a.at) },
      { label: 'Who', cell: (a) => a.actor_email || 'System' },
      { label: 'What', cell: (a) => `${a.action} ${a.table_name}` },
      { label: 'Change', cell: (a) => html`<small>${diff(a)}</small>` },
    ], { caption: 'Audit log', empty: 'No changes recorded yet.' })}`, 'Audit log');
}
const short = (v) => { const s = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '∅'); return s.length > 60 ? `${s.slice(0, 57)}…` : s; };

// =============================================================================
// VENDOR / SPONSOR PORTAL
// =============================================================================
// Pages (after the # in the address):
//   #/overview  #/apply  #/invoices  #/documents  #/booth  #/announcements  #/profile
// Everything here goes through Row Level Security: a vendor can only ever see
// their own organization's records.
// =============================================================================
import '../main.js';
import '../styles/app.css';
import { api, isDemo } from '../lib/api.js';
import { $, $$, html, raw, setHTML, toast, showError, busy, formDialog, confirmDialog, downloadBlob, downloadJson,
  badge, table, field, check, router, checkFile, link } from '../lib/ui.js';
import { requireLogin, demoBanner } from '../lib/session.js';
import { reference, R, ORG_TYPES, itemLabel, withState, cityDate } from '../lib/data.js';

const view = $('#view');
let me; let ref; let org; let apps = []; let items = [];

// ---- Loading ----------------------------------------------------------------
async function loadAll() {
  const prof = await api.get('profiles', me.user.id);
  me.profile = prof;
  org = prof?.organization_id ? await api.get('organizations', prof.organization_id) : null;
  apps = org ? await api.list('applications', { eq: { organization_id: org.id }, order: 'created_at', asc: false }) : [];
  items = apps.length ? await api.list('application_items', { in: { application_id: apps.map((a) => a.id) } }) : [];
}
const currentApp = () => apps.find((a) => !['cancelled', 'declined'].includes(a.status)) || apps[0] || null;
const appItems = (app) => items.filter((i) => i.application_id === app?.id);

async function loadMoney() {
  if (!org) return { invoices: [], receipts: [], lines: [] };
  const invoices = await api.list('invoices', { eq: { organization_id: org.id }, order: 'created_at' });
  const ids = invoices.map((i) => i.id);
  const [payments, refunds, receipts, lines, reports] = await Promise.all([
    api.list('payments', { in: { invoice_id: ids } }), api.list('refunds', { in: { invoice_id: ids } }),
    api.list('receipts', { in: { invoice_id: ids }, order: 'issued_at' }), api.list('invoice_lines', { in: { invoice_id: ids }, order: 'sort' }),
    api.list('payment_reports', { eq: { organization_id: org.id } }),
  ]);
  return { invoices: withState(invoices, payments.filter((p) => !p.voided), refunds), payments, receipts, lines, reports };
}

function setActive(name) {
  $$('#portal-nav a').forEach((a) => {
    if (a.getAttribute('href') === `#/${name}`) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}
function show(content, heading) {
  setHTML(view, content);
  if (heading) document.title = `${heading} | Recovery Day Alberta portal`;
  view.focus({ preventScroll: true });
}

// ---- Overview ---------------------------------------------------------------
async function overview() {
  const app = currentApp();
  const { invoices } = await loadMoney();
  const open = invoices.filter((i) => i.state.owing_cents > 0);
  const steps = [];
  if (!org) steps.push(html`<li>Start your application. It takes about 10 minutes and you can save and come back.</li>`);
  else if (!app || ['draft', 'changes_requested'].includes(app.status)) steps.push(html`<li>Finish and submit your application.</li>`);
  else if (['submitted', 'under_review'].includes(app.status)) steps.push(html`<li>We’re reviewing your application. We’ll email you with a decision.</li>`);
  if (open.length) steps.push(html`<li>Pay your invoice${open.length > 1 ? 's' : ''}: <a href="#/invoices">${R.money(open.reduce((s, i) => s + i.state.due_now_cents, 0))} due now</a>.</li>`);
  const docsNeeded = app ? appItems(app).flatMap((i) => R.requiredDocuments(i, ref.settings)) : [];
  if (docsNeeded.length) steps.push(html`<li>Upload your <a href="#/documents">required documents</a>.</li>`);
  show(html`
    <h1 class="h2">Welcome${me.profile?.full_name ? `, ${me.profile.full_name.split(' ')[0]}` : ''}</h1>
    ${org ? html`<p class="lead">${org.legal_name}</p>` : ''}
    <div class="card-grid">
      <article class="card">
        <h2 class="h3">Your application</h2>
        ${app ? html`<p>${badge(app.status, R.APPLICATION_STATUS_LABELS[app.status])}</p>
          <ul class="plain-list">${appItems(app).map((i) => html`<li>${itemLabel(i, ref)}</li>`)}</ul>
          ${app.decision_reason && app.status === 'changes_requested' ? html`<p class="notice"><strong>Note from our team:</strong> ${app.decision_reason}</p>` : ''}
          <a class="button button--dark button--small" href="#/apply">${['draft', 'changes_requested'].includes(app.status) ? 'Continue application' : 'View application'}</a>`
        : html`<p>You haven’t applied yet.</p><a class="button button--primary button--small" href="#/apply">Start application</a>`}
      </article>
      <article class="card">
        <h2 class="h3">Invoices</h2>
        ${invoices.length ? html`<ul class="plain-list">${invoices.map((i) => html`<li>#${i.number} ${badge(i.state.code, i.state.label)}<br><span class="muted">Owing ${R.money(i.state.owing_cents)}</span></li>`)}</ul>
          <a class="button button--dark button--small" href="#/invoices">View and pay</a>`
        : html`<p>Your invoice appears here once your application is accepted.</p>`}
      </article>
      <article class="card">
        <h2 class="h3">Next steps</h2>
        ${steps.length ? html`<ol class="steps">${steps}</ol>` : html`<p>You’re all set. See you at the festival.</p>`}
      </article>
    </div>
    <h2 class="h3">Festival dates</h2>
    <ul class="plain-list">${ref.cities.map((c) => html`<li><strong>${c.name}</strong> – ${cityDate(c)}${c.venue ? ` · ${c.venue}` : ''}</li>`)}</ul>`, 'Overview');
}

// ---- Organization form (used by the application and the profile page) ----
function orgFields(o = {}) {
  return html`
    <fieldset><legend>Organization</legend>
      ${field({ label: 'Legal name (shown on your invoice)', name: 'legal_name', value: o.legal_name, required: true, attrs: 'maxlength="200" autocomplete="organization"' })}
      ${field({ label: 'Name to show the public (if different)', name: 'display_name', value: o.display_name, attrs: 'maxlength="200"' })}
      ${field({ label: 'Type of organization', name: 'org_type', type: 'select', value: o.org_type, required: true, options: [['', 'Choose one'], ...ORG_TYPES] })}
      ${field({ label: 'Website', name: 'website', type: 'url', value: o.website, hint: 'Optional. Start with https://', attrs: 'maxlength="300"' })}
      ${field({ label: 'Social media', name: 'socials', value: o.socials, hint: 'Optional, e.g. @yourpage', attrs: 'maxlength="300"' })}
      ${field({ label: 'What will you share or sell at your booth?', name: 'description', type: 'textarea', value: o.description, attrs: 'maxlength="1000"' })}
      ${field({ label: 'GST number', name: 'gst_number', value: o.gst_number, hint: 'Optional. No GST is charged on Recovery Day invoices.', attrs: 'maxlength="40"' })}
    </fieldset>
    <fieldset><legend>Main contact</legend>
      ${field({ label: 'Contact name', name: 'contact_name', value: o.contact_name ?? me.profile?.full_name, required: true, attrs: 'maxlength="120" autocomplete="name"' })}
      ${field({ label: 'Contact email', name: 'contact_email', type: 'email', value: o.contact_email ?? me.user.email, required: true, attrs: 'maxlength="200" autocomplete="email"' })}
      ${field({ label: 'Phone', name: 'contact_phone', type: 'tel', value: o.contact_phone, required: true, attrs: 'maxlength="40" autocomplete="tel"' })}
    </fieldset>
    <fieldset><legend>Mailing address (printed on your invoice)</legend>
      ${field({ label: 'Street address', name: 'street', value: o.street, required: true, attrs: 'maxlength="200" autocomplete="street-address"' })}
      <div class="field-row">
        ${field({ label: 'City / town', name: 'city', value: o.city, required: true, attrs: 'maxlength="100" autocomplete="address-level2"' })}
        ${field({ label: 'Province', name: 'province', type: 'select', value: o.province || 'AB', required: true, options: ['AB', 'BC', 'SK', 'MB', 'ON', 'QC', 'NB', 'NS', 'PE', 'NL', 'YT', 'NT', 'NU'] })}
        ${field({ label: 'Postal code', name: 'postal_code', value: o.postal_code, required: true, attrs: 'maxlength="12" autocomplete="postal-code"' })}
      </div>
    </fieldset>
    <fieldset><legend>Billing (optional)</legend>
      <p class="hint">Only if invoices should go to someone else.</p>
      ${field({ label: 'Billing contact name', name: 'billing_name', value: o.billing_name, attrs: 'maxlength="120"' })}
      ${field({ label: 'Billing email', name: 'billing_email', type: 'email', value: o.billing_email, attrs: 'maxlength="200"' })}
    </fieldset>
    ${check({ label: 'List my organization in the public festival directory (optional)', name: 'directory_opt_in', checked: !!o.directory_opt_in })}`;
}
function orgPayload(v) {
  const keys = ['legal_name', 'display_name', 'org_type', 'gst_number', 'website', 'socials', 'description', 'contact_name', 'contact_email', 'contact_phone', 'billing_name', 'billing_email', 'street', 'city', 'province', 'postal_code'];
  const p = Object.fromEntries(keys.map((k) => [k, (v[k] ?? '').trim() || null]));
  p.postal_code = p.postal_code?.toUpperCase() ?? null;
  p.directory_opt_in = !!v.directory_opt_in;
  return p;
}
async function saveOrg(values) {
  const id = await api.rpc('create_my_organization', { p: orgPayload(values) });
  await loadAll();
  return id;
}

// ---- Application wizard -----------------------------------------------------
const STEPS = ['Organization', 'Cities & options', 'Booth details', 'Documents', 'Agreements', 'Review & submit'];
let wiz = null; // { step, selections: {city: {product_code, sub_type, ...}}, agreements }

function draftSelections(app) {
  const sel = {};
  for (const i of appItems(app)) sel[i.city_id] = { ...i };
  return sel;
}
function selectionItems() {
  return Object.entries(wiz.selections).filter(([, s]) => s?.product_code).map(([city_id, s]) => ({ ...s, city_id }));
}
function estimate() {
  const d = R.buildInvoiceDraft({ items: selectionItems(), products: ref.products, cities: ref.cities, settings: ref.settings });
  return d;
}
function totalBox() {
  const d = estimate();
  return html`<aside class="total-box" aria-label="Estimated total">
    <h2 class="h4">Estimated total</h2>
    ${d.lines.length ? html`<ul class="plain-list">${d.lines.map((l) => html`<li><span>${l.description}</span><span>${R.money(l.amount_cents)}</span></li>`)}</ul>
      <p class="total-box__sum"><span>Total</span><strong>${R.money(d.total_cents)}</strong></p>
      ${d.deposit_cents && d.deposit_cents < d.total_cents ? html`<p class="hint">If accepted: ${R.money(d.deposit_cents)} deposit due when your invoice is sent${d.balance_due ? `, balance by ${R.longDate(d.balance_due)}` : ', balance 14 days before the event'}.</p>` : ''}
      <p class="hint">No GST. You don’t pay anything until your application is accepted.</p>`
    : html`<p class="hint">Choose a city and option to see your total.</p>`}</aside>`;
}

async function apply() {
  const app = currentApp();
  if (app && !['draft', 'changes_requested'].includes(app.status)) return applicationSummary(app);
  if (!wiz || wiz.appId !== (app?.id ?? null)) {
    wiz = { step: org ? 1 : 0, appId: app?.id ?? null, selections: app ? draftSelections(app) : {},
      agreements: app ? { terms: !!app.terms_accepted_at, policy: !!app.policy_accepted_at, comms: !!app.comms_consent_at, media: !!app.media_consent_at, marketing: !!app.marketing_opt_in_at, payment_method: app.payment_method || 'card', notes: app.notes_to_organizers || '' } : { payment_method: 'card' } };
    if (org && !org.street) wiz.step = 0;
  }
  renderStep();
}

function stepper() {
  return html`<ol class="stepper" aria-label="Application steps">${STEPS.map((s, i) => html`<li class="${i === wiz.step ? 'is-current' : i < wiz.step ? 'is-done' : ''}" ${i === wiz.step ? raw('aria-current="step"') : ''}>
    <span class="stepper__n">${i + 1}</span> <span class="stepper__label">${s}</span></li>`)}</ol>`;
}

function renderStep() {
  const s = wiz.step;
  const nav = (next = 'Save and continue') => html`<p class="form-error" role="alert" hidden></p><div class="button-row">
    ${s > 0 ? html`<button class="button button--outline" type="button" data-back>Back</button>` : ''}
    <button class="button button--primary" type="submit">${next}</button>
    ${s > 0 ? html`<button class="button button--text" type="button" data-save>Save draft and finish later</button>` : ''}</div>`;
  const app = currentApp();
  const changes = app?.status === 'changes_requested' && app.decision_reason
    ? html`<p class="notice"><strong>Changes requested:</strong> ${app.decision_reason}</p>` : '';
  let body;
  if (s === 0) body = html`<form id="step" class="stack" novalidate>${orgFields(org || {})}${nav()}</form>`;
  if (s === 1) body = html`<form id="step" class="stack" novalidate>
      <p>Choose what you’d like in each city. You can apply for one, two or all three festivals.</p>
      ${ref.cities.filter((c) => c.active !== false).map((c) => {
        const sel = wiz.selections[c.id] || {};
        const opts = ref.products.filter((p) => p.kind !== 'rental' && p.active !== false);
        return html`<fieldset class="city-pick"><legend>Recovery Day ${c.name} <span class="muted">· ${cityDate(c)}</span></legend>
          ${field({ label: `What would you like in ${c.name}?`, name: `product_${c.id}`, type: 'select', value: sel.product_code || '',
            options: [['', 'Not attending this city'], ...opts.map((p) => [p.code, `${p.name} – ${R.money(p.price_cents)}`])] })}
          <div class="subtype" data-city="${c.id}" ${ref.product(sel.product_code)?.sub_types?.length ? '' : raw('hidden')}>
            ${field({ label: 'Booth type', name: `sub_${c.id}`, type: 'select', value: sel.sub_type || 'Vendor', options: ref.product('vendor_booth')?.sub_types || [] })}
          </div></fieldset>`;
      })}
      <details class="details"><summary>What’s included?</summary>
        <ul>${ref.products.filter((p) => p.kind !== 'rental').map((p) => html`<li><strong>${p.name}</strong> (${R.money(p.price_cents)}): ${p.description}</li>`)}</ul>
        <p>Booth prices are for the space only. Tents, tables and chairs can be rented in the next step.</p></details>
      ${nav()}</form>`;
  if (s === 2) {
    const chosen = selectionItems();
    body = html`<form id="step" class="stack" novalidate>
      ${chosen.length ? '' : html`<p class="notice">Please go back and choose at least one city.</p>`}
      ${chosen.map((it) => {
        const p = ref.product(it.product_code); const c = ref.city(it.city_id); const id = it.city_id;
        if (p.kind === 'sponsorship') return html`<fieldset><legend>${p.name} – ${c.name}</legend><p>Our team will contact you about your sponsorship benefits.</p>
          ${field({ label: 'Anything we should know?', name: `special_${id}`, type: 'textarea', value: it.special_requests, attrs: 'maxlength="1000"' })}</fieldset>`;
        const isTruck = p.code === 'food_truck';
        const tent = ref.product('tent'); const tbl = ref.product('table'); const ch = ref.product('chairs_pair');
        return html`<fieldset><legend>${p.name} – ${c.name}</legend>
          ${isTruck ? html`<div class="field-row">
              ${field({ label: 'Truck length (feet)', name: `len_${id}`, type: 'number', value: it.truck_length_ft, required: true, attrs: 'min="1" max="100" step="0.5"' })}
              ${field({ label: 'Truck width (feet)', name: `wid_${id}`, type: 'number', value: it.truck_width_ft, required: true, attrs: 'min="1" max="30" step="0.5"' })}</div>
            <div class="field-row">
              ${field({ label: 'AHS food handling permit / decal #', name: `ahs_${id}`, value: it.ahs_decal_number, attrs: 'maxlength="40"' })}
              ${field({ label: 'Fire decal #', name: `fire_${id}`, value: it.fire_decal_number, attrs: 'maxlength="40"' })}</div>`
          : html`<p class="hint">Rentals (optional). Booth spaces are 10′ × 10′ and come empty.</p>
            <div class="field-row">
              ${field({ label: `Tents 10′×10′ (${R.money(tent?.price_cents)} each)`, name: `tents_${id}`, type: 'number', value: it.tents ?? 0, attrs: 'min="0" max="20"' })}
              ${field({ label: `Tables (${R.money(tbl?.price_cents)} each)`, name: `tables_${id}`, type: 'number', value: it.tables ?? 0, attrs: 'min="0" max="20"' })}
              ${field({ label: `Pairs of chairs (${R.money(ch?.price_cents)} per pair)`, name: `chairs_${id}`, type: 'number', value: it.chair_pairs ?? 0, attrs: 'min="0" max="20"' })}</div>`}
          ${check({ label: 'I need electrical power', name: `power_${id}`, checked: !!it.power_needed })}
          ${field({ label: 'Power needed (amps), if you know', name: `amps_${id}`, type: 'number', value: it.power_amps, attrs: 'min="0" max="400"' })}
          ${check({ label: 'I will offer personal services (for example massage, tattoo, piercing, face painting)', name: `personal_${id}`, checked: !!it.personal_services, hint: ' Alberta Health Services needs a Temporary Personal Services Notification.' })}
          ${field({ label: 'Special requests', name: `special_${id}`, type: 'textarea', value: it.special_requests, attrs: 'maxlength="1000"' })}
        </fieldset>`;
      })}
      ${nav()}</form>`;
  }
  if (s === 3) {
    const need = [...new Set(selectionItems().flatMap((i) => R.requiredDocuments(i, ref.settings)))];
    body = html`<div class="stack">
      <p>Some booths need documents for Alberta Health Services or the fire department. You can upload them now or later from <a href="#/documents">Documents</a>. Files must be PDF, JPG or PNG, up to 10 MB.</p>
      ${need.length ? html`<h2 class="h4">Required for your application</h2><ul class="plain-list">${need.map((d) => html`<li>${R.DOC_TYPES[d]}</li>`)}</ul>` : html`<p class="notice notice--ok">No required documents for what you chose.</p>`}
      <p>Optional: upload your <strong>logo</strong> (for festival promotion) and a <strong>booth layout</strong>.</p>
      <div id="doc-upload"></div>
      <form id="step" class="stack" novalidate>${nav()}</form></div>`;
  }
  if (s === 4) {
    const a = wiz.agreements; const pol = ref.settings.policy_text || { lines: [] };
    body = html`<form id="step" class="stack" novalidate>
      <section class="policy-box" aria-labelledby="pol-h"><h2 class="h4" id="pol-h">${pol.title}</h2><ul>${pol.lines.map((l) => html`<li>${l}</li>`)}</ul></section>
      <fieldset><legend>Agreements (required)</legend>
        ${check({ label: raw(`I have read and agree to the <a href="${link('vendor-terms/')}" target="_blank" rel="noopener">vendor and sponsor terms</a>.`), name: 'terms', checked: a.terms, required: true })}
        ${check({ label: 'I agree to the cancellation and refund policy above.', name: 'policy', checked: a.policy, required: true })}
        ${check({ label: 'You may email me about my application, invoices, load-in and event updates.', name: 'comms', checked: a.comms, required: true })}
      </fieldset>
      <fieldset><legend>Optional</legend>
        ${check({ label: 'You may use photos or video of my booth and team in festival promotion.', name: 'media', checked: a.media })}
        ${check({ label: 'Send me news about future Recovery Day events. You can unsubscribe any time.', name: 'marketing', checked: a.marketing })}
      </fieldset>
      <fieldset><legend>How will you pay?</legend>
        <div class="radio"><input type="radio" id="pm-card" name="payment_method" value="card" ${a.payment_method !== 'cheque' ? raw('checked') : ''}><label for="pm-card">Credit card (online, through the Last Door payment page)</label></div>
        <div class="radio"><input type="radio" id="pm-chq" name="payment_method" value="cheque" ${a.payment_method === 'cheque' ? raw('checked') : ''}><label for="pm-chq">Cheque to Last Door Recovery Society</label></div>
      </fieldset>
      ${field({ label: 'Notes for the organizers (optional)', name: 'notes', type: 'textarea', value: a.notes, attrs: 'maxlength="2000"' })}
      ${nav()}</form>`;
  }
  if (s === 5) {
    const d = estimate();
    body = html`<form id="step" class="stack" novalidate>
      <h2 class="h4">Please check your application</h2>
      <dl class="summary">
        <dt>Organization</dt><dd>${org?.legal_name}<br>${org?.street}, ${org?.city}, ${org?.province} ${org?.postal_code}</dd>
        <dt>Contact</dt><dd>${org?.contact_name} · ${org?.contact_email} · ${org?.contact_phone}</dd>
        <dt>You’re applying for</dt><dd><ul class="plain-list">${d.lines.map((l) => html`<li>${l.description}: ${R.money(l.amount_cents)}</li>`)}</ul></dd>
        <dt>Estimated total</dt><dd><strong>${R.money(d.total_cents)}</strong> (no GST)</dd>
        <dt>Payment</dt><dd>${wiz.agreements.payment_method === 'cheque' ? 'Cheque' : 'Credit card'}</dd>
      </dl>
      <p>When you submit, we’ll email you a confirmation. Your invoice is sent only if your application is accepted.</p>
      ${nav('Submit application')}</form>`;
  }
  show(html`<h1 class="h2">${app?.status === 'changes_requested' ? 'Update your application' : 'Apply for Recovery Day Alberta'}</h1>${changes}
    ${stepper()}<div class="wizard"><div class="wizard__main"><h2 class="h3">Step ${s + 1}: ${STEPS[s]}</h2>${body}</div>${totalBox()}</div>`, 'Application');

  const form = $('#step');
  if (s === 1 || s === 2) {
    form.addEventListener(s === 1 ? 'change' : 'input', (e) => {
      collect(form);
      if (s === 1) {
        const m = e.target.name?.match(/^product_(.+)$/);
        if (m) form.querySelector(`.subtype[data-city="${m[1]}"]`).hidden = !ref.product(e.target.value)?.sub_types?.length;
      }
      refreshTotal();
    });
  }
  if (s === 3) renderUploads($('#doc-upload'), { compact: true });
  rebind();
}

function refreshTotal() {
  const box = $('.total-box');
  if (!box) return;
  const tmp = document.createElement('div');
  setHTML(tmp, totalBox());
  box.replaceWith(tmp.firstElementChild);
}

function rebind() {
  const form = $('#step');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = '1';
  form.addEventListener('submit', (e) => { e.preventDefault(); next(form, e.submitter); });
  form.querySelector('[data-back]')?.addEventListener('click', () => { collect(form); wiz.step--; renderStep(); });
  form.querySelector('[data-save]')?.addEventListener('click', async (e) => {
    collect(form);
    await busy(e.target, async () => { await saveDraft(); toast('Draft saved. You can come back any time.'); location.hash = '#/overview'; });
  });
}

/** Read the current step's form into `wiz`. */
function collect(form) {
  const s = wiz.step; const f = form.elements;
  if (s === 1) {
    for (const c of ref.cities) {
      const code = f[`product_${c.id}`]?.value;
      if (!code) { delete wiz.selections[c.id]; continue; }
      const prev = wiz.selections[c.id]?.product_code === code ? wiz.selections[c.id] : {};
      wiz.selections[c.id] = { ...prev, product_code: code, sub_type: ref.product(code)?.sub_types?.length ? f[`sub_${c.id}`]?.value : null };
    }
  }
  if (s === 2) {
    for (const it of selectionItems()) {
      const id = it.city_id; const sel = wiz.selections[id]; const num = (n) => (f[n]?.value === '' || f[n] == null ? null : Number(f[n].value));
      Object.assign(sel, {
        tents: num(`tents_${id}`) ?? 0, tables: num(`tables_${id}`) ?? 0, chair_pairs: num(`chairs_${id}`) ?? 0,
        truck_length_ft: num(`len_${id}`), truck_width_ft: num(`wid_${id}`), ahs_decal_number: f[`ahs_${id}`]?.value || null, fire_decal_number: f[`fire_${id}`]?.value || null,
        power_needed: !!f[`power_${id}`]?.checked, power_amps: num(`amps_${id}`), personal_services: !!f[`personal_${id}`]?.checked, special_requests: f[`special_${id}`]?.value || null,
      });
    }
  }
  if (s === 4) {
    wiz.agreements = { terms: f.terms.checked, policy: f.policy.checked, comms: f.comms.checked, media: f.media.checked, marketing: f.marketing.checked,
      payment_method: form.querySelector('[name=payment_method]:checked')?.value || 'card', notes: f.notes.value };
  }
}

async function ensureApp() {
  let app = currentApp();
  if (!app || !['draft', 'changes_requested'].includes(app.status)) {
    [app] = await api.insert('applications', { organization_id: org.id, status: 'draft', event_year: ref.settings.event?.year });
    apps.unshift(app);
  }
  wiz.appId = app.id;
  return app;
}

async function saveDraft() {
  if (!org) return;
  const app = await ensureApp();
  // Replace the items with the current choices
  await api.remove('application_items', { application_id: app.id });
  const rows = selectionItems().map((it) => ({
    application_id: app.id, city_id: it.city_id, product_code: it.product_code, sub_type: it.sub_type || null,
    tents: it.tents || 0, tables: it.tables || 0, chair_pairs: it.chair_pairs || 0, truck_length_ft: it.truck_length_ft ?? null, truck_width_ft: it.truck_width_ft ?? null,
    power_needed: !!it.power_needed, power_amps: it.power_amps ?? null, personal_services: !!it.personal_services,
    ahs_decal_number: it.ahs_decal_number || null, fire_decal_number: it.fire_decal_number || null, special_requests: it.special_requests || null,
  }));
  if (rows.length) await api.insert('application_items', rows);
  const a = wiz.agreements; const t = new Date().toISOString();
  await api.update('applications', { id: app.id }, {
    terms_accepted_at: a.terms ? (app.terms_accepted_at || t) : null, policy_accepted_at: a.policy ? (app.policy_accepted_at || t) : null,
    comms_consent_at: a.comms ? (app.comms_consent_at || t) : null, media_consent_at: a.media ? (app.media_consent_at || t) : null,
    marketing_opt_in_at: a.marketing ? (app.marketing_opt_in_at || t) : null, payment_method: a.payment_method, notes_to_organizers: a.notes || null,
  });
  await loadAll();
}

async function next(form, button) {
  const err = form.querySelector('.form-error');
  const fail = (m, el) => { err.hidden = false; err.textContent = m; el?.focus(); };
  err.hidden = true;
  if (!form.checkValidity()) {
    const bad = form.querySelector(':invalid');
    return fail(`${(bad.labels?.[0]?.textContent || 'A field').replace(' *', '').trim()}: ${bad.validationMessage}`, bad);
  }
  collect(form);
  await busy(button, async () => {
    try {
      if (wiz.step === 0) await saveOrg(Object.fromEntries([...form.elements].filter((e) => e.name).map((e) => [e.name, e.type === 'checkbox' ? e.checked : e.value])));
      if (wiz.step === 1 && !selectionItems().length) return fail('Please choose at least one city.');
      if (wiz.step === 4 && !(wiz.agreements.terms && wiz.agreements.policy && wiz.agreements.comms)) return fail('Please tick the three required agreements.');
      if (wiz.step >= 1) await saveDraft();
      if (wiz.step === 5) {
        const app = currentApp();
        await api.rpc('submit_application', { p_app: app.id });
        api.fn('mailer', { action: 'application_submitted', application_id: app.id }).catch(() => {});
        await loadAll();
        wiz = null;
        toast('Application submitted. Thank you – we’ve emailed you a confirmation.');
        location.hash = '#/overview';
        return;
      }
      wiz.step++;
      renderStep();
      window.scrollTo({ top: 0 });
    } catch (ex) { fail(ex.message); }
  });
}

function applicationSummary(app) {
  const list = appItems(app);
  show(html`<h1 class="h2">Your application</h1>
    <p>${badge(app.status, R.APPLICATION_STATUS_LABELS[app.status])} ${app.submitted_at ? html`<span class="muted">Submitted ${R.dateTime(app.submitted_at)}</span>` : ''}</p>
    ${app.status === 'waitlisted' ? html`<p class="notice">You’re on the waitlist. We’ll email you if a space opens.</p>` : ''}
    ${app.status === 'declined' && app.decision_reason ? html`<p class="notice">${app.decision_reason}</p>` : ''}
    ${table(list, [
      { label: 'City', cell: (i) => ref.city(i.city_id)?.name },
      { label: 'Option', cell: (i) => itemLabel(i, ref).split(' – ')[0] },
      { label: 'Rentals', cell: (i) => (i.tents || i.tables || i.chair_pairs ? `Tents ${i.tents}, tables ${i.tables}, chairs ${i.chair_pairs * 2}` : '—') },
      { label: 'Details', cell: (i) => [i.truck_length_ft && `Truck ${i.truck_length_ft}′ × ${i.truck_width_ft}′`, i.power_needed && `Power${i.power_amps ? ` ${i.power_amps} A` : ''}`, i.personal_services && 'Personal services', i.special_requests].filter(Boolean).join(' · ') || '—' },
    ], { caption: 'Your booths and sponsorships' })}
    ${['cancel_requested', 'cancelled', 'declined'].includes(app.status) ? '' : html`
      <h2 class="h3">Need to cancel?</h2>
      <p>Cancelling is a request – our team confirms it and works out any refund under the cancellation policy.</p>
      <button class="button button--outline" type="button" id="cancel-app">Request cancellation</button>`}`, 'Application');
  $('#cancel-app')?.addEventListener('click', () => cancelApp(app));
}

async function cancelApp(app) {
  const pol = ref.settings.policy_text || { lines: [] };
  const v = await formDialog({ title: 'Request cancellation', submit: 'Send cancellation request', danger: true, body: html`
    <div class="policy-box"><ul>${pol.lines.map((l) => html`<li>${l}</li>`)}</ul></div>
    ${field({ label: 'Reason (optional)', name: 'reason', type: 'textarea', attrs: 'maxlength="2000"' })}` });
  if (!v) return;
  try {
    await api.rpc('request_cancellation', { p_app: app.id, p_reason: v.reason });
    api.fn('mailer', { action: 'cancel_requested', application_id: app.id }).catch(() => {});
    await loadAll();
    toast('Cancellation request sent. We’ll email you to confirm.');
    apply();
  } catch (e) { showError(e); }
}

// ---- Invoices & receipts ----------------------------------------------------
async function invoices() {
  const { invoices: list, receipts, lines, payments, reports } = await loadMoney();
  const tpl = ref.settings.pay_link?.template;
  const payBtn = (inv, cents, label) => {
    const href = R.buildPayLink(tpl, { invoice: inv.number, amountCents: cents, org: inv.bill_name, name: inv.bill_contact, email: inv.bill_email, phone: org?.contact_phone });
    return html`<a class="button button--primary button--small" href="${href}" target="_blank" rel="noopener">${label} ${R.money(cents)}<span class="sr-only"> (opens the Last Door payment page in a new tab)</span></a>`;
  };
  show(html`<h1 class="h2">Invoices &amp; receipts</h1>
    ${list.length ? '' : html`<p class="empty">You don’t have an invoice yet. It appears here once your application is accepted.</p>`}
    ${list.map((inv) => {
      const st = inv.state; const ls = lines.filter((l) => l.invoice_id === inv.id);
      const help = String(ref.settings.pay_link?.help || '').replaceAll('{invoice}', inv.number);
      const open = reports.filter((r) => r.invoice_id === inv.id && r.status === 'open');
      return html`<article class="card invoice-card">
        <header class="invoice-card__head"><h2 class="h3">Invoice #${inv.number}</h2>${badge(st.code, st.label)}</header>
        <p class="muted">Sent ${R.longDate(inv.issue_date)}${inv.balance_due ? ` · Balance due ${R.longDate(inv.balance_due)}` : ''}</p>
        <ul class="plain-list lines">${ls.map((l) => html`<li><span>${l.description}${l.detail ? html`<br><small class="muted">${l.detail}</small>` : ''}</span><span>${R.money(l.amount_cents)}</span></li>`)}</ul>
        <dl class="money-summary"><dt>Total</dt><dd>${R.money(inv.total_cents)}</dd><dt>Paid</dt><dd>${R.money(st.paid_cents)}</dd>
          ${st.refunded_cents ? html`<dt>Refunded</dt><dd>${R.money(st.refunded_cents)}</dd>` : ''}<dt>Balance owing</dt><dd><strong>${R.money(st.owing_cents)}</strong></dd></dl>
        ${st.owing_cents > 0 ? html`<div class="pay-box">
          <h3 class="h4">Pay now</h3>
          <div class="button-row">
            ${st.deposit_owing_cents > 0 && st.deposit_owing_cents < st.owing_cents ? payBtn(inv, st.deposit_owing_cents, 'Pay deposit') : ''}
            ${st.deposit_owing_cents === 0 || st.deposit_owing_cents >= st.owing_cents ? payBtn(inv, st.owing_cents, st.paid_cents ? 'Pay balance' : 'Pay') : payBtn(inv, st.owing_cents, 'Pay in full')}
          </div>
          <details class="details"><summary>If the payment form isn’t filled in for you</summary>
            <p>${help}</p>
            <p>Invoice number: <code>${inv.number}</code> <button class="button button--text" type="button" data-copy="${inv.number}">Copy</button><br>
            Amount: <code>${R.plainAmount(st.due_now_cents)}</code> <button class="button button--text" type="button" data-copy="${R.plainAmount(st.due_now_cents)}">Copy</button></p>
            <p>Or mail a cheque payable to <strong>Last Door Recovery Society</strong> with your invoice number.</p></details>
          ${open.length ? html`<p class="notice">Thanks – we’re checking the payment you reported on ${R.longDate(open[0].paid_on)}.</p>`
            : html`<button class="button button--text" type="button" data-report="${inv.id}">I’ve paid, but it’s not showing</button>`}
        </div>` : ''}
        <div class="button-row"><button class="button button--outline button--small" type="button" data-pdf="invoice" data-id="${inv.id}">Download invoice PDF</button></div>
      </article>`;
    })}
    <h2 class="h3">Receipts</h2>
    ${table(receipts, [
      { label: 'Receipt', cell: (r) => r.number },
      { label: 'Invoice', cell: (r) => `#${list.find((i) => i.id === r.invoice_id)?.number ?? ''}` },
      { label: 'Amount', cell: (r) => R.money(payments.find((p) => p.id === r.payment_id)?.amount_cents), cls: 'num' },
      { label: 'Date', cell: (r) => R.longDate(payments.find((p) => p.id === r.payment_id)?.paid_at) },
      { label: 'PDF', cell: (r) => html`<button class="button button--text" type="button" data-pdf="receipt" data-id="${r.payment_id}">Download<span class="sr-only"> receipt ${r.number}</span></button>` },
    ], { caption: 'Your receipts', empty: 'Receipts appear here after each payment.' })}`, 'Invoices');

  view.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.copy) {
      try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copied.'); } catch { toast(`Copy this: ${b.dataset.copy}`); }
    }
    if (b.dataset.pdf) await busy(b, async () => { const { blob, filename } = await api.pdf(b.dataset.pdf, b.dataset.id); downloadBlob(blob, filename); });
    if (b.dataset.report) reportPayment(list.find((i) => i.id === b.dataset.report));
  };
}

async function reportPayment(inv) {
  const v = await formDialog({ title: `Report a payment for #${inv.number}`, submit: 'Send', body: html`
    <p>Payments can take a day or two to appear. Tell us about yours and Finance will check it.</p>
    ${field({ label: 'Date you paid', name: 'paid_on', type: 'date', required: true, value: R.todayInEdmonton() })}
    ${field({ label: 'Amount paid ($)', name: 'amount', required: true, value: R.plainAmount(inv.state.due_now_cents), attrs: 'inputmode="decimal"' })}
    ${field({ label: 'Email used for the payment', name: 'payer_email', type: 'email', value: inv.bill_email })}
    ${field({ label: 'Anything else? (last 4 digits of the card, cheque number…)', name: 'note', type: 'textarea', attrs: 'maxlength="1000"' })}` });
  if (!v) return;
  const cents = R.parseMoney(v.amount);
  if (!(cents > 0)) return showError(new Error('Please enter the amount, for example 100.00.'));
  try {
    await api.insert('payment_reports', { invoice_id: inv.id, organization_id: org.id, paid_on: v.paid_on, amount_cents: cents, payer_email: v.payer_email || null, note: v.note || null });
    toast('Thank you. Finance will check and email your receipt.');
    invoices();
  } catch (e) { showError(e); }
}

// ---- Documents --------------------------------------------------------------
async function renderUploads(target, { compact = false } = {}) {
  if (!org) { setHTML(target, html`<p class="notice">Please complete your organization details first.</p>`); return; }
  const docs = await api.list('documents', { eq: { organization_id: org.id }, order: 'uploaded_at', asc: false });
  const app = currentApp();
  const itemsNow = wiz && compact ? selectionItems() : appItems(app);
  const needed = [];
  for (const it of itemsNow) for (const d of R.requiredDocuments(it, ref.settings)) needed.push({ type: d, city_id: it.city_id });
  const rows = [...needed, { type: 'logo', city_id: null, optional: true }, { type: 'booth_layout', city_id: null, optional: true }];
  setHTML(target, html`${table(rows, [
    { label: 'Document', cell: (r) => html`${R.DOC_TYPES[r.type]}${r.optional ? html` <span class="muted">(optional)</span>` : ''}${r.city_id ? html`<br><small class="muted">${ref.city(r.city_id)?.name}</small>` : ''}` },
    { label: 'Status', cell: (r) => { const d = docs.find((x) => x.doc_type === r.type && (x.city_id ?? null) === (r.city_id ?? null)) || docs.find((x) => x.doc_type === r.type); return d ? html`${badge(d.status, { pending: 'Waiting for review', approved: 'Approved', rejected: 'Please re-upload' }[d.status])}<br><small>${d.file_name}</small>${d.review_note ? html`<br><small>${d.review_note}</small>` : ''}` : badge('missing', r.optional ? 'Not uploaded' : 'Needed'); } },
    { label: 'Upload', cell: (r) => html`<label class="file-button"><span>Choose file</span><span class="sr-only"> for ${R.DOC_TYPES[r.type]}</span>
        <input type="file" accept="application/pdf,image/jpeg,image/png" data-doc="${r.type}" data-city="${r.city_id || ''}"></label>` },
  ], { caption: 'Your documents' })}
  <p class="hint">PDF, JPG or PNG · up to 10 MB each.</p>`);
  target.onchange = async (e) => {
    const input = e.target.closest('input[type=file]');
    if (!input?.files?.[0]) return;
    const file = input.files[0];
    const problem = checkFile(file);
    if (problem) { input.value = ''; return showError(new Error(problem)); }
    try {
      const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-80);
      const path = `${org.id}/${input.dataset.doc}-${Date.now()}-${safe}`;
      await api.upload('vendor-docs', path, file);
      await api.insert('documents', { organization_id: org.id, application_id: currentApp()?.id ?? null, city_id: input.dataset.city || null, doc_type: input.dataset.doc,
        storage_path: path, file_name: file.name.slice(0, 200), mime_type: file.type, size_bytes: file.size });
      toast(`Uploaded ${file.name}.`);
      renderUploads(target, { compact });
    } catch (ex) { showError(ex); }
  };
}
async function documents() {
  show(html`<h1 class="h2">Documents</h1><p>Upload the documents for your booth. Our team reviews each one.</p><div id="docs"></div>`, 'Documents');
  await renderUploads($('#docs'));
}

// ---- My booth ---------------------------------------------------------------
async function booth() {
  const booths = await api.list('booths');
  const maps = await api.list('site_maps');
  const app = currentApp();
  const accepted = app?.status === 'accepted' ? appItems(app) : [];
  const cards = [];
  for (const it of accepted) {
    const c = ref.city(it.city_id);
    const b = booths.find((x) => x.application_item_id === it.id);
    const map = maps.find((m) => m.city_id === it.city_id);
    let mapHtml = html`<p class="hint">The site map is posted closer to the event.</p>`;
    if (map && b) {
      try {
        const url = await api.signedUrl('site-maps', map.storage_path);
        mapHtml = html`<figure class="site-map"><div class="site-map__frame"><img src="${url}" alt="Site map for Recovery Day ${c.name}">
          <span class="pin pin--me" data-x="${b.x_pct}" data-y="${b.y_pct}" aria-hidden="true">${b.label}</span></div>
          <figcaption>Your booth <strong>${b.label}</strong> is the red marker.</figcaption></figure>`;
      } catch { /* map not available */ }
    }
    cards.push(html`<article class="card"><h2 class="h3">Recovery Day ${c.name}</h2>
      <p class="booth-number">${b ? html`Booth <strong>${b.label}</strong>${b.size ? html` <span class="muted">(${b.size})</span>` : ''}` : 'Booth number: to be assigned'}</p>
      <dl class="summary"><dt>Date</dt><dd>${cityDate(c)}${c.start_time ? `, ${c.start_time}–${c.end_time}` : ''}</dd>
        <dt>Location</dt><dd>${c.venue || 'To be confirmed'}</dd><dt>Load-in</dt><dd>${c.load_in || 'To be confirmed'}</dd>
        <dt>Entry street</dt><dd>${c.entry_street || 'To be confirmed'}</dd><dt>Parking</dt><dd>${c.parking || 'To be confirmed'}</dd></dl>
      ${mapHtml}</article>`);
  }
  show(html`<h1 class="h2">My booth</h1>${cards.length ? cards : html`<p class="empty">Your booth details appear here once your application is accepted.</p>`}`, 'My booth');
}

// ---- Announcements ----------------------------------------------------------
async function announcements() {
  const list = await api.list('announcements', { order: 'published_at', asc: false });
  const cities = new Set(appItems(currentApp()).map((i) => i.city_id));
  const mine = list.filter((a) => !a.city_id || cities.has(a.city_id));
  show(html`<h1 class="h2">Announcements</h1>${mine.length ? mine.map((a) => html`<article class="card"><h2 class="h3">${a.title}</h2>
    <p class="muted">${R.dateTime(a.published_at)}${a.city_id ? ` · ${ref.city(a.city_id)?.name}` : ''}</p><p class="pre">${a.body}</p></article>`) : html`<p class="empty">No announcements yet.</p>`}`, 'Announcements');
}

// ---- Profile & privacy ------------------------------------------------------
async function profile() {
  show(html`<h1 class="h2">Profile &amp; privacy</h1>
    <form id="org-form" class="stack" novalidate>${orgFields(org || {})}
      <p class="form-error" role="alert" hidden></p><button class="button button--primary" type="submit">Save changes</button></form>
    <h2 class="h3">Your data</h2>
    <p>Download a copy of everything we hold about your organization (your right under Alberta’s PIPA).</p>
    <button class="button button--outline" type="button" id="export">Download my data</button>
    <p class="hint">To correct or delete information, email community@lastdoor.org. Financial records are kept for 7 years as required by law. See our <a href="${link('privacy/')}">privacy policy</a>.</p>`, 'Profile');
  $('#org-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target; const err = f.querySelector('.form-error');
    if (!f.checkValidity()) { const bad = f.querySelector(':invalid'); err.hidden = false; err.textContent = `${bad.labels?.[0]?.textContent.replace(' *', '')}: ${bad.validationMessage}`; bad.focus(); return; }
    await busy(f.querySelector('[type=submit]'), async () => {
      await saveOrg(Object.fromEntries([...f.elements].filter((x) => x.name).map((x) => [x.name, x.type === 'checkbox' ? x.checked : x.value])));
      toast('Saved.');
    });
  });
  $('#export').addEventListener('click', (e) => busy(e.target, async () => downloadJson(await api.rpc('export_my_data'), `my-recovery-day-data-${R.todayInEdmonton()}.json`)));
}

// ---- Start ------------------------------------------------------------------
(async () => {
  demoBanner();
  me = await requireLogin({ next: 'portal' });
  ref = await reference();
  await loadAll();
  $('#who').textContent = org?.legal_name || me.user.email;
  $('#sign-out').addEventListener('click', async () => { await api.auth.signOut(); location.assign(link('login/')); });
  router({ overview, apply, invoices, documents, booth, announcements, profile }, 'overview', setActive);
})().catch((e) => { showError(e); setHTML(view, html`<p class="notice notice--error" role="alert">${e.message}</p>`); });

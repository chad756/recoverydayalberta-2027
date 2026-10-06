// Admin → Applications: review, accept / waitlist / decline / request changes.
import { api } from '../lib/api.js';
import { $, html, toast, showError, busy, formDialog, confirmDialog, badge, table, field } from '../lib/ui.js';
import { R, itemLabel, orgTypeLabel } from '../lib/data.js';
import { ctx } from './context.js';

const filters = { status: 'open', city: '', kind: '', q: '' };

export default async function applications([id]) {
  if (id) return detail(id);
  const { ref } = ctx;
  const [apps, items, orgs, invoices] = await Promise.all([
    api.list('applications', { order: 'submitted_at', asc: false }), api.list('application_items'), api.list('organizations'), api.list('invoices'),
  ]);
  const orgOf = (a) => orgs.find((o) => o.id === a.organization_id) || {};
  const rows = apps.filter((a) => {
    if (filters.status === 'open' && !['submitted', 'under_review', 'changes_requested', 'cancel_requested'].includes(a.status)) return false;
    if (filters.status && filters.status !== 'open' && filters.status !== 'all' && a.status !== filters.status) return false;
    const its = items.filter((i) => i.application_id === a.id);
    if (filters.city && !its.some((i) => i.city_id === filters.city)) return false;
    if (filters.kind && !its.some((i) => ref.product(i.product_code)?.kind === filters.kind || i.product_code === filters.kind)) return false;
    if (filters.q && !`${orgOf(a).legal_name} ${orgOf(a).contact_name} ${orgOf(a).contact_email}`.toLowerCase().includes(filters.q.toLowerCase())) return false;
    return true;
  });
  ctx.show(html`<h1 class="h2">Applications</h1>
    <form class="filters" id="filters" role="search" aria-label="Filter applications">
      ${field({ label: 'Status', name: 'status', type: 'select', value: filters.status, options: [['open', 'Needs action'], ['all', 'All'], ...Object.entries(R.APPLICATION_STATUS_LABELS)] })}
      ${field({ label: 'City', name: 'city', type: 'select', value: filters.city, options: [['', 'All cities'], ...ref.cities.map((c) => [c.id, c.name])] })}
      ${field({ label: 'Type', name: 'kind', type: 'select', value: filters.kind, options: [['', 'All types'], ['sponsorship', 'Sponsorships'], ['booth', 'All booths'], ['vendor_booth', 'Vendor / health / non-profit'], ['food_truck', 'Food trucks'], ['artisan', 'Artisans'], ['mutual_support', 'Mutual support']] })}
      ${field({ label: 'Search', name: 'q', type: 'search', value: filters.q, attrs: 'placeholder="Name or email"' })}
    </form>
    <p class="muted">${rows.length} of ${apps.length} applications</p>
    ${table(rows, [
      { label: 'Organization', cell: (a) => html`<a href="#/applications/${a.id}">${orgOf(a).legal_name}</a>${orgOf(a).file_number ? html`<br><small class="muted">File ${orgOf(a).file_number}</small>` : ''}` },
      { label: 'Applied for', cell: (a) => html`${items.filter((i) => i.application_id === a.id).map((i) => html`${itemLabel(i, ref)}<br>`)}` },
      { label: 'Status', cell: (a) => badge(a.status, R.APPLICATION_STATUS_LABELS[a.status]) },
      { label: 'Invoice', cell: (a) => { const i = invoices.find((x) => x.application_id === a.id && x.status !== 'void'); return i ? html`<a href="#/invoices/${i.id}">#${i.number}</a> <small>(${i.status})</small>` : '—'; } },
      { label: 'Submitted', cell: (a) => (a.submitted_at ? R.dateTime(a.submitted_at) : '—') },
    ], { caption: 'Applications', empty: 'No applications match these filters.' })}`, 'Applications');
  $('#filters').addEventListener('input', (e) => {
    filters[e.target.name] = e.target.value;
    clearTimeout(filters.t);
    filters.t = setTimeout(() => applications([]).then(() => { const el = document.querySelector(`#filters [name="${e.target.name}"]`); el?.focus(); if (el?.type === 'search') el.setSelectionRange(el.value.length, el.value.length); }), e.target.name === 'q' ? 300 : 0);
  });
}

async function detail(id) {
  const { ref } = ctx;
  const app = await api.get('applications', id);
  if (!app) return ctx.show(html`<p class="notice notice--error">Application not found.</p>`);
  const [org, items, docs, invoices] = await Promise.all([
    api.get('organizations', app.organization_id), api.list('application_items', { eq: { application_id: id } }),
    api.list('documents', { eq: { organization_id: app.organization_id } }), api.list('invoices', { eq: { application_id: id } }),
  ]);
  const openInvoice = invoices.find((i) => ['draft', 'sent'].includes(i.status));
  const draft = R.buildInvoiceDraft({ items, products: ref.products, cities: ref.cities, settings: ref.settings });
  const needed = items.flatMap((i) => R.requiredDocuments(i, ref.settings).map((d) => ({ d, city: i.city_id })));
  const yesNo = (t) => (t ? html`<span class="badge badge--ok">Yes</span> <small class="muted">${R.dateTime(t)}</small>` : html`<span class="badge badge--neutral">No</span>`);
  ctx.show(html`<p><a href="#/applications">← All applications</a></p>
    <h1 class="h2">${org.legal_name}</h1>
    <p>${badge(app.status, R.APPLICATION_STATUS_LABELS[app.status])} ${org.file_number ? html`<span class="muted">File number ${org.file_number}</span>` : ''}</p>
    ${app.status === 'cancel_requested' ? html`<p class="notice"><strong>Cancellation requested.</strong> ${app.cancel_reason || ''} ${openInvoice ? html`<a href="#/payments/refund/${openInvoice.id}">Open the refund calculator</a>` : ''}</p>` : ''}
    <div class="button-row" id="decide">
      ${['submitted', 'under_review', 'changes_requested', 'waitlisted'].includes(app.status) ? html`
        <button class="button button--primary" data-act="accepted">Accept and create invoice</button>
        <button class="button button--outline" data-act="waitlisted">Waitlist</button>
        <button class="button button--outline" data-act="changes_requested">Request changes</button>
        <button class="button button--danger" data-act="declined">Decline</button>` : ''}
      ${app.status === 'submitted' ? html`<button class="button button--text" data-act="under_review">Mark under review</button>` : ''}
      ${app.status === 'cancel_requested' && !openInvoice ? html`<button class="button button--danger" data-act="cancelled">Confirm cancellation</button>` : ''}
      ${app.status === 'accepted' && !openInvoice ? html`<button class="button button--primary" data-act="invoice">Create invoice</button>` : ''}
      ${openInvoice ? html`<a class="button button--dark" href="#/invoices/${openInvoice.id}">Open invoice #${openInvoice.number}</a>` : ''}
    </div>
    <div class="card-grid">
      <article class="card"><h2 class="h3">Organization</h2><dl class="summary">
        <dt>Type</dt><dd>${orgTypeLabel(org.org_type)}</dd><dt>Public name</dt><dd>${org.display_name || '—'}</dd>
        <dt>Contact</dt><dd>${org.contact_name}<br>${org.contact_email}<br>${org.contact_phone}</dd>
        <dt>Address</dt><dd>${org.street}<br>${org.city}, ${org.province} ${org.postal_code}</dd>
        ${org.billing_email ? html`<dt>Billing</dt><dd>${org.billing_name}<br>${org.billing_email}</dd>` : ''}
        <dt>Website</dt><dd>${org.website || '—'} ${org.socials ? html`<br>${org.socials}` : ''}</dd>
        <dt>Description</dt><dd>${org.description || '—'}</dd><dt>Directory</dt><dd>${org.directory_opt_in ? 'Yes' : 'No'}</dd></dl></article>
      <article class="card"><h2 class="h3">Consents</h2><dl class="summary">
        <dt>Vendor terms</dt><dd>${yesNo(app.terms_accepted_at)}</dd><dt>Refund policy</dt><dd>${yesNo(app.policy_accepted_at)}</dd>
        <dt>Event emails</dt><dd>${yesNo(app.comms_consent_at)}</dd><dt>Photo / media</dt><dd>${yesNo(app.media_consent_at)}</dd>
        <dt>Marketing (CASL)</dt><dd>${yesNo(app.marketing_opt_in_at)}</dd><dt>Payment</dt><dd>${app.payment_method === 'cheque' ? 'Cheque' : 'Credit card'}</dd></dl>
        ${app.notes_to_organizers ? html`<h3 class="h4">Notes from the applicant</h3><p class="pre">${app.notes_to_organizers}</p>` : ''}
        ${app.decision_reason ? html`<h3 class="h4">Decision note</h3><p class="pre">${app.decision_reason}</p>` : ''}</article>
    </div>
    <h2 class="h3">Applied for</h2>
    ${table(items, [
      { label: 'Item', cell: (i) => itemLabel(i, ref) },
      { label: 'Rentals', cell: (i) => `Tents ${i.tents} · Tables ${i.tables} · Chairs ${i.chair_pairs * 2}` },
      { label: 'Details', cell: (i) => [i.truck_length_ft && `Truck ${i.truck_length_ft}′×${i.truck_width_ft}′`, i.power_needed && `Power ${i.power_amps || '?'} A`, i.personal_services && 'Personal services', i.ahs_decal_number && `AHS ${i.ahs_decal_number}`, i.fire_decal_number && `Fire ${i.fire_decal_number}`, i.special_requests].filter(Boolean).join(' · ') || '—' },
    ], { caption: 'Items' })}
    <p><strong>Invoice preview:</strong> ${R.money(draft.total_cents)} · deposit ${R.money(draft.deposit_cents)} · balance due ${draft.balance_due ? R.longDate(draft.balance_due) : 'when event dates are set'}</p>
    <h2 class="h3">Documents</h2>
    ${needed.length ? html`<p>Required: ${needed.map((n) => `${R.DOC_TYPES[n.d]} (${ref.city(n.city)?.name})`).join(', ')}</p>` : ''}
    ${table(docs, [
      { label: 'Document', cell: (d) => html`${R.DOC_TYPES[d.doc_type]}<br><small>${d.file_name}</small>` },
      { label: 'Status', cell: (d) => badge(d.status) },
      { label: 'Actions', cell: (d) => html`<div class="button-row button-row--tight">
        <button class="button button--text" data-open="${d.id}">Open</button>
        <button class="button button--text" data-doc="${d.id}" data-status="approved">Approve</button>
        <button class="button button--text" data-doc="${d.id}" data-status="rejected">Reject</button></div>` },
    ], { caption: 'Documents', empty: 'No documents uploaded.' })}`, org.legal_name);

  ctx.view.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.open) {
      const d = docs.find((x) => x.id === b.dataset.open);
      return busy(b, async () => window.open(await api.signedUrl('vendor-docs', d.storage_path), '_blank', 'noopener'));
    }
    if (b.dataset.doc) {
      let note = null;
      if (b.dataset.status === 'rejected') { const v = await formDialog({ title: 'Reject document', submit: 'Reject', danger: true, body: field({ label: 'Tell the vendor what to fix', name: 'note', type: 'textarea', required: true }) }); if (!v) return; note = v.note; }
      return busy(b, async () => { await api.update('documents', { id: b.dataset.doc }, { status: b.dataset.status, review_note: note, reviewed_by: ctx.me.user.id }); toast('Document updated.'); detail(id); });
    }
    const act = b.dataset.act;
    if (!act) return;
    if (act === 'invoice') return busy(b, () => makeInvoice(app, items));
    let reason = null;
    if (['declined', 'changes_requested', 'waitlisted'].includes(act)) {
      const v = await formDialog({ title: { declined: 'Decline application', changes_requested: 'Request changes', waitlisted: 'Waitlist application' }[act],
        submit: 'Save and email the applicant', danger: act === 'declined',
        body: field({ label: act === 'changes_requested' ? 'What should they change? (sent to the applicant)' : 'Note to the applicant (optional)', name: 'reason', type: 'textarea', required: act === 'changes_requested' }) });
      if (!v) return; reason = v.reason || null;
    }
    if (act === 'accepted' && !(await confirmDialog('Accept application', `Accept ${org.legal_name}? A DRAFT invoice for ${R.money(draft.total_cents)} will be created for you to review. Nothing is emailed until you press “Approve & Send”.`, { submit: 'Accept' }))) return;
    await busy(b, async () => {
      await api.rpc('decide_application', { p_app: id, p_status: act, p_reason: reason });
      if (act === 'accepted') return makeInvoice(app, items);
      if (act !== 'under_review') { const r = await api.fn('mailer', { action: 'decision', application_id: id }); toast(r?.note || 'Saved and emailed.'); } else toast('Saved.');
      detail(id);
    });
  };
}

async function makeInvoice(app, items) {
  const { ref } = ctx;
  const d = R.buildInvoiceDraft({ items, products: ref.products, cities: ref.cities, settings: ref.settings });
  const invId = await api.rpc('create_invoice', {
    p_invoice: { organization_id: app.organization_id, application_id: app.id, total_cents: d.total_cents, deposit_cents: d.deposit_cents, balance_due: d.balance_due },
    p_lines: d.lines,
  });
  toast('Accepted. Please review the draft invoice, then Approve & Send.');
  location.hash = `#/invoices/${invId}`;
}

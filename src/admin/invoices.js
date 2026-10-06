// Admin → Invoices: review drafts, edit, Approve & Send, resend, cancel, manual invoices.
import { api } from '../lib/api.js';
import { $, $$, html, raw, toast, showError, busy, formDialog, confirmDialog, badge, table, field, downloadBlob, setHTML } from '../lib/ui.js';
import { R, withState } from '../lib/data.js';
import { ADMIN_COLUMNS, SPONSOR_HEADERS, colNumber } from '../lib/sponsor-sheet.js';
import { ctx } from './context.js';

const filters = { status: 'review', q: '' };
const LINE_TYPES = [['booth', 'Booth'], ['sponsorship', 'Sponsorship'], ['rental', 'Rental'], ['discount', 'Discount (enter a negative amount)'], ['custom', 'Custom']];

export default async function invoices([id]) {
  if (id) return detail(id);
  const [list, payments, refunds, orgs] = await Promise.all([api.list('invoices', { order: 'number' }), api.list('payments'), api.list('refunds'), api.list('organizations', { order: 'legal_name' })]);
  const all = withState(list, payments.filter((p) => !p.voided), refunds);
  const rows = all.filter((i) => {
    if (filters.status === 'review' && i.status !== 'draft') return false;
    if (filters.status === 'open' && !(i.status === 'sent' && i.state.owing_cents > 0)) return false;
    if (filters.status === 'overdue' && i.state.code !== 'overdue') return false;
    if (['sent', 'cancelled', 'void'].includes(filters.status) && i.status !== filters.status) return false;
    if (filters.q && !`${i.number} ${i.bill_name} ${i.bill_email}`.toLowerCase().includes(filters.q.toLowerCase())) return false;
    return true;
  });
  ctx.show(html`<h1 class="h2">Invoices</h1>
    <div class="button-row"><button class="button button--primary" id="manual">New manual invoice</button></div>
    <form class="filters" id="filters" role="search" aria-label="Filter invoices">
      ${field({ label: 'Show', name: 'status', type: 'select', value: filters.status, options: [['review', 'To review (drafts)'], ['open', 'Sent – money owing'], ['overdue', 'Overdue'], ['sent', 'All sent'], ['cancelled', 'Cancelled'], ['void', 'Void'], ['all', 'All']] })}
      ${field({ label: 'Search', name: 'q', type: 'search', value: filters.q, attrs: 'placeholder="Number, name or email"' })}
    </form>
    ${table(rows, [
      { label: 'Invoice', cell: (i) => html`<a href="#/invoices/${i.id}">#${i.number}</a>` },
      { label: 'Bill to', cell: (i) => i.bill_name },
      { label: 'Status', cell: (i) => badge(i.state.code, i.state.label) },
      { label: 'Total', cell: (i) => R.money(i.total_cents), cls: 'num' },
      { label: 'Paid', cell: (i) => R.money(i.state.paid_cents), cls: 'num' },
      { label: 'Owing', cell: (i) => R.money(i.state.owing_cents), cls: 'num' },
      { label: 'Balance due', cell: (i) => (i.balance_due ? R.shortDate(i.balance_due) : '—') },
    ], { caption: 'Invoices', empty: filters.status === 'review' ? 'No drafts waiting for review.' : 'No invoices match.' })}`, 'Invoices');
  $('#filters').addEventListener('input', (e) => {
    filters[e.target.name] = e.target.value;
    clearTimeout(filters.t);
    filters.t = setTimeout(() => invoices([]).then(() => $(`#filters [name="${e.target.name}"]`)?.focus()), e.target.name === 'q' ? 300 : 0);
  });
  $('#manual').addEventListener('click', () => manualInvoice(orgs));
}

async function manualInvoice(orgs) {
  const { ref } = ctx;
  const v = await formDialog({ title: 'New manual invoice', submit: 'Create draft', body: html`
    <p>For sponsors who didn’t apply online (for example a government grant). It’s created as a draft so you can check it before sending.</p>
    ${field({ label: 'Organization', name: 'org', type: 'select', required: true, options: [['', 'Choose…'], ...orgs.map((o) => [o.id, o.legal_name]), ['new', '+ Add a new organization']] })}
    ${field({ label: 'New organization name (if adding)', name: 'new_name' })}
    ${field({ label: 'Contact email (if adding)', name: 'new_email', type: 'email' })}
    ${field({ label: 'Description', name: 'description', required: true, value: 'Stage Sponsor – Recovery Day Calgary' })}
    ${field({ label: 'Amount ($)', name: 'amount', required: true, attrs: 'inputmode="decimal"' })}
    ${field({ label: 'City (for the sponsor sheet)', name: 'city', type: 'select', options: [['', 'No city'], ...ref.cities.map((c) => [c.id, c.name])] })}
    ${field({ label: 'Balance due date', name: 'due', type: 'date' })}` });
  if (!v) return;
  try {
    let orgId = v.org;
    if (orgId === 'new') {
      if (!v.new_name) throw new Error('Please type the new organization’s name.');
      const [o] = await api.insert('organizations', { legal_name: v.new_name, contact_email: v.new_email || null });
      orgId = o.id;
    }
    const cents = R.parseMoney(v.amount);
    if (Number.isNaN(cents)) throw new Error('Please enter the amount, for example 5000.00');
    const id = await api.rpc('create_invoice', { p_invoice: { organization_id: orgId, total_cents: cents, deposit_cents: 0, balance_due: v.due || null },
      p_lines: [{ sort: 0, line_type: 'custom', city_id: v.city || null, description: v.description, amount_cents: cents }] });
    location.hash = `#/invoices/${id}`;
  } catch (e) { showError(e); }
}

async function detail(id) {
  const { ref } = ctx;
  const inv = await api.get('invoices', id);
  if (!inv) return ctx.show(html`<p class="notice notice--error">Invoice not found.</p>`);
  const [lines, payments, refunds, receipts] = await Promise.all([
    api.list('invoice_lines', { eq: { invoice_id: id }, order: 'sort' }), api.list('payments', { eq: { invoice_id: id }, order: 'paid_at' }),
    api.list('refunds', { eq: { invoice_id: id } }), api.list('receipts', { eq: { invoice_id: id } }),
  ]);
  const st = R.invoiceState(inv, payments.filter((p) => !p.voided), refunds);
  const draft = inv.status === 'draft';
  const cityOpts = [['', '—'], ...ref.cities.map((c) => [c.id, c.name])];
  ctx.show(html`<p><a href="#/invoices">← All invoices</a></p>
    <h1 class="h2">Invoice #${inv.number}</h1>
    <p>${badge(st.code, st.label)} ${inv.sent_at ? html`<span class="muted">Sent ${R.dateTime(inv.sent_at)}</span>` : html`<span class="muted">Not sent yet – the vendor can’t see it.</span>`}</p>
    <div class="button-row">
      ${draft ? html`<button class="button button--primary" data-act="send">Approve &amp; Send</button>` : ''}
      ${inv.status === 'sent' ? html`<button class="button button--outline" data-act="resend">Resend email</button>` : ''}
      <button class="button button--outline" data-act="pdf">${draft ? 'Preview PDF' : 'Download PDF'}</button>
      ${inv.status === 'sent' ? html`<a class="button button--outline" href="#/payments/record/${inv.id}">Record payment</a><a class="button button--outline" href="#/payments/refund/${inv.id}">Cancel / refund</a>` : ''}
      ${draft ? html`<button class="button button--danger" data-act="cancel">Cancel draft</button>` : ''}
      ${inv.status === 'sent' && st.paid_cents === 0 ? html`<button class="button button--text" data-act="void">Void (issued by mistake)</button>` : ''}
    </div>
    <form id="inv-form" class="stack" novalidate>
      <div class="card-grid">
        <fieldset class="card" ${draft ? '' : raw('disabled')}><legend>Bill to</legend>
          ${field({ label: 'Organization', name: 'bill_name', value: inv.bill_name, required: true })}
          ${field({ label: 'Contact', name: 'bill_contact', value: inv.bill_contact })}
          ${field({ label: 'Email', name: 'bill_email', type: 'email', value: inv.bill_email, required: true })}
          ${field({ label: 'Address', name: 'bill_address', type: 'textarea', value: inv.bill_address })}</fieldset>
        <fieldset class="card" ${draft ? '' : raw('disabled')}><legend>Payment schedule</legend>
          ${field({ label: 'Deposit due now ($)', name: 'deposit', value: R.plainAmount(inv.deposit_cents), attrs: 'inputmode="decimal"', hint: `$${R.plainAmount(ref.settings.payment_rules?.deposit_cents ?? 10000)} per booth, per city. Not for sponsorships.` })}
          ${field({ label: 'Balance due date', name: 'balance_due', type: 'date', value: inv.balance_due, hint: '14 days before the earliest event on this invoice.' })}
          ${draft ? html`<button class="button button--text" type="button" data-act="recalc">Recalculate deposit and due date</button>` : ''}
          ${field({ label: 'Internal notes (not printed)', name: 'notes', type: 'textarea', value: inv.notes })}</fieldset>
      </div>
      <fieldset ${draft ? '' : raw('disabled')}><legend>Services</legend>
        <div class="table-wrap"><table class="data-table lines-editor"><thead><tr><th scope="col">Description</th><th scope="col">Small text</th><th scope="col">Type</th><th scope="col">City</th><th scope="col" class="num">Amount ($)</th><th scope="col"><span class="sr-only">Remove</span></th></tr></thead>
        <tbody id="lines">${lines.map((l, i) => lineRow(l, i, cityOpts))}</tbody>
        <tfoot><tr><th scope="row" colspan="4">Total</th><td class="num"><strong id="total">${R.money(inv.total_cents)}</strong></td><td></td></tr></tfoot></table></div>
        ${draft ? html`<button class="button button--outline button--small" type="button" data-act="add-line">Add line (discount or custom)</button>` : ''}
      </fieldset>
      ${draft ? html`<p class="form-error" role="alert" hidden></p><div class="button-row"><button class="button button--dark" type="submit">Save draft</button></div>` : ''}
    </form>
    <h2 class="h3">Payments</h2>
    ${table(payments, [
      { label: 'Date', cell: (p) => R.longDate(p.paid_at) },
      { label: 'Amount', cell: (p) => R.money(p.amount_cents), cls: 'num' },
      { label: 'Received', cell: (p) => html`${p.received_label}${p.voided ? html` ${badge('void', 'Voided')}` : ''}${p.needs_review ? html` ${badge('pending', 'To check')}` : ''}` },
      { label: 'Reference', cell: (p) => p.reference || '—' },
      { label: 'Receipt', cell: (p) => { const r = receipts.find((x) => x.payment_id === p.id); return r ? html`${r.number} <button class="button button--text" data-receipt="${p.id}">PDF</button>` : '—'; } },
    ], { caption: 'Payments', empty: 'No payments yet.' })}
    <p><strong>Paid ${R.money(st.paid_cents)}</strong> · Owing ${R.money(st.owing_cents)}${st.refunded_cents ? ` · Refunded ${R.money(st.refunded_cents)}` : ''}</p>
    <details class="details"><summary>Sponsor sheet columns typed by staff</summary>
      <form id="sheet-form" class="stack">
        <p class="hint">These fill the columns of the sponsor master export that the system can’t work out (RCC, ads, notes…).</p>
        <div class="field-grid">${ADMIN_COLUMNS.map((L) => field({ label: `${L} – ${SPONSOR_HEADERS[colNumber(L) - 1].trim()}`, name: L, value: inv.sheet_extra?.[L] ?? '' }))}
        ${field({ label: 'LED Wall Ads received (Sponsor Emails sheet)', name: 'led_ads', value: inv.sheet_extra?.led_ads ?? '' })}
        ${field({ label: 'Article (Sponsor Emails sheet)', name: 'article', value: inv.sheet_extra?.article ?? '' })}
        ${field({ label: 'Lines with no city go in column', name: 'amount_col', type: 'select', value: inv.sheet_extra?.amount_col ?? '', options: [['', 'Automatic'], ['D', 'D – RCC Calgary'], ['E', 'E – Recovery Day Calgary'], ['F', 'F – Recovery Day Red Deer'], ['G', 'G – Recovery Day Edmonton'], ['H', 'H – RCC SK'], ['I', 'I – Stampede BBQ'], ['J', 'J – Recovery Day BC']] })}</div>
        <button class="button button--outline button--small" type="submit">Save sheet columns</button></form></details>`, `#${inv.number}`);

  const form = $('#inv-form');
  const readLines = () => $$('#lines tr').map((tr, i) => ({
    sort: i, description: tr.querySelector('[name=description]').value.trim(), detail: tr.querySelector('[name=detail]').value.trim() || null,
    line_type: tr.querySelector('[name=line_type]').value, city_id: tr.querySelector('[name=city_id]').value || null,
    product_code: tr.dataset.product || null, quantity: 1, amount_cents: R.parseMoney(tr.querySelector('[name=amount]').value),
  }));
  form.addEventListener('input', () => {
    const t = readLines().reduce((s, l) => s + (Number.isNaN(l.amount_cents) ? 0 : l.amount_cents), 0);
    $('#total').textContent = R.money(t);
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await busy(e.submitter, () => saveDraft());
  });
  async function saveDraft() {
    const ls = readLines();
    const bad = ls.find((l) => !l.description || Number.isNaN(l.amount_cents));
    if (bad) throw new Error('Every line needs a description and an amount.');
    const dep = R.parseMoney(form.deposit.value);
    await api.rpc('save_draft_invoice', { p_id: id, p_lines: ls, p_invoice: {
      deposit_cents: Number.isNaN(dep) ? 0 : dep, balance_due: form.balance_due.value || null, notes: form.notes.value,
      bill_name: form.bill_name.value, bill_contact: form.bill_contact.value, bill_email: form.bill_email.value, bill_address: form.bill_address.value } });
    toast('Draft saved.');
    return ls;
  }

  $('#sheet-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const vals = Object.fromEntries([...e.target.elements].filter((x) => x.name).map((x) => [x.name, x.value]));
    await busy(e.submitter, async () => { await api.update('invoices', { id }, { sheet_extra: { ...(inv.sheet_extra || {}), ...vals } }); toast('Sheet columns saved.'); });
  });

  ctx.view.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.receipt) return busy(b, async () => { const { blob, filename } = await api.pdf('receipt', b.dataset.receipt); downloadBlob(blob, filename); });
    if (b.dataset.remove !== undefined) { b.closest('tr').remove(); form.dispatchEvent(new Event('input')); return; }
    const act = b.dataset.act;
    if (act === 'add-line') {
      const tbody = $('#lines');
      const tmp = document.createElement('tbody');
      setHTML(tmp, lineRow({ description: 'Discount', line_type: 'discount', amount_cents: -10000 }, tbody.children.length, cityOpts));
      tbody.append(tmp.firstElementChild);
      tbody.lastElementChild.querySelector('input').focus();
      form.dispatchEvent(new Event('input'));
    }
    if (act === 'recalc') {
      const r = R.recalcInvoice(readLines(), { settings: ref.settings, cities: ref.cities });
      form.deposit.value = R.plainAmount(r.deposit_cents);
      form.balance_due.value = r.balance_due || '';
      toast(`Deposit ${R.money(r.deposit_cents)}, balance due ${r.balance_due ? R.longDate(r.balance_due) : 'not set'}. Press Save draft to keep it.`);
    }
    if (act === 'pdf') return busy(b, async () => { if (draft) await saveDraft(); const { blob, filename } = await api.pdf('invoice', id); downloadBlob(blob, filename); });
    if (act === 'send') {
      if (!(await confirmDialog('Approve & Send', `Email invoice #${inv.number} (PDF and pay link) to ${form.bill_email.value}? After sending, the lines can’t be changed – you would cancel and re-issue instead.`, { submit: 'Approve & Send' }))) return;
      return busy(b, async () => { await saveDraft(); const r = await api.fn('mailer', { action: 'send_invoice', invoice_id: id }); toast(r?.note || 'Invoice sent.'); detail(id); });
    }
    if (act === 'resend') return busy(b, async () => { const r = await api.fn('mailer', { action: 'resend_invoice', invoice_id: id }); toast(r?.note || 'Invoice re-sent.'); });
    if (act === 'cancel') {
      if (!(await confirmDialog('Cancel draft', `Cancel draft #${inv.number}? The number is kept in the records and not reused.`, { submit: 'Cancel draft', danger: true }))) return;
      return busy(b, async () => { await api.update('invoices', { id }, { status: 'cancelled', void_reason: 'Draft cancelled' }); toast('Draft cancelled.'); detail(id); });
    }
    if (act === 'void') {
      const v = await formDialog({ title: `Void #${inv.number}`, submit: 'Void invoice', danger: true, body: field({ label: 'Reason', name: 'reason', type: 'textarea', required: true }) });
      if (!v) return;
      return busy(b, async () => { await api.update('invoices', { id }, { status: 'void', void_reason: v.reason }); toast('Invoice voided.'); detail(id); });
    }
  };
}

function lineRow(l, i, cityOpts) {
  return html`<tr data-product="${l.product_code || ''}">
    <td><label class="sr-only" for="ld-${i}">Description</label><input id="ld-${i}" name="description" value="${l.description}" maxlength="300"></td>
    <td><label class="sr-only" for="lt-${i}">Small text</label><input id="lt-${i}" name="detail" value="${l.detail || ''}" maxlength="300"></td>
    <td><label class="sr-only" for="ly-${i}">Type</label><select id="ly-${i}" name="line_type">${LINE_TYPES.map(([v, t]) => html`<option value="${v}" ${v === l.line_type ? raw('selected') : ''}>${t}</option>`)}</select></td>
    <td><label class="sr-only" for="lc-${i}">City</label><select id="lc-${i}" name="city_id">${cityOpts.map(([v, t]) => html`<option value="${v}" ${v === (l.city_id || '') ? raw('selected') : ''}>${t}</option>`)}</select></td>
    <td class="num"><label class="sr-only" for="la-${i}">Amount</label><input id="la-${i}" name="amount" value="${R.plainAmount(l.amount_cents)}" inputmode="decimal" class="input--num"></td>
    <td><button class="button button--text" type="button" data-remove>Remove<span class="sr-only"> line ${i + 1}</span></button></td></tr>`;
}

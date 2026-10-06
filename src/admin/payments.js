// Admin → Payments: auto-matched check, unmatched queue, vendor reports,
// manual entry, import (CSV/XLSX or the 2026 sponsor sheet), refunds.
import { api, isDemo } from '../lib/api.js';
import { $, html, raw, toast, showError, busy, formDialog, confirmDialog, badge, table, field, setHTML } from '../lib/ui.js';
import { R, withState } from '../lib/data.js';
import { ctx } from './context.js';

const METHODS = [['cheque', 'Cheque'], ['card', 'Credit card (Visa / Mastercard)'], ['etransfer', 'E-transfer'], ['cash', 'Cash'], ['other', 'Other (wire, EFT…)']];

async function loadAll() {
  const [invoices, payments, refunds, notes, reports, receipts] = await Promise.all([
    api.list('invoices', { order: 'number' }), api.list('payments', { order: 'created_at', asc: false }), api.list('refunds'),
    api.list('payment_notifications', { order: 'received_at', asc: false }), api.list('payment_reports', { order: 'created_at', asc: false }), api.list('receipts'),
  ]);
  const inv = withState(invoices, payments.filter((p) => !p.voided), refunds);
  return { inv, payments, refunds, notes, reports, receipts, byId: Object.fromEntries(inv.map((i) => [i.id, i])) };
}

export default async function payments([sub, id]) {
  if (sub === 'refund') return refund(id);
  if (sub === 'record') return record(id);
  if (sub === 'import') return importer();
  const d = await loadAll();
  const review = d.payments.filter((p) => p.needs_review && !p.voided);
  const unmatched = d.notes.filter((n) => n.status === 'unmatched');
  const reports = d.reports.filter((r) => r.status === 'open');
  const sent = d.inv.filter((i) => i.status === 'sent' && i.state.owing_cents > 0);
  const invLabel = (i) => `#${i.number} – ${i.bill_name} (owing ${R.money(i.state.owing_cents)})`;
  ctx.show(html`<h1 class="h2">Payments</h1>
    <div class="button-row">
      <a class="button button--primary" href="#/payments/record">Record a payment</a>
      <a class="button button--outline" href="#/payments/import">Import payments</a>
      ${isDemo ? html`<button class="button button--outline" id="simulate">Demo: simulate a portal payment</button>` : ''}
    </div>
    <h2 class="h3">Auto-matched – quick double-check <span class="count">${review.length}</span></h2>
    ${table(review, [
      { label: 'Invoice', cell: (p) => html`<a href="#/invoices/${p.invoice_id}">#${d.byId[p.invoice_id]?.number}</a> ${d.byId[p.invoice_id]?.bill_name}` },
      { label: 'Amount', cell: (p) => R.money(p.amount_cents), cls: 'num' },
      { label: 'Paid', cell: (p) => R.longDate(p.paid_at) },
      { label: 'From', cell: (p) => html`${p.source}${p.payer_email ? html`<br><small>${p.payer_email}</small>` : ''}` },
      { label: 'Reference', cell: (p) => p.reference || '—' },
      { label: 'Action', cell: (p) => html`<div class="button-row button-row--tight"><button class="button button--text" data-ok="${p.id}">Looks right</button><button class="button button--text" data-void="${p.id}">Void</button></div>` },
    ], { caption: 'Auto-matched payments', empty: 'Nothing to check.' })}
    <h2 class="h3">Unmatched payments <span class="count">${unmatched.length}</span></h2>
    ${table(unmatched, [
      { label: 'Received', cell: (n) => R.dateTime(n.received_at) },
      { label: 'Amount', cell: (n) => R.money(n.amount_cents), cls: 'num' },
      { label: 'Payer', cell: (n) => html`${n.payer_name || ''} ${n.organization ? html`<br><small>${n.organization}</small>` : ''}${n.payer_email ? html`<br><small>${n.payer_email}</small>` : ''}` },
      { label: 'Reference', cell: (n) => n.reference || '—' },
      { label: 'Why', cell: (n) => n.reason },
      { label: 'Action', cell: (n) => html`<div class="button-row button-row--tight"><button class="button button--text" data-assign="${n.id}">Assign to invoice</button><button class="button button--text" data-ignore="${n.id}">Ignore</button></div>` },
    ], { caption: 'Unmatched payment notifications', empty: 'No unmatched payments.' })}
    <h2 class="h3">Vendor reports – “I’ve paid, but it’s not showing” <span class="count">${reports.length}</span></h2>
    ${table(reports, [
      { label: 'Invoice', cell: (r) => html`<a href="#/invoices/${r.invoice_id}">#${d.byId[r.invoice_id]?.number}</a> ${d.byId[r.invoice_id]?.bill_name}` },
      { label: 'Amount', cell: (r) => R.money(r.amount_cents), cls: 'num' },
      { label: 'Paid on', cell: (r) => R.longDate(r.paid_on) },
      { label: 'Note', cell: (r) => html`${r.note || ''}${r.payer_email ? html`<br><small>${r.payer_email}</small>` : ''}` },
      { label: 'Action', cell: (r) => html`<div class="button-row button-row--tight"><button class="button button--text" data-confirm="${r.id}">Confirm and record</button><button class="button button--text" data-reject="${r.id}">Not found</button></div>` },
    ], { caption: 'Vendor payment reports', empty: 'No open reports.' })}
    <h2 class="h3">Recent payments</h2>
    ${table(d.payments.slice(0, 25), [
      { label: 'Date', cell: (p) => R.shortDate(p.paid_at) },
      { label: 'Invoice', cell: (p) => html`<a href="#/invoices/${p.invoice_id}">#${d.byId[p.invoice_id]?.number}</a>` },
      { label: 'Amount', cell: (p) => R.money(p.amount_cents), cls: 'num' },
      { label: 'Received', cell: (p) => html`${p.received_label}${p.voided ? html` ${badge('void', 'Voided')}` : ''}` },
      { label: 'Receipt', cell: (p) => d.receipts.find((r) => r.payment_id === p.id)?.number || '—' },
    ], { caption: 'Recent payments', empty: 'No payments yet.' })}`, 'Payments');

  ctx.view.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    try {
      if (b.id === 'simulate') {
        const target = sent[0];
        const v = await formDialog({ title: 'Simulate a Last Door portal payment', submit: 'Send notification', body: html`
          <p>On the live site, the Last Door payment page tells us about each payment automatically. Try it here:</p>
          ${field({ label: 'Reference typed by the payer', name: 'reference', value: target ? target.number : 'Recovery Day booth' })}
          ${field({ label: 'Amount ($)', name: 'amount', value: target ? R.plainAmount(target.state.due_now_cents) : '100.00' })}
          ${field({ label: 'Payer email', name: 'payer_email', type: 'email', value: target?.bill_email || '' })}` });
        if (!v) return;
        const r = await api.fn('demo-payment', { reference: v.reference, amount_cents: R.parseMoney(v.amount), payer_email: v.payer_email, payer_name: 'Demo payer', external_id: `pi_demo_${Date.now()}` });
        toast(r.status === 'matched' ? `Matched to #${r.invoice}. Receipt ${r.receipt} created and emailed.` : `Not matched: ${r.reason || r.status}. It’s in the Unmatched queue.`, r.status === 'matched' ? 'ok' : 'error');
        return payments([]);
      }
      if (b.dataset.ok) { await api.update('payments', { id: b.dataset.ok }, { needs_review: false }); toast('Marked as checked.'); return payments([]); }
      if (b.dataset.void) return voidPayment(b.dataset.void);
      if (b.dataset.ignore) {
        if (!(await confirmDialog('Ignore notification', 'Ignore this notification? Use this for test payments or payments that aren’t for Recovery Day.', { submit: 'Ignore' }))) return;
        await api.update('payment_notifications', { id: b.dataset.ignore }, { status: 'ignored' }); return payments([]);
      }
      if (b.dataset.assign) {
        const n = d.notes.find((x) => x.id === b.dataset.assign);
        const v = await formDialog({ title: 'Assign payment to an invoice', submit: 'Record payment', body: html`
          <p>${R.money(n.amount_cents)} from ${n.payer_name || n.payer_email || 'unknown'} (reference “${n.reference || ''}”).</p>
          ${field({ label: 'Invoice', name: 'invoice', type: 'select', required: true, options: [['', 'Choose…'], ...sent.map((i) => [i.id, invLabel(i)])] })}
          ${field({ label: 'Amount to apply ($)', name: 'amount', value: R.plainAmount(n.amount_cents), required: true })}` });
        if (!v) return;
        const rec = await api.rpc('record_payment', { p: { invoice_id: v.invoice, amount_cents: R.parseMoney(v.amount), method: 'card', received_label: 'Paid Visa LD',
          paid_at: String(n.paid_at || '').slice(0, 10) || R.todayInEdmonton(), reference: n.external_id || n.reference, source: n.source === 'import' ? 'import' : n.source, external_id: n.external_id, payer_name: n.payer_name, payer_email: n.payer_email } });
        await api.update('payment_notifications', { id: n.id }, { status: 'assigned', invoice_id: v.invoice });
        await emailReceiptFor(v.invoice);
        toast(`Recorded. Receipt ${rec} emailed.`); return payments([]);
      }
      if (b.dataset.confirm) {
        const r = d.reports.find((x) => x.id === b.dataset.confirm);
        const v = await formDialog({ title: 'Confirm vendor payment', submit: 'Record payment', body: html`
          <p>Only confirm once you’ve seen the money in the Last Door account.</p>
          ${field({ label: 'Amount ($)', name: 'amount', value: R.plainAmount(r.amount_cents), required: true })}
          ${field({ label: 'Date paid', name: 'paid_at', type: 'date', value: r.paid_on, required: true })}
          ${field({ label: 'Received (column M)', name: 'label', type: 'select', value: 'Paid Visa LD', options: R.RECEIVED_OPTIONS.filter((x) => x !== 'Cancelled') })}
          ${field({ label: 'Reference', name: 'reference' })}` });
        if (!v) return;
        const rec = await api.rpc('record_payment', { p: { invoice_id: r.invoice_id, amount_cents: R.parseMoney(v.amount), method: methodFromLabel(v.label), received_label: v.label, paid_at: v.paid_at, reference: v.reference || null, source: 'vendor_report', payer_email: r.payer_email } });
        await api.update('payment_reports', { id: r.id }, { status: 'confirmed', resolved_by: ctx.me.user.id });
        await emailReceiptFor(r.invoice_id);
        toast(`Recorded. Receipt ${rec} emailed.`); return payments([]);
      }
      if (b.dataset.reject) {
        if (!(await confirmDialog('Payment not found', 'Mark this report as “not found”? Please also email the vendor to ask for more details.', { submit: 'Mark not found' }))) return;
        await api.update('payment_reports', { id: b.dataset.reject }, { status: 'rejected', resolved_by: ctx.me.user.id }); return payments([]);
      }
    } catch (ex) { showError(ex); }
  };
}

function methodFromLabel(label) {
  if (/chq|cheque/i.test(label)) return 'cheque';
  if (/visa|card|mastercard/i.test(label)) return 'card';
  if (/cash/i.test(label)) return 'cash';
  if (/e.?transfer/i.test(label)) return 'etransfer';
  return 'other';
}

async function emailReceiptFor(invoiceId) {
  const [last] = await api.list('payments', { eq: { invoice_id: invoiceId }, order: 'created_at', asc: false, limit: 1 });
  if (last) await api.fn('mailer', { action: 'send_receipt', payment_id: last.id }).catch(showError);
}

async function voidPayment(id) {
  const v = await formDialog({ title: 'Void payment', submit: 'Void payment', danger: true, body: html`<p>The payment stays in the records but no longer counts. Its receipt is kept for the audit trail.</p>
    ${field({ label: 'Reason', name: 'reason', type: 'textarea', required: true })}` });
  if (!v) return;
  try { await api.rpc('void_payment', { p_payment: id, p_reason: v.reason }); toast('Payment voided.'); payments([]); } catch (e) { showError(e); }
}

// ---- Record a manual payment ------------------------------------------------
async function record(invoiceId) {
  const d = await loadAll();
  const sent = d.inv.filter((i) => i.status === 'sent' && i.state.owing_cents > 0);
  const pre = d.byId[invoiceId];
  ctx.show(html`<p><a href="#/payments">← Payments</a></p><h1 class="h2">Record a payment</h1>
    <p>For cheques, e-transfers, cash, or a card payment taken by phone. A numbered receipt is created and emailed.</p>
    <form id="pay" class="stack narrow" novalidate>
      ${field({ label: 'Invoice', name: 'invoice', type: 'select', required: true, value: invoiceId || '', options: [['', 'Choose…'], ...sent.map((i) => [i.id, `#${i.number} – ${i.bill_name} (owing ${R.money(i.state.owing_cents)})`])] })}
      ${field({ label: 'Amount ($)', name: 'amount', required: true, value: pre ? R.plainAmount(pre.state.due_now_cents) : '', attrs: 'inputmode="decimal"' })}
      ${field({ label: 'Date received', name: 'paid_at', type: 'date', required: true, value: R.todayInEdmonton() })}
      ${field({ label: 'Method', name: 'method', type: 'select', value: 'cheque', options: METHODS })}
      ${field({ label: 'Received (column M on the sponsor sheet)', name: 'label', type: 'select', value: 'Paid Chq LD', options: R.RECEIVED_OPTIONS.filter((x) => x !== 'Cancelled') })}
      ${field({ label: 'Reference (cheque #, e-transfer ref…)', name: 'reference', attrs: 'maxlength="120"' })}
      ${field({ label: 'Email the receipt', name: 'email', type: 'select', value: 'yes', options: [['yes', 'Yes'], ['no', 'No, I’ll send it later']] })}
      <p class="form-error" role="alert" hidden></p>
      <button class="button button--primary" type="submit">Record payment</button></form>`, 'Record payment');
  const f = $('#pay');
  f.method.addEventListener('change', () => { f.label.value = R.receivedLabelFor(f.method.value); });
  f.invoice.addEventListener('change', () => { const i = d.byId[f.invoice.value]; if (i) f.amount.value = R.plainAmount(i.state.due_now_cents); });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = f.querySelector('.form-error');
    const cents = R.parseMoney(f.amount.value);
    if (!f.invoice.value || Number.isNaN(cents) || cents <= 0) { err.hidden = false; err.textContent = 'Please choose the invoice and enter the amount.'; return; }
    await busy(e.submitter, async () => {
      const rec = await api.rpc('record_payment', { p: { invoice_id: f.invoice.value, amount_cents: cents, method: f.method.value, received_label: f.label.value, paid_at: f.paid_at.value, reference: f.reference.value || null, source: 'manual' } });
      if (f.email.value === 'yes') await emailReceiptFor(f.invoice.value);
      toast(`Payment recorded. Receipt ${rec}${f.email.value === 'yes' ? ' emailed' : ''}.`);
      location.hash = `#/invoices/${f.invoice.value}`;
    });
  });
}

// ---- Import -----------------------------------------------------------------
async function importer() {
  ctx.show(html`<p><a href="#/payments">← Payments</a></p><h1 class="h2">Import payments</h1>
    <p>Upload either:</p>
    <ul><li>a <strong>payment report</strong> (CSV or Excel) with columns like Invoice, Amount, Date, Email, Method, or</li>
      <li>the shared <strong>sponsor sheet</strong> in the 2026 layout – we read column C “Invoice #” and column M “Received”.</li></ul>
    <p>Nothing changes until you check the preview and press Apply.</p>
    <div class="field"><label for="imp-file">File (CSV or XLSX)</label><input id="imp-file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></div>
    <div id="preview"></div>`, 'Import payments');
  $('#imp-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return showError(new Error('That file is larger than 10 MB.'));
    try {
      const { readTable, toPaymentRows } = await import('../lib/excel.js');
      const t = await readTable(file);
      const sheet = t.sheets.find((s) => /^20\d\d$/.test(s.name.trim())) || t.sheets[0];
      const parsed = toPaymentRows(sheet.rows);
      await preview(parsed, sheet.name);
    } catch (ex) { showError(ex); }
  });
}

async function preview(parsed, sheetName) {
  const d = await loadAll();
  const s = ctx.ref.settings.invoice || {};
  const byNumber = Object.fromEntries(d.inv.map((i) => [i.number, i]));
  const plan = [];
  for (const r of parsed.rows) {
    const num = R.normalizeInvoiceNumber(String(r.reference || ''), s.prefix, s.digits);
    let inv = num ? byNumber[num] : null;
    const p = { line: r.line, ref: r.reference, inv, action: null, why: '' };
    if (parsed.format === 'sponsor') {
      const label = r.received;
      if (!inv) { p.why = num ? `Invoice ${num} not found` : 'No invoice number'; plan.push(p); continue; }
      if (!label) { p.why = 'Column M is empty – nothing to do'; p.skip = true; plan.push(p); continue; }
      if (/cancel/i.test(label)) { p.why = 'Marked Cancelled – use Cancel / refund on the invoice so the refund is calculated'; p.flag = true; plan.push(p); continue; }
      if (/deposit/i.test(label)) {
        const need = inv.state.deposit_owing_cents;
        if (need > 0) Object.assign(p, { action: 'pay', amount: need, label: 'Deposit paid', method: 'other' }); else { p.why = 'Deposit already recorded'; p.skip = true; }
        plan.push(p); continue;
      }
      if (/^paid/i.test(label)) {
        if (inv.state.owing_cents > 0) Object.assign(p, { action: 'pay', amount: inv.state.owing_cents, label: R.RECEIVED_OPTIONS.find((o) => o.toLowerCase() === label.toLowerCase()) || label, method: methodFromLabel(label) });
        else { p.why = 'Already paid in full'; p.skip = true; }
        plan.push(p); continue;
      }
      p.why = `Unknown “Received” value: ${label}`; plan.push(p); continue;
    }
    // payment report
    const cents = R.parseMoney(String(r.amount || ''));
    if (!inv && r.email) {
      const c = d.inv.filter((i) => i.status === 'sent' && (i.bill_email || '').toLowerCase() === String(r.email).toLowerCase() && i.state.owing_cents === cents);
      if (c.length === 1) inv = c[0];
    }
    p.inv = inv;
    if (!inv) { p.why = num ? `Invoice ${num} not found` : 'No invoice number (and no unique email + amount match)'; plan.push(p); continue; }
    if (Number.isNaN(cents) || cents <= 0) { p.why = 'Amount missing'; plan.push(p); continue; }
    if (inv.status !== 'sent') { p.why = `Invoice is ${inv.status}`; plan.push(p); continue; }
    if (r.external_id && d.payments.some((x) => x.external_id === String(r.external_id))) { p.why = 'Already imported (same payment id)'; p.skip = true; plan.push(p); continue; }
    if (cents > inv.state.owing_cents) { p.why = `More than the ${R.money(inv.state.owing_cents)} owing`; plan.push(p); continue; }
    const date = /^\d{4}-\d{2}-\d{2}/.test(String(r.date)) ? String(r.date).slice(0, 10) : R.todayInEdmonton();
    const method = methodFromLabel(String(r.method || ''));
    Object.assign(p, { action: 'pay', amount: cents, date, method, label: R.receivedLabelFor(method), external_id: r.external_id ? String(r.external_id) : null });
    plan.push(p);
  }
  const todo = plan.filter((p) => p.action);
  setHTML($('#preview'), html`<h2 class="h3">Preview – ${sheetName} (${parsed.format === 'sponsor' ? 'sponsor sheet' : 'payment report'})</h2>
    <p><strong>${todo.length}</strong> payments will be recorded · ${plan.filter((p) => !p.action && !p.skip).length} rows need attention · ${plan.filter((p) => p.skip).length} skipped</p>
    ${table(plan, [
      { label: 'Row', cell: (p) => p.line },
      { label: 'Invoice', cell: (p) => (p.inv ? `#${p.inv.number} ${p.inv.bill_name}` : String(p.ref || '—')) },
      { label: 'Change', cell: (p) => (p.action ? html`${badge('ok', 'Record')} ${R.money(p.amount)} · ${p.label}` : p.skip ? badge('neutral', 'Skip') : badge('bad', 'Check')) },
      { label: 'Note', cell: (p) => p.why || '' },
    ], { caption: 'Import preview', rowClass: (p) => (p.action ? '' : p.skip ? 'row--muted' : 'row--flag') })}
    ${todo.length ? html`<button class="button button--primary" id="apply">Apply ${todo.length} payments</button>` : ''}`);
  $('#apply')?.addEventListener('click', (e) => busy(e.target, async () => {
    let ok = 0; const errors = [];
    for (const p of todo) {
      try {
        await api.rpc('record_payment', { p: { invoice_id: p.inv.id, amount_cents: p.amount, method: p.method, received_label: p.label, paid_at: p.date || R.todayInEdmonton(), reference: `Import row ${p.line}`, source: 'import', external_id: p.external_id || null } });
        ok++;
      } catch (ex) { errors.push(`Row ${p.line}: ${ex.message}`); }
    }
    toast(`${ok} payments recorded.${errors.length ? ` ${errors.length} failed: ${errors.join('; ')}` : ''} Receipts can be emailed from each invoice.`, errors.length ? 'error' : 'ok');
    location.hash = '#/payments';
  }));
}

// ---- Cancellation & refund calculator --------------------------------------
async function refund(invoiceId) {
  const { ref } = ctx;
  const inv = await api.get('invoices', invoiceId);
  if (!inv) return ctx.show(html`<p class="notice notice--error">Invoice not found.</p>`);
  const [lines, pays, refs] = await Promise.all([api.list('invoice_lines', { eq: { invoice_id: invoiceId } }), api.list('payments', { eq: { invoice_id: invoiceId } }), api.list('refunds', { eq: { invoice_id: invoiceId } })]);
  const st = R.invoiceState(inv, pays.filter((p) => !p.voided), refs);
  const calc = (date) => R.calculateRefund({ lines, paidCents: st.paid_cents, cities: ref.cities, cancelDate: date, settings: ref.settings });
  const today = R.todayInEdmonton();
  let c = calc(today);
  const r = ref.settings.refund_rules || {};
  ctx.show(html`<p><a href="#/invoices/${invoiceId}">← Invoice #${inv.number}</a></p>
    <h1 class="h2">Cancel and refund #${inv.number}</h1>
    <p>${inv.bill_name} · paid ${R.money(st.paid_cents)} of ${R.money(inv.total_cents)}</p>
    <div class="policy-box"><h2 class="h4">Rules used</h2><ul>
      <li>${r.full_refund_days ?? 30}+ days before the event: everything refunded.</li>
      <li>14–29 days: rentals refunded; booths ${r.booth_14_29 === 'minus_deposit' ? 'refunded minus the deposit' : 'not refunded'}; sponsorships ${r.sponsor_14_29 === 'full' ? 'refunded' : r.sponsor_14_29 === 'minus_deposit' ? 'refunded minus the deposit' : 'not refunded'}.</li>
      <li>Less than 14 days: no refund.</li></ul></div>
    <form id="refund" class="stack narrow" novalidate>
      ${field({ label: 'Cancellation date', name: 'cancel_date', type: 'date', value: today, required: true, hint: 'The day the vendor asked to cancel.' })}
      <div id="calc" class="card" aria-live="polite"></div>
      ${field({ label: 'Refund amount ($)', name: 'amount', value: R.plainAmount(c.refund_cents), required: true })}
      ${field({ label: 'Why is it different from the calculated amount? (required if you change it)', name: 'override_note', type: 'textarea' })}
      ${field({ label: 'Reason for cancelling', name: 'reason', type: 'textarea' })}
      ${field({ label: 'Date the refund was sent (leave empty if not yet)', name: 'refunded_at', type: 'date' })}
      <p class="form-error" role="alert" hidden></p>
      <button class="button button--danger" type="submit">Cancel booking and record refund</button>
    </form>`, 'Refund');
  const f = $('#refund');
  const showCalc = () => {
    c = calc(f.cancel_date.value || today);
    setHTML($('#calc'), html`<p><strong>Calculated refund: ${R.money(c.refund_cents)}</strong> (keep ${R.money(c.retained_cents)})</p><ul class="small">${c.explanation.map((x) => html`<li>${x}</li>`)}</ul>`);
    f.amount.value = R.plainAmount(c.refund_cents);
  };
  showCalc();
  f.cancel_date.addEventListener('change', showCalc);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = R.parseMoney(f.amount.value);
    const err = f.querySelector('.form-error');
    if (Number.isNaN(amount)) { err.hidden = false; err.textContent = 'Please enter the refund amount (0.00 for none).'; return; }
    if (!(await confirmDialog('Cancel booking', `Cancel #${inv.number} and record a refund of ${R.money(amount)}? Their booth will be released and the vendor emailed.`, { submit: 'Yes, cancel', danger: true }))) return;
    await busy(e.submitter, async () => {
      try {
        const id = await api.rpc('record_refund', { p: { invoice_id: invoiceId, amount_cents: amount, calculated_cents: c.refund_cents, override_note: f.override_note.value || null, reason: f.reason.value || null, cancel_date: f.cancel_date.value, refunded_at: f.refunded_at.value || null } });
        const m = await api.fn('mailer', { action: 'refund_confirmation', refund_id: id });
        toast(m?.note || 'Cancelled and refund recorded.');
        location.hash = `#/invoices/${invoiceId}`;
      } catch (ex) { err.hidden = false; err.textContent = ex.message; }
    });
  });
}

// =============================================================================
// SHARED BUSINESS RULES  (plain JavaScript, no dependencies)
// =============================================================================
// This one file is used by BOTH the website (admin + vendor portal) and the
// Supabase Edge Functions, so invoices, deposits, refunds, payment matching and
// the volunteer auto-scheduler always follow exactly the same rules.
//
// Nothing year-specific lives here: prices, dates, deposit size, refund rules,
// invoice prefix, pay-link template etc. all come from the `settings`,
// `cities` and `products` tables (editable in Admin → Settings).
//
// Money is always whole CENTS (integers) to avoid rounding errors. CAD. No GST.
// Dates are 'YYYY-MM-DD' strings in America/Edmonton.
// =============================================================================

export const TIME_ZONE = 'America/Edmonton';

// ---------------------------------------------------------------------------
// Money and dates
// ---------------------------------------------------------------------------

/** 89500 -> "$895.00" (always 2 decimals, CAD). */
export function money(cents) {
  const n = Math.round(Number(cents) || 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const dollars = Math.floor(abs / 100).toLocaleString('en-CA');
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
}

/** "895", "895.5", "$1,234.56" -> cents. Returns NaN when not a number. */
export function parseMoney(text) {
  if (typeof text === 'number') return Math.round(text * 100);
  const clean = String(text ?? '').replace(/[$,\s]/g, '').replace(/CAD/i, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(clean)) return NaN;
  return Math.round(parseFloat(clean) * 100);
}

/** 89500 -> "895.00" (for pay links / spreadsheets). */
export function plainAmount(cents) {
  return (Math.round(cents) / 100).toFixed(2);
}

/** Today's date in Edmonton as 'YYYY-MM-DD'. */
export function todayInEdmonton(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function toUtcNoon(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d, 12);
}

/** Whole days from `from` to `to` (both 'YYYY-MM-DD'). to - from. */
export function daysBetween(from, to) {
  return Math.round((toUtcNoon(to) - toUtcNoon(from)) / 86400000);
}

/** 'YYYY-MM-DD' + n days. */
export function addDays(ymd, n) {
  const d = new Date(toUtcNoon(ymd) + n * 86400000);
  return d.toISOString().slice(0, 10);
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** '2026-07-29' -> "July 29th, 2026" (the 2026 invoice style). */
export function longDate(ymd) {
  if (!ymd) return '';
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-CA', { month: 'long', timeZone: 'UTC' });
  return `${month} ${ordinal(d)}, ${y}`;
}

/** '2027-09-18' -> "Sat, Sep 18, 2027". */
export function shortDate(ymd) {
  if (!ymd) return 'Date to be announced';
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

/** ISO timestamp -> "Sep 18, 2027, 2:05 p.m." in Edmonton time. */
export function dateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-CA', {
    timeZone: TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/** Minutes after midnight -> "8:30 am". */
export function clock(min) {
  if (min == null) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = ((h + 11) % 12) + 1;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

/** settings rows [{key, value}] -> { key: value } */
export function settingsMap(rows) {
  const out = {};
  for (const r of rows || []) out[r.key] = r.value;
  return out;
}

export const DEFAULT_PAYMENT_RULES = {
  deposit_cents: 10000,
  deposit_applies_to: ['booth'], // product kinds that need a deposit
  food_truck_deposit: true,
  balance_due_days_before: 14,
};

export const DEFAULT_REFUND_RULES = {
  full_refund_days: 30,      // 30+ days before: everything refunded
  rentals_refund_days: 14,   // rentals refundable until 14 days before
  no_refund_days: 14,        // fewer than 14 days: nothing refunded
  booth_14_29: 'minus_deposit', // 'minus_deposit' | 'none'
  sponsor_14_29: 'none',        // 'none' | 'full' | 'minus_deposit'
};

// ---------------------------------------------------------------------------
// Invoice building (runs when an admin accepts an application)
// ---------------------------------------------------------------------------

/**
 * Build the DRAFT invoice for an accepted application.
 * @param {object} p
 * @param {Array} p.items     application_items rows
 * @param {Array} p.products  products rows (code, name, kind, price_cents, invoice_label, deposit)
 * @param {Array} p.cities    cities rows (id, name, event_date)
 * @param {object} p.settings settingsMap()
 * @param {string} [p.issueDate] 'YYYY-MM-DD' (defaults to today in Edmonton)
 * @returns {{lines: Array, total_cents: number, deposit_cents: number, balance_due: string|null, earliest_event: string|null}}
 */
export function buildInvoiceDraft({ items, products, cities, settings, issueDate }) {
  const rules = { ...DEFAULT_PAYMENT_RULES, ...(settings?.payment_rules || {}) };
  const byCode = Object.fromEntries((products || []).map((p) => [p.code, p]));
  const cityById = Object.fromEntries((cities || []).map((c) => [c.id, c]));
  const tent = byCode.tent;
  const table = byCode.table;
  const chairs = byCode.chairs_pair;
  const lines = [];
  let deposit = 0;
  let sort = 0;
  const eventDates = [];

  const ordered = [...(items || [])].sort((a, b) => (cityById[a.city_id]?.sort ?? 0) - (cityById[b.city_id]?.sort ?? 0));
  for (const item of ordered) {
    const product = byCode[item.product_code];
    const city = cityById[item.city_id];
    if (!product || !city) continue;
    if (city.event_date) eventDates.push(city.event_date);
    const label = (product.invoice_label || product.name).replace('{sub}', item.sub_type || 'Vendor');
    const isBooth = product.kind === 'booth';
    lines.push({
      sort: sort++,
      line_type: product.kind,
      product_code: product.code,
      city_id: city.id,
      description: `${label} – Recovery Day ${city.name}`,
      detail: isBooth ? '(booth space only, not a sponsorship; tent, table and chairs not included)' : '',
      quantity: 1,
      amount_cents: product.price_cents,
    });
    const needsDeposit =
      product.deposit !== false &&
      (rules.deposit_applies_to || []).includes(product.kind) &&
      !(product.code === 'food_truck' && rules.food_truck_deposit === false);
    if (needsDeposit) deposit += rules.deposit_cents;

    if (isBooth) {
      const t = Number(item.tents) || 0;
      const tb = Number(item.tables) || 0;
      const cp = Number(item.chair_pairs) || 0;
      const rentalTotal = t * (tent?.price_cents || 0) + tb * (table?.price_cents || 0) + cp * (chairs?.price_cents || 0);
      if (rentalTotal > 0) {
        lines.push({
          sort: sort++,
          line_type: 'rental',
          product_code: 'rentals',
          city_id: city.id,
          description: `Tent 10'x10' (${t}) Table (${tb}) Chairs (${cp * 2})`,
          detail: `Rentals – Recovery Day ${city.name}`,
          quantity: 1,
          amount_cents: rentalTotal,
        });
      }
    }
  }
  const total = lines.reduce((s, l) => s + l.amount_cents, 0);
  const earliest = eventDates.sort()[0] || null;
  const today = issueDate || todayInEdmonton();
  let balanceDue = earliest ? addDays(earliest, -rules.balance_due_days_before) : null;
  // Accepted fewer than 14 days before the event: everything due right away.
  if (balanceDue && balanceDue < today) balanceDue = today;
  if (balanceDue && balanceDue <= today) deposit = total; // full amount due now
  return {
    lines,
    total_cents: total,
    deposit_cents: Math.min(deposit, total),
    balance_due: balanceDue,
    earliest_event: earliest,
  };
}

/** Recalculate deposit + due date for an invoice whose lines an admin edited. */
export function recalcInvoice(lines, { settings, cities, issueDate }) {
  const rules = { ...DEFAULT_PAYMENT_RULES, ...(settings?.payment_rules || {}) };
  const cityById = Object.fromEntries((cities || []).map((c) => [c.id, c]));
  const total = lines.reduce((s, l) => s + (Number(l.amount_cents) || 0), 0);
  let deposit = 0;
  const dates = [];
  for (const l of lines) {
    if (l.city_id && cityById[l.city_id]?.event_date) dates.push(cityById[l.city_id].event_date);
    if (l.line_type === 'booth' && !(l.product_code === 'food_truck' && rules.food_truck_deposit === false)) {
      deposit += rules.deposit_cents;
    }
  }
  const earliest = dates.sort()[0] || null;
  const today = issueDate || todayInEdmonton();
  let balanceDue = earliest ? addDays(earliest, -rules.balance_due_days_before) : null;
  if (balanceDue && balanceDue < today) balanceDue = today;
  if (balanceDue && balanceDue <= today) deposit = total;
  return { total_cents: total, deposit_cents: Math.max(0, Math.min(deposit, total)), balance_due: balanceDue };
}

// ---------------------------------------------------------------------------
// Invoice state (status shown to vendors and staff)
// ---------------------------------------------------------------------------

/**
 * @param {object} invoice  invoices row (status, total_cents, deposit_cents, balance_due, sent_at)
 * @param {Array} payments  payments rows for this invoice (amount_cents, received_label, paid_at)
 * @param {Array} refunds   refunds rows for this invoice (amount_cents)
 * @param {string} [today]
 */
export function invoiceState(invoice, payments = [], refunds = [], today = todayInEdmonton()) {
  const paid = payments.filter((p) => !p.voided).reduce((s, p) => s + p.amount_cents, 0);
  const refunded = refunds.reduce((s, r) => s + r.amount_cents, 0);
  const total = invoice.total_cents || 0;
  const owing = Math.max(0, total - paid);
  const depositOwing = Math.max(0, (invoice.deposit_cents || 0) - paid);
  let code;
  if (invoice.status === 'draft') code = 'draft';
  else if (invoice.status === 'void') code = 'void';
  else if (refunded > 0 && invoice.status === 'cancelled') code = 'refunded';
  else if (invoice.status === 'cancelled') code = 'cancelled';
  else if (paid >= total && total > 0) code = 'paid';
  else if (invoice.balance_due && today > invoice.balance_due && owing > 0) code = 'overdue';
  else if (paid > 0 && depositOwing === 0) code = 'deposit_paid';
  else if (paid > 0) code = 'partial';
  else code = 'deposit_due';
  const labels = {
    draft: 'Draft – not sent',
    void: 'Void',
    refunded: 'Refunded',
    cancelled: 'Cancelled',
    paid: 'Paid in full',
    overdue: 'Overdue',
    deposit_paid: 'Deposit paid',
    partial: 'Partly paid',
    deposit_due: invoice.deposit_cents && invoice.deposit_cents < total ? 'Deposit due' : 'Payment due',
  };
  return {
    code,
    label: labels[code],
    paid_cents: paid,
    refunded_cents: refunded,
    owing_cents: code === 'cancelled' || code === 'refunded' || code === 'void' ? 0 : owing,
    deposit_owing_cents: depositOwing,
    due_now_cents: depositOwing > 0 ? depositOwing : owing,
  };
}

/** Col M "Received" text for the sponsor master sheet. */
export function receivedText(invoice, payments = [], refunds = []) {
  if (!invoice) return '';
  const st = invoiceState(invoice, payments, refunds);
  if (st.code === 'refunded') return `Refunded ${money(st.refunded_cents)}`;
  if (st.code === 'cancelled') return 'Cancelled';
  if (st.code === 'paid') {
    const last = [...payments].filter((p) => !p.voided).sort((a, b) => String(a.paid_at).localeCompare(String(b.paid_at))).pop();
    return last?.received_label || 'Paid';
  }
  if (st.code === 'deposit_paid' || st.code === 'partial') return 'Deposit paid';
  return '';
}

export const RECEIVED_OPTIONS = ['Paid Visa LD', 'Paid Chq LD', 'Paid Cash', 'Paid E-transfer LD', 'Paid EFT LD', 'Deposit paid', 'Cancelled'];

/** Method -> col M label. */
export function receivedLabelFor(method) {
  return {
    card: 'Paid Visa LD',
    cheque: 'Paid Chq LD',
    cash: 'Paid Cash',
    etransfer: 'Paid E-transfer LD',
    other: 'Paid EFT LD',
  }[method] || 'Paid Visa LD';
}

// ---------------------------------------------------------------------------
// Pay link (Last Door payment portal, no payment processor on our side)
// ---------------------------------------------------------------------------

/**
 * @param {string} template URL template from Settings, e.g. '...?reference={invoice}&amount={amount}'
 * @param {{invoice?: string, amountCents?: number, org?: string, name?: string, email?: string, phone?: string}} v
 */
export function buildPayLink(template, { invoice, amountCents, org, name, email, phone }) {
  const tpl = template || 'https://lastdoor.org/pay-for-invoice/';
  const [first, ...rest] = String(name || '').trim().split(/\s+/);
  const vars = {
    invoice: invoice || '',
    amount: plainAmount(amountCents || 0),
    org: org || '',
    name: name || '',
    first_name: first || '',
    last_name: rest.join(' '),
    email: email || '',
    phone: phone || '',
  };
  return tpl.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(vars[k] ?? ''));
}

// ---------------------------------------------------------------------------
// Refund calculator (Section 3.3 of the spec; rules editable in Settings)
// ---------------------------------------------------------------------------

/**
 * @param {object} p
 * @param {Array}  p.lines     invoice_lines
 * @param {number} p.paidCents total paid so far
 * @param {Array}  p.cities    cities rows
 * @param {string} p.cancelDate 'YYYY-MM-DD'
 * @param {object} p.settings  settingsMap()
 * @returns {{refund_cents:number, retained_cents:number, days_before:number|null, explanation:string[]}}
 */
export function calculateRefund({ lines, paidCents, cities, cancelDate, settings }) {
  const r = { ...DEFAULT_REFUND_RULES, ...(settings?.refund_rules || {}) };
  const pay = { ...DEFAULT_PAYMENT_RULES, ...(settings?.payment_rules || {}) };
  const cityById = Object.fromEntries((cities || []).map((c) => [c.id, c]));
  const explanation = [];
  let entitled = 0;
  let total = 0;
  let minDays = null;
  for (const l of lines || []) {
    const amt = Number(l.amount_cents) || 0;
    total += amt;
    const ev = cityById[l.city_id]?.event_date;
    if (!ev) { entitled += amt; explanation.push(`${l.description}: no event date set, refundable.`); continue; }
    const days = daysBetween(cancelDate, ev);
    minDays = minDays == null ? days : Math.min(minDays, days);
    let e = 0;
    if (days >= r.full_refund_days) e = amt;
    else if (days < r.no_refund_days) e = 0;
    else if (l.line_type === 'rental') e = days >= r.rentals_refund_days ? amt : 0;
    else if (l.line_type === 'booth') e = r.booth_14_29 === 'minus_deposit' ? Math.max(0, amt - pay.deposit_cents) : 0;
    else if (l.line_type === 'sponsorship') {
      e = r.sponsor_14_29 === 'full' ? amt : r.sponsor_14_29 === 'minus_deposit' ? Math.max(0, amt - pay.deposit_cents) : 0;
    } else e = amt < 0 ? amt : 0; // discounts reduce the refund; custom lines kept
    entitled += e;
    explanation.push(`${l.description}: ${days} days before the event, ${money(e)} of ${money(amt)} refundable.`);
  }
  const retained = Math.max(0, total - entitled);
  const refund = Math.max(0, (paidCents || 0) - retained);
  explanation.push(`Paid ${money(paidCents || 0)}, kept ${money(Math.min(retained, paidCents || 0))}, refund ${money(refund)}.`);
  return { refund_cents: refund, retained_cents: Math.min(retained, paidCents || 0), days_before: minDays, explanation };
}

// ---------------------------------------------------------------------------
// Payment matching (webhook, inbound email, imports)
// ---------------------------------------------------------------------------

/**
 * "#2027CD001", "2027-CD-001", "2027cd1", "CD001", "Invoice 2027CD001" -> "2027CD001"
 * (prefix from settings). The year part is optional; letters must be whole.
 */
export function normalizeInvoiceNumber(text, prefix = '2027CD', digits = 3) {
  if (!text) return null;
  const clean = prefix.replace(/[^A-Za-z0-9]/g, '');
  const [, year = '', letters = clean] = clean.match(/^(\d*)([A-Za-z]*)$/) || [];
  const sep = '[\\s#-]*';
  const re = new RegExp(`(?:^|[^A-Za-z0-9])(?:${year}${sep})?${letters}${sep}(\\d{1,6})(?!\\d)`, 'i');
  const m = String(text).match(re);
  if (!m) return null;
  return `${clean.toUpperCase()}${m[1].padStart(digits, '0')}`;
}

/**
 * Decide whether an incoming payment can be matched automatically.
 * @returns {{status:'matched'|'unmatched', invoice?:object, reason:string}}
 */
export function matchPayment({ reference, amountCents, email }, invoices, statesById, prefix, digits) {
  const num = normalizeInvoiceNumber(reference, prefix, digits);
  let inv = num ? invoices.find((i) => i.number === num) : null;
  if (!inv && email) {
    const cands = invoices.filter((i) => (i.bill_email || '').toLowerCase() === String(email).toLowerCase()
      && statesById[i.id]?.owing_cents === amountCents);
    if (cands.length === 1) inv = cands[0];
  }
  if (!inv) return { status: 'unmatched', reason: num ? `Invoice ${num} not found.` : 'No invoice number in the payment.' };
  if (inv.status === 'draft' || inv.status === 'cancelled' || inv.status === 'void') {
    return { status: 'unmatched', invoice: inv, reason: `Invoice ${inv.number} is ${inv.status}.` };
  }
  const st = statesById[inv.id];
  if (!(amountCents > 0) || (st && amountCents > st.owing_cents)) {
    return { status: 'unmatched', invoice: inv, reason: `Amount ${money(amountCents)} does not fit the balance owing ${money(st?.owing_cents ?? 0)}.` };
  }
  return { status: 'matched', invoice: inv, reason: 'Invoice number and amount match.' };
}

// ---------------------------------------------------------------------------
// Compliance documents
// ---------------------------------------------------------------------------

export const DOC_TYPES = {
  logo: 'Logo',
  booth_layout: 'Booth layout',
  food_vendor_notification: 'AHS Special Events Food Vendor Notification',
  food_establishment_permission: 'Permission to Use an Approved Food Establishment form',
  fire_decal: 'Fire decal',
  personal_services: 'Temporary Personal Services Notification',
  insurance: 'Insurance certificate',
};

/** Which documents apply to one application item. */
export function requiredDocuments(item, settings) {
  const docs = [];
  if (item.product_code === 'food_truck') docs.push('food_vendor_notification', 'food_establishment_permission', 'fire_decal');
  if (item.personal_services) docs.push('personal_services');
  const ins = settings?.compliance?.insurance_required_for || [];
  if (ins.includes(item.product_code)) docs.push('insurance');
  return docs;
}

// ---------------------------------------------------------------------------
// Volunteers: preferences and the auto-scheduler
// ---------------------------------------------------------------------------

export const VOLUNTEER_PREFERENCES = [
  { key: 'early_setup', label: 'Early set-up (6:30–9 am)' },
  { key: 'morning_setup', label: 'Morning set-up (8 am–12 pm)' },
  { key: 'road_greeter', label: 'Road closure greeter / vendor check-in (8 am–12 pm)' },
  { key: 'parking', label: 'Parking lot attendant (morning / afternoon)' },
  { key: 'kids_zone', label: 'Kids Zone: face painter line, balloon art line, toy tents (11–2 / 2–5)' },
  { key: 'info_table', label: 'Information table / merch / donations (11–2 / 2–6)' },
  { key: 'waste', label: 'Waste / site clean-up (11–6)' },
  { key: 'dolly', label: 'Dolly controller (8–12 / 5–6)' },
  { key: 'backstage', label: 'Back stage / hospitality' },
  { key: 'teardown', label: 'Tear down (5–7 pm)' },
  { key: 'anything', label: 'Anything / wherever needed' },
];

/** Does a shift fit a volunteer's availability? */
export function fitsAvailability(shift, availability) {
  if (!availability || availability === 'all_day') return true;
  const start = shift.start_min ?? 0;
  const end = shift.end_min ?? 24 * 60;
  if (availability === 'morning') return end <= 13 * 60;
  if (availability === 'afternoon') return start >= 11 * 60;
  return true;
}

function overlaps(a, b) {
  const as = a.start_min ?? 0; const ae = a.end_min ?? 1440;
  const bs = b.start_min ?? 0; const be = b.end_min ?? 1440;
  return as < be && bs < ae;
}

function priority(v) {
  return [v.returning_volunteer ? 0 : 1, v.experience === 'yes' ? 0 : v.experience === 'some' ? 1 : 2, String(v.created_at || '')];
}
function cmpPriority(a, b) {
  const pa = priority(a); const pb = priority(b);
  for (let i = 0; i < pa.length; i++) { if (pa[i] < pb[i]) return -1; if (pa[i] > pb[i]) return 1; }
  return 0;
}

/**
 * Auto-schedule one city.
 * @param {Array} shifts       shifts rows for the city (id, pref_key, admin_only, start_min, end_min, role_group, sort)
 * @param {Array} volunteers   volunteers rows for the city (status 'active' only are used)
 * @param {Array} existing     assignments rows. Locked ones (and admin-only slots) are kept.
 * @returns {{assignments: Array<{shift_id, volunteer_id}>, unfilled: Array, unplaced: Array}}
 */
export function autoSchedule(shifts, volunteers, existing = []) {
  const kept = existing.filter((a) => a.locked && a.status !== 'declined');
  const declinedPairs = new Set(existing.filter((a) => a.status === 'declined').map((a) => `${a.shift_id}|${a.volunteer_id}`));
  const filled = new Map(kept.map((a) => [a.shift_id, a.volunteer_id]));
  const byVol = new Map();
  const shiftById = Object.fromEntries(shifts.map((s) => [s.id, s]));
  for (const a of kept) {
    if (!byVol.has(a.volunteer_id)) byVol.set(a.volunteer_id, []);
    if (shiftById[a.shift_id]) byVol.get(a.volunteer_id).push(shiftById[a.shift_id]);
  }
  const open = shifts
    .filter((s) => !s.admin_only && !filled.has(s.id))
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const people = volunteers.filter((v) => (v.status || 'active') === 'active').sort(cmpPriority);

  const canTake = (v, s) => {
    if (declinedPairs.has(`${s.id}|${v.id}`)) return false;
    if (!fitsAvailability(s, v.availability)) return false;
    const mine = byVol.get(v.id) || [];
    if (mine.some((m) => overlaps(m, s))) return false;
    return true;
  };
  const give = (v, s) => {
    filled.set(s.id, v.id);
    if (!byVol.has(v.id)) byVol.set(v.id, []);
    byVol.get(v.id).push(s);
  };

  // Groups first: each group member is a separate volunteer row with the same group_name.
  // Place groups together into consecutive open slots of the same role.
  const groups = new Map();
  for (const v of people) if (v.group_name) {
    const k = v.group_name.trim().toLowerCase();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(v);
  }
  for (const members of groups.values()) {
    const prefs = members[0].preferences || [];
    const roles = [...new Set(open.map((s) => s.role_group || s.duties || s.label))];
    for (const role of roles) {
      const slots = open.filter((s) => !filled.has(s.id) && (s.role_group || s.duties || s.label) === role
        && (prefs.includes(s.pref_key) || prefs.includes('anything')));
      const free = members.filter((m) => !(byVol.get(m.id) || []).length);
      if (slots.length >= free.length && free.length > 1) {
        free.forEach((m, i) => { if (canTake(m, slots[i])) give(m, slots[i]); });
        break;
      }
    }
  }

  // Pass 1: preferences. Each volunteer gets at most one slot per pass, so
  // shifts are spread fairly; repeat passes until nothing changes.
  let changed = true;
  while (changed) {
    changed = false;
    for (const v of people) {
      const prefs = v.preferences || [];
      const s = open.find((x) => !filled.has(x.id) && prefs.includes(x.pref_key) && canTake(v, x));
      if (s) { give(v, s); changed = true; }
    }
  }
  // Pass 2: "Anything" volunteers fill the gaps.
  changed = true;
  while (changed) {
    changed = false;
    for (const v of people.filter((p) => (p.preferences || []).includes('anything'))) {
      const s = open.find((x) => !filled.has(x.id) && canTake(v, x));
      if (s) { give(v, s); changed = true; }
    }
  }
  const keptIds = new Set(kept.map((a) => a.shift_id));
  const assignments = [...filled.entries()].filter(([sid]) => !keptIds.has(sid)).map(([shift_id, volunteer_id]) => ({ shift_id, volunteer_id }));
  const unfilled = shifts.filter((s) => !filled.has(s.id));
  const placed = new Set(filled.values());
  const unplaced = people.filter((v) => !placed.has(v.id));
  return { assignments, unfilled, unplaced };
}

// ---------------------------------------------------------------------------
// Small text helpers
// ---------------------------------------------------------------------------

/** "Holina Global Inc." -> "Holina-Global-Inc" (file names like 2027CD001-Holina-Global.pdf) */
export function fileSafe(name) {
  return String(name || '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'Organization';
}

export const APPLICATION_STATUS_LABELS = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under review',
  changes_requested: 'Changes requested',
  accepted: 'Accepted',
  waitlisted: 'Waitlisted',
  declined: 'Declined',
  cancel_requested: 'Cancellation requested',
  cancelled: 'Cancelled',
};

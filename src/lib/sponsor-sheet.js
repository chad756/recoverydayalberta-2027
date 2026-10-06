// =============================================================================
// SPONSOR MASTER SHEET — same columns, same order, same header text as the
// 2026 workbook (sheet "2026", columns A–CD), plus new columns CE–CL.
// =============================================================================
// Only change from 2026: the Artisan price text is "Artisan $200" in all three
// city blocks. Spellings ("Recieved") and trailing spaces are kept on purpose
// so staff formulas, filters and habits keep working.
// This file has no personal data – it only describes the columns.
// =============================================================================
import { invoiceState, receivedText } from '../../supabase/functions/_shared/rules.js';

const CITY_BLOCK = [
  'Stage Sponsor Logo', 'Health Information/Retail  Booth $600', 'Artisan $200', 'Food Truck $400', 'Size of Truck',
  'Tables', 'Number of  Chairs', 'Tents', 'Email Read Receipt', 'Special Events Food Vendor Notifications Recieved',
  'Permission to Use an approved Food Establishment Form', 'Booth Layout Recieved', 'Temporary Personal Services Notification',
  'AHS Decal Number', '2025 Fire Decal ', 'Vendor Insurance with Dual Listing', 'Vendor Notes',
];
export const SPONSOR_HEADERS = [
  'File Number', 'Name', 'Invoice #', 'RCC Calgary', 'Recovery Day Calgary', 'Recovery Day Red Deer', 'Recovery Day Edmonton',
  'RCC SK', 'Stampede BBQ', 'Recovery Day BC', 'Admin', 'Total', 'Received ', 'Bringing Cheques to conference / Notes', 'Notes',
  'Reimburse to RDBC', 'Contact Name', 'Email', 'Phone #', 'SK RCC Sponsor', 'SK RCC Exhibitors ', 'SK RCC Artisans', 'Group Table',
  'Logo Received ', 'Calgary RCC Booth', 'Calgary RCC Ballroom Booth', 'Calgary RCC Refreshment Break Sponsor ', 'Calgary RCC LED Wall Sponsor ',
  'Calgary RCC Presenting Sponsor ', 'Full Page Ad', '1/2 Page Ad',
  ...CITY_BLOCK, ...CITY_BLOCK, ...CITY_BLOCK,
  // New in 2027 (after CD, so no existing column moves)
  'Calgary Mutual Support Group $300', 'Red Deer Mutual Support Group $300', 'Edmonton Mutual Support Group $300',
  'Deposit Paid', 'Amount Paid', 'Balance Owing', 'Balance Due Date', 'Refund',
];

/** 1 → A, 27 → AA */
export function colLetter(n) {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
export function colNumber(letters) {
  return [...letters.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
}

/** First column of each city block (Calgary AF, Red Deer AW, Edmonton BN). */
export const CITY_BLOCK_START = { calgary: 'AF', 'red-deer': 'AW', edmonton: 'BN' };
/** Amount columns per city (E/F/G) and mutual-support columns (CE/CF/CG). */
export const CITY_AMOUNT_COL = { calgary: 'E', 'red-deer': 'F', edmonton: 'G' };
export const CITY_MUTUAL_COL = { calgary: 'CE', 'red-deer': 'CF', edmonton: 'CG' };
/** Columns admins type by hand (stored in invoices.sheet_extra). */
export const ADMIN_COLUMNS = ['D', 'H', 'I', 'J', 'K', 'N', 'O', 'P', 'T', 'U', 'V', 'W', 'Y', 'Z', 'AA', 'AB', 'AC', 'AD', 'AE'];
export const MONEY_COLUMNS = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'CI', 'CJ', 'CL'];

export const SPONSOR_EMAIL_HEADERS = [
  'File Number', null, 'Invoice #', 'RCC Calgary', 'Total', 'Contact Name', 'Email', 'Phone #', 'Logo Received ', 'Booth Number',
  'Calgary RCC Booth', 'Calgary RCC Ballroom Booth', 'Calgary RCC Refreshment Break Sponsor ', 'Calgary RCC LED Wall Sponsor ',
  'LED Wall Ads received', 'Calgary RCC Presenting Sponsor ', 'Full Page Ad', '1/2 Page Ad', 'Article',
];

const dollars = (c) => (c == null ? null : Math.round(c) / 100);

/**
 * Build the sheet rows. Each row is an object { A: value, B: value, ... }.
 * Money is in dollars (numbers). L is a formula {formula:'SUM(D2:J2)'}.
 * data: { orgs, apps, items, invoices, lines, payments, refunds, documents, booths, settings }
 */
export function buildSponsorRows(data) {
  const { orgs, apps, items, invoices, lines, payments, refunds, documents, booths, settings } = data;
  const insuranceFor = settings?.compliance?.insurance_required_for || [];
  const rows = [];
  const appById = Object.fromEntries(apps.map((a) => [a.id, a]));
  const entries = [];
  for (const inv of invoices.filter((i) => i.status !== 'void')) entries.push({ inv, app: appById[inv.application_id] || null, org: orgs.find((o) => o.id === inv.organization_id) });
  for (const app of apps.filter((a) => a.status === 'accepted' && !invoices.some((i) => i.application_id === a.id && i.status !== 'void'))) {
    entries.push({ inv: null, app, org: orgs.find((o) => o.id === app.organization_id) });
  }
  entries.sort((a, b) => (a.org?.file_number ?? 1e9) - (b.org?.file_number ?? 1e9) || String(a.inv?.number).localeCompare(String(b.inv?.number)));

  for (const { inv, app, org } of entries) {
    if (!org) continue;
    const r = {};
    const extra = inv?.sheet_extra || {};
    const pays = inv ? payments.filter((p) => p.invoice_id === inv.id && !p.voided) : [];
    const refs = inv ? refunds.filter((x) => x.invoice_id === inv.id) : [];
    const myLines = inv ? lines.filter((l) => l.invoice_id === inv.id) : [];
    const myItems = app ? items.filter((i) => i.application_id === app.id) : [];
    const docs = documents.filter((d) => d.organization_id === org.id && d.status !== 'rejected');
    const approved = (type, city) => docs.some((d) => d.doc_type === type && d.status === 'approved' && (!city || !d.city_id || d.city_id === city));

    r.A = org.file_number ?? null;
    r.B = org.legal_name;
    r.C = inv ? `#${inv.number}` : '';
    for (const k of ADMIN_COLUMNS) if (extra[k] !== undefined && extra[k] !== '') r[k] = MONEY_COLUMNS.includes(k) ? Number(extra[k]) : extra[k];
    // City amounts (E/F/G): lines with a city; lines without one go to the column chosen on the invoice (default: first city)
    const firstCity = myLines.find((l) => l.city_id)?.city_id;
    const fallbackCol = extra.amount_col || CITY_AMOUNT_COL[firstCity] || 'E';
    for (const l of myLines) {
      const col = CITY_AMOUNT_COL[l.city_id] || fallbackCol;
      r[col] = Math.round(((r[col] || 0) + l.amount_cents / 100) * 100) / 100;
    }
    r.M = inv ? receivedText(inv, pays, refs) : '';
    r.Q = org.contact_name || '';
    r.R = org.contact_email || '';
    r.S = org.contact_phone || '';
    if (docs.some((d) => d.doc_type === 'logo')) r.X = 'yes';

    for (const it of myItems) {
      const start = CITY_BLOCK_START[it.city_id];
      if (!start) continue;
      const base = colNumber(start);
      const put = (offset, v) => { if (v !== null && v !== undefined && v !== '') r[colLetter(base + offset)] = v; };
      const code = it.product_code;
      if (code === 'stage_sponsor') put(0, 1);
      if (code === 'vendor_booth') put(1, 1);
      if (code === 'artisan') put(2, 1);
      if (code === 'food_truck') { put(3, 1); if (it.truck_length_ft) put(4, `${it.truck_length_ft}' x ${it.truck_width_ft ?? '?'}'`); }
      if (code === 'mutual_support') r[CITY_MUTUAL_COL[it.city_id]] = 1;
      put(5, it.tables || null);
      put(6, it.chair_pairs ? it.chair_pairs * 2 : null);
      put(7, it.tents || null);
      put(8, it.sheet_extra?.email_read_receipt || null);
      if (approved('food_vendor_notification', it.city_id)) put(9, 'yes');
      if (approved('food_establishment_permission', it.city_id)) put(10, 'yes');
      if (approved('booth_layout', it.city_id)) put(11, 'yes');
      if (approved('personal_services', it.city_id)) put(12, 'yes');
      put(13, it.ahs_decal_number || null);
      if (it.fire_decal_number || approved('fire_decal', it.city_id)) put(14, it.fire_decal_number || 'yes');
      const product = code;
      if (!insuranceFor.includes(product)) { if (code !== 'stage_sponsor') put(15, 'Event policy'); } else if (approved('insurance', it.city_id)) put(15, 'yes');
      put(16, [it.special_requests, it.sheet_extra?.vendor_notes].filter(Boolean).join(' | ') || null);
    }
    if (inv) {
      const st = invoiceState(inv, pays, refs);
      r.CH = inv.deposit_cents > 0 ? (st.deposit_owing_cents === 0 && st.paid_cents > 0 ? 'Yes' : 'No') : '';
      r.CI = dollars(st.paid_cents);
      r.CJ = dollars(st.owing_cents);
      r.CK = inv.balance_due || '';
      r.CL = st.refunded_cents ? dollars(st.refunded_cents) : null;
    }
    r._booths = booths.filter((b) => myItems.some((i) => i.id === b.application_item_id)).map((b) => b.label).join(', ');
    r._extra = extra;
    rows.push(r);
  }
  return rows;
}

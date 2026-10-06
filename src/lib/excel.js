// =============================================================================
// Excel exports and imports (runs in the browser with ExcelJS).
// ExcelJS is large, so it is only downloaded when you press an export button.
// =============================================================================
import { SPONSOR_HEADERS, SPONSOR_EMAIL_HEADERS, MONEY_COLUMNS, colLetter, colNumber, CITY_BLOCK_START, buildSponsorRows } from './sponsor-sheet.js';
import { clock } from '../../supabase/functions/_shared/rules.js';

const ACCOUNTING = '_([$$-409]* #,##0.00_);_([$$-409]* \\(#,##0.00\\);_([$$-409]* "-"??_);_(@_)';

async function excel() {
  const mod = await import('exceljs');
  return mod.default ?? mod;
}
async function save(wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const { downloadBlob } = await import('./ui.js');
  downloadBlob(blob, filename);
}
function headerRow(ws, values, { fill } = {}) {
  const row = ws.getRow(1);
  values.forEach((v, i) => { row.getCell(i + 1).value = v; });
  row.font = { name: 'Arial', size: 10, bold: true };
  row.alignment = { wrapText: true, vertical: 'top' };
  row.height = 44.25;
  if (fill) row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }; });
}

/** Sponsor master workbook: sheet "2027" (A–CL) + "Sponsor Emails". */
export async function exportSponsorMaster(data, year) {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Recovery Day Alberta';
  const ws = wb.addWorksheet(String(year));
  headerRow(ws, SPONSOR_HEADERS);
  const widths = { A: 10.57, B: 52.29, C: 23.29, F: 23.29, G: 29.29, H: 23.29, L: 23.29, N: 25.86 };
  for (let c = 1; c <= SPONSOR_HEADERS.length; c++) ws.getColumn(c).width = widths[colLetter(c)] ?? 13;
  // City labels as cell notes (row 1 stays the header row, so formulas keep working)
  for (const [city, start] of Object.entries(CITY_BLOCK_START)) {
    ws.getCell(`${start}1`).note = `${city.replace('-', ' ').toUpperCase()} block starts here (${start}–${colLetter(colNumber(start) + 16)})`;
  }
  ws.getCell('CE1').note = 'New in 2027: columns CE–CL';
  const rows = buildSponsorRows(data);
  rows.forEach((r, i) => {
    const n = i + 2;
    const row = ws.getRow(n);
    for (let c = 1; c <= SPONSOR_HEADERS.length; c++) {
      const L = colLetter(c);
      if (L === 'L') { row.getCell(c).value = { formula: `SUM(D${n}:J${n})` }; } else if (r[L] !== undefined && r[L] !== null) row.getCell(c).value = r[L];
      if (MONEY_COLUMNS.includes(L)) row.getCell(c).numFmt = ACCOUNTING;
    }
    if (r.CK) { row.getCell(colNumber('CK')).value = new Date(`${r.CK}T12:00:00`); row.getCell(colNumber('CK')).numFmt = 'mmm d, yyyy'; }
  });
  ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }];
  ws.autoFilter = { from: 'A1', to: `${colLetter(SPONSOR_HEADERS.length)}1` };

  const em = wb.addWorksheet('Sponsor Emails');
  headerRow(em, SPONSOR_EMAIL_HEADERS.map((h) => h ?? ''));
  [10.57, 40, 16, 13, 13, 24, 32, 16, 12, 14].forEach((w, i) => { em.getColumn(i + 1).width = w; });
  rows.forEach((r, i) => {
    const x = r._extra || {};
    em.addRow([r.A, r.B, r.C, r.D ?? null, null, r.Q, r.R, r.S, r.X || '', r._booths || '', x.Y ?? null, x.Z ?? null, x.AA ?? null, x.AB ?? null, x.led_ads ?? null, x.AC ?? null, x.AD ?? null, x.AE ?? null, x.article ?? null]);
    const n = i + 2;
    em.getCell(`E${n}`).value = { formula: `'${year}'!L${n}` };
    em.getCell(`E${n}`).numFmt = ACCOUNTING;
    em.getCell(`D${n}`).numFmt = ACCOUNTING;
  });
  em.views = [{ state: 'frozen', ySplit: 1 }];
  await save(wb, `Sponsors-${year}.xlsx`);
  return rows.length;
}

/** Volunteer sign-up list for one city (every field, one row per person). */
export async function exportVolunteerList(city, volunteers, prefLabels, year) {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`${city.name} ${year}`);
  const cols = [
    ['Name', 'name', 28], ['Email', 'email', 32], ['Phone', 'phone', 16], ['18 or older', (v) => (v.is_adult ? 'Yes' : 'No'), 10],
    ['Guardian', (v) => [v.guardian_name, v.guardian_contact].filter(Boolean).join(' – '), 28],
    ['Preferences', (v) => (v.preferences || []).map((p) => prefLabels[p] || p).join('; '), 50], ['Availability', 'availability', 12],
    ['Experience', 'experience', 10], ['Returning', (v) => (v.returning_volunteer ? 'Yes' : ''), 10], ['Group', 'group_name', 20],
    ['T-shirt', 'tshirt_size', 8], ['Emergency contact', (v) => [v.emergency_name, v.emergency_phone].filter(Boolean).join(' – '), 28],
    ['Accessibility needs', 'accessibility', 30], ['Photo consent', (v) => (v.media_consent_at ? 'Yes' : 'No'), 10],
    ['Marketing opt-in', (v) => (v.marketing_opt_in_at ? 'Yes' : 'No'), 10], ['Signed up', (v) => String(v.created_at).slice(0, 10), 12],
  ];
  headerRow(ws, cols.map((c) => c[0]), { fill: 'FFA6A6A6' });
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = c[2]; });
  for (const v of volunteers) ws.addRow(cols.map(([, k]) => (typeof k === 'function' ? k(v) : v[k] ?? '')));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  await save(wb, `Volunteers-${city.name.replace(/\s+/g, '-')}-${year}.xlsx`);
}

/** Volunteer schedule for one city in the 2026 layout. */
export async function exportSchedule(city, shifts, assignments, volunteers, year) {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`${city.name} ${year}`);
  ws.mergeCells('A1:E1');
  ws.getCell('A1').value = `Recovery Day ${year} Volunteers`;
  const grey = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA6A6A6' } };
  const yellow = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
  ws.getRow(1).font = { name: 'Arial', size: 12, bold: true };
  ws.getCell('A1').alignment = { horizontal: 'center' };
  ws.getCell('A1').fill = grey;
  ws.getRow(2).values = ['Zone', 'Name', 'Email', 'Phone Number', 'Duties'];
  ws.getRow(2).font = { name: 'Arial', size: 12, bold: true };
  ws.getRow(2).eachCell((c) => { c.fill = grey; });
  [50, 30, 30, 28, 57].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const zones = [...new Set([...shifts].sort((a, b) => a.zone_sort - b.zone_sort || a.sort - b.sort).map((s) => s.zone))];
  for (const z of zones) {
    const zr = ws.addRow([z, '', '', '', '']);
    zr.font = { name: 'Arial', size: 12, bold: true };
    zr.getCell(1).fill = yellow;
    for (const s of shifts.filter((x) => x.zone === z).sort((a, b) => a.sort - b.sort)) {
      const a = assignments.find((x) => x.shift_id === s.id);
      const v = a ? volunteers.find((x) => x.id === a.volunteer_id) : null;
      const r = ws.addRow([s.label, v?.name ?? '', v?.email ?? '', v?.phone ?? '', s.duties || `${clock(s.start_min)}–${clock(s.end_min)}`]);
      r.font = { name: 'Arial', size: 12 };
      r.getCell(1).font = { name: 'Arial', size: 12, bold: true };
      r.getCell(1).fill = yellow;
    }
  }
  ws.views = [{ state: 'frozen', ySplit: 2 }];
  await save(wb, `Volunteer-Schedule-${city.name.replace(/\s+/g, '-')}-${year}.xlsx`);
}

/** Booth list for one city (for the road-closure greeters). */
export async function exportBoothList(city, rows, year) {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`${city.name} booths`);
  headerRow(ws, ['Booth', 'Zone', 'Size', 'Type', 'Organization', 'Contact', 'Phone', 'Product', 'Rentals', 'Power', 'Notes'], { fill: 'FFA6A6A6' });
  [8, 14, 8, 14, 36, 22, 16, 28, 28, 10, 40].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  for (const r of rows) ws.addRow([r.label, r.zone, r.size, r.type, r.org, r.contact, r.phone, r.product, r.rentals, r.power, r.notes]);
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  await save(wb, `Booths-${city.name.replace(/\s+/g, '-')}-${year}.xlsx`);
}

// ---- Imports ----------------------------------------------------------------
/** Minimal CSV parser (quotes, commas, new lines). */
export function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.result !== undefined) return String(v.result);
    if (v.text) return String(v.text);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v);
}

/** Read a CSV or XLSX file → { sheets: [{ name, rows: string[][] }] } */
export async function readTable(file) {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return { sheets: [{ name: file.name, rows: parseCsv(await file.text()) }] };
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  return {
    sheets: wb.worksheets.map((ws) => {
      const rows = [];
      ws.eachRow({ includeEmpty: false }, (r) => { const vals = []; for (let c = 1; c <= Math.min(ws.columnCount, 120); c++) vals.push(cellText(r.getCell(c).value)); rows.push(vals); });
      return { name: ws.name, rows };
    }),
  };
}

/**
 * Turn a table into payment rows.
 * - Sponsor-sheet format: header row has "Invoice #" in col C and "Received" in col M.
 * - Payment report: columns named like invoice/reference, amount, date, email, method.
 * Returns { format, rows: [{ line, reference, amount, date, email, received, method, raw }] }
 */
export function toPaymentRows(rows) {
  const h = (rows[0] || []).map((x) => String(x).trim().toLowerCase());
  if (h[2] === 'invoice #' && h[12] === 'received') {
    return { format: 'sponsor', rows: rows.slice(1).map((r, i) => ({ line: i + 2, reference: r[2], received: String(r[12] || '').trim(), total: r[11], raw: r })).filter((r) => r.reference) };
  }
  const find = (...names) => h.findIndex((x) => names.some((n) => x.includes(n)));
  const iRef = find('invoice', 'reference', 'ref');
  const iAmt = find('amount', 'paid', 'total');
  const iDate = find('date');
  const iEmail = find('email');
  const iMethod = find('method', 'type');
  const iId = find('payment id', 'transaction', 'stripe');
  if (iAmt < 0) throw new Error('Could not find an “Amount” column. The first row must have column names (Invoice, Amount, Date, Email, Method).');
  return {
    format: 'report',
    rows: rows.slice(1).map((r, i) => ({ line: i + 2, reference: iRef >= 0 ? r[iRef] : '', amount: r[iAmt], date: iDate >= 0 ? r[iDate] : '', email: iEmail >= 0 ? r[iEmail] : '', method: iMethod >= 0 ? r[iMethod] : '', external_id: iId >= 0 ? r[iId] : '', raw: r })),
  };
}

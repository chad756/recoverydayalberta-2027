// =============================================================================
// INVOICE + RECEIPT PDF  (layout copied from the 2026 invoice template)
// =============================================================================
// Plain JavaScript. The Edge Functions pass in the pdf-lib module; the website
// demo can pass in the same library, so both produce the identical PDF.
//
//   Logo (centred) · INVOICE #2027CD001 · issuer block (left) · Date / TO box
//   (right) · Services | Amount table · TOTAL DUE row with payment line ·
//   payment schedule · cancellation policy · footer
// =============================================================================

import { money, longDate, invoiceState, buildPayLink } from './rules.js';

const PAGE = { w: 612, h: 792, margin: 54 };
const RED = [0.62, 0.11, 0.09];
const GREY = [0.85, 0.85, 0.85];
const DARK = [0.12, 0.12, 0.14];

/** Replace characters the built-in PDF fonts can't draw. */
function clean(text) {
  return String(text ?? '')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...').replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2022\u20AC]/g, '');
}

function wrap(text, font, size, maxWidth) {
  const out = [];
  for (const para of clean(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) line = test;
      else { if (line) out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

/**
 * Collect everything the PDF needs from database rows.
 * @param {object} b  { invoice, lines, payments, refunds, settings (map), payment?, receipt? }
 */
export function documentData(b) {
  const s = b.settings || {};
  const issuer = s.issuer || {};
  const st = invoiceState(b.invoice, b.payments || [], b.refunds || []);
  const payLink = buildPayLink(s.pay_link?.template, {
    invoice: b.invoice.number, amountCents: st.due_now_cents, org: b.invoice.bill_name,
    name: b.invoice.bill_contact, email: b.invoice.bill_email,
  });
  return {
    kind: b.receipt ? 'receipt' : 'invoice',
    number: b.receipt ? b.receipt.number : `#${b.invoice.number}`,
    invoiceNumber: b.invoice.number,
    date: b.receipt ? String(b.payment?.paid_at || '').slice(0, 10) : (b.invoice.issue_date || ''),
    to: { name: b.invoice.bill_name, contact: b.invoice.bill_contact, address: b.invoice.bill_address, email: b.invoice.bill_email },
    lines: b.lines || [],
    total: b.invoice.total_cents,
    deposit: b.invoice.deposit_cents,
    balanceDue: b.invoice.balance_due,
    paid: st.paid_cents,
    owing: st.owing_cents,
    depositOwing: st.deposit_owing_cents,
    state: st,
    payment: b.payment || null,
    issuer,
    payLink,
    printedLink: s.pay_link?.printed || 'https://lastdoor.org/pay-for-invoice/',
    payHelp: String(s.pay_link?.help || '').replace('{invoice}', b.invoice.number),
    policy: s.policy_text || { title: '', lines: [] },
    depositEach: s.payment_rules?.deposit_cents ?? 10000,
  };
}

/**
 * Build the PDF.
 * @param {object} PDFLib  the pdf-lib module
 * @param {object} d       documentData(...)
 * @param {Uint8Array} [logoBytes] Last Door logo (JPEG)
 * @returns {Promise<Uint8Array>}
 */
export async function buildPdf(PDFLib, d, logoBytes) {
  const { PDFDocument, StandardFonts, rgb, PDFName, PDFString } = PDFLib;
  const doc = await PDFDocument.create();
  doc.setTitle(`${d.kind === 'receipt' ? 'Receipt' : 'Invoice'} ${d.number}`);
  doc.setAuthor('The Last Door Recovery Society');
  const page = doc.addPage([PAGE.w, PAGE.h]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const c = (arr) => rgb(arr[0], arr[1], arr[2]);
  const L = PAGE.margin;
  const R = PAGE.w - PAGE.margin;
  const W = R - L;
  let y = PAGE.h - 40;

  const text = (t, x, yy, { size = 10, f = font, color = DARK } = {}) =>
    page.drawText(clean(t), { x, y: yy, size, font: f, color: c(color) });
  const rightText = (t, xr, yy, opts = {}) => {
    const f = opts.f || font; const size = opts.size || 10;
    text(t, xr - f.widthOfTextAtSize(clean(t), size), yy, opts);
  };
  const centerText = (t, yy, opts = {}) => {
    const f = opts.f || font; const size = opts.size || 10;
    text(t, (PAGE.w - f.widthOfTextAtSize(clean(t), size)) / 2, yy, opts);
  };
  const addLink = (url, x1, y1, x2, y2) => {
    const annot = doc.context.register(doc.context.obj({
      Type: 'Annot', Subtype: 'Link', Rect: [x1, y1, x2, y2], Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
    }));
    const existing = page.node.lookup(PDFName.of('Annots'));
    if (existing) existing.push(annot); else page.node.set(PDFName.of('Annots'), doc.context.obj([annot]));
  };

  // 1. Logo, centred
  if (logoBytes) {
    try {
      const img = await doc.embedJpg(logoBytes);
      const w = 200; const h = (img.height / img.width) * w;
      page.drawImage(img, { x: (PAGE.w - w) / 2, y: y - h, width: w, height: h });
      y -= h + 18;
    } catch { y -= 10; }
  }

  // 2. Title
  centerText(`${d.kind === 'receipt' ? 'RECEIPT' : 'INVOICE'} ${d.number}`, y, { size: 16, f: bold });
  y -= 28;

  // 3. Issuer (left) and 4. Date / TO box (right)
  const topY = y;
  text(d.issuer.name || 'LAST DOOR RECOVERY CENTRE', L, y, { f: bold, color: RED, size: 11 });
  y -= 14;
  for (const line of d.issuer.lines || []) { text(line, L, y, { size: 10 }); y -= 13; }
  const leftBottom = y;

  const boxX = L + W * 0.52; const boxW = R - boxX;
  let by = topY;
  const boxLines = [];
  boxLines.push({ t: `Date: ${longDate(d.date) || 'Not sent yet'}`, f: font });
  boxLines.push({ t: `TO: ${d.to.name || ''}`, f: bold });
  if (d.to.contact) boxLines.push({ t: d.to.contact, f: font });
  for (const a of String(d.to.address || '').split('\n').filter(Boolean)) boxLines.push({ t: a, f: font });
  if (d.to.email) boxLines.push({ t: d.to.email, f: font });
  if (d.kind === 'receipt') boxLines.push({ t: `For invoice #${d.invoiceNumber}`, f: font });
  const wrapped = boxLines.flatMap((bl) => wrap(bl.t, bl.f, 10, boxW - 16).map((t) => ({ t, f: bl.f })));
  const boxH = wrapped.length * 13 + 14;
  page.drawRectangle({ x: boxX, y: topY - boxH + 10, width: boxW, height: boxH, borderColor: c(DARK), borderWidth: 0.8 });
  by = topY - 4;
  for (const bl of wrapped) { text(bl.t, boxX + 8, by, { f: bl.f }); by -= 13; }
  y = Math.min(leftBottom, topY - boxH) - 18;

  // 5. Services table
  const amtW = 110; const descW = W - amtW;
  const rowLine = (yy) => page.drawLine({ start: { x: L, y: yy }, end: { x: R, y: yy }, thickness: 0.6, color: c(DARK) });
  page.drawRectangle({ x: L, y: y - 18, width: W, height: 22, color: c(GREY), borderColor: c(DARK), borderWidth: 0.6 });
  text('Services', L + 8, y - 11, { f: bold });
  rightText('Amount', R - 8, y - 11, { f: bold });
  y -= 18;
  const tableTop = y + 22;

  const rows = d.kind === 'receipt'
    ? [{ description: `Payment received – ${d.payment?.received_label || ''}${d.payment?.reference ? ` (ref ${d.payment.reference})` : ''}`,
         detail: `Paid ${longDate(String(d.payment?.paid_at || '').slice(0, 10))} toward invoice #${d.invoiceNumber} (total ${money(d.total)})`,
         amount_cents: d.payment?.amount_cents || 0 }]
    : d.lines;
  for (const r of rows) {
    const dl = wrap(r.description, font, 10, descW - 16);
    const sl = r.detail ? wrap(r.detail, font, 8, descW - 16) : [];
    const h = dl.length * 13 + sl.length * 10 + 10;
    let ty = y - 13;
    for (const t of dl) { text(t, L + 8, ty); ty -= 13; }
    for (const t of sl) { text(t, L + 8, ty + 2, { size: 8, color: [0.33, 0.34, 0.36] }); ty -= 10; }
    rightText(money(r.amount_cents), R - 8, y - 13);
    y -= h;
    rowLine(y);
  }

  // 6. Total row
  const totalLeft = d.kind === 'receipt'
    ? [{ t: 'PAID', f: bold }, ...(d.issuer.total_lines || []).map((t) => ({ t, f: font }))]
    : [{ t: 'TOTAL DUE', f: bold }, ...(d.issuer.total_lines || []).map((t) => ({ t, f: font })),
       { t: d.issuer.payable || '', f: font }];
  const tl = totalLeft.flatMap((x) => wrap(x.t, x.f, 10, descW - 16).map((t) => ({ t, f: x.f })));
  const linkLines = d.kind === 'receipt' ? 0 : 1;
  const th = (tl.length + linkLines) * 13 + 12;
  let ty = y - 13;
  for (const x of tl) { text(x.t, L + 8, ty, { f: x.f }); ty -= 13; }
  if (d.kind !== 'receipt') {
    const lw = font.widthOfTextAtSize(d.printedLink, 10);
    text(d.printedLink, L + 8, ty, { color: [0.05, 0.27, 0.62] });
    page.drawLine({ start: { x: L + 8, y: ty - 1.5 }, end: { x: L + 8 + lw, y: ty - 1.5 }, thickness: 0.5, color: rgb(0.05, 0.27, 0.62) });
    addLink(d.payLink, L + 8, ty - 3, L + 8 + lw, ty + 10);
  }
  rightText(money(d.kind === 'receipt' ? d.payment?.amount_cents : d.total), R - 8, y - 13, { f: bold, size: 12 });
  y -= th;
  rowLine(y);
  // table outline + amount column divider
  page.drawRectangle({ x: L, y, width: W, height: tableTop - y, borderColor: c(DARK), borderWidth: 0.6 });
  page.drawLine({ start: { x: R - amtW, y }, end: { x: R - amtW, y: tableTop }, thickness: 0.6, color: c(DARK) });

  // Payment schedule
  y -= 18;
  const sched = [];
  if (d.kind === 'receipt') {
    sched.push(['Amount paid to date:', money(d.paid)], ['Balance owing:', money(d.owing)]);
  } else {
    const balanceAfterDeposit = d.total - d.deposit;
    if (d.deposit > 0 && d.deposit < d.total) {
      sched.push([`Deposit due now (${money(d.depositEach)} per booth, per city):`, money(d.deposit)]);
      sched.push([`Balance of ${money(balanceAfterDeposit)} due by ${longDate(d.balanceDue) || 'the balance due date'}`, '']);
    } else {
      sched.push([`Full amount due by ${longDate(d.balanceDue) || 'the due date'}:`, money(d.total)]);
    }
    sched.push(['Amount paid:', money(d.paid)], ['Balance owing:', money(d.owing)]);
  }
  for (const [label, val] of sched) {
    text(label, L + 8, y, { f: label.startsWith('Balance owing') ? bold : font });
    if (val) rightText(val, R - 8, y, { f: label.startsWith('Balance owing') ? bold : font });
    y -= 14;
  }
  if (d.kind !== 'receipt' && d.payHelp) {
    y -= 2;
    for (const t of wrap(d.payHelp, font, 9, W)) { text(t, L + 8, y, { size: 9 }); y -= 11; }
  }

  // Policy (small)
  if (d.policy?.lines?.length) {
    y -= 10;
    text(d.policy.title || 'Cancellation & Refund Policy', L, y, { size: 8.5, f: bold });
    y -= 11;
    for (const line of d.policy.lines) {
      for (const t of wrap(`• ${line}`, font, 8, W)) { text(t, L, y, { size: 8 }); y -= 10; }
    }
  }

  // 7. Footer
  const fl = wrap(d.issuer.footer || '', font, 8, W);
  let fy = 34 + (fl.length - 1) * 10;
  for (const t of fl) { centerText(t, fy, { size: 8 }); fy -= 10; }

  return doc.save();
}

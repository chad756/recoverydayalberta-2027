// Checks the sponsor master columns and the Section 7 example from the spec.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPONSOR_HEADERS, colLetter, colNumber, buildSponsorRows } from '../src/lib/sponsor-sheet.js';
import { buildInvoiceDraft } from '../supabase/functions/_shared/rules.js';

test('headers: A–CD from 2026 plus CE–CL', () => {
  assert.equal(SPONSOR_HEADERS.length, colNumber('CL'));
  const at = (L) => SPONSOR_HEADERS[colNumber(L) - 1];
  assert.equal(at('M'), 'Received ');
  assert.equal(at('X'), 'Logo Received ');
  assert.equal(at('AF'), 'Stage Sponsor Logo');
  assert.equal(at('AG'), 'Health Information/Retail  Booth $600');
  for (const L of ['AH', 'AY', 'BP']) assert.equal(at(L), 'Artisan $200');
  assert.equal(at('AO'), 'Special Events Food Vendor Notifications Recieved');
  assert.equal(at('AT'), '2025 Fire Decal ');
  assert.equal(at('CD'), 'Vendor Notes');
  assert.equal(at('CE'), 'Calgary Mutual Support Group $300');
  assert.equal(at('CL'), 'Refund');
  assert.equal(colLetter(82), 'CD');
});

test('spec example: Calgary booth + 1 tent, 1 table, 2 chairs', () => {
  const products = [
    { code: 'vendor_booth', name: 'Vendor Booth', kind: 'booth', price_cents: 60000, invoice_label: '{sub} Booth', sub_types: ['Vendor'], deposit: true },
    { code: 'tent', kind: 'rental', price_cents: 21000 }, { code: 'table', kind: 'rental', price_cents: 4500 }, { code: 'chairs_pair', kind: 'rental', price_cents: 4000 },
  ];
  const cities = [{ id: 'calgary', name: 'Calgary', event_date: '2027-09-18', sort: 2 }];
  const item = { id: 'it1', application_id: 'a1', city_id: 'calgary', product_code: 'vendor_booth', sub_type: 'Vendor', tents: 1, tables: 1, chair_pairs: 1 };
  const d = buildInvoiceDraft({ items: [item], products, cities, settings: {}, issueDate: '2027-06-01' });
  const inv = { id: 'i1', number: '2027CD001', organization_id: 'o1', application_id: 'a1', status: 'sent', total_cents: d.total_cents, deposit_cents: d.deposit_cents, balance_due: d.balance_due, sheet_extra: {} };
  const lines = d.lines.map((l) => ({ ...l, invoice_id: 'i1' }));
  const [r] = buildSponsorRows({
    orgs: [{ id: 'o1', legal_name: 'Example Org', file_number: 1 }], apps: [{ id: 'a1', organization_id: 'o1', status: 'accepted' }], items: [item],
    invoices: [inv], lines, payments: [{ invoice_id: 'i1', amount_cents: 10000, paid_at: '2027-06-02', received_label: 'Paid Visa LD' }], refunds: [], documents: [], booths: [], settings: {},
  });
  assert.equal(r.C, '#2027CD001');
  assert.equal(r.E, 895);
  assert.equal(r.AG, 1);
  assert.equal(r.AM, 1);
  assert.equal(r.AK, 1);
  assert.equal(r.AL, 2);
  assert.equal(r.AU, 'Event policy');
  assert.equal(r.M, 'Deposit paid');
  assert.equal(r.CH, 'Yes');
  assert.equal(r.CJ, 795);
});

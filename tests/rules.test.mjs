// Run with:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../supabase/functions/_shared/rules.js';

const products = [
  { code: 'stage_sponsor', name: 'Stage Sponsor', kind: 'sponsorship', price_cents: 500000, invoice_label: 'Stage Sponsor' },
  { code: 'vendor_booth', name: 'Vendor Booth', kind: 'booth', price_cents: 60000, invoice_label: '{sub} Booth' },
  { code: 'food_truck', name: 'Food Truck', kind: 'booth', price_cents: 40000, invoice_label: 'Food Truck' },
  { code: 'artisan', name: 'Artisan', kind: 'booth', price_cents: 20000, invoice_label: 'Artisan Booth' },
  { code: 'tent', kind: 'rental', price_cents: 21000 },
  { code: 'table', kind: 'rental', price_cents: 4500 },
  { code: 'chairs_pair', kind: 'rental', price_cents: 4000 },
];
const cities = [
  { id: 'edmonton', name: 'Edmonton', event_date: '2027-09-18', sort: 1 },
  { id: 'calgary', name: 'Calgary', event_date: '2027-09-19', sort: 2 },
];
const settings = {};

test('money and dates', () => {
  assert.equal(R.money(89500), '$895.00');
  assert.equal(R.money(500000), '$5,000.00');
  assert.equal(R.parseMoney('$1,234.5'), 123450);
  assert.equal(R.longDate('2026-07-29'), 'July 29th, 2026');
  assert.equal(R.longDate('2027-09-01'), 'September 1st, 2027');
  assert.equal(R.longDate('2027-09-22'), 'September 22nd, 2027');
  assert.equal(R.longDate('2027-09-13'), 'September 13th, 2027');
  assert.equal(R.daysBetween('2027-08-20', '2027-09-19'), 30);
  assert.equal(R.addDays('2027-09-19', -14), '2027-09-05');
});

test('spec example: Calgary vendor booth + 1 tent, 1 table, 2 chairs = $895, $100 deposit', () => {
  const d = R.buildInvoiceDraft({
    items: [{ city_id: 'calgary', product_code: 'vendor_booth', sub_type: 'Vendor', tents: 1, tables: 1, chair_pairs: 1 }],
    products, cities, settings, issueDate: '2027-06-01',
  });
  assert.equal(d.total_cents, 89500);
  assert.equal(d.deposit_cents, 10000);
  assert.equal(d.balance_due, '2027-09-05');
  assert.equal(d.lines[0].description, 'Vendor Booth – Recovery Day Calgary');
  assert.equal(d.lines[1].description, "Tent 10'x10' (1) Table (1) Chairs (2)");
  assert.equal(d.lines[1].amount_cents, 29500);
});

test('stage sponsor has no deposit; two cities, earliest date used', () => {
  const d = R.buildInvoiceDraft({
    items: [
      { city_id: 'calgary', product_code: 'stage_sponsor' },
      { city_id: 'edmonton', product_code: 'artisan' },
    ], products, cities, settings, issueDate: '2027-06-01',
  });
  assert.equal(d.total_cents, 520000);
  assert.equal(d.deposit_cents, 10000);
  assert.equal(d.balance_due, '2027-09-04');
});

test('accepted fewer than 14 days out: everything due now', () => {
  const d = R.buildInvoiceDraft({ items: [{ city_id: 'calgary', product_code: 'artisan' }], products, cities, settings, issueDate: '2027-09-10' });
  assert.equal(d.balance_due, '2027-09-10');
  assert.equal(d.deposit_cents, 20000);
});

test('invoice state', () => {
  const inv = { status: 'sent', total_cents: 89500, deposit_cents: 10000, balance_due: '2027-09-05' };
  assert.equal(R.invoiceState(inv, [], [], '2027-06-02').code, 'deposit_due');
  assert.equal(R.invoiceState(inv, [{ amount_cents: 10000 }], [], '2027-06-02').code, 'deposit_paid');
  assert.equal(R.invoiceState(inv, [{ amount_cents: 10000 }], [], '2027-09-06').code, 'overdue');
  assert.equal(R.invoiceState(inv, [{ amount_cents: 89500 }], [], '2027-09-06').code, 'paid');
  assert.equal(R.receivedText(inv, [{ amount_cents: 89500, received_label: 'Paid Chq LD', paid_at: '2027-06-03' }]), 'Paid Chq LD');
  assert.equal(R.receivedText(inv, [{ amount_cents: 10000 }]), 'Deposit paid');
});

test('refund calculator follows the policy table', () => {
  const lines = [
    { description: 'Vendor Booth', line_type: 'booth', city_id: 'calgary', amount_cents: 60000 },
    { description: 'Rentals', line_type: 'rental', city_id: 'calgary', amount_cents: 29500 },
  ];
  const calc = (cancelDate, paid) => R.calculateRefund({ lines, paidCents: paid, cities, cancelDate, settings }).refund_cents;
  assert.equal(calc('2027-08-01', 89500), 89500);   // 49 days: full
  assert.equal(calc('2027-08-20', 89500), 89500);   // exactly 30 days: full
  assert.equal(calc('2027-08-25', 89500), 79500);   // 25 days: minus $100 deposit, rentals refunded
  assert.equal(calc('2027-08-25', 10000), 0);       // only deposit paid: kept
  assert.equal(calc('2027-09-10', 89500), 0);       // 9 days: nothing
  const sponsor = [{ description: 'Stage', line_type: 'sponsorship', city_id: 'calgary', amount_cents: 500000 }];
  assert.equal(R.calculateRefund({ lines: sponsor, paidCents: 500000, cities, cancelDate: '2027-08-25', settings }).refund_cents, 0);
});

test('pay link and matching', () => {
  const link = R.buildPayLink('https://lastdoor.org/pay-for-invoice/?reference={invoice}&amount={amount}&org={org}', { invoice: '2027CD001', amountCents: 10000, org: 'Holina Global' });
  assert.equal(link, 'https://lastdoor.org/pay-for-invoice/?reference=2027CD001&amount=100.00&org=Holina%20Global');
  assert.equal(R.normalizeInvoiceNumber('#2027cd7', '2027CD', 3), '2027CD007');
  assert.equal(R.normalizeInvoiceNumber('Invoice 2027CD012 thanks', '2027CD', 3), '2027CD012');
  const invoices = [{ id: 'a', number: '2027CD001', status: 'sent' }];
  const states = { a: { owing_cents: 89500 } };
  assert.equal(R.matchPayment({ reference: '2027CD001', amountCents: 10000 }, invoices, states, '2027CD', 3).status, 'matched');
  assert.equal(R.matchPayment({ reference: '2027CD001', amountCents: 99999 }, invoices, states, '2027CD', 3).status, 'unmatched');
  assert.equal(R.matchPayment({ reference: 'nothing', amountCents: 100 }, invoices, states, '2027CD', 3).status, 'unmatched');
});

test('auto-scheduler: preferences, no double-booking, admin-only and locks respected', () => {
  const shifts = [
    { id: 's1', pref_key: 'morning_setup', start_min: 480, end_min: 720, sort: 1 },
    { id: 's2', pref_key: 'morning_setup', start_min: 480, end_min: 720, sort: 2 },
    { id: 's3', pref_key: 'teardown', start_min: 1020, end_min: 1140, sort: 3 },
    { id: 's4', pref_key: 'kids_zone', start_min: 660, end_min: 840, sort: 4 },
    { id: 'lead', pref_key: null, admin_only: true, start_min: 420, end_min: 1140, sort: 0 },
  ];
  const vols = [
    { id: 'v1', preferences: ['morning_setup', 'teardown'], availability: 'all_day', created_at: '2027-05-02' },
    { id: 'v2', preferences: ['morning_setup'], availability: 'morning', returning_volunteer: true, created_at: '2027-05-03' },
    { id: 'v3', preferences: ['anything'], availability: 'afternoon', created_at: '2027-05-04' },
  ];
  const { assignments } = R.autoSchedule(shifts, vols, []);
  const m = Object.fromEntries(assignments.map((a) => [a.shift_id, a.volunteer_id]));
  assert.equal(m.s1, 'v2');            // returning volunteer first
  assert.equal(m.s2, 'v1');
  assert.equal(m.s3, 'v1');            // morning + tear-down allowed
  assert.equal(m.s4, 'v3');            // anything fills gaps
  assert.equal(m.lead, undefined);     // admin-only never auto-filled
  const locked = R.autoSchedule(shifts, vols, [{ shift_id: 's1', volunteer_id: 'v3', locked: true }]);
  assert.ok(!locked.assignments.find((a) => a.shift_id === 's1'));
});

test('invoice numbers are read from messy payment references', () => {
  const cases = { '2027CD001': '2027CD001', '#2027-CD-001': '2027CD001', CD001: '2027CD001', 'invoice 2027cd7': '2027CD007',
    'Ref: 2027 CD 45 thanks': '2027CD045', 'Recovery Day booth': null, ABCD12: null };
  for (const [text, want] of Object.entries(cases)) assert.equal(R.normalizeInvoiceNumber(text, '2027CD', 3), want, text);
});

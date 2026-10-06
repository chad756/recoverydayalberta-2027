// Shared data loaders and labels used by the portal and admin pages.
import { api } from './api.js';
import * as R from '../../supabase/functions/_shared/rules.js';

export { R };

let cache = null;
/** Settings, cities and products (cached for the page). */
export async function reference(force = false) {
  if (cache && !force) return cache;
  const [settingsRows, cities, products] = await Promise.all([
    api.list('settings'), api.list('cities', { order: 'sort' }), api.list('products', { order: 'sort' }),
  ]);
  cache = { settings: R.settingsMap(settingsRows), settingsRows, cities, products,
    city: (id) => cities.find((c) => c.id === id), product: (code) => products.find((p) => p.code === code) };
  return cache;
}

export const ORG_TYPES = [
  ['non_profit', 'Non-profit / charity'], ['health_service', 'Health or recovery service'], ['government', 'Government / public agency'],
  ['business', 'Business'], ['artisan', 'Artisan / maker'], ['food_truck', 'Food truck'], ['mutual_support', 'Mutual support group'],
];
export const orgTypeLabel = (v) => ORG_TYPES.find(([k]) => k === v)?.[1] || '';

export function itemLabel(item, ref) {
  const p = ref.product(item.product_code);
  const c = ref.city(item.city_id);
  const name = p ? (p.sub_types?.length && item.sub_type ? `${item.sub_type} Booth` : p.name) : item.product_code;
  return `${name} – ${c?.name ?? item.city_id}`;
}

/** Group payments/refunds by invoice and compute each invoice's state. */
export function withState(invoices, payments, refunds) {
  return invoices.map((inv) => {
    const pays = payments.filter((p) => p.invoice_id === inv.id);
    const refs = refunds.filter((r) => r.invoice_id === inv.id);
    return { ...inv, payments: pays, refunds: refs, state: R.invoiceState(inv, pays, refs) };
  });
}

export function cityDate(c) { return c?.event_date ? R.longDate(c.event_date) : 'Date to be announced'; }

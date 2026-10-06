// =============================================================================
// "PARTNER WITH US" DISPLAY DATA (public site only)
// =============================================================================
// PRICES: once Supabase is set up, the public page shows the prices from the
// admin site (Settings → Products and prices), refreshed every night. The
// prices below are only a fallback for when Supabase can't be reached.
// Prices are whole Canadian dollars. No GST is charged on anything.
// =============================================================================

export const partnerIntro =
  'Choose Edmonton, Calgary, Red Deer, or support more than one city. Your partnership keeps these community celebrations free and connects thousands of Albertans with hope, resources and one another.';

export const sponsorships = [
  { name: 'Stage Sponsor', price: 5000 },
];

export const booths = [
  { name: 'Vendor Booth / Healthcare Provider / Non-profit', price: 600 },
  { name: 'Food Truck', price: 400 },
  { name: 'Mutual Support Group', price: 300 },
  { name: 'Artisan', price: 200 },
];

export const boothNote = 'Tent, table and chairs are not included.';

export const rentals = [
  { name: "Tent 10'x10'", price: 210 },
  { name: 'Table', price: 45 },
  { name: 'Two Chairs', price: 40 },
];

export const priceFootnote = 'Prices are per city, in Canadian dollars. No GST.';

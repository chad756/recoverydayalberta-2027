-- =============================================================================
-- 004_seed.sql  —  2027 starting values (all editable later in Admin → Settings)
-- =============================================================================
-- Items marked "SPEC DEFAULT – CONFIRM" are open questions from the spec
-- (Section 11). They are set to the spec's default answer and can be changed
-- in Settings without any code change.
-- =============================================================================

insert into public.settings (key, value, description, is_public) values
('event', '{"year": 2027, "name": "Recovery Day Alberta 2027"}', 'Event year and name', true),
('invoice', '{"prefix": "2027CD", "digits": 3, "start_number": 1, "gst_enabled": false, "gst_rate": 0}',
 'Invoice number #2027CD001 → prefix + 3 digits. GST is off (no GST on anything).', true),
('payment_rules', '{"deposit_cents": 10000, "deposit_applies_to": ["booth"], "food_truck_deposit": true,
   "balance_due_days_before": 14, "deposit_due": "on_send"}',
 '$100 deposit per booth per city, due when the invoice is sent; balance 14 days before the event. Food-truck deposit and deposit timing = SPEC DEFAULT – CONFIRM.', true),
('refund_rules', '{"full_refund_days": 30, "rentals_refund_days": 14, "no_refund_days": 14,
   "booth_14_29": "minus_deposit", "sponsor_14_29": "none"}',
 'Refund calculator. booth_14_29 and sponsor_14_29 = SPEC DEFAULT – CONFIRM.', true),
('policy_text', '{"title": "Cancellation & Refund Policy", "lines": [
   "Payment in full is due two weeks (14 days) before the event date.",
   "A $100 deposit is required to reserve each booth space.",
   "Cancel 30 or more days before the event: full refund, including your deposit.",
   "Cancel less than 30 days before the event: your $100 deposit is non-refundable.",
   "Tent, table and chair rentals are refundable until 14 days before the event.",
   "Cancellations made less than 14 days before the event are not eligible for a refund.",
   "To cancel, use the Cancel button in your vendor portal or email community@lastdoor.org."]}',
 'Shown on the application, invoice and vendor portal (confirmed wording).', true),
('pay_link', '{"printed": "https://lastdoor.org/pay-for-invoice/",
   "template": "https://lastdoor.org/pay-for-invoice/?purpose=sponsor&reference={invoice}&amount={amount}&org={org}&name={name}&email={email}",
   "help": "Choose Sponsorship and enter invoice #{invoice} as the reference if the form isn''t filled in."}',
 'Last Door payment portal. Parameter names = SPEC DEFAULT – CONFIRM with Major Tom (see docs/MAJOR-TOM.md).', true),
('issuer', '{"name": "LAST DOOR RECOVERY CENTRE",
   "lines": ["323 8th Street", "New Westminster, B.C", "V3M 3R3", "Phone: 604-525-9771", "Fax: 604-525-3896", "email community@lastdoor.org"],
   "total_lines": ["Last Door Recovery Centre", "323 8th Street New Westminster BC, V3M 3R3"],
   "payable": "Payable by Cheque to Last Door Recovery Society or by credit card by visiting this link",
   "footer": "www.lastdoor.org · 323 8th Street New Westminster BC, V3M 3R3 Tel: 1-888-525-8771 Fax: 604-525-3896 info@lastdoor.org"}',
 'Invoice / receipt header, payment line and footer text (from the 2026 template).', true),
('emails', '{"from": "Recovery Day Alberta <noreply@recoverydayalberta.com>", "reply_to": "community@lastdoor.org",
   "staff_inbox": "community@lastdoor.org", "signature": "Recovery Day Alberta team\nThe Last Door Recovery Society\ncommunity@lastdoor.org · 1-888-525-9771"}',
 'Email sender, reply-to and staff notification inbox.', false),
('site', '{"url": "https://recoverydayalberta.com/"}', 'Public site address used in email links (use the github.io address until go-live).', true),
('reminders', '{"deposit_after_days": 7, "balance_before_days": [7, 1], "overdue_after_days": 1, "enabled": true}',
 'Automatic invoice reminders.', false),
('retention', '{"volunteer_months": 24, "documents_months": 12, "financial_years": 7}', 'Privacy retention periods.', false),
('compliance', '{"insurance_required_for": []}', 'Insurance upload is off (event liability policy covers vendors). Add product codes to switch it on.', true),
('security', '{"require_staff_mfa": true}', 'Admin, Finance and Super Admin must use two-factor sign-in.', false),
('volunteers', '{"signup_open": true, "intro": "Thank you for volunteering. We will email your shift once the schedule is ready."}', 'Volunteer sign-up', true)
on conflict (key) do nothing;

-- Cities (dates are null until the 2027 dates are confirmed → "Date to be announced")
insert into public.cities (id, name, event_date, start_time, end_time, venue, address, load_in, entry_street, parking, checkin_location, sort) values
('edmonton', 'Edmonton', null, '12 pm', '5 pm', 'Sir Winston Churchill Square', 'Sir Winston Churchill Square, Edmonton',
 'Vendor load-in 8 am – 11 am', 'To be confirmed', 'To be confirmed', 'Information Table', 1),
('calgary', 'Calgary', null, '12 pm', '5 pm', '4th Street SW, 12th to 17th Avenue SW', '4th Street SW, Calgary',
 'Vendor load-in 8 am – 11 am', '13th Ave (eastbound) / 14th Ave (westbound)', 'To be confirmed', 'Information Table', 2),
('red-deer', 'Red Deer', null, '12 pm', '5 pm', 'City Hall', 'City Hall · 4914 48 Avenue, Red Deer',
 'Vendor load-in 8 am – 11 am', 'To be confirmed', 'To be confirmed', 'Information Table', 3)
on conflict (id) do nothing;

insert into public.products (code, name, kind, price_cents, invoice_label, sub_types, deposit, description, sort) values
('stage_sponsor', 'Stage Sponsor', 'sponsorship', 500000, 'Stage Sponsor', '{}', false, 'Sponsorship. Full amount due 14 days before the event.', 1),
('vendor_booth', 'Vendor Booth / Healthcare Provider / Non-profit', 'booth', 60000, '{sub} Booth', '{Vendor,"Healthcare Provider",Non-profit}', true, 'Booth space only (not a sponsorship).', 2),
('food_truck', 'Food Truck', 'booth', 40000, 'Food Truck', '{}', true, 'Booth space for one food truck.', 3),
('mutual_support', 'Mutual Support Group', 'booth', 30000, 'Mutual Support Group Booth', '{}', true, 'Booth space only (not a sponsorship).', 4),
('artisan', 'Artisan', 'booth', 20000, 'Artisan Booth', '{}', true, 'Booth space only (not a sponsorship).', 5),
('tent', 'Tent 10''x10''', 'rental', 21000, 'Tent 10''x10''', '{}', false, 'Rental, each', 10),
('table', 'Table', 'rental', 4500, 'Table', '{}', false, 'Rental, each', 11),
('chairs_pair', 'Two Chairs', 'rental', 4000, 'Chairs', '{}', false, 'Rental, sold as a pair', 12)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Volunteer shift templates (from the 2026 sheets; display typos cleaned up)
-- Each row = one sheet row (one person). "n" repeats a row n times.
-- Times are minutes after midnight (480 = 8 am, 1020 = 5 pm).
-- ---------------------------------------------------------------------------
create temporary table seed_shift (city text, zone text, zs int, label text, duties text, s int, e int, pref text, adm boolean, n int, ord serial);

-- Red Deer and Edmonton share most of the structure
insert into seed_shift (city, zone, zs, label, duties, s, e, pref, adm, n)
select c, z, zs, label, duties, s, e, pref, adm, n from (values
  ('Zone 1', 1, 'Zone Lead', '', 420, 1140, null, true, 1),
  ('Zone 1', 1, 'Set Up Team 7 am', 'Set Up Dressing Rooms', 420, 540, 'early_setup', false, 4),
  ('Zone 1', 1, 'Parking Lot Attendant 8 am – 6 pm', 'Parking lot attendant', 480, 1080, 'parking', false, 1),
  ('Zone 1', 1, 'Parking Lot Attendant 9 am – 6 pm', 'Parking lot attendant', 540, 1080, 'parking', false, 1),
  ('Zone 1', 1, 'Back Stage Manager', '', 540, 1080, 'backstage', true, 1),
  ('Zone 2', 2, 'Zone Lead', '', 420, 1140, null, true, 1),
  ('Zone 2', 2, 'Road Closure Greeter (Floor Plans) 8 am – 12 pm – Check for Entrance Permit', 'Road Closure Greeter (Floor Plans)', 480, 720, 'road_greeter', false, 2),
  ('Zone 2', 2, '8 am – 12 pm', 'Set Up', 480, 720, 'morning_setup', false, 3),
  ('Zone 2', 2, '5:00 pm – 6:30 pm – Road Closure Greeter – Check for Entrance Permit', 'Check for Permit', 1020, 1110, 'road_greeter', false, 1)
) v(z, zs, label, duties, s, e, pref, adm, n)
cross join (values ('red-deer'), ('edmonton')) cc(c);

insert into seed_shift (city, zone, zs, label, duties, s, e, pref, adm, n) values
  ('red-deer', 'Zone 3 (food Trucks)', 3, 'Zone Lead', '', 420, 1140, null, true, 1),
  ('red-deer', 'Zone 3 (food Trucks)', 3, 'Road Closure Greeter (Floor Plans) 8 am – 12 pm', 'Road Closure Greeter (Floor Plans)', 480, 720, 'road_greeter', false, 2),
  ('red-deer', 'Zone 3 (food Trucks)', 3, '8 am – 12 pm', 'Set Up', 480, 720, 'morning_setup', false, 3),
  ('red-deer', 'Zone 3 (food Trucks)', 3, '5:00 pm – 6:30 pm – Road Closure Greeter – Check for Entrance Permit', 'Check for Permit', 1020, 1110, 'road_greeter', false, 1);

insert into seed_shift (city, zone, zs, label, duties, s, e, pref, adm, n)
select c, z, zs, label, duties, s, e, pref, adm, n from (values
  ('Zone 4 (Kids Zone)', 4, 'Zone Lead', '', 420, 1140, null, true, 1),
  ('Zone 4 (Kids Zone)', 4, '8 am – 12 pm', 'Set Up', 480, 720, 'morning_setup', false, 6),
  ('Zone 4 (Kids Zone)', 4, '11 am – 2 pm', 'Face Painter Line', 660, 840, 'kids_zone', false, 2),
  ('Zone 4 (Kids Zone)', 4, '2 pm – 5 pm', 'Face Painter Line', 840, 1020, 'kids_zone', false, 2),
  ('Zone 4 (Kids Zone)', 4, '11 am – 2 pm', 'Balloon Art Line', 660, 840, 'kids_zone', false, 1),
  ('Zone 4 (Kids Zone)', 4, '2 pm – 5 pm', 'Balloon Art Line', 840, 1020, 'kids_zone', false, 2),
  ('Zone 4 (Kids Zone)', 4, '11 am – 2 pm', 'Kids Zone Tents (Toys)', 660, 840, 'kids_zone', false, 2),
  ('Zone 4 (Kids Zone)', 4, '2 pm – 5 pm', 'Kids Zone Tents (Toys)', 840, 1020, 'kids_zone', false, 2),
  ('Wastes', 5, '11 am – 5 pm Main Area Tent – Garbage A', 'Site Clean Up', 660, 1020, 'waste', false, 1),
  ('Wastes', 5, '11 am – 6 pm Food Truck Area – Garbage B', 'Site Clean Up', 660, 1080, 'waste', false, 1),
  ('Wastes', 5, '11 am – 6 pm Food Truck Area – Garbage B', 'Busperson Food Truck', 660, 1080, 'waste', false, 1),
  ('Wastes', 5, '12 pm – 5 pm – Zone 5 Garbage C', 'Site Clean Up', 720, 1020, 'waste', false, 1),
  ('Wastes', 5, '12 pm – 4 pm – Zone 5 Garbage C', 'Site Clean Up', 720, 960, 'waste', false, 1),
  ('Information Table', 6, 'Zone Lead', '', 420, 1140, null, true, 1),
  ('Information Table', 6, 'Dolly Zone Lead', '', 420, 1140, null, true, 1),
  ('Information Table', 6, '8 am – 12 pm Dolly Controller', 'Control Dolly and bring tents, tables and chairs to zones', 480, 720, 'dolly', false, 2),
  ('Information Table', 6, '8 am – 6 pm', 'Set Up', 480, 1080, 'info_table', false, 1),
  ('Information Table', 6, '8 am – 2 pm', 'Set Up', 480, 840, 'info_table', false, 1),
  ('Information Table', 6, 'All Day', 'Volunteer Check In/Out', 480, 1140, 'info_table', false, 1),
  ('Information Table', 6, '5 pm – 6 pm Dolly Controller', 'Return rentals to central area', 1020, 1080, 'dolly', false, 2),
  ('Tear Down', 7, '5 pm – 7 pm', 'Kids Zone', 1020, 1140, 'teardown', false, 4),
  ('Tear Down', 7, '5 pm – 7 pm', 'Back Stage', 1020, 1140, 'teardown', false, 4),
  ('Tear Down', 7, '5 pm – 7 pm', 'Vendors', 1020, 1140, 'teardown', false, 3)
) v(z, zs, label, duties, s, e, pref, adm, n)
cross join (values ('red-deer'), ('edmonton')) cc(c);

insert into seed_shift (city, zone, zs, label, duties, s, e, pref, adm, n) values
  ('edmonton', 'Information Table', 6, 'Information Table 11 am – 6 pm', 'Information Table', 660, 1080, 'info_table', false, 1),
  ('edmonton', 'Information Table', 6, 'Information Table 11 am – 2 pm', 'Information Table', 660, 840, 'info_table', false, 1);

-- Calgary (4th Street SW, larger)
insert into seed_shift (city, zone, zs, label, duties, s, e, pref, adm, n) values
  ('calgary', 'Zone 1', 1, 'Zone Lead (All Day)', '', 390, 1140, null, true, 1),
  ('calgary', 'Zone 1', 1, 'Set Up Team 6:30 am', 'Set Up Dressing Rooms', 390, 540, 'early_setup', false, 3),
  ('calgary', 'Zone 1', 1, 'Set Up Team 6:30 am', 'Set up Backstage', 390, 540, 'early_setup', false, 3),
  ('calgary', 'Zone 1', 1, 'Hospitality', 'Coordinate Food', 600, 1080, 'backstage', false, 1),
  ('calgary', 'Zone 1', 1, 'Parking Lot Attendant 8 am – 12 pm', 'Parking lot attendant', 480, 720, 'parking', false, 2),
  ('calgary', 'Zone 1', 1, 'Parking Lot Attendant 10 am – 6 pm', 'Parking lot attendant', 600, 1080, 'parking', false, 1),
  ('calgary', 'Zone 1', 1, 'Tear Down 6:30 pm', 'Tear Down', 1110, 1200, 'teardown', false, 6),
  ('calgary', 'Zone 2', 2, 'Zone Lead (All Day)', '', 420, 1140, null, true, 1),
  ('calgary', 'Zone 2', 2, 'Road Closure Greeter (Floor Plans) 8 am – 12 pm – 13th Ave Eastbound', 'Road Closure Greeter (Floor Plans)', 480, 720, 'road_greeter', false, 2),
  ('calgary', 'Zone 2', 2, '8 am – 12 pm', 'Set Up', 480, 720, 'morning_setup', false, 4),
  ('calgary', 'Zone 2', 2, 'Road Closure Greeter (Floor Plans) 5 pm – 6:30 pm – 13th Ave Eastbound', 'Road Closure Greeter (Floor Plans)', 1020, 1110, 'road_greeter', false, 1),
  ('calgary', 'Zone 2', 2, '5 pm', 'Tear Down', 1020, 1140, 'teardown', false, 1),
  ('calgary', 'Zone 3 (food Trucks)', 3, 'Zone Lead (All Day)', '', 420, 1140, null, true, 1),
  ('calgary', 'Zone 3 (food Trucks)', 3, '8 am – 12 pm', 'Set Up', 480, 720, 'morning_setup', false, 3),
  ('calgary', 'Zone 3 (food Trucks)', 3, 'Road Closure Greeter (Floor Plans) 8 am – 12 pm – 14th Ave Westbound', 'Check off Vendors', 480, 720, 'road_greeter', false, 2),
  ('calgary', 'Zone 3 (food Trucks)', 3, '5:00 pm – 6:30 pm – Road Closure Greeter – Check for Entrance Permit – 14th Ave East', 'Check for Permit', 1020, 1110, 'road_greeter', false, 1),
  ('calgary', 'Zone 3 (food Trucks)', 3, '5 pm', 'Tear Down', 1020, 1140, 'teardown', false, 1),
  ('calgary', 'Zone 4', 4, 'Zone Lead (All Day)', '', 420, 1140, null, true, 1),
  ('calgary', 'Zone 4', 4, 'Vendor Exit (15th Ave, enter Eastbound) 8:30 am – 12 pm', 'Check off Vendors', 510, 720, 'road_greeter', false, 2),
  ('calgary', 'Zone 4', 4, '8 am – 12 pm', 'Set Up', 480, 720, 'morning_setup', false, 3),
  ('calgary', 'Zone 4', 4, '5 pm', 'Tear Down', 1020, 1140, 'teardown', false, 4),
  ('calgary', 'Zone 5 (Kids Zone)', 5, 'Zone Lead (All Day)', '', 420, 1140, null, true, 1),
  ('calgary', 'Zone 5 (Kids Zone)', 5, '8 am – 12 pm', 'Set Up', 480, 720, 'morning_setup', false, 4),
  ('calgary', 'Zone 5 (Kids Zone)', 5, '8 am – 12 pm – 17th Ave West', 'Let cars out on 17th Ave', 480, 720, 'road_greeter', false, 1),
  ('calgary', 'Zone 5 (Kids Zone)', 5, '11 am – 2 pm', 'Face Painter Line', 660, 840, 'kids_zone', false, 3),
  ('calgary', 'Zone 5 (Kids Zone)', 5, '2 pm – 5 pm', 'Face Painter Line', 840, 1020, 'kids_zone', false, 2),
  ('calgary', 'Zone 5 (Kids Zone)', 5, '11 am – 2 pm', 'Balloon Art Line', 660, 840, 'kids_zone', false, 1),
  ('calgary', 'Zone 5 (Kids Zone)', 5, '2 pm – 5 pm', 'Balloon Art Line', 840, 1020, 'kids_zone', false, 3),
  ('calgary', 'Zone 5 (Kids Zone)', 5, '11 am – 2 pm', 'Kids Zone Tents (Toys)', 660, 840, 'kids_zone', false, 2),
  ('calgary', 'Zone 5 (Kids Zone)', 5, '1 pm – 5 pm', 'Kids Zone Tents (Toys)', 780, 1020, 'kids_zone', false, 1),
  ('calgary', 'Zone 5 (Kids Zone)', 5, '2 pm – 5 pm', 'Kids Zone Tents (Toys)', 840, 1020, 'kids_zone', false, 2),
  ('calgary', 'Zone 5 (Kids Zone)', 5, '2 pm – 6 pm', 'Kids Zone Tents (Toys)', 840, 1080, 'kids_zone', false, 2),
  ('calgary', 'Zone 5 (Kids Zone)', 5, 'Tear Down', 'Tear Down', 1020, 1140, 'teardown', false, 6),
  ('calgary', 'Waste', 6, '11 am – 6 pm Main Area Tent – Garbage A', 'Site Clean Up', 660, 1080, 'waste', false, 2),
  ('calgary', 'Waste', 6, '11 am – 6 pm Food Truck Area – Garbage B', 'Site Clean Up', 660, 1080, 'waste', false, 1),
  ('calgary', 'Waste', 6, '11 am – 6 pm Food Truck Area – Garbage B', 'Bus Person', 660, 1080, 'waste', false, 1),
  ('calgary', 'Backstage Security', 7, 'Zone Lead (All Day)', 'Backstage Badge Check', 420, 1140, null, true, 1),
  ('calgary', 'Backstage Security', 7, 'Hired Guard', 'Dressing room badge check', 600, 1140, null, true, 1),
  ('calgary', 'Backstage Security', 7, 'Hired Guard', 'Floater', 600, 1140, null, true, 2),
  ('calgary', 'Backstage Security', 7, 'Hired Guard', 'Front of Stage', 600, 1140, null, true, 3),
  ('calgary', 'First Aid', 8, 'First Aid', '', 600, 1080, null, true, 1),
  ('calgary', 'Information Table', 9, 'Zone Lead (All Day)', '', 420, 1140, null, true, 1),
  ('calgary', 'Information Table', 9, '8 am – 12 pm', 'Information Table', 480, 720, 'info_table', false, 2),
  ('calgary', 'Information Table', 9, '8 am – 12 pm Dolly Controller', 'Coordinate Set Up', 480, 720, 'dolly', false, 4),
  ('calgary', 'Information Table', 9, '8 am – 12 pm', 'Set Up', 480, 720, 'morning_setup', false, 3),
  ('calgary', 'Information Table', 9, '8 am – 3 pm', 'Volunteer Check In/Out', 480, 900, 'info_table', false, 1),
  ('calgary', 'Information Table', 9, '5 pm', 'Tear Down', 1020, 1140, 'teardown', false, 4),
  ('calgary', 'Information Table', 9, '11 am – 2 pm', 'Information/Merch/Donations', 660, 840, 'info_table', false, 3),
  ('calgary', 'Information Table', 9, '2 pm – 6 pm', 'Information/Merch/Donations', 840, 1080, 'info_table', false, 2),
  ('calgary', 'Information Table', 9, '3 pm – 6 pm', 'Information/Merch/Donations', 900, 1080, 'info_table', false, 1),
  ('calgary', 'Information Table', 9, '5 pm – 7 pm', 'Tear Down', 1020, 1140, 'teardown', false, 2),
  ('calgary', 'Information Table', 9, '5 pm – 6 pm Dolly Controller', 'Return rentals to central area', 1020, 1080, 'dolly', false, 2),
  ('calgary', 'Last Door Booth', 10, '8 am – 12 pm', 'Set up / Watch Prizes', 480, 720, 'info_table', false, 1),
  ('calgary', 'Last Door Booth', 10, '11 am – 2 pm', 'Last Door Booth', 660, 840, 'info_table', false, 2),
  ('calgary', 'Last Door Booth', 10, '11:30 am – 3 pm', 'Last Door Booth', 690, 900, 'info_table', false, 1),
  ('calgary', 'Last Door Booth', 10, '3 pm – 6 pm', 'Last Door Booth', 900, 1080, 'info_table', false, 4);

insert into public.shifts (city_id, zone, zone_sort, label, duties, role_group, start_min, end_min, pref_key, admin_only, sort)
select city, zone, zs, label, nullif(duties, ''), coalesce(nullif(duties, ''), label), s, e, pref, adm,
       row_number() over (partition by city order by zs, ord, g)
from seed_shift, generate_series(1, n) g
where not exists (select 1 from public.shifts);

drop table seed_shift;

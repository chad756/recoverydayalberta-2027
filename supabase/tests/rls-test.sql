-- Local security test (developer use only; run with supabase/tests/run-local.sh)
-- Pretends to be different users and checks Row Level Security + functions.
\set ON_ERROR_STOP 1

create or replace function public.t_ok(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'TEST FAILED: %', msg; end if; raise notice 'ok - %', msg; end $$;
create or replace function public.t_err(stmt text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then raise notice 'ok - % (blocked: %)', msg, sqlerrm; return; end;
  raise exception 'TEST FAILED (no error): %', msg;
end $$;
grant execute on function public.t_ok(boolean, text), public.t_err(text, text) to anon, authenticated;

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000a', 'vendor-a@example.com'),
 ('00000000-0000-0000-0000-00000000000b', 'vendor-b@example.com'),
 ('00000000-0000-0000-0000-0000000000ad', 'admin@example.com'),
 ('00000000-0000-0000-0000-0000000000f1', 'finance@example.com');
update public.profiles set role = 'admin'   where email = 'admin@example.com';
update public.profiles set role = 'finance' where email = 'finance@example.com';
update public.cities set event_date = '2027-09-19' where id = 'calgary';

-- ===== Vendor A applies =====
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal1"}', false);
select public.create_my_organization('{"legal_name":"Holina Global","contact_name":"Pat Lee","contact_email":"vendor-a@example.com","street":"1 Main St","city":"Calgary","province":"AB","postal_code":"T2P 1A1"}');
select public.t_ok(public.my_org_id() is not null, 'vendor A linked to a new organization');
insert into public.applications (organization_id, event_year, terms_accepted_at, policy_accepted_at, comms_consent_at)
  values (public.my_org_id(), 2027, now(), now(), now());
insert into public.application_items (application_id, city_id, product_code, sub_type, tents, tables, chair_pairs)
  select id, 'calgary', 'vendor_booth', 'Vendor', 1, 1, 1 from public.applications;
select public.t_err($$update public.profiles set role = 'super_admin' where id = auth.uid()$$, 'vendor cannot make themselves super admin');
select public.t_err($$update public.applications set status = 'accepted'$$, 'vendor cannot accept their own application');
select public.t_err($$select public.decide_application((select id from public.applications), 'accepted')$$, 'vendor cannot call admin functions');
select public.submit_application((select id from public.applications));
select public.t_ok((select status from public.applications) = 'submitted', 'vendor submitted the application');
select public.t_err($$update public.application_items set tents = 5$$, 'submitted application is locked for the vendor');

-- ===== Vendor B sees nothing of A =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', false);
select public.t_ok((select count(*) from public.applications) = 0, 'vendor B cannot see vendor A application');
select public.t_ok((select count(*) from public.organizations) = 0, 'vendor B cannot see vendor A organization');
select public.t_ok((select count(*) from public.volunteers) = 0, 'vendor B cannot see volunteers');
select public.t_ok((select count(*) from public.audit_log) = 0, 'vendor B cannot read the audit log');

-- ===== Admin without two-factor is blocked =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated","aal":"aal1"}', false);
select public.t_ok((select count(*) from public.applications) = 1, 'admin can read applications');
select public.t_err($$select public.decide_application((select id from public.applications), 'accepted')$$, 'admin without 2FA cannot accept');

-- ===== Admin with two-factor accepts and creates the draft invoice =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated","aal":"aal2"}', false);
select public.t_ok(public.decide_application((select id from public.applications), 'accepted') = 1, 'accept assigns file number 1');
select public.create_invoice(
  jsonb_build_object('organization_id', (select organization_id from public.applications), 'application_id', (select id from public.applications),
                     'total_cents', 89500, 'deposit_cents', 10000, 'balance_due', '2027-09-05'),
  '[{"sort":0,"line_type":"booth","product_code":"vendor_booth","city_id":"calgary","description":"Vendor Booth – Recovery Day Calgary","amount_cents":60000},
    {"sort":1,"line_type":"rental","product_code":"rentals","city_id":"calgary","description":"Tent 10''x10'' (1) Table (1) Chairs (2)","amount_cents":29500}]');
select public.t_ok((select number from public.invoices) = '2027CD001', 'first invoice number is 2027CD001');
select public.t_err($$select public.create_invoice(jsonb_build_object('organization_id', (select organization_id from public.applications), 'application_id', (select id from public.applications)), '[]')$$, 'no second open invoice for the same application');

-- Vendor cannot see the draft
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
select public.t_ok((select count(*) from public.invoices) = 0, 'vendor cannot see a DRAFT invoice');

-- Admin sends it
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated","aal":"aal2"}', false);
update public.invoices set status = 'sent', issue_date = '2027-06-01', sent_at = now();
select public.t_err($$update public.invoice_lines set amount_cents = 1$$, 'lines are frozen after sending');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
select public.t_ok((select count(*) from public.invoices) = 1, 'vendor sees the sent invoice');
select public.t_err($$select public.record_payment(jsonb_build_object('invoice_id', (select id from public.invoices), 'amount_cents', 100))$$, 'vendor cannot record payments');
insert into public.payment_reports (invoice_id, organization_id, paid_on, amount_cents, payer_email)
  select id, organization_id, '2027-06-02', 10000, 'vendor-a@example.com' from public.invoices;
select public.t_ok((select count(*) from public.payment_reports) = 1, 'vendor can report a payment');

-- ===== Finance records the deposit, duplicate webhook ignored =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated","aal":"aal2"}', false);
select public.t_ok(public.record_payment(jsonb_build_object('invoice_id', (select id from public.invoices), 'amount_cents', 10000,
  'method', 'card', 'received_label', 'Paid Visa LD', 'source', 'webhook', 'external_id', 'pi_123')) = 'R-2027-0001', 'receipt R-2027-0001 issued');
select public.t_ok(public.record_payment(jsonb_build_object('invoice_id', (select id from public.invoices), 'amount_cents', 10000,
  'method', 'card', 'source', 'webhook', 'external_id', 'pi_123')) is null, 'duplicate Stripe id ignored');
select public.t_err($$select public.record_payment(jsonb_build_object('invoice_id', (select id from public.invoices), 'amount_cents', 999999, 'method', 'cash'))$$, 'overpayment rejected');
delete from public.payments;
select public.t_ok((select count(*) from public.payments) = 1, 'payments cannot be deleted');
select public.t_err($$update public.payments set amount_cents = 1$$, 'staff cannot edit a payment amount directly');
update public.payments set needs_review = false;
select public.t_ok((select bool_and(not needs_review) from public.payments), 'finance can mark a payment as checked');
select public.t_err($$select public.record_refund(jsonb_build_object('invoice_id', (select id from public.invoices), 'amount_cents', 5000, 'calculated_cents', 10000))$$, 'refund override needs a note');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
select public.t_ok((select count(*) from public.payments) = 1 and (select count(*) from public.receipts) = 1, 'vendor sees own payment and receipt');

-- ===== Volunteers (anonymous public form) =====
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
set role anon;
select public.t_ok(public.volunteer_signup('{"name":"Sam Test","email":"sam@example.com","is_adult":true,"cities":["calgary","edmonton"],
  "preferences":["morning_setup"],"availability":"morning","comms_consent":true}') = 2, 'anonymous volunteer sign-up creates one row per city');
select public.t_ok((select count(*) from public.volunteers) = 0, 'anonymous visitors cannot read volunteers');
select public.t_err($$select public.volunteer_signup('{"name":"Teen","email":"teen@example.com","is_adult":false,"age_14_plus":true,"cities":["calgary"],"comms_consent":true}')$$, 'under 18 needs guardian consent');
select public.t_err($$select public.volunteer_signup('{"name":"Kid","email":"kid@example.com","is_adult":false,"age_14_plus":false,"cities":["calgary"],"comms_consent":true}')$$, 'under 14 cannot sign up alone');
select public.t_ok((select count(*) from public.invoices) = 0, 'anonymous visitors cannot read invoices');
select public.t_ok((select count(*) from public.products) = 8, 'public can read prices');
reset role;

-- magic link only shows that volunteer
insert into public.assignments (shift_id, volunteer_id, status)
  select (select id from public.shifts where city_id = 'calgary' and pref_key = 'morning_setup' limit 1),
         (select id from public.volunteers where city_id = 'calgary'), 'published';
select access_token as tok from public.volunteers where city_id = 'calgary' \gset
set role anon;
select public.t_ok(jsonb_array_length(public.volunteer_portal(:'tok') -> 'shifts') = 1, 'magic link shows the published shift');
select public.t_ok(public.volunteer_portal(gen_random_uuid()) is null, 'a made-up token shows nothing');
reset role;
select public.volunteer_respond((select access_token from public.volunteers where city_id = 'calgary'), (select id from public.assignments), 'decline');
select public.t_ok((select count(*) from public.assignments) = 0 and (select count(*) from public.declines) = 1, 'declining reopens the slot and remembers the decline');
select public.t_ok((select count(*) from public.audit_log) > 10, 'audit log is recording changes');
\echo 'ALL SECURITY TESTS PASSED'

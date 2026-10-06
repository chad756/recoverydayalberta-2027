-- =============================================================================
-- 003_functions.sql  —  actions the website calls (supabase.rpc('name', …))
-- =============================================================================
-- Each function checks who is calling before it does anything. They run as
-- "security definer" so they can do several steps in one safe transaction
-- (for example: give out the next invoice number AND create the invoice).
-- =============================================================================

create or replace function public.staff_mfa_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal', '') = 'aal2'
         or coalesce((select value from public.settings where key = 'security') ->> 'require_staff_mfa', 'true') = 'false'
$$;

create or replace function public.trust() returns void
language sql as $$ select set_config('rda.trusted', 'on', true) $$;

create or replace function public.next_counter(p_name text) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into public.counters (name, value) values (p_name, 1)
  on conflict (name) do update set value = public.counters.value + 1
  returning value into v;
  return v;
end $$;
revoke execute on function public.next_counter(text) from public, anon, authenticated;

create or replace function public.setting(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select value from public.settings where key = p_key
$$;

create or replace function public.event_year() returns int
language sql stable security definer set search_path = public as $$
  select coalesce((public.setting('event') ->> 'year')::int, extract(year from now() at time zone 'America/Edmonton')::int)
$$;

-- ---------------------------------------------------------------------------
-- Vendor: create (or update) my organization and link it to my profile
-- ---------------------------------------------------------------------------
create or replace function public.create_my_organization(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'Please log in first.'; end if;
  perform public.trust();
  v_org := public.my_org_id();
  if v_org is null then
    insert into public.organizations (legal_name, created_by) values (coalesce(nullif(trim(p ->> 'legal_name'), ''), 'New organization'), auth.uid())
    returning id into v_org;
    update public.profiles set organization_id = v_org where id = auth.uid();
  end if;
  update public.organizations set
    legal_name    = coalesce(nullif(trim(p ->> 'legal_name'), ''), legal_name),
    display_name  = p ->> 'display_name',
    org_type      = nullif(p ->> 'org_type', ''),
    gst_number    = p ->> 'gst_number',
    website       = p ->> 'website',
    socials       = p ->> 'socials',
    description   = p ->> 'description',
    contact_name  = p ->> 'contact_name',
    contact_email = p ->> 'contact_email',
    contact_phone = p ->> 'contact_phone',
    billing_name  = p ->> 'billing_name',
    billing_email = p ->> 'billing_email',
    street        = p ->> 'street',
    city          = p ->> 'city',
    province      = p ->> 'province',
    postal_code   = p ->> 'postal_code',
    directory_opt_in = coalesce((p ->> 'directory_opt_in')::boolean, false)
  where id = v_org;
  return v_org;
end $$;

-- ---------------------------------------------------------------------------
-- Vendor: submit / cancel
-- ---------------------------------------------------------------------------
create or replace function public.submit_application(p_app uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.applications; o public.organizations;
begin
  select * into a from public.applications where id = p_app;
  if a.id is null or a.organization_id is distinct from public.my_org_id() then raise exception 'Application not found.'; end if;
  if a.status not in ('draft','changes_requested') then raise exception 'This application was already submitted.'; end if;
  select * into o from public.organizations where id = a.organization_id;
  if coalesce(o.legal_name,'') = '' or coalesce(o.contact_email,'') = '' or coalesce(o.street,'') = '' or coalesce(o.postal_code,'') = '' then
    raise exception 'Please complete your organization, contact and mailing address first.';
  end if;
  if not exists (select 1 from public.application_items where application_id = p_app) then
    raise exception 'Please choose at least one city and product.';
  end if;
  if a.terms_accepted_at is null or a.policy_accepted_at is null or a.comms_consent_at is null then
    raise exception 'Please accept the vendor terms, the cancellation policy and event communications.';
  end if;
  perform public.trust();
  update public.applications set status = 'submitted', submitted_at = now() where id = p_app;
end $$;

create or replace function public.request_cancellation(p_app uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare a public.applications;
begin
  select * into a from public.applications where id = p_app;
  if a.id is null or (a.organization_id is distinct from public.my_org_id() and not public.admin_ok()) then
    raise exception 'Application not found.';
  end if;
  if a.status in ('cancelled','declined') then raise exception 'This application is already closed.'; end if;
  perform public.trust();
  update public.applications
     set status = case when a.status in ('draft') then 'cancelled' else 'cancel_requested' end,
         cancel_reason = left(p_reason, 2000)
   where id = p_app;
end $$;

-- ---------------------------------------------------------------------------
-- Admin: decisions
-- ---------------------------------------------------------------------------
create or replace function public.decide_application(p_app uuid, p_status text, p_reason text default null) returns int
language plpgsql security definer set search_path = public as $$
declare a public.applications; v_file int;
begin
  if not public.admin_ok() then raise exception 'Admins only (with two-factor sign-in).'; end if;
  if p_status not in ('under_review','accepted','waitlisted','declined','changes_requested','cancelled') then
    raise exception 'Unknown status %', p_status;
  end if;
  select * into a from public.applications where id = p_app;
  if a.id is null then raise exception 'Application not found.'; end if;
  if p_status = 'accepted' then
    select file_number into v_file from public.organizations where id = a.organization_id;
    if v_file is null then
      v_file := public.next_counter('file_number:' || a.event_year);
      update public.organizations set file_number = v_file where id = a.organization_id;
    end if;
  end if;
  update public.applications set status = p_status, decision_reason = p_reason,
         decided_at = now(), decided_by = auth.uid() where id = p_app;
  return v_file;
end $$;

-- ---------------------------------------------------------------------------
-- Invoices: create a DRAFT with the next number (never sent automatically)
-- p_invoice: {organization_id, application_id, total_cents, deposit_cents, balance_due, notes}
-- p_lines:   [{sort, line_type, product_code, city_id, description, detail, quantity, amount_cents}]
-- ---------------------------------------------------------------------------
create or replace function public.create_invoice(p_invoice jsonb, p_lines jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_num text; s jsonb := public.setting('invoice');
  v_prefix text := coalesce(s ->> 'prefix', public.event_year() || 'CD');
  v_digits int := coalesce((s ->> 'digits')::int, 3);
  v_start  int := coalesce((s ->> 'start_number')::int, 1);
  v_n int; o public.organizations; l jsonb;
begin
  if not public.finance_ok() then raise exception 'Admin or Finance only (with two-factor sign-in).'; end if;
  select * into o from public.organizations where id = (p_invoice ->> 'organization_id')::uuid;
  if o.id is null then raise exception 'Organization not found.'; end if;
  if p_invoice ->> 'application_id' is not null and exists (
       select 1 from public.invoices where application_id = (p_invoice ->> 'application_id')::uuid and status in ('draft','sent')) then
    raise exception 'This application already has an open invoice.';
  end if;
  v_n := public.next_counter('invoice:' || v_prefix) + v_start - 1;
  v_num := v_prefix || lpad(v_n::text, v_digits, '0');
  insert into public.invoices (number, organization_id, application_id, event_year, status, bill_name, bill_contact, bill_email,
                               bill_address, total_cents, deposit_cents, balance_due, notes, created_by)
  values (v_num, o.id, nullif(p_invoice ->> 'application_id','')::uuid, public.event_year(), 'draft',
          o.legal_name, coalesce(nullif(o.billing_name,''), o.contact_name), coalesce(nullif(o.billing_email,''), o.contact_email),
          concat_ws(E'\n', o.street, concat_ws(', ', o.city, o.province), o.postal_code),
          coalesce((p_invoice ->> 'total_cents')::int, 0), coalesce((p_invoice ->> 'deposit_cents')::int, 0),
          nullif(p_invoice ->> 'balance_due','')::date, p_invoice ->> 'notes', auth.uid())
  returning id into v_id;
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    insert into public.invoice_lines (invoice_id, sort, line_type, product_code, city_id, description, detail, quantity, amount_cents)
    values (v_id, coalesce((l ->> 'sort')::int, 0), l ->> 'line_type', l ->> 'product_code', nullif(l ->> 'city_id',''),
            l ->> 'description', l ->> 'detail', coalesce((l ->> 'quantity')::int, 1), (l ->> 'amount_cents')::int);
  end loop;
  return v_id;
end $$;

-- Replace all lines of a draft (admin edits) and update its totals
create or replace function public.save_draft_invoice(p_id uuid, p_invoice jsonb, p_lines jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare l jsonb;
begin
  if not public.finance_ok() then raise exception 'Admin or Finance only.'; end if;
  if (select status from public.invoices where id = p_id) <> 'draft' then raise exception 'Only drafts can be edited.'; end if;
  delete from public.invoice_lines where invoice_id = p_id;
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    insert into public.invoice_lines (invoice_id, sort, line_type, product_code, city_id, description, detail, quantity, amount_cents)
    values (p_id, coalesce((l ->> 'sort')::int, 0), l ->> 'line_type', l ->> 'product_code', nullif(l ->> 'city_id',''),
            l ->> 'description', l ->> 'detail', coalesce((l ->> 'quantity')::int, 1), (l ->> 'amount_cents')::int);
  end loop;
  update public.invoices set
    total_cents = (select coalesce(sum(amount_cents),0) from public.invoice_lines where invoice_id = p_id),
    deposit_cents = coalesce((p_invoice ->> 'deposit_cents')::int, deposit_cents),
    balance_due = coalesce(nullif(p_invoice ->> 'balance_due','')::date, balance_due),
    notes = coalesce(p_invoice ->> 'notes', notes),
    bill_name = coalesce(p_invoice ->> 'bill_name', bill_name),
    bill_contact = coalesce(p_invoice ->> 'bill_contact', bill_contact),
    bill_email = coalesce(p_invoice ->> 'bill_email', bill_email),
    bill_address = coalesce(p_invoice ->> 'bill_address', bill_address)
  where id = p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Payments + receipts (manual entry, imports, webhook, vendor-report confirm)
-- p: {invoice_id, amount_cents, method, received_label, paid_at, reference, source,
--     external_id, payer_name, payer_email, needs_review}
-- Returns the receipt number.
-- ---------------------------------------------------------------------------
create or replace function public.record_payment(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_pay uuid; v_rec text; i public.invoices; v_paid int;
begin
  if not (public.finance_ok() or public.is_service()) then raise exception 'Finance or Admin only.'; end if;
  select * into i from public.invoices where id = (p ->> 'invoice_id')::uuid for update;
  if i.id is null then raise exception 'Invoice not found.'; end if;
  if i.status not in ('sent') then raise exception 'Invoice % is %; payments can only be recorded on sent invoices.', i.number, i.status; end if;
  if p ->> 'external_id' is not null and exists (select 1 from public.payments where external_id = p ->> 'external_id') then
    return null; -- duplicate notification: ignore
  end if;
  select coalesce(sum(amount_cents),0) into v_paid from public.payments where invoice_id = i.id and not voided;
  if (p ->> 'amount_cents')::int > i.total_cents - v_paid then
    raise exception 'Amount is more than the balance owing on %.', i.number;
  end if;
  insert into public.payments (invoice_id, amount_cents, method, received_label, paid_at, reference, source, external_id,
                               payer_name, payer_email, needs_review, recorded_by)
  values (i.id, (p ->> 'amount_cents')::int, coalesce(p ->> 'method','other'), coalesce(p ->> 'received_label','Paid'),
          coalesce(nullif(p ->> 'paid_at','')::date, (now() at time zone 'America/Edmonton')::date),
          p ->> 'reference', coalesce(p ->> 'source','manual'), p ->> 'external_id',
          p ->> 'payer_name', p ->> 'payer_email', coalesce((p ->> 'needs_review')::boolean, false), auth.uid())
  returning id into v_pay;
  v_rec := 'R-' || i.event_year || '-' || lpad(public.next_counter('receipt:' || i.event_year)::text, 4, '0');
  insert into public.receipts (number, payment_id, invoice_id) values (v_rec, v_pay, i.id);
  return v_rec;
end $$;

create or replace function public.void_payment(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.finance_ok() then raise exception 'Finance or Admin only.'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'A reason is required.'; end if;
  update public.payments set voided = true, void_reason = p_reason where id = p_payment;
end $$;

-- ---------------------------------------------------------------------------
-- Refunds (calculated in the browser with rules.js; override needs a note)
-- p: {invoice_id, amount_cents, calculated_cents, override_note, reason, cancel_date, refunded_at}
-- ---------------------------------------------------------------------------
create or replace function public.record_refund(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; i public.invoices; v_paid int;
begin
  if not public.finance_ok() then raise exception 'Finance or Admin only.'; end if;
  select * into i from public.invoices where id = (p ->> 'invoice_id')::uuid for update;
  if i.id is null then raise exception 'Invoice not found.'; end if;
  select coalesce(sum(amount_cents),0) into v_paid from public.payments where invoice_id = i.id and not voided;
  if (p ->> 'amount_cents')::int > v_paid then raise exception 'Refund is more than what was paid.'; end if;
  if (p ->> 'amount_cents')::int <> (p ->> 'calculated_cents')::int and coalesce(trim(p ->> 'override_note'),'') = '' then
    raise exception 'Please add a note explaining why the refund differs from the calculated amount.';
  end if;
  perform public.trust();
  insert into public.refunds (invoice_id, amount_cents, calculated_cents, override_note, reason, cancel_date, refunded_at, recorded_by)
  values (i.id, (p ->> 'amount_cents')::int, (p ->> 'calculated_cents')::int, p ->> 'override_note', p ->> 'reason',
          coalesce(nullif(p ->> 'cancel_date','')::date, (now() at time zone 'America/Edmonton')::date),
          nullif(p ->> 'refunded_at','')::date, auth.uid())
  returning id into v_id;
  update public.invoices set status = 'cancelled' where id = i.id;
  if i.application_id is not null then
    update public.applications set status = 'cancelled' where id = i.application_id;
    update public.booths set application_item_id = null
     where application_item_id in (select id from public.application_items where application_id = i.application_id);
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Volunteers: public sign-up (no account). One row per chosen city.
-- ---------------------------------------------------------------------------
create or replace function public.volunteer_signup(p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare c text; n int := 0; v_year int := public.event_year(); v_adult boolean := coalesce((p ->> 'is_adult')::boolean, false);
begin
  if coalesce((p ->> 'comms_consent')::boolean, false) is not true then
    raise exception 'Please agree to be contacted about your volunteer shifts.';
  end if;
  if not v_adult and coalesce((p ->> 'age_14_plus')::boolean, false) is not true then
    raise exception 'Volunteers under 14 can''t sign up on their own. Please have a parent or guardian contact community@lastdoor.org.';
  end if;
  if not v_adult and (coalesce(p ->> 'guardian_name', '') = '' or coalesce(p ->> 'guardian_contact', '') = ''
      or coalesce((p ->> 'guardian_consent')::boolean, false) is not true) then
    raise exception 'Volunteers under 18 need a parent or guardian name, contact and consent.';
  end if;
  if jsonb_array_length(coalesce(p -> 'cities', '[]'::jsonb)) = 0 then raise exception 'Please choose at least one city.'; end if;
  -- simple abuse limit: at most 20 sign-ups per email per year
  if (select count(*) from public.volunteers where lower(email) = lower(p ->> 'email') and event_year = v_year) >= 20 then
    raise exception 'Too many sign-ups for this email.';
  end if;
  perform public.trust();
  for c in select jsonb_array_elements_text(p -> 'cities') loop
    if not exists (select 1 from public.cities where id = c and active) then continue; end if;
    delete from public.volunteers v where lower(v.email) = lower(p ->> 'email') and v.city_id = c and v.event_year = v_year
      and not exists (select 1 from public.assignments a where a.volunteer_id = v.id);
    insert into public.volunteers (city_id, event_year, name, email, phone, is_adult, age_14_plus, guardian_name, guardian_contact,
      guardian_consent_at, preferences, availability, experience, returning_volunteer, other_festivals, group_name, group_size, tshirt_size,
      emergency_name, emergency_phone, accessibility, comms_consent_at, media_consent_at, marketing_opt_in_at)
    values (c, v_year, trim(p ->> 'name'), lower(trim(p ->> 'email')), p ->> 'phone', v_adult,
      v_adult or coalesce((p ->> 'age_14_plus')::boolean, false),
      nullif(p ->> 'guardian_name',''), nullif(p ->> 'guardian_contact',''),
      case when coalesce((p ->> 'guardian_consent')::boolean, false) then now() end,
      coalesce(array(select jsonb_array_elements_text(p -> 'preferences')), '{}'),
      coalesce(nullif(p ->> 'availability',''), 'all_day'), nullif(p ->> 'experience',''),
      coalesce((p ->> 'returning')::boolean, false), coalesce((p ->> 'other_festivals')::boolean, false),
      nullif(p ->> 'group_name',''), nullif(p ->> 'group_size','')::int, nullif(p ->> 'tshirt_size',''),
      nullif(p ->> 'emergency_name',''), nullif(p ->> 'emergency_phone',''), nullif(p ->> 'accessibility',''),
      now(), case when coalesce((p ->> 'media_consent')::boolean, false) then now() end,
      case when coalesce((p ->> 'marketing_opt_in')::boolean, false) then now() end);
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function public.volunteer_signup(jsonb) to anon, authenticated;

-- Magic link: a volunteer sees ONLY their own shifts, using their private token
create or replace function public.volunteer_portal(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', v.name,
    'city', c.name,
    'event_date', c.event_date,
    'checkin_location', c.checkin_location,
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'zone', s.zone, 'label', s.label, 'duties', s.duties,
               'start_min', s.start_min, 'end_min', s.end_min, 'status', a.status) order by s.start_min, s.sort)
      from public.assignments a join public.shifts s on s.id = a.shift_id
      where a.volunteer_id = v.id and a.status in ('published','confirmed')), '[]'::jsonb))
  from public.volunteers v join public.cities c on c.id = v.city_id
  where v.access_token = p_token and v.status = 'active'
$$;
grant execute on function public.volunteer_portal(uuid) to anon, authenticated;

create or replace function public.volunteer_respond(p_token uuid, p_assignment uuid, p_answer text) returns void
language plpgsql security definer set search_path = public as $$
declare v_vol uuid; a public.assignments;
begin
  select id into v_vol from public.volunteers where access_token = p_token and status = 'active';
  select * into a from public.assignments where id = p_assignment and volunteer_id = v_vol;
  if v_vol is null or a.id is null then raise exception 'Shift not found.'; end if;
  perform public.trust();
  if p_answer = 'confirm' then
    update public.assignments set status = 'confirmed' where id = a.id;
  elsif p_answer = 'decline' then
    insert into public.declines (shift_id, volunteer_id) values (a.shift_id, v_vol) on conflict do nothing;
    delete from public.assignments where id = a.id;   -- the slot reopens
  else raise exception 'Unknown answer.'; end if;
end $$;
grant execute on function public.volunteer_respond(uuid, uuid, text) to anon, authenticated;

-- Admin: save an auto-schedule run (replaces unlocked draft assignments)
create or replace function public.save_schedule(p_city text, p_assignments jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare x jsonb; n int := 0;
begin
  if not public.admin_ok() then raise exception 'Admins only.'; end if;
  delete from public.assignments a using public.shifts s
   where s.id = a.shift_id and s.city_id = p_city and not a.locked and a.status = 'draft';
  for x in select * from jsonb_array_elements(p_assignments) loop
    insert into public.assignments (shift_id, volunteer_id, status)
    values ((x ->> 'shift_id')::uuid, (x ->> 'volunteer_id')::uuid, 'draft')
    on conflict (shift_id) do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Privacy tools
-- ---------------------------------------------------------------------------
-- Vendor: download all my data (PIPA access request)
create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'organization', (select to_jsonb(o) from public.organizations o where o.id = public.my_org_id()),
    'applications', (select coalesce(jsonb_agg(to_jsonb(a) || jsonb_build_object('items',
        (select coalesce(jsonb_agg(to_jsonb(i) - 'sheet_extra'), '[]') from public.application_items i where i.application_id = a.id))), '[]')
        from public.applications a where a.organization_id = public.my_org_id()),
    'invoices', (select coalesce(jsonb_agg(to_jsonb(i) - 'sheet_extra'), '[]') from public.invoices i
        where i.organization_id = public.my_org_id() and i.status <> 'draft'),
    'payments', (select coalesce(jsonb_agg(to_jsonb(p) - 'recorded_by'), '[]') from public.payments p join public.invoices i on i.id = p.invoice_id
        where i.organization_id = public.my_org_id()),
    'documents', (select coalesce(jsonb_agg(jsonb_build_object('type', d.doc_type, 'file', d.file_name, 'status', d.status, 'uploaded_at', d.uploaded_at)), '[]')
        from public.documents d where d.organization_id = public.my_org_id()))
$$;

-- Super Admin: delete a volunteer's data on request (vendors: financial records are kept 7 years)
create or replace function public.delete_volunteer_data(p_email text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.super_ok() then raise exception 'Super Admin only.'; end if;
  delete from public.volunteers where lower(email) = lower(trim(p_email));
  get diagnostics n = row_count;
  return n;
end $$;

-- Retention job (called daily by the daily-jobs Edge Function).
-- Returns storage paths of documents that were removed, so the function can
-- delete the files too.
create or replace function public.run_retention() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb := public.setting('retention'); v_paths jsonb; v_vols int; v_last date;
begin
  if not public.is_service() then raise exception 'Service only.'; end if;
  select max(event_date) into v_last from public.cities;
  -- documents: 12 months after the event
  with gone as (
    delete from public.documents d
     where v_last is not null and d.doc_type <> 'logo'
       and (now() at time zone 'America/Edmonton')::date > v_last + make_interval(months => coalesce((r ->> 'documents_months')::int, 12))
       and d.uploaded_at < v_last::timestamptz
     returning storage_path)
  select coalesce(jsonb_agg(storage_path), '[]') into v_paths from gone;
  -- volunteers: 24 months after their last event (based on event_year)
  delete from public.volunteers v
   where make_date(v.event_year, 12, 31) + make_interval(months => coalesce((r ->> 'volunteer_months')::int, 24))
         < (now() at time zone 'America/Edmonton')::date;
  get diagnostics v_vols = row_count;
  return jsonb_build_object('document_paths', v_paths, 'volunteers_deleted', v_vols);
end $$;
revoke execute on function public.run_retention() from public, anon, authenticated;

-- Super Admin: roll the settings over to a new year (prices kept; dates cleared)
create or replace function public.start_new_year(p_year int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.super_ok() then raise exception 'Super Admin only.'; end if;
  update public.settings set value = jsonb_set(value, '{year}', to_jsonb(p_year)) where key = 'event';
  update public.settings set value = jsonb_set(jsonb_set(value, '{prefix}', to_jsonb(p_year || 'CD')), '{start_number}', '1'::jsonb) where key = 'invoice';
  update public.cities set event_date = null;
end $$;

-- Lock down who may call what.
--   anon (public site): only the volunteer functions + the helpers RLS uses
--   authenticated:      everything except the internal helpers
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
    if f.proname in ('trust','next_counter','run_retention','handle_new_user') then
      continue;  -- internal only (service role / owner)
    end if;
    execute format('grant execute on function %s to authenticated', f.sig);
    if f.proname in ('volunteer_signup','volunteer_portal','volunteer_respond','my_role','my_org_id','is_staff','is_admin',
                     'is_finance','is_super_admin','is_service','staff_mfa_ok','staff_ok','admin_ok','finance_ok','super_ok') then
      execute format('grant execute on function %s to anon', f.sig);
    end if;
  end loop;
end $$;

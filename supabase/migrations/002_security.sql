-- =============================================================================
-- 002_security.sql  —  roles, triggers, audit log and Row Level Security
-- =============================================================================
-- Roles live in public.profiles.role: vendor | admin | finance | super_admin.
-- Every table has RLS switched on. Vendors only ever see their own
-- organization. The service-role key (Edge Functions only) bypasses RLS.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so they can read profiles under RLS)
-- ---------------------------------------------------------------------------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and not disabled
$$;

create or replace function public.my_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select organization_id from public.profiles where id = auth.uid() and not disabled
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin','finance','super_admin'), false)
$$;

create or replace function public.is_admin() returns boolean   -- admin or super admin
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin','super_admin'), false)
$$;

create or replace function public.is_finance() returns boolean -- finance, admin or super admin
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('finance','admin','super_admin'), false)
$$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'super_admin', false)
$$;

-- true for: Edge Functions using the service-role key, the Supabase dashboard /
-- SQL editor (no JWT at all), and our own trusted functions below, which set
-- the transaction-local flag rda.trusted = 'on'.
create or replace function public.is_service() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'none') in ('service_role','none')
         or coalesce(current_setting('rda.trusted', true), '') = 'on'
$$;

-- Staff must have signed in with two-factor (aal2) for staff-only writes.
create or replace function public.staff_mfa_ok() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal', '') = 'aal2'
         or coalesce((select value from public.settings where key = 'security') ->> 'require_staff_mfa', 'true') = 'false'
$$;

create or replace function public.staff_ok() returns boolean
language sql stable as $$ select public.is_staff() and public.staff_mfa_ok() $$;
create or replace function public.admin_ok() returns boolean
language sql stable as $$ select public.is_admin() and public.staff_mfa_ok() $$;
create or replace function public.finance_ok() returns boolean
language sql stable as $$ select public.is_finance() and public.staff_mfa_ok() $$;
create or replace function public.super_ok() returns boolean
language sql stable as $$ select public.is_super_admin() and public.staff_mfa_ok() $$;

-- ---------------------------------------------------------------------------
-- New sign-ups get a 'vendor' profile automatically
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''), 'vendor')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only a Super Admin (or the dashboard / service role) can change roles,
-- organization links or the disabled flag.
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_service() or public.is_super_admin() then return new; end if;
  if new.role is distinct from old.role
     or new.organization_id is distinct from old.organization_id
     or new.disabled is distinct from old.disabled
     or new.id is distinct from old.id then
    raise exception 'Only a Super Admin can change roles or organization links.';
  end if;
  return new;
end $$;
create trigger protect_profile before update on public.profiles
  for each row execute function public.protect_profile();

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger t_org_touch before update on public.organizations for each row execute function public.touch_updated_at();
create trigger t_app_touch before update on public.applications  for each row execute function public.touch_updated_at();
create trigger t_inv_touch before update on public.invoices      for each row execute function public.touch_updated_at();
create trigger t_asg_touch before update on public.assignments   for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Vendors can only edit drafts, and can't set staff-only fields
-- ---------------------------------------------------------------------------
create or replace function public.guard_application() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_service() or public.is_staff() then return new; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'New applications start as drafts.'; end if;
    new.decision_reason := null; new.decided_at := null; new.decided_by := null; new.submitted_at := null;
    return new;
  end if;
  if old.status not in ('draft','changes_requested') then
    raise exception 'This application can no longer be edited. Contact community@lastdoor.org.';
  end if;
  if new.status is distinct from old.status then
    raise exception 'Use the Submit button to submit the application.';
  end if;
  new.decision_reason := old.decision_reason; new.decided_at := old.decided_at;
  new.decided_by := old.decided_by; new.submitted_at := old.submitted_at;
  new.organization_id := old.organization_id; new.event_year := old.event_year;
  return new;
end $$;
create trigger guard_application before insert or update on public.applications
  for each row execute function public.guard_application();

create or replace function public.guard_item() returns trigger
language plpgsql security definer set search_path = public as $$
declare st text;
begin
  if public.is_service() or public.is_staff() then return coalesce(new, old); end if;
  select status into st from public.applications where id = coalesce(new.application_id, old.application_id);
  if st not in ('draft','changes_requested') then
    raise exception 'This application can no longer be edited.';
  end if;
  if tg_op <> 'DELETE' then new.sheet_extra := coalesce(old.sheet_extra, '{}'::jsonb); end if;
  return coalesce(new, old);
end $$;
create trigger guard_item before insert or update or delete on public.application_items
  for each row execute function public.guard_item();

-- Vendors can't approve their own documents
create or replace function public.guard_document() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_service() or public.is_staff() then return new; end if;
  if tg_op = 'INSERT' then new.status := 'pending'; new.reviewed_by := null; new.review_note := null;
  elsif new.status is distinct from old.status or new.reviewed_by is distinct from old.reviewed_by then
    raise exception 'Only staff can review documents.';
  end if;
  return new;
end $$;
create trigger guard_document before insert or update on public.documents
  for each row execute function public.guard_document();

-- Organizations: vendors can't change their file number
create or replace function public.guard_org() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_service() or public.is_staff() then return new; end if;
  if tg_op = 'UPDATE' then new.file_number := old.file_number; new.created_by := old.created_by;
  else new.file_number := null; end if;
  return new;
end $$;
create trigger guard_org before insert or update on public.organizations
  for each row execute function public.guard_org();

-- Financial records can't be deleted (cancel or void instead)
create or replace function public.no_delete() returns trigger
language plpgsql as $$
begin raise exception 'Financial records cannot be deleted. Cancel or void them with a reason.'; end $$;
create trigger nd_invoices before delete on public.invoices for each row execute function public.no_delete();
create trigger nd_payments before delete on public.payments for each row execute function public.no_delete();
create trigger nd_refunds  before delete on public.refunds  for each row execute function public.no_delete();
create trigger nd_receipts before delete on public.receipts for each row execute function public.no_delete();

-- Sent invoices: lines are frozen (cancel and re-issue instead)
create or replace function public.guard_invoice_lines() returns trigger
language plpgsql security definer set search_path = public as $$
declare st text;
begin
  select status into st from public.invoices where id = coalesce(new.invoice_id, old.invoice_id);
  if st <> 'draft' and not public.is_service() then
    raise exception 'Lines can only be changed while the invoice is a draft.';
  end if;
  return coalesce(new, old);
end $$;
create trigger guard_invoice_lines before insert or update or delete on public.invoice_lines
  for each row execute function public.guard_invoice_lines();

-- ---------------------------------------------------------------------------
-- Audit log trigger
-- ---------------------------------------------------------------------------
create or replace function public.audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rid text;
  b jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  a jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
begin
  if tg_op = 'UPDATE' and b = a then return new; end if;
  rid := coalesce(a ->> 'id', b ->> 'id', a ->> 'key', b ->> 'key', a ->> 'city_id', b ->> 'city_id');
  -- never copy magic-link tokens into the log
  b := b - 'access_token'; a := a - 'access_token';
  insert into public.audit_log (actor, actor_email, action, table_name, row_id, before, after)
  values (auth.uid(), (select email from public.profiles where id = auth.uid()),
          lower(tg_op), tg_table_name, rid, b, a);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['settings','cities','products','organizations','profiles','applications','application_items',
    'documents','invoices','invoice_lines','payments','payment_notifications','payment_reports','refunds','receipts',
    'site_maps','booths','announcements','volunteers','shifts','assignments']
  loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.audit()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['settings','cities','products','counters','organizations','profiles','applications',
    'application_items','documents','invoices','invoice_lines','payments','payment_notifications','payment_reports',
    'refunds','receipts','site_maps','booths','announcements','volunteers','shifts','assignments','declines','audit_log']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Public reference data: settings (public ones), cities, products
create policy settings_read  on public.settings for select using (is_public or public.is_staff());
create policy settings_write on public.settings for all using (public.super_ok()) with check (public.super_ok());
create policy cities_read    on public.cities   for select using (true);
create policy cities_write   on public.cities   for all using (public.super_ok()) with check (public.super_ok());
create policy products_read  on public.products for select using (true);
create policy products_write on public.products for all using (public.super_ok()) with check (public.super_ok());
-- counters: no policies → only security-definer functions touch them

-- Profiles
create policy profiles_self   on public.profiles for select using (id = auth.uid() or public.is_staff());
create policy profiles_update on public.profiles for update using (id = auth.uid() or public.super_ok()) with check (id = auth.uid() or public.super_ok());

-- Organizations
create policy org_read   on public.organizations for select using (id = public.my_org_id() or public.is_staff());
create policy org_update on public.organizations for update using (id = public.my_org_id() or public.admin_ok()) with check (id = public.my_org_id() or public.admin_ok());
create policy org_insert on public.organizations for insert with check (public.admin_ok() or public.finance_ok());
-- vendors create their organization through create_my_organization()

-- Applications + items
create policy app_read   on public.applications for select using (organization_id = public.my_org_id() or public.is_staff());
create policy app_insert on public.applications for insert with check (organization_id = public.my_org_id() or public.admin_ok());
create policy app_update on public.applications for update using (organization_id = public.my_org_id() or public.admin_ok()) with check (organization_id = public.my_org_id() or public.admin_ok());

create policy item_read on public.application_items for select using (
  public.is_staff() or exists (select 1 from public.applications a where a.id = application_id and a.organization_id = public.my_org_id()));
create policy item_write on public.application_items for all using (
  public.admin_ok() or exists (select 1 from public.applications a where a.id = application_id and a.organization_id = public.my_org_id()))
  with check (
  public.admin_ok() or exists (select 1 from public.applications a where a.id = application_id and a.organization_id = public.my_org_id()));

-- Documents
create policy doc_read   on public.documents for select using (organization_id = public.my_org_id() or public.is_staff());
create policy doc_insert on public.documents for insert with check (organization_id = public.my_org_id() or public.admin_ok());
create policy doc_update on public.documents for update using (organization_id = public.my_org_id() or public.admin_ok()) with check (organization_id = public.my_org_id() or public.admin_ok());
create policy doc_delete on public.documents for delete using ((organization_id = public.my_org_id() and status <> 'approved') or public.admin_ok());

-- Invoices: vendors never see drafts
create policy inv_read on public.invoices for select using (
  public.is_staff() or (organization_id = public.my_org_id() and status <> 'draft'));
create policy inv_write on public.invoices for update using (public.finance_ok()) with check (public.finance_ok());
-- invoices are created through create_invoice()

create policy line_read on public.invoice_lines for select using (
  public.is_staff() or exists (select 1 from public.invoices i where i.id = invoice_id and i.organization_id = public.my_org_id() and i.status <> 'draft'));
create policy line_write on public.invoice_lines for all using (public.finance_ok()) with check (public.finance_ok());

-- Payments, refunds, receipts: vendors read their own; writes via functions
create policy pay_read on public.payments for select using (
  public.is_staff() or exists (select 1 from public.invoices i where i.id = invoice_id and i.organization_id = public.my_org_id() and not voided));
create policy pay_update on public.payments for update using (public.finance_ok()) with check (public.finance_ok());
create policy refund_read on public.refunds for select using (
  public.is_staff() or exists (select 1 from public.invoices i where i.id = invoice_id and i.organization_id = public.my_org_id()));
create policy receipt_read on public.receipts for select using (
  public.is_staff() or exists (select 1 from public.invoices i where i.id = invoice_id and i.organization_id = public.my_org_id()));
create policy receipt_update on public.receipts for update using (public.finance_ok()) with check (public.finance_ok());
-- Staff may only tick "checked" on a payment (needs_review) or note when a receipt
-- was emailed. Amounts, dates and voiding go through record_payment / void_payment.
revoke update on public.payments from anon, authenticated;
grant update (needs_review) on public.payments to authenticated;
revoke update on public.receipts from anon, authenticated;
grant update (emailed_at) on public.receipts to authenticated;

create policy notif_read  on public.payment_notifications for select using (public.is_finance());
create policy notif_write on public.payment_notifications for update using (public.finance_ok()) with check (public.finance_ok());
create policy notif_insert on public.payment_notifications for insert with check (public.finance_ok());

create policy prep_read on public.payment_reports for select using (organization_id = public.my_org_id() or public.is_finance());
create policy prep_insert on public.payment_reports for insert with check (
  organization_id = public.my_org_id() and status = 'open'
  and exists (select 1 from public.invoices i where i.id = invoice_id and i.organization_id = public.my_org_id()));
create policy prep_update on public.payment_reports for update using (public.finance_ok()) with check (public.finance_ok());

-- Site maps (any signed-in user), booths (staff, or the vendor's own booth)
create policy map_read  on public.site_maps for select using (auth.uid() is not null);
create policy map_write on public.site_maps for all using (public.admin_ok()) with check (public.admin_ok());
create policy booth_read on public.booths for select using (
  auth.uid() is not null);   -- labels + positions only; who is in a booth is resolved below
create policy booth_write on public.booths for all using (public.admin_ok()) with check (public.admin_ok());

-- Announcements
create policy ann_read  on public.announcements for select using (auth.uid() is not null);
create policy ann_write on public.announcements for all using (public.admin_ok()) with check (public.admin_ok());

-- Volunteers: staff only (sign-up goes through volunteer_signup())
create policy vol_read  on public.volunteers for select using (public.is_staff());
create policy vol_write on public.volunteers for update using (public.admin_ok()) with check (public.admin_ok());
create policy vol_delete on public.volunteers for delete using (public.super_ok());
create policy shift_read  on public.shifts for select using (public.is_staff());
create policy shift_write on public.shifts for all using (public.admin_ok()) with check (public.admin_ok());
create policy asg_read  on public.assignments for select using (public.is_staff());
create policy asg_write on public.assignments for all using (public.admin_ok()) with check (public.admin_ok());
create policy dec_read  on public.declines for select using (public.is_staff());
create policy dec_write on public.declines for all using (public.admin_ok()) with check (public.admin_ok());

-- Audit log: staff can read, nobody can change it
create policy audit_read on public.audit_log for select using (public.is_staff());

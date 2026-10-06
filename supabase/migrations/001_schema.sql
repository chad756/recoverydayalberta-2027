-- =============================================================================
-- 001_schema.sql  —  Recovery Day Alberta: tables
-- =============================================================================
-- Run the migrations in order (001, 002, 003 ...) in Supabase → SQL Editor.
-- All money is stored in CENTS (integer, CAD). No GST. All dates are
-- America/Edmonton calendar dates.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Settings: every year-specific value lives here (editable in Admin → Settings)
-- ---------------------------------------------------------------------------
create table public.settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  is_public   boolean not null default true,  -- readable by the public site
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

create table public.cities (
  id           text primary key check (id ~ '^[a-z0-9-]+$'),
  name         text not null,
  event_date   date,                    -- null = "Date to be announced"
  start_time   text,                    -- display only, e.g. '12 pm'
  end_time     text,
  venue        text,
  address      text,
  load_in      text,                    -- shown on the vendor "My booth" card
  entry_street text,
  parking      text,
  checkin_location text,                -- volunteer check-in spot
  sort         int not null default 0,
  active       boolean not null default true
);

create table public.products (
  code          text primary key check (code ~ '^[a-z0-9_]+$'),
  name          text not null,
  kind          text not null check (kind in ('sponsorship','booth','rental')),
  price_cents   int  not null check (price_cents >= 0),
  invoice_label text,                   -- '{sub} Booth' → 'Healthcare Provider Booth'
  sub_types     text[] not null default '{}',
  deposit       boolean not null default true,
  description   text,
  sort          int not null default 0,
  active        boolean not null default true
);

-- Simple counters: file numbers, invoice numbers, receipt numbers
create table public.counters (
  name  text primary key,
  value int not null default 0
);

-- ---------------------------------------------------------------------------
-- People and organizations
-- ---------------------------------------------------------------------------
create table public.organizations (
  id               uuid primary key default gen_random_uuid(),
  legal_name       text not null check (char_length(legal_name) between 1 and 200),
  display_name     text check (char_length(display_name) <= 200),
  org_type         text check (org_type in ('non_profit','health_service','government','business','artisan','food_truck','mutual_support')),
  gst_number       text check (char_length(gst_number) <= 40),
  website          text check (char_length(website) <= 300),
  socials          text check (char_length(socials) <= 300),
  description      text check (char_length(description) <= 1000),
  contact_name     text check (char_length(contact_name) <= 120),
  contact_email    text check (char_length(contact_email) <= 200),
  contact_phone    text check (char_length(contact_phone) <= 40),
  billing_name     text check (char_length(billing_name) <= 120),
  billing_email    text check (char_length(billing_email) <= 200),
  street           text check (char_length(street) <= 200),
  city             text check (char_length(city) <= 100),
  province         text check (char_length(province) <= 40),
  postal_code      text check (char_length(postal_code) <= 12),
  directory_opt_in boolean not null default false,
  file_number      int unique,          -- sponsor sheet col A, set on first accept
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  full_name       text,
  role            text not null default 'vendor' check (role in ('vendor','admin','finance','super_admin')),
  organization_id uuid references public.organizations(id) on delete set null,
  disabled        boolean not null default false,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Applications
-- ---------------------------------------------------------------------------
create table public.applications (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  event_year       int  not null,
  status           text not null default 'draft' check (status in
                   ('draft','submitted','under_review','changes_requested','accepted','waitlisted','declined','cancel_requested','cancelled')),
  payment_method   text check (payment_method in ('card','cheque')),
  terms_accepted_at   timestamptz,
  policy_accepted_at  timestamptz,
  media_consent_at    timestamptz,     -- null = no photo/media consent
  comms_consent_at    timestamptz,     -- required event communications
  marketing_opt_in_at timestamptz,     -- optional future marketing (CASL)
  notes_to_organizers text check (char_length(notes_to_organizers) <= 2000),
  decision_reason  text check (char_length(decision_reason) <= 2000),
  cancel_reason    text check (char_length(cancel_reason) <= 2000),
  submitted_at     timestamptz,
  decided_at       timestamptz,
  decided_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on public.applications (organization_id);
create index on public.applications (status);

create table public.application_items (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.applications(id) on delete cascade,
  city_id         text not null references public.cities(id),
  product_code    text not null references public.products(code),
  sub_type        text check (char_length(sub_type) <= 60),
  tents           int not null default 0 check (tents between 0 and 20),
  tables          int not null default 0 check (tables between 0 and 20),
  chair_pairs     int not null default 0 check (chair_pairs between 0 and 20),
  truck_length_ft numeric(5,1) check (truck_length_ft between 0 and 100),
  truck_width_ft  numeric(5,1) check (truck_width_ft between 0 and 30),
  power_needed    boolean not null default false,
  power_amps      int check (power_amps between 0 and 400),
  personal_services boolean not null default false,  -- massage, tattoo, face painting…
  ahs_decal_number  text check (char_length(ahs_decal_number) <= 40),
  fire_decal_number text check (char_length(fire_decal_number) <= 40),
  special_requests  text check (char_length(special_requests) <= 1000),
  sheet_extra     jsonb not null default '{}'::jsonb,  -- admin-only sheet columns (email read receipt…)
  created_at      timestamptz not null default now(),
  unique (application_id, city_id, product_code)
);
create index on public.application_items (application_id);

create table public.documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  application_id  uuid references public.applications(id) on delete set null,
  city_id         text references public.cities(id),
  doc_type        text not null check (doc_type in
                  ('logo','booth_layout','food_vendor_notification','food_establishment_permission','fire_decal','personal_services','insurance')),
  storage_path    text not null,
  file_name       text not null check (char_length(file_name) <= 200),
  mime_type       text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/svg+xml')),
  size_bytes      int  not null check (size_bytes between 1 and 10485760),
  status          text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note     text,
  reviewed_by     uuid,
  uploaded_at     timestamptz not null default now()
);
create index on public.documents (organization_id);

-- ---------------------------------------------------------------------------
-- Invoices, payments, refunds, receipts (never deleted: cancel/void instead)
-- ---------------------------------------------------------------------------
create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  number          text not null unique,          -- 2027CD001 (shown as #2027CD001)
  organization_id uuid not null references public.organizations(id) on delete restrict,
  application_id  uuid references public.applications(id) on delete set null,
  event_year      int  not null,
  status          text not null default 'draft' check (status in ('draft','sent','cancelled','void')),
  issue_date      date,                          -- date sent
  bill_name       text,                          -- TO: block snapshot
  bill_contact    text,
  bill_email      text,
  bill_address    text,
  total_cents     int not null default 0,
  deposit_cents   int not null default 0,
  balance_due     date,
  notes           text,
  void_reason     text,
  sent_at         timestamptz,
  last_reminder   text,                          -- e.g. 'balance_7' (prevents duplicates)
  sheet_extra     jsonb not null default '{}'::jsonb,  -- cols D,H–K,N–P,T–AE typed by admins
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.invoices (organization_id);

create table public.invoice_lines (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  sort         int  not null default 0,
  line_type    text not null check (line_type in ('sponsorship','booth','rental','discount','custom')),
  product_code text,
  city_id      text references public.cities(id),
  description  text not null check (char_length(description) <= 300),
  detail       text check (char_length(detail) <= 300),
  quantity     int  not null default 1,
  amount_cents int  not null
);
create index on public.invoice_lines (invoice_id);

create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  invoice_id     uuid not null references public.invoices(id) on delete restrict,
  amount_cents   int  not null check (amount_cents > 0),
  method         text not null check (method in ('card','cheque','cash','etransfer','other')),
  received_label text not null,                -- col M text, e.g. 'Paid Chq LD'
  paid_at        date not null,
  reference      text,                         -- cheque # / Stripe id / e-transfer ref
  source         text not null check (source in ('manual','webhook','email','import','vendor_report')),
  external_id    text unique,                  -- Stripe payment id (duplicates ignored)
  payer_name     text,
  payer_email    text,
  needs_review   boolean not null default false, -- auto-matched: Finance double-check
  voided         boolean not null default false,
  void_reason    text,
  recorded_by    uuid,
  created_at     timestamptz not null default now()
);
create index on public.payments (invoice_id);

create table public.payment_notifications (
  id           uuid primary key default gen_random_uuid(),
  source       text not null check (source in ('webhook','email','import')),
  external_id  text unique,
  reference    text,
  amount_cents int,
  payer_name   text,
  payer_email  text,
  organization text,
  paid_at      timestamptz,
  raw          jsonb not null default '{}'::jsonb,
  status       text not null default 'unmatched' check (status in ('matched','unmatched','assigned','ignored')),
  reason       text,
  invoice_id   uuid references public.invoices(id),
  payment_id   uuid references public.payments(id),
  received_at  timestamptz not null default now()
);

create table public.payment_reports (   -- "I've paid, but it's not showing"
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references public.invoices(id),
  organization_id uuid not null references public.organizations(id),
  paid_on         date not null,
  amount_cents    int  not null check (amount_cents > 0),
  payer_email     text check (char_length(payer_email) <= 200),
  note            text check (char_length(note) <= 1000),
  status          text not null default 'open' check (status in ('open','confirmed','rejected')),
  resolved_by     uuid,
  created_by      uuid,
  created_at      timestamptz not null default now()
);

create table public.refunds (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references public.invoices(id) on delete restrict,
  amount_cents     int  not null check (amount_cents >= 0),
  calculated_cents int  not null,
  override_note    text,                  -- required when amount ≠ calculated
  reason           text,
  cancel_date      date not null,
  refunded_at      date,
  recorded_by      uuid,
  created_at       timestamptz not null default now()
);

create table public.receipts (
  id          uuid primary key default gen_random_uuid(),
  number      text not null unique,       -- R-2027-0001
  payment_id  uuid not null unique references public.payments(id),
  invoice_id  uuid not null references public.invoices(id),
  issued_at   timestamptz not null default now(),
  emailed_at  timestamptz
);

-- ---------------------------------------------------------------------------
-- Booths and site maps
-- ---------------------------------------------------------------------------
create table public.site_maps (
  city_id      text primary key references public.cities(id),
  storage_path text not null,
  mime_type    text not null,
  updated_at   timestamptz not null default now()
);

create table public.booths (
  id                  uuid primary key default gen_random_uuid(),
  city_id             text not null references public.cities(id),
  label               text not null check (char_length(label) <= 20),
  x_pct               numeric(6,3) not null check (x_pct between 0 and 100),
  y_pct               numeric(6,3) not null check (y_pct between 0 and 100),
  size                text default '10x10',
  booth_type          text check (booth_type in ('health_retail','artisan','food_truck','non_profit','sponsor','other')),
  zone                text,
  application_item_id uuid unique references public.application_items(id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (city_id, label)
);

create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) <= 200),
  body         text not null check (char_length(body) <= 4000),
  city_id      text references public.cities(id),   -- null = everyone
  published_at timestamptz not null default now(),
  created_by   uuid
);

-- ---------------------------------------------------------------------------
-- Volunteers and scheduling
-- ---------------------------------------------------------------------------
create table public.volunteers (
  id               uuid primary key default gen_random_uuid(),
  city_id          text not null references public.cities(id),
  event_year       int  not null,
  name             text not null check (char_length(name) between 1 and 120),
  email            text not null check (char_length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone            text check (char_length(phone) <= 40),
  is_adult         boolean not null,
  age_14_plus      boolean not null default true,
  guardian_name    text check (char_length(guardian_name) <= 120),
  guardian_contact text check (char_length(guardian_contact) <= 200),
  guardian_consent_at timestamptz,
  preferences      text[] not null default '{}',
  availability     text not null default 'all_day' check (availability in ('morning','afternoon','all_day')),
  experience       text check (experience in ('yes','no','some')),
  returning_volunteer boolean not null default false,  -- volunteered for Recovery Day before
  other_festivals  boolean not null default false,
  group_name       text check (char_length(group_name) <= 120),
  group_size       int check (group_size between 1 and 100),
  tshirt_size      text check (tshirt_size in ('XS','S','M','L','XL','2XL','3XL')),
  emergency_name   text check (char_length(emergency_name) <= 120),
  emergency_phone  text check (char_length(emergency_phone) <= 40),
  accessibility    text check (char_length(accessibility) <= 1000),
  comms_consent_at timestamptz not null,
  media_consent_at timestamptz,
  marketing_opt_in_at timestamptz,
  status           text not null default 'active' check (status in ('active','withdrawn')),
  access_token     uuid not null default gen_random_uuid() unique,  -- magic link
  created_at       timestamptz not null default now(),
  constraint minors_need_guardian check (is_adult or (guardian_name is not null and guardian_contact is not null and guardian_consent_at is not null and age_14_plus))
);
create index on public.volunteers (city_id);

create table public.shifts (
  id         uuid primary key default gen_random_uuid(),
  city_id    text not null references public.cities(id),
  zone       text not null,
  zone_sort  int  not null default 0,
  label      text not null,          -- sheet col A, e.g. 'Set Up Team 7 am'
  duties     text,                   -- sheet col E
  role_group text,                   -- used to keep groups together
  start_min  int check (start_min between 0 and 1440),
  end_min    int check (end_min between 0 and 1440),
  pref_key   text,                   -- which sign-up preference fits
  admin_only boolean not null default false,  -- Zone Lead, Hired Guard, First Aid
  sort       int not null default 0
);
create index on public.shifts (city_id);

create table public.assignments (
  id             uuid primary key default gen_random_uuid(),
  shift_id       uuid not null unique references public.shifts(id) on delete cascade,
  volunteer_id   uuid not null references public.volunteers(id) on delete cascade,
  status         text not null default 'draft' check (status in ('draft','published','confirmed','declined')),
  locked         boolean not null default false,
  checked_in_at  timestamptz,
  checked_out_at timestamptz,
  notified_at    timestamptz,
  updated_at     timestamptz not null default now()
);

-- Declined pairs are remembered so the auto-scheduler doesn't re-offer them
create table public.declines (
  shift_id     uuid not null references public.shifts(id) on delete cascade,
  volunteer_id uuid not null references public.volunteers(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (shift_id, volunteer_id)
);

-- ---------------------------------------------------------------------------
-- Audit log (who changed what, when, before/after)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor      uuid,
  actor_email text,
  action     text not null,
  table_name text,
  row_id     text,
  before     jsonb,
  after      jsonb
);
create index on public.audit_log (at desc);

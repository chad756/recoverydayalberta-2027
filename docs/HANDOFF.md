# HANDOFF – Recovery Day Alberta 2027

Attach this file and `SPEC.md` to every new build session.

_Last updated: October 2, 2026 (Session 2 – all phases built)._

---

## 1. Status at a glance

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation and public site | **Built.** |
| 2 | Database, RLS, accounts, keep-alive and backup Actions | **Built.** Waiting on Chad's Supabase setup (`docs/SETUP-SUPABASE.md`). |
| 3 | Vendor application and portal | **Built.** |
| 4 | Admin applications, invoices, Sponsor Master Excel | **Built.** |
| 5 | Payments and receipts (Last Door pay page) | **Built.** Webhook format waiting on Major Tom (`docs/MAJOR-TOM.md`). |
| 6 | Booths and site maps | **Built.** |
| 7 | Volunteers and auto-scheduler | **Built.** |
| 8 | Polish, privacy/terms content, go-live | **Built, except** privacy officer review and the domain switch (`docs/GO-LIVE.md`). |

Everything has been tested with sample data (see section 8). Nothing has been
tested against a real Supabase project yet, because it doesn't exist yet. The
first real run will be Chad's setup. Expect a few small fixes then.

---

## 2. Decisions so far

| Topic | Decision |
|---|---|
| Repository | Brand-new **public** repo, built from scratch. All work goes on `main`. The old site is untouched until go-live. |
| Preview address | `https://<github-user>.github.io/<repo>/`, deployed on every push to `main` **and nightly** (so the date and price changes made in admin reach the public pages). |
| Base path | `BASE_PATH` repository variable. Unset = `/<repo>/`. Set it to `/` at go-live. `./` = relative (demo copies). |
| Removed links | No sponsorship-package PDF and no SurveyMonkey link. Vendors apply in the portal and volunteers use `/volunteer/`. |
| Colours | 2027 trend palette: Luminous Blue #2E4FE0 (WGSN x Coloro Colour of the Year 2027), Maize #F4C542, Midnight #131A33, Peaceful Lilac #E7E1F7, cloud-white page #F6F5F0 (`src/styles/tokens.css`). Blue text only on light backgrounds; Maize text only on Midnight. Every text/background pair passes AA. The invoice PDF keeps the 2026 Word layout colours. |
| Single source of rules | `supabase/functions/_shared/rules.js` is used by the browser, the Edge Functions, the demo and the tests. The SQL functions repeat the money checks so the database is safe on its own. |
| Year-specific values | Stored in the `settings`, `cities` and `products` tables and edited in **Admin → Settings & users**. Public pages read dates and prices at build time (fallback: `src/data/*.js`). |
| Money | Integer cents, CAD. No GST anywhere (`invoice.gst_enabled = false`). |
| Invoice numbers | `2027CD001…`, never reused. Receipts `R-2027-0001…`. Counters live in the `counters` table. |
| Invoice flow | Accepting an application creates a **draft**. Staff review it, then **Approve & Send**. Sent invoices are locked. To change one, void it (only if unpaid) and re-issue. |
| PDF layout | Same as the 2026 Word invoice (`_shared/pdf.js`). Logo: `public/images/lastdoor-logo.jpg`. |
| Payments | No processor. The pay link goes to `lastdoor.org/pay-for-invoice/` (pre-filled). Payments come in by signed webhook, by inbound email, by CSV/XLSX import, from vendor "I've paid" reports, or by manual entry. Auto-matched payments still get a quick human check. |
| Staff security | TOTP two-factor required for admin, finance and super_admin, checked in the browser **and** in RLS (`staff_mfa_ok()`), and again in the Edge Functions. |
| Direct edits | Staff can't edit payment amounts, receipts or refunds directly. Column grants allow only `payments.needs_review` and `receipts.emailed_at`. Everything else goes through `record_payment`, `void_payment` and `record_refund`. |
| Sponsor master export | Same columns, order and header text as `2026-Sponsors-2.xlsx` (A–CD), with "Artisan $200", plus the new CE–CL. City labels are **cell notes**, not shifted rows. |
| Volunteer schedule export | 2026 layout: A1:E1 title, grey header row, yellow zone/label cells. |
| Demo build | `VITE_DEMO=true` swaps in an in-memory backend with fictional data, so supabase-js isn't bundled and nothing is saved. Used for the HTML previews only. |
| Backups | Weekly `pg_dump`, **encrypted with GPG** (`BACKUP_PASSPHRASE`) because artifacts of public repos can be downloaded by any logged-in GitHub user. Kept 30 days. |

---

## 3. Project structure

```
.github/workflows/
  deploy.yml          build + secret scan + GitHub Pages (push to main, nightly)
  keep-alive.yml      daily ping so Supabase never pauses
  daily-jobs.yml      calls the daily-jobs function (reminders, retention)
  backup.yml          weekly encrypted pg_dump artifact
docs/
  HANDOFF.md          this file
  SETUP-SUPABASE.md   one-time setup, click by click
  ADMIN-GUIDE.md      how staff use the admin site
  MAJOR-TOM.md        pay-link parameters + webhook spec for the payment page
  GO-LIVE.md          domain switch checklist
public/images/        logo, 2026 covers/posters (placeholders)
scripts/check-secrets.mjs
src/
  build/html-plugin.js  page markers, CSP, robots; reads dates/prices from Supabase at build
  build/render.js       public page layouts
  data/                 festivals.js, partner.js, site.js (text + fallbacks), gallery.js (home slideshow + photo gallery), sponsors.js (logo banner)
  lib/
    api.js              picks the backend (Supabase or demo)
    backend-supabase.js all Supabase calls (tables, RPC, functions, storage, auth)
    supabase.js         client (anon key only)
    ui.js               html templates, dialogs, toasts, tables, router
    session.js          login checks, roles
    data.js             reference data (settings, cities, products) + helpers
    excel.js            all Excel exports + CSV/XLSX import
    sponsor-sheet.js    2026 sponsor sheet columns A–CL
  pages/                login, portal, admin, volunteer, volunteer-shifts, vendor-terms
  admin/                applications, invoices, payments, booths, volunteers, exports, settings
  demo/                 demo backend, seed.json (settings/products/shifts), sample site map
  styles/               tokens, base, layout, components, sections, app
supabase/
  migrations/001–005    schema, security (RLS), functions, seed, storage
  functions/            mailer, document-pdf, payment-notify, inbound-payment-email, daily-jobs
  functions/_shared/    rules.js, pdf.js, supabase.ts, email.ts, documents.ts, payments.ts
  tests/                rls-test.sql + run-local.sh (local Postgres security tests)
tests/                  node tests for rules and the sponsor sheet
```

Pages: `/` `/schedules/` `/partner/` `/volunteer/` `/volunteer/shifts/` `/privacy/`
`/vendor-terms/` `/login/` `/portal/` `/admin/` `404.html`. Add new pages to `pages` in `vite.config.js`.

---

## 4. Database overview

| Area | Tables | Who can see |
|---|---|---|
| Settings | `settings`, `cities`, `products`, `counters` | public rows readable by anyone; edits Super Admin only |
| People | `profiles` (role, MFA), `organizations` | own row / own org; staff all |
| Applications | `applications`, `application_items`, `documents` | own org; admin all |
| Money | `invoices`, `invoice_lines`, `payments`, `receipts`, `refunds`, `payment_notifications`, `payment_reports` | vendors see their own **sent** invoices; finance/admin all |
| Booths | `site_maps`, `booths` | any logged-in user can see maps; vendors only their own booth |
| Volunteers | `volunteers`, `shifts`, `assignments`, `declines` | staff only; volunteers use a private token link |
| Other | `announcements`, `audit_log` | logged-in users / staff |

Key functions: `create_my_organization`, `submit_application`, `request_cancellation`,
`decide_application`, `create_invoice`, `save_draft_invoice`, `record_payment`,
`void_payment`, `record_refund`, `volunteer_signup`, `volunteer_portal`,
`volunteer_respond`, `save_schedule`, `export_my_data`, `delete_volunteer_data`,
`start_new_year`, `run_retention`.

Storage buckets (private, 10 MB): `vendor-docs` (`<org>/<file>`; PDF/JPG/PNG, plus SVG for logos) and
`site-maps` (`<city>/<file>`; the admin screen accepts PNG/JPG).

---

## 5. Secrets and settings

| Name | Where | Used for |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | GitHub secrets, `.env.local` | website + build-time dates/prices |
| `BASE_PATH` | GitHub **variable** | `/` at go-live |
| `CRON_SECRET` | GitHub secret **and** Supabase function secret | daily-jobs |
| `SUPABASE_DB_URL`, `BACKUP_PASSPHRASE` | GitHub secrets | weekly backup |
| `RESEND_API_KEY` | Supabase function secret | emails |
| `PAYMENT_WEBHOOK_SECRET` | Supabase function secret (+ shared with Major Tom) | payment-notify signature |
| `INBOUND_EMAIL_SECRET` | Supabase function secret | inbound-payment-email `?key=` |
| `SITE_URL`, `ALLOWED_ORIGINS` | Supabase function secrets | links in emails, CORS |

CSP (built site): `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: <SUPABASE>; connect-src 'self' <SUPABASE> wss://<SUPABASE_HOST>; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`.
Rules: no inline scripts, no `style=""` attributes (map pins are positioned from
`data-x`/`data-y` in `ui.setHTML`), no third-party scripts.

---

## 6. Open items – SPEC DEFAULT – CONFIRM

These currently use the spec's default. Each one is a setting, so changing it
doesn't need new code. Rows marked **Confirm** in Admin → Settings.

1. **2027 event dates** for all three cities. Currently `null` ("Date to be announced"). The demo uses placeholder dates (Sept 11 / 18 / 25, 2027). Balance due dates and refunds depend on these.
2. **Booth cancellation 14–29 days before the event:** default = refund **minus the $100 deposit** (`refund_rules.booth_14_29 = "minus_deposit"`). Other option: `"none"`.
3. **Sponsorship cancellation 14–29 days:** default = **no refund** (`sponsor_14_29 = "none"`). Options: `"full"`, `"minus_deposit"`.
4. **Food-truck deposit:** default = yes, $100 like other booths (`payment_rules.food_truck_deposit = true`).
5. **Deposit timing:** default = due when the invoice is sent (`deposit_due = "on_send"`). If the balance due date has already passed, the whole amount is due at once.
6. **Major Tom pay-link parameter names and webhook format:** our proposal is in `docs/MAJOR-TOM.md` (`setting pay_link`).
7. **Privacy policy:** draft text on `/privacy/`, marked "DRAFT – for privacy officer review". It covers PIPA, CASL, Supabase Canada region, and retention of 24 months for volunteers, 12 months for documents and 7 years for financial records.
8. **Sponsor Emails sheet column B:** the 2026 header is blank. We fill it with the organization name. Confirm, or give it a header.
9. **City labels in the sponsor master:** added as cell notes on the city block header cells instead of shifting rows (spec section 7: "ask before shifting rows").
10. **Public partner page:** should it mention the $100 deposit and the "balance due 14 days before" rule? Not shown yet, because it's money wording.
11. **2027 performers, schedules and poster:** not announced yet; the site says "to be released in 2027". Add them in `src/data/festivals.js`. The partner lists on the city cards are still the 2026 lists.
15. **Sponsor logos:** confirm every logo in the banner is a current sponsor/partner who agreed to logo use, and whether the banner should link to their websites (add `url:` in `sponsors.js`).
14. **Photo permission:** the 2026 event photos (slideshow + gallery) show identifiable people. Confirm Last Door has photographer rights and that the events had photography notices.
12. **SharePoint sync:** not built. Exports are downloaded and saved to SharePoint by hand.
13. **Resend daily limit:** the free plan allows 100 emails a day. A city with more than about 90 volunteers should be published over 2 days, or upgrade for the season.

---

## 7. Manual steps still to do (Chad)

1. Create the GitHub repo and upload the project (README → "Run it on your computer").
2. `docs/SETUP-SUPABASE.md`, steps 1–11.
3. Send `docs/MAJOR-TOM.md` to Major Tom and agree the parameter names and webhook. Share `PAYMENT_WEBHOOK_SECRET` through a password manager.
4. Decide items 2–5 and 8–10 in section 6 and enter them in Settings.
5. Privacy officer review of `/privacy/`. Then remove the DRAFT notice.
6. Test the full flow with a test vendor account and a $1 payment (section 8).
7. Go-live: `docs/GO-LIVE.md`.

---

## 8. Testing done (Session 2)

- `npm test`: 11 node tests pass (prices, deposits, due dates, refunds, invoice-number reading, auto-scheduler, sponsor sheet columns, including the spec's worked example).
- `supabase/tests/run-local.sh`: all RLS/function security tests pass on PostgreSQL 18. They cover:
  - vendor isolation
  - staff MFA
  - no direct edits of payment amounts
  - the overpayment block
  - duplicate webhook ids
  - refund override notes
  - guardian consent for under-18 volunteers and the under-14 block
  - the volunteer token page
  - the audit log
- `deno check` passes for all 5 Edge Functions. The webhook signature check was tested with valid, tampered, expired and wrong-secret signatures.
- Demo build: all 25 pages and routes load with no JavaScript errors and **zero axe WCAG 2.1 AA violations** at desktop (1280 px) and mobile (390 px) widths.
- Click-through in the demo:
  - Invoices: edit a draft, recalculate, preview the PDF, Approve & Send, sheet columns, manual invoice.
  - Payments: simulated portal payment, assign unmatched, vendor report, record a payment, refund calculator, import preview.
  - Booths: place a pin, assign a vendor, Excel export.
  - Volunteers: auto-schedule, publish, check-in, exports.
  - Admin: sponsor master export, product and setting edits, audit log, announcements.
  - Public pages: volunteer sign-up (including the guardian section and error summary), shift confirm, vendor terms.
- The normal (non-demo) build compiles, and the secret scan passes.

**Still to test on the real system:**
- real emails (Resend)
- password reset and confirmation links
- TOTP enrolment with a phone
- uploads to Supabase Storage
- the Major Tom webhook
- the GitHub Actions running on schedule

---

## 9. Change log

| Date | Session | Summary |
|---|---|---|
| 2026-10-06 | 2e | Sponsor logo banner under the hero: 18 logos scroll left→right in a seamless loop, sized to equal visual area (solid-block logos ~15% smaller). Pauses on hover/focus and with a Pause button; static wrapped rows for reduce-motion users. Logos trimmed and saved as WebP in `public/images/sponsors/`; edit list, sizes and speed in `src/data/sponsors.js`. |
| 2026-10-03 | 2d | Palette changed to a 2027 trend palette: Luminous Blue, Maize, Midnight, Peaceful Lilac on cloud white (site, emails, favicon); home-page volunteer section is a Luminous Blue band. Fixed the vendor-portal invoice layout (prices now right-aligned, totals block). |
| 2026-10-02 | 2c | New palette (Hope Teal, Soft Pink, City Navy) on the site, emails and favicon. 2026 performers, schedules and posters removed: cards and schedules now say "Performers and full schedule to be released in 2027" (fill in `lineup` / `schedule` in `festivals.js` when announced). City cards use 2026 event photos. Gallery moved directly under the hero. Hero hashtags now #recoverydayalberta #recoveroutloud (`site.js` → `heroHashtags`). Partner lists labelled "Our 2026 community partners". |
| 2026-10-02 | 2b | Home page: full-width photo slideshow at the top (9 stage/musician/crowd photos, Pause button, no motion for reduce-motion users; 2026 poster moved to a "View the 2026 poster" button) and a "Recovery Day 2026 in pictures" gallery with Edmonton (5), Calgary (14) and Red Deer (7) photos. Photos re-saved as WebP (800 + 1600 px), camera/GPS data removed. Edit both in `src/data/gallery.js`. |
| 2026-10-02 | 2 | Phases 2–8 built: migrations + RLS + tests, Edge Functions (mailer, PDFs, payment webhook, inbound email, daily jobs), vendor portal, admin site, payments/refunds, booths/maps, volunteers + auto-scheduler, Excel exports in the 2026 layouts, privacy draft and vendor terms, keep-alive/daily/backup Actions, setup/admin/go-live/Major Tom docs, demo build. Dates and prices on the public pages now come from Supabase. |
| 2026-10-02 | 1c | Switched to a new repo built from scratch. |
| 2026-10-02 | 1b | Brand colours changed to Heritage Brick, Autumn Gold and Stage Black. |
| 2026-10-02 | 1 | Vite multi-page foundation, public pages, Supabase client, GitHub Pages deploy, CSP, README. |

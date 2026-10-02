# HANDOFF – Recovery Day Alberta 2027

Attach this file and `SPEC.md` to every new build session.

_Last updated: October 2, 2026 (end of Session 1, Phase 1)._

---

## 1. Status at a glance

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation and public site | **Built. Waiting on Chad's manual steps and tests.** |
| 2 | Database, RLS, accounts, keep-alive and backup Actions | Not started |
| 3 | Vendor application and portal | Not started |
| 4 | Admin applications, invoices, Sponsor Master Excel | Not started |
| 5 | Payments and receipts (Last Door pay portal) | Not started |
| 6 | Booths and site maps | Not started |
| 7 | Volunteers and auto-scheduler | Not started |
| 8 | Polish, privacy/terms content, go-live (domain switch) | Not started |

---

## 2. Decisions made in Session 1

| Topic | Decision |
|---|---|
| Repository | The 2027 site is a **brand-new public repository** created from scratch (suggested name `recoverydayalberta-2027`). All work goes on **`main`**. The old site's repo is left untouched. |
| Current live site | recoverydayalberta.com is served by **Netlify** today (DNS at Namecheap points to Netlify). The new build doesn't touch it until Phase 8. |
| Preview address | `https://<github-username>.github.io/<repo-name>/`, deployed by GitHub Actions on every push to `main`. |
| Base path | Comes from the `BASE_PATH` repository variable. If it's not set, the workflow uses `/<repo-name>/`. Set it to `/` at go-live. |
| CNAME / Namecheap DNS | **Deferred to Phase 8.** No `CNAME` file yet. |
| Removed links | The "Download sponsorship package" PDF link and the SurveyMonkey volunteer link are **not** on the new site. Vendors apply through the portal (`/login/?next=apply`), and volunteers will use the Phase 7 form at `/volunteer/`. |
| Poster downloads | Not carried over. Posters can still be viewed in a pop-up (2026 posters are placeholders). |
| Event dates | 2027 dates are unknown, so they're set to `null` in `src/data/festivals.js` and the site shows "Date to be announced". |
| Line-ups | 2026 line-ups are kept as placeholders, with a note on the page: "2027 line-ups will be announced soon. The line-ups shown are from last year." |
| Public prices | In Phase 1 they're display text only, in `src/data/partner.js`. They move to the `settings`/`products` tables in Phase 2. |
| Colours | 2027 palette: **Heritage Brick #9E3B2C**, **Autumn Gold #E3A93B**, **Stage Black #1E1F24** (set in `src/styles/tokens.css` as `--brick`, `--gold`, `--stage-black`). Paper background #F4F1E8 and white are kept. Gold is used on dark backgrounds and buttons, and brick for accent text on light backgrounds. Every combination passes WCAG AA. |
| Fonts | Inter is self-hosted (`@fontsource-variable/inter`) so the CSP doesn't need Google Fonts. |
| Search engines | Every page has `noindex` while on the github.io preview (base path ≠ `/`). Login, portal, admin and 404 always have `noindex`. |
| Supabase keys | Either the legacy **anon** key or the new **publishable** key (`sb_publishable_…`) can go in `VITE_SUPABASE_ANON_KEY`. Never the service_role / `sb_secret_…` key. |

---

## 3. Project structure

```
.github/workflows/deploy.yml   Build + secret scan + deploy to GitHub Pages
docs/HANDOFF.md                This file
public/                        Copied as-is into the site
  favicon.svg
  images/2026/                 Covers + posters (2026 placeholders)
scripts/check-secrets.mjs      Fails the deploy if a secret key is found
src/
  build/html-plugin.js         Vite plugin: fills page markers, adds CSP/robots
  build/render.js              HTML layouts for header, footer and sections
  data/festivals.js            ★ Schedules, venues, line-ups (edit this)
  data/partner.js              ★ Public partner prices (until Phase 2)
  data/site.js                 Contact info + menu
  lib/supabase.js              Supabase client (anon key only) + health check
  main.js                      Styles, mobile menu, poster dialog
  pages/login.js               Login placeholder (reads ?next=apply)
  pages/admin.js               Admin placeholder (Supabase "System check")
  styles/                      tokens, base, layout, components, sections
index.html                     Home
schedules/ partner/ volunteer/ privacy/ vendor-terms/ login/ portal/ admin/   (each has index.html)
404.html                       GitHub Pages "not found" page
vite.config.js                 Base path, page list, build settings
.env.example                   Template for .env.local (no real values)
```

**Page markers** (handled by `src/build/html-plugin.js`): `<!--@meta-->`,
`<!--@meta noindex-->`, `<!--@header current="partner"-->`, `<!--@footer-->`,
`<!--@hero-->`, `<!--@schedules-->` / `<!--@schedules page-->`,
`<!--@festivals-->`, `<!--@partner-->` / `<!--@partner page-->`,
`<!--@volunteer-->` / `<!--@volunteer page-->`, `<!--@about-->`, `{{BASE}}`, `{{YEAR}}`.

**Adding a page:** create `newpage/index.html` (copy `privacy/index.html`), then
add it to `pages` in `vite.config.js`.

---

## 4. Environment variables and secrets

| Name | Where | Used for |
|---|---|---|
| `VITE_SUPABASE_URL` | GitHub repo secret + `.env.local` | Supabase project URL (`https://<ref>.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | GitHub repo secret + `.env.local` | Public anon / publishable key |
| `BASE_PATH` (optional) | GitHub repo **variable** | Base path. Leave unset now. Set to `/` at go-live. |

To come in later phases (never in the repo): `SUPABASE_SERVICE_ROLE_KEY`
(Supabase Edge Function secrets only), `RESEND_API_KEY`, `PAYMENT_WEBHOOK_SECRET`,
and backup and keep-alive secrets for GitHub Actions (Phase 2).

---

## 5. Content Security Policy (built site)

```
default-src 'self'; script-src 'self'; style-src 'self';
img-src 'self' data: blob: <SUPABASE_URL>; font-src 'self';
connect-src 'self' <SUPABASE_URL> wss://<SUPABASE_HOST>;
frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self';
manifest-src 'self'; worker-src 'self'; upgrade-insecure-requests
```

- It's added only to the **built** site (`npm run build` / `preview` / GitHub Pages), not to `npm run dev`.
- Rules for later phases: no inline `<script>`, no `style="…"` attributes, and no third-party scripts. If a phase needs another origin (for example Cloudflare Turnstile), update `buildCsp()` in `src/build/html-plugin.js` and record it here.
- `frame-ancestors` and other HTTP headers can't be set through a meta tag on GitHub Pages. Revisit this in Phase 8.

---

## 6. Open items and questions for Chad

1. **2027 event dates** for Edmonton, Calgary and Red Deer. These are needed before Phase 4 (due dates depend on them).
2. **2027 line-ups and posters** whenever they're announced. Update `src/data/festivals.js` and `public/images/`.
3. From SPEC §11, still open: booth refunds at 14–29 days, Stage Sponsor cancellations, food-truck deposit, deposit timing, SharePoint sync, and Major Tom's pre-fill and webhook details.
4. **Public partner page:** should it mention the $100 deposit and the "balance due 14 days before" rule? Phase 1 doesn't, because it's money wording that needs Chad's OK.
5. **Privacy and vendor-terms pages** are placeholders. The real wording needs Chad's and Last Door's approval (privacy officer review) before Phase 8.

---

## 7. Next session: Phase 2 (Database and accounts)

Attach: `SPEC.md`, this `docs/HANDOFF.md`, `2026-Sponsors-2.xlsx`,
`Recovery-Day-Volunteers-2.xlsx`.

Scope (from SPEC §9):
- `supabase/migrations/NNN_*.sql`: all tables, RLS on every table, a `profiles` role (vendor/admin/finance/super_admin), and a `settings` table holding every year-specific value
- Seed the 2027 products, rentals, prices, payment and refund rules, and shift templates
- Vendor sign-up/login with email verification, using Resend as custom SMTP
- Invite-only admin/finance login with required two-factor
- Daily keep-alive and weekly backup GitHub Actions
- Move the public partner prices to read from Supabase settings
- Step-by-step instructions for inviting the admin accounts

---

## 8. Change log

| Date | Session | Summary |
|---|---|---|
| 2026-10-02 | 1c | Switched from a branch of the old repo to a new repo built from scratch. The deploy now runs on `main` only, and the setup steps are simpler. |
| 2026-10-02 | 1b | Brand colours changed to Heritage Brick, Autumn Gold and Stage Black (tokens.css, favicon, theme-color). |
| 2026-10-02 | 1 | Vite multi-page foundation, public pages rebuilt from the live site, Supabase client, GitHub Pages deploy with base path and secret scan, CSP, README. |

# Go-live: switching to recoverydayalberta.com (Phase 8)

Until go-live the site runs at `https://<your-github-user>.github.io/recoverydayalberta/`
and is hidden from Google. These steps move it to `https://recoverydayalberta.com/`.
Allow 1 hour plus up to 24 hours for DNS. Do it on a quiet weekday morning.

## Before you start (checklist)

- [ ] Privacy policy approved by the privacy officer; "DRAFT" notice removed from `privacy/index.html`.
- [ ] All "SPEC DEFAULT – CONFIRM" items in `docs/HANDOFF.md` decided and entered in **Settings**.
- [ ] 2027 dates, venues and load-in details entered (**Settings → Festival dates and places**).
- [ ] Major Tom webhook tested with a real $1 payment (then voided/refunded).
- [ ] Every staff member has logged in once and set up two-factor sign-in.
- [ ] The old site's content you want to keep has been copied.

## 1. Tell GitHub about the domain

1. Repo → **Settings** → **Pages** → **Custom domain** → type `recoverydayalberta.com` → **Save**.
   (GitHub creates the domain check; leave this page open.)
2. Repo → **Settings** → **Secrets and variables** → **Actions** → **Variables** tab →
   **New repository variable**: Name `BASE_PATH`, Value `/` → **Add variable**.

## 2. Point the domain at GitHub (Namecheap)

Namecheap → **Domain List** → **Manage** (recoverydayalberta.com) → **Advanced DNS**.

1. Delete the old **A**, **AAAA** and **CNAME** records for `@` and `www`
   (they point to the old website host). **Do not delete** the Resend email
   records (TXT/MX with `resend` or `_domainkey` in the host).
2. Add four **A Records**, Host `@`, TTL Automatic:
   `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
3. Add one **CNAME Record**: Host `www`, Value `<your-github-user>.github.io.` (with the dot).
4. Save all changes (green tick on each row).

## 3. Rebuild and switch on HTTPS

1. Repo → **Actions** → **Deploy site to GitHub Pages** → **Run workflow**.
   (Now that `BASE_PATH` is `/`, the site is built for the real domain and is
   no longer hidden from Google.)
2. Wait until **Settings → Pages** says "DNS check successful" (minutes to a few hours).
3. Tick **Enforce HTTPS** (it may take up to an hour to become clickable).

## 4. Update the addresses in Supabase

1. **Authentication → URL Configuration** → Site URL `https://recoverydayalberta.com/`. Keep both redirect URLs.
2. **Edge Functions → Secrets**: `SITE_URL` = `https://recoverydayalberta.com/`.
   `ALLOWED_ORIGINS` = `https://recoverydayalberta.com,https://www.recoverydayalberta.com`.
3. Admin site → **Settings → Rules and text → site** → `"url": "https://recoverydayalberta.com/"`.

## 5. Test (15 minutes)

- [ ] `https://recoverydayalberta.com` and `https://www.recoverydayalberta.com` both open with the padlock.
- [ ] Log in as a vendor test account; open an invoice PDF; press Pay now (don't pay).
- [ ] Log in as staff (with two-factor).
- [ ] Sign up a test volunteer, then delete it (Settings → Privacy tools).
- [ ] Password-reset email arrives from noreply@recoverydayalberta.com and the link works.

## If something goes wrong

Remove the custom domain in **Settings → Pages**, delete the `BASE_PATH`
variable, and re-run the deploy — the github.io preview comes back. Put the old
Namecheap records back if you noted them down.

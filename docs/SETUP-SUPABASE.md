# Setting up Supabase, Resend and GitHub (one time)

Plain-language, click-by-click. Allow about 2 hours. Do the steps in order.
You need: the Last Door Google/Microsoft account you want to own these services,
access to the GitHub repo, and access to Namecheap (for the email DNS records).

> Keep every key and password in Last Door's password manager. Never paste a key
> into a file in this repo, an email, Teams or a chat. The only key allowed in
> the website is the Supabase **anon / publishable** key.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com> → **Start your project** → sign in.
2. **New project**.
   - Organization: create one called *The Last Door Recovery Society*.
   - Name: `recoverydayalberta`
   - Database password: click **Generate a password**, then **Copy** and save it
     in the password manager as "Supabase database password".
   - Region: **Canada (Central)** — this keeps personal data in Canada.
   - Plan: **Free**.
3. Click **Create new project** and wait about 2 minutes.

## 2. Create the database tables (run the 5 migrations)

1. In the left menu click **SQL Editor** → **New query**.
2. On your computer open `supabase/migrations/001_schema.sql`, select all, copy.
3. Paste into the SQL editor and press **Run** (bottom right). You should see
   "Success. No rows returned".
4. Repeat for `002_security.sql`, `003_functions.sql`, `004_seed.sql`,
   `005_storage.sql` — **in that order, one at a time**.
5. Check: left menu **Table Editor** — you should see tables such as
   `organizations`, `invoices`, `volunteers`. Each one shows a green
   **RLS enabled** label.

## 3. Copy the two public values for the website

1. Left menu **Project Settings** (gear) → **API** (or **Data API**).
2. Copy **Project URL** (looks like `https://abcdefghijkl.supabase.co`).
3. Copy the **anon / publishable** key (the long one marked *public*).
   **Do not** copy the `service_role` / secret key anywhere.
4. In GitHub: repo → **Settings** → **Secrets and variables** → **Actions** →
   **New repository secret**:
   - `VITE_SUPABASE_URL` = the Project URL
   - `VITE_SUPABASE_ANON_KEY` = the anon key

## 4. Login settings (Authentication)

Left menu **Authentication**:

1. **Sign In / Providers** → **Email**: Enable. Turn **Confirm email** ON.
   Minimum password length: **12**. Password requirements: *letters and digits*.
   Save.
2. **Sign In / Providers**: make sure **Allow new users to sign up** is ON
   (vendors create their own accounts). All other providers stay OFF.
3. **URL Configuration**:
   - Site URL: your preview address for now, e.g.
     `https://<your-github-user>.github.io/recoverydayalberta/`
   - Redirect URLs → **Add URL**, add both:
     - `https://<your-github-user>.github.io/recoverydayalberta/**`
     - `https://recoverydayalberta.com/**`
   - Save.
4. **Multi-Factor** (or *Auth → MFA*): enable **TOTP (authenticator app)**.
   Staff are forced to use it by the website and the database.
5. **Rate limits**: leave the defaults.

## 5. Email with Resend

### 5a. Create the account and verify the domain
1. <https://resend.com> → sign up with the Last Door account.
2. **Domains** → **Add domain** → `recoverydayalberta.com` → Region **North
   America**.
3. Resend shows 3–4 DNS records (TXT for SPF/DKIM, MX for bounces).
4. In another tab: Namecheap → **Domain List** → **Manage** next to
   recoverydayalberta.com → **Advanced DNS** → **Add new record** for each
   record Resend shows. Copy *Host* and *Value* exactly. TTL: Automatic.
5. Back in Resend press **Verify DNS records**. It can take up to an hour.

### 5b. API key for the Edge Functions
1. Resend → **API Keys** → **Create API key** → name `supabase-functions`,
   permission **Sending access**, domain recoverydayalberta.com.
2. Copy it once (it is only shown once) into the password manager as
   "RESEND_API_KEY".

### 5c. Use Resend for Supabase login emails (password reset, confirm email)
1. Resend → **API Keys** → create a second key `supabase-auth-smtp` (Sending access).
2. Supabase → **Authentication** → **Emails** → **SMTP Settings** → enable
   **Custom SMTP**:
   - Sender email: `noreply@recoverydayalberta.com`
   - Sender name: `Recovery Day Alberta`
   - Host: `smtp.resend.com` · Port: `465`
   - Username: `resend` · Password: the `supabase-auth-smtp` key
   - Save.
3. Still in **Emails** → **Templates**, you can edit the wording of the
   confirm and reset emails. Keep the `{{ .ConfirmationURL }}` link.

## 6. Install the Supabase command-line tool (for the Edge Functions)

Windows (PowerShell), one time:

```powershell
winget install --id Supabase.CLI   # or: npm install -g supabase
supabase --version
supabase login                     # opens the browser, click Authorize
```

In the project folder:

```powershell
supabase link --project-ref abcdefghijkl   # the letters from your Project URL
```

## 7. Secrets for the Edge Functions

Make up three long random values (each at least 32 characters). An easy way in
PowerShell: `[guid]::NewGuid().ToString() + [guid]::NewGuid().ToString()`.
Save each in the password manager.

Supabase → **Edge Functions** → **Secrets** → **Add new secret** (or use the
command line `supabase secrets set NAME=value`):

| Name | Value |
|---|---|
| `RESEND_API_KEY` | the `supabase-functions` key from step 5b |
| `PAYMENT_WEBHOOK_SECRET` | random value #1 — also give it to Major Tom (see `docs/MAJOR-TOM.md`) |
| `INBOUND_EMAIL_SECRET` | random value #2 (only if you use the email fallback) |
| `CRON_SECRET` | random value #3 — also add it to GitHub as a secret named `CRON_SECRET` |
| `SITE_URL` | `https://<your-github-user>.github.io/recoverydayalberta/` (change at go-live) |
| `ALLOWED_ORIGINS` | `https://<your-github-user>.github.io,https://recoverydayalberta.com` |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided
automatically — do not add them.

## 8. Deploy the Edge Functions

From the project folder:

```powershell
supabase functions deploy mailer document-pdf
supabase functions deploy payment-notify inbound-payment-email daily-jobs --no-verify-jwt
```

The second line uses `--no-verify-jwt` because those three are called by
other systems (Major Tom, the email service, GitHub), not by a logged-in user.
They check their own secret instead.

Check: Supabase → **Edge Functions** shows 5 functions, all green.

## 9. Create the staff accounts

1. Supabase → **Authentication** → **Users** → **Add user** → **Send invitation**
   → enter the staff member's work email. Repeat for each person.
2. They click the link in the email, choose a password (12+ characters).
3. Give them a role. Supabase → **SQL Editor** → New query:

   ```sql
   update public.profiles set role = 'super_admin' where email = 'chad@lastdoor.org';
   update public.profiles set role = 'admin'       where email = 'someone@lastdoor.org';
   update public.profiles set role = 'finance'     where email = 'accounts@lastdoor.org';
   ```

   (Use the real emails. After the first Super Admin exists, roles can be
   changed in the admin site under **Settings & users**.)
4. The first time each staff member logs in, the site asks them to scan a QR
   code with an authenticator app (Microsoft Authenticator, Google
   Authenticator, 1Password…). They need the code every time they log in.

## 10. GitHub Actions secrets

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Name | What |
|---|---|
| `VITE_SUPABASE_URL` | (step 3) |
| `VITE_SUPABASE_ANON_KEY` | (step 3) |
| `CRON_SECRET` | same value as in step 7 |
| `SUPABASE_DB_URL` | Supabase → **Connect** (top bar) → **Session pooler** → copy the URI and replace `[YOUR-PASSWORD]` with the database password from step 1 |
| `BACKUP_PASSPHRASE` | another long random value; you need it to open a backup |

Then: repo → **Actions** → run **Keep Supabase awake**, **Daily jobs** and
**Weekly backup** once by hand (**Run workflow**) to check they are green.

## 11. Fill in the 2027 settings

Log in to `/admin/` as Super Admin → **Settings & users**:

1. **Festival dates and places**: enter each city's date, times, venue, load-in,
   entry street, parking and volunteer check-in spot.
2. **Rules and text**: open each item with a **Confirm** badge and change the
   value once the decision is made (see the open questions in `HANDOFF.md`).
3. **pay_link**: update the template when Major Tom confirms the parameter names.
4. The public pages pick up the dates the next night (the *Deploy site* Action
   runs every night). To update them straight away: repo → **Actions** →
   *Deploy site to GitHub Pages* → **Run workflow**.

---

## Restoring a backup

Only if something has gone badly wrong. Ask for help if unsure.

1. Repo → **Actions** → **Weekly backup** → pick a run → **Artifacts** →
   download `rda-backup` and unzip it.
2. Decrypt (needs GnuPG): `gpg -d rda-backup-YYYY-MM-DD.dump.gpg > db.dump`
   and enter the `BACKUP_PASSPHRASE`.
3. Restore into a **new** Supabase project first and check it:
   `pg_restore --no-owner --clean --if-exists -d "<SUPABASE_DB_URL of the new project>" db.dump`

Note: the backup contains the database only. Uploaded files (insurance, permits,
site maps) live in Supabase Storage; download any you must keep from
**Storage** before deleting a project.

## Free-tier limits to keep an eye on

- 500 MB database, 1 GB file storage, 50,000 monthly active users — far above
  what Recovery Day needs.
- Projects pause after 7 days without activity; the *Keep Supabase awake*
  Action prevents this.
- Resend free plan: 3,000 emails/month, 100/day. Publishing a volunteer schedule
  for a large city sends one email per volunteer — publish one city per day if
  you have more than ~90 volunteers in a city.

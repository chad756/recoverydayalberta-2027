# Recovery Day Alberta 2027

Website for **Recovery Day Alberta** (The Last Door Recovery Society): the public
festival site for Edmonton, Calgary and Red Deer. The vendor/sponsor portal,
event admin portal and volunteer scheduler will be added in later phases.

- **Frontend:** Vite + vanilla JavaScript (ES modules), HTML, CSS
- **Hosting:** GitHub Pages, deployed by GitHub Actions
- **Backend:** Supabase (free tier). Phase 1 only sets up the connection.

> **This repository is PUBLIC.** Never commit passwords, API keys, personal
> data, backups or exports. The Supabase **anon / publishable** key is the only
> key allowed in browser code. Every other key goes in Supabase secrets or
> GitHub Actions secrets.

---

## Run it on your computer

You need **Node.js 22 LTS** (or 20.19+) from <https://nodejs.org> and **Git**.

```bash
npm install        # first time only (and after package.json changes)
npm run dev        # starts the site at http://localhost:5173
```

Press `Ctrl + C` in the terminal to stop it.

### Your local keys (.env.local)

1. Copy `.env.example` and name the copy `.env.local`.
2. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Restart `npm run dev`.

`.env.local` is ignored by Git, so it never leaves your computer.

### Other commands

| Command | What it does |
|---|---|
| `npm run build` | Builds the finished site into `dist/` |
| `npm run preview` | Serves the built `dist/` folder so you can check it (this is the only way to test the Content-Security-Policy locally) |
| `npm run check:secrets` | Scans `dist/`, `src/`, `public/` and `.github/` for anything that looks like a secret key. Run it after `npm run build`. |

To test the github.io base path on your computer (Windows PowerShell):

```powershell
$env:BASE_PATH="/recoverydayalberta/"; npm run build; npm run preview
```

Then open <http://localhost:4173/recoverydayalberta/>.

---

## Editing content

| What | File |
|---|---|
| Festival dates, venues, line-ups, schedules, partners, posters | `src/data/festivals.js` |
| "Partner with us" prices and notes (public display only) | `src/data/partner.js` |
| Contact email, phone, Facebook, menu links | `src/data/site.js` |
| Images | `public/images/...` |
| Colours and fonts | `src/styles/tokens.css` |

Each file has instructions at the top. Save the file, and the dev site
refreshes on its own.

> From Phase 2 on, year-specific values (prices, products, dates, rules) move
> into the Supabase `settings` table so they can be edited in the admin portal.

---

## How the pages are built

- Each page is a folder with an `index.html` (e.g. `partner/index.html` → `/partner/`).
- Pages contain small markers like `<!--@header-->`, `<!--@schedules-->` and
  `{{BASE}}`. The plugin in `src/build/html-plugin.js` swaps them for real HTML
  built from the data files, using the layouts in `src/build/render.js`. The
  festival content ends up as plain HTML, so it shows up in search engines
  and works without JavaScript.
- `src/main.js` loads the styles and runs the mobile menu and poster pop-up.
- `src/lib/supabase.js` creates the Supabase client from the environment variables.

---

## How deploys work

1. Push to the **`main`** branch.
2. GitHub Actions runs `.github/workflows/deploy.yml`, which:
   - installs packages (`npm ci`)
   - builds the site with the repo secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   - sets the **base path** to `/<repo-name>/`, or to the repository variable `BASE_PATH` if you've created one
   - **scans the built files for secret keys and stops if it finds any**
   - publishes `dist/` to GitHub Pages
3. After about 1–3 minutes the site is live at
   `https://<your-github-username>.github.io/<repo-name>/`.

You can watch each run in the repo's **Actions** tab, and re-run it with **Run workflow**.

While we're on the github.io preview, every page has `noindex` so Google
doesn't list it next to the live site.

### Go-live (Phase 8, not now)

- Add the repository variable `BASE_PATH` = `/`
- Add `public/CNAME` containing `recoverydayalberta.com`
- Point Namecheap DNS at GitHub Pages (moving it away from Netlify)

---

## Security basics in place

- Content-Security-Policy on every built page. It only allows our own site and
  the Supabase project, with no inline or third-party scripts. Fonts are self-hosted.
- `rel="noopener noreferrer"` on every link that opens a new tab.
- `.env*` files are git-ignored (`.env.example` is the only exception and holds no real values).
- Automatic secret scan before every deploy.
- `src/lib/supabase.js` refuses to run if a service-role or secret key is used by mistake.

// =============================================================================
// Vite configuration
// =============================================================================
// BASE PATH: where the site lives on the web.
//   - github.io preview:  https://<user>.github.io/<repo>/  -> BASE_PATH=/<repo>/
//   - custom domain:      https://recoverydayalberta.com/    -> BASE_PATH=/
// The GitHub Action sets BASE_PATH automatically from the repo name, or from
// the repository variable BASE_PATH if you create one (Phase 8: set it to /).
// On your computer it defaults to / (http://localhost:5173/).
// =============================================================================

import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';
import rdaHtmlPlugin from './src/build/html-plugin.js';

function normalizeBase(value) {
  if (!value || value === '/') return '/';
  if (value === './') return './'; // relative paths, for preview copies
  return `/${value.replace(/^\/+|\/+$/g, '')}/`;
}

// Every page of the site. Add new pages here.
const pages = {
  main: 'index.html',
  schedules: 'schedules/index.html',
  partner: 'partner/index.html',
  volunteer: 'volunteer/index.html',
  volunteerShifts: 'volunteer/shifts/index.html',
  privacy: 'privacy/index.html',
  vendorTerms: 'vendor-terms/index.html',
  login: 'login/index.html',
  portal: 'portal/index.html',
  admin: 'admin/index.html',
  notFound: '404.html',
};

// ExcelJS includes a tiny helper (util-deprecate) that reads browser storage to
// decide whether to print deprecation warnings. We never store anything in the
// browser, so this removes that read (it then simply returns "false").
function noBrowserStorage() {
  const pattern = /try\{if\(!e\.localStorage\)return!1\}catch\(e\)\{return!1\}var r=e\.localStorage\[t\];return null!=r&&"true"===String\(r\)\.toLowerCase\(\)/;
  return {
    name: 'rda-no-browser-storage',
    transform(code, id) {
      if (!id.includes('exceljs') || !pattern.test(code)) return null;
      return { code: code.replace(pattern, 'return!1'), map: null };
    },
  };
}

export default defineConfig(({ command, mode }) => {
  // Reads .env.local etc. on your computer; in GitHub Actions the values come
  // from repository secrets passed in as environment variables.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const base = normalizeBase(env.BASE_PATH);
  const supabaseUrl = (env.VITE_SUPABASE_URL || '').trim();

  if (supabaseUrl && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(supabaseUrl)) {
    throw new Error(
      'VITE_SUPABASE_URL should look like https://abcdefghijkl.supabase.co (no path, no trailing text).',
    );
  }
  if (command === 'build' && (!supabaseUrl || !env.VITE_SUPABASE_ANON_KEY)) {
    console.warn('\n⚠  VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. The site will build, but cannot reach Supabase.\n');
  }

  return {
    base,
    appType: 'mpa',
    plugins: [
      noBrowserStorage(),
      rdaHtmlPlugin({
        base,
        supabaseUrl,
        anonKey: (env.VITE_SUPABASE_ANON_KEY || '').trim(),
        isBuild: command === 'build',
        // The github.io preview (base path is not "/") is hidden from Google.
        isPreviewSite: base !== '/',  // './' previews are also hidden
      }),
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // Never turn small files into inline data: URLs (keeps the CSP simple).
      assetsInlineLimit: 0,
      rollupOptions: {
        input: Object.fromEntries(
          Object.entries(pages).map(([name, file]) => [name, resolve(import.meta.dirname, file)]),
        ),
      },
    },
  };
});

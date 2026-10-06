// =============================================================================
// VITE PLUGIN: fills in the shared parts of every page at build time
// =============================================================================
// Each page's HTML file contains small markers. This plugin replaces them:
//
//   <!--@meta-->            security + SEO tags (Content-Security-Policy, robots)
//   <!--@meta noindex-->    same, but also tells search engines not to list it
//   <!--@header current="partner"-->   the top menu (highlights "Partner")
//   <!--@footer-->          the footer + poster pop-up
//   <!--@hero-->  <!--@schedules-->  <!--@schedules page-->
//   <!--@festivals-->  <!--@partner-->  <!--@partner page-->
//   <!--@volunteer-->  <!--@volunteer page-->  <!--@gallery-->  <!--@sponsors-->  <!--@about-->
//   {{BASE}}                the site's base path, e.g. /recoverydayalberta/
//   {{YEAR}}                the festival year from src/data/festivals.js
//
// Content comes from the data files in src/data/. The plugin re-reads them on
// every page load in `npm run dev`, so edits show up straight away.
// =============================================================================

import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import * as R from './render.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../data');

async function loadData(cacheBust) {
  const load = (name) =>
    import(pathToFileURL(path.join(dataDir, name)).href + (cacheBust ? `?t=${Date.now()}` : ''));
  const [festivalsMod, partner, siteMod, galleryMod, sponsorsMod] = await Promise.all([
    load('festivals.js'),
    load('partner.js'),
    load('site.js'),
    load('gallery.js'),
    load('sponsors.js'),
  ]);
  return { ...festivalsMod, partner, ...siteMod, ...galleryMod, ...sponsorsMod };
}

/**
 * Builds the Content-Security-Policy. Only our own site ('self') and the
 * Supabase project are allowed. No inline scripts, no third-party scripts.
 */
export function buildCsp(supabaseUrl) {
  let supa = '';
  let supaWs = '';
  if (supabaseUrl) {
    const u = new URL(supabaseUrl);
    supa = ` ${u.origin}`;
    supaWs = ` wss://${u.host}`;
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    `img-src 'self' data: blob:${supa}`,
    "font-src 'self'",
    `connect-src 'self'${supa}${supaWs}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/** Turns `current="partner" page` into { current: 'partner', page: true }. */
function parseArgs(str = '') {
  const args = {};
  const re = /(\w+)(?:="([^"]*)")?/g;
  let m;
  while ((m = re.exec(str))) args[m[1]] = m[2] ?? true;
  return args;
}

/**
 * Festival dates and prices live in Supabase (admin → Settings), so staff
 * change them in one place. At build time we read them (public data, anon key)
 * and use them instead of the dates in src/data/festivals.js. If Supabase can't
 * be reached, the dates in festivals.js are used and a warning is printed.
 */
let dbCache = null;
async function loadDatabaseDates(supabaseUrl, anonKey) {
  if (!supabaseUrl || !anonKey) return null;
  dbCache ??= (async () => {
    try {
      const get = async (q) => {
        const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/${q}`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      };
      const [cities, event, products] = await Promise.all([get('cities?select=id,event_date'), get('settings?key=eq.event&select=value'), get('products?select=name,kind,price_cents,active,sort&order=sort')]);
      return { dates: Object.fromEntries(cities.map((c) => [c.id, c.event_date])), year: event[0]?.value?.year ?? null, products };
    } catch (e) {
      console.warn(`\n⚠  Couldn't read festival dates from Supabase (${e.message}). Using src/data/festivals.js.\n`);
      return null;
    }
  })();
  return dbCache;
}

export default function rdaHtmlPlugin({ base, supabaseUrl, anonKey, isBuild, isPreviewSite }) {
  return {
    name: 'rda-html',
    // 'post' = run after Vite has processed the page, so Vite leaves our
    // generated links and image paths exactly as we wrote them.
    transformIndexHtml: {
      order: 'post',
      async handler(html, ctx) {
        const data = await loadData(!isBuild);
        const db = await loadDatabaseDates(supabaseUrl, anonKey);
        if (db) {
          data.festivals = data.festivals.map((f) => (db.dates[f.id] !== undefined ? { ...f, date: db.dates[f.id] } : f));
          if (db.year) data.festivalYear = db.year;
          // Public prices come from the products table (admin → Settings → Products).
          if (db.products?.length) {
            const list = (kind) => db.products.filter((p) => p.kind === kind && p.active !== false).map((p) => ({ name: p.name, price: p.price_cents / 100 }));
            const kinds = { sponsorships: 'sponsorship', booths: 'booth', rentals: 'rental' };
            data.partner = { ...data.partner };
            for (const [key, kind] of Object.entries(kinds)) { const l = list(kind); if (l.length) data.partner[key] = l; }
          }
        }
        const year = data.festivalYear;
        // base './' = relative links (used for offline / preview copies).
        const depth = ctx.path.split('/').filter(Boolean).length - 1;
        const pageBase = base === './' ? '../'.repeat(depth) || './' : base;
        const common = { base: pageBase, year, ...data };

        const blocks = {
          meta: (a) => {
            const tags = [
              '<meta name="referrer" content="strict-origin-when-cross-origin">',
              // Lets the page scripts build links that work under any base path.
              `<meta name="rda-base" content="${R.esc(pageBase)}">`,
            ];
            // CSP only in the built site. (The dev server needs inline scripts
            // for live reload, which a strict CSP would block.)
            if (isBuild) {
              tags.unshift(`<meta http-equiv="Content-Security-Policy" content="${R.esc(buildCsp(supabaseUrl))}">`);
            }
            // Keep the github.io preview (and private pages) out of Google.
            if (a.noindex || isPreviewSite) {
              tags.push('<meta name="robots" content="noindex, nofollow">');
            } else {
              const pagePath = ctx.path.replace(/index\.html$/, '').replace(/^\//, '');
              tags.push(`<link rel="canonical" href="${R.esc(data.site.productionUrl + pagePath)}">`);
            }
            return tags.join('\n    ');
          },
          header: (a) => R.renderHeader({ ...common, current: a.current }),
          footer: () => R.renderFooter(common),
          hero: () => R.renderHero(common),
          schedules: (a) => R.renderSchedules({ ...common, asPage: !!a.page }),
          festivals: () => R.renderFestivals(common),
          partner: (a) => R.renderPartner({ ...common, asPage: !!a.page }),
          volunteer: (a) => R.renderVolunteer({ ...common, asPage: !!a.page }),
          gallery: () => R.renderGallery(common),
          sponsors: () => R.renderSponsors(common),
          about: () => R.renderAbout(common),
        };

        let out = html.replace(/<!--@(\w+)([^>]*?)-->/g, (match, name, rest) => {
          const fn = blocks[name];
          if (!fn) throw new Error(`Unknown page marker <!--@${name}--> in ${ctx.path}`);
          return fn(parseArgs(rest.trim()));
        });
        out = out.replaceAll('{{BASE}}', pageBase).replaceAll('{{YEAR}}', String(year));
        // Relative previews: some static hosts don't open folder/index.html
        // on their own, so point folder links straight at index.html.
        if (base === './') {
          out = out.replace(/href="(\.{1,2}\/(?:[^"?#:]*\/)?)([?#][^"]*)?"/g, (m, dir, rest = '') => `href="${dir}index.html${rest}"`);
        }
        return out;
      },
    },
    configureServer(server) {
      // When a data file changes in dev, reload the browser.
      server.watcher.add(dataDir);
      server.watcher.on('change', (file) => {
        if (file.startsWith(dataDir)) server.ws.send({ type: 'full-reload' });
      });
    },
  };
}

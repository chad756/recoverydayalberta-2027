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
//   <!--@volunteer-->  <!--@volunteer page-->  <!--@about-->
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
  const [festivalsMod, partner, siteMod] = await Promise.all([
    load('festivals.js'),
    load('partner.js'),
    load('site.js'),
  ]);
  return { ...festivalsMod, partner, ...siteMod };
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

export default function rdaHtmlPlugin({ base, supabaseUrl, isBuild, isPreviewSite }) {
  return {
    name: 'rda-html',
    // 'post' = run after Vite has processed the page, so Vite leaves our
    // generated links and image paths exactly as we wrote them.
    transformIndexHtml: {
      order: 'post',
      async handler(html, ctx) {
        const data = await loadData(!isBuild);
        const year = data.festivalYear;
        const common = { base, year, ...data };

        const blocks = {
          meta: (a) => {
            const tags = ['<meta name="referrer" content="strict-origin-when-cross-origin">'];
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
          about: () => R.renderAbout(common),
        };

        let out = html.replace(/<!--@(\w+)([^>]*?)-->/g, (match, name, rest) => {
          const fn = blocks[name];
          if (!fn) throw new Error(`Unknown page marker <!--@${name}--> in ${ctx.path}`);
          return fn(parseArgs(rest.trim()));
        });
        out = out.replaceAll('{{BASE}}', base).replaceAll('{{YEAR}}', String(year));
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

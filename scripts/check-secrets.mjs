// =============================================================================
// Secret scanner: fails the build if anything that looks like a secret key is
// found in the built site (dist/) or in the source code.
// Run it yourself with:  npm run check:secrets   (after npm run build)
// GitHub Actions runs it on every deploy, BEFORE anything is published.
// =============================================================================

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const SCAN_DIRS = ['dist', 'src', 'public', '.github'];
const TEXT_EXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.txt', '.svg', '.map', '.yml', '.yaml', '.md', '.xml']);
const SKIP = new Set(['node_modules', '.git']);

const patterns = [
  { name: 'Supabase secret key (sb_secret_...)', re: /sb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: 'Resend API key (re_...)', re: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}/ },
  { name: 'Private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'Postgres connection string with password', re: /postgres(?:ql)?:\/\/[^:\s'"]+:[^@\s'"]+@/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'Stripe secret key', re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/ },
];
const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (TEXT_EXT.has(extname(name).toLowerCase())) yield full;
  }
}

function jwtRole(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8')).role;
  } catch {
    return undefined;
  }
}

const problems = [];
let filesScanned = 0;

for (const dir of SCAN_DIRS) {
  if (!existsSync(dir)) continue;
  for (const file of walk(dir)) {
    filesScanned++;
    const text = readFileSync(file, 'utf8');
    for (const { name, re } of patterns) {
      if (re.test(text)) problems.push(`${file}: ${name}`);
    }
    for (const token of text.match(JWT_RE) ?? []) {
      const role = jwtRole(token);
      if (role === 'service_role') problems.push(`${file}: Supabase SERVICE ROLE key`);
      // Keys of any kind should never be typed into the source; they come
      // from environment variables at build time.
      if (!file.startsWith('dist') && role) problems.push(`${file}: a Supabase key is hard-coded in source (role: ${role})`);
    }
  }
}

if (!existsSync('dist')) {
  console.warn('⚠  dist/ not found. Run "npm run build" first to scan the built site.');
}

if (problems.length) {
  console.error('\n✖ Possible secrets found. Nothing has been published.\n');
  for (const p of problems) console.error('  - ' + p);
  console.error('\nRemove the secret, rotate it in the service it came from, and try again.\n');
  process.exit(1);
}

console.log(`✔ Secret scan passed (${filesScanned} files checked). Only the public anon key may appear in dist/.`);

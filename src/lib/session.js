// =============================================================================
// Who is logged in, and page guards.
// =============================================================================
import { api, isDemo, isConfigured } from './api.js';
import { html, link, setHTML } from './ui.js';

export const STAFF_ROLES = ['admin', 'finance', 'super_admin'];
export const ROLE_LABELS = { vendor: 'Vendor / Sponsor', admin: 'Admin', finance: 'Finance', super_admin: 'Super Admin' };

/** { user, profile } or null when nobody is logged in. */
export async function loadMe() {
  const session = await api.auth.session();
  if (!session) return null;
  const user = await api.auth.user();
  if (!user) return null;
  const profile = await api.get('profiles', user.id);
  return { user, profile };
}

/**
 * Use at the top of a private page. Sends visitors to the login page if
 * they're not logged in (or staff without two-factor). Returns { user, profile }.
 */
export async function requireLogin({ staff = false, next } = {}) {
  if (!isConfigured) throw new Error('The site is not connected to Supabase yet.');
  const me = await loadMe();
  const back = next ? `?next=${next}` : '';
  if (!me) { location.replace(link('login/', back)); return new Promise(() => {}); }
  if (me.profile?.disabled) { await api.auth.signOut(); location.replace(link('login/', '?disabled=1')); return new Promise(() => {}); }
  if (staff) {
    if (!STAFF_ROLES.includes(me.profile?.role)) { location.replace(link('portal/')); return new Promise(() => {}); }
    const aal = await api.auth.aal();
    if (aal.currentLevel !== 'aal2') { location.replace(link('login/', '?mfa=1&next=admin')); return new Promise(() => {}); }
  }
  return me;
}

/** Yellow banner on demo builds so nobody mistakes sample data for real data. */
export function demoBanner(text) {
  if (!isDemo) return;
  const b = document.createElement('div');
  b.className = 'demo-banner';
  b.setAttribute('role', 'note');
  setHTML(b, html`<strong>Preview with sample data.</strong> ${text || 'Nothing you do here is saved and no emails are sent. All names are fictional and the 2027 dates are placeholders.'}`);
  document.querySelector('main')?.prepend(b);
}

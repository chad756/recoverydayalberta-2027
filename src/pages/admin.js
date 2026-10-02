// Admin page (placeholder until Phase 2/4).
// Shows a "System check" so you can confirm the site can reach Supabase.

import '../main.js';
import { checkSupabaseConnection } from '../lib/supabase.js';

const status = document.getElementById('supabase-status');

if (status) {
  checkSupabaseConnection().then(({ ok, message }) => {
    status.textContent = message;
    status.classList.add(ok ? 'notice--ok' : 'notice--error');
  });
}

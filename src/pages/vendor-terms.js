// Vendor terms: shows the current Cancellation & Refund Policy from Settings,
// so the website, invoices and portal always use the same confirmed wording.
import '../main.js';
import { api } from '../lib/api.js';
import { $, html, setHTML } from '../lib/ui.js';

(async () => {
  try {
    const [row] = await api.list('settings', { eq: { key: 'policy_text' } });
    const p = row?.value;
    if (!p) throw new Error('missing');
    setHTML($('#policy'), html`<h2>${p.title}</h2><ul>${p.lines.map((l) => html`<li>${l}</li>`)}</ul>`);
  } catch {
    setHTML($('#policy'), html`<p class="notice">The policy couldn’t be loaded right now. Please email <a href="mailto:community@lastdoor.org">community@lastdoor.org</a> for a copy.</p>`);
  }
})();
